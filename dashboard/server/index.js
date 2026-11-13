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
    app.use(express.static(dependencies.rootDir));
    registerApiRoutes(app, dependencies);
    registerDashboardPage(app);
    app.listen(PORT, () => {
        console.log(`?? KYVEN RESTORE 2.0 ? CONTROL CENTER activo en el puerto ${PORT}`);
    });
}

module.exports = { startDashboardServer };
