'use strict';
/** KYVEN Guardian: all-bot anti-raid, audit attribution, snapshot freeze and recovery. */
const { AuditLogEvent, PermissionFlagsBits } = require('discord.js');
const IDS = /^\d{15,22}$/;
const parseIds = value => new Set(String(value || '').split(/[\s,;]+/).filter(id => IDS.test(id)));
const bool = (v, fallback = false) => v === undefined ? fallback : String(v).toLowerCase() === 'true';
const int = (v, fallback, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(v)) ? Number(v) : fallback));
const msg = err => String(err?.message || err);

// Severe structural actions have confirmed executors from Discord's audit log.
const CRITICAL = new Set([
    AuditLogEvent.GuildUpdate, AuditLogEvent.ChannelDelete, AuditLogEvent.ChannelUpdate,
    AuditLogEvent.ChannelOverwriteCreate, AuditLogEvent.ChannelOverwriteUpdate,
    AuditLogEvent.ChannelOverwriteDelete, AuditLogEvent.ChannelPositionUpdate,
    AuditLogEvent.RoleDelete, AuditLogEvent.RoleUpdate, AuditLogEvent.RolePositionUpdate,
    AuditLogEvent.MemberKick, AuditLogEvent.MemberPrune, AuditLogEvent.MemberBanAdd,
    AuditLogEvent.MemberRoleUpdate, AuditLogEvent.WebhookCreate,
    AuditLogEvent.IntegrationCreate, AuditLogEvent.IntegrationUpdate, AuditLogEvent.IntegrationDelete,
    AuditLogEvent.AutoModerationRuleDelete, AuditLogEvent.AutoModerationRuleUpdate,
    AuditLogEvent.ApplicationCommandPermissionUpdate
]);
const SUSPICIOUS = new Set([
    AuditLogEvent.ChannelCreate, AuditLogEvent.RoleCreate, AuditLogEvent.WebhookUpdate,
    AuditLogEvent.WebhookDelete, AuditLogEvent.InviteCreate, AuditLogEvent.InviteUpdate,
    AuditLogEvent.InviteDelete, AuditLogEvent.MessageDelete, AuditLogEvent.MessageBulkDelete,
    AuditLogEvent.MemberBanRemove, AuditLogEvent.AutoModerationRuleCreate
]);
const LABELS = Object.fromEntries(Object.entries(AuditLogEvent)
    .filter(([name,id]) => typeof id === 'number').map(([name,id])=>[id,name]));

