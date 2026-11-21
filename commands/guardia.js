'use strict';
const {SlashCommandBuilder,MessageFlags} = require('discord.js');
let system;
function setGuardian(value) { system = value; }
const data = new SlashCommandBuilder().setName('guardia')
    .setDescription('Copias comprimidas y recuperación de seguridad KYVEN')
    .addStringOption(o=>o.setName('accion').setDescription('Operación protegida').setRequired(true)
        .addChoices(
            {name:'estado de la protección',value:'estado'},
            {name:'crear copia ahora',value:'guardar'},
            {name:'ver plan de recuperación (sin cambios)',value:'plan'},
            {name:'restaurar elementos eliminados',value:'restaurar'},
            {name:'restaurar también cambios de permisos/roles',value:'restaurar_todo'},
            {name:'descongelar copias tras revisar incidente',value:'desbloquear'}))
    .addStringOption(o=>o.setName('copia').setDescription('ID de snapshot (opcional; por defecto el más reciente)').setRequired(false))
    .addStringOption(o=>o.setName('confirmacion').setDescription('RECUPERAR o DESBLOQUEAR cuando se solicite').setRequired(false));
function formatPlan(plan) {
    return `Copia: \`${plan.snapshotId}\` (${new Date(plan.createdAt).toISOString()}) [${plan.source}]\n`+
        `Roles que faltan: **${plan.createRoles}**; canales que faltan: **${plan.createChannels}**\n`+
        `Roles existentes en plan: ${plan.editRoles}; canales existentes en plan: ${plan.editChannels}\n`+
        `Miembros con asignaciones guardadas: ${plan.restoreAssignments}\n`+
        (plan.warnings.length ? `Avisos de captura: ${plan.warnings.slice(0,2).join('; ')}` : '');
}
async function execute(interaction, _db, overrideOptions) {
    if (!system) throw new Error('Guardián sin inicializar.');
    if (!interaction.guild) return interaction.reply({content:'Solo funciona dentro de tu servidor.',flags:MessageFlags.Ephemeral});
    const options = overrideOptions || interaction.options;
    const action = options?.getString?.('accion');
    const snapshotId = options?.getString?.('copia') || undefined;
    const confirmation = options?.getString?.('confirmacion') || '';
    if (!action) return interaction.reply({content:'Falta la acción. Volvé a ejecutar /guardia.',flags:MessageFlags.Ephemeral});
    await interaction.deferReply({flags:MessageFlags.Ephemeral});
    try {
        const {backups,antiraid} = system;
        if (action === 'estado') {
            const recent = (await backups.list(interaction.guild.id)).slice(0,4);
            const locked = await backups.loadLock(interaction.guild.id);
            const stats = antiraid.stats();
            const content = `🛡️ **KYVEN GUARDIAN**\nAnti-Raid: ${stats.enabled?'activo':'inactivo'} | respuesta: ${stats.action||'alert'}\n`+
                `Auto-restauración: ${stats.autoRestore?'activada':'desactivada'}\n`+
                `Backups: ${backups.enabled?'activos':'desactivados'} | ${locked?'🔒 congelados por incidente: '+locked.reason:'sin bloqueo'}\n`+
                `Copias recientes:\n${recent.map(s=>`• ${s.createdAt.toISOString()} (${s.source}, ${Math.ceil(s.bytes/1024)} KB) — \`${s.id}\``).join('\n')||'Ninguna'}`;
            return interaction.editReply({content:content.slice(0,1900)});
        }
        if (action === 'guardar') {
            const res = await backups.save(interaction.guild,{force:true});
            return interaction.editReply({content:res.saved
                ? `✅ Copia creada: ${res.roles} roles, ${res.channels} canales, ${res.assignments} asignaciones, ${Math.ceil(res.bytes/1024)} KB. Atlas: ${res.remoteSaved?'sí':'NO (solo local)'}.`
                : `⚠️ No se creó copia: ${res.skipped}`});
        }
        if (action === 'plan') {
            const plan = await backups.plan(interaction.guild,{snapshotId,mode:'missing'});
            return interaction.editReply({content:'📋 **Simulación, sin cambios**\n'+formatPlan(plan)+
                '\nPara recuperar, usá `/guardia accion:restaurar confirmacion:RECUPERAR`.'});
        }
        if (action === 'restaurar' || action === 'restaurar_todo') {
            if (confirmation !== 'RECUPERAR') return interaction.editReply({
                content:'⛔ No se aplicó ningún cambio. Repetí el comando con `confirmacion:RECUPERAR` y verificá primero el plan.'});
            const mode = action === 'restaurar_todo' ? 'full' : 'missing';
            const result = await backups.restore(interaction.guild,{snapshotId,mode});
            return interaction.editReply({content:(`✅ **Restauración ${mode} terminada**\n`+
                `Roles recreados: ${result.rolesCreated}\nCanales recreados: ${result.channelsCreated}\n`+
                `Roles actualizados: ${result.rolesEdited}\nCanales actualizados: ${result.channelsEdited}\n`+
                `Miembros con roles reasignados: ${result.membersRestored}\nFallos: ${result.failures}\n`+
                (result.errors.length ? `Errores: ${result.errors.slice(0,3).join(' | ')}\n` : '')+
                'Los mensajes borrados e IDs originales NO se recuperan. Las copias permanecen congeladas hasta revisión.').slice(0,1900)});
        }
        if (action === 'desbloquear') {
            if (confirmation !== 'DESBLOQUEAR') return interaction.editReply({
                content:'⛔ Completá `confirmacion:DESBLOQUEAR` SOLO después de revisar la seguridad del servidor.'});
            await backups.unlock(interaction.guild.id);
            return interaction.editReply({content:'✅ Backups descongelados. Los snapshots anteriores siguen conservados según la retención.'});
        }
        return interaction.editReply({content:'Acción desconocida.'});
    } catch (err) {
        return interaction.editReply({content:`❌ Error: ${String(err?.message||err).slice(0,1700)}`});
    }
}
module.exports = {data,execute,setGuardian};
