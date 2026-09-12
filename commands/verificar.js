const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('verificar')
        .setDescription('Envía el panel de verificación'),
    
    async execute(interaction) {
        const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join`;

        const embed = new EmbedBuilder()
            .setTitle('🛡️ Verificación de Seguridad Anti-Raid')
            .setDescription('Haz clic en el botón de abajo para autorizar la verificación y asegurar tu acceso en caso de emergencia en el servidor.')
            .setColor('Blurple');

        const row = {
            type: 1,
            components: [
                {
                    type: 2,
                    style: 5,
                    label: 'Verificarse con Discord',
                    url: authUrl
                }
            ]
        };

        await interaction.reply({ embeds: [embed], components: [row], ephemeral: false });
    },
};