'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function registerApiRoutes(app, { rootDir, ADMIN_USER, CODIGO_SECRETO, mongoose, client, OAuthToken, SystemActivity, RestoreOperation, registrarActividadSistema, sincronizarCache, verificarRateLimitIP, registrarFalloIP, validarSesionToken, sesionesActivas, intentosFallidos, localizarArchivoKyvenIcon, renderErrorPage, getRestoreState, transferirMiembrosSeguro }) {
const commandRoots = ['commands', 'interactions', 'security', 'systems', 'dashboard/interactions', 'dashboard/security', 'dashboard/systems'];
const commandRootSet = new Set(commandRoots);
const bootTimestamp = Date.now();
function adminSession(req) {
    const cookies = Object.fromEntries(String(req.headers.cookie || '').split(';').map(s => s.trim()).filter(Boolean).map(s => { const i=s.indexOf('='); try { return [s.slice(0,i), decodeURIComponent(s.slice(i+1))]; } catch (_) { return ['', '']; } }));
    return cookies.kyven_admin && validarSesionToken(cookies.kyven_admin) ? cookies.kyven_admin : null;
}
function safeCommandPath(relativePath) {
    if (typeof relativePath !== 'string' || relativePath.includes('\\') || path.isAbsolute(relativePath)) return null;
    const normalized = path.posix.normalize(relativePath);
    if (normalized !== relativePath || normalized.split('/').some(p => !p || p === '.' || p === '..') || !normalized.endsWith('.js')) return null;
    if (!commandRootSet.has(normalized.split('/')[0]) && !commandRoots.some(r => normalized.startsWith(r + '/'))) return null;
    const full = path.resolve(rootDir, ...normalized.split('/'));
    const rel = path.relative(path.resolve(rootDir), full);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
    let cursor = path.resolve(rootDir);
    for (const part of normalized.split('/')) {
        cursor = path.join(cursor, part);
        try { if (fs.lstatSync(cursor).isSymbolicLink()) return null; } catch (error) { if (error.code !== 'ENOENT') return null; }
    }
    return full;
}
function scanCommandFiles() {
    const found = [];
    for (const dir of commandRoots) {
        const base = path.resolve(rootDir, dir);
        if (!base.startsWith(path.resolve(rootDir) + path.sep) || !fs.existsSync(base)) continue;
        const walk = current => { for (const entry of fs.readdirSync(current, { withFileTypes: true })) { const full=path.join(current, entry.name); if (entry.isSymbolicLink()) continue; if (entry.isDirectory()) walk(full); else if (entry.isFile() && entry.name.endsWith('.js')) { const relative=path.relative(rootDir, full).split(path.sep).join('/'); found.push({ filename: entry.name, path: relative, category: relative.split('/')[0] }); } } };
        walk(base);
    }
    return found.sort((a,b) => a.path.localeCompare(b.path));
}
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
    res.cookie('kyven_admin', sessionToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 12 * 60 * 60 * 1000, path: '/' });
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

