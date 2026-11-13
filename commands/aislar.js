const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');

// IDs configuradas
const OWNER_ID = '1190879141772406804';
const ROL_AISLADO_ID = '1565566688710107136';
const CANAL_AISLADOS_ID = '1565566576504217744';
const CANAL_NO_HABLAR_ID = '1565541854282256464';
const CANAL_NOTIFICACIONES_ID = '1547736261521842186';

// Función central que ejecuta el aislamiento (tanto manual como automático)
async function aplicarAislamiento(guild, member, dias, razon, moderadorTexto, ventanaMinutos = 15, extraInfo = null) {
    const esOwner = member.id === OWNER_ID || member.id === guild.ownerId;
    let rolesQuitados = [];

    // Solo quitamos roles y aplicamos timeout si NO es el dueño
    if (!esOwner) {
        // 1. Guardar roles que tenía antes de quitárselos
        rolesQuitados = member.roles.cache
            .filter(r => r.id !== guild.id && !r.managed && r.id !== ROL_AISLADO_ID)
            .map(r => r.name);

        // 2. Dejarle únicamente el rol de Aislados (1565566688710107136)
        if (guild.roles.cache.has(ROL_AISLADO_ID)) {
            await member.roles.set([ROL_AISLADO_ID], razon).catch(() => {});
        }

        // 3. Aplicar aislamiento temporal de Discord (7 o 14 días)
        const tiempoMs = dias * 24 * 60 * 60 * 1000;
        await member.timeout(tiempoMs, razon).catch(() => {});
    }

    // 4. Eliminar solo los mensajes enviados en el tiempo determinado (ej. últimos 10-15 min)
    // Esto se ejecuta SIEMPRE (incluso si eres el dueño, para limpiar el spam si te hackean)
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
        const titulo = esOwner
            ? '⚠️ Alerta Crítica: Spam Detectado en Cuenta del Dueño'
            : (extraInfo ? '☣️ Cuenta Hackeada Detectada y Aislada' : '🚨 Usuario Aislado Manualmente');

        const embed = new EmbedBuilder()
            .setTitle(titulo)
            .setColor(esOwner ? 0xFFA500 : 0xFF0000)
            .setThumbnail(member.user.displayAvatarURL())
            .addFields(
                { name: '👤 Usuario', value: `${member.user} (\`${member.id}\`)`, inline: true },
                { name: '🛡️ Acción por', value: moderadorTexto, inline: true },
                { name: '⏳ Estado', value: esOwner ? '**No aislado (Dueño)**' : `**Aislado por ${dias} días**`, inline: true },
                { name: `🧹 Mensajes eliminados (${ventanaMinutos}m)`, value: `**${mensajesBorrados}** mensajes`, inline: true },
                { name: '🔒 Canal de Aislados', value: esOwner ? 'N/A (Exento)' : `<#${CANAL_AISLADOS_ID}>`, inline: true },
                { name: '🎭 Roles retirados', value: esOwner ? 'Ninguno (Protección de Dueño)' : (rolesQuitados.length > 0 ? rolesQuitados.join(', ') : 'Ninguno'), inline: false },
                { name: '📄 Motivo / Detalles', value: extraInfo ? `${razon}\n${extraInfo}` : razon, inline: false }
            )
            .setTimestamp();

        await canalNotis.send({ embeds: [embed] }).catch(() => {});
    }

    return { mensajesBorrados, esOwner };
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
            const { mensajesBorrados, esOwner } = await aplicarAislamiento(
                guild,
                member,
                dias,
                razon,
                `${interaction.user}`,
                15
            );

            if (esOwner) {
                await interaction.editReply({
                    content: `⚠️ **${targetUser.tag}** es el dueño del servidor. No fue aislado ni se le quitaron roles, pero por seguridad se eliminaron sus **${mensajesBorrados}** mensajes recientes.`
                });
            } else {
                await interaction.editReply({
                    content: `✅ **${targetUser.tag}** fue aislado por **${dias} días** en <#${CANAL_AISLADOS_ID}>. Se eliminaron **${borrados}** mensajes recientes.`
                });
            }
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

            const esOwner = message.author.id === OWNER_ID || message.author.id === message.guild.ownerId;

            // Evaluar si cumple con los patrones de cuentas hackeadas (fotos de casinos/MrBeast, menciones o links)
            const cantImagenes = message.attachments.size;
            const tieneImagenesOEmbeds = cantImagenes > 0 || message.embeds.length > 0;
            const tieneMenciones = message.mentions.everyone || message.mentions.users.size > 0 || message.mentions.roles.size > 0;
            const tieneLinks = /(https?:\/\/[^\s]+|discord\.gg\/[^\s]+)/i.test(message.content);
            const palabrasScam = /(mrbeast|crypto|casino|bonus|withdraw|free|nitro|airdrop|steam|promo|\$3)/i.test(message.content);

            let esPatronHackeado = false;

            if (esOwner) {
                // Si eres tú (el dueño), permitimos mandar texto normal (incluso con @everyone para tu cartel).
                // Solo se considera hackeo si mandas imágenes, links o palabras de scam.
                esPatronHackeado = tieneImagenesOEmbeds || tieneLinks || palabrasScam;

                // Si no tiene patrón de hackeo, NO borramos tu mensaje para que quede fijo en el canal
                if (!esPatronHackeado) return;
            } else {
                // Para cualquier otro usuario: patrón normal
                esPatronHackeado =
                    (tieneImagenesOEmbeds && tieneMenciones) ||
                    (cantImagenes >= 2) ||
                    (tieneLinks && (tieneMenciones || tieneImagenesOEmbeds)) ||
                    (palabrasScam && (tieneMenciones || tieneImagenesOEmbeds));
            }

            // 1. Borrar el mensaje en NO HABLAR (si es otro usuario se borra siempre; si eres tú, solo si fue detectado como hackeo)
            await message.delete().catch(() => {});

            // Si un usuario normal mandó un "." sin patrón de hackeo, solo se borra el mensaje y no se aísla
            if (!esPatronHackeado) return;

            const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
            if (!member) return;

            // Si etiquetó a @everyone o mandó múltiples imágenes -> 14 días, si no -> 7 días
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