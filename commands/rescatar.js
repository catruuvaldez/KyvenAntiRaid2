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

        let anadir = 0;
        let fallos = 0;

        for (const t of tokens) {
            try {
                const res = await fetch(`https://discord.com/api/guilds/${interaction.guildId}/members/${t.user_id}`, {
                    method: 'PUT',
                    headers: {
                        Authorization: `Bot ${process.env.TOKEN}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        access_token: t.access_token,
                    }),
                });

                if (res.ok || res.status === 204) {
                    anadir++;
                } else {
                    fallos++;
                }
            } catch (e) {
                fallos++;
            }
        }

        await interaction.editReply(`🎉 **Proceso de rescate finalizado:**\n• Añadidos con éxito: ${anadir}\n• No se pudieron añadir (tokens expirados/revocados): ${fallos}`);
    },
};