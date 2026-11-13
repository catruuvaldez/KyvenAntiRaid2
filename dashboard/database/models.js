'use strict';

const mongoose = require('mongoose');

function createDatabase() {
mongoose.connect(process.env.MONGO_URI, {
    maxPoolSize: 10
})
    .then(() => {
        console.log('🟢 Conectado a MongoDB Atlas con éxito (Kyven Restore 2.0 DB).');
        registrarActividadSistema('system', 'success', 'Conexión establecida con el clúster de MongoDB Atlas', 'Pool activo: máx 10 conexiones');
    })
    .catch(err => console.error('❌ Error al conectar a MongoDB:', err.message));

const OAuthTokenSchema = new mongoose.Schema({
    user_id: { type: String, required: true, unique: true },
    username: { type: String, default: 'Usuario' },
    global_name: { type: String, default: '' },
    avatar: { type: String, default: '' },
    access_token: { type: String, required: true },
    refresh_token: { type: String, required: true },
    fecha: { type: String, required: true },
    created_at: { type: String, default: () => new Date().toISOString() },
    updated_at: { type: String, default: () => new Date().toISOString() },
    oauth_status: { type: String, default: 'active' }, // 'active' | 'refreshed' | 'expired'
    servers_associated: { type: [String], default: [] },
    history: {
        type: [{
            event: String,
            detail: String,
            timestamp: String
        }],
        default: []
    }
});

const SystemActivitySchema = new mongoose.Schema({
    type: { type: String, required: true }, // 'verify' | 'user_update' | 'guild_connect' | 'guild_disconnect' | 'restore_start' | 'restore_end' | 'error' | 'auth' | 'system'
    severity: { type: String, default: 'info' }, // 'success' | 'warning' | 'error' | 'info'
    description: { type: String, required: true },
    meta: { type: String, default: '' },
    timestamp: { type: String, default: () => new Date().toISOString() }
});

const RestoreOperationSchema = new mongoose.Schema({
    operation_id: { type: String, required: true, unique: true },
    target_guild_id: { type: String, required: true },
    target_guild_name: { type: String, default: 'Servidor' },
    requested_count: { type: Number, default: 0 },
    total_candidates: { type: Number, default: 0 },
    processed: { type: Number, default: 0 },
    joined: { type: Number, default: 0 },
    already_in: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    status: { type: String, default: 'running' }, // 'running' | 'completed' | 'failed'
    started_at: { type: String, required: true },
    finished_at: { type: String, default: null },
    duration_seconds: { type: Number, default: 0 },
    initiated_by: { type: String, default: 'Catrii' },
    error_details: { type: [String], default: [] }
});

const OAuthToken = mongoose.model('OAuthToken', OAuthTokenSchema);
const SystemActivity = mongoose.model('SystemActivity', SystemActivitySchema);
const RestoreOperation = mongoose.model('RestoreOperation', RestoreOperationSchema);

async function registrarActividadSistema(type, severity, description, meta = '') {
    try {
        if (mongoose.connection.readyState !== 1) return;
        await SystemActivity.create({
            type,
            severity,
            description,
            meta,
            timestamp: new Date().toISOString()
        });
    } catch (e) {}
}

let tokensCache = [];
async function sincronizarCache() {
    try {
        if (mongoose.connection.readyState === 1) {
            tokensCache = await OAuthToken.find().lean();
        }
    } catch (e) {}
}
mongoose.connection.once('open', sincronizarCache);

const dbAdapter = {
    OAuthToken,
    prepare: () => ({
        all: () => tokensCache,
        get: (userId) => tokensCache.find(u => u.user_id === userId),
        run: () => {}
    })
};

    return { mongoose, OAuthToken, SystemActivity, RestoreOperation, registrarActividadSistema, sincronizarCache, dbAdapter };
}

module.exports = { createDatabase };
