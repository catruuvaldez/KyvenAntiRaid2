const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

// IDs configuradas
const ROL_AISLADO_ID = '1565566688710107136';
const CANAL_NOTIFICACIONES_ID = '1547736261521842186';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('desaislar')
        .setDescription('Quita el aislamiento a un usuario, le remueve el timeout y le devuelve sus roles base')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('El usuario que deseas desaislar')
                .setRequired(true))
        .addRoleOption(option =>
            option.setName('rol_principal')
                .setDescription('El rol base que se le devolverá (ej. Usuarios o Verificado)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('razon')
                .setDescription('Motivo por el cual se le desaisla')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const guild = interaction.guild;
        const targetUser = interaction.options.getUser('usuario');
        const rolPrincipal = interaction.options.getRole('rol_principal');
        const razon = interaction.options.getString('razon') || 'Cuenta verificada / Segura de nuevo';

        const member = await guild.members.fetch(targetUser.id).catch(() => null);
        if (!member) {
            return interaction.editReply({ content: '❌ No se encontró al usuario en el servidor.' });
        }

        try {
            // 1. Quitar el rol de Aislado y asignar el rol principal (y opcionalmente Verificado)
            const rolesNuevos = [rolPrincipal.id];
            
            // Si el rol de verificado existe, también se lo podemos devolver opcionalmente
            const rolVerificadoId = '1561162470557483098';
            if (guild.roles.cache.has(rolVerificadoId) && rolPrincipal.id !== rolVerificadoId) {
                rolesNuevos.push(rolVerificadoId);
            }

            await member.roles.set(rolesNuevos, `Desaislado por ${interaction.user.tag}: ${razon}`);

            // 2. Remover el timeout (aislamiento de Discord)
            await member.timeout(null, razon).catch(() => {});

            // 3. Enviar aviso al canal de notificaciones
            const canalNotis = guild.channels.cache.get(CANAL_NOTIFICACIONES_ID);
            if (canalNotis) {
                const embed = new EmbedBuilder()
                    .setTitle('🔓 Usuario Desaislado / Restaurado')
                    .setColor(0x00FF00)
                    .setThumbnail(targetUser.displayAvatarURL())
                    .addFields(
                        { name: '👤 Usuario', value: `${targetUser} (\`${targetUser.id}\`)`, inline: true },
                        { name: '🛡️ Moderador', value: `${interaction.user}`, inline: true },
                        { name: '🎭 Roles restaurados', value: `<@&${rolPrincipal.id}>`, inline: true },
                        { name: '📄 Razón', value: razon, inline: false }
                    )
                    .setTimestamp();

                await canalNotis.send({ embeds: [embed] }).catch(() => {});
            }

            await interaction.editReply({
                content: `✅ **${targetUser.tag}** ha sido desaislado con éxito. Se le removió el timeout y se le asignó el rol <@&${rolPrincipal.id}>.`
            });

        } catch (error) {
            console.error('Error en comando /desaislar:', error);
            await interaction.editReply({ content: '❌ Ocurrió un error al intentar desaislar al usuario (revisa que el rol del Bot esté por encima de los demás roles).' });
        }
    }
};