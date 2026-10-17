// index.js
require('dotenv').config();
const { Client, GatewayIntentBits, Collection, Routes, REST } = require('discord.js');
const express = require('express');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// 1. Configurar Base de Datos SQLite
const db = new Database('bot.db');
db.exec(`
    CREATE TABLE IF NOT EXISTS oauth_tokens (
        user_id TEXT PRIMARY KEY,
        access_token TEXT NOT NULL,
        refresh_token TEXT NOT NULL,
        fecha TEXT NOT NULL
    );
`);

// 2. Servidor Express (OAuth2 Callback)
const app = express();
const PORT = process.env.PORT || 3000;

// Servir archivos estáticos (imágenes, CSS, etc.)
app.use(express.static(__dirname));

app.get('/auth/callback', async (req, res) => {
    const code = req.query.code;
    if (!code) return res.send('❌ No se proporcionó ningún código de autorización.');

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

            const stmt = db.prepare(`
                INSERT INTO oauth_tokens (user_id, access_token, refresh_token, fecha)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(user_id) DO UPDATE SET access_token = ?, refresh_token = ?, fecha = ?
            `);
            const now = new Date().toISOString();
            stmt.run(userData.id, data.access_token, data.refresh_token, now, data.access_token, data.refresh_token, now);

            // Asignación de ambos roles en el servidor
            if (process.env.GUILD_ID) {
                const rolesToAssign = [
                    process.env.ROLE_ID, // Rol original de verificado (1547729113391960064)
                    process.env.ROLE_USUARIO_ID || '1561162470557483098' // Nuevo rol
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

            // Enviar la interfaz visual
            res.sendFile(path.join(__dirname, 'index.html'));
        } else {
            res.send('❌ Error al obtener los tokens de Discord.');
        }
    } catch (error) {
        console.error(error);
        res.send('❌ Ocurrió un error interno durante la autenticación.');
    }
});

app.listen(PORT, () => {
    console.log(`🌐 Servidor web corriendo en el puerto ${PORT}`);
});

// 3. Configurar Bot de Discord
const client = new Client({ intents: [GatewayIntentBits.Guilds] });
client.commands = new Collection();

const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));
    const slashCommands = [];

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            client.commands.set(command.data.name, command);
            slashCommands.push(command.data.toJSON());
        }
    }

    client.once('ready', async () => {
        console.log(`🤖 Bot encendido como: ${client.user.tag}`);
        const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
        try {
            await rest.put(Routes.applicationCommands(client.user.id), { body: slashCommands });
            console.log('✅ Comandos Slash registrados correctamente.');
        } catch (error) {
            console.error(error);
        }
    });
} else {
    client.once('ready', () => {
        console.log(`🤖 Bot encendido como: ${client.user.tag}`);
    });
}

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction, db);
    } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: '❌ Hubo un error al ejecutar este comando.', ephemeral: true });
        } else {
            await interaction.reply({ content: '❌ Hubo un error al ejecutar este comando.', ephemeral: true });
        }
    }
});

client.login(process.env.TOKEN);