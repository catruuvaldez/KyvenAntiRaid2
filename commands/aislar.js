const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

// IDs configuradas
const ROL_AISLADO_ID = '1565566688710107136';
const CANAL_AISLADOS_ID = '1565566576504217744';
const CANAL_NO_HABLAR_ID = '1565541854282256464';
const CANAL_NOTIFICACIONES_ID = '1547736261521842186';

// Función central que ejecuta el aislamiento (tanto manual como automático)
async function aplicarAislamiento(guild, member, dias, razon, moderadorTexto, ventanaMinutos = 15, extraInfo = null) {
    // 1. Guardar roles que tenía antes de quitárselos
    const rolesQuitados = member.roles.cache
        .filter(r => r.id !== guild.id && !r.managed && r.id !== ROL_AISLADO_ID)
        .map(r => r.name);

    // 2. Dejarle únicamente el rol de Aislados (1565566688710107136)
    if (guild.roles.cache.has(ROL_AISLADO_ID)) {
        await member.roles.set([ROL_AISLADO_ID], razon);
    }

    // 3. Aplicar aislamiento temporal de Discord (7 o 14 días)
    const tiempoMs = dias * 24 * 60 * 60 * 1000;
    await member.timeout(tiempoMs, razon).catch(() => {});

    // 4. Eliminar solo los mensajes enviados en el tiempo determinado (ej. últimos 10-15 min)
    const limiteTiempo = Date.now() - (ventanaMinutos * 60 * 1000);
    let mensajesBorrados = extraInfo ? 1 : 0; // Si viene del canal trampa, ya borró el primero

    const canalesTexto = guild.channels.cache.filter(c => c.isTextBased() && !c.isThread());
    for (const [, channel] of canalesTexto) {
        try {
            const messages = await channel.messages.fetch({ limit: 30 });
            const msgsUsuario = messages.filter(m => m.author.id === member.id && m.createdTimestamp >= limiteTiempo);
            if (msgsUsuario.size > 0) {
                await channel.bulkDelete(msgsUsuario, true);
                mensajesBorrados += msgsUsuario.size;
            }
        } catch (e) {}
    }

    // 5. Avisar en el canal de notificaciones (1547736261521842186)
    const canalNotis = guild.channels.cache.get(CANAL_NOTIFICACIONES_ID);
    if (canalNotis) {
        const embed = new EmbedBuilder()
            .setTitle(extraInfo ? '☣️ Cuenta Hackeada Detectada y Aislada' : '🚨 Usuario Aislado Manualmente')
            .setColor(0xFF0000)
            .setThumbnail(member.user.displayAvatarURL())
            .addFields(
                { name: '👤 Usuario', value: `${member.user} (\`${member.id}\`)`, inline: true },
                { name: '🛡️ Acción por', value: moderadorTexto, inline: true },
                { name: '⏳ Duración', value: `**${dias} días**`, inline: true },
                { name: `🧹 Mensajes eliminados (${ventanaMinutos}m)`, value: `**${mensajesBorrados}** mensajes`, inline: true },
                { name: '🔒 Canal de Aislados', value: `<#${CANAL_AISLADOS_ID}>`, inline: true },
                { name: '🎭 Roles retirados', value: rolesQuitados.length > 0 ? rolesQuitados.join(', ') : 'Ninguno', inline: false },
                { name: '📄 Motivo / Detalles', value: extraInfo ? `${razon}\n${extraInfo}` : razon, inline: false }
            )
            .setTimestamp();

        await canalNotis.send({ embeds: [embed] }).catch(() => {});
    }

    return mensajesBorrados;
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('aislar')
        .setDescription('Aísla a un usuario ocultándole el servidor y borrando sus mensajes recientes')
        .addUserOption(option =>
            option.setName('usuario')
                .setDescription('El usuario que quieres aislar')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('dias')
                .setDescription('Días de aislamiento (7 o 14 días)')
                .setRequired(true)
                .addChoices(
                    { name: '7 Días', value: 7 },
                    { name: '14 Días', value: 14 }
                ))
        .addStringOption(option =>
            option.setName('razon')
                .setDescription('Motivo del aislamiento')
                .setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const guild = interaction.guild;
        const targetUser = interaction.options.getUser('usuario');
        const dias = interaction.options.getInteger('dias');
        const razon = interaction.options.getString('razon') || 'Aislado manualmente por sospecha de hackeo/spam';

        const member = await guild.members.fetch(targetUser.id).catch(() => null);
        if (!member) {
            return interaction.editReply({ content: '❌ No se encontró al usuario en el servidor.' });
        }

        try {
            const borrados = await aplicarAislamiento(
                guild,
                member,
                dias,
                razon,
                `${interaction.user}`,
                15
            );

            await interaction.editReply({
                content: `✅ **${targetUser.tag}** fue aislado por **${dias} días** en <#${CANAL_AISLADOS_ID}>. Se eliminaron **${borrados}** mensajes recientes.`
            });
        } catch (error) {
            console.error('Error en comando /aislar:', error);
            await interaction.editReply({ content: '❌ Ocurrió un error al aislar al usuario (revisa que el rol del Bot esté por encima de los demás roles).' });
        }
    },

    // Detector automático que vigila el canal NO HABLAR (1565541854282256464)
    initDetector(client) {
        client.on('messageCreate', async (message) => {
            if (message.author.bot || !message.guild) return;
            if (message.channel.id !== CANAL_NO_HABLAR_ID) return;

            // 1. Siempre borra el mensaje enviado en NO HABLAR inmediatamente
            await message.delete().catch(() => {});

            // 2. Evaluar si cumple con los patrones de cuentas hackeadas (fotos de casinos/MrBeast, menciones o links)
            const cantImagenes = message.attachments.size;
            const tieneImagenesOEmbeds = cantImagenes > 0 || message.embeds.length > 0;
            const tieneMenciones = message.mentions.everyone || message.mentions.users.size > 0 || message.mentions.roles.size > 0;
            const tieneLinks = /(https?:\/\/[^\s]+|discord\.gg\/[^\s]+)/i.test(message.content);
            const palabrasScam = /(mrbeast|crypto|casino|bonus|withdraw|free|nitro|airdrop|steam|promo|\$3)/i.test(message.content);

            const esPatronHackeado =
                (tieneImagenesOEmbeds && tieneMenciones) ||
                (cantImagenes >= 2) ||
                (tieneLinks && (tieneMenciones || tieneImagenesOEmbeds)) ||
                (palabrasScam && (tieneMenciones || tieneImagenesOEmbeds));

            // Si alguien mandó un "." o escribió algo corto por error sin patrón de hackeo, solo se borra el mensaje y no se aísla
            if (!esPatronHackeado) return;

            const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
            if (!member) return;

            // Si etiquetó a @everyone o mandó múltiples imágenes como en tus capturas -> 14 días, si no -> 7 días
            const diasSancion = (message.mentions.everyone || cantImagenes >= 2) ? 14 : 7;
            const detallePatron = `• **Imágenes:** ${cantImagenes} | **Menciones:** ${tieneMenciones ? 'Sí' : 'No'} | **Links:** ${tieneLinks ? 'Sí' : 'No'}\n• **Texto:** ${message.content ? message.content.slice(0, 300) : '*(Sin texto)*'}`;

            try {
                await aplicarAislamiento(
                    message.guild,
                    member,
                    diasSancion,
                    `Auto-Aislamiento en <#${CANAL_NO_HABLAR_ID}>`,
                    '🤖 Detector Anti-Hack',
                    10, // Borra los mensajes que haya mandado en los últimos 10 minutos
                    detallePatron
                );
            } catch (err) {
                console.error('Error al auto-aislar en NO HABLAR:', err);
            }
        });
    }
};