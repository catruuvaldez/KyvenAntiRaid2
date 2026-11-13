// index.js - KYVEN RESTORE • CONTROL CENTER (ENTERPRISE SAAS EDITION)
require('dotenv').config();
const {
    Client,
    GatewayIntentBits,
    Collection,
    Routes,
    REST,
    SlashCommandBuilder,
    MessageFlags,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder
} = require('discord.js');
const express = require('express');
const mongoose = require('mongoose');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ADMIN_USER = process.env.ADMIN_USER || 'KyvenAdmin';
const CODIGO_SECRETO = (process.env.BACKUP_PIN || '100309AJL').trim();
const OWNER_ID = (process.env.OWNER_ID || '').trim();

// ==========================================================
// 1. CONEXIÓN A MONGODB ATLAS Y ESQUEMAS REALES
// ==========================================================
mongoose.connect(process.env.MONGO_URI, {
    maxPoolSize: 10
})
    .then(() => {
        console.log('🟢 Conectado a MongoDB Atlas con éxito (Kyven Restore DB).');
        registrarActividadSistema('system', 'Conexión establecida con el clúster de MongoDB Atlas');
    })
    .catch(err => console.error('❌ Error al conectar a MongoDB:', err.message));

const OAuthTokenSchema = new mongoose.Schema({
    user_id: { type: String, required: true, unique: true },
    username: { type: String, default: 'Usuario' },
    global_name: { type: String, default: '' },
    avatar: { type: String, default: '' },
    access_token: { type: String, required: true },
    refresh_token: { type: String, required: true },
    fecha: { type: String, required: true }, // Fecha de última verificación/actividad
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
    type: { type: String, required: true }, // 'verify' | 'restore_start' | 'restore_end' | 'error' | 'system' | 'guild'
    description: { type: String, required: true },
    meta: { type: String, default: '' },
    timestamp: { type: String, default: () => new Date().toISOString() }
});

const OAuthToken = mongoose.model('OAuthToken', OAuthTokenSchema);
const SystemActivity = mongoose.model('SystemActivity', SystemActivitySchema);

