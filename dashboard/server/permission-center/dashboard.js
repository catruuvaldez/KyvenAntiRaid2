'use strict';

        // ==========================================================
        // KYVEN PERMISSION CONTROL CENTER (módulo integrado)
        // ==========================================================
        let pcData = null;
        let pcSelectedRoleId = null;
        let pcSelectedChannelId = null;
        let pcBusy = false;
        const pcDangerFlags = ['Administrator','ManageGuild','ManageRoles','ManageChannels','ManageWebhooks','ManageMessages','MentionEveryone','BanMembers','KickMembers'];

        async function pcRequest(path, options = {}) {
            const response = await fetch(path, {
                credentials: 'same-origin',
                ...options,
                headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'No se pudo completar la solicitud.');
            return data;
        }
        function pcSetStatus(text, bad = false) {
            const el = document.getElementById('pcStatus');
            if (el) { el.textContent = text; el.style.color = bad ? '#fca5a5' : 'var(--text-secondary)'; }
        }
        async function pcLoad() {
            if (pcBusy) return;
            pcBusy = true; pcSetStatus('Cargando servidores...');
            try {
                const data = await pcRequest('/api/permission-center/guilds');
                const select = document.getElementById('pcGuild');
                const previous = select.value;
                select.innerHTML = '<option value="">Selecciona un servidor</option>' + data.guilds.map(g =>
                    `<option value="${escaparHtml(g.id)}">${escaparHtml(g.name)}${g.canManageRoles && g.canManageChannels ? '' : ' — permisos del bot limitados'}</option>`
                ).join('');
                if (data.guilds.some(g => g.id === previous)) select.value = previous;
                if (!select.value && data.guilds.length) select.value = data.guilds[0].id;
                if (!data.guilds.length) pcSetStatus('No hay servidores disponibles', true);
                else await pcLoadGuild();
            } catch (e) { pcSetStatus(e.message, true); }
            finally { pcBusy = false; }
        }
        async function pcLoadGuild() {
            const guildId = document.getElementById('pcGuild')?.value;
            if (!guildId) return;
            pcSetStatus('Sincronizando Discord...');
            try {
                pcData = await pcRequest('/api/permission-center/' + encodeURIComponent(guildId));
                document.getElementById('pcRoleCount').textContent = pcData.roles.length;
                document.getElementById('pcChannelCount').textContent = pcData.channels.length;
                document.getElementById('pcBotPerms').textContent = (pcData.bot.canManageRoles ? 'Roles ✓' : 'Roles ✕') + ' / ' + (pcData.bot.canManageChannels ? 'Canales ✓' : 'Canales ✕');
                pcRenderRoles(); pcRenderChannels();
                pcSetStatus('Sincronizado · ' + pcData.guild.name);
            } catch (e) { pcSetStatus(e.message, true); }
        }
        function pcRenderRoles() {
            const host = document.getElementById('pcRolesList'); if (!host || !pcData) return;
            const q = (document.getElementById('pcRoleSearch')?.value || '').toLowerCase();
            host.innerHTML = pcData.roles.filter(r => r.name.toLowerCase().includes(q)).map(r => {
                const locked = r.managed || r.id === pcData.guild.id || r.position >= pcData.bot.highestRolePosition;
                const dangerous = r.permissions.filter(p => pcDangerFlags.includes(p));
                return `<button class="nav-item" style="text-align:left;display:block;border:1px solid ${r.id===pcSelectedRoleId?'rgba(168,85,247,.6)':'var(--border-subtle)'};padding:10px;" onclick="pcSelectRole('${r.id}')">
                    <span style="display:flex;justify-content:space-between;gap:8px;"><strong><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:${r.color};margin-right:7px;"></span>${escaparHtml(r.name)}</strong><small>#${r.position}</small></span>
                    <small style="color:var(--text-muted);">${locked?'Protegido / jerarquía':(r.managed?'Administrado':'Editable')} · ${r.permissions.length} permisos ${dangerous.length?'· ⚠ '+dangerous.length+' sensibles':''}</small>
                </button>`;
            }).join('') || '<p style="color:var(--text-muted);padding:10px;">No se encontraron roles.</p>';
        }
        function pcSelectRole(id) {
            pcSelectedRoleId = id; pcSelectedChannelId = null;
            const r = pcData.roles.find(x => x.id === id); if (!r) return;
            const locked = r.managed || r.id === pcData.guild.id || r.position >= pcData.bot.highestRolePosition;
            document.getElementById('pcDetailTitle').textContent = 'Editar rol · ' + r.name;
            document.getElementById('pcDetail').innerHTML = `
                <div style="display:grid;grid-template-columns:1fr 120px;gap:10px;">
                    <label>Nombre<input id="pcRoleName" class="input-field no-icon" value="${escaparHtml(r.name)}"></label>
                    <label>Color<input id="pcRoleColor" type="color" class="input-field" value="${/^#[0-9a-f]{6}$/i.test(r.color)?r.color:'#8b5cf6'}" style="height:40px;padding:4px;"></label>
                </div>
                <label style="display:flex;gap:8px;align-items:center;margin:12px 0;"><input id="pcRoleHoist" type="checkbox" ${r.hoist?'checked':''}> Mostrar separado en la lista</label>
                <label style="display:flex;gap:8px;align-items:center;margin:12px 0;"><input id="pcRoleMention" type="checkbox" ${r.mentionable?'checked':''}> Permitir mencionar este rol</label>
                <h3 style="margin:16px 0 8px;">Permisos del rol</h3>
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:7px;max-height:310px;overflow:auto;">
                ${pcData.permissions.map(p=>`<label style="display:flex;gap:7px;align-items:center;padding:5px;background:rgba(255,255,255,.025);border-radius:6px;"><input type="checkbox" class="pc-role-flag" value="${p}" ${r.permissions.includes(p)?'checked':''} ${locked?'disabled':''}><span>${p}</span>${pcDangerFlags.includes(p)?'<small style="color:#fbbf24;">⚠</small>':''}</label>`).join('')}
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;">
                    <button class="btn-primary" style="width:auto;" onclick="pcSaveRole('${r.id}')" ${locked?'disabled':''}>Guardar cambios</button>
                    <button class="btn-danger-ghost" onclick="pcDeleteRole('${r.id}')" ${locked?'disabled':''}>Eliminar rol</button>
                </div>
                ${locked?'<p style="color:#fbbf24;margin-top:10px;">Este rol está protegido por la jerarquía de Discord o pertenece a una integración.</p>':''}`;
            pcRenderRoles();
        }
        async function pcSaveRole(id) {
            const permissions = [...document.querySelectorAll('.pc-role-flag:checked')].map(x=>x.value);
            if (permissions.includes('Administrator') && !confirm('⚠️ Este rol tendrá ADMINISTRADOR TOTAL en Discord. ¿Confirmas este riesgo?')) return;
            if (!confirm('Aplicar los cambios a este rol en Discord?')) return;
            try {
                await pcRequest(`/api/permission-center/${pcData.guild.id}/roles/${id}`, {method:'PATCH',body:JSON.stringify({
                    name:document.getElementById('pcRoleName').value,
                    color:document.getElementById('pcRoleColor').value,
                    hoist:document.getElementById('pcRoleHoist').checked,
                    mentionable:document.getElementById('pcRoleMention').checked,
                    permissions
                })});
                mostrarToast('Rol actualizado',true); await pcLoadGuild();
            } catch(e) { alert(e.message); }
        }
        async function pcCreateRole() {
            if (!pcData) return alert('Selecciona primero un servidor.');
            const name = prompt('Nombre del nuevo rol:'); if (!name) return;
            if (!confirm(`Crear el rol "${name}" en ${pcData.guild.name}?`)) return;
            try { await pcRequest(`/api/permission-center/${pcData.guild.id}/roles`,{method:'POST',body:JSON.stringify({name,permissions:[]})}); await pcLoadGuild(); }
            catch(e){alert(e.message);}
        }
        async function pcDeleteRole(id) {
            const r=pcData.roles.find(x=>x.id===id); if(!r)return;
            if(!confirm(`Eliminar definitivamente el rol "${r.name}"? Esta acción no se puede deshacer.`))return;
            try { await pcRequest(`/api/permission-center/${pcData.guild.id}/roles/${id}`,{method:'DELETE'}); pcSelectedRoleId=null; await pcLoadGuild(); }
            catch(e){alert(e.message);}
        }
        function pcRenderChannels() {
            const host=document.getElementById('pcChannelsList'); if(!host||!pcData)return;
            const q=(document.getElementById('pcChannelSearch')?.value||'').toLowerCase();
            const types={0:'#',2:'🔊',4:'▰',5:'▤',13:'◉',15:'▣'};
            host.innerHTML=pcData.channels.filter(c=>c.name.toLowerCase().includes(q)).map(c=>{
                const category=c.type===4, parent=pcData.channels.find(x=>x.id===c.parentId);
                return `<button class="nav-item" style="display:block;text-align:left;border:1px solid var(--border-subtle);padding:10px;" onclick="pcSelectChannel('${c.id}')">
                    <strong>${types[c.type]||'◈'} ${escaparHtml(c.name)}</strong>
                    <small style="display:block;color:var(--text-muted);">${category?'Categoría':(parent?'En '+escaparHtml(parent.name):'Sin categoría')} · ${c.overwrites.length} excepciones</small>
                </button>`;
            }).join('')||'<p style="color:var(--text-muted);">No hay coincidencias.</p>';
        }
        function pcSelectChannel(id) {
            pcSelectedChannelId=id; pcSelectedRoleId=null;
            const c=pcData.channels.find(x=>x.id===id);if(!c)return;
            const parentOptions=pcData.channels.filter(x=>x.type===4).map(x=>`<option value="${x.id}" ${x.id===c.parentId?'selected':''}>${escaparHtml(x.name)}</option>`).join('');
            document.getElementById('pcDetailTitle').textContent='Canal · '+c.name;
            document.getElementById('pcDetail').innerHTML=`
                <label>Nombre<input id="pcChannelName" class="input-field no-icon" value="${escaparHtml(c.name)}"></label>
                ${c.type===0?`<label style="display:block;margin-top:10px;">Tema<textarea id="pcChannelTopic" class="input-field no-icon">${escaparHtml(c.topic||'')}</textarea></label>`:''}
                ${c.type!==4?`<label style="display:block;margin-top:10px;">Categoría<select id="pcChannelParent" class="select-pro" style="width:100%;margin-top:5px;"><option value="">Sin categoría</option>${parentOptions}</select></label>`:''}
                <div style="display:flex;gap:8px;margin-top:14px;flex-wrap:wrap;">
                    <button class="btn-primary" style="width:auto;" onclick="pcSaveChannel('${c.id}')">Guardar canal</button>
                    <button class="btn-secondary" onclick="pcEditOverwrite('${c.id}')">Permisos por rol</button>
                    <button class="btn-danger-ghost" onclick="pcDeleteChannel('${c.id}')">Eliminar</button>
                </div>`;
            pcRenderChannels();
        }
        async function pcSaveChannel(id) {
            const body={name:document.getElementById('pcChannelName').value};
            const topic=document.getElementById('pcChannelTopic');if(topic)body.topic=topic.value;
            const parent=document.getElementById('pcChannelParent');if(parent)body.parentId=parent.value;
            if(!confirm('Aplicar los cambios a este canal?'))return;
            try{await pcRequest(`/api/permission-center/${pcData.guild.id}/channels/${id}`,{method:'PATCH',body:JSON.stringify(body)});await pcLoadGuild();}
            catch(e){alert(e.message);}
        }
        async function pcCreateChannel() {
            if(!pcData)return alert('Selecciona primero un servidor.');
            const name=prompt('Nombre del canal o categoría:');if(!name)return;
            const type=prompt('Tipo: escribe text, voice o category','text');if(!['text','voice','category'].includes(type))return alert('Tipo no válido.');
            const parentId=type==='category'?'':(prompt('ID de categoría (opcional):')||'');
            if(!confirm(`Crear ${type} "${name}" en ${pcData.guild.name}?`))return;
            try{await pcRequest(`/api/permission-center/${pcData.guild.id}/channels`,{method:'POST',body:JSON.stringify({name,type,parentId})});await pcLoadGuild();}
            catch(e){alert(e.message);}
        }
        async function pcDeleteChannel(id) {
            const c=pcData.channels.find(x=>x.id===id);if(!c)return;
            if(!confirm(`Eliminar definitivamente #${c.name}?`))return;
            try{await pcRequest(`/api/permission-center/${pcData.guild.id}/channels/${id}`,{method:'DELETE'});await pcLoadGuild();}
            catch(e){alert(e.message);}
        }
        async function pcEditOverwrite(channelId) {
            const channel=pcData.channels.find(x=>x.id===channelId);
            const roleName=prompt('Escribe el nombre exacto del rol para configurar permisos:');
            const role=pcData.roles.find(x=>x.name.toLowerCase()===String(roleName||'').toLowerCase());
            if(!role)return alert('No se encontró ese rol.');
            const current=channel.overwrites.find(x=>x.id===role.id);
            const allowed=(current?.allow||[]).join(', ');
            const denied=(current?.deny||[]).join(', ');
            const allowText=prompt('Permisos ALLOW separados por coma (nombres Discord). Vacío = ninguno:',allowed);if(allowText===null)return;
            const denyText=prompt('Permisos DENY separados por coma. Vacío = ninguno:',denied);if(denyText===null)return;
            const allow=allowText.split(',').map(x=>x.trim()).filter(Boolean),deny=denyText.split(',').map(x=>x.trim()).filter(Boolean);
            if(!confirm(`Guardar excepciones para ${role.name} en #${channel.name}?`))return;
            try{await pcRequest(`/api/permission-center/${pcData.guild.id}/channels/${channelId}/permissions`,{method:'PUT',body:JSON.stringify({roleId:role.id,allow,deny})});await pcLoadGuild();}
            catch(e){alert(e.message);}
        }
        
