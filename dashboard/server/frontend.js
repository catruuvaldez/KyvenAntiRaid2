'use strict';

const fs = require('fs');
const path = require('path');

function registerDashboardPage(app) {
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
}

module.exports = { registerDashboardPage };
