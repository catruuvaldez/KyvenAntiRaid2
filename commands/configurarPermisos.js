const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('configurar-permisos')
        .setDescription('Bloquea masivamente el servidor protegiendo canales y manteniendo visibles los paneles')
        .addRoleOption(option =>
            option.setName('rol_usuarios')
                .setDescription('El rol de Usuarios del servidor')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const guild = interaction.guild;
        const rolUsuarios = interaction.options.getRole('rol_usuarios');
        const everyoneId = guild.id;
        
        // IDs de canales estrictamente privados (ocultos)
        const canalesPrivadosEstrictos = [
            '1547736261521842186', // notificaciones
            '1547748846468333699'  // tickets-closed
        ];

        // Canal de verificación público (solo lectura)
        const canalVerificarId = '1547772473020387388';

        // Canales permitidos para escribir (Feedback)
        const canalesPermitidosEscritura = [
            '1547709304407203870'  // Feedback
        ];

        // ID de la categoría Chat principal
        const categoriaChatId = '1547412298832814244';

        try {
            const channels = await guild.channels.fetch();
            let actualizados = 0;

            for (const [id, channel] of channels) {
                if (!channel) continue;

                // 1. Canales privados estrictos (Ocultos para todos)
                if (canalesPrivadosEstrictos.includes(channel.id)) {
                    await channel.permissionOverwrites.edit(everyoneId, { ViewChannel: false });
                    await channel.permissionOverwrites.edit(rolUsuarios.id, { ViewChannel: false });
                    continue;
                }

                // 2. Canal de Verificación (Solo lectura)
                if (channel.id === canalVerificarId) {
                    await channel.permissionOverwrites.edit(everyoneId, {
                        ViewChannel: true,
                        ReadMessageHistory: true,
                        SendMessages: false,
                        AddReactions: true,
                    });
                    continue;
                }

                // 3. EXCLUSIÓN SEGURA DE TICKETS: Si es un canal individual de ticket abierto por un usuario (ej. compra-catruuu), lo ocultamos al rol Usuarios, pero NO la categoría principal
                const nombreCanal = channel.name.toLowerCase();
                const esCanalTicketIndividual = nombreCanal.includes('ticket') || nombreCanal.includes('compra-');

                if (esCanalTicketIndividual && channel.type !== 4) { // Si es un canal de texto de ticket (no categoría)
                    await channel.permissionOverwrites.edit(rolUsuarios.id, { ViewChannel: false });
                    continue;
                }

                // Si es la categoría de tickets completa, la ignoramos para que no desaparezca el apartado visual
                if (channel.parent) {
                    const nombreCategoria = channel.parent.name.toLowerCase();
                    if (nombreCategoria.includes('ticket') && channel.type === 4) {
                        continue;
                    }
                }

                // 4. Canales de escritura permitida (Feedback y Chat)
                if (canalesPermitidosEscritura.includes(channel.id) || channel.parentId === categoriaChatId) {
                    await channel.permissionOverwrites.edit(everyoneId, {
                        ViewChannel: false,
                        CreateInstantInvite: false,
                    });

                    await channel.permissionOverwrites.edit(rolUsuarios.id, {
                        ViewChannel: true,
                        ReadMessageHistory: true,
                        SendMessages: true,
                        AddReactions: true,
                        AttachFiles: true,
                        EmbedLinks: true,
                        UseApplicationCommands: true,
                        CreateInstantInvite: false,
                    });
                    actualizados++;
                    continue;
                }

                // 5. RESTO DE CANALES: Bloquear envío de mensajes y visibilidad general
                await channel.permissionOverwrites.edit(everyoneId, {
                    ViewChannel: false,
                    CreateInstantInvite: false,
                });

                await channel.permissionOverwrites.edit(rolUsuarios.id, {
                    ViewChannel: true,
                    ReadMessageHistory: true,
                    SendMessages: false,
                    SendMessagesInThreads: false,
                    CreatePublicThreads: false,
                    CreatePrivateThreads: false,
                    AddReactions: false,
                    UseExternalEmojis: false,
                    UseExternalStickers: false,
                    MentionEveryone: false,
                    ManageMessages: false,
                    ManageThreads: false,
                    AttachFiles: false,
                    EmbedLinks: false,
                    UseApplicationCommands: false,
                    ManageChannels: false,
                    ManageRoles: false,
                    ManageWebhooks: false,
                    CreateInstantInvite: false,
                });

                actualizados++;
            }

            await interaction.editReply({ 
                content: `✅ ¡Listo! Se restauró la categoría de tickets para que sea visible, ocultando únicamente los canales privados de tickets individuales a los usuarios ajenos.` 
            });

        } catch (error) {
            console.error('Error al configurar los permisos masivos:', error);
            await interaction.editReply({ content: '❌ Ocurrió un error al intentar modificar los permisos.' });
        }
    },
};