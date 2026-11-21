'use strict';

/** KYVEN Guardian v4 - one-file trusted-actor backups and threshold anti-raid.
 *  10-minute snapshots; audit-verified owner changes only; 1 compressed copy per guild.
 *  MongoDB Atlas durable + optional best-effort local mirror. No messages or secrets.
 *  Automatic restoration only on mass ROLE deletion, with human/bot audit attribution.
 */
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { ChannelType, PermissionsBitField, AuditLogEvent } = require('discord.js');

const SNOWFLAKE = /^\d{15,22}$/;
const SCHEMA = 3; // Backward-compatible with Guardian v3 snapshots
const number = (v, fallback, min, max) => Math.min(max, Math.max(min, Number.isFinite(Number(v)) ? Number(v) : fallback));
const flag = (v, def = false) => v === undefined ? def : String(v).toLowerCase() === 'true';
const errorString = err => String(err?.message || err);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const isSafeId = value => SNOWFLAKE.test(String(value || ''));
const stable = (a, b) => String(a.id).localeCompare(String(b.id));
const bitfield = perms => String(perms?.bitfield ?? perms ?? '0');
const parseIds = v => new Set(String(v || '').split(/[\s,;]+/).filter(isSafeId));
const CHANNEL_TYPES = new Set([ChannelType.GuildText,ChannelType.GuildVoice,ChannelType.GuildCategory,
    ChannelType.GuildAnnouncement,ChannelType.GuildStageVoice,ChannelType.GuildForum,ChannelType.GuildMedia].filter(Number.isInteger));
const ROLE_EVENTS = new Set([AuditLogEvent.RoleCreate,AuditLogEvent.RoleUpdate,AuditLogEvent.RoleDelete,AuditLogEvent.RolePositionUpdate]);
const CHANNEL_EVENTS = new Set([AuditLogEvent.ChannelCreate,AuditLogEvent.ChannelUpdate,AuditLogEvent.ChannelDelete,
    AuditLogEvent.ChannelOverwriteCreate,AuditLogEvent.ChannelOverwriteUpdate,AuditLogEvent.ChannelOverwriteDelete,
    AuditLogEvent.ChannelPositionUpdate]);
const STRUCTURE_EVENTS = new Set([...ROLE_EVENTS,...CHANNEL_EVENTS]);
const ROLENAME = new Map([[AuditLogEvent.RoleCreate,'creó rol'],[AuditLogEvent.RoleUpdate,'modificó rol'],
    [AuditLogEvent.RoleDelete,'eliminó rol'],[AuditLogEvent.ChannelCreate,'creó canal'],
    [AuditLogEvent.ChannelUpdate,'modificó canal'],[AuditLogEvent.ChannelDelete,'eliminó canal']]);
const auditTime = e => Number(e?.createdTimestamp || (isSafeId(e?.id) ? Number(BigInt(e.id) >> 22n) + 1420070400000 : 0));
const auditActor = e => String(e?.executorId || e?.executor?.id || 'no identificado');
function same(a,b) { return JSON.stringify(a) === JSON.stringify(b); }


