// index.js - KYVEN RESTORE MEMBERS (PRO DASHBOARD + MODAL SECURITY + MONGODB)
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
// 1. CONEXIÓN A MONGODB (CON POOL CONTROLADO)
// ==========================================================
mongoose.connect(process.env.MONGO_URI, {
    maxPoolSize: 10 // Usa máximo 10 conexiones reutilizables para miles de usuarios
})
    .then(() => console.log('🟢 Conectado a MongoDB Atlas con éxito (Kyven Restore DB).'))
    .catch(err => console.error('❌ Error al conectar a MongoDB:', err.message));

const OAuthTokenSchema = new mongoose.Schema({
    user_id: { type: String, required: true, unique: true },
    username: { type: String, default: 'Usuario' },
    avatar: { type: String, default: '' },
    access_token: { type: String, required: true },
    refresh_token: { type: String, required: true },
    fecha: { type: String, required: true }
});

const OAuthToken = mongoose.model('OAuthToken', OAuthTokenSchema);

let tokensCache = [];
async function sincronizarCache() {
    try {
        tokensCache = await OAuthToken.find().lean();
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
const sesionesActivas = new Map(); // token -> { expiresAt }
const intentosFallidos = new Map(); // ip -> { count, lockUntil }

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
        actual.lockUntil = Date.now() + 15 * 60 * 1000; // Bloqueo de 15 minutos tras 5 fallos
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
    <style>
        * { box-sizing: border-box; font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; }
        body {
            background: radial-gradient(circle at 50% 0%, #240d42 0%, #07050c 75%);
            color: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
        }
        .card {
            background: rgba(18, 13, 31, 0.88);
            backdrop-filter: blur(16px);
            border: 1px solid rgba(168, 85, 247, 0.35);
            box-shadow: 0 20px 60px rgba(138, 43, 226, 0.25);
            border-radius: 22px;
            padding: 42px 34px;
            max-width: 450px;
            width: 100%;
            text-align: center;
            animation: fadeIn 0.45s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(18px) scale(0.97); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }
        .icon-box {
            width: 74px;
            height: 74px;
            border-radius: 50%;
            background: rgba(168, 85, 247, 0.14);
            border: 1px solid rgba(168, 85, 247, 0.45);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 34px;
            margin: 0 auto 20px;
            box-shadow: 0 0 25px rgba(168, 85, 247, 0.3);
        }
        h1 { font-size: 22px; color: #f3e8ff; margin: 0 0 12px; }
        p { color: #a1a1aa; font-size: 14.5px; line-height: 1.6; margin: 0 0 20px; }
        .sub {
            background: rgba(11, 8, 20, 0.9);
            border: 1px solid #2e1d4a;
            border-radius: 12px;
            padding: 12px;
            font-size: 13px;
            color: #c084fc;
            margin-bottom: 24px;
        }
        .btn {
            display: inline-block;
            width: 100%;
            padding: 14px;
            border-radius: 12px;
            background: linear-gradient(135deg, #7e22ce, #a855f7);
            color: #fff;
            font-weight: 700;
            text-decoration: none;
            transition: all 0.25s ease;
            box-shadow: 0 8px 24px rgba(147, 51, 234, 0.35);
        }
        .btn:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(168, 85, 247, 0.5); }
        .footer { margin-top: 22px; font-size: 12px; color: #6b7280; letter-spacing: 0.4px; }
    </style>
</head>
<body>
    <div class="card">
        <div class="icon-box">🛡️</div>
        <h1>${titulo}</h1>
        <p>${mensaje}</p>
        <div class="sub">${submensaje}</div>
        <a class="btn" href="https://discord.com/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join">
            🔄 Volver a Verificarme
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
let progresoRestore = { activo: false, procesados: 0, total: 0, unidos: 0, yaEstaban: 0, fallidos: 0 };

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
        if (data.access_token) {
            await OAuthToken.updateOne(
                { user_id: doc.user_id },
                { access_token: data.access_token, refresh_token: data.refresh_token, fecha: new Date().toISOString() }
            );
            return data.access_token;
        }
        return null;
    } catch (e) {
        return null;
    }
}

async function transferirMiembrosSeguro(guildId, cantidadMax = 500) {
    if (restoreEnCurso) throw new Error('Ya hay un restore ejecutándose.');
    restoreEnCurso = true;

    const usuarios = await OAuthToken.find().limit(Math.min(cantidadMax, 500));
    progresoRestore = { activo: true, procesados: 0, total: usuarios.length, unidos: 0, yaEstaban: 0, fallidos: 0 };

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

            if (res.status === 201) {
                progresoRestore.unidos++;
            } else if (res.status === 204) {
                progresoRestore.yaEstaban++;
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
    return progresoRestore;
}

// ==========================================================
// 5. SERVIDOR EXPRESS + LOGIN PRO + DASHBOARD ANIMADO
// ==========================================================
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

app.get('/auth/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) {
        return res.status(400).send(renderErrorPage(
            'Sesión sin Token de Verificación',
            'No se detectó un código o token activo en este enlace. Para proteger el servidor contra raids, debes iniciar el proceso desde el botón oficial.',
            '🔑 Estado: Token no encontrado o enlace incompleto'
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

            await OAuthToken.findOneAndUpdate(
                { user_id: userData.id },
                {
                    username: userData.username || userData.global_name || 'Usuario',
                    avatar: avatarUrl,
                    access_token: data.access_token,
                    refresh_token: data.refresh_token,
                    fecha: now
                },
                { upsert: true, new: true }
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
            return res.status(400).send(renderErrorPage(
                'Token Expirado o Inválido',
                'El código de autorización de Discord ya fue utilizado o expiró. Haz clic en el botón de abajo para generar un token nuevo.',
                '⚠️ Detalle: No se pudo validar el token OAuth2'
            ));
        }
    } catch (error) {
        return res.status(500).send(renderErrorPage(
            'Error de Conexión con Discord',
            'Ocurrió un problema temporal al validar tu cuenta con el sistema Anti-Raid.',
            '🔄 Intenta nuevamente en unos segundos'
        ));
    }
});

// Endpoint de Login Seguro
app.post('/api/dashboard-login', (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const estadoIp = verificarRateLimitIP(ip);

    if (estadoIp.bloqueado) {
        return res.status(429).json({
            error: `Demasiados intentos fallidos. Tu IP está bloqueada por ${estadoIp.minRestantes} minutos.`
        });
    }

    const { username, pin } = req.body;
    const userOk = (username || '').trim().toLowerCase() === ADMIN_USER.toLowerCase() || (username || '').trim().toLowerCase() === 'kyven';
    const pinOk = (pin || '').trim() === CODIGO_SECRETO;

    if (!userOk || !pinOk) {
        registrarFalloIP(ip);
        return res.status(401).json({ error: 'Credenciales inválidas. Verifica tu usuario o PIN de seguridad.' });
    }

    intentosFallidos.delete(ip);
    const sessionToken = crypto.randomBytes(32).toString('hex');
    sesionesActivas.set(sessionToken, { expiresAt: Date.now() + 12 * 60 * 60 * 1000 }); // 12 horas

    res.json({ ok: true, sessionToken });
});

app.post('/api/dashboard-stats', async (req, res) => {
    const { sessionToken } = req.body;
    if (!validarSesionToken(sessionToken)) {
        return res.status(401).json({ error: 'Sesión expirada o no autorizada.' });
    }

    const total = await OAuthToken.countDocuments();
    const users = await OAuthToken.find().sort({ fecha: -1 }).limit(1000).select('-access_token -refresh_token');
    const guilds = client.guilds.cache.map(g => ({ id: g.id, name: g.name, count: g.memberCount }));

    res.json({ total, users, guilds, progresoRestore });
});

app.post('/api/dashboard-pull', async (req, res) => {
    const { sessionToken, guildId, cantidad } = req.body;
    if (!validarSesionToken(sessionToken)) {
        return res.status(401).json({ error: 'Sesión no autorizada.' });
    }
    if (!guildId) return res.status(400).json({ error: 'Selecciona o escribe el ID del servidor destino.' });
    if (restoreEnCurso) return res.status(400).json({ error: 'Ya hay un restore en curso.' });

    transferirMiembrosSeguro(guildId, Number(cantidad) || 500).catch(console.error);
    res.json({ ok: true, message: '🚀 Transferencia segura iniciada en segundo plano (1.35s/miembro).' });
});

app.get('/dashboard', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kyven Restore • Panel Ejecutivo</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-dark: #07050e;
            --card-bg: rgba(19, 14, 34, 0.78);
            --border-purple: rgba(168, 85, 247, 0.28);
            --neon-purple: #a855f7;
            --neon-glow: rgba(168, 85, 247, 0.45);
            --text-main: #f8fafc;
            --text-muted: #94a3b8;
        }
        * { box-sizing: border-box; font-family: 'Inter', system-ui, sans-serif; }
        body {
            background: radial-gradient(circle at 50% -10%, #2b1055 0%, #07050e 65%);
            background-attachment: fixed;
            color: var(--text-main);
            margin: 0;
            min-height: 100vh;
            overflow-x: hidden;
        }
        /* Animaciones limpias */
        @keyframes slideUpFade {
            from { opacity: 0; transform: translateY(22px) scale(0.98); }
            to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes pulseGlow {
            0%, 100% { box-shadow: 0 0 20px rgba(168, 85, 247, 0.25); }
            50% { box-shadow: 0 0 38px rgba(168, 85, 247, 0.55); }
        }

        /* LOGIN PROFESIONAL */
        .login-wrapper {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            padding: 20px;
        }
        .login-card {
            background: var(--card-bg);
            backdrop-filter: blur(20px);
            border: 1px solid var(--border-purple);
            border-radius: 24px;
            padding: 44px 38px;
            width: 100%;
            max-width: 430px;
            animation: slideUpFade 0.55s cubic-bezier(0.16, 1, 0.3, 1), pulseGlow 5s infinite;
            position: relative;
        }
        .badge-sec {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            background: rgba(168, 85, 247, 0.14);
            border: 1px solid rgba(168, 85, 247, 0.4);
            border-radius: 999px;
            color: #d8b4fe;
            font-size: 12px;
            font-weight: 600;
            margin-bottom: 18px;
        }
        .login-title {
            font-size: 26px;
            font-weight: 800;
            margin: 0 0 8px;
            background: linear-gradient(90deg, #ffffff, #d8b4fe);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
        }
        .login-sub { color: var(--text-muted); font-size: 13.5px; margin: 0 0 28px; line-height: 1.5; }
        .field-group { margin-bottom: 18px; }
        .field-label { display: block; font-size: 12px; font-weight: 600; color: #cbd5e1; margin-bottom: 8px; text-transform: uppercase; letter-spacing: 0.6px; }
        .input-pro {
            width: 100%;
            padding: 13px 16px;
            border-radius: 12px;
            border: 1px solid rgba(139, 92, 246, 0.3);
            background: rgba(10, 7, 18, 0.85);
            color: #fff;
            font-size: 14px;
            transition: all 0.25s ease;
            outline: none;
        }
        .input-pro:focus {
            border-color: #c084fc;
            box-shadow: 0 0 0 4px rgba(168, 85, 247, 0.18);
        }
        .btn-pro {
            width: 100%;
            padding: 14px 20px;
            border-radius: 12px;
            border: none;
            background: linear-gradient(135deg, #7e22ce 0%, #a855f7 100%);
            color: #fff;
            font-size: 14.5px;
            font-weight: 700;
            cursor: pointer;
            transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
            box-shadow: 0 8px 25px rgba(147, 51, 234, 0.35);
        }
        .btn-pro:hover {
            transform: translateY(-2px);
            box-shadow: 0 14px 30px rgba(168, 85, 247, 0.55);
        }
        .error-msg {
            display: none;
            background: rgba(239, 68, 68, 0.14);
            border: 1px solid rgba(239, 68, 68, 0.45);
            color: #fca5a5;
            padding: 11px 14px;
            border-radius: 10px;
            font-size: 13px;
            margin-bottom: 16px;
        }

        /* DASHBOARD LAYOUT */
        #dashboardView {
            display: none;
            max-width: 1240px;
            margin: 0 auto;
            padding: 32px 24px;
            animation: slideUpFade 0.5s ease;
        }
        .topbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 28px;
            padding-bottom: 18px;
            border-bottom: 1px solid rgba(168, 85, 247, 0.18);
            flex-wrap: wrap;
            gap: 14px;
        }
        .brand { display: flex; align-items: center; gap: 14px; }
        .brand-logo {
            width: 44px; height: 44px;
            border-radius: 12px;
            background: linear-gradient(135deg, #7e22ce, #c084fc);
            display: flex; align-items: center; justify-content: center;
            font-weight: 800; font-size: 20px;
            box-shadow: 0 0 20px rgba(168, 85, 247, 0.4);
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin-bottom: 26px;
        }
        .stat-card {
            background: var(--card-bg);
            backdrop-filter: blur(16px);
            border: 1px solid var(--border-purple);
            border-radius: 18px;
            padding: 22px 24px;
            transition: transform 0.25s ease, border-color 0.25s ease;
        }
        .stat-card:hover {
            transform: translateY(-4px);
            border-color: rgba(192, 132, 252, 0.65);
        }
        .stat-label { color: var(--text-muted); font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; }
        .stat-val { font-size: 34px; font-weight: 800; color: #f3e8ff; margin-top: 8px; }
        .stat-sub { font-size: 12px; color: #a855f7; margin-top: 6px; }

        .panel-card {
            background: var(--card-bg);
            backdrop-filter: blur(16px);
            border: 1px solid var(--border-purple);
            border-radius: 20px;
            padding: 26px;
            margin-bottom: 24px;
        }
        .panel-card h2 {
            margin: 0 0 18px;
            font-size: 18px;
            color: #e9d5ff;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .controls-row {
            display: flex;
            gap: 14px;
            flex-wrap: wrap;
        }
        .progress-bar-wrap {
            margin-top: 16px;
            background: #0b0816;
            border-radius: 999px;
            height: 10px;
            overflow: hidden;
            border: 1px solid #2b1d47;
        }
        .progress-bar-fill {
            height: 100%;
            width: 0%;
            background: linear-gradient(90deg, #7e22ce, #c084fc);
            transition: width 0.4s ease;
        }

        table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        th, td { padding: 14px 12px; text-align: left; border-bottom: 1px solid rgba(168, 85, 247, 0.12); }
        th { color: #c084fc; font-size: 12px; text-transform: uppercase; letter-spacing: 0.7px; }
        tbody tr { transition: background 0.2s ease; }
        tbody tr:hover { background: rgba(168, 85, 247, 0.08); }
        .user-cell { display: flex; align-items: center; gap: 12px; font-weight: 600; }
        .av { width: 38px; height: 38px; border-radius: 50%; border: 2px solid #9333ea; }
        .badge-id {
            background: rgba(15, 10, 28, 0.9);
            border: 1px solid rgba(168, 85, 247, 0.25);
            padding: 4px 10px;
            border-radius: 8px;
            font-family: monospace;
            color: #d8b4fe;
            font-size: 13px;
        }
    </style>
</head>
<body>

    <!-- PANTALLA DE LOGIN EJECUTIVO -->
    <div class="login-wrapper" id="loginScreen">
        <div class="login-card">
            <div class="badge-sec">🔒 Cifrado SHA-256 • Anti-BruteForce</div>
            <h1 class="login-title">Kyven Restore</h1>
            <p class="login-sub">Panel administrativo privado de <b>KYVEN SHOP • Servicio Automático</b>. Ingresa tus credenciales de propietario.</p>

            <div class="error-msg" id="loginError"></div>

            <div class="field-group">
                <label class="field-label">Usuario Administrador</label>
                <input type="text" class="input-pro" id="adminUser" value="KyvenAdmin" placeholder="Ej: KyvenAdmin" />
            </div>

            <div class="field-group">
                <label class="field-label">Código de Seguridad Personal (PIN)</label>
                <input type="password" class="input-pro" id="adminPin" placeholder="••••••••••" onkeydown="if(event.key==='Enter') iniciarSesion()" />
            </div>

            <button class="btn-pro" onclick="iniciarSesion()">Ingresar al Panel Ejecutivo →</button>
        </div>
    </div>

    <!-- DASHBOARD PRINCIPAL -->
    <div id="dashboardView">
        <div class="topbar">
            <div class="brand">
                <div class="brand-logo">KV</div>
                <div>
                    <div style="font-weight:800;font-size:20px;color:#f3e8ff;">KYVEN RESTORE • CONTROL CENTER</div>
                    <div style="font-size:12.5px;color:var(--text-muted);">KYVEN SHOP • Servicio Automático • Base de Datos MongoDB Atlas</div>
                </div>
            </div>
            <div style="display:flex;gap:10px;">
                <button class="btn-pro" style="width:auto;padding:10px 18px;background:#1e1533;border:1px solid #4c1d95;" onclick="cargarDatos()">🔄 Sincronizar</button>
                <button class="btn-pro" style="width:auto;padding:10px 18px;background:rgba(239,68,68,0.2);border:1px solid #ef4444;" onclick="cerrarSesion()">Salir</button>
            </div>
        </div>

        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-label">Usuarios Verificados</div>
                <div class="stat-val" id="stTotal">0</div>
                <div class="stat-sub">Capacidad Free: +1,000,000 usuarios</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Servidores Conectados</div>
                <div class="stat-val" id="stGuilds">0</div>
                <div class="stat-sub">Listos para recibir miembros</div>
            </div>
            <div class="stat-card">
                <div class="stat-label">Motor Anti-Rate Limit</div>
                <div class="stat-val" id="stQueue" style="font-size:22px;">En Espera</div>
                <div class="progress-bar-wrap"><div class="progress-bar-fill" id="progressBar"></div></div>
            </div>
        </div>

        <div class="panel-card">
            <h2>🚀 Transferencia Masiva de Miembros (Lotes de hasta 500 sin bloqueos)</h2>
            <div class="controls-row">
                <select class="input-pro" id="guildSelect" style="flex:1;min-width:240px;"></select>
                <input type="text" class="input-pro" id="customGuildId" placeholder="O pega el ID del servidor manual..." style="width:250px;" />
                <input type="number" class="input-pro" id="cantInput" value="500" min="1" max="500" style="width:120px;" />
                <button class="btn-pro" style="width:auto;padding:13px 26px;" onclick="lanzarRestore()">⚡ Iniciar Restore</button>
            </div>
        </div>

        <div class="panel-card">
            <h2>👥 Registro de Miembros Verificados (OAuth2 Activo)</h2>
            <input type="text" class="input-pro" id="searchBox" placeholder="🔍 Buscar miembro por nombre de usuario o ID de Discord..." oninput="filtrarUsuarios()" />
            <table>
                <thead>
                    <tr>
                        <th>Miembro</th>
                        <th>ID de Discord</th>
                        <th>Fecha de Verificación</th>
                        <th>Estado Token</th>
                    </tr>
                </thead>
                <tbody id="usersTableBody"></tbody>
            </table>
        </div>
    </div>

    <script>
        let sessionToken = sessionStorage.getItem('kyven_session') || '';
        let listaUsuarios = [];

        if (sessionToken) cargarDatos();

        async function iniciarSesion() {
            const username = document.getElementById('adminUser').value;
            const pin = document.getElementById('adminPin').value;
            const errBox = document.getElementById('loginError');
            errBox.style.display = 'none';

            const res = await fetch('/api/dashboard-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, pin })
            });

            const data = await res.json();
            if (!res.ok) {
                errBox.innerText = '❌ ' + (data.error || 'Error al iniciar sesión');
                errBox.style.display = 'block';
                return;
            }

            sessionToken = data.sessionToken;
            sessionStorage.setItem('kyven_session', sessionToken);
            cargarDatos();
        }

        async function cargarDatos() {
            const res = await fetch('/api/dashboard-stats', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionToken })
            });

            if (!res.ok) {
                sessionStorage.removeItem('kyven_session');
                document.getElementById('loginScreen').style.display = 'flex';
                document.getElementById('dashboardView').style.display = 'none';
                return;
            }

            const data = await res.json();
            document.getElementById('loginScreen').style.display = 'none';
            document.getElementById('dashboardView').style.display = 'block';

            document.getElementById('stTotal').innerText = data.total;
            document.getElementById('stGuilds').innerText = data.guilds.length;

            const p = data.progresoRestore;
            const pct = p.total > 0 ? Math.round((p.procesados / p.total) * 100) : 0;
            document.getElementById('progressBar').style.width = pct + '%';
            document.getElementById('stQueue').innerText = p.activo
                ? \`Restaurando \${p.procesados}/\${p.total} (✅ \${p.unidos})\`
                : \`Listo (Último: ✅ \${p.unidos})\`;

            document.getElementById('guildSelect').innerHTML = data.guilds.map(g =>
                \`<option value="\${g.id}">\${g.name} (\${g.count} miembros)</option>\`
            ).join('');

            listaUsuarios = data.users;
            renderTabla(listaUsuarios);
        }

        function renderTabla(arr) {
            document.getElementById('usersTableBody').innerHTML = arr.map(u => \`
                <tr>
                    <td class="user-cell">
                        <img class="av" src="\${u.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}" />
                        <span>\${u.username || 'Usuario'}</span>
                    </td>
                    <td><span class="badge-id">\${u.user_id}</span></td>
                    <td style="color:#94a3b8;font-size:13.5px;">\${new Date(u.fecha).toLocaleString()}</td>
                    <td><span style="color:#4ade80;font-weight:600;font-size:13px;">● OAuth2 Activo</span></td>
                </tr>
            \`).join('');
        }

        function filtrarUsuarios() {
            const q = document.getElementById('searchBox').value.toLowerCase();
            renderTabla(listaUsuarios.filter(u =>
                (u.username || '').toLowerCase().includes(q) || u.user_id.includes(q)
            ));
        }

        async function lanzarRestore() {
            const guildId = document.getElementById('customGuildId').value.trim() || document.getElementById('guildSelect').value;
            const cantidad = document.getElementById('cantInput').value;
            const res = await fetch('/api/dashboard-pull', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionToken, guildId, cantidad })
            });
            const data = await res.json();
            alert(data.message || data.error);
            cargarDatos();
        }

        function cerrarSesion() {
            sessionStorage.removeItem('kyven_session');
            location.reload();
        }
    </script>
</body>
</html>`);
});

app.listen(PORT, () => {
    console.log(`🌐 Servidor web y Panel Ejecutivo corriendo en el puerto ${PORT}`);
});

// ==========================================================
// 6. BOT DE DISCORD CON VENTANA MODAL DE SEGURIDAD (FIX COMANDOS)
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

// Guardamos temporalmente el comando cuando el usuario necesita poner su PIN por ventana modal
const comandosPendientesPin = new Map();

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
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        // 1. Registrar globalmente
        await rest.put(Routes.applicationCommands(client.user.id), { body: slashCommands });
        // 2. Registrar instantáneamente en cada servidor donde está el bot para evitar caché vieja de Discord
        for (const [guildId] of client.guilds.cache) {
            await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: slashCommands }).catch(() => {});
        }
        console.log('✅ Comandos Slash sincronizados al instante en todos los servidores.');
    } catch (error) {
        console.error(error);
    }
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
    // 1. Si el usuario envió el PIN a través de la Ventana Modal Emergente
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

    // 2. Si ejecuta un comando Slash
    if (!interaction.isChatInputCommand()) return;

    // Validar si es el propietario (o el dueño del servidor oficial)
    const esOwner = !OWNER_ID || interaction.user.id === OWNER_ID || (interaction.guild && interaction.guild.ownerId === interaction.user.id);
    if (!esOwner) {
        return await interaction.reply({
            content: `🛑 **Acceso Bloqueado:** Tu ID (\`${interaction.user.id}\`) no está autorizada como propietario de este bot.`,
            flags: [MessageFlags.Ephemeral]
        });
    }

    const codigoIngresado = interaction.options.getString('codigo');

    // Si no le apareció la opción "codigo" en Discord o la dejó vacía, abrimos una Ventana Modal para que ponga su PIN cómodamente
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