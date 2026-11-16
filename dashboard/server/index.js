'use strict';

const express = require('express');
const path = require('path');
const { registerApiRoutes } = require('./api');
const { registerDashboardPage } = require('./frontend');

function startDashboardServer(dependencies) {
    const app = express();
    const PORT = process.env.PORT || 3000;
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    registerApiRoutes(app, dependencies);
    registerDashboardPage(app);
    // Register application routes before static files so /dashboard and
    // /dashboard/ are rendered through the view composer, not dashboard/index.html.
    // Nunca exponer las plantillas y los datos privados mediante el servidor estático.
    app.use('/.pc-private', (req, res) => res.sendStatus(404));
    app.use(express.static(dependencies.rootDir));
    app.listen(PORT, () => {
        console.log(`?? KYVEN RESTORE 2.0 ? CONTROL CENTER activo en el puerto ${PORT}`);
    });
}

module.exports = { startDashboardServer };