function installAntiRaid({client, backups, registrarActividadSistema, OWNER_ID, env = process.env, logger = console}) {
    const active = bool(env.ANTI_RAID_ENABLED,true);
    const trusted = parseIds(env.ANTI_RAID_TRUSTED_BOT_IDS);
    const guildFilter = parseIds(env.ANTI_RAID_GUILD_IDS);
    const channelId = String(env.ANTI_RAID_LOG_CHANNEL_ID || '1547736261521842186').trim();
    const action = String(env.ANTI_RAID_RESPONSE || 'alert').toLowerCase();
    const rejectAdmin = bool(env.ANTI_RAID_REJECT_ADMIN_BOTS,true);
    const rejectPrivileged = bool(env.ANTI_RAID_REJECT_PRIVILEGED_BOTS,true);
    const autoRestore = bool(env.ANTI_RAID_AUTO_RESTORE,false);
    const notifyOwner = bool(env.ANTI_RAID_NOTIFY_OWNER,false);
    const strict = bool(env.ANTI_RAID_STRICT,true);
    const strikeCount = int(env.ANTI_RAID_SUSPICIOUS_LIMIT,3,2,12);
    const strikeWindow = int(env.ANTI_RAID_SUSPICIOUS_WINDOW_MS,20000,5000,120000);
    const msgLimit = int(env.ANTI_RAID_SPAM_MESSAGE_LIMIT,8,3,50);
    const msgWindow = int(env.ANTI_RAID_SPAM_WINDOW_MS,10000,3000,120000);
    const seen = new Map();
    const counters = new Map();
    const handling = new Set();
    const pendingRestore = new Map();
    const kicked = new Map();
    let eventsHandled = 0;
    const dangerousPermissions = [PermissionFlagsBits.Administrator,PermissionFlagsBits.ManageGuild,
        PermissionFlagsBits.ManageChannels,PermissionFlagsBits.ManageRoles,
        PermissionFlagsBits.KickMembers,PermissionFlagsBits.BanMembers,PermissionFlagsBits.ManageWebhooks];
    const anyDangerous = member => dangerousPermissions.some(permission=>member.permissions?.has?.(permission));
    if (!['alert','kick'].includes(action)) throw new Error('ANTI_RAID_RESPONSE debe ser alert o kick');

    const acceptsGuild = guild => Boolean(guild?.id) && (guildFilter.size===0 || guildFilter.has(guild.id));
    const isTrusted = id => !id || id === client.user?.id || trusted.has(id);
    function dedup(key) {
        if (seen.has(key)) return false;
        seen.set(key,Date.now());
        if (seen.size > 3000) for (const [k,v] of seen) if (Date.now()-v>120000) seen.delete(k);
        return true;
    }
    function count(key, windowMs) {
        const now = Date.now();
        const values = (counters.get(key)||[]).filter(t=>now-t < windowMs);
        values.push(now);
        counters.set(key,values);
        if (counters.size>1200) for (const [k,v] of counters) if (now-(v.at(-1)||0)>120000) counters.delete(k);
        return values.length;
    }
    async function identifyBot(guild,id,executor) {
        if (isTrusted(id)) return false;
        if (executor?.bot === true || guild.members.cache.get(id)?.user?.bot === true || client.users.cache.get(id)?.bot === true) return true;
        // Never kick humans if actor can't be reliably identified.
        try { return (await client.users.fetch(id)).bot === true; }
        catch (_) { return false; }
    }
    async function notify(guild,actorId,detail,decision,severity='warning') {
        const text = `🚨 **KYVEN GUARDIAN**\nServidor: **${guild.name}** (\`${guild.id}\`)\nActor: <@${actorId}> (\`${actorId}\`)\nIncidente: **${String(detail).slice(0,450)}**\nRespuesta: **${decision}**\nBackups: **congelados hasta revisión**`;
        logger.warn?.(`[KYVEN Anti-Raid] ${guild.name} | ${actorId} | ${detail} | ${decision}`);
        await registrarActividadSistema?.('antiraid',severity,String(detail).slice(0,200),
            `guild=${guild.id}; actor=${actorId}; action=${decision}`).catch(()=>{});
        if (IDS.test(channelId)) {
            try {
                const ch = await client.channels.fetch(channelId);
                if (ch?.guildId === guild.id && typeof ch.send === 'function') {
                    await ch.send({content:text,allowedMentions:{parse:[]}});
                } else logger.warn?.('[KYVEN Anti-Raid] El canal de notificaciones no pertenece a este servidor');
            } catch (err) { logger.warn?.('[KYVEN Anti-Raid] Canal de alertas inaccesible:',msg(err)); }
        }
        if (notifyOwner && OWNER_ID) {
            try { await (await client.users.fetch(OWNER_ID)).send({content:text,allowedMentions:{parse:[]}}); }
            catch (err) { logger.warn?.('[KYVEN Anti-Raid] DM no disponible:',msg(err)); }
        }
    }
    async function expel(guild,actorId) {
        if (action !== 'kick') return 'solo alerta';
        try {
            const member = await guild.members.fetch(actorId);
            if (!member.user?.bot) return 'no se expulsó: actor no es un bot';
            if (!member.kickable) return 'no expulsable: permisos o jerarquía insuficientes';
            await member.kick('KYVEN GUARDIAN: acción estructural sospechosa registrada en auditoría');
            kicked.set(`${guild.id}:${actorId}`,Date.now());
            return 'bot expulsado';
        } catch (err) { return `expulsión fallida: ${msg(err)}`; }
    }
    function scheduleRecovery(guild,actorId) {
        if (!autoRestore || !backups?.enabled || action !== 'kick') return;
        if (pendingRestore.has(guild.id)) return;
        // Allow cache to settle; never restore unless the attacker has been expelled.
        const timer = setTimeout(async () => {
            pendingRestore.delete(guild.id);
            if (!kicked.has(`${guild.id}:${actorId}`)) {
                logger.warn?.('[KYVEN Anti-Raid] Sin expulsión confirmada, no se inicia auto-recuperación');
                return;
            }
            try {
                const result = await backups.restore(guild,{mode:'missing',automatic:true});
                await notify(guild,actorId,
                    `Auto-recuperación: ${result.rolesCreated} roles, ${result.channelsCreated} canales, ${result.membersRestored} asignaciones, ${result.failures} fallos`,
                    'recuperación estructural finalizada',result.failures?'error':'success');
            } catch (err) { await notify(guild,actorId,`Auto-recuperación fallida: ${msg(err)}`,'revisar manualmente','error'); }
        }, 8000);
        timer.unref?.();
        pendingRestore.set(guild.id,timer);
    }
    async function incident(guild,actorId,detail,{structural=false}={}) {
        if (!active || !acceptsGuild(guild) || isTrusted(actorId)) return;
        const key = `${guild.id}:${actorId}`;
        if (handling.has(key)) return;
        handling.add(key);
        try {
            eventsHandled++;
            await backups?.freeze(guild.id,detail);
            const decision = await expel(guild,actorId);
            await notify(guild,actorId,detail,decision,decision.includes('fallida')?'error':'warning');
            if (structural && decision==='bot expulsado') scheduleRecovery(guild,actorId);
        } catch (err) { logger.error?.('[KYVEN Anti-Raid] Error en incidente:',err); }
        finally { handling.delete(key); }
    }
    if (!active) return {enabled:false,stats:()=>({enabled:false})};
    client.on('guildAuditLogEntryCreate',(entry,guild)=>{
        (async()=>{
            if (!acceptsGuild(guild) || !entry?.id) return;
            const id = String(entry.executorId || entry.executor?.id || '');
            if (!IDS.test(id) || isTrusted(id) || !dedup(`${guild.id}:audit:${entry.id}`)) return;
            if (!CRITICAL.has(entry.action) && !SUSPICIOUS.has(entry.action)) return;
            if (!(await identifyBot(guild,id,entry.executor))) return;
            const label = LABELS[entry.action] || String(entry.action);
            const target = entry.targetId ? `, objeto ${entry.targetId}` : '';
            const details = `${label}${target} [auditoría ${entry.id}]`;
            if (CRITICAL.has(entry.action) && strict) await incident(guild,id,details,{structural:true});
            else {
                const n = count(`${guild.id}:${id}:audit`,strikeWindow);
                if (n>=strikeCount) await incident(guild,id,`${n} acciones administrativas en ${strikeWindow/1000}s: ${details}`,{structural:true});
            }
        })().catch(err=>logger.error?.('[KYVEN Anti-Raid] Fallo leyendo auditoría:',msg(err)));
    });
    client.on('guildMemberAdd',member=>{
        if (!member?.user?.bot || !acceptsGuild(member.guild) || isTrusted(member.id)) return;
        (async()=>{
            const hasAdmin = member.permissions?.has?.(PermissionFlagsBits.Administrator);
            if ((rejectAdmin && hasAdmin) || (rejectPrivileged && anyDangerous(member))) {
                await incident(member.guild,member.id,
                    hasAdmin ? 'Nuevo bot ingresó con ADMINISTRADOR' : 'Nuevo bot ingresó con permisos administrativos peligrosos',
                    {structural:false});
            }
        })().catch(err=>logger.warn?.('[KYVEN Anti-Raid] guildMemberAdd:',msg(err)));
    });
    client.on('guildMemberUpdate',(_before,member)=>{
        if (!member?.user?.bot || !acceptsGuild(member.guild) || isTrusted(member.id)) return;
        const oldAdmin = _before?.permissions?.has?.(PermissionFlagsBits.Administrator);
        const newAdmin = member.permissions?.has?.(PermissionFlagsBits.Administrator);
        const gainedDangerous = dangerousPermissions.some(permission =>
            member.permissions?.has?.(permission) && !_before?.permissions?.has?.(permission));
        if ((rejectAdmin && newAdmin && !oldAdmin) || (rejectPrivileged && gainedDangerous)) {
            incident(member.guild,member.id,
                newAdmin ? 'Bot recibió permiso ADMINISTRADOR' : 'Bot recibió permisos administrativos peligrosos',
                {structural:false})
                .catch(err=>logger.error?.('[KYVEN Anti-Raid] memberUpdate:',msg(err)));
        }
    });
    client.on('messageCreate', message=>{
        if (!message?.guild || !message.author?.bot || isTrusted(message.author.id) || !acceptsGuild(message.guild)) return;
        if (!dedup(`${message.guild.id}:message:${message.id}`)) return;
        const countRecent = count(`${message.guild.id}:${message.author.id}:messages`,msgWindow);
        const massMention = Boolean(message.mentions?.everyone) || (message.mentions?.users?.size || 0)>=8;
        if (countRecent < msgLimit && !massMention) return;
        (async()=>{
            if (message.deletable) await message.delete().catch(()=>{});
            await incident(message.guild,message.author.id,
                `Posible spam: ${countRecent} mensajes/${msgWindow/1000}s${massMention?'; menciones masivas':''}`);
        })().catch(err=>logger.error?.('[KYVEN Anti-Raid] spam:',msg(err)));
    });
    logger.info?.(`[KYVEN Anti-Raid] Protección universal activa. Respuesta=${action}; restauración automática=${autoRestore}; bots de confianza=${trusted.size}.`);
    return {enabled:true, stats:()=>({enabled:true,eventsHandled, trustedBots:[...trusted],action,autoRestore})};
}
module.exports = {installAntiRaid,parseIds,CRITICAL,SUSPICIOUS};
