'use strict';

// Archivo de entrada: guardar como index.js en la RAIZ del proyecto.
// KYVEN RESTORE 2.0 / Catruu - arranque con diagnóstico de Discord.
require('dotenv').config();

const { GatewayIntentBits } = require('discord.js');
const { createDatabase } = require('./dashboard/database/models');
const { createSessionSecurity } = require('./dashboard/security/sessions');
const { createDashboardPages } = require('./dashboard/utils/pages');
const { createRestoreSystem } = require('./dashboard/systems/restore');
const { installAntiRaid } = require('./dashboard/security/anti-raid');
const { newBackupGuardian } = require('./dashboard/security/backup-guardian');
const { startDashboardServer } = require('./dashboard/server');
const { createDiscordClient, registerDiscordEvents } = require('./dashboard/interactions/commands');

const rootDir = __dirname;
const ADMIN_USER = (process.env.ADMIN_USER || 'Catrii').trim();
const CODIGO_SECRETO = (process.env.BACKUP_PIN || '').trim();
const OWNER_ID = (process.env.OWNER_ID || '').trim();
// No iniciar un panel y comandos administrativos con una clave predeterminada
// ni con autorización abierta a cualquier usuario.
if (!/^\d{15,22}$/.test(OWNER_ID)) throw new Error('Configura OWNER_ID con tu ID de Discord antes de iniciar KYVEN.');
if (CODIGO_SECRETO.length < 12) throw new Error('Configura BACKUP_PIN (mínimo 12 caracteres privados) antes de iniciar KYVEN.');

const client = createDiscordClient();

// Seguridad adicional: agrega los intents ANTES de iniciar sesion, aun si la
// version de commands.js instalada no los incluye todavia.
// La solucion definitiva tambien corrige dashboard/interactions/commands.js.
if (!client?.options?.intents || typeof client.options.intents.add !== 'function') {
    throw new Error('createDiscordClient() no devolvio un cliente discord.js con intents configurables.');
}
client.options.intents.add(
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences
);

console.log('[Discord] Intents:', {
    Guilds: client.options.intents.has(GatewayIntentBits.Guilds),
    GuildMembers: client.options.intents.has(GatewayIntentBits.GuildMembers),
    GuildPresences: client.options.intents.has(GatewayIntentBits.GuildPresences)
});

const logReady = () => {
    console.log('[Discord] Bot listo:', client.user?.tag || client.user?.username || '(sin usuario)');
    console.log('[Discord] Servidores visibles:', client.guilds.cache.size);
};
// discord.js v14 antiguo: ready; versiones nuevas: clientReady.
// Registrar ambos eventos no duplica el login, solamente los logs.
client.once('clientReady', logReady);
client.once('ready', logReady);
client.on('error', error => console.error('[Discord] Error:', error));
client.on('shardError', error => console.error('[Discord] Error de gateway:', error));
client.on('shardDisconnect', (event, shardId) => {
    console.warn('[Discord] Desconexion shard', shardId, 'codigo:', event?.code);
});

const database = createDatabase();
const security = createSessionSecurity();
const backups = newBackupGuardian({ client, mongoose: database.mongoose, registrarActividadSistema: database.registrarActividadSistema });
const antiraid = installAntiRaid({ client, backups, registrarActividadSistema: database.registrarActividadSistema, OWNER_ID });
require('./commands/guardia').setGuardian({backups, antiraid});
backups.start();
const pages = createDashboardPages(rootDir);
const restore = createRestoreSystem({ ...database, client });
const getRestoreState = () => ({
    restoreEnCurso: restore.restoreEnCurso,
    progresoRestore: restore.progresoRestore
});

// MUY IMPORTANTE: dashboard/server.js debe ejecutar
// registerDashboardPage(app, dependencies) para que la web reciba `client`.
startDashboardServer({
    rootDir, ADMIN_USER, CODIGO_SECRETO, OWNER_ID, client,
    ...database, ...security, ...pages,
    getRestoreState,
    transferirMiembrosSeguro: restore.transferirMiembrosSeguro
});

registerDiscordEvents({
    client, rootDir, ...database, ...security,
    CODIGO_SECRETO, OWNER_ID, getRestoreState,
    transferirMiembrosSeguro: restore.transferirMiembrosSeguro
});

if (!OWNER_ID) console.warn('[Discord] Falta OWNER_ID (ID numerico de usuario).');
const token = (process.env.TOKEN || '').trim();
if (!token) {
    console.error('[Discord] Falta la variable TOKEN en Render. No se inicio sesion.');
} else {
    client.login(token).catch(error => {
        console.error('[Discord] No se pudo iniciar sesion:', error?.message || error);
        console.error('[Discord] Comprueba TOKEN y los Privileged Gateway Intents en Discord Developer Portal.');
    });
}
