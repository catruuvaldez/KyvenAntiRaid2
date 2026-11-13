'use strict';

const fs = require('fs');
const path = require('path');
const { Routes, REST, SlashCommandBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

function registerDiscordEvents({ client, rootDir, registrarActividadSistema, OAuthToken, RestoreOperation, dbAdapter, CODIGO_SECRETO, OWNER_ID, getRestoreState, transferirMiembrosSeguro }) {
const slashCommands = [];
const commandsPath = path.join(rootDir, 'commands');

if (fs.existsSync(commandsPath)) {
    const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

    for (const file of commandFiles) {
        const filePath = path.join(commandsPath, file);
        const command = require(filePath);
        if ('data' in command && 'execute' in command) {
            const jsonCmd = command.data.toJSON();
            if (!jsonCmd.options) jsonCmd.options = [];
            const tieneCodigo = jsonCmd.options.some(o => o.name === 'codigo');
            if (!tieneCodigo && jsonCmd.options.every(o => o.type !== 1 && o.type !== 2)) {
                jsonCmd.options.push({
                    name: 'codigo',
                    description: 'CÃ³digo de seguridad personal (o dÃ©jalo vacÃ­o para abrir ventana de PIN)',
                    type: 3,
                    required: false
                });
            }
            client.commands.set(jsonCmd.name, command);
            slashCommands.push(jsonCmd);
        }
        if (typeof command.initDetector === 'function') {
            command.initDetector(client);
        }
    }
}

const pullCmd = new SlashCommandBuilder()
    .setName('restore_pull')
    .setDescription('Transfiere hasta 500 miembros de MongoDB a este servidor sin bloqueos')
    .addStringOption(opt => opt.setName('codigo').setDescription('Tu cÃ³digo de seguridad personal').setRequired(false))
    .addIntegerOption(opt => opt.setName('cantidad').setDescription('Cantidad de miembros (1 a 500)').setMinValue(1).setMaxValue(500).setRequired(false));

slashCommands.push(pullCmd.toJSON());

client.once('ready', async () => {
    console.log(`ðŸ¤– Bot encendido como: ${client.user.tag}`);
    await registrarActividadSistema('system', 'success', `Cliente Discord conectado como ${client.user.tag}`, `Servidores activos: ${client.guilds.cache.size}`);
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: slashCommands });
        for (const [guildId] of client.guilds.cache) {
            await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: slashCommands }).catch(() => {});
        }
        console.log('âœ… Comandos Slash sincronizados al instante en todos los servidores.');
    } catch (error) {
        console.error(error);
    }
});

client.on('guildCreate', async (guild) => {
    await registrarActividadSistema('guild_connect', 'success', `Nuevo servidor conectado: ${guild.name}`, `ID: ${guild.id} â€¢ Miembros: ${guild.memberCount}`);
});

client.on('guildDelete', async (guild) => {
    await registrarActividadSistema('guild_disconnect', 'warning', `Servidor desconectado: ${guild.name || 'Servidor'}`, `ID: ${guild.id}`);
});

async function procesarComandoAutorizado(interaction) {
    if (interaction.commandName === 'restore_pull') {
        if (getRestoreState().restoreEnCurso) {
            return await interaction.reply({
                content: `â³ Ya hay una transferencia activa (${getRestoreState().progresoRestore.procesados}/${getRestoreState().progresoRestore.total}).`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        const cantidad = interaction.options?.getInteger?.('cantidad') || 500;
        const totalEnDb = await OAuthToken.countDocuments();

        if (totalEnDb === 0) {
            return await interaction.reply({
                content: 'âŒ TodavÃ­a no hay usuarios registrados en MongoDB.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        await interaction.reply({
            content: `ðŸš€ **Iniciando Restore de hasta ${cantidad} miembros** en **${interaction.guild.name}**.\nModo Anti-Bloqueo activo (1.35s por usuario).`,
            flags: [MessageFlags.Ephemeral]
        });

        transferirMiembrosSeguro(interaction.guild.id, cantidad, interaction.user.username).then(async (res) => {
            await interaction.followUp({
                content: `âœ… **Restore Completado (${res.operationId}):**\nâ€¢ **Unidos:** ${res.unidos}\nâ€¢ **Ya estaban:** ${res.yaEstaban}\nâ€¢ **Fallidos:** ${res.fallidos}`,
                flags: [MessageFlags.Ephemeral]
            }).catch(() => {});
        });
        return;
    }

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        await command.execute(interaction, dbAdapter);
    } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: 'âŒ Hubo un error al ejecutar este comando.', flags: [MessageFlags.Ephemeral] });
        } else {
            await interaction.reply({ content: 'âŒ Hubo un error al ejecutar este comando.', flags: [MessageFlags.Ephemeral] });
        }
    }
}

client.on('interactionCreate', async interaction => {
    if (interaction.isModalSubmit() && interaction.customId.startsWith('pin_modal_')) {
        const pinEscrito = interaction.fields.getTextInputValue('pin_input').trim();
        const cmdName = interaction.customId.replace('pin_modal_', '');

        if (pinEscrito !== CODIGO_SECRETO) {
            await registrarActividadSistema('auth', 'warning', `Intento fallido de PIN en comando /${cmdName}`, `Usuario: ${interaction.user.tag}`);
            return await interaction.reply({
                content: 'âŒ **CÃ³digo de seguridad personal incorrecto.** OperaciÃ³n cancelada.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        interaction.commandName = cmdName;
        return await procesarComandoAutorizado(interaction);
    }

    if (!interaction.isChatInputCommand()) return;

    const esOwner = !OWNER_ID || interaction.user.id === OWNER_ID || (interaction.guild && interaction.guild.ownerId === interaction.user.id);
    if (!esOwner) {
        return await interaction.reply({
            content: `ðŸ›‘ **Acceso Bloqueado:** Tu ID (\`${interaction.user.id}\`) no estÃ¡ autorizada como propietario de este bot.`,
            flags: [MessageFlags.Ephemeral]
        });
    }

    const codigoIngresado = interaction.options.getString('codigo');

    if (!codigoIngresado) {
        const modal = new ModalBuilder()
            .setCustomId(`pin_modal_${interaction.commandName}`)
            .setTitle('ðŸ” VerificaciÃ³n de Seguridad Kyven');

        const inputPin = new TextInputBuilder()
            .setCustomId('pin_input')
            .setLabel('Ingresa tu cÃ³digo de seguridad personal')
            .setPlaceholder('Escribe tu BACKUP_PIN para ejecutar /' + interaction.commandName)
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(inputPin));
        return await interaction.showModal(modal);
    }

    if (codigoIngresado.trim() !== CODIGO_SECRETO) {
        return await interaction.reply({
            content: 'ðŸ›‘ **CÃ³digo Incorrecto:** El cÃ³digo de seguridad personal ingresado no es vÃ¡lido.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    await procesarComandoAutorizado(interaction);
});
}

module.exports = { registerDiscordEvents };
