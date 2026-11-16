'use strict';

// Permission Center 2: reusable channel overwrite drafts and templates.
// A channel overwrite is NOT a guild-role permission set.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PermissionFlagsBits: FLAGS, ChannelType } = require('discord.js');

// Keep templates in a hidden directory: express.static must never serve them.
const STORE = process.env.NODE_ENV === 'test' && process.env.KYVEN_PC_TEMPLATE_TEST_STORE
    ? path.resolve(process.env.KYVEN_PC_TEMPLATE_TEST_STORE)
    : path.join(__dirname, '..', '..', '..', '.pc-private', 'permission-templates.json');
const SNOWFLAKE = /^\d{17,20}$/;
const MAX_TARGETS = 15;
const MAX_OVERWRITES = 100;
const MAX_TEMPLATES = 80;
const CHANNEL_PERMISSIONS = [
    'ViewChannel', 'ManageChannels', 'ManageRoles', 'ManageWebhooks', 'CreateInstantInvite',
    'SendMessages', 'SendMessagesInThreads', 'CreatePublicThreads', 'CreatePrivateThreads',
    'ManageThreads', 'EmbedLinks', 'AttachFiles', 'AddReactions', 'UseExternalEmojis',
    'UseExternalStickers', 'MentionEveryone', 'ManageMessages', 'ReadMessageHistory',
    'SendTTSMessages', 'UseApplicationCommands', 'CreatePolls', 'SendVoiceMessages',
    'Connect', 'Speak', 'Stream', 'MuteMembers', 'DeafenMembers', 'MoveMembers',
    'UseVAD', 'PrioritySpeaker', 'UseSoundboard', 'UseExternalSounds',
    'SetVoiceChannelStatus', 'UseEmbeddedActivities', 'UseExternalApps', 'ManageEvents'
].filter(flag => typeof FLAGS[flag] === 'bigint');
const CHANNEL_SET = new Set(CHANNEL_PERMISSIONS);

