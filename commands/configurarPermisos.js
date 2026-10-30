const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('configurar-permisos')
        .setDescription('Bloquea masivamente el servidor protegiendo canales y manteniendo visibles los paneles')
        .addRoleOption(option =>
            option.setName('rol_usuarios')
                .setDescription('El rol a configurar (ej. Usuarios o Verificado)')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const guild = interaction.guild;
        const rolSeleccionado = interaction.options.getRole('rol_usuarios');
        const everyoneId = guild.id;
        
        // IDs de Roles fijos
        const rolUsuariosFijoId = '1547412298321109064'; // Si tienes la ID fija del rol Usuarios puedes ponerla o el bot usará el que elijas en el comando
        const rolVentasId = '1548106038329212968';
        const rolVerificadoId = '1561162470557483098';
        const rolFriendsId = '1565479493534093523';
        const rolCompradorId = '1547729344229802136';
        const rolPartnerId = '1547728922744197170';
        
        // IDs de Categorías y Canales especiales
        const categoriaPrivadaEstricta = '1547736192584515756';
        const categoriaFriendsId = '1565479867095589006';
        const categoriaCompradoresId = '1559229498023608380';
        const categoriaBackupId = 'PON_LA_ID_DE_LA_CATEGORIA_BACKUP_AQUI'; // Si tienes otra categoría Backup, pon su ID aquí
        const canalVerificarId = '1547772473020387388';
        const categoriaChatId = '1547412298832814244';

        const canalesPrivadosEstrictos = [
            '1547736261521842186', // notificaciones
            '1547748846468333699', // tickets-closed
            '1548577541944647680'  // notis allys
        ];

        const canalesPermitidosEscritura = [
            '1547709304407203870'  // Feedback
        ];

        // Función auxiliar para bloquear un canal a una lista de roles sin fallar si un ID no existe
        const bloquearRoles = async (channel, rolesIds) => {
            for (const id of rolesIds) {
                if (guild.roles.cache.has(id)) {
                    await channel.permissionOverwrites.edit(id, { ViewChannel: false });
                }
            }
        };

        try {
            await guild.roles.fetch();
            const channels = await guild.channels.fetch();
            let actualizados = 0;

            // Lista de todos los roles generales que NO deben ver zonas privadas
            const todosLosRolesNoAdmin = [
                everyoneId,
                rolSeleccionado.id,
                rolVerificadoId,
                rolFriendsId,
                rolCompradorId,
                rolPartnerId,
                rolVentasId
            ];

            for (const [id, channel] of channels) {
                if (!channel) continue;

                try {
                    // 0. CATEGORÍAS SÚPER PRIVADAS Y BACKUP (Nadie las ve excepto Admin)
                    if (
                        channel.id === categoriaPrivadaEstricta || channel.parentId === categoriaPrivadaEstricta || 
                        channel.id === categoriaBackupId || channel.parentId === categoriaBackupId
                    ) {
                        await bloquearRoles(channel, todosLosRolesNoAdmin);
                        continue;
                    }

                    // 1. CATEGORÍA FRIENDS (Exclusiva SOLO para el rol Friends, borra accesos de Usuarios/Verificado/etc.)
                    if (channel.id === categoriaFriendsId || channel.parentId === categoriaFriendsId) {
                        const overwritesFriends = [
                            { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
                            { id: rolSeleccionado.id, deny: [PermissionFlagsBits.ViewChannel] },
                            { id: rolVerificadoId, deny: [PermissionFlagsBits.ViewChannel] },
                            { id: rolVentasId, deny: [PermissionFlagsBits.ViewChannel] },
                            { id: rolCompradorId, deny: [PermissionFlagsBits.ViewChannel] },
                            { id: rolPartnerId, deny: [PermissionFlagsBits.ViewChannel] },
                            {
                                id: rolFriendsId,
                                allow: [
                                    PermissionFlagsBits.ViewChannel,
                                    PermissionFlagsBits.ReadMessageHistory,
                                    PermissionFlagsBits.SendMessages,
                                    PermissionFlagsBits.AddReactions,
                                    PermissionFlagsBits.AttachFiles,
                                    PermissionFlagsBits.EmbedLinks
                                ]
                            }
                        ].filter(o => guild.roles.cache.has(o.id));

                        await channel.permissionOverwrites.set(overwritesFriends);
                        actualizados++;
                        continue;
                    }

                    // 2. CATEGORÍA COMPRADORES (Exclusiva para Comprador y Partner)
                    if (channel.id === categoriaCompradoresId || channel.parentId === categoriaCompradoresId) {
                        await channel.permissionOverwrites.edit(everyoneId, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(rolSeleccionado.id, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(rolVerificadoId, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(rolFriendsId, { ViewChannel: false });

                        // Dar acceso a Comprador y Partner
                        const permisosCompradores = {
                            ViewChannel: true,
                            ReadMessageHistory: true,
                            SendMessages: false,
                            AddReactions: true
                        };
                        await channel.permissionOverwrites.edit(rolCompradorId, permisosCompradores);
                        await channel.permissionOverwrites.edit(rolPartnerId, permisosCompradores);
                        actualizados++;
                        continue;
                    }

                    // 3. Canales privados estrictos sueltos
                    if (canalesPrivadosEstrictos.includes(channel.id)) {
                        await bloquearRoles(channel, todosLosRolesNoAdmin);
                        continue;
                    }

                    // 4. Canal de Verificación (Solo lo ve @everyone antes de tener rango; oculto para Usuarios/Verificado/Friends)
                    if (channel.id === canalVerificarId) {
                        await channel.permissionOverwrites.edit(everyoneId, {
                            ViewChannel: true, ReadMessageHistory: true, SendMessages: false, AddReactions: true,
                        });
                        await bloquearRoles(channel, [rolSeleccionado.id, rolVerificadoId, rolFriendsId]);
                        continue;
                    }

                    // 5. DETECCIÓN INTELIGENTE DE TICKETS (Importante: ignorando la categoría de Compradores que ya se procesó arriba)
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
                        await bloquearRoles(channel, [everyoneId, rolSeleccionado.id, rolVerificadoId, rolFriendsId]);
                        await channel.permissionOverwrites.edit(rolVentasId, { ViewChannel: true, ReadMessageHistory: true });
                        continue; 
                    }

                    if (esTicketPrivado && channel.type !== 4 && channel.name.toLowerCase() !== 'ticket') {
                        await bloquearRoles(channel, [everyoneId, rolSeleccionado.id, rolVerificadoId, rolFriendsId]);
                        await channel.permissionOverwrites.edit(rolVentasId, { 
                            ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true
                        });
                        continue;
                    }

                    // 6. Canales de escritura pública (Feedback y categoría Chat principal)
                    if (canalesPermitidosEscritura.includes(channel.id) || channel.parentId === categoriaChatId) {
                        await channel.permissionOverwrites.edit(everyoneId, { ViewChannel: false, CreateInstantInvite: false });
                        
                        const permisosEscritura = {
                            ViewChannel: true, ReadMessageHistory: true, SendMessages: true, AddReactions: true, AttachFiles: true, EmbedLinks: true
                        };
                        await channel.permissionOverwrites.edit(rolSeleccionado.id, permisosEscritura);
                        await channel.permissionOverwrites.edit(rolVerificadoId, permisosEscritura);
                        await channel.permissionOverwrites.edit(rolFriendsId, permisosEscritura);
                        
                        actualizados++;
                        continue;
                    }

                    // 7. RESTO DE CANALES DEL SERVIDOR: Solo lectura (ven el canal pero NO pueden mandar mensajes)
                    const permisosLectura = {
                        ViewChannel: true, ReadMessageHistory: true, SendMessages: false, AddReactions: false
                    };
                    
                    await channel.permissionOverwrites.edit(everyoneId, { ViewChannel: false, CreateInstantInvite: false });
                    await channel.permissionOverwrites.edit(rolSeleccionado.id, permisosLectura);
                    await channel.permissionOverwrites.edit(rolVerificadoId, permisosLectura);
                    await channel.permissionOverwrites.edit(rolFriendsId, permisosLectura);
                    
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
                content: `✅ ¡Permisos actualizados correctamente! Se limpió la categoría Friends y se configuró Compradores.` 
            });

        } catch (error) {
            console.error('Error general del comando:', error);
            await interaction.editReply({ content: '❌ Ocurrió un error general.' });
        }
    },
};