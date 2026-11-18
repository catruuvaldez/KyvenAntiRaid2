'use strict';

// Catruu: backend Express + discord.js v14 + Server-Sent Events.
// Este módulo NO inicia sesión en Discord: recibe el cliente ya conectado.
// El archivo de entrada del bot debe habilitar Guilds, GuildMembers y GuildPresences.

const fs = require('fs');
const path = require('path');

const viewsFilePath = path.join(__dirname, '..', '..', 'catruu-views.json');
const uniqueIPs = new Set();
try {
    const existing = JSON.parse(fs.readFileSync(viewsFilePath, 'utf8'));
    if (Array.isArray(existing)) existing.forEach(ip => uniqueIPs.add(String(ip)));
} catch (_) { /* archivo todavía no creado */ }

function registerVisit(req) {
    const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
    if (!uniqueIPs.has(ip)) {
        uniqueIPs.add(ip);
        try { fs.writeFileSync(viewsFilePath, JSON.stringify([...uniqueIPs])); }
        catch (err) { console.warn('[Catruu] No se pudo guardar contador:', err.message); }
    }
    return uniqueIPs.size;
}

// Bit 8 = GuildPresences; bit 1 = GuildMembers (en Gateway Intents).
function hasIntent(client, flag) {
    const intents = client?.options?.intents;
    if (typeof intents?.has === 'function') return intents.has(flag);
    if (typeof intents?.bitfield === 'number') return (intents.bitfield & flag) === flag;
    if (typeof intents === 'number') return (intents & flag) === flag;
    return false;
}

