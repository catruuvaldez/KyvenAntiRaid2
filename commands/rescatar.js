const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rescatar')
        .setDescription('Mueve a los usuarios respaldados al servidor actual')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction, db) {
        await interaction.deferReply({ ephemeral: true });

        const tokens = db.prepare('SELECT * FROM oauth_tokens').all();
        if (tokens.length === 0) {
            return interaction.editReply('❌ No hay usuarios guardados en la base de datos de OAuth2.');
        }

        const updateStmt = db.prepare(`
            UPDATE oauth_tokens 
            SET access_token = ?, refresh_token = ?, fecha = ? 
            WHERE user_id = ?
        `);

        let anadir = 0;
        let yaEstaban = 0;
        let fallos = 0;

        for (const t of tokens) {
            try {
                let currentAccessToken = t.access_token;

                // 1. Intentamos meter al usuario con el token actual
                let res = await fetch(`https://discord.com/api/v10/guilds/${interaction.guildId}/members/${t.user_id}`, {
                    method: 'PUT',
                    headers: {
                        Authorization: `Bot ${process.env.TOKEN}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        access_token: currentAccessToken,
                    }),
                });

                // 2. Si el token caducó (401 o 403), usamos el refresh_token para renovarlo
                if (res.status === 401 || res.status === 403) {
                    const params = new URLSearchParams({
                        client_id: process.env.CLIENT_ID,
                        client_secret: process.env.CLIENT_SECRET,
                        grant_type: 'refresh_token',
                        refresh_token: t.refresh_token,
                    });

                    const refreshRes = await fetch('https://discord.com/api/v10/oauth2/token', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/x-www-form-urlencoded',
                        },
                        body: params.toString(),
                    });

                    if (refreshRes.ok) {
                        const refreshData = await refreshRes.json();
                        currentAccessToken = refreshData.access_token;

                        // Guardamos el nuevo token renovado en bot.db
                        updateStmt.run(
                            refreshData.access_token,
                            refreshData.refresh_token,
                            new Date().toISOString(),
                            t.user_id
                        );

                        // 3. Reintentamos meter al usuario con el token fresco
                        res = await fetch(`https://discord.com/api/v10/guilds/${interaction.guildId}/members/${t.user_id}`, {
                            method: 'PUT',
                            headers: {
                                Authorization: `Bot ${process.env.TOKEN}`,
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({
                                access_token: currentAccessToken,
                            }),
                        });
                    } else {
                        fallos++;
                        continue;
                    }
                }

                if (res.status === 201) {
                    anadir++;
                } else if (res.status === 204) {
                    yaEstaban++;
                } else {
                    fallos++;
                }

                // Pausa de 1 segundo para evitar Rate Limits de Discord
                await new Promise(resolve => setTimeout(resolve, 1000));

            } catch (e) {
                console.error(`Error al rescatar a ${t.user_id}:`, e);
                fallos++;
            }
        }

        await interaction.editReply(
            `🎉 **Proceso de rescate finalizado:**\n` +
            `• Añadidos con éxito: **${anadir}**\n` +
            `• Ya estaban en el servidor: **${yaEstaban}**\n` +
            `• No se pudieron añadir (revocados/error): **${fallos}**`
        );
    },
};