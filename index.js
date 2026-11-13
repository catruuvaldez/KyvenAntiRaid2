// index.js - KYVEN ANTI RAID & RESTORE MEMBERS (MongoDB + Dashboard)
require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Routes, REST, SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const express = require('express');
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

const CODIGO_SECRETO = process.env.BACKUP_PIN || '100309AJL';
const OWNER_ID = process.env.OWNER_ID || '';

// ==========================================================
// 1. CONEXIÓN A MONGODB Y ESQUEMA DE TOKENS OAUTH2
// ==========================================================
mongoose.connect(process.env.MONGO_URI)
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

// Caché en memoria sincronizada con MongoDB para que tus comandos en /commands que usan db.prepare() sigan funcionando
let tokensCache = [];
async function sincronizarCache() {
    try {
        tokensCache = await OAuthToken.find().lean();
    } catch (e) {}
}
mongoose.connection.once('open', sincronizarCache);

const dbAdapter = {
    OAuthToken,
    prepare: (sql) => ({
        all: () => tokensCache,
        get: (userId) => tokensCache.find(u => u.user_id === userId),
        run: () => {}
    })
};

// ==========================================================
// 2. PLANTILLA VISUAL PARA ERRORES DE TOKEN (PUNTO 3)
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
        * { box-sizing: border-box; font-family: 'Segoe UI', system-ui, sans-serif; }
        body {
            background: radial-gradient(circle at top, #1a0b2e 0%, #07050c 100%);
            color: #ffffff;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
        }
        .card {
            background: rgba(19, 14, 33, 0.92);
            border: 1px solid rgba(168, 85, 247, 0.35);
            box-shadow: 0 0 40px rgba(138, 43, 226, 0.25);
            border-radius: 20px;
            padding: 40px 32px;
            max-width: 440px;
            width: 100%;
            text-align: center;
        }
        .icon-box {
            width: 72px;
            height: 72px;
            border-radius: 50%;
            background: rgba(239, 68, 68, 0.12);
            border: 1px solid rgba(239, 68, 68, 0.4);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 34px;
            margin: 0 auto 20px;
        }
        h1 { font-size: 22px; color: #f3e8ff; margin: 0 0 12px; }
        p { color: #a1a1aa; font-size: 15px; line-height: 1.5; margin: 0 0 20px; }
        .sub {
            background: #0d0917;
            border: 1px solid #271a3c;
            border-radius: 10px;
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
            transition: 0.2s;
        }
        .btn:hover { opacity: 0.92; transform: translateY(-1px); }
        .footer { margin-top: 20px; font-size: 12px; color: #52525b; }
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
// 3. COLA ANTI-RATE LIMIT PARA METER 500 MIEMBROS SIN BLOQUEO
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

            // Si el token venció (401/403), lo refrescamos automáticamente
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
        // Pausa de 1.35s entre cada miembro para meter 500 sin bloqueo de Discord
        await esperar(1350);
    }

    await sincronizarCache();
    restoreEnCurso = false;
    progresoRestore.activo = false;
    return progresoRestore;
}

// ==========================================================
// 4. SERVIDOR EXPRESS (CALLBACK OAUTH2 + DASHBOARD WEB)
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

            // Guardar en MongoDB de forma permanente
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
                    } catch (roleErr) {
                        console.error(`Error al asignar el rol ${roleId}:`, roleErr);
                    }
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
        console.error(error);
        return res.status(500).send(renderErrorPage(
            'Error de Conexión con Discord',
            'Ocurrió un problema temporal al validar tu cuenta con el sistema Anti-Raid.',
            '🔄 Intenta nuevamente en unos segundos'
        ));
    }
});

// Endpoints del Panel Dashboard Web
app.post('/api/dashboard-stats', async (req, res) => {
    const { pin } = req.body;
    if (pin !== CODIGO_SECRETO) return res.status(401).json({ error: 'Código de seguridad incorrecto' });

    const total = await OAuthToken.countDocuments();
    const users = await OAuthToken.find().sort({ fecha: -1 }).limit(500).select('-access_token -refresh_token');
    const guilds = client.guilds.cache.map(g => ({ id: g.id, name: g.name, count: g.memberCount }));

    res.json({ total, users, guilds, progresoRestore });
});