function registerDashboardPage(app, dependencies = {}) {
    const { client, OWNER_ID, rootDir } = dependencies;
    let userId = String(OWNER_ID || process.env.OWNER_ID || '').trim();
    const listeners = new Set();
    const botReady = () => Boolean(client?.isReady?.());
    const membersIntent = () => hasIntent(client, 1 << 1);
    const presencesIntent = () => hasIntent(client, 1 << 8);
    const sharedGuilds = () => [...(client?.guilds?.cache?.values?.() || [])];

    let profile = null;
    let cachedUser = null;
    let cachedMember = null;
    let cachedPresence = null;
    let lastCheckAt = 0;
    let lastPresenceEventAt = null;
    let inFlight = null;
    let foundCommonServer = false;

    const makeError = (code, message) => Object.assign(new Error(message), { code });

    function userData(user, member, presence) {
        const acts = Array.isArray(presence?.activities) ? presence.activities : [];
        const active = acts.find(a => a.type !== 4);
        const custom = acts.find(a => a.type === 4);
        const activity = active
            ? [active.name, active.details].filter(Boolean).join(' - ')
            : custom?.state || 'currently doing nothing';
        const avatar = typeof user.displayAvatarURL === 'function'
            ? user.displayAvatarURL({ size: 256 })
            : user.avatarURL?.() || null;

        const flags = user.flags ? user.flags.toArray() : [];
        const hasBoost = Boolean(member?.premiumSince);
        const hasNitro = Boolean(
            user.banner ||
            (user.avatar && String(user.avatar).startsWith('a_')) ||
            user.avatarDecoration ||
            user.avatarDecorationData ||
            hasBoost ||
            true // Mantiene tu insignia de Nitro visible en tu tarjeta
        );

        return {
            userId: user.id || userId || '',
            username: user.username || 'catruuu',
            displayName: member?.displayName || user.globalName || user.username || 'Im,Catri',
            avatar,
            status: presence?.status || 'dnd',
            activity,
            hasNitro,
            hasBoost,
            flags,
            updatedAt: new Date().toISOString()
        };
    }

    function sendEvent(res, event, value) {
        try {
            res.write(`event: ${event}\ndata: ${JSON.stringify(value)}\n\n`);
            return true;
        } catch (_) {
            listeners.delete(res);
            return false;
        }
    }

    function publish() {
        if (!profile) return;
        const value = { ...profile, views: uniqueIPs.size };
        for (const res of listeners) sendEvent(res, 'profile', value);
    }

    function findPresence() {
        if (!userId) return null;
        for (const guild of sharedGuilds()) {
            const member = guild.members?.cache?.get(userId);
            const presence = guild.presences?.cache?.get(userId) || member?.presence;
            if (member && !cachedMember) cachedMember = member;
            if (presence) return presence;
        }
        return null;
    }

    function saveProfile(user, member, presence) {
        cachedUser = user || cachedUser;
        cachedMember = member || cachedMember;
        // `undefined` significa no actualizar; `null` significa presencia no disponible.
        if (presence !== undefined) cachedPresence = presence;
        if (!cachedUser) return;
        profile = userData(cachedUser, cachedMember, cachedPresence);
        lastCheckAt = Date.now();
        publish();
    }

    async function getProfile(force = false) {
        if (!client || !botReady()) {
            throw makeError('BOT_NOT_READY', 'El bot no esta conectado a Discord (client.isReady() es false).');
        }

        // Si OWNER_ID no está en .env, lo detecta automáticamente buscando tu usuario 'catruuu' / 'Im,Catri'
        if (!/^\d{15,25}$/.test(userId)) {
            for (const guild of sharedGuilds()) {
                let found = guild.members?.cache?.find(m =>
                    m.user.username.toLowerCase().includes('catruu') ||
                    (m.displayName && m.displayName.toLowerCase().includes('catri'))
                );
                if (!found && guild.members?.search) {
                    const searched = await guild.members.search({ query: 'catru', limit: 3 }).catch(() => null);
                    if (searched && searched.size > 0) found = searched.first();
                }
                if (found) {
                    userId = found.id;
                    break;
                }
            }
        }

        if (!/^\d{15,25}$/.test(userId)) {
            throw makeError('OWNER_ID_INVALID', 'Configura OWNER_ID con el ID NUMERICO de tu usuario de Discord.');
        }

        const ttl = profile?.status === 'unknown' ? 10000 : 60000;
        if (!force && profile && Date.now() - lastCheckAt < ttl) return profile;
        if (inFlight) return inFlight;

        inFlight = (async () => {
            let member = null;
            foundCommonServer = false;
            for (const guild of sharedGuilds()) {
                member = guild.members?.cache?.get(userId) || null;
                if (!member && guild.members?.fetch) {
                    try { member = await guild.members.fetch({ user: userId, withPresences: true }); }
                    catch (_) { /* el usuario no esta en ese servidor o no se pudo obtener */ }
                }
                if (!member) continue;
                foundCommonServer = true;
                const presence = guild.presences?.cache?.get(userId) || member.presence || null;
                cachedMember = member;
                if (presence) {
                    cachedPresence = presence;
                    break;
                }
            }
            if (!cachedUser) {
                cachedUser = await client.users?.fetch(userId, { force: true }).catch(() => cachedMember?.user || null);
            }
            if (!cachedUser) {
                throw makeError('USER_NOT_FOUND', 'El bot no encontro el usuario de OWNER_ID.');
            }
            if (!foundCommonServer && !findPresence()) {
                cachedPresence = null;
            } else if (!cachedPresence) {
                cachedPresence = findPresence();
            }
            saveProfile(cachedUser, cachedMember, cachedPresence);
            return profile;
        })();

        try { return await inFlight; }
        finally { inFlight = null; }
    }

    function updateFromPresence(oldPresence, newPresence) {
        if (!userId || newPresence?.userId !== userId) return;
        lastPresenceEventAt = new Date().toISOString();
        const member = newPresence.member || cachedMember || sharedGuilds()
            .map(g => g.members?.cache?.get(userId)).find(Boolean);
        const user = member?.user || newPresence.user || cachedUser || client.users?.cache?.get(userId);
        if (user) saveProfile(user, member, newPresence);
        else getProfile(true).catch(e => console.warn('[Catruu] presenceUpdate:', e.message));
    }

    if (client?.on) {
        client.on('presenceUpdate', updateFromPresence);
        client.on('userUpdate', (_oldUser, newUser) => {
            if (userId && newUser?.id === userId) saveProfile(newUser, cachedMember, undefined);
        });
        client.on('guildMemberUpdate', (_oldMember, newMember) => {
            if (userId && newMember?.id === userId) {
                saveProfile(newMember.user, newMember, newMember.presence || findPresence() || undefined);
            }
        });
        const onReady = () => getProfile(true).catch(e => console.warn('[Catruu] inicio:', e.message));
        client.on('ready', onReady);
        client.on('clientReady', onReady);
        if (botReady()) onReady();
    }

    // Se preservan las rutas originales del dashboard.
    app.get('/permission-center/dashboard.js', (_req, res) => {
        res.sendFile(path.join(__dirname, 'permission-center', 'dashboard.js'));
    });
    app.get(['/dashboard', '/dashboard/', '/dashboard/index.html'], (_req, res) => {
        let html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
        const views = {
            overview: 'overview.html', activity: 'activity.html', restore: 'restore.html',
            members: 'verified-members.html', servers: 'connected-servers.html',
            permissions: 'permission-center.html', security: 'security.html',
            settings: 'settings.html', commands: 'commands.html'
        };
        for (const [id, file] of Object.entries(views)) {
            html = html.replace(`<!-- VIEW:${id} -->`, fs.readFileSync(path.join(__dirname, '..', 'pages', file), 'utf8'));
        }
        html = html.replace('<!-- VIEW:login -->', fs.readFileSync(path.join(__dirname, '..', 'login.html'), 'utf8'));
        res.type('html').send(html);
    });
    app.get(['/Catruu', '/catruu'], (req, res) => {
        registerVisit(req);
        const fileRoot = rootDir || path.join(__dirname, '..', '..');
        res.sendFile(path.join(fileRoot, 'catruu.html'));
    });

    app.get('/api/catruu-status', async (req, res) => {
        const views = registerVisit(req);
        res.set('Cache-Control', 'no-store');
        try { res.json({ ...(await getProfile()), views }); }
        catch (e) { res.status(503).json({ error: e.message, code: e.code || 'DISCORD_ERROR', status: 'unknown', views }); }
    });

    // Diagnóstico sin exponer token ni ID numérico.
    app.get('/api/catruu-debug', (_req, res) => {
        res.set('Cache-Control', 'no-store');
        res.json({
            ownerIdConfigured: /^\d{15,25}$/.test(userId),
            botConnected: botReady(),
            guildMembersIntent: membersIntent(),
            guildPresencesIntent: presencesIntent(),
            commonServerMemberFound: foundCommonServer || Boolean(cachedMember),
            presenceAvailable: Boolean(cachedPresence),
            lastPresenceEventAt,
            lastProfileUpdateAt: profile?.updatedAt || null,
            status: profile?.status || 'unknown',
            hint: !userId ? 'Configura OWNER_ID'
                : !botReady() ? 'Revisa el inicio de sesion del bot'
                : !presencesIntent() ? 'Activa GuildPresences en el codigo y Presence Intent en Discord Developer Portal'
                : !foundCommonServer && !cachedMember ? 'Asegurate de estar en un servidor compartido con el bot'
                : !cachedPresence ? 'Discord aun no envio tu presencia; comprueba el intent y vuelve a cambiar el estado'
                : 'Eventos de Discord disponibles'
        });
    });

    app.get('/api/catruu-events', async (req, res) => {
        registerVisit(req);
        res.status(200);
        res.set({
            'Content-Type': 'text/event-stream; charset=utf-8',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no'
        });
        res.flushHeaders?.();
        res.write(': connected\n\n');
        listeners.add(res);

        const heartbeat = setInterval(() => {
            if (!sendEvent(res, 'ping', { ts: Date.now() })) clearInterval(heartbeat);
        }, 15000);
        req.on('close', () => {
            clearInterval(heartbeat);
            listeners.delete(res);
        });

        try { sendEvent(res, 'profile', { ...(await getProfile()), views: uniqueIPs.size }); }
        catch (e) { sendEvent(res, 'server-error', { error: e.message, code: e.code || 'DISCORD_ERROR' }); }
    });
}

module.exports = { registerDashboardPage };