async function registrarActividadSistema(type, description, meta = '') {
    try {
        if (mongoose.connection.readyState !== 1) return;
        await SystemActivity.create({
            type,
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

// ==========================================================
// 2. SEGURIDAD DEL DASHBOARD (SESIONES + ANTI FUERZA BRUTA)
// ==========================================================
const sesionesActivas = new Map();
const intentosFallidos = new Map();

function verificarRateLimitIP(ip) {
    const registro = intentosFallidos.get(ip);
    if (!registro) return { bloqueado: false };
    if (registro.lockUntil && Date.now() < registro.lockUntil) {
        const minRestantes = Math.ceil((registro.lockUntil - Date.now()) / 60000);
        return { bloqueado: true, minRestantes };
    }
    if (registro.lockUntil && Date.now() >= registro.lockUntil) {
        intentosFallidos.delete(ip);
    }
    return { bloqueado: false };
}

function registrarFalloIP(ip) {
    const actual = intentosFallidos.get(ip) || { count: 0, lockUntil: null };
    actual.count += 1;
    if (actual.count >= 5) {
        actual.lockUntil = Date.now() + 15 * 60 * 1000;
    }
    intentosFallidos.set(ip, actual);
}

function validarSesionToken(token) {
    if (!token || !sesionesActivas.has(token)) return false;
    const sesion = sesionesActivas.get(token);
    if (Date.now() > sesion.expiresAt) {
        sesionesActivas.delete(token);
        return false;
    }
    return true;
}

// ==========================================================
// 3. PÁGINA DE ERROR DE VERIFICACIÓN OAUTH2 (PUNTO 3)
// ==========================================================
function renderErrorPage(titulo, mensaje, submensaje) {
    return `
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kyven Anti Raid • Verificación</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * { box-sizing: border-box; font-family: 'Inter', system-ui, sans-serif; }
        body {
            background: radial-gradient(circle at 50% 0%, #190d2e 0%, #05040a 75%);
            color: #f8fafc;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
        }
        .card {
            background: rgba(14, 11, 24, 0.85);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(168, 85, 247, 0.25);
            box-shadow: 0 24px 60px rgba(0, 0, 0, 0.65), 0 0 40px rgba(139, 92, 246, 0.12);
            border-radius: 18px;
            padding: 40px 32px;
            max-width: 440px;
            width: 100%;
            text-align: center;
            animation: fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(12px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .icon-box {
            width: 60px;
            height: 60px;
            border-radius: 14px;
            background: rgba(168, 85, 247, 0.1);
            border: 1px solid rgba(168, 85, 247, 0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 20px;
            color: #c084fc;
        }
        h1 { font-size: 20px; font-weight: 600; color: #f8fafc; margin: 0 0 10px; letter-spacing: -0.02em; }
        p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 20px; }
        .sub {
            background: rgba(9, 7, 16, 0.9);
            border: 1px solid rgba(168, 85, 247, 0.18);
            border-radius: 10px;
            padding: 12px;
            font-size: 12.5px;
            color: #d8b4fe;
            margin-bottom: 24px;
        }
        .btn {
            display: inline-block;
            width: 100%;
            padding: 13px;
            border-radius: 10px;
            background: linear-gradient(135deg, #7c3aed, #9333ea);
            color: #fff;
            font-size: 14px;
            font-weight: 600;
            text-decoration: none;
            transition: all 0.2s ease;
            border: 1px solid rgba(255,255,255,0.1);
        }
        .btn:hover { background: linear-gradient(135deg, #8b5cf6, #a855f7); transform: translateY(-1px); }
        .footer { margin-top: 22px; font-size: 11.5px; color: #64748b; }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon-box">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <h1>${titulo}</h1>
        <p>${mensaje}</p>
        <div class="sub">${submensaje}</div>
        <a class="btn" href="https://discord.com/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join">
            Iniciar Verificación OAuth2
        </a>
        <div class="footer">KYVEN SHOP • Servicio Automático</div>
    </div>
</body>
</html>`;
}

// ==========================================================
// 4. COLA ANTI-RATE LIMIT PARA METER 500 MIEMBROS
// ==========================================================
const esperar = (ms) => new Promise(res => setTimeout(res, ms));
let restoreEnCurso = false;
let progresoRestore = {
    activo: false,
    procesados: 0,
    total: 0,
    unidos: 0,
    yaEstaban: 0,
    fallidos: 0,
    targetGuildId: null,
    startedAt: null,
    finishedAt: null
};

async function renovarAccessToken(doc) {
    try {
        const params = new URLSearchParams({
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            grant_type: 'refresh_token',
            refresh_token: doc.refresh_token
        });

        const res = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            body: params,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const data = await res.json();
        const now = new Date().toISOString();

        if (data.access_token) {
            await OAuthToken.updateOne(
                { user_id: doc.user_id },
                {
                    $set: {
                        access_token: data.access_token,
                        refresh_token: data.refresh_token,
                        updated_at: now,
                        oauth_status: 'refreshed'
                    },
                    $push: {
                        history: {
                            $each: [{ event: 'Token OAuth2 Renovado', detail: 'Renovación automática durante operación de restauración', timestamp: now }],
                            $slice: -30
                        }
                    }
                }
            );
            return data.access_token;
        } else {
            await OAuthToken.updateOne(
                { user_id: doc.user_id },
                {
                    $set: { oauth_status: 'expired', updated_at: now },
                    $push: {
                        history: {
                            $each: [{ event: 'Token OAuth2 Expirado/Revocado', detail: 'El usuario revocó el permiso o el refresh_token caducó', timestamp: now }],
                            $slice: -30
                        }
                    }
                }
            );
            return null;
        }
    } catch (e) {
        return null;
    }
}

async function transferirMiembrosSeguro(guildId, cantidadMax = 500) {
    if (restoreEnCurso) throw new Error('Ya hay un restore ejecutándose.');
    restoreEnCurso = true;

    const guildObj = client.guilds.cache.get(guildId);
    const guildName = guildObj ? guildObj.name : `ID: ${guildId}`;

    const usuarios = await OAuthToken.find().limit(Math.min(cantidadMax, 500));
    progresoRestore = {
        activo: true,
        procesados: 0,
        total: usuarios.length,
        unidos: 0,
        yaEstaban: 0,
        fallidos: 0,
        targetGuildId: guildId,
        startedAt: new Date().toISOString(),
        finishedAt: null
    };

    await registrarActividadSistema('restore_start', `Restauración masiva iniciada hacia ${guildName}`, `Objetivo: ${usuarios.length} miembros`);

    for (const u of usuarios) {
        try {
            let tokenActual = u.access_token;
            let res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${u.user_id}`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bot ${process.env.TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ access_token: tokenActual })
            });

            if (res.status === 401 || res.status === 403) {
                const nuevoToken = await renovarAccessToken(u);
                if (nuevoToken) {
                    res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${u.user_id}`, {
                        method: 'PUT',
                        headers: {
                            Authorization: `Bot ${process.env.TOKEN}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ access_token: nuevoToken })
                    });
                }
            }

            const now = new Date().toISOString();

            if (res.status === 201) {
                progresoRestore.unidos++;
                await OAuthToken.updateOne(
                    { user_id: u.user_id },
                    {
                        $set: { updated_at: now, oauth_status: 'active' },
                        $addToSet: { servers_associated: guildId },
                        $push: {
                            history: {
                                $each: [{ event: 'Transferido por Restore', detail: `Unido exitosamente al servidor ${guildName} (${guildId})`, timestamp: now }],
                                $slice: -30
                            }
                        }
                    }
                );
            } else if (res.status === 204) {
                progresoRestore.yaEstaban++;
                await OAuthToken.updateOne(
                    { user_id: u.user_id },
                    {
                        $addToSet: { servers_associated: guildId }
                    }
                );
            } else if (res.status === 429) {
                const retryData = await res.json().catch(() => ({}));
                const waitMs = (retryData.retry_after || 5) * 1000;
                await esperar(waitMs);
            } else {
                progresoRestore.fallidos++;
            }
        } catch (e) {
            progresoRestore.fallidos++;
        }

        progresoRestore.procesados++;
        await esperar(1350);
    }

    await sincronizarCache();
    restoreEnCurso = false;
    progresoRestore.activo = false;
    progresoRestore.finishedAt = new Date().toISOString();

    await registrarActividadSistema(
        'restore_end',
        `Restauración finalizada en ${guildName}`,
        `Unidos: ${progresoRestore.unidos} • Ya presentes: ${progresoRestore.yaEstaban} • Fallidos: ${progresoRestore.fallidos}`
    );

    return progresoRestore;
}

// ==========================================================
// 5. SERVIDOR EXPRESS + ENDPOINTS + FRONTEND SAAS PREMIUM
// ==========================================================
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Estado público no sensible para el indicador de salud en la pantalla de Login
app.get('/api/public-health', (req, res) => {
    const mongoConnected = mongoose.connection.readyState === 1;
    const botReady = client && client.isReady();
    res.json({
        mongoConnected,
        botReady,
        botTag: botReady ? client.user.tag : 'Inicializando...',
        serverTime: new Date().toISOString()
    });
});

// Callback OAuth2 Oficial
app.get('/auth/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) {
        return res.status(400).send(renderErrorPage(
            'Sesión sin Token de Verificación',
            'No se detectó un código o token activo en este enlace. Para proteger el servidor contra raids, debes iniciar el proceso desde el botón oficial.',
            'Estado: Token no encontrado o enlace incompleto'
        ));
    }

    try {
        const params = new URLSearchParams({
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            grant_type: 'authorization_code',
            code: code,
            redirect_uri: process.env.REDIRECT_URI,
        });

        const response = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            body: params,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        const data = await response.json();
        if (data.access_token) {
            const userRes = await fetch('https://discord.com/api/users/@me', {
                headers: { authorization: `${data.token_type} ${data.access_token}` },
            });
            const userData = await userRes.json();

            const avatarUrl = userData.avatar
                ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png`
                : 'https://cdn.discordapp.com/embed/avatars/0.png';

            const now = new Date().toISOString();
            const usernameClean = userData.username || userData.global_name || 'Usuario';

            const existing = await OAuthToken.findOne({ user_id: userData.id });
            const isNew = !existing;

            const updateQuery = {
                $set: {
                    username: usernameClean,
                    global_name: userData.global_name || '',
                    avatar: avatarUrl,
                    access_token: data.access_token,
                    refresh_token: data.refresh_token,
                    fecha: now,
                    updated_at: now,
                    oauth_status: 'active'
                },
                $setOnInsert: {
                    created_at: now
                },
                $push: {
                    history: {
                        $each: [{
                            event: isNew ? 'Registro Inicial OAuth2' : 'Re-verificación OAuth2',
                            detail: isNew ? 'Usuario autorizó permisos identify y guilds.join' : 'Tokens de acceso actualizados por el usuario',
                            timestamp: now
                        }],
                        $slice: -30
                    }
                }
            };

            if (process.env.GUILD_ID) {
                updateQuery.$addToSet = { servers_associated: process.env.GUILD_ID };
            }

            await OAuthToken.findOneAndUpdate(
                { user_id: userData.id },
                updateQuery,
                { upsert: true, new: true }
            );

            await registrarActividadSistema(
                'verify',
                `${usernameClean} completó la verificación OAuth2`,
                `ID: ${userData.id}`
            );

            await sincronizarCache();

            if (process.env.GUILD_ID) {
                const rolesToAssign = [
                    process.env.ROLE_ID,
                    process.env.ROLE_USUARIO_ID || '1561162470557483098'
                ].filter(Boolean);

                for (const roleId of rolesToAssign) {
                    try {
                        await fetch(`https://discord.com/api/guilds/${process.env.GUILD_ID}/members/${userData.id}/roles/${roleId}`, {
                            method: 'PUT',
                            headers: { Authorization: `Bot ${process.env.TOKEN}` }
                        });
                    } catch (roleErr) {}
                }
            }

            res.sendFile(path.join(__dirname, 'index.html'));
        } else {
            await registrarActividadSistema('error', 'Fallo de validación de token en callback OAuth2', 'Código expirado o inválido');
            return res.status(400).send(renderErrorPage(
                'Token Expirado o Inválido',
                'El código de autorización de Discord ya fue utilizado o expiró. Haz clic en el botón de abajo para generar un token nuevo.',
                'Detalle: No se pudo validar el token OAuth2'
            ));
        }
    } catch (error) {
        await registrarActividadSistema('error', 'Error interno durante autenticación OAuth2', error.message || '');
        return res.status(500).send(renderErrorPage(
            'Error de Conexión con Discord',
            'Ocurrió un problema temporal al validar tu cuenta con el sistema Anti-Raid.',
            'Intenta nuevamente en unos segundos'
        ));
    }
});

// Login Administrativo
app.post('/api/dashboard-login', async (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const estadoIp = verificarRateLimitIP(ip);

    if (estadoIp.bloqueado) {
        return res.status(429).json({
            error: `Demasiados intentos fallidos. IP bloqueada temporalmente por ${estadoIp.minRestantes} min.`
        });
    }

    const { username, pin } = req.body;
    const cleanUser = (username || '').trim();
    const userOk = cleanUser.toLowerCase() === ADMIN_USER.toLowerCase() || cleanUser.toLowerCase() === 'kyven';
    const pinOk = (pin || '').trim() === CODIGO_SECRETO;

    if (!userOk || !pinOk) {
        registrarFalloIP(ip);
        await registrarActividadSistema('error', 'Intento de acceso fallido al panel administrativo', `Usuario ingresado: ${cleanUser || 'Vacío'}`);
        return res.status(401).json({ error: 'Credenciales inválidas. Verifica tu identificador o código de seguridad.' });
    }

    intentosFallidos.delete(ip);
    const sessionToken = crypto.randomBytes(32).toString('hex');
    sesionesActivas.set(sessionToken, {
        adminName: cleanUser || ADMIN_USER,
        expiresAt: Date.now() + 12 * 60 * 60 * 1000
    });

    await registrarActividadSistema('system', `Sesión administrativa iniciada por ${cleanUser || ADMIN_USER}`);
    res.json({ ok: true, sessionToken, adminName: cleanUser || ADMIN_USER });
});

// Estadísticas Reales y Usuarios (Sin exponer tokens)
app.post('/api/dashboard-stats', async (req, res) => {
    const { sessionToken } = req.body;
    if (!validarSesionToken(sessionToken)) {
        return res.status(401).json({ error: 'Sesión expirada o no autorizada.' });
    }

    const sesion = sesionesActivas.get(sessionToken);
    const total = await OAuthToken.countDocuments();
    const rawUsers = await OAuthToken.find().sort({ fecha: -1 }).limit(2000).select('-access_token -refresh_token').lean();
    const activities = await SystemActivity.find().sort({ timestamp: -1 }).limit(60).lean();

    const guilds = client.guilds.cache.map(g => ({
        id: g.id,
        name: g.name,
        count: g.memberCount,
        icon: g.iconURL({ extension: 'png', size: 64 }) || null
    }));

    const guildMap = new Map(guilds.map(g => [g.id, g.name]));

    const users = rawUsers.map(u => {
        const createdAtRecord = u.created_at || u.fecha;
        const updatedAtRecord = u.updated_at || u.fecha;
        const oauthStatus = u.oauth_status || 'active';
        const associatedIds = Array.isArray(u.servers_associated) && u.servers_associated.length > 0
            ? u.servers_associated
            : (process.env.GUILD_ID ? [process.env.GUILD_ID] : []);

        const associatedNames = associatedIds.map(id => ({
            id,
            name: guildMap.get(id) || (id === process.env.GUILD_ID ? 'Servidor Principal Registrado' : `Servidor ID: ${id}`)
        }));

        const historyList = Array.isArray(u.history) && u.history.length > 0
            ? u.history
            : [{
                event: 'Verificación OAuth2 Registrada',
                detail: 'Registro almacenado en la base de datos de Kyven Restore',
                timestamp: u.fecha
            }];

        return {
            user_id: u.user_id,
            username: u.username || 'Usuario',
            global_name: u.global_name || null,
            avatar: u.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png',
            fecha: u.fecha,
            created_at: createdAtRecord,
            updated_at: updatedAtRecord,
            oauth_status: oauthStatus,
            servers_associated: associatedNames,
            history: historyList
        };
    });

    const systemHealth = {
        mongoConnected: mongoose.connection.readyState === 1,
        mongoStateText: mongoose.connection.readyState === 1 ? 'Conectado (Atlas M0)' : 'Desconectado',
        botReady: client.isReady(),
        botTag: client.user ? client.user.tag : 'Desconectado',
        botPing: client.ws.ping >= 0 ? client.ws.ping : 0,
        uptimeSeconds: Math.floor(process.uptime()),
        serverTime: new Date().toISOString()
    };

    res.json({
        adminName: sesion?.adminName || ADMIN_USER,
        total,
        users,
        guilds,
        activities,
        progresoRestore,
        systemHealth
    });
});

// Iniciar Transferencia Masiva desde el Dashboard
app.post('/api/dashboard-pull', async (req, res) => {
    const { sessionToken, guildId, cantidad } = req.body;
    if (!validarSesionToken(sessionToken)) {
        return res.status(401).json({ error: 'Sesión no autorizada.' });
    }
    if (!guildId) return res.status(400).json({ error: 'Selecciona o ingresa el ID del servidor destino.' });
    if (restoreEnCurso) return res.status(400).json({ error: 'Ya existe una operación de restauración en curso.' });

    const limitNum = Math.min(Math.max(Number(cantidad) || 500, 1), 500);
    transferirMiembrosSeguro(guildId.trim(), limitNum).catch(console.error);

    res.json({
        ok: true,
        message: `Restauración iniciada hacia el servidor (${limitNum} máx). Cadencia segura: 1.35s por usuario.`
    });
});

// Interfaz Principal del Dashboard
app.get('/dashboard', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KYVEN RESTORE • CONTROL CENTER</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-base: #05040a;
            --bg-surface: #0b0914;
            --bg-elevated: rgba(17, 14, 28, 0.78);
            --bg-card-hover: rgba(24, 19, 40, 0.85);
            --border-subtle: rgba(255, 255, 255, 0.07);
            --border-violet: rgba(168, 85, 247, 0.28);
            --border-violet-bright: rgba(192, 132, 252, 0.55);
            --accent-primary: #8b5cf6;
            --accent-secondary: #a855f7;
            --accent-light: #d8b4fe;
            --text-primary: #f8fafc;
            --text-secondary: #94a3b8;
            --text-muted: #64748b;
            --success: #10b981;
            --warning: #f59e0b;
            --danger: #ef4444;
            --radius-sm: 8px;
            --radius-md: 12px;
            --radius-lg: 16px;
            --radius-xl: 20px;
            --transition-fast: 180ms cubic-bezier(0.16, 1, 0.3, 1);
            --transition-smooth: 280ms cubic-bezier(0.16, 1, 0.3, 1);
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            background-color: var(--bg-base);
            color: var(--text-primary);
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 14px;
            line-height: 1.5;
            min-height: 100vh;
            overflow-x: hidden;
            -webkit-font-smoothing: antialiased;
        }

        .mono {
            font-family: 'JetBrains Mono', monospace;
        }

        /* Ambiental Backdrops */
        .ambient-glow {
            position: fixed;
            top: -180px;
            left: 50%;
            transform: translateX(-50%);
            width: 900px;
            height: 420px;
            background: radial-gradient(ellipse at center, rgba(139, 92, 246, 0.16) 0%, rgba(88, 28, 135, 0.05) 45%, transparent 75%);
            pointer-events: none;
            z-index: 0;
        }

        /* ==========================================================
           PANTALLA DE LOGIN INTERACTIVA
           ========================================================== */
        #loginScreen {
            position: relative;
            width: 100%;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            overflow: hidden;
            z-index: 1;
        }

        #particleCanvas {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            z-index: 0;
            pointer-events: none;
        }

        .login-ambient-orb {
            position: absolute;
            width: 550px;
            height: 550px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(139, 92, 246, 0.14) 0%, rgba(15, 10, 30, 0) 70%);
            filter: blur(40px);
            z-index: 0;
            pointer-events: none;
            animation: slowFloat 14s ease-in-out infinite alternate;
        }

        @keyframes slowFloat {
            0% { transform: translate(-10%, -8%) scale(1); }
            100% { transform: translate(10%, 8%) scale(1.08); }
        }

        .login-container {
            position: relative;
            z-index: 2;
            width: 100%;
            max-width: 420px;
            animation: loginEnter 350ms cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes loginEnter {
            from { opacity: 0; transform: translateY(18px) scale(0.985); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }

        .login-brand-header {
            text-align: center;
            margin-bottom: 22px;
        }

        .login-brand-title {
            font-size: 22px;
            font-weight: 700;
            letter-spacing: -0.03em;
            color: #ffffff;
            text-shadow: 0 0 28px rgba(168, 85, 247, 0.45);
        }

        .login-brand-sub {
            font-size: 12px;
            color: var(--text-secondary);
            letter-spacing: 0.12em;
            text-transform: uppercase;
            margin-top: 4px;
        }

        .login-card {
            background: rgba(13, 10, 22, 0.76);
            backdrop-filter: blur(24px);
            -webkit-backdrop-filter: blur(24px);
            border: 1px solid rgba(168, 85, 247, 0.24);
            border-radius: var(--radius-xl);
            padding: 36px 32px;
            box-shadow: 0 25px 65px rgba(0, 0, 0, 0.75), 0 0 0 1px rgba(255, 255, 255, 0.03) inset;
            transition: border-color var(--transition-smooth), box-shadow var(--transition-smooth);
        }

        .login-card:hover {
            border-color: rgba(168, 85, 247, 0.4);
            box-shadow: 0 28px 70px rgba(0, 0, 0, 0.8), 0 0 35px rgba(139, 92, 246, 0.12);
        }

        .kv-avatar-circle {
            width: 62px;
            height: 62px;
            border-radius: 50%;
            margin: 0 auto 20px;
            background: radial-gradient(circle at 30% 30%, rgba(168, 85, 247, 0.28), rgba(17, 12, 31, 0.95));
            border: 1px solid rgba(168, 85, 247, 0.45);
            box-shadow: 0 0 25px rgba(168, 85, 247, 0.25);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 19px;
            color: #f3e8ff;
            letter-spacing: -0.03em;
        }

        .login-tabs {
            display: flex;
            justify-content: center;
            gap: 24px;
            border-bottom: 1px solid var(--border-subtle);
            margin-bottom: 24px;
            padding-bottom: 10px;
        }

        .login-tab {
            font-size: 13px;
            font-weight: 500;
            color: var(--text-muted);
            padding-bottom: 10px;
            margin-bottom: -11px;
            cursor: default;
            position: relative;
        }

        .login-tab.active {
            color: var(--accent-light);
            border-bottom: 2px solid var(--accent-secondary);
        }

        .form-group {
            margin-bottom: 16px;
        }

        .form-label {
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            font-weight: 500;
            color: var(--text-secondary);
            margin-bottom: 7px;
        }

        .input-wrapper {
            position: relative;
            display: flex;
            align-items: center;
        }

        .input-icon {
            position: absolute;
            left: 13px;
            color: var(--text-muted);
            pointer-events: none;
            transition: color var(--transition-fast);
        }

        .input-field {
            width: 100%;
            background: rgba(7, 5, 13, 0.85);
            border: 1px solid rgba(255, 255, 255, 0.09);
            border-radius: var(--radius-md);
            padding: 11px 14px 11px 38px;
            color: var(--text-primary);
            font-size: 13.5px;
            outline: none;
            transition: border-color var(--transition-fast), box-shadow var(--transition-fast), background var(--transition-fast);
        }

        .input-field.no-icon {
            padding-left: 14px;
        }

        .input-field:focus {
            background: rgba(11, 8, 20, 0.98);
            border-color: var(--accent-secondary);
            box-shadow: 0 0 0 3px rgba(168, 85, 247, 0.16);
        }

        .input-wrapper:focus-within .input-icon {
            color: var(--accent-light);
        }

        .btn-primary {
            width: 100%;
            padding: 12px 18px;
            border-radius: var(--radius-md);
            border: 1px solid rgba(255, 255, 255, 0.12);
            background: linear-gradient(135deg, #7c3aed 0%, #9333ea 100%);
            color: #ffffff;
            font-size: 13.5px;
            font-weight: 600;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: transform var(--transition-fast), box-shadow var(--transition-fast), filter var(--transition-fast);
            box-shadow: 0 6px 20px rgba(124, 58, 237, 0.35);
        }

        .btn-primary:hover:not(:disabled) {
            transform: translateY(-1px);
            filter: brightness(1.08);
            box-shadow: 0 10px 26px rgba(147, 51, 234, 0.5);
        }

        .btn-primary:active:not(:disabled) {
            transform: translateY(0);
        }

        .btn-primary:disabled {
            opacity: 0.6;
            cursor: not-allowed;
        }

        .login-meta-divider {
            display: flex;
            align-items: center;
            gap: 12px;
            margin: 22px 0 16px;
            color: var(--text-muted);
            font-size: 11.5px;
            text-transform: uppercase;
            letter-spacing: 0.06em;
        }

        .login-meta-divider::before,
        .login-meta-divider::after {
            content: '';
            flex: 1;
            height: 1px;
            background: var(--border-subtle);
        }

        .login-status-pills {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
        }

        .status-pill-box {
            background: rgba(8, 6, 15, 0.75);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-sm);
            padding: 8px 6px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 4px;
            font-size: 11px;
            color: var(--text-secondary);
            text-align: center;
        }

        .dot {
            width: 7px;
            height: 7px;
            border-radius: 50%;
            background: var(--success);
            box-shadow: 0 0 8px var(--success);
        }

        .dot.warn { background: var(--warning); box-shadow: 0 0 8px var(--warning); }
        .dot.danger { background: var(--danger); box-shadow: 0 0 8px var(--danger); }

        .login-alert {
            display: none;
            align-items: center;
            gap: 10px;
            padding: 11px 14px;
            border-radius: var(--radius-md);
            background: rgba(239, 68, 68, 0.12);
            border: 1px solid rgba(239, 68, 68, 0.35);
            color: #fca5a5;
            font-size: 12.5px;
            margin-bottom: 16px;
            animation: loginEnter 200ms ease;
        }

        /* ==========================================================
           LAYOUT PRINCIPAL DEL DASHBOARD
           ========================================================== */
        #dashboardApp {
            display: none;
            position: relative;
            z-index: 1;
            min-height: 100vh;
        }

        .app-shell {
            display: grid;
            grid-template-columns: 240px 1fr;
            min-height: 100vh;
        }

        /* Sidebar estilo SaaS */
        .sidebar {
            background: rgba(9, 7, 16, 0.88);
            backdrop-filter: blur(20px);
            border-right: 1px solid var(--border-subtle);
            padding: 24px 16px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            position: sticky;
            top: 0;
            height: 100vh;
        }

        .sidebar-brand {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 4px 10px 22px;
            border-bottom: 1px solid var(--border-subtle);
            margin-bottom: 20px;
        }

        .kv-logo-mark {
            width: 36px;
            height: 36px;
            border-radius: 10px;
            background: linear-gradient(135deg, #7c3aed, #a855f7);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 15px;
            color: #fff;
            box-shadow: 0 0 18px rgba(139, 92, 246, 0.4);
            flex-shrink: 0;
        }

        .nav-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .nav-item {
            display: flex;
            align-items: center;
            gap: 11px;
            padding: 10px 12px;
            border-radius: var(--radius-md);
            color: var(--text-secondary);
            font-size: 13.5px;
            font-weight: 500;
            cursor: pointer;
            border: 1px solid transparent;
            background: transparent;
            width: 100%;
            text-align: left;
            transition: all var(--transition-fast);
        }

        .nav-item:hover {
            color: var(--text-primary);
            background: rgba(255, 255, 255, 0.03);
        }

        .nav-item.active {
            color: #ffffff;
            background: rgba(139, 92, 246, 0.14);
            border-color: rgba(168, 85, 247, 0.3);
        }

        .sidebar-footer {
            border-top: 1px solid var(--border-subtle);
            padding-top: 16px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .health-summary-box {
            background: rgba(15, 12, 26, 0.8);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            padding: 12px;
            font-size: 12px;
        }

        /* Contenido Central */
        .main-area {
            padding: 26px 34px 48px;
            max-width: 1440px;
            width: 100%;
            margin: 0 auto;
        }

        /* Header Superior */
        .top-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            padding-bottom: 22px;
            margin-bottom: 26px;
            border-bottom: 1px solid var(--border-subtle);
            flex-wrap: wrap;
        }

        .welcome-block h1 {
            font-size: 20px;
            font-weight: 700;
            letter-spacing: -0.02em;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .welcome-block p {
            color: var(--text-secondary);
            font-size: 13px;
            margin-top: 3px;
        }

        .header-actions {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
        }

        .status-chip {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 7px 12px;
            background: rgba(15, 12, 26, 0.85);
            border: 1px solid var(--border-subtle);
            border-radius: 999px;
            font-size: 12px;
            color: var(--text-secondary);
        }

        .btn-secondary {
            padding: 8px 14px;
            border-radius: var(--radius-md);
            background: rgba(19, 15, 32, 0.9);
            border: 1px solid rgba(168, 85, 247, 0.25);
            color: var(--text-primary);
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 7px;
            transition: all var(--transition-fast);
        }

        .btn-secondary:hover {
            background: rgba(139, 92, 246, 0.15);
            border-color: var(--border-violet-bright);
            transform: translateY(-1px);
        }

        .btn-danger-ghost {
            padding: 8px 14px;
            border-radius: var(--radius-md);
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.28);
            color: #fca5a5;
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            transition: all var(--transition-fast);
        }

        .btn-danger-ghost:hover {
            background: rgba(239, 68, 68, 0.18);
            border-color: rgba(239, 68, 68, 0.5);
        }

        /* Tarjetas Estadísticas */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 20px;
            margin-bottom: 24px;
        }

        .stat-card {
            background: var(--bg-elevated);
            backdrop-filter: blur(16px);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-lg);
            padding: 22px;
            position: relative;
            overflow: hidden;
            transition: transform var(--transition-smooth), border-color var(--transition-smooth), box-shadow var(--transition-smooth);
        }

        .stat-card:hover {
            transform: translateY(-2px);
            border-color: var(--border-violet);
            box-shadow: 0 14px 34px rgba(0, 0, 0, 0.45), 0 0 24px rgba(139, 92, 246, 0.08);
        }

        .stat-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 12px;
        }

        .stat-title {
            font-size: 12.5px;
            font-weight: 600;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .stat-icon {
            width: 36px;
            height: 36px;
            border-radius: 10px;
            background: rgba(139, 92, 246, 0.12);
            border: 1px solid rgba(168, 85, 247, 0.25);
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--accent-light);
        }

        .stat-value-row {
            display: flex;
            align-items: baseline;
            justify-content: space-between;
            gap: 12px;
        }

        .stat-number {
            font-size: 32px;
            font-weight: 700;
            letter-spacing: -0.03em;
            color: #ffffff;
        }

        .stat-footer {
            margin-top: 12px;
            padding-top: 10px;
            border-top: 1px solid var(--border-subtle);
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 12px;
            color: var(--text-secondary);
        }

        .sparkline-svg {
            width: 90px;
            height: 28px;
            overflow: visible;
        }

        /* Grid Intermedio: Transferencia Masiva + Actividad Reciente */
        .middle-grid {
            display: grid;
            grid-template-columns: 1.35fr 1fr;
            gap: 20px;
            margin-bottom: 24px;
        }

        .section-card {
            background: var(--bg-elevated);
            backdrop-filter: blur(16px);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-lg);
            padding: 24px;
            transition: border-color var(--transition-smooth);
        }

        .section-card:hover {
            border-color: rgba(168, 85, 247, 0.2);
        }

        .section-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 18px;
            gap: 12px;
        }

        .section-head h2 {
            font-size: 15.5px;
            font-weight: 600;
            color: var(--text-primary);
            display: flex;
            align-items: center;
            gap: 9px;
        }

        .restore-grid-controls {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 14px;
            margin-bottom: 16px;
        }

        .restore-bottom-bar {
            display: flex;
            align-items: flex-end;
            gap: 14px;
        }

        .progress-container {
            margin-top: 18px;
            background: rgba(7, 5, 14, 0.85);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            padding: 14px;
        }

        .progress-track {
            width: 100%;
            height: 8px;
            background: rgba(255, 255, 255, 0.06);
            border-radius: 999px;
            overflow: hidden;
            margin: 8px 0;
        }

        .progress-fill {
            height: 100%;
            width: 0%;
            background: linear-gradient(90deg, #7c3aed, #c084fc);
            border-radius: 999px;
            transition: width 300ms ease;
        }

        /* Lista de Actividad Reciente */
        .activity-feed {
            display: flex;
            flex-direction: column;
            gap: 10px;
            max-height: 230px;
            overflow-y: auto;
            padding-right: 4px;
        }

        .activity-item {
            display: flex;
            align-items: flex-start;
            gap: 11px;
            padding: 10px 12px;
            border-radius: var(--radius-md);
            background: rgba(9, 7, 17, 0.65);
            border: 1px solid var(--border-subtle);
            font-size: 12.5px;
        }

        .act-icon {
            width: 28px;
            height: 28px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            background: rgba(139, 92, 246, 0.14);
            color: var(--accent-light);
        }

        .act-body { flex: 1; }
        .act-title { color: var(--text-primary); font-weight: 500; }
        .act-meta { color: var(--text-muted); font-size: 11.5px; margin-top: 2px; }

        /* ==========================================================
           TABLA PROFESIONAL DE USUARIOS
           ========================================================== */
        .table-toolbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 16px;
            flex-wrap: wrap;
        }

        .toolbar-left {
            display: flex;
            align-items: center;
            gap: 10px;
            flex: 1;
            min-width: 260px;
        }

        .toolbar-right {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
        }

        .select-pro {
            background: rgba(7, 5, 13, 0.85);
            border: 1px solid rgba(255, 255, 255, 0.09);
            border-radius: var(--radius-md);
            padding: 9px 12px;
            color: var(--text-primary);
            font-size: 13px;
            outline: none;
            cursor: pointer;
        }

        .select-pro:focus {
            border-color: var(--accent-secondary);
        }

        .table-wrapper {
            width: 100%;
            overflow-x: auto;
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            background: rgba(8, 6, 15, 0.6);
        }

        table {
            width: 100%;
            border-collapse: collapse;
            text-align: left;
        }

        thead th {
            padding: 13px 16px;
            font-size: 11.5px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: var(--text-secondary);
            background: rgba(14, 11, 25, 0.9);
            border-bottom: 1px solid var(--border-subtle);
            user-select: none;
        }

        tbody tr {
            border-bottom: 1px solid rgba(255, 255, 255, 0.04);
            cursor: pointer;
            transition: background var(--transition-fast);
        }

        tbody tr:last-child { border-bottom: none; }

        tbody tr:hover {
            background: rgba(139, 92, 246, 0.08);
        }

        td {
            padding: 13px 16px;
            vertical-align: middle;
            font-size: 13.5px;
        }

        .user-cell-flex {
            display: flex;
            align-items: center;
            gap: 12px;
        }

        .user-avatar {
            width: 36px;
            height: 36px;
            border-radius: 50%;
            object-fit: cover;
            border: 1px solid rgba(168, 85, 247, 0.4);
            background: #130f22;
            flex-shrink: 0;
        }

        .badge-status {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 4px 10px;
            border-radius: 999px;
            font-size: 11.5px;
            font-weight: 600;
        }

        .badge-status.active {
            background: rgba(16, 185, 129, 0.12);
            color: #34d399;
            border: 1px solid rgba(16, 185, 129, 0.3);
        }

        .badge-status.refreshed {
            background: rgba(139, 92, 246, 0.15);
            color: #c084fc;
            border: 1px solid rgba(139, 92, 246, 0.35);
        }

        .badge-status.expired {
            background: rgba(239, 68, 68, 0.12);
            color: #f87171;
            border: 1px solid rgba(239, 68, 68, 0.3);
        }

        .pagination-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding-top: 16px;
            font-size: 12.5px;
            color: var(--text-secondary);
            flex-wrap: wrap;
            gap: 10px;
        }

        .page-buttons {
            display: flex;
            align-items: center;
            gap: 6px;
        }

        /* ==========================================================
           USER DETAILS DRAWER (PANEL LATERAL INTERACTIVO)
           ========================================================== */
        .drawer-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(3, 2, 7, 0.65);
            backdrop-filter: blur(4px);
            z-index: 90;
            opacity: 0;
            pointer-events: none;
            transition: opacity var(--transition-smooth);
        }

        .drawer-backdrop.open {
            opacity: 1;
            pointer-events: auto;
        }

        .user-drawer {
            position: fixed;
            top: 0;
            right: 0;
            width: 100%;
            max-width: 460px;
            height: 100vh;
            background: #0c0916;
            border-left: 1px solid var(--border-violet);
            box-shadow: -20px 0 60px rgba(0, 0, 0, 0.85);
            z-index: 100;
            transform: translateX(100%);
            transition: transform var(--transition-smooth);
            display: flex;
            flex-direction: column;
        }

        .user-drawer.open {
            transform: translateX(0);
        }

        .drawer-header {
            padding: 24px;
            border-bottom: 1px solid var(--border-subtle);
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 14px;
            background: linear-gradient(180deg, rgba(139, 92, 246, 0.1) 0%, transparent 100%);
        }

        .drawer-profile-summary {
            display: flex;
            align-items: center;
            gap: 14px;
        }

        .drawer-avatar-lg {
            width: 58px;
            height: 58px;
            border-radius: 50%;
            border: 2px solid var(--accent-secondary);
            box-shadow: 0 0 20px rgba(168, 85, 247, 0.35);
        }

        .drawer-close-btn {
            background: rgba(255, 255, 255, 0.05);
            border: 1px solid var(--border-subtle);
            color: var(--text-secondary);
            width: 32px;
            height: 32px;
            border-radius: 8px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all var(--transition-fast);
        }

        .drawer-close-btn:hover {
            color: #fff;
            border-color: var(--border-violet);
        }

        .drawer-content {
            padding: 22px 24px;
            overflow-y: auto;
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 20px;
        }

        .drawer-quick-actions {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 8px;
        }

        .btn-Fact {
            padding: 9px 10px;
            border-radius: var(--radius-sm);
            background: rgba(18, 14, 30, 0.9);
            border: 1px solid var(--border-subtle);
            color: var(--text-primary);
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            text-decoration: none;
            transition: all var(--transition-fast);
        }

        .btn-Fact:hover {
            border-color: var(--border-violet-bright);
            background: rgba(139, 92, 246, 0.14);
        }

        .info-grid-card {
            background: rgba(15, 12, 26, 0.75);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            padding: 16px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 14px;
        }

        .info-cell-label {
            font-size: 11px;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 4px;
        }

        .info-cell-val {
            font-size: 13px;
            color: var(--text-primary);
            font-weight: 500;
            word-break: break-all;
        }

        .timeline-list {
            display: flex;
            flex-direction: column;
            gap: 12px;
            position: relative;
            padding-left: 16px;
            border-left: 1px solid rgba(168, 85, 247, 0.3);
            margin-left: 8px;
        }

        .timeline-node {
            position: relative;
            background: rgba(15, 12, 26, 0.7);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-sm);
            padding: 10px 12px;
        }

        .timeline-node::before {
            content: '';
            position: absolute;
            left: -21px;
            top: 14px;
            width: 9px;
            height: 9px;
            border-radius: 50%;
            background: var(--accent-secondary);
            box-shadow: 0 0 8px var(--accent-secondary);
        }

        /* ==========================================================
           MODAL DE CONFIRMACIÓN E HISTORIAL Y TOASTS
           ========================================================== */
        .modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(3, 2, 8, 0.72);
            backdrop-filter: blur(5px);
            z-index: 110;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .modal-overlay.active {
            display: flex;
            animation: loginEnter 200ms ease;
        }

        .modal-box {
            background: #0e0b1a;
            border: 1px solid var(--border-violet);
            border-radius: var(--radius-lg);
            max-width: 500px;
            width: 100%;
            padding: 26px;
            box-shadow: 0 25px 60px rgba(0, 0, 0, 0.85);
        }

        .toast-container {
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 200;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .toast {
            background: rgba(16, 12, 28, 0.95);
            backdrop-filter: blur(12px);
            border: 1px solid var(--border-violet);
            border-left: 4px solid var(--accent-secondary);
            color: var(--text-primary);
            padding: 12px 16px;
            border-radius: var(--radius-md);
            font-size: 13px;
            box-shadow: 0 12px 30px rgba(0, 0, 0, 0.6);
            display: flex;
            align-items: center;
            gap: 10px;
            animation: loginEnter 220ms ease;
        }

        /* Skeleton Loading */
        .skeleton {
            background: linear-gradient(90deg, rgba(255,255,255,0.03) 25%, rgba(168,85,247,0.08) 50%, rgba(255,255,255,0.03) 75%);
            background-size: 200% 100%;
            animation: shimmer 1.5s infinite;
            border-radius: 6px;
            height: 18px;
        }

        @keyframes shimmer {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
        }

        @media (max-width: 1080px) {
            .app-shell { grid-template-columns: 1fr; }
            .sidebar { display: none; }
            .stats-grid, .middle-grid { grid-template-columns: 1fr; }
        }

        @media (prefers-reduced-motion: reduce) {
            *, *::before, *::after {
                animation-duration: 0.01ms !important;
                animation-iteration-count: 1 !important;
                transition-duration: 0.01ms !important;
            }
        }
    </style>
</head>
<body>

    <div class="ambient-glow"></div>

    <!-- ==========================================================
         1. PANTALLA DE LOGIN INTERACTIVA
         ========================================================== -->
    <section id="loginScreen">
        <canvas id="particleCanvas"></canvas>
        <div class="login-ambient-orb"></div>

        <div class="login-container">
            <div class="login-brand-header">
                <div class="login-brand-title">Kyven Restore</div>
                <div class="login-brand-sub">Control Center • Acceso Privado</div>
            </div>

            <div class="login-card">
                <div class="kv-avatar-circle" title="Isotipo Oficial Kyven Store">KV</div>

                <div class="login-tabs">
                    <span class="login-tab active">Autenticación</span>
                    <span class="login-tab">Estado del Sistema</span>
                </div>

                <div class="login-alert" id="loginAlertBox">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <span id="loginAlertText">Error de autenticación</span>
                </div>

                <div class="form-group">
                    <label class="form-label">
                        <span>Identificador de Administrador</span>
                        <span class="mono" style="font-size:11px;color:var(--accent-light);">ROL: OWNER</span>
                    </label>
                    <div class="input-wrapper">
                        <svg class="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        <input type="text" id="loginUser" class="input-field" value="KyvenAdmin" placeholder="KyvenAdmin" autocomplete="username" />
                    </div>
                </div>

                <div class="form-group" style="margin-bottom:22px;">
                    <label class="form-label">
                        <span>Código de Seguridad Personal (PIN)</span>
                        <span style="font-size:11px;color:var(--text-muted);">SHA-256 Auth</span>
                    </label>
                    <div class="input-wrapper">
                        <svg class="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                        <input type="password" id="loginPin" class="input-field" placeholder="••••••••••" autocomplete="current-password" onkeydown="if(event.key==='Enter') handleLogin()" />
                    </div>
                </div>

                <button class="btn-primary" id="loginBtn" onclick="handleLogin()">
                    <span id="loginBtnText">Autenticar en Control Center</span>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                </button>

                <div class="login-meta-divider">Telemetría del Servicio</div>

                <div class="login-status-pills">
                    <div class="status-pill-box" title="Conexión cifrada de extremo a extremo">
                        <span class="dot"></span>
                        <span>TLS Seguro</span>
                    </div>
                    <div class="status-pill-box" title="Estado en vivo del clúster MongoDB Atlas">
                        <span class="dot" id="loginMongoDot"></span>
                        <span id="loginMongoText">MongoDB</span>
                    </div>
                    <div class="status-pill-box" title="Estado de sesión del cliente Discord">
                        <span class="dot" id="loginBotDot"></span>
                        <span id="loginBotText">Gateway Bot</span>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- ==========================================================
         2. APLICACIÓN PRINCIPAL DEL DASHBOARD
         ========================================================== -->
    <div id="dashboardApp">
        <div class="app-shell">
            <!-- Barra Lateral -->
            <aside class="sidebar">
                <div>
                    <div class="sidebar-brand">
                        <div class="kv-logo-mark">KV</div>
                        <div>
                            <div style="font-weight:700;font-size:14.5px;letter-spacing:-0.02em;">KYVEN RESTORE</div>
                            <div style="font-size:11px;color:var(--accent-light);letter-spacing:0.06em;">CONTROL CENTER</div>
                        </div>
                    </div>

                    <div class="nav-list">
                        <button class="nav-item active" onclick="scrollToSection('topHeader')">
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                            <span>Resumen General</span>
                        </button>
                        <button class="nav-item" onclick="scrollToSection('restoreSection')">
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                            <span>Motor de Restauración</span>
                        </button>
                        <button class="nav-item" onclick="scrollToSection('usersSection')">
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                            <span>Directorio OAuth2</span>
                        </button>
                        <button class="nav-item" onclick="abrirModalHistorial()">
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                            <span>Registro de Actividad</span>
                        </button>
                    </div>
                </div>

                <div class="sidebar-footer">
                    <div class="health-summary-box">
                        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                            <span style="color:var(--text-muted);">MongoDB Atlas</span>
                            <span id="sideMongoStatus" style="color:var(--success);font-weight:600;">Activo</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
                            <span style="color:var(--text-muted);">Latencia WS</span>
                            <span id="sidePing" class="mono">-- ms</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;">
                            <span style="color:var(--text-muted);">Hora Local</span>
                            <span id="liveClock" class="mono">--:--:--</span>
                        </div>
                    </div>
                    <div style="font-size:11px;color:var(--text-muted);text-align:center;">
                        KYVEN SHOP • Servicio Automático
                    </div>
                </div>
            </aside>

            <!-- Área Principal -->
            <main class="main-area">
                <header class="top-header" id="topHeader">
                    <div class="welcome-block">
                        <h1>
                            <span id="welcomeAdmin">Panel de Administración</span>
                            <span class="badge-status active" style="font-size:11px;">Sesión Verificada</span>
                        </h1>
                        <p id="lastSyncLabel">Última sincronización: --</p>
                    </div>

                    <div class="header-actions">
                        <div class="status-chip" title="Estado de conexión con Discord y MongoDB Atlas">
                            <span class="dot" id="headerHealthDot"></span>
                            <span id="headerBotTag">Conectando...</span>
                        </div>
                        <button class="btn-secondary" onclick="sincronizarManual()" title="Refrescar datos desde MongoDB Atlas">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                            <span>Sincronizar</span>
                        </button>
                        <button class="btn-danger-ghost" onclick="cerrarSesion()" title="Cerrar sesión de forma segura">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                            <span>Salir</span>
                        </button>
                    </div>
                </header>

                <!-- 3 Tarjetas Estadísticas -->
                <section class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-header">
                            <span class="stat-title" title="Total real de miembros almacenados en la colección OAuthToken">Usuarios Verificados</span>
                            <div class="stat-icon">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>
                            </div>
                        </div>
                        <div class="stat-value-row">
                            <div class="stat-number mono" id="statTotalUsers">0</div>
                            <svg class="sparkline-svg" id="sparklineUsers" viewBox="0 0 90 28"></svg>
                        </div>
                        <div class="stat-footer">
                            <span id="statActiveOAuthCount">0 con token activo</span>
                            <span style="color:var(--accent-light);">MongoDB Atlas</span>
                        </div>
                    </div>

                    <div class="stat-card">
                        <div class="stat-header">
                            <span class="stat-title" title="Servidores de Discord donde el bot está presente actualmente">Servidores Conectados</span>
                            <div class="stat-icon">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
                            </div>
                        </div>
                        <div class="stat-value-row">
                            <div class="stat-number mono" id="statTotalGuilds">0</div>
                            <span class="badge-status active" id="statGuildStatusBadge">Operativos</span>
                        </div>
                        <div class="stat-footer">
                            <span id="statTotalReach">Alcance: 0 miembros</span>
                            <span style="color:var(--text-muted);">Permisos OAuth2</span>
                        </div>
                    </div>

                    <div class="stat-card">
                        <div class="stat-header">
                            <span class="stat-title" title="Cola de transferencia con pausa de 1.35s por usuario para evitar bloqueos de Cloudflare/Discord">Motor Anti-Rate Limit</span>
                            <div class="stat-icon">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                            </div>
                        </div>
                        <div class="stat-value-row">
                            <div class="stat-number" id="statQueueStatus" style="font-size:22px;">En Espera</div>
                            <span class="mono" id="statQueuePct" style="color:var(--accent-light);font-weight:600;">0%</span>
                        </div>
                        <div class="stat-footer">
                            <span id="statQueueBreakdown">Unidos: 0 • Ya estaban: 0 • Fallos: 0</span>
                            <span class="mono">1.35s/req</span>
                        </div>
                    </div>
                </section>

                <!-- Transferencia Masiva + Actividad Reciente -->
                <section class="middle-grid" id="restoreSection">
                    <div class="section-card">
                        <div class="section-head">
                            <h2>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-light)" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                                <span>Transferencia Masiva de Miembros</span>
                            </h2>
                            <span style="font-size:12px;color:var(--text-muted);">Límite seguro: 500 por lote</span>
                        </div>

                        <div class="restore-grid-controls">
                            <div>
                                <label class="form-label">Servidor Conectado</label>
                                <select id="guildSelect" class="input-field no-icon"></select>
                            </div>
                            <div>
                                <label class="form-label">O ID de Servidor Manual</label>
                                <input type="text" id="customGuildId" class="input-field no-icon mono" placeholder="Ej: 1547412298145202226" />
                            </div>
                        </div>

                        <div class="restore-bottom-bar">
                            <div style="width:160px;">
                                <label class="form-label">Cantidad (1 - 500)</label>
                                <input type="number" id="pullCountInput" class="input-field no-icon mono" value="500" min="1" max="500" />
                            </div>
                            <button class="btn-primary" style="flex:1;" onclick="solicitarConfirmacionRestore()">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                                <span>Iniciar Restore Seguro</span>
                            </button>
                        </div>

                        <div class="progress-container">
                            <div style="display:flex;justify-content:space-between;font-size:12px;">
                                <span id="restoreProgressLabel" style="color:var(--text-secondary);">Sin operaciones activas en este momento</span>
                                <span id="restoreProgressCounter" class="mono" style="color:var(--accent-light);">0 / 0</span>
                            </div>
                            <div class="progress-track">
                                <div class="progress-fill" id="restoreProgressBar"></div>
                            </div>
                        </div>
                    </div>

                    <div class="section-card">
                        <div class="section-head">
                            <h2>
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-light)" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                                <span>Actividad Reciente del Sistema</span>
                            </h2>
                            <button class="btn-secondary" style="padding:5px 10px;font-size:12px;" onclick="abrirModalHistorial()">Ver historial</button>
                        </div>

                        <div class="activity-feed" id="activityFeedList"></div>
                    </div>
                </section>

                <!-- Tabla Interactiva de Usuarios -->
                <section class="section-card" id="usersSection">
                    <div class="section-head">
                        <h2>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-light)" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                            <span>Directorio de Miembros Verificados (OAuth2)</span>
                        </h2>
                        <span id="tableCountSummary" style="font-size:12.5px;color:var(--text-secondary);">Mostrando 0 usuarios</span>
                    </div>

                    <div class="table-toolbar">
                        <div class="toolbar-left">
                            <div class="input-wrapper" style="width:100%;">
                                <svg class="input-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                                <input type="text" id="searchInput" class="input-field" placeholder="Buscar instantáneamente por usuario o ID de Discord..." oninput="aplicarFiltrosYRender(1)" />
                            </div>
                        </div>

                        <div class="toolbar-right">
                            <select id="filterOAuthStatus" class="select-pro" onchange="aplicarFiltrosYRender(1)">
                                <option value="all">Estado: Todos</option>
                                <option value="active">OAuth2 Activo</option>
                                <option value="refreshed">Token Renovado</option>
                                <option value="expired">Token Expirado</option>
                            </select>

                            <select id="sortCriteria" class="select-pro" onchange="aplicarFiltrosYRender(1)">
                                <option value="verify_desc">Verificación: Más recientes</option>
                                <option value="verify_asc">Verificación: Más antiguos</option>
                                <option value="created_desc">Creación registro: Más recientes</option>
                                <option value="created_asc">Creación registro: Más antiguos</option>
                            </select>
                        </div>
                    </div>

                    <div class="table-wrapper">
                        <table>
                            <thead>
                                <tr>
                                    <th>Miembro</th>
                                    <th>ID de Discord</th>
                                    <th>Estado OAuth2</th>
                                    <th>Fecha de Verificación</th>
                                    <th>Creación de Cuenta Discord</th>
                                    <th style="text-align:right;">Acción</th>
                                </tr>
                            </thead>
                            <tbody id="usersTableBody">
                                <tr>
                                    <td colspan="6"><div class="skeleton"></div></td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    <div class="pagination-bar">
                        <span id="paginationInfo">Página 1 de 1</span>
                        <div class="page-buttons">
                            <button class="btn-secondary" id="prevPageBtn" onclick="cambiarPagina(-1)">Anterior</button>
                            <button class="btn-secondary" id="nextPageBtn" onclick="cambiarPagina(1)">Siguiente</button>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    </div>

    <!-- ==========================================================
         3. USER DETAILS DRAWER (PANEL LATERAL DE INSPECCIÓN)
         ========================================================== -->
    <div class="drawer-backdrop" id="drawerBackdrop" onclick="cerrarUserDrawer()"></div>
    <aside class="user-drawer" id="userDrawer" aria-hidden="true">
        <div class="drawer-header">
            <div class="drawer-profile-summary">
                <img id="dwAvatar" class="drawer-avatar-lg" src="https://cdn.discordapp.com/embed/avatars/0.png" alt="Avatar" />
                <div>
                    <div id="dwUsername" style="font-size:17px;font-weight:700;color:#fff;">Usuario</div>
                    <div id="dwUserId" class="mono" style="font-size:12px;color:var(--accent-light);margin-top:2px;">000000000000000000</div>
                    <div id="dwStatusBadgeWrap" style="margin-top:6px;"></div>
                </div>
            </div>
            <button class="drawer-close-btn" onclick="cerrarUserDrawer()" title="Cerrar panel (Esc)">✕</button>
        </div>

        <div class="drawer-content">
            <div class="drawer-quick-actions">
                <button class="btn-Fact" onclick="copiarTextoDrawer('id')">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    <span>Copiar ID</span>
                </button>
                <button class="btn-Fact" onclick="copiarTextoDrawer('username')">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    <span>Copiar Nombre</span>
                </button>
                <a id="dwDiscordProfileLink" class="btn-Fact" href="#" target="_blank" rel="noopener noreferrer">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    <span>Abrir Perfil</span>
                </a>
            </div>

            <div>
                <div style="font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">
                    Metadatos del Usuario y Registro
                </div>
                <div class="info-grid-card">
                    <div>
                        <div class="info-cell-label">Fecha de Verificación</div>
                        <div class="info-cell-val" id="dwVerifiedAt">--</div>
                    </div>
                    <div>
                        <div class="info-cell-label">Creación Cuenta Discord</div>
                        <div class="info-cell-val" id="dwDiscordCreated">--</div>
                    </div>
                    <div>
                        <div class="info-cell-label">Creación en Base de Datos</div>
                        <div class="info-cell-val" id="dwDbCreated">--</div>
                    </div>
                    <div>
                        <div class="info-cell-label">Última Actualización</div>
                        <div class="info-cell-val" id="dwDbUpdated">--</div>
                    </div>
                    <div style="grid-column: span 2;">
                        <div class="info-cell-label">Última Actividad Registrada</div>
                        <div class="info-cell-val" id="dwLastActivity">--</div>
                    </div>
                </div>
            </div>

            <div>
                <div style="font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">
                    Servidores Asociados en el Sistema
                </div>
                <div id="dwServersList" style="display:flex;flex-direction:column;gap:8px;"></div>
            </div>

            <div>
                <div style="font-size:12px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:10px;">
                    Historial de Eventos del Usuario
                </div>
                <div class="timeline-list" id="dwTimeline"></div>
            </div>
        </div>
    </aside>

    <!-- ==========================================================
         4. MODAL DE CONFIRMACIÓN DE RESTORE E HISTORIAL COMPLETO
         ========================================================== -->
    <div class="modal-overlay" id="confirmRestoreModal">
        <div class="modal-box">
            <h3 style="font-size:17px;font-weight:600;margin-bottom:10px;">Confirmar Operación de Restauración</h3>
            <p id="confirmRestoreDesc" style="color:var(--text-secondary);font-size:13.5px;margin-bottom:20px;"></p>
            <div style="display:flex;justify-content:flex-end;gap:10px;">
                <button class="btn-secondary" onclick="cerrarModalConfirm()">Cancelar</button>
                <button class="btn-primary" style="width:auto;" onclick="confirmarYEjecutarRestore()">Confirmar e Iniciar</button>
            </div>
        </div>
    </div>

    <div class="modal-overlay" id="fullActivityModal">
        <div class="modal-box" style="max-width:620px;">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <h3 style="font-size:17px;font-weight:600;">Historial Completo de Actividad del Sistema</h3>
                <button class="drawer-close-btn" onclick="cerrarModalHistorial()">✕</button>
            </div>
            <div class="activity-feed" id="fullActivityModalList" style="max-height:420px;"></div>
        </div>
    </div>

    <div class="toast-container" id="toastContainer"></div>

    <!-- ==========================================================
         LÓGICA DEL FRONTEND
         ========================================================== -->
    <script>
        let sessionToken = sessionStorage.getItem('kyven_session') || '';
        let todosLosUsuarios = [];
        let usuariosFiltrados = [];
        let actividadesSistema = [];
        let paginaActual = 1;
        const filasPorPagina = 12;
        let usuarioSeleccionadoDrawer = null;
        let pollInterval = null;

        // 1. Reloj en tiempo real y salud pública inicial
        function actualizarReloj() {
            const el = document.getElementById('liveClock');
            if (el) el.textContent = new Date().toLocaleTimeString('es-AR', { hour12: false });
        }
        setInterval(actualizarReloj, 1000);
        actualizarReloj();

        async function verificarSaludPublica() {
            try {
                const res = await fetch('/api/public-health');
                if (!res.ok) return;
                const data = await res.json();
                const mDot = document.getElementById('loginMongoDot');
                const bDot = document.getElementById('loginBotDot');
                if (mDot) mDot.className = 'dot ' + (data.mongoConnected ? '' : 'danger');
                if (bDot) bDot.className = 'dot ' + (data.botReady ? '' : 'warn');
            } catch (e) {}
        }
        verificarSaludPublica();

        // 2. Obtener fecha legítima de creación de cuenta Discord desde su Snowflake ID
        function obtenerFechaSnowflakeDiscord(userId) {
            try {
                if (!userId || !/^\\d{17,20}$/.test(String(userId))) return null;
                const DISCORD_EPOCH = 1420070400000n;
                const timestampMs = Number((BigInt(userId) >> 22n) + DISCORD_EPOCH);
                const d = new Date(timestampMs);
                return isNaN(d.getTime()) ? null : d;
            } catch (e) {
                return null;
            }
        }

        function formatearFecha(isoString) {
            if (!isoString) return 'No disponible';
            const d = new Date(isoString);
            if (isNaN(d.getTime())) return 'No disponible';
            return d.toLocaleString('es-AR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
        }

        function mostrarToast(mensaje) {
            const wrap = document.getElementById('toastContainer');
            const item = document.createElement('div');
            item.className = 'toast';
            item.innerHTML = '<span>⚡</span><span>' + mensaje + '</span>';
            wrap.appendChild(item);
            setTimeout(() => {
                item.style.opacity = '0';
                setTimeout(() => item.remove(), 250);
            }, 3600);
        }

        // 3. Autenticación y Carga de Datos
        async function handleLogin() {
            const username = document.getElementById('loginUser').value.trim();
            const pin = document.getElementById('loginPin').value.trim();
            const alertBox = document.getElementById('loginAlertBox');
            const alertText = document.getElementById('loginAlertText');
            const btn = document.getElementById('loginBtn');
            const btnText = document.getElementById('loginBtnText');

            alertBox.style.display = 'none';
            btn.disabled = true;
            btnText.textContent = 'Verificando credenciales...';

            try {
                const res = await fetch('/api/dashboard-login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, pin })
                });
                const data = await res.json();

                if (!res.ok) {
                    alertText.textContent = data.error || 'Credenciales incorrectas.';
                    alertBox.style.display = 'flex';
                    btn.disabled = false;
                    btnText.textContent = 'Autenticar en Control Center';
                    return;
                }

                sessionToken = data.sessionToken;
                sessionStorage.setItem('kyven_session', sessionToken);
                mostrarToast('Bienvenido al centro de control, ' + (data.adminName || 'Administrador'));
                await cargarDashboardData();
            } catch (err) {
                alertText.textContent = 'Error de red al conectar con el servidor.';
                alertBox.style.display = 'flex';
            } finally {
                btn.disabled = false;
                btnText.textContent = 'Autenticar en Control Center';
            }
        }

        async function cargarDashboardData(silencioso = false) {
            if (!sessionToken) return;
            try {
                const res = await fetch('/api/dashboard-stats', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionToken })
                });

                if (!res.ok) {
                    sessionStorage.removeItem('kyven_session');
                    sessionToken = '';
                    document.getElementById('loginScreen').style.display = 'flex';
                    document.getElementById('dashboardApp').style.display = 'none';
                    return;
                }

                const data = await res.json();

                document.getElementById('loginScreen').style.display = 'none';
                document.getElementById('dashboardApp').style.display = 'block';

                document.getElementById('welcomeAdmin').textContent = 'Bienvenido, ' + (data.adminName || 'KyvenAdmin');
                document.getElementById('lastSyncLabel').textContent = 'Última sincronización: ' + new Date().toLocaleTimeString('es-AR');

                // Salud del sistema
                const sh = data.systemHealth || {};
                document.getElementById('headerBotTag').textContent = sh.botTag || 'Bot Activo';
                document.getElementById('headerHealthDot').className = 'dot ' + (sh.mongoConnected && sh.botReady ? '' : 'warn');
                document.getElementById('sideMongoStatus').textContent = sh.mongoConnected ? 'Conectado' : 'Desconectado';
                document.getElementById('sidePing').textContent = (sh.botPing || 0) + ' ms';

                // Contadores animados
                animarContador('statTotalUsers', data.total || 0);
                animarContador('statTotalGuilds', (data.guilds || []).length);

                const activosCount = (data.users || []).filter(u => u.oauth_status !== 'expired').length;
                document.getElementById('statActiveOAuthCount').textContent = activosCount + ' con autorización OAuth2 activa';

                const reach = (data.guilds || []).reduce((acc, g) => acc + (g.count || 0), 0);
                document.getElementById('statTotalReach').textContent = 'Alcance combinado: ' + reach + ' miembros';

                // Estado del Motor Restore
                const p = data.progresoRestore || {};
                const pct = p.total > 0 ? Math.round((p.procesados / p.total) * 100) : 0;
                document.getElementById('statQueueStatus').textContent = p.activo ? 'Procesando Lote' : 'En Espera';
                document.getElementById('statQueuePct').textContent = pct + '%';
                document.getElementById('statQueueBreakdown').textContent =
                    'Unidos: ' + (p.unidos || 0) + ' • Presentes: ' + (p.yaEstaban || 0) + ' • Fallos: ' + (p.fallidos || 0);

                document.getElementById('restoreProgressBar').style.width = pct + '%';
                document.getElementById('restoreProgressCounter').textContent = (p.procesados || 0) + ' / ' + (p.total || 0);
                document.getElementById('restoreProgressLabel').textContent = p.activo
                    ? 'Transfiriendo miembros de forma segura (1.35s por usuario)...'
                    : (p.finishedAt ? 'Última operación finalizada (' + formatearFecha(p.finishedAt) + ')' : 'Motor listo para ejecutar transferencia');

                // Selector de servidores
                const selectGuild = document.getElementById('guildSelect');
                const valorPrevio = selectGuild.value;
                selectGuild.innerHTML = (data.guilds || []).length > 0
                    ? data.guilds.map(g => '<option value="' + g.id + '">' + g.name + ' (' + g.count + ' miembros)</option>').join('')
                    : '<option value="">Sin servidores detectados en caché</option>';
                if (valorPrevio) selectGuild.value = valorPrevio;

                // Usuarios y Sparkline real
                todosLosUsuarios = data.users || [];
                dibujarSparklineUsuarios(todosLosUsuarios);
                aplicarFiltrosYRender(silencioso ? paginaActual : 1);

                // Actividades recientes
                actividadesSistema = data.activities || [];
                renderizarActividades();

                if (!pollInterval) {
                    pollInterval = setInterval(() => cargarDashboardData(true), 8000);
                }
            } catch (e) {}
        }

        function animarContador(elementId, valorFinal) {
            const el = document.getElementById(elementId);
            if (!el) return;
            const valorInicial = parseInt(el.textContent.replace(/\\D/g, ''), 10) || 0;
            if (valorInicial === valorFinal) {
                el.textContent = valorFinal;
                return;
            }
            const duracion = 320;
            const inicio = performance.now();
            function step(now) {
                const prog = Math.min((now - inicio) / duracion, 1);
                el.textContent = Math.floor(valorInicial + (valorFinal - valorInicial) * prog);
                if (prog < 1) requestAnimationFrame(step);
            }
            requestAnimationFrame(step);
        }

        function dibujarSparklineUsuarios(users) {
            const svg = document.getElementById('sparklineUsers');
            if (!svg) return;
            if (!users || users.length === 0) {
                svg.innerHTML = '<line x1="0" y1="24" x2="90" y2="24" stroke="rgba(168,85,247,0.3)" stroke-width="2"/>';
                return;
            }
            // Agrupar verificaciones reales en los últimos 7 días
            const hoy = new Date();
            const conteoDias = [0, 0, 0, 0, 0, 0, 0];
            users.forEach(u => {
                const d = new Date(u.fecha);
                if (!isNaN(d.getTime())) {
                    const diffDays = Math.floor((hoy - d) / (1000 * 60 * 60 * 24));
                    if (diffDays >= 0 && diffDays < 7) {
                        conteoDias[6 - diffDays]++;
                    }
                }
            });
            const maxVal = Math.max(...conteoDias, 1);
            const puntos = conteoDias.map((val, idx) => {
                const x = Math.round((idx / 6) * 86) + 2;
                const y = 24 - Math.round((val / maxVal) * 20);
                return x + ',' + y;
            }).join(' ');
            svg.innerHTML = '<polyline fill="none" stroke="#a855f7" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" points="' + puntos + '"/>';
        }

        // 4. Tabla, Búsqueda, Filtros y Paginación
        function aplicarFiltrosYRender(nuevaPagina) {
            if (nuevaPagina) paginaActual = nuevaPagina;
            const q = (document.getElementById('searchInput')?.value || '').trim().toLowerCase();
            const statusFilter = document.getElementById('filterOAuthStatus')?.value || 'all';
            const sortBy = document.getElementById('sortCriteria')?.value || 'verify_desc';

            usuariosFiltrados = todosLosUsuarios.filter(u => {
                const matchText = !q || (u.username || '').toLowerCase().includes(q) || String(u.user_id).includes(q);
                const st = u.oauth_status || 'active';
                const matchStatus = statusFilter === 'all' || st === statusFilter;
                return matchText && matchStatus;
            });

            usuariosFiltrados.sort((a, b) => {
                const tVerifyA = new Date(a.fecha || 0).getTime();
                const tVerifyB = new Date(b.fecha || 0).getTime();
                const tCreateA = new Date(a.created_at || a.fecha || 0).getTime();
                const tCreateB = new Date(b.created_at || b.fecha || 0).getTime();

                if (sortBy === 'verify_desc') return tVerifyB - tVerifyA;
                if (sortBy === 'verify_asc') return tVerifyA - tVerifyB;
                if (sortBy === 'created_desc') return tCreateB - tCreateA;
                if (sortBy === 'created_asc') return tCreateA - tCreateB;
                return 0;
            });

            const totalPaginas = Math.max(Math.ceil(usuariosFiltrados.length / filasPorPagina), 1);
            if (paginaActual > totalPaginas) paginaActual = totalPaginas;

            const inicio = (paginaActual - 1) * filasPorPagina;
            const paginaItems = usuariosFiltrados.slice(inicio, inicio + filasPorPagina);

            document.getElementById('tableCountSummary').textContent =
                'Mostrando ' + paginaItems.length + ' de ' + usuariosFiltrados.length + ' usuarios';
            document.getElementById('paginationInfo').textContent =
                'Página ' + paginaActual + ' de ' + totalPaginas;

            document.getElementById('prevPageBtn').disabled = paginaActual <= 1;
            document.getElementById('nextPageBtn').disabled = paginaActual >= totalPaginas;

            const tbody = document.getElementById('usersTableBody');
            if (paginaItems.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:34px;color:var(--text-muted);">No se encontraron usuarios verificados que coincidan con los criterios actuales.</td></tr>';
                return;
            }

            tbody.innerHTML = paginaItems.map(u => {
                const st = u.oauth_status || 'active';
                const stLabel = st === 'active' ? 'OAuth2 Activo' : (st === 'refreshed' ? 'Token Renovado' : 'Expirado');
                const fechaCreacionDiscord = obtenerFechaSnowflakeDiscord(u.user_id);
                const creacionDiscordStr = fechaCreacionDiscord
                    ? fechaCreacionDiscord.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
                    : 'No disponible';

                return '<tr onclick="abrirUserDrawer(\\'' + u.user_id + '\\')">' +
                    '<td><div class="user-cell-flex">' +
                        '<img class="user-avatar" src="' + u.avatar + '" onerror="this.src=\\'https://cdn.discordapp.com/embed/avatars/0.png\\'" alt="" />' +
                        '<div><div style="font-weight:600;color:#fff;">' + escaparHtml(u.username) + '</div>' +
                        '<div style="font-size:11.5px;color:var(--text-muted);">Click para inspeccionar ficha</div></div>' +
                    '</div></td>' +
                    '<td class="mono" style="color:var(--accent-light);font-size:12.5px;">' + u.user_id + '</td>' +
                    '<td><span class="badge-status ' + st + '">● ' + stLabel + '</span></td>' +
                    '<td style="color:var(--text-secondary);">' + formatearFecha(u.fecha) + '</td>' +
                    '<td style="color:var(--text-secondary);">' + creacionDiscordStr + '</td>' +
                    '<td style="text-align:right;"><button class="btn-secondary" style="padding:5px 10px;font-size:12px;">Detalles →</button></td>' +
                '</tr>';
            }).join('');
        }

        function cambiarPagina(delta) {
            aplicarFiltrosYRender(paginaActual + delta);
        }

        function escaparHtml(str) {
            return String(str || '').replace(/[&<>"']/g, s => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            }[s]));
        }

        // 5. User Details Drawer
        function abrirUserDrawer(userId) {
            const u = todosLosUsuarios.find(item => String(item.user_id) === String(userId));
            if (!u) return;
            usuarioSeleccionadoDrawer = u;

            document.getElementById('dwAvatar').src = u.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png';
            document.getElementById('dwUsername').textContent = u.username || 'Usuario';
            document.getElementById('dwUserId').textContent = u.user_id;

            const st = u.oauth_status || 'active';
            const stLabel = st === 'active' ? 'OAuth2 Autorizado y Activo' : (st === 'refreshed' ? 'OAuth2 Renovado' : 'Token Expirado');
            document.getElementById('dwStatusBadgeWrap').innerHTML = '<span class="badge-status ' + st + '">● ' + stLabel + '</span>';

            document.getElementById('dwDiscordProfileLink').href = 'https://discord.com/users/' + u.user_id;

            const discordCreated = obtenerFechaSnowflakeDiscord(u.user_id);
            document.getElementById('dwVerifiedAt').textContent = formatearFecha(u.fecha);
            document.getElementById('dwDiscordCreated').textContent = discordCreated ? formatearFecha(discordCreated.toISOString()) : 'No disponible';
            document.getElementById('dwDbCreated').textContent = formatearFecha(u.created_at || u.fecha);
            document.getElementById('dwDbUpdated').textContent = formatearFecha(u.updated_at || u.fecha);
            document.getElementById('dwLastActivity').textContent = formatearFecha(u.updated_at || u.fecha);

            const serversWrap = document.getElementById('dwServersList');
            if (Array.isArray(u.servers_associated) && u.servers_associated.length > 0) {
                serversWrap.innerHTML = u.servers_associated.map(s =>
                    '<div style="background:rgba(15,12,26,0.75);border:1px solid var(--border-subtle);border-radius:8px;padding:9px 12px;display:flex;justify-content:space-between;align-items:center;">' +
                        '<span style="font-weight:500;">' + escaparHtml(s.name) + '</span>' +
                        '<span class="mono" style="font-size:11.5px;color:var(--text-muted);">' + s.id + '</span>' +
                    '</div>'
                ).join('');
            } else {
                serversWrap.innerHTML = '<div style="color:var(--text-muted);font-size:12.5px;">No disponible</div>';
            }

            const tl = document.getElementById('dwTimeline');
            const hist = Array.isArray(u.history) ? [...u.history].reverse() : [];
            tl.innerHTML = hist.map(h =>
                '<div class="timeline-node">' +
                    '<div style="font-weight:600;font-size:12.5px;color:#fff;">' + escaparHtml(h.event) + '</div>' +
                    '<div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">' + escaparHtml(h.detail || '') + '</div>' +
                    '<div class="mono" style="font-size:11px;color:var(--text-muted);margin-top:4px;">' + formatearFecha(h.timestamp) + '</div>' +
                '</div>'
            ).join('');

            document.getElementById('drawerBackdrop').classList.add('open');
            document.getElementById('userDrawer').classList.add('open');
        }

        function cerrarUserDrawer() {
            document.getElementById('drawerBackdrop').classList.remove('open');
            document.getElementById('userDrawer').classList.remove('open');
        }

        function copiarTextoDrawer(tipo) {
            if (!usuarioSeleccionadoDrawer) return;
            const texto = tipo === 'id' ? usuarioSeleccionadoDrawer.user_id : usuarioSeleccionadoDrawer.username;
            navigator.clipboard.writeText(texto);
            mostrarToast('Copiado al portapapeles: ' + texto);
        }

        // Cerrar con tecla Escape
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                cerrarUserDrawer();
                cerrarModalConfirm();
                cerrarModalHistorial();
            }
        });

        // 6. Actividades del Sistema y Restauración con Confirmación
        function renderizarActividades() {
            const feed = document.getElementById('activityFeedList');
            const fullFeed = document.getElementById('fullActivityModalList');
            if (!actividadesSistema || actividadesSistema.length === 0) {
                const emptyHtml = '<div style="color:var(--text-muted);font-size:12.5px;padding:12px;">Sin eventos recientes registrados.</div>';
                if (feed) feed.innerHTML = emptyHtml;
                if (fullFeed) fullFeed.innerHTML = emptyHtml;
                return;
            }

            const mapIcon = (type) => {
                if (type === 'verify') return '✓';
                if (type === 'restore_start' || type === 'restore_end') return '⇄';
                if (type === 'error') return '!';
                return '●';
            };

            const buildHtml = (arr) => arr.map(a =>
                '<div class="activity-item">' +
                    '<div class="act-icon">' + mapIcon(a.type) + '</div>' +
                    '<div class="act-body">' +
                        '<div class="act-title">' + escaparHtml(a.description) + '</div>' +
                        '<div class="act-meta">' + (a.meta ? escaparHtml(a.meta) + ' • ' : '') + formatearFecha(a.timestamp) + '</div>' +
                    '</div>' +
                '</div>'
            ).join('');

            if (feed) feed.innerHTML = buildHtml(actividadesSistema.slice(0, 5));
            if (fullFeed) fullFeed.innerHTML = buildHtml(actividadesSistema);
        }

        function solicitarConfirmacionRestore() {
            const guildId = document.getElementById('customGuildId').value.trim() || document.getElementById('guildSelect').value;
            const cantidad = document.getElementById('pullCountInput').value;
            if (!guildId) {
                mostrarToast('Selecciona un servidor o ingresa un ID válido');
                return;
            }
            document.getElementById('confirmRestoreDesc').textContent =
                'Estás a punto de transferir hasta ' + cantidad + ' miembros verificados hacia el servidor ID ' + guildId + '. El motor aplicará una cadencia segura de 1.35s por usuario.';
            document.getElementById('confirmRestoreModal').classList.add('active');
        }

        function cerrarModalConfirm() {
            document.getElementById('confirmRestoreModal').classList.remove('active');
        }

        async function confirmarYEjecutarRestore() {
            cerrarModalConfirm();
            const guildId = document.getElementById('customGuildId').value.trim() || document.getElementById('guildSelect').value;
            const cantidad = document.getElementById('pullCountInput').value;

            const res = await fetch('/api/dashboard-pull', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionToken, guildId, cantidad })
            });
            const data = await res.json();
            mostrarToast(data.message || data.error);
            cargarDashboardData(true);
        }

        function abrirModalHistorial() {
            renderizarActividades();
            document.getElementById('fullActivityModal').classList.add('active');
        }

        function cerrarModalHistorial() {
            document.getElementById('fullActivityModal').classList.remove('active');
        }

        async function sincronizarManual() {
            await cargarDashboardData(true);
            mostrarToast('Datos sincronizados con MongoDB Atlas');
        }

        function scrollToSection(id) {
            const el = document.getElementById(id);
            if (el) el.scrollIntoView({ behavior: 'smooth' });
        }

        function cerrarSesion() {
            sessionStorage.removeItem('kyven_session');
            location.reload();
        }

        // 7. Motor Canvas de Partículas y Constelaciones Interactivas (Login)
        (function iniciarCanvasLogin() {
            const canvas = document.getElementById('particleCanvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            let width = canvas.width = window.innerWidth;
            let height = canvas.height = window.innerHeight;

            const mouse = { x: width / 2, y: height / 2, active: false };
            window.addEventListener('mousemove', (e) => {
                mouse.x = e.clientX;
                mouse.y = e.clientY;
                mouse.active = true;
            });
            window.addEventListener('resize', () => {
                width = canvas.width = window.innerWidth;
                height = canvas.height = window.innerHeight;
            });

            const numParticulas = Math.min(Math.floor((width * height) / 16000), 75);
            const particulas = Array.from({ length: numParticulas }, () => ({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 0.35,
                vy: (Math.random() - 0.5) * 0.35,
                r: Math.random() * 1.8 + 0.8,
                depth: Math.random() * 0.6 + 0.4
            }));

            function animar() {
                if (document.getElementById('loginScreen').style.display === 'none') {
                    requestAnimationFrame(animar);
                    return;
                }
                ctx.clearRect(0, 0, width, height);

                for (let i = 0; i < particulas.length; i++) {
                    const p = particulas[i];
                    p.x += p.vx * p.depth;
                    p.y += p.vy * p.depth;

                    if (p.x < 0 || p.x > width) p.vx *= -1;
                    if (p.y < 0 || p.y > height) p.vy *= -1;

                    const parallaxX = mouse.active ? (mouse.x - width / 2) * 0.015 * p.depth : 0;
                    const parallaxY = mouse.active ? (mouse.y - height / 2) * 0.015 * p.depth : 0;
                    const px = p.x + parallaxX;
                    const py = p.y + parallaxY;

                    ctx.beginPath();
                    ctx.arc(px, py, p.r, 0, Math.PI * 2);
                    ctx.fillStyle = 'rgba(192, 132, 252, ' + (0.35 * p.depth) + ')';
                    ctx.fill();

                    for (let j = i + 1; j < particulas.length; j++) {
                        const p2 = particulas[j];
                        const p2x = p2.x + (mouse.active ? (mouse.x - width / 2) * 0.015 * p2.depth : 0);
                        const p2y = p2.y + (mouse.active ? (mouse.y - height / 2) * 0.015 * p2.depth : 0);
                        const dist = Math.hypot(px - p2x, py - p2y);
                        if (dist < 130) {
                            ctx.beginPath();
                            ctx.moveTo(px, py);
                            ctx.lineTo(p2x, p2y);
                            ctx.strokeStyle = 'rgba(168, 85, 247, ' + ((1 - dist / 130) * 0.18) + ')';
                            ctx.lineWidth = 0.8;
                            ctx.stroke();
                        }
                    }

                    if (mouse.active) {
                        const dMouse = Math.hypot(px - mouse.x, py - mouse.y);
                        if (dMouse < 160) {
                            ctx.beginPath();
                            ctx.moveTo(px, py);
                            ctx.lineTo(mouse.x, mouse.y);
                            ctx.strokeStyle = 'rgba(192, 132, 252, ' + ((1 - dMouse / 160) * 0.28) + ')';
                            ctx.lineWidth = 1;
                            ctx.stroke();
                        }
                    }
                }
                requestAnimationFrame(animar);
            }
            requestAnimationFrame(animar);
        })();

        if (sessionToken) cargarDashboardData();
    </script>
</body>
</html>`);
});

app.listen(PORT, () => {
    console.log(`🌐 KYVEN RESTORE • CONTROL CENTER activo en el puerto ${PORT}`);
});

// ==========================================================
// 6. BOT DE DISCORD CON VENTANA MODAL DE SEGURIDAD (INTOCABLE)
// ==========================================================
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});
client.commands = new Collection();

const slashCommands = [];
const commandsPath = path.join(__dirname, 'commands');

if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            const jsonCmd = command.data.toJSON();
            if (!jsonCmd.options) jsonCmd.options = [];
            const tieneCodigo = jsonCmd.options.some(o => o.name === 'codigo');
            if (!tieneCodigo && jsonCmd.options.every(o => o.type !== 1 && o.type !== 2)) {
                jsonCmd.options.push({
                    name: 'codigo',
                    description: 'Código de seguridad personal (o déjalo vacío para abrir ventana de PIN)',
                    type: 3,
                    required: false
                });
            }
            client.commands.set(jsonCmd.name, command);
            slashCommands.push(jsonCmd);
        }
        if (typeof command.initDetector === 'function') {
            command.initDetector(client);
        }
    }
}

const pullCmd = new SlashCommandBuilder()
    .setName('restore_pull')
    .setDescription('Transfiere hasta 500 miembros de MongoDB a este servidor sin bloqueos')
    .addStringOption(opt => opt.setName('codigo').setDescription('Tu código de seguridad personal').setRequired(false))
    .addIntegerOption(opt => opt.setName('cantidad').setDescription('Cantidad de miembros (1 a 500)').setMinValue(1).setMaxValue(500).setRequired(false));

slashCommands.push(pullCmd.toJSON());

client.once('ready', async () => {
    console.log(`🤖 Bot encendido como: ${client.user.tag}`);
    await registrarActividadSistema('system', `Bot de Discord conectado como ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: slashCommands });
        for (const [guildId] of client.guilds.cache) {
            await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: slashCommands }).catch(() => {});
        }
        console.log('✅ Comandos Slash sincronizados al instante en todos los servidores.');
    } catch (error) {
        console.error(error);
    }
});

