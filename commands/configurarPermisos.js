const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('configurar-permisos')
        .setDescription('Bloquea masivamente el servidor protegiendo canales y manteniendo visibles los paneles')
        .addRoleOption(option =>
            option.setName('rol_usuarios')
                .setDescription('El rol de Usuarios (o Verificados) del servidor')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const guild = interaction.guild;
        const rolUsuarios = interaction.options.getRole('rol_usuarios');
        const everyoneId = guild.id;
        
        // --- NUEVOS ROLES Y CATEGORÍAS ---
        const rolFriendsId = '1565479493534093523';
        const rolVerificadoId = '1561162470557483098'; // Registrado en el código como referencia
        const categoriaFriendsId = '1565479867095589006';
        
        // ID DEL ENCARGADO DE VENTAS:
        const rolVentasId = '1548106038329212968';
        
        // ID de la categoría súper privada
        const categoriaPrivadaEstricta = '1547736192584515756';

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

                try {
                    // 0. CATEGORÍA SÚPER PRIVADA
                    if (channel.id === categoriaPrivadaEstricta || channel.parentId === categoriaPrivadaEstricta) {
                        await channel.permissionOverwrites.edit(everyoneId, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(rolUsuarios.id, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(rolFriendsId, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(rolVentasId, { ViewChannel: false });
                        continue;
                    }

                    // 1. Canales privados estrictos
                    if (canalesPrivadosEstrictos.includes(channel.id)) {
                        await channel.permissionOverwrites.edit(everyoneId, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(rolUsuarios.id, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(rolFriendsId, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(rolVentasId, { ViewChannel: false });
                        continue;
                    }

                    // 2. Canal de Verificación
                    if (channel.id === canalVerificarId) {
                        await channel.permissionOverwrites.edit(everyoneId, {
                            ViewChannel: true, ReadMessageHistory: true, SendMessages: false, AddReactions: true,
                        });
                        continue;
                    }

                    // --- NUEVO: CATEGORÍA FRIENDS (Solo para el rol Friends) ---
                    if (channel.id === categoriaFriendsId || channel.parentId === categoriaFriendsId) {
                        await channel.permissionOverwrites.edit(everyoneId, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(rolUsuarios.id, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(rolFriendsId, { 
                            ViewChannel: true, ReadMessageHistory: true, SendMessages: true, AttachFiles: true, EmbedLinks: true 
                        });
                        continue;
                    }

                    // 3. DETECCIÓN INTELIGENTE DE TICKETS
                    let esTicketPrivado = false;
                    let esCategoriaTicket = false;

                    if (channel.type === 4) { 
                        const nombreCat = channel.name.toLowerCase();
                        if (nombreCat.includes('ticket') || nombreCat.includes('soporte') || nombreCat.includes('compra') || nombreCat.includes('partner')) {
                            esCategoriaTicket = true;
                        }
                    } else {
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

                    if (esCategoriaTicket) {
                        await channel.permissionOverwrites.edit(rolVentasId, { ViewChannel: true, ReadMessageHistory: true });
                        continue; 
                    }

                    if (esTicketPrivado && channel.type !== 4 && channel.name.toLowerCase() !== 'ticket') {
                        await channel.permissionOverwrites.edit(rolUsuarios.id, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(rolFriendsId, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(rolVentasId, { 
                            ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true
                        });
                        continue;
                    }

                    // 4. Canales de escritura
                    if (canalesPermitidosEscritura.includes(channel.id) || channel.parentId === categoriaChatId) {
                        await channel.permissionOverwrites.edit(everyoneId, { ViewChannel: false, CreateInstantInvite: false });
                        
                        const permsEscritura = {
                            ViewChannel: true, ReadMessageHistory: true, SendMessages: true, AddReactions: true, AttachFiles: true, EmbedLinks: true
                        };
                        
                        await channel.permissionOverwrites.edit(rolUsuarios.id, permsEscritura);
                        await channel.permissionOverwrites.edit(rolFriendsId, permsEscritura);
                        
                        actualizados++;
                        continue;
                    }

                    // 5. RESTO DE CANALES: Solo lectura
                    await channel.permissionOverwrites.edit(everyoneId, { ViewChannel: false, CreateInstantInvite: false });
                    
                    const permsLectura = {
                        ViewChannel: true, ReadMessageHistory: true, SendMessages: false, AddReactions: false
                    };

                    await channel.permissionOverwrites.edit(rolUsuarios.id, permsLectura);
                    await channel.permissionOverwrites.edit(rolFriendsId, permsLectura);
                    
                    actualizados++;

                } catch (innerError) {
                    if (innerError.code === 10003) {
                        console.log(`⚠️ Canal ignorado (fue eliminado mientras se configuraba): ${channel.id}`);
                    } else {
                        console.error(`❌ Error editando canal ${channel.id}:`, innerError);
                    }
                }
            }

            await interaction.editReply({ 
                content: `✅ ¡Permisos actualizados! Canales procesados exitosamente (se ignoraron los tickets borrados).` 
            });

        } catch (error) {
            console.error('Error general del comando:', error);
            await interaction.editReply({ content: '❌ Ocurrió un error general.' });
        }
    },
};