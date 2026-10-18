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
        
        // ID DEL ENCARGADO DE VENTAS FIJADA AQUÍ:
        const rolVentasId = '1548106038329212968';
        
        // IDs de canales estrictamente privados (ocultos)
        const canalesPrivadosEstrictos = [
            '1547736261521842186', // notificaciones
            '1547748846468333699', // tickets-closed
            '1548577541944647680'  // notis allys
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
                    
                    // Permitir al Encargado de Ventas ver los tickets cerrados
                    if (channel.id === '1547748846468333699') {
                        await channel.permissionOverwrites.edit(rolVentasId, { 
                            ViewChannel: true,
                            ReadMessageHistory: true
                        });
                    }
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

                // 3. DETECCIÓN INTELIGENTE DE TICKETS
                let esTicketPrivado = false;
                let esCategoriaTicket = false;

                if (channel.type === 4) { // Es una Categoría
                    const nombreCat = channel.name.toLowerCase();
                    if (nombreCat.includes('ticket') || nombreCat.includes('soporte') || nombreCat.includes('compra') || nombreCat.includes('partner')) {
                        esCategoriaTicket = true;
                    }
                } else {
                    // Es un canal dentro de una categoría o por nombre
                    if (channel.parent) {
                        const nombreCategoria = channel.parent.name.toLowerCase();
                        if (nombreCategoria.includes('ticket') || nombreCategoria.includes('soporte') || nombreCategoria.includes('compra') || nombreCategoria.includes('partner')) {
                            esTicketPrivado = true;
                        }
                    }
                    const nombreCanal = channel.name.toLowerCase();
                    if (nombreCanal.includes('ticket') || nombreCanal.includes('compra-') || nombreCanal.includes('soporte') || nombreCanal.includes('partner')) {
                        esTicketPrivado = true;
                    }
                }

                // A) Otorgar permisos a la CATEGORÍA principal de tickets al rol Ventas
                if (esCategoriaTicket) {
                    await channel.permissionOverwrites.edit(rolVentasId, { 
                        ViewChannel: true,
                        ReadMessageHistory: true
                    });
                    continue; // Fin de modificación para la categoría
                }

                // B) Ocultar canal de ticket abierto a usuarios normales y DÁRSELO a Ventas
                if (esTicketPrivado && channel.type !== 4 && channel.name.toLowerCase() !== 'ticket') {
                    await channel.permissionOverwrites.edit(rolUsuarios.id, { ViewChannel: false });
                    
                    await channel.permissionOverwrites.edit(rolVentasId, { 
                        ViewChannel: true,
                        SendMessages: true,
                        ReadMessageHistory: true,
                        AttachFiles: true
                    });
                    continue;
                }

                // 4. Canales de escritura permitida (Feedback y Chat)
                if (canalesPermitidosEscritura.includes(channel.id) || channel.parentId === categoriaChatId) {
                    await channel.permissionOverwrites.edit(everyoneId, { ViewChannel: false, CreateInstantInvite: false });
                    await channel.permissionOverwrites.edit(rolUsuarios.id, {
                        ViewChannel: true, ReadMessageHistory: true, SendMessages: true, AddReactions: true, AttachFiles: true, EmbedLinks: true
                    });
                    actualizados++;
                    continue;
                }

                // 5. RESTO DE CANALES: Solo lectura
                await channel.permissionOverwrites.edit(everyoneId, { ViewChannel: false, CreateInstantInvite: false });
                await channel.permissionOverwrites.edit(rolUsuarios.id, {
                    ViewChannel: true, ReadMessageHistory: true, SendMessages: false, AddReactions: false
                });
                actualizados++;
            }

            await interaction.editReply({ 
                content: `✅ ¡Permisos actualizados! Rol de Ventas habilitado en los tickets existentes.` 
            });

        } catch (error) {
            console.error('Error:', error);
            await interaction.editReply({ content: '❌ Ocurrió un error.' });
        }
    },
};