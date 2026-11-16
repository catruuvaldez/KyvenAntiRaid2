'use strict';

// Snapshot of CHANNEL/CATEGORY overwrites for the recovery command.
// No guild role definitions, no ticket/cart state, and no Discord tokens.
// The other backup bot remains the owner of channels/roles and dynamic tickets.
const fs = require('fs');
const path = require('path');
const { PermissionFlagsBits: FLAGS, ChannelType } = require('discord.js');

const STORE = process.env.NODE_ENV === 'test' && process.env.KYVEN_PC_RECOVERY_TEST_STORE
    ? path.resolve(process.env.KYVEN_PC_RECOVERY_TEST_STORE)
    : path.resolve(__dirname, '../../../.pc-private/permission-recovery.json');
const SNOWFLAKE = /^\d{17,20}$/;
const MAX_CHANNELS = 1000;
const MAX_TARGETS_PER_RUN = 1000;
const FLAG_SET = new Set(Object.keys(FLAGS).filter(k => typeof FLAGS[k] === 'bigint'));
const KNOWN_MASK = [...FLAG_SET].reduce((bits, name) => bits | FLAGS[name], 0n);

// Only categories/channels owned by the *other* bot are excluded. In particular
// "Compradores" is NOT excluded; a purchase session called "compra-123" is.
// Roles and names can contain emojis, accents and decorative characters.
const EXTERNAL_NAMES = /(^|[^a-z])(?:tickets?|soporte|support|compras?|carrito|carts?|checkout|pedidos?|orders?|purchase|ventas?|partner)(?=$|[^a-z])/i;
// Legacy ticket parent ID is retained for the original server even if renamed.
const LEGACY_TICKET_CATEGORY_ID = '1547708495745523783';
const EXTRA_PROTECTED_IDS = new Set(String(process.env.PERMISSION_RECOVERY_PROTECTED_IDS || '')
    .split(',').map(x => x.trim()).filter(x => SNOWFLAKE.test(x)));

function normalizedName(value) {
    return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}
