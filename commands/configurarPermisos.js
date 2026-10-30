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
        
        // IDs configuradas
        const rolVentasId = '1548106038329212968';
        const rolVerificadoId = '1561162470557483098';
        const rolFriendsId = '1565479493534093523';
        
        // IDs de categorías y canales especiales
        const categoriaPrivadaEstricta = '1547736192584515756';
        const categoriaFriendsId = '1565479867095589006';
        const categoriaBackupId = 'PON_LA_ID_DE_LA_CATEGORIA_BACKUP_AQUI'; // Reemplazar con la ID real
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
            const channels = await guild.channels.fetch();
            let actualizados = 0;

            for (const [id, channel] of channels) {
                if (!channel) continue;

                try {
                    // 0. CATEGORÍAS SÚPER PRIVADAS Y BACKUP (Nadie las ve excepto Admin)
                    if (channel.id === categoriaPrivadaEstricta || channel.parentId === categoriaPrivadaEstricta || 
                        channel.id === categoriaBackupId || channel.parentId === categoriaBackupId) {
                        await channel.permissionOverwrites.edit(everyoneId, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(rolUsuarios.id, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(rolVerificadoId, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(rolFriendsId, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(rolVentasId, { ViewChannel: false });
                        continue;
                    }

                    // 1. CATEGORÍA FRIENDS (Exclusiva, bloqueada para usuarios normales y verificados)
                    if (channel.id === categoriaFriendsId || channel.parentId === categoriaFriendsId) {
                        await channel.permissionOverwrites.edit(everyoneId, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(rolUsuarios.id, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(rolVerificadoId, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(rolFriendsId, { 
                            ViewChannel: true, ReadMessageHistory: true, SendMessages: true, AddReactions: true, AttachFiles: true, EmbedLinks: true 
                        });
                        continue;
                    }

                    // 2. Canales privados estrictos sueltos
                    if (canalesPrivadosEstrictos.includes(channel.id)) {
                        await channel.permissionOverwrites.edit(everyoneId, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(rolUsuarios.id, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(rolVerificadoId, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(rolFriendsId, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(rolVentasId, { ViewChannel: false });
                        continue;
                    }

                    // 3. Canal de Verificación (Oculto para los que ya son Usuarios o Verificados)
                    if (channel.id === canalVerificarId) {
                        await channel.permissionOverwrites.edit(everyoneId, {
                            ViewChannel: true, ReadMessageHistory: true, SendMessages: false, AddReactions: true,
                        });
                        await channel.permissionOverwrites.edit(rolUsuarios.id, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(rolVerificadoId, { ViewChannel: false });
                        continue;
                    }

                    // 4. DETECCIÓN INTELIGENTE DE TICKETS (Ocultos para Usuarios/Verificados)
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
                        await channel.permissionOverwrites.edit(everyoneId, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(rolUsuarios.id, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(rolVerificadoId, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(rolVentasId, { ViewChannel: true, ReadMessageHistory: true });
                        continue; 
                    }

                    if (esTicketPrivado && channel.type !== 4 && channel.name.toLowerCase() !== 'ticket') {
                        await channel.permissionOverwrites.edit(everyoneId, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(rolUsuarios.id, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(rolVerificadoId, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(rolFriendsId, { ViewChannel: false });
                        await channel.permissionOverwrites.edit(rolVentasId, { 
                            ViewChannel: true, SendMessages: true, ReadMessageHistory: true, AttachFiles: true
                        });
                        continue;
                    }

                    // 5. Canales de escritura pública (Feedback, Chat, etc.)
                    if (canalesPermitidosEscritura.includes(channel.id) || channel.parentId === categoriaChatId) {
                        await channel.permissionOverwrites.edit(everyoneId, { ViewChannel: false, CreateInstantInvite: false });
                        
                        const permisosEscritura = { ViewChannel: true, ReadMessageHistory: true, SendMessages: true, AddReactions: true, AttachFiles: true, EmbedLinks: true };
                        await channel.permissionOverwrites.edit(rolUsuarios.id, permisosEscritura);
                        await channel.permissionOverwrites.edit(rolVerificadoId, permisosEscritura);
                        
                        // Si el rol Friends también debe escribir acá, lo dejamos:
                        await channel.permissionOverwrites.edit(rolFriendsId, permisosEscritura);
                        
                        actualizados++;
                        continue;
                    }

                    // 6. RESTO DE CANALES: Solo lectura
                    const permisosLectura = { ViewChannel: true, ReadMessageHistory: true, SendMessages: false, AddReactions: false };
                    
                    await channel.permissionOverwrites.edit(everyoneId, { ViewChannel: false, CreateInstantInvite: false });
                    await channel.permissionOverwrites.edit(rolUsuarios.id, permisosLectura);
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
                content: `✅ ¡Permisos actualizados! Canales procesados exitosamente.` 
            });

        } catch (error) {
            console.error('Error general del comando:', error);
            await interaction.editReply({ content: '❌ Ocurrió un error general.' });
        }
    },
};