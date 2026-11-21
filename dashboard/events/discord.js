'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('node:crypto');
const { Routes, REST, SlashCommandBuilder, MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

function registerDiscordEvents({ client, rootDir, registrarActividadSistema, OAuthToken, RestoreOperation, dbAdapter, CODIGO_SECRETO, OWNER_ID, getRestoreState, transferirMiembrosSeguro }) {
const slashCommands = [];
// Preserva las opciones originales durante la ventana del PIN. No guarda el PIN.
const pinSessions = new Map();
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
                    description: 'Código de seguridad personal (o déjalo vacío para abrir ventana de PIN)',
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
    .addStringOption(opt => opt.setName('codigo').setDescription('Tu código de seguridad personal').setRequired(false))
    .addIntegerOption(opt => opt.setName('cantidad').setDescription('Cantidad de miembros (1 a 500)').setMinValue(1).setMaxValue(500).setRequired(false));

slashCommands.push(pullCmd.toJSON());

client.once('ready', async () => {
    console.log(`🤖 Bot encendido como: ${client.user.tag}`);
    await registrarActividadSistema('system', 'success', `Cliente Discord conectado como ${client.user.tag}`, `Servidores activos: ${client.guilds.cache.size}`);
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: slashCommands });
        console.log('✅ Comandos Slash sincronizados al instante en todos los servidores.');
    } catch (error) {
        console.error(error);
    }
});

client.on('guildCreate', async (guild) => {
    await registrarActividadSistema('guild_connect', 'success', `Nuevo servidor conectado: ${guild.name}`, `ID: ${guild.id} • Miembros: ${guild.memberCount}`);
});

client.on('guildDelete', async (guild) => {
    await registrarActividadSistema('guild_disconnect', 'warning', `Servidor desconectado: ${guild.name || 'Servidor'}`, `ID: ${guild.id}`);
});

async function procesarComandoAutorizado(interaction, inputOptions = interaction.options, requestedCommand = interaction.commandName) {
    if (requestedCommand === 'restore_pull') {
        if (getRestoreState().restoreEnCurso) {
            return await interaction.reply({
                content: `⏳ Ya hay una transferencia activa (${getRestoreState().progresoRestore.procesados}/${getRestoreState().progresoRestore.total}).`,
                flags: [MessageFlags.Ephemeral]
            });
        }

        const cantidad = inputOptions?.getInteger?.('cantidad') || 500;
        const totalEnDb = await OAuthToken.countDocuments();

        if (totalEnDb === 0) {
            return await interaction.reply({
                content: '❌ Todavía no hay usuarios registrados en MongoDB.',
                flags: [MessageFlags.Ephemeral]
            });
        }

        await interaction.reply({
            content: `🚀 **Iniciando Restore de hasta ${cantidad} miembros** en **${interaction.guild.name}**.\nModo Anti-Bloqueo activo (1.35s por usuario).`,
            flags: [MessageFlags.Ephemeral]
        });

        transferirMiembrosSeguro(interaction.guild.id, cantidad, interaction.user.username).then(async (res) => {
            await interaction.followUp({
                content: `✅ **Restore Completado (${res.operationId}):**\n• **Unidos:** ${res.unidos}\n• **Ya estaban:** ${res.yaEstaban}\n• **Fallidos:** ${res.fallidos}`,
                flags: [MessageFlags.Ephemeral]
            }).catch(() => {});
        });
        return;
    }

    const command = client.commands.get(requestedCommand);
    if (!command) return;

    try {
        await command.execute(interaction, dbAdapter, inputOptions);
    } catch (error) {
        console.error(error);
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ content: '❌ Hubo un error al ejecutar este comando.', flags: [MessageFlags.Ephemeral] });
        } else {
            await interaction.reply({ content: '❌ Hubo un error al ejecutar este comando.', flags: [MessageFlags.Ephemeral] });
        }
    }
}

client.on('interactionCreate', async interaction => {
    if (interaction.isModalSubmit() && interaction.customId.startsWith('pin_modal_')) {
        const nonce = interaction.customId.slice('pin_modal_'.length);
        const state = pinSessions.get(nonce);
        pinSessions.delete(nonce);
        if (!state || state.userId !== interaction.user.id || state.guildId !== interaction.guildId || Date.now() > state.expiresAt) {
            return await interaction.reply({content:'❌ Solicitud de PIN caducada o inválida.',flags:[MessageFlags.Ephemeral]});
        }
        const isOwner = !OWNER_ID || interaction.user.id === OWNER_ID ||
            (interaction.guild && interaction.guild.ownerId === interaction.user.id);
        if (!isOwner) return interaction.reply({content:'⛔ Usuario no autorizado.',flags:[MessageFlags.Ephemeral]});
        const pinEscrito = interaction.fields.getTextInputValue('pin_input').trim();
        if (pinEscrito !== CODIGO_SECRETO) {
            await registrarActividadSistema('auth', 'warning', `PIN incorrecto en /${state.commandName}`, `Usuario: ${interaction.user.tag}`);
            return await interaction.reply({content:'❌ Código incorrecto.',flags:[MessageFlags.Ephemeral]});
        }
        const remembered = {
            getString: name => state.options.find(o => o.name === name && o.type === 3)?.value ?? null,
            getInteger: name => state.options.find(o => o.name === name && o.type === 4)?.value ?? null
        };
        return await procesarComandoAutorizado(interaction,remembered,state.commandName);
    }

    if (!interaction.isChatInputCommand()) return;

    const esOwner = !OWNER_ID || interaction.user.id === OWNER_ID || (interaction.guild && interaction.guild.ownerId === interaction.user.id);
    if (!esOwner) {
        return await interaction.reply({
            content: `🛑 **Acceso Bloqueado:** Tu ID (\`${interaction.user.id}\`) no está autorizada como propietario de este bot.`,
            flags: [MessageFlags.Ephemeral]
        });
    }

    const codigoIngresado = interaction.options.getString('codigo');

    if (!codigoIngresado) {
        for (const [id,session] of pinSessions) if (session.expiresAt < Date.now()) pinSessions.delete(id);
        const nonce = crypto.randomBytes(9).toString('hex');
        pinSessions.set(nonce, {
            userId:interaction.user.id, guildId:interaction.guildId,
            commandName:interaction.commandName, options: interaction.options.data.map(o => ({name:o.name,type:o.type,value:o.value})),
            expiresAt:Date.now()+180000
        });
        const modal = new ModalBuilder()
            .setCustomId(`pin_modal_${nonce}`)
            .setTitle('🔐 Verificación de Seguridad Kyven');

        const inputPin = new TextInputBuilder()
            .setCustomId('pin_input')
            .setLabel('Ingresa tu código de seguridad personal')
            .setPlaceholder('Escribe tu BACKUP_PIN para ejecutar /' + interaction.commandName)
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(inputPin));
        return await interaction.showModal(modal);
    }

    if (codigoIngresado.trim() !== CODIGO_SECRETO) {
        return await interaction.reply({
            content: '🛑 **Código Incorrecto:** El código de seguridad personal ingresado no es válido.',
            flags: [MessageFlags.Ephemeral]
        });
    }

    await procesarComandoAutorizado(interaction);
});
}

module.exports = { registerDiscordEvents };
