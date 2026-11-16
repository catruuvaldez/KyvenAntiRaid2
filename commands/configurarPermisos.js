const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const recovery = require('../dashboard/server/permission-center/recovery');

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
        .addStringOption(option => option.setName('servidor_origen')
            .setDescription('ID del servidor que contiene el perfil guardado en Permission Center')
            .setRequired(false))
        .addBooleanOption(option => option.setName('confirmar_traslado')
            .setDescription('Confirmar explícitamente la aplicación a otro servidor')
            .setRequired(false))
        .addBooleanOption(option => option.setName('aplicar_permisos_roles')
            .setDescription('También restaurar permisos globales de roles (opcional, protegido por jerarquía)')
            .setRequired(false))
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
            // Sync the web editor's latest *static* channel permission profile.
            // In another server, never apply hard-coded IDs from the old guild.
            const sourceGuildId = interaction.options.getString('servidor_origen')?.trim() || guild.id;
            if (!/^\d{17,20}$/.test(sourceGuildId)) {
                await interaction.editReply('❌ ID de servidor de origen inválido.');
                return;
            }
            if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
                await interaction.editReply('❌ Solo un administrador del servidor puede ejecutar este comando.');
                return;
            }
            const me = guild.members.me || await guild.members.fetchMe();
            if (!me.permissions.has(PermissionFlagsBits.ManageRoles) || !me.permissions.has(PermissionFlagsBits.ManageChannels)) {
                await interaction.editReply('❌ El bot necesita ManageRoles y ManageChannels para configurar permisos de canal.');
                return;
            }
            const saved = recovery.findProfile(sourceGuildId);
            if (saved) {
                const transfer = sourceGuildId !== guild.id;
                const preview = transfer && interaction.options.getBoolean('confirmar_traslado') !== true;
                const outcome = await recovery.applyProfileRestore(guild, saved, {
                    preview,
                    progress: async (done, total, applied) => {
                        if (done % 8 === 0) await interaction.editReply(`⏳ Restaurando permisos... ${done}/${total} (${applied} actualizados).`).catch(() => {});
                    }
                });
                const syncRoles = interaction.options.getBoolean('aplicar_permisos_roles') === true;
                const rolesResult = syncRoles
                    ? await recovery.applyRoleRestore(guild, saved, { preview }) : null;
                let text = preview
                    ? `🔎 **Vista previa del traslado desde ${saved.guildName} (${sourceGuildId})**\n` +
                      `Canales localizados: ${outcome.planned}; con cambios: ${outcome.changed}.\n` +
                      `Para aplicarlos repite el comando con **servidor_origen** y **confirmar_traslado: true**.`
                    : `✅ Perfil de permisos aplicado desde **${saved.guildName}**.\n` +
                      `Revisados: ${outcome.planned}; necesitaban cambios: ${outcome.changed}; actualizados: ${outcome.applied}.`;
                if (outcome.skipped.length) text += `\n⚠️ Omitidos (${outcome.skipped.length}): ` + outcome.skipped.slice(0, 5).join(' · ');
                if (outcome.warnings.length) text += `\nAvisos: ` + outcome.warnings.slice(0, 3).join(' · ');
                if (outcome.errors?.length) text += `\n❌ Errores (${outcome.errors.length}): ` + outcome.errors.slice(0, 4).join(' · ');
                if (rolesResult) {
                    text += `\n🔑 Permisos globales de roles: ${rolesResult.planned} revisados, ${rolesResult.applied} actualizados`;
                    if (rolesResult.preview) text += ' (solo vista previa)';
                    if (rolesResult.skipped.length) text += `, ${rolesResult.skipped.length} omitidos`;
                    if (rolesResult.errors.length) text += `; ${rolesResult.errors.length} errores`;
                    text += '.';
                }
                if (!preview) text += '\n🔒 Los canales de tickets/carritos no se han modificado directamente.';
                await interaction.editReply({ content: text.slice(0, 1950) });
                return;
            }
            if (sourceGuildId !== guild.id) {
                await interaction.editReply('❌ No se encontró el perfil del servidor origen. Guarda primero permisos desde Permission Center o genera un perfil en ese servidor.');
                return;
            }
            // The legacy defaults depend on IDs that belong to the original server.
            // Never run these defaults on a newly restored server with different IDs.
            if (!guild.roles.cache.has(rolCompradorId) || !guild.channels.cache.has(categoriaCompradoresId)) {
                await interaction.editReply('⚠️ No se encontró un perfil para este servidor y las IDs de la configuración original no coinciden. No hice cambios. Usa servidor_origen con la ID del servidor donde guardaste el perfil desde la web.');
                return;
            }
            let protegidos = 0;
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
                // Ticket/cart bots own these channels. Do not touch their @everyone,
                // staff-role or member overwrites, even when running legacy defaults.
                if (recovery.isProtectedChannel(channel, guild) ||
                    channel.permissionOverwrites?.cache?.some(ow => Number(ow.type) === 1)) {
                    // Never reset channel-level member exceptions created by ticket,
                    // cart or other bots even if their channel names are customized.
                    protegidos++;
                    continue;
                }

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

                    // 6. TICKETS / CARRITO: se excluyen ANTES de las reglas generales.
                    // El otro bot administra los usuarios y roles en esas sesiones.

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

            // Seed the recovery profile with the original rules on first use.
            // Every subsequent confirmed web save refreshes this profile.
            let backupStatus = '';
            try {
                await guild.channels.fetch();
                const profile = recovery.captureProfile(guild);
                backupStatus = `\n💾 Perfil de recuperación guardado (${profile.saved} canales).`;
            } catch (e) {
                backupStatus = `\n⚠️ No se pudo guardar el perfil para futuras restauraciones: ${e.message}`;
                console.error('[configurar-permisos] No se pudo sincronizar perfil:', e);
            }
            await interaction.editReply({
                content: (`✅ ¡Permisos configurados! ${modificados} canales actualizados de ${totalCanales} revisados. ` +
                    `🔒 ${protegidos} canales/categorías de tickets y compras automáticas protegidos.` + backupStatus).slice(0, 1950)
            });

        } catch (error) {
            console.error('Error general del comando:', error);
            await interaction.editReply({ content: '❌ Ocurrió un error general.' }).catch(() => {});
        } finally {
            configurandoActualmente = false;
        }
    },
};