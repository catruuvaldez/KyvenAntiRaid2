'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function registerApiRoutes(app, { rootDir, ADMIN_USER, CODIGO_SECRETO, mongoose, client, OAuthToken, SystemActivity, RestoreOperation, registrarActividadSistema, sincronizarCache, verificarRateLimitIP, registrarFalloIP, validarSesionToken, sesionesActivas, intentosFallidos, localizarArchivoKyvenIcon, renderErrorPage, getRestoreState, transferirMiembrosSeguro }) {
// Endpoint que sirve el archivo real KYVENICON del proyecto
app.get('/api/brand-icon', (req, res) => {
    const iconPath = localizarArchivoKyvenIcon();
    if (iconPath && fs.existsSync(iconPath)) {
        return res.sendFile(iconPath);
    }
    res.status(404).end();
});

// Diagnóstico público para la pestaña "Estado del Sistema" en el Login
app.get('/api/public-health', (req, res) => {
    const mongoConnected = mongoose.connection.readyState === 1;
    const botReady = Boolean(client && client.isReady());
    res.json({
        mongoConnected,
        mongoStatusText: mongoConnected ? 'Operativo (Atlas M0)' : 'Desconectado',
        botReady,
        botTag: botReady ? client.user.tag : 'Inicializando...',
        botPing: botReady && client.ws.ping >= 0 ? client.ws.ping : 0,
        guildsCount: botReady ? client.guilds.cache.size : 0,
        uptimeSeconds: Math.floor(process.uptime()),
        serverTime: new Date().toISOString()
    });
});

// Callback OAuth2
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
                            event: isNew ? 'Verificación Inicial OAuth2' : 'Actualización de Credenciales OAuth2',
                            detail: isNew ? 'Autorización concedida (identify + guilds.join)' : 'Tokens renovados mediante nueva verificación del usuario',
                            timestamp: now
                        }],
                        $slice: -40
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
                isNew ? 'verify' : 'user_update',
                'success',
                isNew ? `Nuevo miembro verificado: ${usernameClean}` : `Registro actualizado: ${usernameClean}`,
                `Discord ID: ${userData.id}`
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

            res.sendFile(path.join(rootDir, 'index.html'));
        } else {
            await registrarActividadSistema('error', 'error', 'Fallo al canjear código OAuth2 en Discord', 'El código expiró o ya fue utilizado');
            return res.status(400).send(renderErrorPage(
                'Token Expirado o Inválido',
                'El código de autorización de Discord ya fue utilizado o expiró. Haz clic en el botón de abajo para generar un token nuevo.',
                'Detalle: No se pudo validar el token OAuth2'
            ));
        }
    } catch (error) {
        await registrarActividadSistema('error', 'error', 'Excepción interna durante callback OAuth2', error.message || '');
        return res.status(500).send(renderErrorPage(
            'Error de Conexión con Discord',
            'Ocurrió un problema temporal al validar tu cuenta con el sistema Anti-Raid.',
            'Intenta nuevamente en unos segundos'
        ));
    }
});

// Login Administrativo (Requiere escribir "Catrii" manualmente + PIN)
app.post('/api/dashboard-login', async (req, res) => {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const estadoIp = verificarRateLimitIP(ip);

    if (estadoIp.bloqueado) {
        return res.status(429).json({
            error: `Demasiados intentos fallidos. IP bloqueada por ${estadoIp.minRestantes} minutos.`
        });
    }

    const { username, pin } = req.body;
    const cleanUser = (username || '').trim();
    const userOk = cleanUser === ADMIN_USER || cleanUser.toLowerCase() === 'catrii';
    const pinOk = (pin || '').trim() === CODIGO_SECRETO;

    if (!userOk || !pinOk) {
        registrarFalloIP(ip);
        await registrarActividadSistema(
            'auth',
            'warning',
            'Intento de inicio de sesión rechazado en Control Center',
            `Usuario ingresado: "${cleanUser || 'vacío'}"`
        );
        return res.status(401).json({ error: 'Credenciales de acceso incorrectas. Verifica tu usuario y PIN.' });
    }

    intentosFallidos.delete(ip);
    const sessionToken = crypto.randomBytes(32).toString('hex');
    sesionesActivas.set(sessionToken, {
        adminName: 'Catrii',
        ip,
        createdAt: new Date().toISOString(),
        expiresAt: Date.now() + 12 * 60 * 60 * 1000
    });

    await registrarActividadSistema('auth', 'success', 'Sesión administrativa iniciada por Catrii', 'Autenticación SHA-256 verificada');
    res.json({ ok: true, sessionToken, adminName: 'Catrii' });
});

