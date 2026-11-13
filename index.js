// Punto de entrada de KYVEN RESTORE 2.0
require('dotenv').config();

const path = require('path');
const { createDatabase } = require('./dashboard/database/models');
const { createSessionSecurity } = require('./dashboard/security/sessions');
const { createDashboardPages } = require('./dashboard/utils/pages');
const { createRestoreSystem } = require('./dashboard/systems/restore');
const { startDashboardServer } = require('./dashboard/server');
const { createDiscordClient, registerDiscordEvents } = require('./dashboard/interactions/commands');

const rootDir = __dirname;
const ADMIN_USER = (process.env.ADMIN_USER || 'Catrii').trim();
const CODIGO_SECRETO = (process.env.BACKUP_PIN || '100309AJL').trim();
const OWNER_ID = (process.env.OWNER_ID || '').trim();
const client = createDiscordClient();
const database = createDatabase();
const security = createSessionSecurity();
const pages = createDashboardPages(rootDir);
const restore = createRestoreSystem({ ...database, client });
const getRestoreState = () => ({ restoreEnCurso: restore.restoreEnCurso, progresoRestore: restore.progresoRestore });

startDashboardServer({ rootDir, ADMIN_USER, CODIGO_SECRETO, client, ...database, ...security, ...pages, getRestoreState, transferirMiembrosSeguro: restore.transferirMiembrosSeguro });
registerDiscordEvents({ client, rootDir, ...database, ...security, CODIGO_SECRETO, OWNER_ID, getRestoreState, transferirMiembrosSeguro: restore.transferirMiembrosSeguro });

client.login(process.env.TOKEN);
