'use strict';

const { Client, GatewayIntentBits, Collection } = require('discord.js');
const { registerDiscordEvents } = require('../events/discord');

function createDiscordClient() {
    const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers] });
    client.commands = new Collection();
    return client;
}

module.exports = { createDiscordClient, registerDiscordEvents };