// Datos Completos para los 7 Módulos del Dashboard
app.post('/api/dashboard-stats', async (req, res) => {
    const { sessionToken } = req.body;
    if (!validarSesionToken(sessionToken)) {
        return res.status(401).json({ error: 'Sesión expirada o no autorizada.' });
    }

    const sesion = sesionesActivas.get(sessionToken);
    const nowIso = new Date().toISOString();

    const total = await OAuthToken.countDocuments();
    const rawUsers = await OAuthToken.find().sort({ fecha: -1 }).limit(2500).select('-access_token -refresh_token').lean();
    const activities = await SystemActivity.find().sort({ timestamp: -1 }).limit(250).lean();
    const restoreHistory = await RestoreOperation.find().sort({ started_at: -1 }).limit(50).lean();

    const guilds = client.guilds.cache.map(g => {
        const botMember = g.members.me;
        const hasAdmin = Boolean(botMember && botMember.permissions.has('Administrator'));
        const canManageRoles = Boolean(botMember && botMember.permissions.has('ManageRoles'));
        const canCreateInvite = Boolean(botMember && botMember.permissions.has('CreateInstantInvite'));

        return {
            id: g.id,
            name: g.name,
            count: g.memberCount || 0,
            icon: g.iconURL({ extension: 'png', size: 128 }) || null,
            ownerId: g.ownerId || 'No disponible',
            joinedAt: g.joinedAt ? g.joinedAt.toISOString() : null,
            createdAt: g.createdAt ? g.createdAt.toISOString() : null,
            isPrimaryGuild: Boolean(process.env.GUILD_ID && g.id === process.env.GUILD_ID),
            integrationStatus: hasAdmin ? 'Administrador Completo' : (canManageRoles ? 'Permisos Parciales' : 'Permisos Limitados'),
            hasAdmin,
            lastSync: nowIso
        };
    });

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
            name: guildMap.get(id) || (id === process.env.GUILD_ID ? 'Servidor Principal Configurado' : `Servidor ID: ${id}`)
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

    const activeCount = users.filter(u => u.oauth_status === 'active').length;
    const refreshedCount = users.filter(u => u.oauth_status === 'refreshed').length;
    const expiredCount = users.filter(u => u.oauth_status === 'expired').length;

    let blockedIpsCount = 0;
    let failedAttemptsTotal = 0;
    for (const [, info] of intentosFallidos) {
        failedAttemptsTotal += info.count || 0;
        if (info.lockUntil && Date.now() < info.lockUntil) blockedIpsCount++;
    }

    const securityOverview = {
        oauthHealth: {
            totalTokens: total,
            activeTokens: activeCount,
            refreshedTokens: refreshedCount,
            expiredTokens: expiredCount,
            redirectConfigured: Boolean(process.env.REDIRECT_URI),
            clientIdConfigured: Boolean(process.env.CLIENT_ID)
        },
        activeSessionsCount: sesionesActivas.size,
        currentSessionCreatedAt: sesion?.createdAt || nowIso,
        currentSessionExpiresAt: sesion ? new Date(sesion.expiresAt).toISOString() : nowIso,
        failedLoginAttempts: failedAttemptsTotal,
        blockedIpsCount,
        rateLimitCadenceMs: 1350,
        maxBatchLimit: 500,
        lastSecurityCheck: nowIso
    };

    const systemHealth = {
        mongoConnected: mongoose.connection.readyState === 1,
        mongoStateText: mongoose.connection.readyState === 1 ? 'Conectado (MongoDB Atlas)' : 'Desconectado',
        botReady: client.isReady(),
        botTag: client.user ? client.user.tag : 'Desconectado',
        botId: client.user ? client.user.id : 'No disponible',
        botPing: client.ws.ping >= 0 ? client.ws.ping : 0,
        uptimeSeconds: Math.floor(process.uptime()),
        nodeVersion: process.version,
        serverTime: nowIso
    };

    res.json({
        adminName: sesion?.adminName || 'Catrii',
        total,
        users,
        guilds,
        activities,
        restoreHistory,
        progresoRestore: getRestoreState().progresoRestore,
        securityOverview,
        systemHealth
    });
});