app.post('/api/dashboard-pull', async (req, res) => {
    const { pin, guildId, cantidad } = req.body;
    if (pin !== CODIGO_SECRETO) return res.status(401).json({ error: 'Código de seguridad incorrecto' });
    if (!guildId) return res.status(400).json({ error: 'Selecciona o escribe el ID del servidor' });
    if (restoreEnCurso) return res.status(400).json({ error: 'Ya hay un restore en curso' });

    transferirMiembrosSeguro(guildId, Number(cantidad) || 500).catch(console.error);
    res.json({ ok: true, message: '🚀 Iniciando transferencia segura de miembros en segundo plano.' });
});

app.get('/dashboard', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kyven Restore • Dashboard</title>
    <style>
        * { box-sizing: border-box; font-family: 'Segoe UI', system-ui, sans-serif; }
        body { background: #08060f; color: #f4f4f5; margin: 0; padding: 28px; }
        .wrap { max-width: 1100px; margin: 0 auto; }
        .card { background: #120e1f; border: 1px solid #2b1d47; border-radius: 16px; padding: 24px; margin-bottom: 22px; box-shadow: 0 10px 30px rgba(0,0,0,0.45); }
        h1, h2 { color: #c084fc; margin-top: 0; }
        input, select, button { padding: 12px 15px; border-radius: 10px; border: 1px solid #3b2760; background: #0b0814; color: #fff; font-size: 14px; }
        button { background: linear-gradient(135deg, #7e22ce, #a855f7); border: none; font-weight: 700; cursor: pointer; }
        button:hover { opacity: 0.9; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 22px; }
        .stat { background: #19132b; border-left: 4px solid #a855f7; padding: 18px; border-radius: 12px; }
        .stat b { font-size: 30px; color: #e9d5ff; display: block; margin-top: 6px; }
        table { width: 100%; border-collapse: collapse; margin-top: 14px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #221836; }
        th { color: #a855f7; font-size: 12px; text-transform: uppercase; }
        .av { width: 34px; height: 34px; border-radius: 50%; vertical-align: middle; margin-right: 10px; }
        #appView { display: none; }
    </style>
</head>
<body>
    <div class="wrap">
        <div class="card" id="loginView">
            <h1>🔐 Kyven Restore Members • Dashboard</h1>
            <p>Ingresa tu código de seguridad personal para gestionar tu base de datos de MongoDB.</p>
            <input type="password" id="pin" placeholder="Código de seguridad personal..." />
            <button onclick="login()">Acceder al Panel</button>
        </div>

        <div id="appView">
            <div class="grid">
                <div class="stat">Usuarios en MongoDB <b id="stTotal">0</b></div>
                <div class="stat">Servidores Activos <b id="stGuilds">0</b></div>
                <div class="stat">Estado del Restore <b id="stQueue" style="font-size:18px;">En espera</b></div>
            </div>

            <div class="card">
                <h2>🚀 Transferir Miembros a un Servidor (Máx. 500 sin bloqueos)</h2>
                <div style="display:flex;gap:12px;flex-wrap:wrap;">
                    <select id="guildSelect" style="flex:1;min-width:220px;"></select>
                    <input type="text" id="customGuildId" placeholder="O pega el ID del servidor..." style="width:220px;" />
                    <input type="number" id="cant" value="500" min="1" max="500" style="width:110px;" />
                    <button onclick="ejecutarPull()">Meter Miembros</button>
                    <button onclick="login()" style="background:#271a3c;">🔄 Actualizar</button>
                </div>
            </div>

            <div class="card">
                <h2>👥 Usuarios Verificados Guardados</h2>
                <input type="text" id="buscador" placeholder="Buscar por nombre o ID de Discord..." oninput="filtrar()" style="width:100%;" />
                <table>
                    <thead>
                        <tr><th>Usuario</th><th>ID Discord</th><th>Fecha Registro</th></tr>
                    </thead>
                    <tbody id="tablaUsuarios"></tbody>
                </table>
            </div>
        </div>
    </div>
    <script>
        let savedPin = '';
        let usuarios = [];

        async function login() {
            const pin = savedPin || document.getElementById('pin').value.trim();
            const res = await fetch('/api/dashboard-stats', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin })
            });
            if (!res.ok) return alert('❌ Código de seguridad incorrecto');
            savedPin = pin;
            const data = await res.json();

            document.getElementById('loginView').style.display = 'none';
            document.getElementById('appView').style.display = 'block';

            document.getElementById('stTotal').innerText = data.total;
            document.getElementById('stGuilds').innerText = data.guilds.length;
            const p = data.progresoRestore;
            document.getElementById('stQueue').innerText = p.activo
                ? \`Procesando \${p.procesados}/\${p.total} (✅ \${p.unidos})\`
                : \`Listo (Último: ✅ \${p.unidos})\`;

            document.getElementById('guildSelect').innerHTML = data.guilds.map(g => \`<option value="\${g.id}">\${g.name} (\${g.id})</option>\`).join('');
            usuarios = data.users;
            dibujar(usuarios);
        }

        function dibujar(lista) {
            document.getElementById('tablaUsuarios').innerHTML = lista.map(u => \`
                <tr>
                    <td><img class="av" src="\${u.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png'}" /> <b>\${u.username || 'Usuario'}</b></td>
                    <td><code>\${u.user_id}</code></td>
                    <td>\${new Date(u.fecha).toLocaleString()}</td>
                </tr>
            \`).join('');
        }

        function filtrar() {
            const q = document.getElementById('buscador').value.toLowerCase();
            dibujar(usuarios.filter(u => (u.username || '').toLowerCase().includes(q) || u.user_id.includes(q)));
        }

        async function ejecutarPull() {
            const guildId = document.getElementById('customGuildId').value.trim() || document.getElementById('guildSelect').value;
            const cantidad = document.getElementById('cant').value;
            const res = await fetch('/api/dashboard-pull', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pin: savedPin, guildId, cantidad })
            });
            const data = await res.json();
            alert(data.message || data.error);
            login();
        }
    </script>
</body>
</html>`);
});

app.listen(PORT, () => {
    console.log(`🌐 Servidor web y Dashboard corriendo en el puerto ${PORT}`);
});

// ==========================================================
// 5. BOT DE DISCORD CON BLOQUEO ESTRICTO DE SEGURIDAD
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
            // Asegurar que todos tus comandos pidan tu código de seguridad personal si no lo tenían
            if (!jsonCmd.options) jsonCmd.options = [];
            const tieneCodigo = jsonCmd.options.some(o => o.name === 'codigo');
            if (!tieneCodigo && jsonCmd.options.every(o => o.type !== 1 && o.type !== 2)) {
                jsonCmd.options.push({
                    name: 'codigo',
                    description: 'Código de seguridad personal obligatorio',
                    type: 3, // STRING
                    required: true
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

// Comando nativo /restore_pull blindado para meter 500 personas desde Discord
const pullCmd = new SlashCommandBuilder()
    .setName('restore_pull')
    .setDescription('Transfiere hasta 500 miembros de MongoDB a este servidor sin bloqueos')
    .addStringOption(opt => opt.setName('codigo').setDescription('Tu código de seguridad personal').setRequired(true))
    .addIntegerOption(opt => opt.setName('cantidad').setDescription('Cantidad de miembros (1 a 500)').setMinValue(1).setMaxValue(500).setRequired(false));

slashCommands.push(pullCmd.toJSON());

client.once('ready', async () => {
    console.log(`🤖 Bot encendido como: ${client.user.tag}`);
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: slashCommands });
        console.log('✅ Comandos Slash blindados registrados correctamente.');
    } catch (error) {
        console.error(error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const codigoIngresado = interaction.options.getString('codigo');
    const esOwner = !OWNER_ID || interaction.user.id === OWNER_ID;

    // BLOQUEO TOTAL DENTRO Y FUERA DEL SERVIDOR SI NO PONEN TU PIN PERSONAL
    if (!esOwner || codigoIngresado !== CODIGO_SECRETO) {
        return await interaction.reply({
            content: '🛑 **Acceso Bloqueado:** No se puede ejecutar ningún comando dentro ni fuera del servidor sin el código de seguridad personal del propietario.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    if (interaction.commandName === 'restore_pull') {
        if (restoreEnCurso) {
            return await interaction.reply({
                content: `⏳ Ya hay una transferencia activa (${progresoRestore.procesados}/${progresoRestore.total}).`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        const cantidad = interaction.options.getInteger('cantidad') || 500;
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
});

client.login(process.env.TOKEN);