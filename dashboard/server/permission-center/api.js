'use strict';

const crypto = require('crypto');

function registerPermissionCenterApi(app, deps) {
    const { client, validarSesionToken, sesionesActivas, SystemActivity } = deps;
    const rate = new Map();
    const FLAGS = require('discord.js').PermissionFlagsBits;
    const FLAG_NAMES = Object.keys(FLAGS).filter(k => typeof FLAGS[k] === 'bigint');
    const FLAG_SET = new Set(FLAG_NAMES);

    function readCookie(req, name) {
        const raw = String(req.headers.cookie || '');
        for (const part of raw.split(';')) {
            const i = part.indexOf('=');
            if (i < 0) continue;
            if (part.slice(0, i).trim() === name) {
                try { return decodeURIComponent(part.slice(i + 1).trim()); } catch (_) { return ''; }
            }
        }
        return '';
    }

    function auth(req, res, next) {
        if (process.env.PERMISSION_CENTER_ENABLED !== 'true') {
            return res.status(503).json({ error: 'Permission Center está desactivado. Configura PERMISSION_CENTER_ENABLED=true después de revisar la instalación.' });
        }
        const token = readCookie(req, 'kyven_admin');
        if (!token || !validarSesionToken(token)) return res.status(401).json({ error: 'Sesión administrativa no válida.' });
        const session = sesionesActivas.get(token);
        if (!session || Date.now() > session.expiresAt) return res.status(401).json({ error: 'Sesión expirada.' });

        // Rechaza peticiones cross-origin cuando el navegador envía Origin.
        if (req.headers.origin) {
            let origin;
            try { origin = new URL(req.headers.origin); } catch (_) { return res.status(403).json({ error: 'Origen no permitido.' }); }
            if (origin.host !== req.headers.host) return res.status(403).json({ error: 'Origen no permitido.' });
        }
        const key = `${session.ip || 'admin'}:${req.path}`;
        const now = Date.now();
        const item = rate.get(key) || { start: now, count: 0 };
        if (now - item.start > 60_000) { item.start = now; item.count = 0; }
        item.count += 1;
        rate.set(key, item);
        if (item.count > 90) return res.status(429).json({ error: 'Demasiadas solicitudes. Espera un minuto.' });
        req.kyvenAdmin = session;
        next();
    }

    async function getGuild(req, res, permission) {
        if (!client || !client.isReady()) {
            res.status(503).json({ error: 'El bot Discord todavía no está listo.' });
            return null;
        }
        const guildId = String(req.params.guildId || '');
        if (!/^\d{17,20}$/.test(guildId)) {
            res.status(400).json({ error: 'ID de servidor no válido.' });
            return null;
        }
        const allowed = String(process.env.PERMISSION_CENTER_GUILD_IDS || '').split(',').map(x => x.trim()).filter(Boolean);
        if (allowed.length && !allowed.includes(guildId)) {
            res.status(403).json({ error: 'Este servidor no está habilitado para Permission Center.' });
            return null;
        }
        const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
        if (!guild) { res.status(404).json({ error: 'Servidor no encontrado o el bot no está dentro.' }); return null; }
        const me = guild.members.me || await guild.members.fetchMe().catch(() => null);
        if (!me || !me.permissions.has(permission)) {
            res.status(403).json({ error: `El bot necesita el permiso ${permission} en este servidor.` });
            return null;
        }
        return guild;
    }

    function safeRole(guild, role, res) {
        const me = guild.members.me;
        if (!role || role.id === guild.id || role.managed) {
            res.status(400).json({ error: 'Ese rol no existe o está administrado por una integración.' }); return false;
        }
        if (!me || role.position >= me.roles.highest.position) {
            res.status(403).json({ error: 'El rol está por encima o al mismo nivel que el rol más alto del bot.' }); return false;
        }
        return true;
    }

    function validFlags(list) {
        return Array.isArray(list) && list.length <= FLAG_NAMES.length && list.every(x => typeof x === 'string' && FLAG_SET.has(x));
    }

    async function syncRecovery(guild) {
        try {
            await Promise.all([guild.roles.fetch(), guild.channels.fetch()]);
            return { recovery: require('./recovery').captureProfile(guild) };
        } catch (error) {
            console.error('[PermissionCenter/recovery]', error);
            return { recoveryError: 'La operación se guardó en Discord, pero el perfil de recuperación NO pudo actualizarse: ' + error.message };
        }
    }

    async function audit(action, guild, detail) {
        try {
            if (SystemActivity) await SystemActivity.create({
                type: 'permission_center',
                severity: 'warning',
                description: `Permission Center: ${action}`,
                meta: JSON.stringify({ guildId: guild.id, guildName: guild.name, detail: String(detail || '').slice(0, 500) }),
                timestamp: new Date().toISOString()
            });
        } catch (e) { console.error('[PermissionCenter] No se pudo guardar auditoría:', e.message); }
    }

    app.get('/api/permission-center/guilds', auth, async (req, res) => {
        if (!client || !client.isReady()) return res.status(503).json({ error: 'Bot no disponible.' });
        const allow = String(process.env.PERMISSION_CENTER_GUILD_IDS || '').split(',').map(x => x.trim()).filter(Boolean);
        const guilds = client.guilds.cache
            .filter(g => !allow.length || allow.includes(g.id))
            .map(g => ({
                id: g.id, name: g.name, icon: g.iconURL({ size: 64 }),
                canManageRoles: Boolean(g.members.me && g.members.me.permissions.has(FLAGS.ManageRoles)),
                canManageChannels: Boolean(g.members.me && g.members.me.permissions.has(FLAGS.ManageChannels))
            }));
        res.json({ guilds });
    });

    app.get('/api/permission-center/:guildId', auth, async (req, res) => {
        try {
            const guild = await getGuild(req, res, FLAGS.ViewChannel);
            if (!guild) return;
            await Promise.all([guild.roles.fetch(), guild.channels.fetch()]);
            const me = guild.members.me;
            res.json({
                guild: { id: guild.id, name: guild.name, ownerId: guild.ownerId },
                bot: {
                    highestRolePosition: me.roles.highest.position,
                    canManageRoles: me.permissions.has(FLAGS.ManageRoles),
                    canManageChannels: me.permissions.has(FLAGS.ManageChannels)
                },
                permissions: FLAG_NAMES,
                channelPermissions: require('./workspace').CHANNEL_PERMISSIONS,
                roles: guild.roles.cache.sort((a,b) => b.position - a.position).map(r => ({
                    id: r.id, name: r.name, color: r.hexColor, position: r.position,
                    managed: r.managed, hoist: r.hoist, mentionable: r.mentionable,
                    permissions: r.permissions.toArray()
                })),
                channels: guild.channels.cache.sort((a,b) => (a.rawPosition || 0) - (b.rawPosition || 0)).map(c => ({
                    id: c.id, name: c.name, type: c.type, parentId: c.parentId || null,
                    position: c.rawPosition || 0, topic: c.topic || '', permissionsLocked: c.permissionsLocked ?? null,
                    nsfw: Boolean(c.nsfw), rateLimitPerUser: c.rateLimitPerUser ?? null,
                    userLimit: c.userLimit ?? null, bitrate: c.bitrate ?? null,
                    overwrites: c.permissionOverwrites.cache.map(o => ({
                        id: o.id, type: o.type, allow: o.allow.toArray(), deny: o.deny.toArray()
                    }))
                }))
            });
        } catch (e) {
            console.error('[PermissionCenter] snapshot:', e);
            res.status(500).json({ error: 'No se pudo cargar la configuración del servidor.' });
        }
    });

    app.post('/api/permission-center/:guildId/roles', auth, async (req, res) => {
        try {
            const guild = await getGuild(req, res, FLAGS.ManageRoles); if (!guild) return;
            const { name, color, permissions = [] } = req.body || {};
            if (typeof name !== 'string' || !name.trim() || name.length > 100 || !validFlags(permissions))
                return res.status(400).json({ error: 'Nombre o permisos no válidos.' });
            if (permissions.includes('Administrator') && process.env.PERMISSION_CENTER_ALLOW_ADMINISTRATOR !== 'true')
                return res.status(403).json({ error: 'Crear roles con Administrator está bloqueado. Requiere PERMISSION_CENTER_ALLOW_ADMINISTRATOR=true.' });
            const role = await guild.roles.create({ name: name.trim(), color: /^#[0-9a-fA-F]{6}$/.test(color || '') ? color : undefined, permissions });
            await audit('crear rol', guild, `${role.name} (${role.id})`);
            res.json({ ok: true, id: role.id, ...(await syncRecovery(guild)) });
        } catch (e) { res.status(400).json({ error: e.message || 'No se pudo crear el rol.' }); }
    });

    app.patch('/api/permission-center/:guildId/roles/:roleId', auth, async (req, res) => {
        try {
            const guild = await getGuild(req, res, FLAGS.ManageRoles); if (!guild) return;
            const role = await guild.roles.fetch(req.params.roleId).catch(() => null);
            if (!safeRole(guild, role, res)) return;
            const body = req.body || {}, edit = {};
            if (body.name !== undefined) {
                if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 100) return res.status(400).json({ error: 'Nombre no válido.' });
                edit.name = body.name.trim();
            }
            if (body.color !== undefined) {
                if (typeof body.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(body.color)) return res.status(400).json({ error: 'Color no válido.' });
                edit.color = body.color;
            }
            if (body.permissions !== undefined) {
                if (!validFlags(body.permissions)) return res.status(400).json({ error: 'Lista de permisos no válida.' });
                if (body.permissions.includes('Administrator') && process.env.PERMISSION_CENTER_ALLOW_ADMINISTRATOR !== 'true')
                    return res.status(403).json({ error: 'Conceder Administrator está bloqueado. Requiere PERMISSION_CENTER_ALLOW_ADMINISTRATOR=true.' });
                edit.permissions = body.permissions;
            }
            if (body.hoist !== undefined) edit.hoist = Boolean(body.hoist);
            if (body.mentionable !== undefined) edit.mentionable = Boolean(body.mentionable);
            if (!Object.keys(edit).length) return res.status(400).json({ error: 'No hay cambios.' });
            await role.edit(edit);
            await audit('editar rol', guild, `${role.name} (${role.id})`);
            res.json({ ok: true, ...(await syncRecovery(guild)) });
        } catch (e) { res.status(400).json({ error: e.message || 'No se pudo editar el rol.' }); }
    });

    app.delete('/api/permission-center/:guildId/roles/:roleId', auth, async (req, res) => {
        try {
            const guild = await getGuild(req, res, FLAGS.ManageRoles); if (!guild) return;
            const role = await guild.roles.fetch(req.params.roleId).catch(() => null);
            if (!safeRole(guild, role, res)) return;
            const label = role.name; await role.delete('Permission Center: eliminación confirmada');
            await audit('eliminar rol', guild, label);
            res.json({ ok: true, ...(await syncRecovery(guild)) });
        } catch (e) { res.status(400).json({ error: e.message || 'No se pudo eliminar el rol.' }); }
    });

    app.post('/api/permission-center/:guildId/channels', auth, async (req, res) => {
        try {
            const guild = await getGuild(req, res, FLAGS.ManageChannels); if (!guild) return;
            const { name, type = 'text', parentId, topic } = req.body || {};
            if (typeof name !== 'string' || !/^[\w\-áéíóúñ ]{1,100}$/i.test(name)) return res.status(400).json({ error: 'Nombre de canal no válido.' });
            const Types = require('discord.js').ChannelType;
            const channelType = type === 'category' ? Types.GuildCategory : type === 'voice' ? Types.GuildVoice : Types.GuildText;
            if (parentId && (!guild.channels.cache.has(parentId) || guild.channels.cache.get(parentId).type !== Types.GuildCategory)) return res.status(400).json({ error: 'Categoría no válida.' });
            const channel = await guild.channels.create({ name: name.trim(), type: channelType, parent: channelType === Types.GuildCategory ? undefined : (parentId || undefined), topic: channelType === Types.GuildText ? String(topic || '').slice(0, 1024) : undefined });
            await audit('crear canal/categoría', guild, `${channel.name} (${channel.id})`);
            res.json({ ok: true, id: channel.id, ...(await syncRecovery(guild)) });
        } catch (e) { res.status(400).json({ error: e.message || 'No se pudo crear el canal.' }); }
    });

    app.patch('/api/permission-center/:guildId/channels/:channelId', auth, async (req, res) => {
        try {
            const guild = await getGuild(req, res, FLAGS.ManageChannels); if (!guild) return;
            const channel = await guild.channels.fetch(req.params.channelId).catch(() => null);
            if (!channel || !channel.manageable) return res.status(403).json({ error: 'Canal no disponible o no administrable por el bot.' });
            const b = req.body || {}, edit = {};
            if (b.name !== undefined) {
                if (typeof b.name !== 'string' || !/^[\w\-áéíóúñ ]{1,100}$/i.test(b.name)) return res.status(400).json({ error: 'Nombre no válido.' });
                edit.name = b.name.trim();
            }
            if (b.topic !== undefined && 'topic' in channel) {
                if (typeof b.topic !== 'string' || b.topic.length > 1024) return res.status(400).json({ error: 'Tema del canal no válido.' });
                edit.topic = b.topic;
            }
            if (b.nsfw !== undefined) {
                if (typeof b.nsfw !== 'boolean' || !('nsfw' in channel)) return res.status(400).json({ error: 'NSFW no es compatible con este canal.' });
                edit.nsfw = b.nsfw;
            }
            if (b.rateLimitPerUser !== undefined) {
                if (!Number.isInteger(b.rateLimitPerUser) || b.rateLimitPerUser < 0 || b.rateLimitPerUser > 21600 || !('rateLimitPerUser' in channel))
                    return res.status(400).json({ error: 'Modo lento no válido para este canal.' });
                edit.rateLimitPerUser = b.rateLimitPerUser;
            }
            if (b.userLimit !== undefined) {
                if (!Number.isInteger(b.userLimit) || b.userLimit < 0 || b.userLimit > 99 || !('userLimit' in channel))
                    return res.status(400).json({ error: 'Límite de usuarios no válido para este canal.' });
                edit.userLimit = b.userLimit;
            }
            if (b.bitrate !== undefined) {
                if (!Number.isInteger(b.bitrate) || b.bitrate < 8000 || b.bitrate > 384000 || !('bitrate' in channel))
                    return res.status(400).json({ error: 'Bitrate no válido para este canal.' });
                edit.bitrate = b.bitrate;
            }
            if (b.parentId !== undefined) {
                if (b.parentId && (!guild.channels.cache.has(b.parentId) || guild.channels.cache.get(b.parentId).type !== require('discord.js').ChannelType.GuildCategory)) return res.status(400).json({ error: 'Categoría no válida.' });
                edit.parent = b.parentId || null;
            }
            if (!Object.keys(edit).length) return res.status(400).json({ error: 'No hay cambios.' });
            await channel.edit(edit);
            await audit('editar canal', guild, `${channel.name} (${channel.id})`);
            res.json({ ok: true, ...(await syncRecovery(guild)) });
        } catch (e) { res.status(400).json({ error: e.message || 'No se pudo editar el canal.' }); }
    });

    app.delete('/api/permission-center/:guildId/channels/:channelId', auth, async (req, res) => {
        try {
            const guild = await getGuild(req, res, FLAGS.ManageChannels); if (!guild) return;
            const channel = await guild.channels.fetch(req.params.channelId).catch(() => null);
            if (!channel || !channel.deletable) return res.status(403).json({ error: 'Canal no eliminable por el bot.' });
            const label = channel.name; await channel.delete('Permission Center: eliminación confirmada');
            await audit('eliminar canal', guild, label);
            res.json({ ok: true, ...(await syncRecovery(guild)) });
        } catch (e) { res.status(400).json({ error: e.message || 'No se pudo eliminar el canal.' }); }
    });

    // New copy/paste, template and batch-preview endpoints. Existing routes are preserved.
    require('./workspace').registerPermissionWorkspace(app, { auth, getGuild, audit });

    app.put('/api/permission-center/:guildId/channels/:channelId/permissions', auth, async (req, res) => {
        try {
            const guild = await getGuild(req, res, FLAGS.ManageChannels); if (!guild) return;
            const channel = await guild.channels.fetch(req.params.channelId).catch(() => null);
            if (!channel || !channel.manageable) return res.status(403).json({ error: 'Canal no administrable.' });
            const { roleId, allow = [], deny = [] } = req.body || {};
            const role = await guild.roles.fetch(roleId).catch(() => null);
            if (!role || !validFlags(allow) || !validFlags(deny)) return res.status(400).json({ error: 'Rol o permisos no válidos.' });
            if (allow.some(x => deny.includes(x))) return res.status(400).json({ error: 'Un permiso no puede estar permitido y denegado a la vez.' });
            await channel.permissionOverwrites.edit(role, {
                ...Object.fromEntries(allow.map(x => [x, true])),
                ...Object.fromEntries(deny.map(x => [x, false]))
            });
            await audit('editar permisos de canal', guild, `${channel.name}; rol ${role.name}`);
            let recovery = null, recoveryError = null;
            try {
                await guild.channels.fetch();
                recovery = require('./recovery').captureProfile(guild);
            } catch (e) { recoveryError = 'Permisos aplicados, pero falló la sincronización del respaldo: ' + e.message; console.error('[PermissionCenter/recovery]',e); }
            res.json({ ok: true, recovery, recoveryError });
        } catch (e) { res.status(400).json({ error: e.message || 'No se pudieron guardar los permisos.' }); }
    });
}

module.exports = { registerPermissionCenterApi };
