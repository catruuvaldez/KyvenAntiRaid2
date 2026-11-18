'use strict';

// Guardar como dashboard/server.js (NO como index.js en la raiz).
const express = require('express');
const { registerApiRoutes } = require('./api');
const { registerDashboardPage } = require('./frontend');

function startDashboardServer(dependencies) {
    const app = express();
    const PORT = process.env.PORT || 3000;

    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));

    registerApiRoutes(app, dependencies);

    // CORRECCION CRITICA: sin `dependencies` la web nunca recibe el bot.
    registerDashboardPage(app, dependencies);

    // Registrar las rutas antes de los archivos estaticos para priorizar
    // las paginas renderizadas por el dashboard.
    app.use('/.pc-private', (_req, res) => res.sendStatus(404));
    app.use(express.static(dependencies.rootDir));

    app.listen(PORT, () => {
        console.log(`[Servidor] KYVEN RESTORE 2.0 activo en el puerto ${PORT}`);
    });
}

module.exports = { startDashboardServer };
