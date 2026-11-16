'use strict';
/* KYVEN Permission Center 2.0. A saved draft is always reviewed before POST /apply. */
const pc2 = {
    guildId: null, channelId: null, selected: null, draft: [], original: [],
    clipboard: null, destinations: new Set(), templates: [], prepared: null,
    members: new Map(), changed: false, collapse: new Set()
};
const pc2Groups = {
    'Generales': {
        ViewChannel:'Ver canal', ManageChannels:'Gestionar canal', ManageRoles:'Gestionar permisos',
        ManageWebhooks:'Gestionar webhooks', CreateInstantInvite:'Crear invitaciones'
    },
    'Texto y mensajes': {
        SendMessages:'Enviar mensajes', SendMessagesInThreads:'Enviar mensajes en hilos',
        CreatePublicThreads:'Crear hilos públicos', CreatePrivateThreads:'Crear hilos privados',
        ManageThreads:'Gestionar hilos', EmbedLinks:'Insertar enlaces', AttachFiles:'Adjuntar archivos',
        AddReactions:'Añadir reacciones', UseExternalEmojis:'Usar emojis externos',
        UseExternalStickers:'Usar stickers externos', MentionEveryone:'Mencionar @everyone y roles',
        ManageMessages:'Gestionar mensajes', ReadMessageHistory:'Leer historial de mensajes',
        SendTTSMessages:'Enviar texto a voz', UseApplicationCommands:'Usar comandos de aplicaciones',
        CreatePolls:'Crear encuestas', SendVoiceMessages:'Enviar mensajes de voz', UseExternalApps:'Usar aplicaciones externas'
    },
    'Voz y actividades': {
        Connect:'Conectarse', Speak:'Hablar', Stream:'Vídeo y pantalla', MuteMembers:'Silenciar miembros',
        DeafenMembers:'Ensordecer miembros', MoveMembers:'Mover miembros', UseVAD:'Actividad de voz',
        PrioritySpeaker:'Prioridad de palabra', UseSoundboard:'Panel de sonidos',
        UseExternalSounds:'Sonidos externos', SetVoiceChannelStatus:'Estado de canal de voz',
        UseEmbeddedActivities:'Usar actividades'
    },
    'Eventos': { ManageEvents:'Gestionar eventos' }
};
const pc2E = text => String(text == null ? '' : text).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const pc2Clone = obj => JSON.parse(JSON.stringify(obj));
const pc2CurrentChannel = () => pcData?.channels.find(c => c.id === pc2.channelId);
const pc2TargetLabel = entry => entry ?
    (entry.type === 0 ? (entry.id === pcData.guild.id ? '@everyone' : pcData.roles.find(r => r.id === entry.id)?.name || 'Rol '+entry.id)
        : pc2.members.get(entry.id) || 'Usuario '+entry.id) : '';