function newBackupGuardian({ client, mongoose, logger = console, env = process.env, registrarActividadSistema }) {
    const enabled = flag(env.BACKUP_ENABLED, true);
    const directory = path.resolve(env.BACKUP_DIR || './data/kyven-snapshots');
    const intervalMin = number(env.BACKUP_INTERVAL_MINUTES, 10, 1, 1440);
    const keep = number(env.BACKUP_KEEP, 1, 1, 2);
    const maxBytes = number(env.BACKUP_MAX_BYTES, 256 * 1024, 16 * 1024, 2 * 1024 * 1024);
    // Member->role assignment lists may be large and require privileged intents.
    const trackMembers = flag(env.BACKUP_ROLE_ASSIGNMENTS, false);
    const maxMembers = number(env.BACKUP_MEMBER_LIMIT, 2000, 10, 10000);
    const maxRestores = number(env.BACKUP_MAX_REASSIGNMENTS, 800, 0, 4000);
    const requireMongo = flag(env.BACKUP_REQUIRE_MONGO, Boolean(env.MONGO_URI));
    const localMirror = flag(env.BACKUP_LOCAL_MIRROR, true);
    const raidThreshold = number(env.BACKUP_RAID_ROLE_DELETE_THRESHOLD, 2, 2, 8);
    const raidWindowMs = number(env.BACKUP_RAID_WINDOW_MS, 30000, 5000, 120000);
    const raidDelayMs = number(env.BACKUP_RAID_RESTORE_DELAY_MS, 5000, 2000, 30000);
    const auditPages = number(env.BACKUP_MAX_AUDIT_PAGES, 5, 1, 10);
    const notifyChannelId = String(env.BACKUP_LOG_CHANNEL_ID || env.ANTI_RAID_LOG_CHANNEL_ID || '1547736261521842186').trim();
    const primaryOwner = '1190879141772406804';
    const trustedUsers = new Set([primaryOwner, '893345026376085544', ...parseIds(env.BACKUP_EXTRA_TRUSTED_IDS)]);
    // Only these two users + explicitly configured extra IDs may alter the protected structure.
    // KYVEN's own RESTORE operations are automatically trusted by executor ID.
    const includeTrustedInRaid = flag(env.BACKUP_RAID_INCLUDE_TRUSTED, false);
    const auditSeen = new Map(), deletionHistory = new Map(), deletedObjects = new Map();
    const guildTrusted = new Map(); // Owner-managed IDs, persisted per guild in Atlas
    const notified = new Map(), pendingRestore = new Map(), lastRestore = new Map(), approvals = new Map();
    const epochs = new Map();
    const AUTO_RESTORE_TOKEN = Symbol('KYVEN threshold-only restore');
    let auditListener = null, adminListener = null;
    const guildFilter = new Set(String(env.ANTI_RAID_GUILD_IDS || '').split(/[\s,;]+/).filter(isSafeId));
    const processes = new Set();
    const frozen = new Map();
    let timer = null;

    const snapshotSchema = new mongoose.Schema({
        guildId: { type: String, required: true },
        createdAt: { type: Date, required: true },
        hash: { type: String, required: true },
        bytes: { type: Number, required: true },
        payload: { type: Buffer, required: true }
    }, { versionKey: false, collection: 'kyven_structure_snapshots' });
    snapshotSchema.index({ guildId: 1, createdAt: -1 });
    const lockSchema = new mongoose.Schema({
        guildId: { type: String, required: true, unique: true },
        locked: { type: Boolean, default: true },
        reason: String,
        since: Date,
        approvedThrough: Date,
        authorizedIds: {type:[String],default:[]}
    }, { versionKey: false, collection: 'kyven_backup_locks' });
    const Snapshot = mongoose.models.KyvenSnapshot || mongoose.model('KyvenSnapshot', snapshotSchema);
    const Lock = mongoose.models.KyvenBackupLock || mongoose.model('KyvenBackupLock', lockSchema);
    const mongodbOnline = () => mongoose.connection.readyState === 1;
    const acceptsGuild = guild => Boolean(guild?.id) && (guildFilter.size === 0 || guildFilter.has(guild.id));
    const lockfile = guildId => path.join(directory, `${guildId}.locked.json`);
    const approvalfile = guildId => path.join(directory, `${guildId}.approved.json`);
    const authorizedfile = guildId => path.join(directory, `${guildId}.authorized.json`);
    const accepted = (actorId,guildId) => actorId === client.user?.id || trustedUsers.has(actorId) ||
        Boolean(guildTrusted.get(guildId)?.has(actorId));
    const epoch = guildId => epochs.get(guildId) || 0;
    const bump = guildId => epochs.set(guildId, epoch(guildId) + 1);

    async function activity(type, severity, description, meta = '') {
        logger[severity === 'error' ? 'error' : 'info']?.(`[KYVEN Backup] ${description}${meta ? ' | ' + meta : ''}`);
        try { await registrarActividadSistema?.(type, severity, description, meta); } catch (_) {}
    }
    async function alert(guild, actor, title, details, { urgent = false } = {}) {
        const key = `${guild.id}:${title}:${actor}`;
        if (!urgent && Date.now() - (notified.get(key) || 0) < 60000) return;
        notified.set(key, Date.now());
        if (notified.size > 300) for (const [k,v] of notified) if (Date.now()-v > 3600000) notified.delete(k);
        const content = `🚨 **KYVEN BACKUP · ${title}**\nServidor: **${guild.name}** (\`${guild.id}\`)\n`+
            `Responsable: ${isSafeId(actor)?`<@${actor}> (\`${actor}\`)`:'no identificado'}\n`+
            `${String(details).slice(0,1100)}\n**Ninguna copia anterior fue sobrescrita.**`;
        logger.warn?.(`[KYVEN Backup] ${guild.id} ${title} ${actor}: ${details}`);
        try {
            if (isSafeId(notifyChannelId)) {
                const channel = await client.channels.fetch(notifyChannelId);
                if (channel?.guildId === guild.id && typeof channel.send === 'function')
                    await channel.send({content,allowedMentions:{parse:[]}});
            }
        } catch (e) { logger.error?.('[KYVEN Backup] No se pudo notificar el canal:',errorString(e)); }
        await activity('backup_security','warning',`${title}: ${details}`.slice(0,240),`guild=${guild.id}; actor=${actor}`).catch(()=>{});
    }
    function recordDeletion(guildId, kind, targetId) {
        if (!isSafeId(targetId)) return;
        let saved = deletedObjects.get(guildId);
        if (!saved) { saved = {roleIds:new Set(),channelIds:new Set()}; deletedObjects.set(guildId,saved); }
        saved[kind === 'role' ? 'roleIds' : 'channelIds'].add(targetId);
    }
    async function scheduleRestore(guild,actor) {
        if (pendingRestore.has(guild.id) || Date.now() - (lastRestore.get(guild.id) || 0) < 60000) return;
        // Reserve the restoration job synchronously, before awaiting Discord I/O.
        const job = {started:Date.now(),handle:null};
        pendingRestore.set(guild.id,job);
        alert(guild,actor,`RAID: ${raidThreshold}+ ROLES ELIMINADOS`,
            `Se detectaron ${raidThreshold} o más eliminaciones de roles en ${raidWindowMs / 1000}s. `+
            'Se intentará reconstruir únicamente los roles/canales eliminados sin autorización.', {urgent:true})
            .catch(e=>logger.warn?.('[KYVEN Backup] Alerta raid:',errorString(e)));
        job.run = async () => {
            pendingRestore.delete(guild.id);
            lastRestore.set(guild.id,Date.now());
            const removed = deletedObjects.get(guild.id);
            if (!removed?.roleIds.size) return;
            try {
                const result = await restore(guild,{mode:'missing',automatic:true,
                    _internalToken:AUTO_RESTORE_TOKEN,
                    onlyRoleIds:[...removed.roleIds],onlyChannelIds:[...removed.channelIds]});
                await alert(guild,actor,'RECUPERACIÓN EJECUTADA',
                    `Roles recreados: ${result.rolesCreated}; canales recreados: ${result.channelsCreated}; `+
                    `errores: ${result.failures}. ${result.failures?'Revisá el registro y los permisos de KYVEN.':''}`,{urgent:true});
                // Preserve the incident lock; never take an automatic snapshot of the raid aftermath.
                deletedObjects.delete(guild.id);
            } catch (err) {
                await alert(guild,actor,'RECUPERACIÓN FALLIDA',errorString(err),{urgent:true});
            }
        };
        job.handle=setTimeout(job.run,raidDelayMs);
        job.handle.unref?.();
    }
    async function observeAudit(guild,entry) {
        if (!acceptsGuild(guild) || !STRUCTURE_EVENTS.has(entry?.action) || !entry?.id) return;
        const key = `${guild.id}:${entry.id}`;
        if (auditSeen.has(key)) return;
        auditSeen.set(key,Date.now());
        if (auditSeen.size>2500) for (const [k,v] of auditSeen) if (Date.now()-v>3600000) auditSeen.delete(k);
        const actor = auditActor(entry), target = String(entry.targetId || ''), allowed = accepted(actor,guild.id);
        if (!allowed) {
            // Critical state changes are recorded BEFORE any async Discord/Mongo I/O.
            bump(guild.id);
            if (entry.action === AuditLogEvent.RoleDelete) recordDeletion(guild.id,'role',target);
            if (entry.action === AuditLogEvent.ChannelDelete) recordDeletion(guild.id,'channel',target);
        }
        // Count coordinated role deletions across any combination of humans and bots.
        let thresholdReached=false;
        if (entry.action === AuditLogEvent.RoleDelete && (!allowed || includeTrustedInRaid)) {
            if (allowed && includeTrustedInRaid) recordDeletion(guild.id,'role',target);
            const listKey = guild.id, moment = auditTime(entry) || Date.now();
            const recent = (deletionHistory.get(listKey)||[]).filter(d=>Math.abs(moment-d.time) <= raidWindowMs);
            recent.push({time:moment,id:entry.id});
            deletionHistory.set(listKey,recent);
            thresholdReached=recent.length>=raidThreshold;
            if (deletionHistory.size>500) for (const [k,v] of deletionHistory) {
                if (Date.now() - (v.at(-1)?.time||0) > 3600000) deletionHistory.delete(k);
            }
        }
        if (!allowed) {
            await freeze(guild.id,`Cambio estructural no autorizado por ${actor}: ${ROLENAME.get(entry.action)||entry.action}`);
            await alert(guild,actor,'BACKUP NO ACTUALIZADO',
                `${ROLENAME.get(entry.action)||'Cambio de estructura'} ${target?`sobre \`${target}\``:''}. `+
                'El ejecutor no está autorizado. No se sobrescribe el backup.');
        }
        if (thresholdReached) await scheduleRestore(guild,actor);
        // Debounce the raid recovery while additional unauthorized changes arrive.
        const pending=pendingRestore.get(guild.id);
        if (pending && !allowed && Date.now()-pending.started < 30000) {
            clearTimeout(pending.handle);
            pending.handle=setTimeout(pending.run,raidDelayMs);
            pending.handle.unref?.();
        }
    }
    async function readAudits(guild,cutoffMs) {
        if (typeof guild.fetchAuditLogs !== 'function') throw new Error('Discord audit logs no disponibles: faltan permisos o la API del servidor');
        const result = []; let before, reachedCutoff = false;
        for (let page = 0; page < auditPages; page++) {
            const batch = await guild.fetchAuditLogs({limit:100,...(before?{before}:{})});
            const entries = [...(batch?.entries?.values()||[])];
            if (!entries.length) { reachedCutoff = true; break; }
            for (const entry of entries) if (auditTime(entry) >= cutoffMs - 1000 && STRUCTURE_EVENTS.has(entry.action)) result.push(entry);
            const oldest = entries.reduce((t,e)=>Math.min(t,auditTime(e)||0),Infinity);
            if (oldest <= cutoffMs || entries.length < 100) { reachedCutoff = true; break; }
            before = entries[entries.length - 1].id;
            if (!before) break;
        }
        if (!reachedCutoff) throw new Error(`Auditoría incompleta (más de ${auditPages*100} eventos); el backup no puede verificarse`);
        result.sort((a,b)=>auditTime(a)-auditTime(b) || String(a.id).localeCompare(String(b.id)));
        return result;
    }
    async function verifyAudits(guild,cutoffMs) {
        const events = await readAudits(guild,cutoffMs);
        for (const e of events) await observeAudit(guild,e);
        return events;
    }
    async function loadApproval(guildId) {
        if (approvals.has(guildId)) return approvals.get(guildId);
        let stamp = 0, remoteKnown = false;
        if (mongodbOnline()) {
            try {
                const doc=await Lock.findOne({guildId},{approvedThrough:1}).lean();
                if (doc) { remoteKnown=true;stamp=new Date(doc.approvedThrough||0).getTime()||0; }
            } catch (e) { logger.warn?.('[KYVEN Backup] Aprobación remota ilegible:',errorString(e)); }
        }
        if (!remoteKnown && fs.existsSync(approvalfile(guildId))) {
            try { stamp=Number(JSON.parse(fs.readFileSync(approvalfile(guildId),'utf8')).stamp)||0; } catch (_) {}
        }
        approvals.set(guildId,stamp);
        return stamp;
    }
    async function loadTrusted(guildId,{refresh=false}={}) {
        if (!refresh && guildTrusted.has(guildId)) return guildTrusted.get(guildId);
        let ids=[], remoteKnown=false;
        if (mongodbOnline()) {
            try {
                const doc=await Lock.findOne({guildId},{authorizedIds:1}).lean();
                if (doc) {remoteKnown=true;ids=(doc.authorizedIds||[]).filter(isSafeId);}
            } catch (e) { logger.warn?.('[KYVEN Backup] Autorizados Mongo no disponibles:',errorString(e)); }
        }
        if (!remoteKnown && fs.existsSync(authorizedfile(guildId))) {
            try { ids=JSON.parse(fs.readFileSync(authorizedfile(guildId),'utf8')).ids.filter(isSafeId); } catch (_) {}
        }
        const result=new Set(ids.filter(id=>!trustedUsers.has(id) && id!==client.user?.id));
        guildTrusted.set(guildId,result);
        return result;
    }
    async function manageTrusted(message) {
        if (!message?.guild || !acceptsGuild(message.guild) || message.author?.id!==primaryOwner ||
            message.channelId!==notifyChannelId || typeof message.content!=='string') return;
        const match=/^!kyvenbackup\s+(autorizar|revocar|lista)(?:\s+(\d{15,22}))?\s*$/i.exec(message.content.trim());
        if (!match) return;
        const action=match[1].toLowerCase(),target=match[2];
        const ids=new Set(await loadTrusted(message.guild.id));
        let response='';
        if (action==='lista') {
            response=`🔐 Autorizados permanentes: <@${primaryOwner}>, <@893345026376085544>. `+
                `Adicionales: ${[...ids].map(id=>`\`${id}\``).join(', ')||'ninguno'}.`;
        } else if (!isSafeId(target)) response='⛔ Usá un ID válido (15-22 dígitos).';
        else if (action==='autorizar') {
            if (trustedUsers.has(target) || target === client.user?.id)
                response='✅ Ese ID ya está autorizado permanentemente.';
            else if (ids.size>=10 && !ids.has(target)) response='⛔ Límite de 10 autorizados adicionales.';
            else { ids.add(target); response=`✅ Se autorizó el ID \`${target}\` a modificar roles/canales del servidor.`; }
        } else {
            if (trustedUsers.has(target) || target === client.user?.id)
                response='⛔ Ese ID es permanente. Para extras permanentes, modificá BACKUP_EXTRA_TRUSTED_IDS.';
            else { ids.delete(target); response=`✅ Se revocó el permiso adicional de \`${target}\`.`; }
        }
        if ((action==='autorizar'||action==='revocar') && !response.startsWith('⛔')) {
            if (!mongodbOnline() && requireMongo) response='⛔ MongoDB desconectado: no se modificó la lista.';
            else {
                try {
                    const saved=[...ids];
                    if (mongodbOnline()) await Lock.updateOne({guildId:message.guild.id},
                        {$set:{authorizedIds:saved},$setOnInsert:{locked:false}},{upsert:true});
                    try { mkdir();fs.writeFileSync(authorizedfile(message.guild.id),
                        JSON.stringify({ids:saved}),{mode:0o600}); }
                    catch (e) { logger.warn?.('[KYVEN Backup] Autorizados sin espejo local:',errorString(e)); }
                    guildTrusted.set(message.guild.id,ids);
                } catch (e) { response='⛔ No se guardaron los autorizados: '+errorString(e); }
            }
        }
        try { await message.reply({content:response.slice(0,1600),allowedMentions:{parse:[]}}); }
        catch (e) { logger.warn?.('[KYVEN Backup] Respuesta comando:',errorString(e)); }
    }
    function differences(oldData,newData) {
        const changes=[];
        for (const [kind,actions] of [['roles', {create:[AuditLogEvent.RoleCreate],delete:[AuditLogEvent.RoleDelete],
            update:[AuditLogEvent.RoleUpdate,AuditLogEvent.RolePositionUpdate]}],
            ['channels',{create:[AuditLogEvent.ChannelCreate],delete:[AuditLogEvent.ChannelDelete],
            update:[AuditLogEvent.ChannelUpdate,AuditLogEvent.ChannelOverwriteCreate,
                AuditLogEvent.ChannelOverwriteUpdate,AuditLogEvent.ChannelOverwriteDelete,AuditLogEvent.ChannelPositionUpdate]}]]) {
            const old=new Map((oldData[kind]||[]).map(x=>[x.id,x]));
            const now=new Map((newData[kind]||[]).map(x=>[x.id,x]));
            for (const [id,value] of old) {
                if (!now.has(id)) changes.push({kind,id,type:'delete',actions:actions.delete});
                else if (!same(value,now.get(id))) changes.push({kind,id,type:'update',actions:actions.update});
            }
            for (const [id] of now) if (!old.has(id)) changes.push({kind,id,type:'create',actions:actions.create});
        }
        return changes;
    }
    function auditProvesChanges(oldData,newData,entries,guildId) {
        const changes=differences(oldData,newData);
        const unproven=changes.filter(change=>!entries.some(e=>accepted(auditActor(e),guildId) &&
            String(e.targetId||'')===change.id && change.actions.includes(e.action)));
        // Discord may silently remove channel overwrites when an authorized role is deleted.
        const deletedRoles = new Set(changes.filter(c=>c.kind==='roles' && c.type==='delete' && !unproven.includes(c)).map(c=>c.id));
        return unproven.filter(c=>{
            if (c.kind!=='channels'||c.type!=='update'||!deletedRoles.size) return true;
            const old=oldData.channels.find(x=>x.id===c.id), now=newData.channels.find(x=>x.id===c.id);
            if (!old||!now) return true;
            const {overwrites:oldOver,...before}=old, {overwrites:newOver,...after}=now;
            if (!same(before,after)) return true;
            const removed=(oldOver||[]).filter(o=>!deletedRoles.has(o.id));
            return !same(removed,newOver||[]);
        });
    }
    function mkdir() { fs.mkdirSync(directory, { recursive: true, mode: 0o700 }); }
    function serializeRole(role) {
        return {
            id: role.id, name: role.name, managed: Boolean(role.managed), position: role.position,
            permissions: bitfield(role.permissions), color: role.color ?? 0,
            hoist: Boolean(role.hoist), mentionable: Boolean(role.mentionable)
        };
    }
    function serializeOverwrites(channel) {
        return [...(channel.permissionOverwrites?.cache?.values() || [])]
            .map(o => ({ id: o.id, type: Number(o.type), allow: bitfield(o.allow), deny: bitfield(o.deny) }))
            .sort(stable);
    }
    function serializeChannel(ch) {
        const saved = {
            id: ch.id, name: ch.name, type: Number(ch.type), parentId: ch.parentId || null,
            position: Number(ch.rawPosition ?? ch.position ?? 0), overwrites: serializeOverwrites(ch)
        };
        const fields = ['topic', 'nsfw', 'rateLimitPerUser', 'bitrate', 'userLimit', 'rtcRegion',
            'videoQualityMode', 'defaultAutoArchiveDuration', 'defaultThreadRateLimitPerUser'];
        for (const key of fields) {
            if (ch[key] !== undefined && ch[key] !== null && ['string','number','boolean'].includes(typeof ch[key])) {
                saved[key] = ch[key];
            }
        }
        // Forum tags can be recreated (their old IDs cannot).
        if (Array.isArray(ch.availableTags)) saved.availableTags = ch.availableTags.map(t => ({
            name: t.name, moderated: Boolean(t.moderated), emojiId: t.emojiId || undefined,
            emojiName: t.emojiName || undefined
        }));
        return saved;
    }
    async function capture(guild) {
        if (!guild?.roles?.cache || !guild?.channels?.cache) throw new Error('Caché de servidor no disponible');
        const roles = [...guild.roles.cache.values()].filter(r => r.id !== guild.id)
            .map(serializeRole).sort(stable);
        const channels = [...guild.channels.cache.values()].filter(c => c?.name && CHANNEL_TYPES.has(c.type))
            .map(serializeChannel).sort(stable);
        const data = { schema: SCHEMA, guildId: guild.id, guildName: guild.name, roles, channels, assignments: [], warnings: [] };
        if (trackMembers && guild.memberCount <= maxMembers && guild.members?.fetch) {
            try {
                const members = await guild.members.fetch();
                for (const m of members.values()) {
                    const ids = [...(m.roles?.cache?.keys?.() || [])].filter(id => id !== guild.id).sort();
                    if (ids.length) data.assignments.push({ memberId: m.id, roleIds: ids });
                }
                data.assignments.sort((a,b) => a.memberId.localeCompare(b.memberId));
            } catch (e) { data.warnings.push('No se pudieron guardar asignaciones de roles a miembros: ' + errorString(e)); }
        } else if (trackMembers && guild.memberCount > maxMembers) {
            data.warnings.push(`Asignaciones omitidas: servidor con ${guild.memberCount} miembros, límite ${maxMembers}`);
        }
        return data;
    }
    function localPaths(guildId) {
        if (!isSafeId(guildId)) throw new Error('ID de servidor inválido');
        if (!fs.existsSync(directory)) return [];
        return fs.readdirSync(directory).filter(f => f.startsWith(`${guildId}-`) && f.endsWith('.json.gz'))
            .map(f => path.join(directory,f)).sort().reverse();
    }
    function decode(bytes, expectedGuild, expectedHash) {
        const plain = zlib.gunzipSync(bytes);
        if (expectedHash && crypto.createHash('sha256').update(plain).digest('hex') !== expectedHash) {
            throw new Error('SHA-256 del snapshot no coincide: copia posiblemente corrupta');
        }
        const parsed = JSON.parse(plain.toString('utf8'));
        if (parsed.schema !== SCHEMA || parsed.guildId !== expectedGuild || !Array.isArray(parsed.roles) || !Array.isArray(parsed.channels)) {
            throw new Error('Snapshot inválido o perteneciente a otro servidor');
        }
        return parsed;
    }
    async function loadLock(guildId) {
        if (frozen.has(guildId)) return frozen.get(guildId);
        let info = null;
        if (mongodbOnline()) {
            try { const rec = await Lock.findOne({guildId, locked:true}).lean(); if (rec) info = {reason:rec.reason || 'Incidente',since:rec.since}; }
            catch (err) { logger.warn?.('[KYVEN Backup] No se pudo leer bloqueo Mongo:', errorString(err)); }
        }
        if (!info && fs.existsSync(lockfile(guildId))) {
            try { info = JSON.parse(fs.readFileSync(lockfile(guildId),'utf8')); }
            catch (_) { info = { reason: 'Archivo de bloqueo presente y no legible', since: new Date() }; }
        }
        if (info) frozen.set(guildId, info);
        return info;
    }
    async function mirrorLocks() {
        if (!mongodbOnline()) return;
        for (const [guildId,data] of frozen) {
            try { await Lock.updateOne({guildId},{$set:{guildId,locked:true,...data}}, {upsert:true}); }
            catch (err) { logger.warn?.('[KYVEN Backup] No se pudo sincronizar bloqueo:',errorString(err)); }
        }
    }
    async function freeze(guildId, reason) {
        if (!isSafeId(guildId)) return;
        if (frozen.has(guildId)) return;
        const data = { reason: String(reason).slice(0, 240), since: new Date() };
        frozen.set(guildId, data);
        try { mkdir(); fs.writeFileSync(lockfile(guildId), JSON.stringify(data), { mode: 0o600 }); }
        catch (err) { logger.warn?.('[KYVEN Backup] No se pudo crear bloqueo local:', errorString(err)); }
        if (mongodbOnline()) {
            try { await Lock.updateOne({guildId}, {$set:{guildId,locked:true,...data}}, {upsert:true}); }
            catch (err) { logger.warn?.('[KYVEN Backup] No se pudo guardar bloqueo remoto:', errorString(err)); }
        }
    }
    async function unlock(guildId) {
        // Existing /guardia command authenticates owner+PIN; unlocking is explicit acceptance
        // of the current restored/inspected structure as a new trusted baseline.
        const stamp = Date.now();
        if (mongodbOnline()) await Lock.updateOne({guildId},{$set:{locked:false,approvedThrough:new Date(stamp)}},{upsert:true})
            .catch(e => {throw new Error('No se pudo aprobar en MongoDB: '+errorString(e));});
        else if (requireMongo) throw new Error('MongoDB offline: no se puede registrar la aprobación del owner');
        try {
            mkdir();
            fs.writeFileSync(approvalfile(guildId),JSON.stringify({stamp}),{mode:0o600});
            if (fs.existsSync(lockfile(guildId))) fs.unlinkSync(lockfile(guildId));
        } catch (err) { logger.warn?.('[KYVEN Backup] Aprobación local:',errorString(err)); }
        frozen.delete(guildId); approvals.set(guildId,stamp); bump(guildId);
    }
    async function list(guildId) {
        let remote = [];
        if (mongodbOnline()) {
            try { remote = await Snapshot.find({guildId}, {payload:0}).sort({createdAt:-1}).limit(keep).lean(); }
            catch (err) { logger.warn?.('[KYVEN Backup] Error consultando Mongo:', errorString(err)); }
        }
        const out = remote.map(s => ({ id:String(s._id),createdAt:new Date(s.createdAt),hash:s.hash,bytes:s.bytes,source:'MongoDB Atlas' }));
        const knownHashes = new Set(out.map(s => s.hash));
        for (const p of localPaths(guildId).slice(0,keep)) {
            try {
                const b = fs.readFileSync(p);
                const item = decode(b,guildId);
                const hash = crypto.createHash('sha256').update(JSON.stringify(item)).digest('hex');
                // Distinguish content hash in local format: generated filename contains fingerprint; exact hash from data.
                if (knownHashes.has(hash)) continue;
                out.push({ id:path.basename(p), createdAt: new Date(Number(path.basename(p).split('-')[1])), hash,bytes:b.length,source:'local' });
                knownHashes.add(hash);
            } catch (err) { logger.warn?.('[KYVEN Backup] Copia local dañada ignorada:', errorString(err)); }
        }
        return out.sort((a,b) => b.createdAt - a.createdAt);
    }
    async function latest(guildId, requestedId) {
        const mongo = mongodbOnline();
        if (mongo) {
            try {
                const rec = requestedId && /^[a-f\d]{24}$/i.test(requestedId)
                    ? await Snapshot.findOne({ _id: requestedId, guildId }).lean()
                    : !requestedId ? await Snapshot.findOne({guildId}).sort({createdAt:-1}).lean() : null;
                if (rec) {
                    const bytes = Buffer.isBuffer(rec.payload) ? rec.payload : Buffer.from(rec.payload?.buffer ?? rec.payload);
                    return { data:decode(bytes,guildId,rec.hash),id:String(rec._id), createdAt:rec.createdAt, source:'MongoDB Atlas' };
                }
            } catch (err) { logger.warn?.('[KYVEN Backup] Error leyendo snapshot Mongo:', errorString(err)); }
        }
        const paths = requestedId ? localPaths(guildId).filter(p => path.basename(p) === requestedId) : localPaths(guildId);
        if (requestedId && paths.length === 0) throw new Error('No se encontró la copia solicitada');
        for (const p of paths) {
            try {
                const bytes = fs.readFileSync(p);
                const plain = zlib.gunzipSync(bytes);
                const hash = crypto.createHash('sha256').update(plain).digest('hex');
                if (!path.basename(p).endsWith(`${hash.slice(0,12)}.json.gz`)) throw new Error('Huella local inválida');
                return { data:decode(bytes,guildId,hash), id:path.basename(p),createdAt:new Date(Number(path.basename(p).split('-')[1])),source:'local' };
            }
            catch (err) { logger.warn?.('[KYVEN Backup] Snapshot local inválido:', errorString(err)); }
        }
        throw new Error('No hay ninguna copia válida para este servidor. No es posible restaurar.');
    }
    async function save(guild, { force = false } = {}) {
        if (!enabled || !acceptsGuild(guild)) return {skipped:'desactivado'};
        if (processes.has(guild.id)) return {skipped:'otra operación está en curso'};
        if (await loadLock(guild.id)) return {skipped:'COPIAS CONGELADAS: hay cambios no autorizados sin revisar'};
        if (requireMongo && !mongodbOnline()) return {skipped:'MongoDB desconectado: no se reemplazará una copia persistente'};
        processes.add(guild.id);
        try {
            let hasOld = localPaths(guild.id).length > 0;
            if (mongodbOnline()) hasOld ||= Boolean(await Snapshot.exists({guildId:guild.id}));
            let previous = null;
            try { previous = await latest(guild.id); }
            catch (err) {
                if (hasOld) throw new Error('La copia anterior no puede verificarse; nunca se sobrescribe: '+errorString(err));
            }
            const oldTime = previous ? new Date(previous.createdAt).getTime() : 0;
            const approval = await loadApproval(guild.id);
            if (previous && Date.now() - oldTime > 40*86400000 && approval <= oldTime)
                return {skipped:'Copia con más de 40 días: el historial de auditoría ya no es verificable; revisión del owner requerida'};
            const since = Math.max(previous ? oldTime : Date.now()-intervalMin*60000, approval);
            await loadTrusted(guild.id);
            const beforeAudit = await verifyAudits(guild,since);
            if (await loadLock(guild.id)) return {skipped:'Cambios no autorizados detectados durante la auditoría'};
            if (typeof guild.roles?.fetch === 'function') await guild.roles.fetch();
            if (typeof guild.channels?.fetch === 'function') await guild.channels.fetch();
            const data = await capture(guild);
            const afterAudit = await verifyAudits(guild,since);
            if (await loadLock(guild.id)) return {skipped:'Cambios no autorizados detectados durante la captura'};
            // Fail closed if structure changed without a provable authorized audit entry.
            // Owner review (/guardia desbloquear) explicitly approves the current baseline;
            // future changes still require audit evidence from the approval time onward.
            if (previous && approval <= oldTime) {
                const unmatched = auditProvesChanges(previous.data,data,afterAudit,guild.id);
                if (unmatched.length) {
                    const detail = unmatched.slice(0,5).map(x=>`${x.kind}:${x.type}:${x.id}`).join(', ');
                    await freeze(guild.id,`Cambios sin autor autorizado identificado: ${detail}`);
                    await alert(guild,'no identificado','BACKUP RECHAZADO',
                        `La estructura actual difiere del respaldo, pero no hay evidencia de una acción autorizada: ${detail}.`);
                    return {skipped:'Cambios estructurales no atribuibles a IDs autorizados'};
                }
            }
            const plain = Buffer.from(JSON.stringify(data));
            const hash = crypto.createHash('sha256').update(plain).digest('hex');
            if (previous && previous.data &&
                crypto.createHash('sha256').update(JSON.stringify(previous.data)).digest('hex') === hash) {
                return {skipped:'Sin cambios; se conserva la copia anterior',hash};
            }
            const compressed = zlib.gzipSync(plain,{level:9});
            if (compressed.length>maxBytes) throw new Error(`Backup supera límite ${maxBytes} bytes; no se sobrescribe el anterior (${compressed.length} bytes)`);
            // Re-check audit after compression; if anything changed concurrently, abort.
            const finalAudit = await verifyAudits(guild,since);
            if (finalAudit.length > afterAudit.length && previous && approval <= oldTime) {
                const unmatched = auditProvesChanges(previous.data,data,finalAudit,guild.id);
                if (unmatched.length) return {skipped:'Auditoría cambió mientras se comprimía; se reintentará'};
            }
            if (await loadLock(guild.id)) return {skipped:'Incidente detectado antes de publicar backup'};
            const startEpoch=epoch(guild.id);
            const now=new Date();
            let remoteSaved=false, localSaved=false, created=null, localFile=null;
            try {
                if (mongodbOnline()) {
                    created=await Snapshot.create({guildId:guild.id,createdAt:now,hash,
                        bytes:compressed.length,payload:compressed});
                    remoteSaved=true;
                }
                if (await loadLock(guild.id) || epoch(guild.id)!==startEpoch)
                    return {skipped:'Cambios detectados durante la escritura; la copia anterior se conserva'};
                if (localMirror) {
                    try {
                        mkdir();
                        const outfile=path.join(directory,`${guild.id}-${now.getTime()}-${hash.slice(0,12)}.json.gz`);
                        const tempfile=`${outfile}.${process.pid}.tmp`;
                        fs.writeFileSync(tempfile,compressed,{mode:0o600});
                        fs.renameSync(tempfile,outfile);
                        localFile=outfile; localSaved=true;
                    } catch (err) { logger.warn?.('[KYVEN Backup] Espejo local no disponible:',errorString(err)); }
                }
                if (!remoteSaved && (requireMongo || !localSaved))
                    throw new Error('No se pudo guardar el backup de forma persistente en MongoDB');
                if (await loadLock(guild.id) || epoch(guild.id)!==startEpoch)
                    return {skipped:'Raid simultáneo: se descartó la nueva copia antes de eliminar la anterior'};
                // IMPORTANT: prune only AFTER a new backup was verified, persisted and remained safe.
                if (remoteSaved) {
                    const all = await Snapshot.find({guildId:guild.id},{_id:1})
                        .sort({createdAt:-1,_id:-1}).lean();
                    const wanted = new Set([String(created._id)]);
                    for (const doc of all) {
                        if (wanted.size>=keep) break;
                        wanted.add(String(doc._id));
                    }
                    const old = all.filter(doc=>!wanted.has(String(doc._id)));
                    if (old.length) await Snapshot.deleteMany({_id:{$in:old.map(x=>x._id)}});
                }
                if (localSaved) {
                    const files=localPaths(guild.id);
                    const wanted=new Set([localFile,...files.filter(x=>x!==localFile).slice(0,keep-1)]);
                    for (const p of files) if (!wanted.has(p)) {
                        try { fs.unlinkSync(p); }
                        catch (err) { logger.warn?.('[KYVEN Backup] Limpieza local:',errorString(err)); }
                    }
                }
                await activity('backup','success',`Backup verificado de ${guild.name}: ${data.roles.length} roles y ${data.channels.length} canales`,
                    `${compressed.length} bytes GZIP; Mongo=${remoteSaved}; local=${localSaved}; autorizados=${[...trustedUsers].length}`);
                return {saved:true,remoteSaved,localSaved,bytes:compressed.length,hash,
                    roles:data.roles.length,channels:data.channels.length,assignments:data.assignments.length,warnings:data.warnings};
            } finally {
                // If publish was aborted, remove only the draft created in this attempt.
                if ((await loadLock(guild.id)) || epoch(guild.id)!==startEpoch ||
                    (!remoteSaved && (requireMongo || !localSaved))) {
                    if (created) await Snapshot.deleteOne({_id:created._id}).catch(e=>logger.error?.('[KYVEN Backup] Borrador remoto no eliminado:',errorString(e)));
                    if (localFile) { try { fs.unlinkSync(localFile); } catch (_) {} }
                }
            }
        } finally { processes.delete(guild.id); }
    }
    function inspect(guild, data, mode = 'missing') {
        const newRoles = data.roles.filter(r => !r.managed && !guild.roles.cache.has(r.id));
        const newChannels = data.channels.filter(c => !guild.channels.cache.has(c.id));
        const existingRoles = mode === 'full' ? data.roles.filter(r => !r.managed && guild.roles.cache.has(r.id)) : [];
        const existingChannels = mode === 'full' ? data.channels.filter(c => guild.channels.cache.has(c.id)) : [];
        return {createRoles:newRoles.length,createChannels:newChannels.length,
            editRoles:existingRoles.length, editChannels:existingChannels.length,
            restoreAssignments:(data.assignments||[]).length, backupRoles:data.roles.length,backupChannels:data.channels.length};
    }
    async function plan(guild, options = {}) {
        const found = await latest(guild.id, options.snapshotId);
        return { snapshotId:found.id, createdAt:found.createdAt, source:found.source,
            ...inspect(guild,found.data,options.mode || 'missing'), warnings:found.data.warnings || [] };
    }
    function remapOverwrites(overwrites, roleMap, guild, warnings) {
        return (overwrites || []).flatMap(o => {
            if (!isSafeId(o.id)) return [];
            const targetId = o.type === 0 ? (o.id === guild.id ? guild.id : roleMap.get(o.id)) : o.id;
            if (!targetId) { warnings.push(`Overwrite de rol ${o.id} omitido: rol administrado ausente`); return []; }
            try {
                return [{id:targetId, type:o.type,allow:BigInt(o.allow),deny:BigInt(o.deny)}];
            } catch (_) { warnings.push(`Overwrite inválido ${o.id} omitido`); return []; }
        });
    }
    function channelFields(c) {
        const opts = {};
        const names = ['topic','nsfw','rateLimitPerUser','bitrate','userLimit','rtcRegion','videoQualityMode',
            'defaultAutoArchiveDuration','defaultThreadRateLimitPerUser','availableTags'];
        for (const name of names) if (Object.prototype.hasOwnProperty.call(c,name)) opts[name] = c[name];
        return opts;
    }
    async function restore(guild, {snapshotId,mode = 'missing',automatic = false,onlyRoleIds,onlyChannelIds,_internalToken} = {}) {
        if (!['missing','full'].includes(mode)) throw new Error('Modo de recuperación inválido');
        // Another module must NOT trigger a restore after a single deletion.
        if (automatic && _internalToken !== AUTO_RESTORE_TOKEN)
            throw new Error('La restauración automática solo se permite tras el umbral de roles eliminados');
        if (processes.has(guild.id)) throw new Error('Otra operación de backup/recuperación está activa');
        if (automatic && mode === 'full') throw new Error('La recuperación automática nunca modifica objetos existentes');
        processes.add(guild.id);
        const errors = [], warnings = [];
        const stats = { rolesCreated:0,channelsCreated:0,rolesEdited:0,channelsEdited:0,membersRestored:0,failures:0 };
        try {
            const {data,id,createdAt,source} = await latest(guild.id,snapshotId);
            const roleFilter = automatic && Array.isArray(onlyRoleIds) ? new Set(onlyRoleIds) : null;
            const channelFilter = automatic && Array.isArray(onlyChannelIds) ? new Set(onlyChannelIds) : null;
            const roleMap = new Map([[guild.id,guild.id]]);
            const rolesRecreated = [];
            const channelsRecreated = [];
            for (const r of data.roles) if (guild.roles.cache.has(r.id)) roleMap.set(r.id,r.id);
            for (const r of data.roles.filter(r=>!r.managed && (!roleFilter||roleFilter.has(r.id))).sort((a,b)=>a.position-b.position)) {
                try {
                    let dest = guild.roles.cache.get(r.id);
                    const options = {name:r.name, permissions:BigInt(r.permissions), color:r.color,
                        hoist:r.hoist,mentionable:r.mentionable,reason:'KYVEN recuperación de snapshot verificado'};
                    if (!dest) {
                        dest = await guild.roles.create(options); stats.rolesCreated++;
                        roleMap.set(r.id,dest.id);
                        rolesRecreated.push({dest,old:r});
                    } else if (mode === 'full' && dest.editable) {
                        await dest.edit(options); stats.rolesEdited++;
                    }
                } catch (err) { errors.push(`Rol ${r.name}: ${errorString(err)}`); stats.failures++; }
            }
            // Preserve relative role priority as far as Discord permits.
            const highest = guild.members.me?.roles?.highest?.position ?? Number.MAX_SAFE_INTEGER;
            for (const {dest,old} of rolesRecreated) {
                if (typeof dest.setPosition !== 'function') continue;
                try { await dest.setPosition(Math.max(1,Math.min(old.position,highest-1)), 'KYVEN: posición de rol'); }
                catch (err) { warnings.push(`Posición del rol ${old.name}: ${errorString(err)}`); }
            }
            const channelMap = new Map();
            for (const c of data.channels) if (guild.channels.cache.has(c.id)) channelMap.set(c.id,c.id);
            const ordered = [...data.channels].sort((a,b) =>
                (a.type===ChannelType.GuildCategory?0:1) - (b.type===ChannelType.GuildCategory?0:1) || a.position-b.position);
            for (const c of ordered) {
                try {
                    let dest = guild.channels.cache.get(c.id);
                    const mappedParent = c.parentId ? channelMap.get(c.parentId) : null;
                    if (c.parentId && !mappedParent) warnings.push(`Sin categoría para canal ${c.name}: ${c.parentId}`);
                    const overwrites = remapOverwrites(c.overwrites,roleMap,guild,warnings);
                    if (!dest && (!channelFilter || channelFilter.has(c.id))) {
                        const opts = {name:c.name,type:c.type,permissionOverwrites:overwrites,
                            ...channelFields(c),reason:'KYVEN recuperación de snapshot verificado'};
                        if (mappedParent) opts.parent = mappedParent;
                        dest = await guild.channels.create(opts);
                        channelMap.set(c.id,dest.id); stats.channelsCreated++;
                        channelsRecreated.push({dest,old:c});
                    } else if (mode === 'full' && dest.manageable) {
                        const opts = {name:c.name,permissionOverwrites:overwrites,
                            ...channelFields(c),reason:'KYVEN recuperación de snapshot verificado'};
                        await dest.edit(opts);
                        if (dest.parentId !== mappedParent && typeof dest.setParent === 'function') {
                            await dest.setParent(mappedParent, {lockPermissions:false,
                                reason:'KYVEN: restaurar categoría original'});
                        }
                        stats.channelsEdited++;
                    } else if (mode === 'missing' && dest.manageable) {
                        // A deleted category may leave its surviving children at server root.
                        if (c.parentId && mappedParent && mappedParent !== c.parentId &&
                            dest.parentId !== mappedParent && typeof dest.setParent === 'function') {
                            await dest.setParent(mappedParent, {lockPermissions:false,
                                reason:'KYVEN: reconectar canal a categoría recuperada'});
                        }
                        // Only reinstate overwrites belonging to recreated roles; never touch
                        // unrelated existing permissions in automatic/missing-only mode.
                        if (dest.permissionOverwrites?.edit) {
                            for (const o of c.overwrites || []) {
                                if (o.type !== 0 || !roleMap.has(o.id) || roleMap.get(o.id) === o.id) continue;
                                const allowed = BigInt(o.allow), denied = BigInt(o.deny);
                                const perms = {};
                                for (const [name,value] of Object.entries(PermissionsBitField.Flags)) {
                                    if ((allowed & value) === value) perms[name] = true;
                                    else if ((denied & value) === value) perms[name] = false;
                                }
                                try { await dest.permissionOverwrites.edit(roleMap.get(o.id),perms,
                                    {reason:'KYVEN: recuperar permisos de rol eliminado'}); }
                                catch (err) { warnings.push(`Overwrite de ${c.name}: ${errorString(err)}`); }
                            }
                        }
                    }
                } catch (err) { errors.push(`Canal ${c.name}: ${errorString(err)}`); stats.failures++; }
            }
            for (const {dest,old} of channelsRecreated) {
                if (typeof dest.setPosition !== 'function') continue;
                try { await dest.setPosition(Math.max(0,old.position),'KYVEN: posición de canal'); }
                catch (err) { warnings.push(`Posición del canal ${old.name}: ${errorString(err)}`); }
            }
            // Guild role names and IDs can't be preserved when recreated; restore member roles selectively.
            const replacedIds = new Set([...roleMap].filter(([oldId,newId]) => oldId !== newId).map(([oldId]) => oldId));
            if (replacedIds.size && Array.isArray(data.assignments)) {
                let attempted = 0;
                for (const item of data.assignments) {
                    const needs = item.roleIds.filter(r => replacedIds.has(r)).map(r=>roleMap.get(r)).filter(Boolean);
                    if (!needs.length) continue;
                    if (++attempted > maxRestores) { warnings.push(`Límite de ${maxRestores} miembros alcanzado; faltan asignaciones por recuperar`); break; }
                    try {
                        const member = await guild.members.fetch(item.memberId);
                        await member.roles.add(needs,'KYVEN: recuperar asignaciones de roles');
                        stats.membersRestored++;
                    } catch (err) { errors.push(`Asignación miembro ${item.memberId}: ${errorString(err)}`); stats.failures++; }
                }
            }
            await activity('backup_restore',stats.failures?'warning':'success',
                `Recuperación ${automatic?'automática':'manual'} completada en ${guild.name}`,
                `copias ${source}; roles +${stats.rolesCreated}; canales +${stats.channelsCreated}; fallos ${stats.failures}`);
            return {...stats,warnings: warnings.slice(0,25), errors:errors.slice(0,25),snapshotId:id,createdAt,source,mode};
        } finally { processes.delete(guild.id); }
    }
    async function tick() {
        if (!enabled) return;
        // Remote lock state may survive a hosting restart even when local disk does not.
        // Do not capture a potentially compromised state until Atlas has been checked.
        if (env.MONGO_URI && !mongodbOnline()) {
            logger.warn?.('[KYVEN Backup] MongoDB desconectado: copias pausadas para proteger el respaldo persistente');
            for (const guild of client.guilds.cache.values()) if (acceptsGuild(guild))
                await alert(guild,'no identificado','BACKUP SUSPENDIDO','MongoDB sin conexión. No se reemplazó ninguna copia.');
            return;
        }
        for (const guild of client.guilds.cache.values()) {
            if (!acceptsGuild(guild)) continue;
            try {
                // Check missed entries EVEN while frozen, so an offline raid is still detected.
                if (await loadLock(guild.id)) {
                    let since=Date.now()-intervalMin*60000;
                    try { since=new Date((await latest(guild.id)).createdAt).getTime(); } catch (_) {}
                    await verifyAudits(guild,since);
                } else {
                    const result=await save(guild);
                    if (result?.skipped?.startsWith('MongoDB desconectado'))
                        await alert(guild,'no identificado','BACKUP SUSPENDIDO',result.skipped);
                }
            } catch (err) {
                logger.error?.(`[KYVEN Backup] Error guardando ${guild.id}:`,errorString(err));
                await alert(guild,'no identificado','BACKUP NO REALIZADO',errorString(err));
            }
        }
    }
    function start() {
        if (!enabled || timer) return;
        // Listen directly to Discord audit entries. Works for bots AND humans.
        // Event attribution requires VIEW_AUDIT_LOG; tick() also scans missed entries.
        auditListener = (entry,guild)=>observeAudit(guild,entry)
            .catch(e=>logger.error?.('[KYVEN Backup] Evento auditoría:',errorString(e)));
        client.on('guildAuditLogEntryCreate',auditListener);
        adminListener = message=>manageTrusted(message)
            .catch(e=>logger.error?.('[KYVEN Backup] Administrar autorizados:',errorString(e)));
        client.on('messageCreate',adminListener);
        const bootstrap = async () => {
            for (const guild of client.guilds.cache.values()) {
                await loadLock(guild.id);
                await loadApproval(guild.id);
                await loadTrusted(guild.id);
            }
            await tick();
        };
        if (client.isReady?.()) bootstrap().catch(e=>logger.error?.('[KYVEN Backup] Inicio:',errorString(e)));
        else client.once('ready',()=>bootstrap().catch(e=>logger.error?.('[KYVEN Backup] Inicio:',errorString(e))));
        mongoose.connection.on('connected',()=>{
            mirrorLocks().catch(e=>logger.warn?.('[KYVEN Backup] MirrorLocks:',errorString(e)));
            for (const guild of client.guilds.cache.values()) loadTrusted(guild.id,{refresh:true})
                .catch(e=>logger.warn?.('[KYVEN Backup] Recargar autorizados:',errorString(e)));
            if (client.isReady?.()) tick().catch(e=>logger.warn?.('[KYVEN Backup] Al conectar Mongo:',errorString(e)));
        });
        timer = setInterval(()=>tick().catch(e=>logger.error?.('[KYVEN Backup] Timer:',errorString(e))), intervalMin*60*1000);
        timer.unref?.();
        client.on('guildCreate', guild => save(guild).catch(e=>logger.warn?.('[KYVEN Backup] GuildCreate:',errorString(e))));
    }
    function stop() {
        if (timer) clearInterval(timer); timer = null;
        if (auditListener) client.off('guildAuditLogEntryCreate',auditListener);
        if (adminListener) client.off('messageCreate',adminListener);
        auditListener=null;adminListener=null;
        for (const job of pendingRestore.values()) clearTimeout(job.handle);
        pendingRestore.clear();
    }
    return {enabled,start,stop,capture,save,latest,list,plan,restore,freeze,unlock,loadLock,inspect};
}
module.exports = {newBackupGuardian};
