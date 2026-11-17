'use strict';

const fs = require('fs');
const path = require('path');

// Contador real filtrado por IP y guardado en archivo
const viewsFilePath = path.join(__dirname, '..', '..', 'catruu-views.json');
let ipsVistas = new Set();

try {
    if (fs.existsSync(viewsFilePath)) {
        const saved = JSON.parse(fs.readFileSync(viewsFilePath, 'utf8'));
        if (Array.isArray(saved)) ipsVistas = new Set(saved);
    }
} catch (e) {}

function registrarVistaPorIP(req) {
    const rawIp = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.socket?.remoteAddress || 'unknown';
    if (rawIp && !ipsVistas.has(rawIp)) {
        ipsVistas.add(rawIp);
        try {
            fs.writeFileSync(viewsFilePath, JSON.stringify([...ipsVistas]), 'utf8');
        } catch (e) {}
    }
    return ipsVistas.size;
}

// Caché de 25s para proteger Render Free manteniendo datos en tiempo real
let discordCache = { data: null, lastFetch: 0 };

function registerDashboardPage(app, dependencies = {}) {
    const { client, OWNER_ID, rootDir } = dependencies;

    app.get('/permission-center/dashboard.js', (req, res) => {
        res.sendFile(path.join(__dirname, 'permission-center', 'dashboard.js'));
    });

    app.get(['/dashboard', '/dashboard/', '/dashboard/index.html'], (req, res) => {
        let html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
        const views = {"overview":"overview.html","activity":"activity.html","restore":"restore.html","members":"verified-members.html","servers":"connected-servers.html","permissions":"permission-center.html","security":"security.html","settings":"settings.html","commands":"commands.html"};
        for (const [id, filename] of Object.entries(views)) {
            html = html.replace(`<!-- VIEW:${id} -->`, fs.readFileSync(path.join(__dirname, '..', 'pages', filename), 'utf8'));
        }
        html = html.replace('<!-- VIEW:login -->', fs.readFileSync(path.join(__dirname, '..', 'login.html'), 'utf8'));
        res.type('html').send(html);
    });

    // --- RUTA PERFIL /Catruu ---
    app.get(['/Catruu', '/catruu'], (req, res) => {
        registrarVistaPorIP(req);
        const fileRoot = rootDir || path.join(__dirname, '..', '..');
        res.sendFile(path.join(fileRoot, 'catruu.html'));
    });

    // --- API REAL DE DISCORD (Foto, Apodo, Estado) + VISTAS POR IP ---
    app.get('/api/catruu-status', async (req, res) => {
        const totalViews = registrarVistaPorIP(req);
        const now = Date.now();

        if (discordCache.data && (now - discordCache.lastFetch < 25000)) {
            return res.json({ ...discordCache.data, views: totalViews });
        }

        const targetId = (OWNER_ID || process.env.OWNER_ID || '').trim();
        let member = null;
        let userObj = null;

        try {
            if (client && client.isReady()) {
                for (const guild of client.guilds.cache.values()) {
                    // 1. Si hay OWNER_ID en .env, buscar directo por ID con presencia
                    if (targetId) {
                        member = await guild.members.fetch({ user: targetId, withPresences: true }).catch(() => null);
                    }

                    // 2. Buscar en caché por tu username 'catruuu' o apodo 'Im,Catri'
                    if (!member) {
                        member = guild.members.cache.find(m =>
                            m.user.username.toLowerCase().includes('catruu') ||
                            (m.displayName && m.displayName.toLowerCase().includes('catri')) ||
                            (m.user.globalName && m.user.globalName.toLowerCase().includes('catri'))
                        );
                    }

                    // 3. Si no estaba en caché, hacer búsqueda directa en la API del servidor
                    if (!member) {
                        const searched = await guild.members.search({ query: 'catru', limit: 5 }).catch(() => null);
                        if (searched && searched.size > 0) {
                            const found = searched.first();
                            member = await guild.members.fetch({ user: found.id, withPresences: true }).catch(() => found);
                        }
                    }

                    // 4. Respaldo: traer al dueño del servidor
                    if (!member && guild.ownerId) {
                        const owner = await guild.members.fetch({ user: guild.ownerId, withPresences: true }).catch(() => null);
                        if (owner && (owner.user.username.toLowerCase().includes('catr') || !targetId)) {
                            member = owner;
                        }
                    }

                    if (member) break;
                }

                if (!member && targetId) {
                    userObj = await client.users.fetch(targetId, { force: true }).catch(() => null);
                }
            }
        } catch (e) {
            console.error('Error leyendo usuario de Discord:', e);
        }

        if (member || userObj) {
            const u = member ? member.user : userObj;
            const presence = member?.presence;
            const status = presence?.status || 'dnd';

            const customStatus = presence?.activities?.find(a => a.type === 4);
            const playingActivity = presence?.activities?.find(a => a.type !== 4);

            let activityText = 'currently doing nothing';
            if (playingActivity) {
                activityText = `${playingActivity.name}${playingActivity.details ? ` - ${playingActivity.details}` : ''}`;
            } else if (customStatus && customStatus.state) {
                activityText = customStatus.state;
            }

            discordCache = {
                lastFetch: now,
                data: {
                    username: u.username,
                    displayName: member?.displayName || u.globalName || u.username,
                    avatar: u.displayAvatarURL({ size: 256 }),
                    status: status,
                    activity: activityText
                }
            };
            return res.json({ ...discordCache.data, views: totalViews });
        }

        res.json({
            username: 'catruuu',
            displayName: 'Im,Catri',
            avatar: 'https://files.catbox.moe/xobhu9.png',
            status: 'dnd',
            activity: 'currently doing nothing',
            views: totalViews
        });
    });
}

module.exports = { registerDashboardPage };