app.get('/api/server-ping', (req, res) => res.json({ ok: true, uptime: Math.floor(process.uptime()), bootTimestamp }));
app.post('/api/dashboard-logout', (req, res) => {
    const token = adminSession(req);
    if (token) sesionesActivas.delete(token);
    res.clearCookie('kyven_admin', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/' });
    res.json({ ok: true });
});

app.post('/api/command-list', (req, res) => {
    if (!adminSession(req)) return res.status(401).json({ error: 'Sesión administrativa requerida.' });
    res.json({ files: scanCommandFiles() });
});

app.post('/api/command-read', (req, res) => {
    if (!adminSession(req)) return res.status(401).json({ error: 'Sesión administrativa requerida.' });
    const full = safeCommandPath(req.body.path);
    if (!full || !fs.existsSync(full) || !fs.statSync(full).isFile()) return res.status(400).json({ error: 'Ruta de comando no válida.' });
    res.json({ path: req.body.path, code: fs.readFileSync(full, 'utf8') });
});

app.post('/api/commands-batch-commit', async (req, res) => {
    if (!adminSession(req)) return res.status(401).json({ error: 'Sesión administrativa requerida.' });
    const actions = req.body.actions;
    if (!Array.isArray(actions) || actions.length < 1 || actions.length > 100) return res.status(400).json({ error: 'El lote debe contener entre 1 y 100 acciones.' });
    const validated = [];
    const changedPaths = new Set();
    for (const action of actions) {
        if (!action || !['create','modify','rename','delete'].includes(action.type)) return res.status(400).json({ error: 'Acción no válida.' });
        const target = action.type === 'delete' ? null : safeCommandPath(action.filename);
        const source = ['modify','rename','delete'].includes(action.type) ? safeCommandPath(action.oldFilename || action.filename) : null;
        if ((action.type !== 'delete' && !target) || (['modify','rename','delete'].includes(action.type) && !source)) return res.status(400).json({ error: 'Ruta de acción no válida.' });
        if (action.type !== 'delete' && typeof action.code !== 'string') return res.status(400).json({ error: 'Falta el contenido del archivo.' });
        const targetRel = action.type === 'delete' ? null : action.filename;
        const sourceRel = ['modify','rename','delete'].includes(action.type) ? (action.oldFilename || action.filename) : null;
        for (const rel of new Set([targetRel, sourceRel].filter(Boolean))) { if (changedPaths.has(rel)) return res.status(400).json({ error: 'El lote contiene rutas duplicadas.' }); changedPaths.add(rel); }
        if (['modify','rename','delete'].includes(action.type) && (!fs.existsSync(source) || !fs.statSync(source).isFile())) return res.status(400).json({ error: `No existe ${sourceRel}.` });
        if (action.type === 'create' && fs.existsSync(target)) return res.status(409).json({ error: `Ya existe ${targetRel}.` });
        if (action.type === 'rename' && fs.existsSync(target) && target !== source) return res.status(409).json({ error: `Ya existe ${targetRel}.` });
        validated.push({ ...action, target, source, targetRel, sourceRel });
    }
    const token = process.env.GITHUB_TOKEN;
    let repo = (process.env.GITHUB_REPO || '').replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/$/, '');
    if (!token || !/^[^/]+\/[^/]+$/.test(repo)) return res.status(503).json({ error: 'Configura GITHUB_TOKEN y GITHUB_REPO (owner/repo) para aplicar el lote.' });
    const gh = async (url, method='GET', body) => {
        const response = await fetch(`https://api.github.com${url}`, { method, headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(body ? { 'Content-Type':'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
        const data = response.status === 204 ? null : await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data?.message || `GitHub respondió ${response.status}`);
        return data;
    };
    try {
        const repository = await gh(`/repos/${repo}`);
        const branch = (process.env.GITHUB_BRANCH || repository.default_branch || '').trim();
        if (!branch) throw new Error('No se pudo determinar la rama por defecto de GitHub.');
        const ref = await gh(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch).replace(/%2F/g, '/')}`);
        const parent = await gh(`/repos/${repo}/git/commits/${ref.object.sha}`);
        const tree = new Map();
        for (const action of validated) {
            if (action.type === 'delete' || action.type === 'rename') tree.set(action.sourceRel, { path: action.sourceRel, mode: '100644', type: 'blob', sha: null });
            if (action.type !== 'delete') tree.set(action.targetRel, { path: action.targetRel, mode: '100644', type: 'blob', content: action.code });
        }
        const newTree = await gh(`/repos/${repo}/git/trees`, 'POST', { base_tree: parent.tree.sha, tree: [...tree.values()] });
        const commit = await gh(`/repos/${repo}/git/commits`, 'POST', { message: `Apply ${validated.length} command editor change${validated.length === 1 ? '' : 's'}`, tree: newTree.sha, parents: [ref.object.sha] });
        await gh(`/repos/${repo}/git/refs/heads/${encodeURIComponent(branch).replace(/%2F/g, '/')}`, 'PATCH', { sha: commit.sha, force: false });
        for (const action of validated) {
            if (action.type === 'delete' || action.type === 'rename') fs.unlinkSync(action.source);
            if (action.type !== 'delete') { fs.mkdirSync(path.dirname(action.target), { recursive: true }); fs.writeFileSync(action.target, action.code, 'utf8'); }
            if (action.source) { try { const resolved = require.resolve(action.source); delete require.cache[resolved]; } catch (_) {} }
            if (action.target) { try { const resolved = require.resolve(action.target); delete require.cache[resolved]; } catch (_) {} }
        }
        if (client?.commands) {
            const { Collection, REST, Routes } = require('discord.js');
            client.commands.clear();
            const slashCommands = [];
            const files = scanCommandFiles().filter(f => f.category === 'commands');
            for (const item of files) {
                const commandPath = safeCommandPath(item.path);
                try { const command = require(commandPath); if (command?.data && command?.execute) { const json = command.data.toJSON(); if (!json.options) json.options=[]; if (!json.options.some(o => o.name === 'codigo') && json.options.every(o => o.type !== 1 && o.type !== 2)) json.options.push({ name:'codigo', description:'Código de seguridad personal (opcional)', type:3, required:false }); client.commands.set(json.name, command); slashCommands.push(json); } } catch (error) { console.error(`No se pudo recargar ${item.path}:`, error); }
            }
            try { const { SlashCommandBuilder } = require('discord.js'); slashCommands.push(new SlashCommandBuilder().setName('restore_pull').setDescription('Transfiere hasta 500 miembros de MongoDB a este servidor sin bloqueos').addStringOption(opt => opt.setName('codigo').setDescription('Tu código de seguridad personal').setRequired(false)).addIntegerOption(opt => opt.setName('cantidad').setDescription('Cantidad de miembros (1 a 500)').setMinValue(1).setMaxValue(500).setRequired(false)).toJSON()); } catch (_) {}
            if (client.user && process.env.TOKEN) await new REST({ version:'10' }).setToken(process.env.TOKEN).put(Routes.applicationCommands(client.user.id), { body: slashCommands });
        }
        res.json({ ok: true, commit: commit.sha, files: validated.length });
    } catch (error) {
        console.error('Error aplicando lote de comandos:', error);
        res.status(502).json({ error: `No se pudo completar la sincronización: ${error.message}` });
    }
});
}

module.exports = { registerApiRoutes };