function isExternalName(name) { return EXTERNAL_NAMES.test(normalizedName(name)); }
function isProtectedChannel(channel, guild) {
    if (!channel) return false;
    if (channel.id === LEGACY_TICKET_CATEGORY_ID || channel.parentId === LEGACY_TICKET_CATEGORY_ID ||
        EXTRA_PROTECTED_IDS.has(channel.id) || EXTRA_PROTECTED_IDS.has(channel.parentId)) return true;
    const name = String(channel.name || '');
    const parent = channel.parent || (channel.parentId && guild?.channels?.cache?.get(channel.parentId));
    if (isExternalName(name) || (parent && isExternalName(parent.name))) return true;
    // Discord can auto-synchronize a child when the category's overwrites change.
    // Protect a *whole* category containing a ticket/cart-like child, rather than
    // changing its parent and unintentionally affecting a child owned by another bot.
    const parentId = Number(channel.type) === ChannelType.GuildCategory ? channel.id : channel.parentId;
    if (parentId && guild?.channels?.cache) {
        for (const sibling of guild.channels.cache.values()) {
            if (sibling.parentId !== parentId) continue;
            if (isExternalName(sibling.name) || [...(sibling.permissionOverwrites?.cache?.values() || [])]
                .some(ow => Number(ow.type) === 1)) return true;
        }
    }
    return false;
}
function loadProfiles() {
    if (!fs.existsSync(STORE)) return { schema: 1, profiles: {} };
    const data = JSON.parse(fs.readFileSync(STORE, 'utf8'));
    if (data?.schema !== 1 || !data.profiles || typeof data.profiles !== 'object' || Array.isArray(data.profiles))
        throw new Error('El archivo de perfiles de recuperación tiene un formato desconocido. No se modificará Discord.');
    return data;
}
function saveProfiles(data) {
    fs.mkdirSync(path.dirname(STORE), { recursive: true, mode: 0o700 });
    const tmp = `${STORE}.${process.pid}.tmp`;
    try {
        fs.writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600, flag: 'wx' });
        fs.renameSync(tmp, STORE);
    } finally { if (fs.existsSync(tmp)) fs.unlinkSync(tmp); }
}
function findProfile(guildId) {
    if (!SNOWFLAKE.test(String(guildId))) return null;
    return loadProfiles().profiles[String(guildId)] || null;
}
function roleOrMemberRef(guild, ow) {
    const type = Number(ow.type);
    if (type === 0) {
        if (ow.id === guild.id) return { kind: 'everyone' };
        const role = guild.roles.cache.get(ow.id);
        if (!role) throw new Error(`No se pudo guardar el rol ${ow.id}: falta en la caché.`);
        return { kind: 'role', id: ow.id, name: role.name, managed: Boolean(role.managed) };
    }
    if (type === 1) return { kind: 'member', id: ow.id };
    throw new Error('Tipo de sobrescritura desconocido.');
}
function serializeOverwrite(guild, ow) {
    const unknown = (BigInt(ow.allow.bitfield) | BigInt(ow.deny.bitfield)) & ~KNOWN_MASK;
    if (unknown) throw new Error(`Permisos desconocidos en ${ow.id}; actualiza Discord.js antes de respaldarlos.`);
    return {
        target: roleOrMemberRef(guild, ow),
        allow: ow.allow.toArray().filter(p => FLAG_SET.has(p)).sort(),
        deny: ow.deny.toArray().filter(p => FLAG_SET.has(p)).sort()
    };
}
function captureProfile(guild) {
    if (!guild?.id || !guild.channels?.cache || !guild.roles?.cache) throw new Error('Servidor de Discord sin datos de roles/canales.');
    const channels = [];
    let externalCount = 0;
    for (const channel of guild.channels.cache.values()) {
        if (!channel?.permissionOverwrites) continue;
        if (isProtectedChannel(channel, guild)) { externalCount++; continue; }
        const parent = channel.parent || (channel.parentId && guild.channels.cache.get(channel.parentId));
        channels.push({
            id: channel.id, name: channel.name, type: Number(channel.type),
            parent: parent ? { name: parent.name, id: parent.id } : null,
            overwrites: [...channel.permissionOverwrites.cache.values()].map(ow => serializeOverwrite(guild, ow))
        });
        if (channels.length > MAX_CHANNELS) throw new Error('Demasiados canales para generar un perfil de recuperación.');
    }
    channels.sort((a,b) => a.id.localeCompare(b.id));
    const data = loadProfiles();
    const roles = [...guild.roles.cache.values()].filter(role => role.id !== guild.id && !role.managed && !role.permissions.has(FLAGS.Administrator))
        .map(role => ({ id:role.id, name:role.name, permissions:role.permissions.toArray().filter(p=>FLAG_SET.has(p)).sort() }))
        .sort((a,b)=>a.id.localeCompare(b.id));
    const profile = { version: 1, guildId: guild.id, guildName: guild.name, updatedAt: new Date().toISOString(), roles, channels };
    data.profiles[guild.id] = profile;
    saveProfiles(data);
    return { guildId: guild.id, saved: channels.length, protected: externalCount, updatedAt: profile.updatedAt };
}
function channelKey(channel) {
    const parent = channel.parent?.name || null;
    return JSON.stringify([Number(channel.type), parent, channel.name]);
}
function profileKey(item) { return JSON.stringify([Number(item.type), item.parent?.name || null, item.name]); }
function toOverwriteBitfield(entry, guild, sameGuild, warnings, roleCacheByName) {
    const t = entry.target || {};
    let id;
    if (t.kind === 'everyone') id = guild.id;
    else if (t.kind === 'role') {
        if (sameGuild && guild.roles.cache.has(t.id)) id = t.id;
        else {
            const matches = roleCacheByName.get(t.name) || [];
            if (matches.length === 1) id = matches[0].id;
            else if (matches.length === 0 && t.managed && !sameGuild) {
                warnings.push(`El rol administrado ${t.name} todavía no está en el destino; no se copiará su excepción.`);
                return null;
            } else throw new Error(`Rol ${t.name}: ${matches.length ? 'hay nombres duplicados' : 'no existe'} en el servidor destino.`);
        }
    } else if (t.kind === 'member') {
        // A member ID can be the same on two servers, but their membership must
        // be revalidated. We intentionally do not transfer individual overrides
        // across guilds: purchase/ticket access is the other bot's responsibility.
        if (!sameGuild) return null;
        id = t.id;
    } else throw new Error('Destinatario desconocido en el perfil.');
    if (!SNOWFLAKE.test(String(id))) throw new Error('Identificador inválido en el perfil.');
    const allow = entry.allow || [], deny = entry.deny || [];
    if (!Array.isArray(allow) || !Array.isArray(deny) || [...allow, ...deny].some(x => !FLAG_SET.has(x)) || allow.some(x => deny.includes(x)))
        throw new Error('Permisos desconocidos o contradictorios en el perfil.');
    return { id, type: t.kind === 'member' ? 1 : 0, allow, deny };
}
function equalOverwriteSets(actual, proposed) {
    const encode = item => `${item.id}:${BigInt(item.allow).toString()}:${BigInt(item.deny).toString()}`;
    function bits(list) { return (list || []).reduce((n, p) => n | FLAGS[p], 0n); }
    const existing = [...actual.permissionOverwrites.cache.values()].map(ow => encode({id:ow.id,allow:ow.allow.bitfield,deny:ow.deny.bitfield})).sort();
    const expected = proposed.map(item => encode({ id:item.id, allow: Array.isArray(item.allow) ? bits(item.allow) : item.allow, deny: Array.isArray(item.deny) ? bits(item.deny) : item.deny })).sort();
    return existing.length === expected.length && existing.every((v,i) => v === expected[i]);
}
async function planProfileRestore(guild, profile) {
    if (!profile || !SNOWFLAKE.test(String(profile.guildId)) || !Array.isArray(profile.channels) || profile.channels.length > MAX_CHANNELS)
        throw new Error('No existe un perfil de permisos válido para restaurar.');
    const sameGuild = profile.guildId === guild.id;
    const byKey = new Map();
    for (const channel of guild.channels.cache.values()) {
        if (!channel.permissionOverwrites) continue;
        const key = channelKey(channel);
        const values = byKey.get(key) || [];
        values.push(channel);
        byKey.set(key, values);
    }
    const rolesByName = new Map();
    for (const role of guild.roles.cache.values()) {
        const values = rolesByName.get(role.name) || [];
        values.push(role);
        rolesByName.set(role.name, values);
    }
    const entries = [], skipped = [], warnings = [];
    for (const item of profile.channels) {
        let channel;
        if (sameGuild && guild.channels.cache.has(item.id)) channel = guild.channels.cache.get(item.id);
        else {
            const found = byKey.get(profileKey(item)) || [];
            if (found.length !== 1) { skipped.push(`${item.name}: ${found.length ? 'varios canales/categorías coinciden' : 'no se encontró el canal'}`); continue; }
            channel = found[0];
            // A duplicate parent category name makes its children ambiguous.
            if (item.parent && (byKey.get(JSON.stringify([ChannelType.GuildCategory, null, item.parent.name])) || []).length !== 1) {
                skipped.push(`${item.name}: categoría de origen ambigua`); continue;
            }
        }
        if (!channel || !channel.permissionOverwrites || isProtectedChannel(channel, guild)) {
            skipped.push(`${item.name}: canal protegido por el otro bot`); continue;
        }
        if (!channel.manageable) { skipped.push(`${item.name}: el bot no puede administrar este canal`); continue; }
        if (!sameGuild && [...channel.permissionOverwrites.cache.values()].some(ow=>Number(ow.type)===1)) {
            skipped.push(`${item.name}: ya contiene permisos individuales; por seguridad no se sobrescribe`); continue;
        }
        try {
            const prepared = [];
            for (const ow of item.overwrites) {
                const mapped = toOverwriteBitfield(ow, guild, sameGuild, warnings, rolesByName);
                if (mapped) prepared.push(mapped);
            }
            const ids = new Set(prepared.map(e => e.id));
            if (ids.size !== prepared.length) throw new Error('Varios roles de origen apuntan al mismo rol de destino.');
            // Preserve explicitly configured member overrides currently on target
            // (tickets are excluded separately, but other bots may also create members).
            for (const ow of channel.permissionOverwrites.cache.values()) {
                if (ow.type === 1 && !ids.has(ow.id)) {
                    prepared.push({ id:ow.id, type:1, allow:ow.allow.bitfield, deny:ow.deny.bitfield });
                    ids.add(ow.id);
                }
                if (!sameGuild && ow.type === 0 && !ids.has(ow.id) && guild.roles.cache.get(ow.id)?.managed) {
                    prepared.push({ id:ow.id, type:0, allow:ow.allow.bitfield, deny:ow.deny.bitfield });
                    ids.add(ow.id);
                }
            }
            entries.push({ id:channel.id, name:channel.name, overwrites:prepared, before:[...channel.permissionOverwrites.cache.values()].map(ow => ({id:ow.id, allow:ow.allow.bitfield, deny:ow.deny.bitfield})), changed:!equalOverwriteSets(channel,prepared) });
        } catch(e) { skipped.push(`${item.name}: ${e.message}`); }
    }
    if (entries.length > MAX_TARGETS_PER_RUN) throw new Error('El perfil contiene demasiadas operaciones.');
    return { entries, skipped, warnings, sameGuild };
}
async function planRoleRestore(guild, profile) {
    if (!Array.isArray(profile?.roles)) return { entries: [], skipped: [], warnings: [] }; // Existing snapshots are compatible.
    const sameGuild = profile.guildId === guild.id;
    const me = guild.members.me || await guild.members.fetchMe();
    const byName = new Map();
    for (const role of guild.roles.cache.values()) byName.set(role.name, [...(byName.get(role.name)||[]),role]);
    const entries = [], skipped = [];
    for (const item of profile.roles) {
        if (!item || typeof item.name !== 'string' || !Array.isArray(item.permissions) ||
            item.permissions.some(x=> !FLAG_SET.has(x)) || item.permissions.includes('Administrator')) {
            skipped.push(`Rol ${item?.name || '?'}: permisos inválidos o Administrator bloqueado`); continue;
        }
        const matches = byName.get(item.name) || [];
        const role = sameGuild && guild.roles.cache.get(item.id) || (matches.length === 1 ? matches[0] : null);
        if (!role) { skipped.push(`Rol ${item.name}: ${matches.length?'nombre duplicado':'no encontrado'}`); continue; }
        if (role.managed || role.id === guild.id || role.permissions.has(FLAGS.Administrator) ||
            !me || role.position >= me.roles.highest.position) {
            skipped.push(`Rol ${item.name}: rol administrado, administrador o por encima del bot`); continue;
        }
        const expected = item.permissions.reduce((n,p)=>n|FLAGS[p],0n);
        entries.push({ role, name:item.name, permissions:item.permissions, changed:role.permissions.bitfield !== expected,
            before:role.permissions.bitfield });
    }
    return { entries, skipped, warnings: [] };
}
async function applyRoleRestore(guild, profile, { preview = false } = {}) {
    const plan = await planRoleRestore(guild, profile);
    const result = { planned:plan.entries.length, changed:plan.entries.filter(x=>x.changed).length,
        applied:0, skipped:plan.skipped, errors:[], preview };
    if (preview) return result;
    for (const entry of plan.entries) {
        if (!entry.changed) continue;
        try {
            const fresh = await guild.roles.fetch(entry.role.id);
            if (!fresh || fresh.managed || fresh.permissions.has(FLAGS.Administrator) ||
                fresh.permissions.bitfield !== entry.before || !fresh.editable)
                throw new Error('El rol cambió o el bot no puede editarlo.');
            await fresh.setPermissions(entry.permissions, 'KYVEN RESTORE: restauración de permisos globales de rol');
            result.applied++;
        } catch(e) { result.errors.push(`${entry.name}: ${e.message}`); }
    }
    return result;
}

