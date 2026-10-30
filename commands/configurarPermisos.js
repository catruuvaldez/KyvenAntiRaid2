const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

// Variable para evitar que el comando se ejecute 2 veces al mismo tiempo y sature a Discord
let configurandoActualmente = false;

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

        if (configurandoActualmente) {
            return interaction.editReply({ 
                content: '⚠️ Ya hay una configuración de permisos en curso. Espera a que termine antes de volver a usar el comando.' 
            });
        }

        configurandoActualmente = true;

        const guild = interaction.guild;
        const everyoneId = guild.id;
        
        // IDs de Roles específicos
        const rolVentasId = '1548106038329212968';
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
            canalNoHablarId        // NO HABLAR
        ];

        // Función que aplica todos los permisos de un canal en 1 SOLA petición (y conserva permisos de Bots/Admins)
        const aplicarOverwritesRapido = async (channel, nuevosOverwrites, conservarMiembros = false) => {
            const idsNuevos = new Set(nuevosOverwrites.map(o => o.id));

            // Conservamos los overwrites que ya tenían los Bots, Admins o miembros individuales (si corresponde)
            const conservados = channel.permissionOverwrites.cache
                .filter(ow => {
                    if (idsNuevos.has(ow.id)) return false;
                    if (ow.type === 1) return conservarMiembros; // 1 = Usuario individual
                    const rol = guild.roles.cache.get(ow.id);
                    return rol && (rol.managed || rol.permissions.has(PermissionFlagsBits.Administrator));
                })
                .map(ow => ({
                    id: ow.id,
                    allow: ow.allow.bitfield,
                    deny: ow.deny.bitfield,
                    type: ow.type
                }));

            const listaFinal = [
                ...nuevosOverwrites.filter(o => guild.roles.cache.has(o.id) || o.type === 1),
                ...conservados
            ];

            // Verificamos si el canal YA tiene exactamente estos permisos para ahorrar llamadas a Discord
            const cacheActual = channel.permissionOverwrites.cache;
            let requiereCambio = cacheActual.size !== listaFinal.length;

            if (!requiereCambio) {
                for (const item of listaFinal) {
                    const actual = cacheActual.get(item.id);
                    if (!actual) {
                        requiereCambio = true;
                        break;
                    }
                    const allowEsperado = Array.isArray(item.allow)
                        ? item.allow.reduce((acc, bit) => acc | BigInt(bit), 0n)
                        : BigInt(item.allow ?? 0n);
                    const denyEsperado = Array.isArray(item.deny)
                        ? item.deny.reduce((acc, bit) => acc | BigInt(bit), 0n)
                        : BigInt(item.deny ?? 0n);

                    if (actual.allow.bitfield !== allowEsperado || actual.deny.bitfield !== denyEsperado) {
                        requiereCambio = true;
                        break;
                    }
                }
            }

            if (requiereCambio) {
                await channel.permissionOverwrites.set(listaFinal);
                return true; // Hizo petición a Discord
            }
            return false; // Ya estaba configurado igual, se ahorró la petición
        };

        try {
            await guild.roles.fetch();
            const channels = await guild.channels.fetch();
            let modificados = 0;
            let revisados = 0;
            const totalCanales = channels.size;

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
                revisados++;

                // Actualiza el mensaje cada 8 canales para que sepas que avanza y nunca muera la interacción
                if (revisados % 8 === 0) {
                    await interaction.editReply({
                        content: `⏳ Configurando permisos... (${revisados}/${totalCanales} canales revisados, ${modificados} actualizados)`
                    }).catch(() => {});
                }

                try {
                    // 0. CATEGORÍA Y CANAL DE AISLADOS
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
                        if (await aplicarOverwritesRapido(channel, overwritesAislados)) modificados++;
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
                        if (await aplicarOverwritesRapido(channel, overwritesPrivados)) modificados++;
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
                        ];
                        if (await aplicarOverwritesRapido(channel, overwritesFriends)) modificados++;
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
                        ];
                        if (await aplicarOverwritesRapido(channel, overwritesCompradores)) modificados++;
                        continue;
                    }

                    // 4. Canales privados estrictos sueltos
                    if (canalesPrivadosEstrictos.includes(channel.id)) {
                        const overwritesEstrictos = [
                            { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
                            ...ReglaBloquearAislado,
                            ...rolesMiembros.map(r => ({ id: r.id, deny: [PermissionFlagsBits.ViewChannel] }))
                        ];
                        if (await aplicarOverwritesRapido(channel, overwritesEstrictos)) modificados++;
                        continue;
                    }

                    // 5. Canal de Verificación
                    if (channel.id === canalVerificarId) {
                        const overwritesVerificar = [
                            {
                                id: everyoneId,
                                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AddReactions],
                                deny: [PermissionFlagsBits.SendMessages]
                            },
                            ...ReglaBloquearAislado,
                            ...rolesMiembros.map(r => ({ id: r.id, deny: [PermissionFlagsBits.ViewChannel] }))
                        ];
                        if (await aplicarOverwritesRapido(channel, overwritesVerificar)) modificados++;
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
                        if (await aplicarOverwritesRapido(channel, overwritesCatTickets)) modificados++;
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
                        if (await aplicarOverwritesRapido(channel, overwritesPanelTicket)) modificados++;
                        continue;
                    }

                    if (esTicketPrivado && channel.type !== 4 && !esCanalPanelTicket) {
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
                            }] : [])
                        ];
                        // true = conserva al usuario individual que abrió el ticket
                        if (await aplicarOverwritesRapido(channel, overwritesTicketAbierto, true)) modificados++;
                        continue;
                    }

                    // 7. Canales de escritura (Feedback, Chat y NO HABLAR) - 1 sola llamada por canal en lugar de bucle
                    if (canalesPermitidosEscritura.includes(channel.id) || channel.parentId === categoriaChatId) {
                        const overwritesEscritura = [
                            { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.CreateInstantInvite] },
                            ...ReglaBloquearAislado,
                            ...rolesMiembros.map(r => ({
                                id: r.id,
                                allow: [
                                    PermissionFlagsBits.ViewChannel,
                                    PermissionFlagsBits.ReadMessageHistory,
                                    PermissionFlagsBits.SendMessages,
                                    PermissionFlagsBits.AddReactions,
                                    PermissionFlagsBits.AttachFiles,
                                    PermissionFlagsBits.EmbedLinks
                                ]
                            }))
                        ];
                        if (await aplicarOverwritesRapido(channel, overwritesEscritura)) modificados++;
                        continue;
                    }

                    // 8. RESTO DE CANALES: Solo lectura - 1 sola llamada por canal en lugar de bucle
                    const overwritesLectura = [
                        { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.CreateInstantInvite] },
                        ...ReglaBloquearAislado,
                        ...rolesMiembros.map(r => ({
                            id: r.id,
                            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
                            deny: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions]
                        }))
                    ];
                    if (await aplicarOverwritesRapido(channel, overwritesLectura)) modificados++;

                } catch (innerError) {
                    if (innerError.code !== 10003) {
                        console.error(`❌ Error editando canal ${channel.id}:`, innerError);
                    }
                }
            }

            await interaction.editReply({ 
                content: `✅ ¡Permisos configurados con éxito! (${modificados} canales actualizados de ${totalCanales} revisados).` 
            });

        } catch (error) {
            console.error('Error general del comando:', error);
            await interaction.editReply({ content: '❌ Ocurrió un error general.' }).catch(() => {});
        } finally {
            configurandoActualmente = false;
        }
    },
};