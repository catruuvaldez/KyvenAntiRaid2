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
        const rolAisladoId = '1565566688710107136';
        
        // IDs de Categorías y Canales especiales
        const categoriaTicketsId = '1547708495745523783';
        const categoriaPrivadaEstricta = '1547736192584515756';
        const categoriaFriendsId = '1565479867095589006';
        const categoriaCompradoresId = '1559229498023608380';
        const categoriaAisladosId = '1565566484955005148';
        const canalAisladosId = '1565566576504217744';
        const categoriaBackupId = 'PON_LA_ID_DE_LA_CATEGORIA_BACKUP_AQUI';
        const canalVerificarId = '1547772473020387388';
        const canalNoHablarId = '1565541854282256464';
        const categoriaChatId = '1547412298832814244';

        const canalesPrivadosEstrictos = [
            '1547736261521842186', // notificaciones
            '1547748846468333699', // tickets-closed
            '1548577541944647680'  // notis allys
        ];

        const canalesPermitidosEscritura = [
            '1547709304407203870', // Feedback
            canalNoHablarId        // NO HABLAR (habilitado para atrapar cuentas hackeadas)
        ];

        try {
            await guild.roles.fetch();
            const channels = await guild.channels.fetch();
            let actualizados = 0;

            // Detecta TODOS los roles normales (excluyendo el rol Aislado para que no vea ningún otro canal)
            const rolesMiembros = guild.roles.cache.filter(role => 
                role.id !== everyoneId && 
                role.id !== rolAisladoId &&
                !role.managed && 
                !role.permissions.has(PermissionFlagsBits.Administrator)
            );

            const ReglaBloquearAislado = guild.roles.cache.has(rolAisladoId) 
                ? [{ id: rolAisladoId, deny: [PermissionFlagsBits.ViewChannel] }] 
                : [];

            for (const [id, channel] of channels) {
                if (!channel) continue;

                try {
                    // 0. CATEGORÍA Y CANAL DE AISLADOS (Exclusivo para personas con el rol Aislados)
                    if (
                        channel.id === categoriaAisladosId || 
                        channel.parentId === categoriaAisladosId || 
                        channel.id === canalAisladosId
                    ) {
                        const overwritesAislados = [
                            { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
                            ...rolesMiembros.map(r => ({ id: r.id, deny: [PermissionFlagsBits.ViewChannel] })),
                            ...(guild.roles.cache.has(rolAisladoId) ? [{
                                id: rolAisladoId,
                                allow: [
                                    PermissionFlagsBits.ViewChannel,
                                    PermissionFlagsBits.ReadMessageHistory,
                                    PermissionFlagsBits.SendMessages
                                ]
                            }] : [])
                        ];
                        await channel.permissionOverwrites.set(overwritesAislados);
                        actualizados++;
                        continue;
                    }

                    // 1. CATEGORÍAS SÚPER PRIVADAS Y BACKUP
                    if (
                        channel.id === categoriaPrivadaEstricta || channel.parentId === categoriaPrivadaEstricta || 
                        channel.id === categoriaBackupId || channel.parentId === categoriaBackupId
                    ) {
                        const overwritesPrivados = [
                            { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
                            ...ReglaBloquearAislado,
                            ...rolesMiembros.map(r => ({ id: r.id, deny: [PermissionFlagsBits.ViewChannel] }))
                        ];
                        await channel.permissionOverwrites.set(overwritesPrivados);
                        continue;
                    }

                    // 2. CATEGORÍA FRIENDS
                    if (channel.id === categoriaFriendsId || channel.parentId === categoriaFriendsId) {
                        const overwritesFriends = [
                            { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
                            ...ReglaBloquearAislado,
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

                    // 3. CATEGORÍA COMPRADORES
                    if (channel.id === categoriaCompradoresId || channel.parentId === categoriaCompradoresId) {
                        const overwritesCompradores = [
                            { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
                            ...ReglaBloquearAislado,
                            ...rolesMiembros
                                .filter(r => r.id !== rolCompradorId && r.id !== rolPartnerId)
                                .map(r => ({ id: r.id, deny: [PermissionFlagsBits.ViewChannel] })),
                            {
                                id: rolCompradorId,
                                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AddReactions],
                                deny: [PermissionFlagsBits.SendMessages]
                            },
                            {
                                id: rolPartnerId,
                                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AddReactions],
                                deny: [PermissionFlagsBits.SendMessages]
                            }
                        ].filter(o => guild.roles.cache.has(o.id));

                        await channel.permissionOverwrites.set(overwritesCompradores);
                        actualizados++;
                        continue;
                    }

                    // 4. Canales privados estrictos sueltos
                    if (canalesPrivadosEstrictos.includes(channel.id)) {
                        const overwritesEstrictos = [
                            { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
                            ...ReglaBloquearAislado,
                            ...rolesMiembros.map(r => ({ id: r.id, deny: [PermissionFlagsBits.ViewChannel] }))
                        ];
                        await channel.permissionOverwrites.set(overwritesEstrictos);
                        continue;
                    }

                    // 5. Canal de Verificación
                    if (channel.id === canalVerificarId) {
                        await channel.permissionOverwrites.edit(everyoneId, {
                            ViewChannel: true, ReadMessageHistory: true, SendMessages: false, AddReactions: true,
                        });
                        if (guild.roles.cache.has(rolAisladoId)) {
                            await channel.permissionOverwrites.edit(rolAisladoId, { ViewChannel: false });
                        }
                        await channel.permissionOverwrites.edit(rolSeleccionado.id, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(rolVerificadoId, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(rolFriendsId, { ViewChannel: false });
                        continue;
                    }

                    // 6. SISTEMA DE TICKETS
                    let esTicketPrivado = false;
                    let esCategoriaTicket = false;

                    if (channel.type === 4) { 
                        const nombreCat = channel.name.toLowerCase();
                        if (channel.id === categoriaTicketsId || nombreCat.includes('ticket') || nombreCat.includes('soporte') || nombreCat.includes('compra') || nombreCat.includes('partner')) {
                            esCategoriaTicket = true;
                        }
                    } else {
                        if (channel.parent) {
                            const nombreCategoria = channel.parent.name.toLowerCase();
                            if (channel.parentId === categoriaTicketsId || nombreCategoria.includes('ticket') || nombreCategoria.includes('soporte') || nombreCategoria.includes('compra') || nombreCategoria.includes('partner')) {
                                esTicketPrivado = true;
                            }
                        }
                        const nombreCanal = channel.name.toLowerCase();
                        if (nombreCanal.includes('ticket') || nombreCanal.includes('compra-') || nombreCanal.includes('soporte') || nombreCanal.includes('partner')) {
                            esTicketPrivado = true;
                        }
                    }

                    if (esCategoriaTicket) {
                        const overwritesCatTickets = [
                            { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
                            ...ReglaBloquearAislado,
                            ...rolesMiembros.map(r => ({
                                id: r.id,
                                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                                deny: [PermissionFlagsBits.SendMessages]
                            }))
                        ];
                        await channel.permissionOverwrites.set(overwritesCatTickets);
                        continue; 
                    }

                    const nombreLimpio = channel.name.toLowerCase();
                    const tieneNumeros = /\d/.test(nombreLimpio);
                    const esCanalPanelTicket = (
                        nombreLimpio === 'ticket' || nombreLimpio === 'tickets' || nombreLimpio.includes('abrir') || 
                        nombreLimpio.includes('crear') || nombreLimpio.includes('panel') ||
                        (channel.parentId === categoriaTicketsId && !tieneNumeros && !nombreLimpio.includes('compra-') && !nombreLimpio.includes('soporte-') && !nombreLimpio.includes('partner-'))
                    );

                    if (esTicketPrivado && channel.type !== 4 && esCanalPanelTicket) {
                        const overwritesPanelTicket = [
                            { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.CreateInstantInvite] },
                            ...ReglaBloquearAislado,
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

                    if (esTicketPrivado && channel.type !== 4 && !esCanalPanelTicket) {
                        const permisosUsuariosCreadores = channel.permissionOverwrites.cache
                            .filter(ow => ow.type === 1)
                            .map(ow => ({ id: ow.id, allow: ow.allow.bitfield, deny: ow.deny.bitfield, type: 1 }));

                        const overwritesTicketAbierto = [
                            { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
                            ...ReglaBloquearAislado,
                            ...rolesMiembros.filter(r => r.id !== rolVentasId).map(r => ({
                                id: r.id,
                                deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
                            })),
                            ...(guild.roles.cache.has(rolVentasId) ? [{
                                id: rolVentasId,
                                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles]
                            }] : []),
                            ...permisosUsuariosCreadores
                        ];

                        await channel.permissionOverwrites.set(overwritesTicketAbierto);
                        continue;
                    }

                    // 7. Canales de escritura (Feedback, Chat y el canal trampa NO HABLAR)
                    if (canalesPermitidosEscritura.includes(channel.id) || channel.parentId === categoriaChatId) {
                        await channel.permissionOverwrites.edit(everyoneId, { ViewChannel: false, CreateInstantInvite: false });
                        if (guild.roles.cache.has(rolAisladoId)) {
                            await channel.permissionOverwrites.edit(rolAisladoId, { ViewChannel: false });
                        }
                        
                        const permisosEscritura = {
                            ViewChannel: true, ReadMessageHistory: true, SendMessages: true, AddReactions: true, AttachFiles: true, EmbedLinks: true
                        };
                        for (const [roleId] of rolesMiembros) {
                            await channel.permissionOverwrites.edit(roleId, permisosEscritura);
                        }
                        
                        actualizados++;
                        continue;
                    }

                    // 8. RESTO DE CANALES: Solo lectura
                    const permisosLectura = {
                        ViewChannel: true, ReadMessageHistory: true, SendMessages: false, AddReactions: false
                    };
                    
                    await channel.permissionOverwrites.edit(everyoneId, { ViewChannel: false, CreateInstantInvite: false });
                    if (guild.roles.cache.has(rolAisladoId)) {
                        await channel.permissionOverwrites.edit(rolAisladoId, { ViewChannel: false });
                    }
                    for (const [roleId] of rolesMiembros) {
                        await channel.permissionOverwrites.edit(roleId, permisosLectura);
                    }
                    
                    actualizados++;

                } catch (innerError) {
                    if (innerError.code !== 10003) {
                        console.error(`❌ Error editando canal ${channel.id}:`, innerError);
                    }
                }
            }

            await interaction.editReply({ 
                content: `✅ ¡Permisos actualizados! Zona de Aislados, canal trampa NO HABLAR y categorías listas.` 
            });

        } catch (error) {
            console.error('Error general del comando:', error);
            await interaction.editReply({ content: '❌ Ocurrió un error general.' });
        }
    },
};