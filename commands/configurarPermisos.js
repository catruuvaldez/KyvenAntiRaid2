const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('configurar-permisos')
        .setDescription('Bloquea masivamente el servidor protegiendo canales y manteniendo visibles los paneles')
        .addRoleOption(option =>
            option.setName('rol_usuarios')
                .setDescription('El rol base a configurar (ej. Usuarios o Verificado)')
                .setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const guild = interaction.guild;
        const rolSeleccionado = interaction.options.getRole('rol_usuarios');
        const everyoneId = guild.id;
        
        // IDs de Roles específicos
        const rolVentasId = '1548106038329212968';
        const rolVerificadoId = '1561162470557483098';
        const rolFriendsId = '1565479493534093523';
        const rolCompradorId = '1547729344229802136';
        const rolPartnerId = '1547728922744197170';
        
        // IDs de Categorías y Canales especiales
        const categoriaTicketsId = '1547708495745523783';
        const categoriaPrivadaEstricta = '1547736192584515756';
        const categoriaFriendsId = '1565479867095589006';
        const categoriaCompradoresId = '1559229498023608380';
        const categoriaBackupId = 'PON_LA_ID_DE_LA_CATEGORIA_BACKUP_AQUI';
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

        try {
            await guild.roles.fetch();
            const channels = await guild.channels.fetch();
            let actualizados = 0;

            // Detecta TODOS los roles actuales y futuros del servidor (excluyendo bots y administradores)
            const rolesMiembros = guild.roles.cache.filter(role => 
                role.id !== everyoneId && 
                !role.managed && 
                !role.permissions.has(PermissionFlagsBits.Administrator)
            );

            for (const [id, channel] of channels) {
                if (!channel) continue;

                try {
                    // 0. CATEGORÍAS SÚPER PRIVADAS Y BACKUP (Ocultas para todos los roles no-admin actuales y futuros)
                    if (
                        channel.id === categoriaPrivadaEstricta || channel.parentId === categoriaPrivadaEstricta || 
                        channel.id === categoriaBackupId || channel.parentId === categoriaBackupId
                    ) {
                        const overwritesPrivados = [
                            { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
                            ...rolesMiembros.map(r => ({ id: r.id, deny: [PermissionFlagsBits.ViewChannel] }))
                        ];
                        await channel.permissionOverwrites.set(overwritesPrivados);
                        continue;
                    }

                    // 1. CATEGORÍA FRIENDS (Exclusiva SOLO para Friends; bloquea a todos los demás roles actuales y futuros)
                    if (channel.id === categoriaFriendsId || channel.parentId === categoriaFriendsId) {
                        const overwritesFriends = [
                            { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
                            ...rolesMiembros
                                .filter(r => r.id !== rolFriendsId)
                                .map(r => ({ id: r.id, deny: [PermissionFlagsBits.ViewChannel] })),
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

                    // 2. CATEGORÍA COMPRADORES (Exclusiva para Comprador y Partner; bloquea al resto)
                    if (channel.id === categoriaCompradoresId || channel.parentId === categoriaCompradoresId) {
                        const overwritesCompradores = [
                            { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
                            ...rolesMiembros
                                .filter(r => r.id !== rolCompradorId && r.id !== rolPartnerId)
                                .map(r => ({ id: r.id, deny: [PermissionFlagsBits.ViewChannel] })),
                            {
                                id: rolCompradorId,
                                allow: [
                                    PermissionFlagsBits.ViewChannel,
                                    PermissionFlagsBits.ReadMessageHistory,
                                    PermissionFlagsBits.AddReactions
                                ],
                                deny: [PermissionFlagsBits.SendMessages]
                            },
                            {
                                id: rolPartnerId,
                                allow: [
                                    PermissionFlagsBits.ViewChannel,
                                    PermissionFlagsBits.ReadMessageHistory,
                                    PermissionFlagsBits.AddReactions
                                ],
                                deny: [PermissionFlagsBits.SendMessages]
                            }
                        ].filter(o => guild.roles.cache.has(o.id));

                        await channel.permissionOverwrites.set(overwritesCompradores);
                        actualizados++;
                        continue;
                    }

                    // 3. Canales privados estrictos sueltos
                    if (canalesPrivadosEstrictos.includes(channel.id)) {
                        const overwritesEstrictos = [
                            { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
                            ...rolesMiembros.map(r => ({ id: r.id, deny: [PermissionFlagsBits.ViewChannel] }))
                        ];
                        await channel.permissionOverwrites.set(overwritesEstrictos);
                        continue;
                    }

                    // 4. Canal de Verificación (Solo lo ve @everyone antes de tener cualquier rol)
                    if (channel.id === canalVerificarId) {
                        await channel.permissionOverwrites.edit(everyoneId, {
                            ViewChannel: true, ReadMessageHistory: true, SendMessages: false, AddReactions: true,
                        });
                        await channel.permissionOverwrites.edit(rolSeleccionado.id, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(rolVerificadoId, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(rolFriendsId, { ViewChannel: false });
                        continue;
                    }

                    // 5. SISTEMA DE TICKETS (Categoría, Panel y Tickets Abiertos)
                    let esTicketPrivado = false;
                    let esCategoriaTicket = false;

                    if (channel.type === 4) { 
                        const nombreCat = channel.name.toLowerCase();
                        if (
                            channel.id === categoriaTicketsId ||
                            nombreCat.includes('ticket') || nombreCat.includes('soporte') || nombreCat.includes('compra') || nombreCat.includes('partner')
                        ) {
                            esCategoriaTicket = true;
                        }
                    } else {
                        if (channel.parent) {
                            const nombreCategoria = channel.parent.name.toLowerCase();
                            if (
                                channel.parentId === categoriaTicketsId ||
                                nombreCategoria.includes('ticket') || nombreCategoria.includes('soporte') || nombreCategoria.includes('compra') || nombreCategoria.includes('partner')
                            ) {
                                esTicketPrivado = true;
                            }
                        }
                        const nombreCanal = channel.name.toLowerCase();
                        if (nombreCanal.includes('ticket') || nombreCanal.includes('compra-') || nombreCanal.includes('soporte') || nombreCanal.includes('partner')) {
                            esTicketPrivado = true;
                        }
                    }

                    // 5A. CATEGORÍA DE TICKETS: Visible para TODOS los roles (actuales y futuros) para que puedan abrir tickets
                    if (esCategoriaTicket) {
                        const overwritesCatTickets = [
                            { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
                            ...rolesMiembros.map(r => ({
                                id: r.id,
                                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                                deny: [PermissionFlagsBits.SendMessages]
                            }))
                        ];
                        await channel.permissionOverwrites.set(overwritesCatTickets);
                        continue; 
                    }

                    // Detectamos si es el canal del panel donde se crean los tickets vs un ticket abierto de un usuario
                    const nombreLimpio = channel.name.toLowerCase();
                    const tieneNumeros = /\d/.test(nombreLimpio); // Los tickets abiertos suelen tener números o guiones (ej. ticket-123, compra-juan)
                    const esCanalPanelTicket = (
                        nombreLimpio === 'ticket' || 
                        nombreLimpio === 'tickets' || 
                        nombreLimpio.includes('abrir') || 
                        nombreLimpio.includes('crear') || 
                        nombreLimpio.includes('panel') ||
                        (channel.parentId === categoriaTicketsId && !tieneNumeros && !nombreLimpio.includes('compra-') && !nombreLimpio.includes('soporte-') && !nombreLimpio.includes('partner-'))
                    );

                    // 5B. CANAL DEL PANEL DE TICKETS: Todos los roles actuales y futuros pueden verlo para apretar el botón/menú
                    if (esTicketPrivado && channel.type !== 4 && esCanalPanelTicket) {
                        const overwritesPanelTicket = [
                            { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.CreateInstantInvite] },
                            ...rolesMiembros.map(r => ({
                                id: r.id,
                                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                                deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions]
                            }))
                        ];
                        await channel.permissionOverwrites.set(overwritesPanelTicket);
                        actualizados++;
                        continue;
                    }

                    // 5C. TICKETS ABIERTOS DE PERSONAS: Bloquea a TODOS los roles (actuales y futuros) excepto al creador del ticket y Encargado de Ventas
                    if (esTicketPrivado && channel.type !== 4 && !esCanalPanelTicket) {
                        // Conservamos los permisos individuales de los usuarios (type === 1 es Member) que abrieron el ticket
                        const permisosUsuariosCreadores = channel.permissionOverwrites.cache
                            .filter(ow => ow.type === 1)
                            .map(ow => ({
                                id: ow.id,
                                allow: ow.allow.bitfield,
                                deny: ow.deny.bitfield,
                                type: 1
                            }));

                        const overwritesTicketAbierto = [
                            // Bloquea a @everyone y a cualquier rol del servidor (presente o futuro)
                            { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                            ...rolesMiembros
                                .filter(r => r.id !== rolVentasId)
                                .map(r => ({
                                    id: r.id,
                                    deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
                                })),
                            // Permite al Encargado de Ventas ver y responder todos los tickets
                            ...(guild.roles.cache.has(rolVentasId) ? [{
                                id: rolVentasId,
                                allow: [
                                    PermissionFlagsBits.ViewChannel,
                                    PermissionFlagsBits.SendMessages,
                                    PermissionFlagsBits.ReadMessageHistory,
                                    PermissionFlagsBits.AttachFiles
                                ]
                            }] : []),
                            // Mantiene intacto al dueño que abrió el ticket
                            ...permisosUsuariosCreadores
                        ];

                        await channel.permissionOverwrites.set(overwritesTicketAbierto);
                        continue;
                    }

                    // 6. Canales de escritura pública (Feedback y categoría Chat principal) para TODOS los roles actuales y futuros
                    if (canalesPermitidosEscritura.includes(channel.id) || channel.parentId === categoriaChatId) {
                        await channel.permissionOverwrites.edit(everyoneId, { ViewChannel: false, CreateInstantInvite: false });
                        
                        const permisosEscritura = {
                            ViewChannel: true, ReadMessageHistory: true, SendMessages: true, AddReactions: true, AttachFiles: true, EmbedLinks: true
                        };
                        for (const [roleId] of rolesMiembros) {
                            await channel.permissionOverwrites.edit(roleId, permisosEscritura);
                        }
                        
                        actualizados++;
                        continue;
                    }

                    // 7. RESTO DE CANALES DEL SERVIDOR: Solo lectura para TODOS los roles actuales y futuros
                    const permisosLectura = {
                        ViewChannel: true, ReadMessageHistory: true, SendMessages: false, AddReactions: false
                    };
                    
                    await channel.permissionOverwrites.edit(everyoneId, { ViewChannel: false, CreateInstantInvite: false });
                    for (const [roleId] of rolesMiembros) {
                        await channel.permissionOverwrites.edit(roleId, permisosLectura);
                    }
                    
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
                content: `✅ ¡Permisos actualizados para todos los roles actuales y futuros! Tickets protegidos y categorías exclusivas listas.` 
            });

        } catch (error) {
            console.error('Error general del comando:', error);
            await interaction.editReply({ content: '❌ Ocurrió un error general.' });
        }
    },
};