function pc2Toast(text, success = false) { if (typeof mostrarToast === 'function') mostrarToast(text, success); else alert(text); }
function pc2MarkDirty() {
    pc2.changed = JSON.stringify(pc2.draft) !== JSON.stringify(pc2.original);
    const status = document.getElementById('pc2DraftStatus');
    if (status) { status.textContent = pc2.changed ? '● Cambios pendientes · no guardados' : 'Sin cambios pendientes'; status.classList.toggle('changed', pc2.changed); }
    pc2HideReview();
}
function pc2HideReview() { pc2.prepared = null; const host = document.getElementById('pc2Review'); if (host) { host.hidden = true; host.innerHTML = ''; } }
function pc2OnGuildLoaded() {
    if (!pcData || !document.getElementById('pc2Workspace')) return;
    const guildChanged = pc2.guildId !== pcData.guild.id;
    pc2.guildId = pcData.guild.id;
    if (guildChanged) { pc2.clipboard = null; pc2.destinations.clear(); pc2.members.clear(); pc2.channelId = null; pc2.selected = null; }
    const last = pcData.channels.some(c => c.id === pc2.channelId) ? pc2.channelId : pcData.channels[0]?.id;
    pc2.channelId = null;
    if (last) pc2SelectChannel(last, true);
    else { pc2.draft = []; pc2.original = []; pc2Render(); }
    pc2LoadTemplates();
}
function pc2SelectChannel(id, force = false) {
    if (!pcData || !pcData.channels.some(c => c.id === id)) return;
    if (!force && id !== pc2.channelId && pc2.changed && !confirm('Hay cambios de permisos sin guardar. ¿Descartarlos y cambiar de canal?')) return;
    if (id !== pc2.channelId || force) {
        pc2.channelId = id;
        pc2.original = pc2Clone(pc2CurrentChannel().overwrites.map(({id,type,allow,deny}) => ({id,type,allow,deny})));
        pc2.draft = pc2Clone(pc2.original);
        pc2.selected = pc2.draft.some(e => e.id === pcData.guild.id) ? pcData.guild.id : pc2.draft[0]?.id || pcData.guild.id;
    }
    pc2MarkDirty(); pc2Render();
}
function pc2Render() { pc2RenderChannels(); pc2RenderTargets(); pc2RenderFlags(); pc2MarkDirty(); }
function pc2RenderChannels() {
    const host = document.getElementById('pc2ChannelList'); if (!host || !pcData) return;
    const q = (document.getElementById('pc2ChannelSearch')?.value || '').toLowerCase();
    const all = [...pcData.channels].sort((a,b)=>a.position-b.position);
    const cats = all.filter(c=>c.type===4);
    const others = all.filter(c=>c.type!==4);
    const rows = [];
    const emit = (c,indented=false) => {
        if (q && !c.name.toLowerCase().includes(q)) return;
        const icon = ({0:'#',2:'🔊',4:'▰',5:'📣',13:'🎤',15:'▣',16:'▣'})[c.type] || '◈';
        rows.push(`<div class="pc2-item ${c.type===4?'pc2-category':''} ${c.id===pc2.channelId?'active':''}" style="${indented?'padding-left:20px;':''}">
            <input type="checkbox" title="Marcar como destino" aria-label="Aplicar a ${pc2E(c.name)}" ${pc2.destinations.has(c.id)?'checked':''} onchange="pc2ToggleDestination('${c.id}',this.checked)">
            <button class="pc2-item ${c.id===pc2.channelId?'active':''}" style="flex:1;min-width:0;padding:2px;" onclick="pc2SelectChannel('${c.id}')">
                <span>${icon}</span><span class="pc2-title">${pc2E(c.name)}</span><span class="pc2-tiny">${c.overwrites.length}</span>
            </button></div>`);
    };
    for (const c of cats) {
        if(!q || c.name.toLowerCase().includes(q) || others.some(o=>o.parentId===c.id && o.name.toLowerCase().includes(q))) {
            // Show the heading even if only one of its children matches the search.
            if (q && !c.name.toLowerCase().includes(q)) rows.push(`<div class="pc2-item pc2-category">▰ ${pc2E(c.name)}</div>`);
            else emit(c);
            for (const child of others.filter(o=>o.parentId===c.id)) emit(child,true);
        }
    }
    for (const c of others.filter(o=>!o.parentId || !cats.some(cat=>cat.id===o.parentId)))emit(c);
    host.innerHTML=rows.join('') || '<p class="pc2-muted">No hay coincidencias.</p>';
}
function pc2ToggleDestination(id, checked) { if (checked) pc2.destinations.add(id); else pc2.destinations.delete(id); pc2HideReview(); }
function pc2RenderTargets() {
    const host = document.getElementById('pc2Targets'), roles = document.getElementById('pc2AddRole');
    if (!host || !pcData || !pc2.channelId) return;
    const everyone = { id: pcData.guild.id, type:0, allow:[], deny:[] };
    const entries = [pc2.draft.find(e => e.id === everyone.id) || everyone, ...pc2.draft.filter(e=>e.id!==everyone.id)];
    host.innerHTML = entries.map(e => `<button class="pc2-item ${pc2.selected===e.id?'active':''}" onclick="pc2SelectTarget('${e.id}')">
        <span>${e.type===0?'♟':'👤'}</span><span class="pc2-title">${pc2E(pc2TargetLabel(e))}</span>
        <span class="pc2-tiny">${e.allow.length+e.deny.length} reglas</span>
    </button>`).join('');
    const previous = roles?.value;
    if (roles) {
        roles.innerHTML = '<option value="">Seleccionar rol...</option>' + pcData.roles.filter(r=>r.id!==pcData.guild.id)
            .map(r=>`<option value="${r.id}">${pc2E(r.name)}</option>`).join('');
        if (previous && [...roles.options].some(o=>o.value===previous)) roles.value=previous;
    }
    const current = pc2.draft.find(e=>e.id===pc2.selected) || (pc2.selected===pcData.guild.id ? everyone : null);
    const label = document.getElementById('pc2SelectedTarget');
    if (label) label.textContent = current ? 'Editando: '+pc2TargetLabel(current) : 'Selecciona un rol o usuario.';
}
function pc2SelectTarget(id) { pc2.selected=id; pc2RenderTargets(); pc2RenderFlags(); }
function pc2EnsureSelected() {
    if (!pc2.selected || !pcData) return null;
    let e = pc2.draft.find(item=>item.id===pc2.selected);
    if (!e) {
        let type=pcData.roles.some(r=>r.id===pc2.selected) ? 0 : 1;
        e={id:pc2.selected,type,allow:[],deny:[]}; pc2.draft.push(e);
    }
    return e;
}
function pc2AddRole() {
    const id = document.getElementById('pc2AddRole')?.value;
    if (!id || !pcData?.roles.some(r=>r.id===id)) return pc2Toast('Selecciona un rol.');
    pc2.selected=id; pc2EnsureSelected(); pc2MarkDirty(); pc2RenderTargets(); pc2RenderFlags();
}
async function pc2SearchMembers() {
    if (!pcData) return;
    const q=document.getElementById('pc2MemberQuery')?.value.trim();
    if (!q) return pc2Toast('Escribe un nombre o ID.');
    const host=document.getElementById('pc2MemberResults'); host.textContent='Buscando...';
    try {
        const result=await pcRequest(`/api/permission-center/${pc2.guildId}/members?query=${encodeURIComponent(q)}`);
        result.members.forEach(m=>pc2.members.set(m.id,m.name));
        host.innerHTML=result.members.map(m=>`<button class="pc2-item" onclick="pc2AddMember('${m.id}')">👤 ${pc2E(m.name)} <small>${pc2E(m.user)}</small></button>`).join('') || '<p class="pc2-muted">No se encontraron miembros.</p>';
    } catch(e) { host.textContent=e.message; }
}
function pc2AddMember(id) {
    if (!pc2.members.has(id)) return;
    pc2.selected=id;
    if (!pc2.draft.some(e=>e.id===id)) pc2.draft.push({id,type:1,allow:[],deny:[]});
    pc2MarkDirty(); pc2RenderTargets(); pc2RenderFlags();
}
function pc2AllowedGroups() {
    const c=pc2CurrentChannel();
    if (!c) return [];
    const voice=c.type===2 || c.type===13, category=c.type===4;
    return Object.entries(pc2Groups).filter(([group]) => group!=='Voz y actividades' || voice || category);
}
function pc2RenderFlags() {
    const host=document.getElementById('pc2Flags'); if (!host || !pcData || !pc2.channelId) return;
    const e=pc2.draft.find(x=>x.id===pc2.selected) || {id:pc2.selected,allow:[],deny:[]};
    const query=(document.getElementById('pc2FlagSearch')?.value || '').toLowerCase();
    const available=new Set(pcData.channelPermissions || pcData.permissions);
    let html='';
    for(const [group, flags] of pc2AllowedGroups()) {
        const rows=Object.entries(flags).filter(([flag,name])=>available.has(flag) && (flag.toLowerCase().includes(query)||name.toLowerCase().includes(query)));
        if (!rows.length) continue;
        html+=`<h4 class="pc2-perm-group">${pc2E(group)}</h4>`;
        for(const [flag,name] of rows) {
            const state=e.allow.includes(flag)?'allow':e.deny.includes(flag)?'deny':'neutral';
            html+=`<div class="pc2-perm-row"><span class="pc2-perm-name" title="${pc2E(flag)}">${pc2E(name)}</span>
                <div class="pc2-choice" role="group" aria-label="${pc2E(name)}">
                    <button class="deny ${state==='deny'?'active':''}" title="Denegar" aria-pressed="${state==='deny'}" onclick="pc2SetFlag('${flag}','deny')">✕</button>
                    <button class="neutral ${state==='neutral'?'active':''}" title="Neutral" aria-pressed="${state==='neutral'}" onclick="pc2SetFlag('${flag}','neutral')">／</button>
                    <button class="allow ${state==='allow'?'active':''}" title="Permitir" aria-pressed="${state==='allow'}" onclick="pc2SetFlag('${flag}','allow')">✓</button>
                </div></div>`;
        }
    }
    host.innerHTML=html || '<p class="pc2-muted">No hay permisos compatibles con la búsqueda.</p>';
}
function pc2SetFlag(flag,state) {
    const permitted=new Set(pcData?.channelPermissions || []);
    if(!permitted.has(flag)) return;
    const e=pc2EnsureSelected(); if(!e)return pc2Toast('Selecciona un rol o usuario.');
    e.allow=e.allow.filter(x=>x!==flag); e.deny=e.deny.filter(x=>x!==flag);
    if(state==='allow')e.allow.push(flag); if(state==='deny')e.deny.push(flag);
    e.allow.sort(); e.deny.sort(); pc2MarkDirty(); pc2RenderTargets(); pc2RenderFlags();
}
function pc2RemoveTarget() {
    if(!pc2.selected || !pc2.draft.some(e=>e.id===pc2.selected)) return pc2Toast('No hay sobrescritura para quitar.');
    if(!confirm('¿Quitar todas las sobrescrituras de este rol/usuario en el canal? Aún no se aplicará a Discord.'))return;
    pc2.draft=pc2.draft.filter(e=>e.id!==pc2.selected); pc2.selected=pcData.guild.id;
    pc2MarkDirty(); pc2RenderTargets(); pc2RenderFlags();
}
function pc2Discard() { if(pc2.changed && !confirm('¿Descartar los cambios pendientes?'))return; pc2.draft=pc2Clone(pc2.original); pc2MarkDirty(); pc2Render(); }
function pc2CopyTarget() {
    const e=pc2.draft.find(x=>x.id===pc2.selected);
    if(!e)return pc2Toast('Selecciona primero un rol o usuario con permisos.');
    pc2.clipboard={kind:'entry', guildId:pc2.guildId, content:pc2Clone(e)};
    pc2Toast('Permisos del rol/usuario copiados.',true);
}
function pc2PasteTarget() {
    if(!pc2.clipboard || pc2.clipboard.kind!=='entry' || pc2.clipboard.guildId!==pc2.guildId) return pc2Toast('Primero copia los permisos de un rol/usuario del mismo servidor.');
    if(!pc2.selected)return pc2Toast('Selecciona el rol/usuario de destino.');
    const entry=pc2EnsureSelected(); if(!entry)return;
    entry.allow=[...pc2.clipboard.content.allow];entry.deny=[...pc2.clipboard.content.deny];
    pc2MarkDirty(); pc2RenderTargets(); pc2RenderFlags(); pc2Toast('Permisos pegados en el borrador. Revisa antes de aplicar.',true);
}
function pc2CopyChannel() {
    if(!pc2.channelId)return pc2Toast('Selecciona un canal o categoría.');
    pc2.clipboard={kind:'channel',guildId:pc2.guildId,content:pc2Clone(pc2.draft)};
    pc2HideReview();
    pc2Toast('Canal copiado. Selecciona otros canales como destino para pegarlo.',true);
}
function pc2PasteChannel() {
    if(!pc2.clipboard || pc2.clipboard.kind!=='channel' || pc2.clipboard.guildId!==pc2.guildId)return pc2Toast('Primero copia un canal del mismo servidor.');
    if(!confirm('Esto reemplazará el borrador completo del canal seleccionado. No se enviará nada a Discord hasta confirmar.'))return;
    pc2.draft=pc2Clone(pc2.clipboard.content);
    pc2.selected=pc2.draft[0]?.id || pcData.guild.id;
    pc2MarkDirty();pc2Render();
}
function pc2MakePrivate() {
    if(!pc2.channelId || !pcData)return;
    const select=document.getElementById('pc2AddRole'); const roleId=select?.value || pcData.roles.find(r=>['comprador','compradores'].includes(r.name.toLowerCase()))?.id;
    if(!roleId)return pc2Toast('Selecciona el rol permitido en «Añadir rol» (por ejemplo Comprador).');
    if(!confirm('¿Preparar un canal privado que oculte el canal a @everyone y lo muestre al rol seleccionado? Otros roles con acceso y administradores pueden seguir viéndolo.'))return;
    function change(id,type,flag,state) {
        let e=pc2.draft.find(x=>x.id===id);
        if(!e){e={id,type,allow:[],deny:[]};pc2.draft.push(e);}
        e.allow=e.allow.filter(x=>x!==flag);e.deny=e.deny.filter(x=>x!==flag);e[state].push(flag);
    }
    change(pcData.guild.id,0,'ViewChannel','deny');change(roleId,0,'ViewChannel','allow');
    pc2.selected=roleId; pc2MarkDirty();pc2Render();pc2Toast('Privacidad preparada. Revisa todos los roles antes de guardar.',true);
}
async function pc2LoadTemplates() {
    if(!pc2.guildId)return;
    const requested=pc2.guildId;
    try {
        const data=await pcRequest(`/api/permission-center/${requested}/templates`);
        if(pc2.guildId!==requested)return;
        pc2.templates=data.templates;
        const select=document.getElementById('pc2TemplateSelect'); if(!select)return;
        const old=select.value;
        select.innerHTML='<option value="">Seleccionar plantilla...</option>'+data.templates.map(t=>`<option value="${pc2E(t.id)}">${pc2E(t.name)}${t.missingRole?' (falta rol Comprador)':''}</option>`).join('');
        if(data.templates.some(t=>t.id===old))select.value=old;
    }catch(e){pc2Toast('Plantillas: '+e.message);}
}
async function pc2SaveTemplate() {
    if(!pcData || !pc2.draft.length)return pc2Toast('Configura primero los permisos del canal.');
    const name=prompt('Nombre para la nueva plantilla:'); if(!name)return;
    try {
        const data=await pcRequest(`/api/permission-center/${pc2.guildId}/templates`,{method:'POST',body:JSON.stringify({name,overwrites:pc2.draft})});
        await pc2LoadTemplates();document.getElementById('pc2TemplateSelect').value=data.template.id;
        pc2Toast('Plantilla guardada en el servidor.',true);
    }catch(e){alert(e.message);}
}
async function pc2RenameTemplate() {
    const id=document.getElementById('pc2TemplateSelect')?.value;
    const t=pc2.templates.find(x=>x.id===id);if(!t || t.builtIn)return pc2Toast('Selecciona una plantilla guardada (no la predeterminada).');
    const name=prompt('Nuevo nombre de plantilla:',t.name);if(!name)return;
    try{await pcRequest(`/api/permission-center/${pc2.guildId}/templates/${encodeURIComponent(id)}`,{method:'PATCH',body:JSON.stringify({name})});await pc2LoadTemplates();pc2Toast('Plantilla renombrada.',true);}
    catch(e){alert(e.message);}
}
async function pc2DeleteTemplate() {
    const id=document.getElementById('pc2TemplateSelect')?.value;
    const t=pc2.templates.find(x=>x.id===id);if(!t || t.builtIn)return pc2Toast('Selecciona una plantilla guardada (no la predeterminada).');
    if(!confirm(`¿Eliminar la plantilla «${t.name}»?`))return;
    try{await pcRequest(`/api/permission-center/${pc2.guildId}/templates/${encodeURIComponent(id)}`,{method:'DELETE'});await pc2LoadTemplates();pc2Toast('Plantilla eliminada.',true);}
    catch(e){alert(e.message);}
}
async function pc2PreviewSingle() {
    if(!pcData || !pc2.channelId)return pc2Toast('Selecciona un canal.');
    await pc2Preview({targetChannelIds:[pc2.channelId],overwrites:pc2.draft,mode:'replace-all'});
}
async function pc2PreviewBatch() {
    if(!pcData)return;
    const targets=[...pc2.destinations];if(!targets.length)return pc2Toast('Marca los canales de destino en la primera columna.');
    const id=document.getElementById('pc2TemplateSelect')?.value;
    const mode=document.getElementById('pc2BatchMode')?.value || 'merge';
    if(id) await pc2Preview({targetChannelIds:targets,templateId:id,mode});
    else if(pc2.clipboard?.kind==='channel' && pc2.clipboard.guildId===pc2.guildId)
        await pc2Preview({targetChannelIds:targets,overwrites:pc2.clipboard.content,mode});
    else pc2Toast('Selecciona una plantilla o copia primero los permisos de un canal/categoría.');
}
async function pc2Preview(payload) {
    pc2HideReview();
    const host=document.getElementById('pc2Review');host.hidden=false;host.textContent='Consultando estado actual de Discord...';
    try {
        const preview=await pcRequest(`/api/permission-center/${pc2.guildId}/permissions/preview`,{method:'POST',body:JSON.stringify(payload)});
        pc2.prepared={guildId:pc2.guildId,payload,preview};
        const names=id=> {const role=pcData.roles.find(r=>r.id===id);const member=pc2.members.get(id);return pc2E(role?.name || member || id);};
        const detail=preview.targets.map(t=>{
            const parts=[];
            for(const [label,ids] of [['Añadidos',t.changes.added],['Modificados',t.changes.changed],['Eliminados',t.changes.removed]]) if(ids.length)parts.push(`${label}: ${ids.map(names).join(', ')}`);
            return `<div class="pc2-perm-row" style="display:block;"><strong>${pc2E(t.name)} ${t.changed?'— cambia':'— sin cambios'}</strong><p class="pc2-muted">${parts.join(' · ') || 'Sin diferencias'} · ${t.before} → ${t.after} sobrescrituras</p></div>`;
        }).join('');
        const risk=payload.mode==='replace-all'?'Reemplazo completo: se pueden eliminar sobrescrituras de roles/usuarios no incluidos.':payload.mode==='replace-selected'?'Reemplaza los permisos de cada rol/usuario incluido; mantiene los demás.':'Combina los permisos seleccionados sin limpiar permisos neutrales.';
        host.innerHTML=`<h3>Vista previa · ${preview.targets.length} canal(es)</h3>${detail}
            <p class="pc2-warning">⚠ ${pc2E(risk)}</p><p class="pc2-warning">⚠ Los usuarios con Administrator pueden acceder a canales privados. Discord no puede garantizar una operación atómica entre varios canales.</p>
            <button class="btn-primary" onclick="pc2ApplyPrepared()">Confirmar y aplicar cambios</button><button class="btn-secondary" onclick="pc2HideReview()">Cancelar</button>`;
        host.scrollIntoView({behavior:'smooth',block:'nearest'});
    } catch(e) { host.innerHTML=`<p class="pc2-warning">${pc2E(e.message)}</p><button class="btn-secondary" onclick="pc2HideReview()">Cerrar</button>`; }
}
async function pc2ApplyPrepared() {
    const prepared=pc2.prepared;
    if(!prepared || prepared.guildId!==pc2.guildId)return pc2Toast('La vista previa ya no es válida.');
    if(!confirm(`¿APLICAR en Discord los permisos a ${prepared.preview.targets.length} canal(es)? Esta operación puede revocar accesos y no tiene deshacer automático.`))return;
    const hashes=Object.fromEntries(prepared.preview.targets.map(t=>[t.id,t.hash]));
    const host=document.getElementById('pc2Review');
    host.textContent='Aplicando cambios en Discord...';pc2.prepared=null;
    try {
        const data=await pcRequest(`/api/permission-center/${pc2.guildId}/permissions/apply`,{method:'POST',body:JSON.stringify({...prepared.payload,expected:hashes,confirm:'APLICAR'})});
        const successes=data.results.filter(x=>x.ok).length,errors=data.results.filter(x=>!x.ok);
        if(errors.length){
            // Keep the unsaved draft/clipboard for correction and a new preview.
            const failure = errors.map(x=>`${x.id}: ${x.error}`).join(' · ');
            host.innerHTML = `<h3>Aplicación parcial (${successes} correctos)</h3><p class="pc2-warning">${pc2E(failure)}</p><p class="pc2-muted">El borrador se conserva. Comprueba los canales en Discord y vuelve a revisar los cambios antes de aplicar otra vez.</p><button class="btn-secondary" onclick="pc2HideReview()">Cerrar</button>`;
            pc2Toast(`Aplicación parcial: ${successes} correctos, ${errors.length} no aplicados.`);
        } else {
            pc2.changed = false;
            pc2Toast('Cambios aplicados y registrados en Discord.',true);
            await pcLoadGuild();
        }
    } catch(e) { host.textContent='No se pudieron confirmar los cambios: '+e.message; }
}

// Category synchronization is reviewed as a replace-all preview, never silently applied.
async function pc2SyncCategory(channelId) {
    if(!pcData)return;
    const target=pcData.channels.find(c=>c.id===channelId);
    const category=pcData.channels.find(c=>c.id===target?.parentId && c.type===4);
    if(!target || !category)return pc2Toast('El canal no pertenece a una categoría.');
    if(pc2.changed && !confirm('Hay cambios pendientes. ¿Continuar con la sincronización de categoría sin guardarlos?'))return;
    await pc2Preview({targetChannelIds:[target.id],overwrites:category.overwrites,mode:'replace-all'});
    document.getElementById('pc2Review')?.scrollIntoView({behavior:'smooth',block:'center'});
}