client.on('guildCreate', async (guild) => {
    await registrarActividadSistema('guild', `Nuevo servidor vinculado al bot: ${guild.name}`, `ID: ${guild.id}`);
});

async function procesarComandoAutorizado(interaction) {
    if (interaction.commandName === 'restore_pull') {
        if (restoreEnCurso) {
            return await interaction.reply({
                content: `⏳ Ya hay una transferencia activa (${progresoRestore.procesados}/${progresoRestore.total}).`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        const cantidad = interaction.options?.getInteger?.('cantidad') || 500;
        const totalEnDb = await OAuthToken.countDocuments();

        if (totalEnDb === 0) {
            return await interaction.reply({
                content: '❌ Todavía no hay usuarios registrados en MongoDB.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        await interaction.reply({
            content: `🚀 **Iniciando Restore de hasta ${cantidad} miembros** en **${interaction.guild.name}**.\nModo Anti-Bloqueo activo (1.35s por usuario).`,
            flags: [MessageFlags.Ephemeral]
        });

        transferirMiembrosSeguro(interaction.guild.id, cantidad).then(async (res) => {
            await interaction.followUp({
                content: `✅ **Restore Completado:**\n• **Unidos:** ${res.unidos}\n• **Ya estaban:** ${res.yaEstaban}\n• **Fallidos:** ${res.fallidos}`,
                flags: [MessageFlags.Ephemeral]
            }).catch(() => {});
        });
        return;
    }

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction, dbAdapter);
    } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: '❌ Hubo un error al ejecutar este comando.', flags: [MessageFlags.Ephemeral] });
        } else {
            await interaction.reply({ content: '❌ Hubo un error al ejecutar este comando.', flags: [MessageFlags.Ephemeral] });
        }
    }
}