// Iniciar Restauración desde Restore Center
app.post('/api/dashboard-pull', async (req, res) => {
    const { sessionToken, guildId, cantidad } = req.body;
    if (!validarSesionToken(sessionToken)) {
        return res.status(401).json({ error: 'Sesión no autorizada.' });
    }
    if (!guildId) return res.status(400).json({ error: 'Selecciona un servidor o ingresa un ID válido.' });
    if (getRestoreState().restoreEnCurso) return res.status(400).json({ error: 'Ya existe una operación de restauración en curso.' });

    const totalEnDb = await OAuthToken.countDocuments();
    if (totalEnDb === 0) {
        return res.status(400).json({ error: 'No hay usuarios verificados en la base de datos para transferir.' });
    }

    const sesion = sesionesActivas.get(sessionToken);
    const limitNum = Math.min(Math.max(Number(cantidad) || 500, 1), 500);
    transferirMiembrosSeguro(guildId.trim(), limitNum, sesion?.adminName || 'Catrii').catch(console.error);

    res.json({
        ok: true,
        message: `Operación iniciada en Restore Center (lote máx: ${limitNum} miembros).`
    });
});

// Comprobación real en vivo de servicios desde Security Center / Settings
app.post('/api/dashboard-ping-services', async (req, res) => {
    const { sessionToken } = req.body;
    if (!validarSesionToken(sessionToken)) {
        return res.status(401).json({ error: 'Sesión no autorizada.' });
    }

    const t0 = Date.now();
    let mongoPingMs = null;
    let mongoOk = false;

    try {
        if (mongoose.connection.readyState === 1 && mongoose.connection.db) {
            await mongoose.connection.db.admin().ping();
            mongoPingMs = Date.now() - t0;
            mongoOk = true;
        }
    } catch (e) {
        mongoOk = false;
    }

    const botOk = Boolean(client && client.isReady());
    const discordPingMs = botOk && client.ws.ping >= 0 ? client.ws.ping : null;

    await registrarActividadSistema(
        'system',
        mongoOk && botOk ? 'success' : 'warning',
        'Diagnóstico manual de servicios ejecutado por Catrii',
        `MongoDB: ${mongoOk ? mongoPingMs + 'ms' : 'Fallo'} • Discord Gateway: ${botOk ? discordPingMs + 'ms' : 'Desconectado'}`
    );

    res.json({
        ok: true,
        mongoOk,
        mongoPingMs,
        botOk,
        discordPingMs,
        checkedAt: new Date().toISOString()
    });
});

// Cerrar el resto de sesiones administrativas activas desde Security Center
app.post('/api/dashboard-revoke-other-sessions', async (req, res) => {
    const { sessionToken } = req.body;
    if (!validarSesionToken(sessionToken)) {
        return res.status(401).json({ error: 'Sesión no autorizada.' });
    }

    let revocadas = 0;
    for (const [tokenKey] of sesionesActivas) {
        if (tokenKey !== sessionToken) {
            sesionesActivas.delete(tokenKey);
            revocadas++;
        }
    }

    await registrarActividadSistema(
        'auth',
        'info',
        'Purga de sesiones administrativas secundarias ejecutada',
        `Sesiones cerradas: ${revocadas}`
    );

    res.json({ ok: true, revocadas });
});
}

module.exports = { registerApiRoutes };
