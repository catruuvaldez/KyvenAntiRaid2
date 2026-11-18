'use strict';

// Guardar como dashboard/interactions/commands.js.
const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { registerDiscordEvents } = require('../events/discord');

function createDiscordClient() {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.GuildPresences // Necesario para actualizar el estado en vivo
        ]
    });
    client.commands = new Collection();
    return client;
}

module.exports = { createDiscordClient, registerDiscordEvents };