client.on('interactionCreate', async interaction => {
    if (interaction.isModalSubmit() && interaction.customId.startsWith('pin_modal_')) {
        const pinEscrito = interaction.fields.getTextInputValue('pin_input').trim();
        const cmdName = interaction.customId.replace('pin_modal_', '');

        if (pinEscrito !== CODIGO_SECRETO) {
            return await interaction.reply({
                content: '❌ **Código de seguridad personal incorrecto.** Operación cancelada.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        interaction.commandName = cmdName;
        return await procesarComandoAutorizado(interaction);
    }

    if (!interaction.isChatInputCommand()) return;

    const esOwner = !OWNER_ID || interaction.user.id === OWNER_ID || (interaction.guild && interaction.guild.ownerId === interaction.user.id);
    if (!esOwner) {
        return await interaction.reply({
            content: `🛑 **Acceso Bloqueado:** Tu ID (\`${interaction.user.id}\`) no está autorizada como propietario de este bot.`,
            flags: [MessageFlags.Ephemeral]
        });
    }

    const codigoIngresado = interaction.options.getString('codigo');

    if (!codigoIngresado) {
        const modal = new ModalBuilder()
            .setCustomId(`pin_modal_${interaction.commandName}`)
            .setTitle('🔐 Verificación de Seguridad Kyven');

        const inputPin = new TextInputBuilder()
            .setCustomId('pin_input')
            .setLabel('Ingresa tu código de seguridad personal')
            .setPlaceholder('Escribe tu BACKUP_PIN para ejecutar /' + interaction.commandName)
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(inputPin));
        return await interaction.showModal(modal);
    }

    if (codigoIngresado.trim() !== CODIGO_SECRETO) {
        return await interaction.reply({
            content: '🛑 **Código Incorrecto:** El código de seguridad personal ingresado no es válido.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    await procesarComandoAutorizado(interaction);
});

client.login(process.env.TOKEN);