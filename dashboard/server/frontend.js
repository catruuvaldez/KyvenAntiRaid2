'use strict';

const fs = require('fs');
const path = require('path');

// Contador real filtrado por IP y guardado en archivo para no perderse
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

// Caché de 30s para proteger Render Free pero mostrar datos 100% reales
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

    // --- API REAL DE DISCORD + VISTAS POR IP ---
    app.get('/api/catruu-status', async (req, res) => {
        const totalViews = registrarVistaPorIP(req);
        const now = Date.now();

        if (discordCache.data && (now - discordCache.lastFetch < 30000)) {
            return res.json({ ...discordCache.data, views: totalViews });
        }

        const targetId = (OWNER_ID || process.env.OWNER_ID || '').trim();
        let member = null;

        try {
            if (client && client.isReady()) {
                for (const guild of client.guilds.cache.values()) {
                    // 1. Buscar por OWNER_ID si está configurado
                    if (targetId) {
                        member = guild.members.cache.get(targetId) || await guild.members.fetch({ user: targetId, withPresences: true }).catch(() => null);
                    }
                    // 2. Si no hay OWNER_ID en .env, buscar automáticamente tu usuario "catruuu" o dueño del servidor
                    if (!member) {
                        member = guild.members.cache.find(m => m.user.username.toLowerCase() === 'catruuu' || m.user.username.toLowerCase() === 'catruu');
                    }
                    if (!member && guild.ownerId) {
                        member = await guild.members.fetch({ user: guild.ownerId, withPresences: true }).catch(() => null);
                    }
                    if (member) break;
                }
            }
        } catch (e) {}

        if (member) {
            const presence = member.presence;
            const status = presence?.status || 'offline';

            // Detectar estado personalizado o juego/actividad actual
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
                    username: member.user.username,
                    globalName: member.displayName || member.user.globalName || 'Im,Catri',
                    avatar: member.user.displayAvatarURL({ extension: 'png', size: 256 }),
                    status: status,
                    activity: activityText
                }
            };
            return res.json({ ...discordCache.data, views: totalViews });
        }

        res.json({
            username: 'catruuu',
            globalName: 'Im,Catri',
            avatar: 'https://files.catbox.moe/1cv7on.png',
            status: 'dnd',
            activity: 'currently doing nothing',
            views: totalViews
        });
    });
}

module.exports = { registerDashboardPage };