async function applyProfileRestore(guild, profile, { preview = false, progress = async () => {} } = {}) {
    const plan = await planProfileRestore(guild, profile);
    if (preview) return { planned: plan.entries.length, changed: plan.entries.filter(x=>x.changed).length, applied: 0, skipped: plan.skipped, warnings: plan.warnings, preview: true };
    const out = { planned: plan.entries.length, changed: plan.entries.filter(x=>x.changed).length, applied: 0, skipped: plan.skipped, warnings: plan.warnings, errors: [] };
    for (let i = 0; i < plan.entries.length; i++) {
        const entry = plan.entries[i];
        if (!entry.changed) continue;
        try {
            // Check again to avoid overwriting a bot-created dynamic channel in-flight.
            const fresh = await guild.channels.fetch(entry.id);
            if (!fresh?.permissionOverwrites || isProtectedChannel(fresh, guild)) { out.skipped.push(`${entry.name}: ahora lo administra un sistema externo`); continue; }
            if (!fresh.manageable) { out.skipped.push(`${entry.name}: falta ManageChannels`); continue; }
            // Do not silently overwrite concurrent admin edits.
            if (!equalOverwriteSets(fresh, entry.before)) {
                out.skipped.push(`${entry.name}: los permisos cambiaron durante la operación`); continue;
            }
            await fresh.permissionOverwrites.set(entry.overwrites, 'KYVEN RESTORE: perfil de permisos confirmado');
            out.applied++;
        } catch (e) { out.errors.push(`${entry.name}: ${e.message}`); }
        if (i % 8 === 0) await progress(i + 1, plan.entries.length, out.applied);
    }
    return out;
}

module.exports = { STORE, isProtectedChannel, isExternalName, loadProfiles, findProfile, captureProfile,
    planProfileRestore, applyProfileRestore, planRoleRestore, applyRoleRestore };