function err(status, message) { const e = new Error(message); e.status = status; return e; }
function uniqueFlags(flags) {
    if (!Array.isArray(flags) || flags.length > CHANNEL_PERMISSIONS.length || flags.some(f => typeof f !== 'string' || !CHANNEL_SET.has(f)))
        throw err(400, 'La lista contiene permisos que no pertenecen a un canal.');
    return [...new Set(flags)].sort();
}
function normalize(entry) {
    if (!entry || typeof entry !== 'object' || !SNOWFLAKE.test(String(entry.id)))
        throw err(400, 'El ID de un rol o usuario no es válido.');
    const type = Number(entry.type);
    if (type !== 0 && type !== 1) throw err(400, 'El destinatario debe ser un rol o un usuario.');
    const allow = uniqueFlags(entry.allow || []);
    const deny = uniqueFlags(entry.deny || []);
    const clear = uniqueFlags(entry.clear || []);
    if ([...allow, ...deny].some(x => allow.includes(x) && deny.includes(x)) || clear.some(x => allow.includes(x) || deny.includes(x)))
        throw err(400, 'Un permiso no puede tener más de un estado.');
    return { id: String(entry.id), type, allow, deny, clear };
}
function validatedEntries(entries) {
    if (!Array.isArray(entries) || entries.length > MAX_OVERWRITES) throw err(400, 'Demasiadas sobrescrituras de permisos.');
    const parsed = entries.map(normalize);
    if (new Set(parsed.map(p => p.id)).size !== parsed.length) throw err(400, 'Hay roles o usuarios duplicados.');
    return parsed;
}
function strip(entry) { return { id: entry.id, type: entry.type, allow: entry.allow, deny: entry.deny }; }
function fromChannel(channel) {
    return channel.permissionOverwrites.cache.map(ow => strip(normalize({ id: ow.id, type: ow.type, allow: ow.allow.toArray().filter(p => CHANNEL_SET.has(p)), deny: ow.deny.toArray().filter(p => CHANNEL_SET.has(p)) })));
}
function fingerprint(entries) {
    const ordered = entries.map(strip).map(x => ({ ...x, allow: [...x.allow].sort(), deny: [...x.deny].sort() })).sort((a,b) => a.id.localeCompare(b.id));
    return crypto.createHash('sha256').update(JSON.stringify(ordered)).digest('hex');
}
function compute(current, incoming, mode) {
    const map = new Map((mode === 'replace-all' ? [] : current).map(item => [item.id, { ...item, allow: [...item.allow], deny: [...item.deny] }]));
    for (const item of incoming) {
        if (mode === 'merge' && map.has(item.id)) {
            const prev = map.get(item.id);
            if (prev.type !== item.type) throw err(400, 'El rol o usuario no coincide con el tipo de destino.');
            const allow = new Set(prev.allow), deny = new Set(prev.deny);
            for (const name of [...item.allow, ...item.deny, ...(item.clear || [])]) { allow.delete(name); deny.delete(name); }
            item.allow.forEach(name => allow.add(name));
            item.deny.forEach(name => deny.add(name));
            map.set(item.id, { id: item.id, type: item.type, allow: [...allow].sort(), deny: [...deny].sort() });
        } else {
            map.set(item.id, strip(item));
        }
    }
    // In replace-all an empty array explicitly clears all overwrites.
    return [...map.values()].filter(item => item.allow.length || item.deny.length).sort((a,b) => a.id.localeCompare(b.id));
}
function diff(current, proposed) {
    const old = new Map(current.map(x => [x.id, JSON.stringify(strip(x))]));
    const next = new Map(proposed.map(x => [x.id, JSON.stringify(strip(x))]));
    return {
        added: [...next.keys()].filter(id => !old.has(id)),
        removed: [...old.keys()].filter(id => !next.has(id)),
        changed: [...next.keys()].filter(id => old.has(id) && old.get(id) !== next.get(id)),
    };
}
function readStore() {
    try {
        if (!fs.existsSync(STORE)) return {};
        const value = JSON.parse(fs.readFileSync(STORE, 'utf8'));
        return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (e) { throw err(500, `No se puede leer el almacén de plantillas: ${e.message}`); }
}
function saveStore(store) {
    fs.mkdirSync(path.dirname(STORE), { recursive: true, mode: 0o700 });
    const temporary = STORE + '.tmp';
    fs.writeFileSync(temporary, JSON.stringify(store, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, STORE);
}
async function checkIdentity(guild, entry) {
    if (entry.type === 0) {
        if (entry.id === guild.id) return;
        const role = guild.roles.cache.get(entry.id) || await guild.roles.fetch(entry.id).catch(() => null);
        if (!role) throw err(400, `El rol ${entry.id} no existe en el servidor.`);
        // Channel permission overwrites are NOT edits to the guild role itself.
        // Discord's role hierarchy and managed-role restrictions apply to role
        // editing/assignment, not to channel-level permission overwrites.
        // Keep hierarchy checks in api.js safeRole() for actual role changes.
    } else {
        const member = await guild.members.fetch(entry.id).catch(() => null);
        if (!member) throw err(400, `El usuario ${entry.id} no es miembro del servidor.`);
    }
}
function readTemplateList(guild) {
    const stored = readStore()[guild.id] || [];
    const matches = guild.roles.cache.map(r => r).filter(r => ['comprador', 'compradores'].includes(r.name.toLowerCase()));
    // Never guess which role to grant access to if names are duplicated.
    const comprador = matches.length === 1 ? matches[0] : null;
    const builtIn = {
        id: 'builtin-buyers', guildId: guild.id, name: 'Canal privado para compradores', builtIn: true,
        missingRole: !comprador, ambiguousRole: matches.length > 1, overwrittenRoleName: 'Comprador',
        overwrites: comprador ? [
            { id: guild.id, type: 0, allow: [], deny: ['ViewChannel'] },
            { id: comprador.id, type: 0, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'], deny: [] }
        ] : []
    };
    return [builtIn, ...stored];
}
function registerPermissionWorkspace(app, deps) {
    const { auth, getGuild, audit } = deps;
    const safeRoute = handler => async (req, res) => {
        try { await handler(req, res); }
        catch (e) { res.status(e.status || 500).json({ error: e.status ? e.message : 'Error al procesar la operación de permisos.' }); if (!e.status) console.error('[PermissionCenter/workspace]', e); }
    };
    async function guildFor(req, res, changes = false) {
        // Overwrite modifications require ManageRoles; also retain ManageChannels guard.
        const guild = await getGuild(req, res, changes ? FLAGS.ManageRoles : FLAGS.ViewChannel);
        if (!guild) return null;
        if (changes && !guild.members.me.permissions.has(FLAGS.ManageChannels)) {
            res.status(403).json({ error: 'El bot necesita ManageChannels y ManageRoles para esta operación.' }); return null;
        }
        await Promise.all([guild.roles.fetch(), guild.channels.fetch()]);
        return guild;
    }
    async function plan(req, res, guild, requireExpected) {
        const b = req.body || {};
        if (!['merge', 'replace-selected', 'replace-all'].includes(b.mode)) throw err(400, 'El modo debe ser combinar, reemplazar seleccionados o reemplazar todo.');
        if (!Array.isArray(b.targetChannelIds) || !b.targetChannelIds.length || b.targetChannelIds.length > MAX_TARGETS || new Set(b.targetChannelIds).size !== b.targetChannelIds.length)
            throw err(400, `Selecciona entre 1 y ${MAX_TARGETS} canales diferentes.`);
        const template = b.templateId ? readTemplateList(guild).find(t => t.id === b.templateId) : null;
        if (b.templateId && !template) throw err(404, 'Plantilla no encontrada en este servidor.');
        if (template?.missingRole) throw err(400, template.ambiguousRole ? 'Hay varios roles llamados Comprador/Compradores. Cambia sus nombres o guarda una plantilla con el rol exacto.' : 'Crea un rol llamado Comprador o Compradores antes de usar esta plantilla.');
        const incoming = validatedEntries(template ? template.overwrites : b.overwrites);
        if (b.mode !== 'replace-all' && !incoming.length) throw err(400, 'Selecciona algún permiso para aplicar.');
        // Validate all roles/users in selected guild BEFORE any mutation.
        await Promise.all(incoming.map(entry => checkIdentity(guild, entry)));
        const results = [];
        for (const id of b.targetChannelIds) {
            if (typeof id !== 'string' || !SNOWFLAKE.test(id)) throw err(400, 'ID de canal no válido.');
            const channel = await guild.channels.fetch(id).catch(() => null);
            if (!channel || !channel.permissionOverwrites || !channel.manageable || channel.type === ChannelType.PublicThread || channel.type === ChannelType.PrivateThread || channel.type === ChannelType.AnnouncementThread)
                throw err(403, `El canal ${id} no puede administrarse desde Permission Center.`);
            const current = fromChannel(channel);
            // Preserve existing unsupported/unknown bits: deny destructive overwrites when unknown bits exist.
            if (channel.permissionOverwrites.cache.some(ow => ow.allow.toArray().some(x => !CHANNEL_SET.has(x)) || ow.deny.toArray().some(x => !CHANNEL_SET.has(x))))
                throw err(409, `El canal ${channel.name} contiene permisos que esta versión aún no reconoce. Actualiza Discord.js antes de editarlo.`);
            const next = compute(current, incoming, b.mode);
            const actualHash = fingerprint(current);
            if (requireExpected && (!b.expected || b.expected[id] !== actualHash))
                throw err(409, `Los permisos de ${channel.name} cambiaron desde la vista previa. Actualiza antes de aplicar.`);
            const changes = diff(current, next);
            results.push({ id, name: channel.name, before: current.length, after: next.length, changes,
                changed: Boolean(changes.added.length || changes.removed.length || changes.changed.length),
                hash: actualHash, next });
        }
        return results;
    }
    app.get('/api/permission-center/:guildId/recovery/status', auth, safeRoute(async (req, res) => {
        const guild = await guildFor(req, res); if (!guild) return;
        const profile = require('./recovery').findProfile(guild.id);
        res.json({ exists:Boolean(profile), sourceGuildId:guild.id, updatedAt:profile?.updatedAt || null,
            channels:profile?.channels?.length || 0, roles:profile?.roles?.length || 0 });
    }));
    app.post('/api/permission-center/:guildId/recovery/capture', auth, safeRoute(async (req, res) => {
        const guild = await guildFor(req, res, true); if (!guild) return;
        const recovery = require('./recovery').captureProfile(guild);
        await audit('guardar perfil de recuperación', guild, `${recovery.saved} canales estáticos; ${recovery.protected} protegidos`);
        res.json({ ok:true, recovery });
    }));
    app.get('/api/permission-center/:guildId/members', auth, safeRoute(async (req, res) => {
        const guild = await guildFor(req, res); if (!guild) return;
        const query = String(req.query.query || '').trim();
        if (!query || query.length > 80) throw err(400, 'Escribe un nombre o ID de usuario válido.');
        let members;
        if (SNOWFLAKE.test(query)) {
            const member = await guild.members.fetch(query).catch(() => null);
            members = member ? [member] : [];
        } else {
            const found = await guild.members.search({ query, limit: 20 }).catch(() => null);
            if (!found) throw err(503, 'Discord no permite buscar miembros con la configuración actual. Introduce su ID.');
            members = [...found.values()];
        }
        res.json({ members: members.map(m => ({ id: m.id, name: m.displayName, user: m.user.username })) });
    }));
    app.get('/api/permission-center/:guildId/templates', auth, safeRoute(async (req, res) => {
        const guild = await guildFor(req, res); if (!guild) return;
        res.json({ templates: readTemplateList(guild) });
    }));
    app.post('/api/permission-center/:guildId/templates', auth, safeRoute(async (req, res) => {
        const guild = await guildFor(req, res, true); if (!guild) return;
        const { name, overwrites } = req.body || {};
        if (typeof name !== 'string' || !name.trim() || name.trim().length > 70) throw err(400, 'El nombre debe tener entre 1 y 70 caracteres.');
        const checked = validatedEntries(overwrites).map(strip);
        if (!checked.length) throw err(400, 'No se puede guardar una plantilla vacía.');
        await Promise.all(checked.map(entry => checkIdentity(guild, entry)));
        const store = readStore(); const list = store[guild.id] || [];
        if (list.length >= MAX_TEMPLATES) throw err(400, 'Se alcanzó el límite de plantillas para este servidor.');
        const template = { id: crypto.randomUUID(), guildId: guild.id, name: name.trim(), overwrittenRoleName: null, overwrites: checked, createdAt: new Date().toISOString() };
        store[guild.id] = [...list, template]; saveStore(store);
        await audit('guardar plantilla', guild, template.name);
        res.status(201).json({ template });
    }));
    app.patch('/api/permission-center/:guildId/templates/:templateId', auth, safeRoute(async (req, res) => {
        const guild = await guildFor(req, res, true); if (!guild) return;
        const { name } = req.body || {};
        if (typeof name !== 'string' || !name.trim() || name.trim().length > 70) throw err(400, 'Nombre de plantilla no válido.');
        const store = readStore(), list = store[guild.id] || [];
        const t = list.find(x => x.id === req.params.templateId);
        if (!t) throw err(404, 'Plantilla no encontrada o predeterminada.');
        t.name = name.trim(); saveStore(store);
        await audit('renombrar plantilla', guild, t.name);
        res.json({ template: t });
    }));
    app.delete('/api/permission-center/:guildId/templates/:templateId', auth, safeRoute(async (req, res) => {
        const guild = await guildFor(req, res, true); if (!guild) return;
        const store = readStore(), list = store[guild.id] || [];
        if (!list.some(x => x.id === req.params.templateId)) throw err(404, 'Plantilla no encontrada o predeterminada.');
        store[guild.id] = list.filter(x => x.id !== req.params.templateId); saveStore(store);
        await audit('eliminar plantilla', guild, req.params.templateId);
        res.json({ ok: true });
    }));
    app.post('/api/permission-center/:guildId/permissions/preview', auth, safeRoute(async (req, res) => {
        const guild = await guildFor(req, res, true); if (!guild) return;
        const items = await plan(req, res, guild, false);
        res.json({ targets: items, mode: req.body.mode, warning: 'Los permisos Administrator y las jerarquías de Discord pueden alterar la visibilidad efectiva. Esta vista previa no modifica Discord.' });
    }));
    app.post('/api/permission-center/:guildId/permissions/apply', auth, safeRoute(async (req, res) => {
        const guild = await guildFor(req, res, true); if (!guild) return;
        if (req.body?.confirm !== 'APLICAR') throw err(400, 'Debes confirmar expresamente el guardado.');
        const items = await plan(req, res, guild, true);
        const results = [];
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item.changed) { results.push({ id: item.id, ok: true, skipped: true }); continue; }
            try {
                // Compare again immediately before each write. Discord does not support cross-channel transactions.
                const channel = await guild.channels.fetch(item.id);
                if (fingerprint(fromChannel(channel)) !== item.hash) throw err(409, 'Los permisos cambiaron durante la aplicación.');
                await channel.permissionOverwrites.set(item.next.map(strip), 'KYVEN Permission Center: cambio confirmado');
                await audit('aplicar permisos', guild, `${channel.name} (${channel.id}); modo=${req.body.mode}`);
                results.push({ id: item.id, ok: true });
            } catch (e) {
                results.push({ id: item.id, ok: false, error: e.message || 'Discord rechazó la operación.' });
                // Stop after first error, and report explicitly every unattempted channel.
                for (const pending of items.slice(i + 1))
                    results.push({ id: pending.id, ok: false, skipped: true, error: 'No ejecutado tras un error anterior.' });
                break;
            }
        }
        // Keep the recovery profile in sync with successfully applied dashboard
        // edits. This captures ALL static channels (not ticket/cart channels) so
        // the old baseline plus later web changes can be transplanted together.
        let recovery = null, recoveryError = null;
        if (results.some(r => r.ok)) {
            try {
                await guild.channels.fetch();
                recovery = require('./recovery').captureProfile(guild);
                await audit('actualizar perfil de recuperación', guild, `${recovery.saved} canales estáticos`);
            } catch (error) {
                recoveryError = 'Discord guardó los permisos, pero NO se actualizó el perfil de recuperación: ' + error.message;
                console.error('[PermissionCenter/recovery]', error);
            }
        }
        res.status(results.some(r => !r.ok) ? 207 : 200).json({
            results, partial: results.some(r => !r.ok), recovery, recoveryError,
            message: 'La operación no es transaccional entre varios canales. Revisa los resultados.'
        });
    }));
}

module.exports = { registerPermissionWorkspace, compute, diff, fingerprint, validatedEntries, CHANNEL_PERMISSIONS };
