'use strict';

const fs = require('fs');
const path = require('path');

let visitasCatruu = 240;

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

    // --- RUTA PERFIL /Catruu (Estilo guns.lol) ---
    app.get(['/Catruu', '/catruu'], (req, res) => {
        visitasCatruu++;
        const fileRoot = rootDir || path.join(__dirname, '..', '..');
        res.sendFile(path.join(fileRoot, 'catruu.html'));
    });

    // --- API ULTRA LIGERA DE ESTADO DE DISCORD (0 llamadas de red) ---
    app.get('/api/catruu-status', (req, res) => {
        const targetId = OWNER_ID || process.env.OWNER_ID || '';
        let member = null;

        if (client && client.guilds && targetId) {
            for (const guild of client.guilds.cache.values()) {
                member = guild.members.cache.get(targetId);
                if (member) break;
            }
        }

        if (!member) {
            const user = targetId ? client?.users?.cache?.get(targetId) : null;
            return res.json({
                username: user ? user.username : 'catruu',
                avatar: user ? user.displayAvatarURL({ extension: 'png', size: 256 }) : 'https://cdn.discordapp.com/embed/avatars/0.png',
                status: 'dnd',
                activity: 'currently doing nothing',
                views: visitasCatruu
            });
        }

        const status = member.presence?.status || 'dnd';
        const customActivity = member.presence?.activities?.find(a => a.type !== 4);

        res.json({
            username: member.user.username,
            avatar: member.user.displayAvatarURL({ extension: 'png', size: 256 }),
            status: status,
            activity: customActivity ? customActivity.name : 'currently doing nothing',
            views: visitasCatruu
        });
    });
}

module.exports = { registerDashboardPage };