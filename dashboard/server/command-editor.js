'use strict';

(() => {
    const stagedCommandActions = new Map();
    const originalCommandCodes = new Map();
    let files = [];
    let selected = '';
    let editor = null;
    let pendingLeave = '';
    let boot = null;
    let loading = false;
    const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
    const post = (url, body = {}) => fetch(url, { method:'POST', credentials:'same-origin', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body) });
    const getAction = file => [...stagedCommandActions.values()].find(a => a.filename === file || a.oldFilename === file);
    const codeFor = file => { const a=getAction(file); if(a) return a.type==='delete'?null:a.code; return originalCommandCodes.has(file)?originalCommandCodes.get(file):null; };
    const notify = text => window.mostrarToast ? window.mostrarToast(text, true) : console.info(text);
    function count() { document.getElementById('stagedCount').textContent=stagedCommandActions.size; const badge=document.getElementById('stagedCountBadge'); badge.textContent=stagedCommandActions.size; badge.style.display=stagedCommandActions.size?'inline-flex':'none'; render(); }
    async function list() {
        const res=await post('/api/command-list'); if(!res.ok){notify('Sesión administrativa vencida');return;}
        files=(await res.json()).files||[];
        const category=document.getElementById('commandCategory'), keep=category.value;
        category.innerHTML='<option value="">Todas las categorías</option>';
        [...new Set(files.map(f=>f.category))].forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;category.appendChild(o);});category.value=keep;
        render();
    }
    function render() {
        const wrap=document.getElementById('commandFileList'); if(!wrap)return;
        const q=(document.getElementById('commandSearch')?.value||'').toLowerCase(), c=document.getElementById('commandCategory')?.value||'';
        wrap.innerHTML=files.filter(f=>f.path.toLowerCase().includes(q)&&(!c||c===f.category)).map(f=>{
            const dirty=Boolean(getAction(f.path));
            return `<button class="btn-secondary" style="width:100%;text-align:left;margin:2px 0;${selected===f.path?'border-color:#a855f7;':''}" onclick="CommandEditor.select('${esc(f.path)}')">${esc(f.path)}${dirty?'<small style="display:block;color:#d8b4fe">Modificado en Borrador</small>':''}</button>`;
        }).join('')||'<div style="padding:8px;color:var(--text-muted)">Sin archivos</div>';
    }
    function startEditor() {
        if(editor||loading||!window.require)return; loading=true;
        window.require.config({paths:{vs:'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs'}});
        window.require(['vs/editor/editor.main'],()=>{
            editor=monaco.editor.create(document.getElementById('commandEditor'),{value:'',language:'javascript',theme:'vs-dark',automaticLayout:true,minimap:{enabled:false},fontSize:13});
            editor.onDidChangeModelContent(()=>updateDraft());loading=false;
            if(selected&&codeFor(selected)!==null)editor.setValue(codeFor(selected));
        },()=>{loading=false;notify('No se pudo cargar Monaco Editor');});
    }
    async function select(file) {
        selected=file; let code=codeFor(file);
        if(code===null&&!getAction(file)) { const res=await post('/api/command-read',{path:file}), data=await res.json(); if(!res.ok)return notify(data.error||'No se pudo leer'); code=data.code; originalCommandCodes.set(file,code); }
        render();startEditor();if(editor)editor.setValue(code||'');
    }
    function updateDraft() {
        if(!selected||!editor)return; const code=editor.getValue(), action=getAction(selected);
        if(action){action.code=code;if(action.type==='modify'&&code===action.oldCode)stagedCommandActions.delete(action.oldFilename);}
        else {const old=originalCommandCodes.get(selected);if(old!==undefined&&old!==code)stagedCommandActions.set(selected,{type:'modify',filename:selected,oldFilename:selected,oldCode:old,code});}
        count();
    }
    function pathFrom(value, dir='commands') {
        let p=String(value||'').trim().replace(/\\/g,'/');if(!p.includes('/'))p=dir+'/'+p;if(!p.endsWith('.js'))p+='.js';
        return /^(commands|interactions|security|systems|dashboard\/(interactions|security|systems))\/[A-Za-z0-9._/-]+\.js$/.test(p)&&!p.split('/').includes('..')?p:null;
    }
    function ask(title, initial='') { return new Promise(resolve=>{const modal=document.createElement('div');modal.className='modal-overlay';modal.style.display='flex';modal.innerHTML=`<div class="modal-box" style="background:#110e1c;border:1px solid rgba(168,85,247,.4)"><h3 style="margin-bottom:12px">${esc(title)}</h3><input id="cmdEditInput" class="input-pro" style="width:100%;margin-bottom:14px" value="${esc(initial)}"><div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn-secondary" data-no>Cancelar</button><button class="btn-primary" data-yes>Continuar</button></div></div>`;document.body.appendChild(modal);const done=v=>{modal.remove();resolve(v);};modal.querySelector('[data-no]').onclick=()=>done(null);modal.querySelector('[data-yes]').onclick=()=>done(modal.querySelector('input').value.trim());modal.querySelector('input').onkeydown=e=>{if(e.key==='Enter')done(e.target.value.trim());if(e.key==='Escape')done(null);};modal.querySelector('input').focus();}); }
    async function create() {
        const p=pathFrom(await ask('Nombre/ruta del nuevo comando','commands/nuevo.js'));if(!p)return notify('Ruta .js no válida');if(files.some(f=>f.path===p)||getAction(p))return notify('Ese archivo ya existe');
        const code="'use strict';\n\nmodule.exports = {\n    data: { toJSON: () => ({ name: 'nuevo', description: 'Nuevo comando' }) },\n    async execute(interaction) {\n        // Implementa el comando aquí\n    }\n};\n";
        stagedCommandActions.set(p,{type:'create',filename:p,oldFilename:null,oldCode:'',code});files.push({path:p,filename:p.split('/').pop(),category:p.split('/')[0]});selected=p;count();startEditor();if(editor)editor.setValue(code);
    }
    async function duplicate() {
        if(!selected)return notify('Selecciona un archivo primero');const code=codeFor(selected);if(code===null)return;
        const p=pathFrom(await ask('Ruta de la copia',selected.replace(/\.js$/,'.copy.js')));if(!p)return;if(files.some(f=>f.path===p)||getAction(p))return notify('Ese archivo ya existe');
        stagedCommandActions.set(p,{type:'create',filename:p,oldFilename:null,oldCode:'',code});files.push({path:p,filename:p.split('/').pop(),category:p.split('/')[0]});count();
    }
    async function rename() {
        if(!selected)return notify('Selecciona un archivo primero');const oldPath=selected, dir=oldPath.split('/')[0], p=pathFrom(await ask('Nueva ruta',oldPath),dir);if(!p||p===oldPath)return;if(files.some(f=>f.path===p)||getAction(p))return notify('Ese archivo ya existe');
        let code=codeFor(oldPath), prior=getAction(oldPath), sourcePath=oldPath, base=originalCommandCodes.get(oldPath)||code;
        if(prior?.type==='create'){stagedCommandActions.delete(prior.filename);prior.filename=p;stagedCommandActions.set(p,prior);}
        else {if(prior?.type==='rename'){sourcePath=prior.oldFilename;base=prior.oldCode;code=prior.code;stagedCommandActions.delete(oldPath);}const oldName=sourcePath.split('/').pop().replace(/\.js$/,''), newName=p.split('/').pop().replace(/\.js$/,'');const escaped=oldName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const renamed=code.replace(new RegExp("(\\.setName\\(\\s*['\\\"])"+escaped+"(['\\\"]\\s*\\))",'g'),'$1'+newName+'$2');stagedCommandActions.set(sourcePath,{type:'rename',filename:p,oldFilename:sourcePath,oldCode:base,code:renamed});}
        files.push({path:p,filename:p.split('/').pop(),category:p.split('/')[0]});selected=p;count();startEditor();if(editor)editor.setValue(codeFor(p)||'');
    }
    function remove() {
        if(!selected)return notify('Selecciona un archivo primero');const a=getAction(selected);
        if(a?.type==='create'){stagedCommandActions.delete(a.filename);files=files.filter(f=>f.path!==a.filename);}else if(a?.type==='rename'){stagedCommandActions.delete(a.oldFilename);stagedCommandActions.set(a.oldFilename,{type:'delete',filename:a.oldFilename,oldFilename:a.oldFilename,oldCode:a.oldCode,code:''});}else stagedCommandActions.set(selected,{type:'delete',filename:selected,oldFilename:selected,oldCode:originalCommandCodes.get(selected)||a?.oldCode||'',code:''});
        selected='';if(editor)editor.setValue('');count();
    }
    function review() {
        if(!stagedCommandActions.size)return notify('No hay cambios pendientes');const wrap=document.getElementById('commandDiffList');wrap.innerHTML='';
        for(const a of stagedCommandActions.values()){
            const div=document.createElement('div');div.style.cssText='padding:12px;margin:8px 0;background:#0b0912;border:1px solid rgba(168,85,247,.2);border-radius:10px';
            const title=a.type==='delete'?`🗑️ Eliminaste el comando ${a.oldFilename}`:a.type==='rename'?`✏️ Renombraste el comando ${a.oldFilename} a ${a.filename}`:a.type==='create'?`✨ Creaste el comando ${a.filename}`:`Modificaste ${a.filename}`;
            div.innerHTML=`<strong>${esc(title)}</strong>`;
            if(['modify','rename'].includes(a.type)){const before=(a.oldCode||'').split('\n'),after=(a.code||'').split('\n');let diff='';for(let i=0;i<Math.max(before.length,after.length);i++)if(before[i]!==after[i]){if(before[i]!==undefined)diff+=`<div style="color:#f87171;text-decoration:line-through">- ${i+1}: ${esc(before[i])}</div>`;if(after[i]!==undefined)diff+=`<div style="color:#4ade80">+ ${i+1}: ${esc(after[i])}</div>`;}div.innerHTML+=`<pre style="white-space:pre-wrap;margin-top:8px">${diff||'Sin diferencias de contenido'}</pre>`;}
            if(a.type==='create')div.innerHTML+=`<pre style="white-space:pre-wrap;max-height:180px;overflow:auto">${esc(a.code)}</pre>`;wrap.appendChild(div);
        }
        document.getElementById('commandReviewModal').style.display='flex';
    }
    function leave(module) { pendingLeave=module;review(); }
    function closeReview(){document.getElementById('commandReviewModal').style.display='none';}
    async function discard(){stagedCommandActions.clear();selected='';if(editor)editor.setValue('');count();closeReview();await list();if(pendingLeave){const next=pendingLeave;pendingLeave='';window.switchModule(next,true);}}
    async function apply() {
        const actions=[...stagedCommandActions.values()];if(!actions.length)return;const overlay=document.getElementById('rebuildOverlay');overlay.style.display='flex';closeReview();
        try{const ping=await fetch('/api/server-ping');boot=await ping.json();}catch(_){}
        try{const res=await post('/api/commands-batch-commit',{actions}),data=await res.json();if(!res.ok){overlay.style.display='none';return notify(data.error||'No se pudo aplicar el lote');}
            stagedCommandActions.clear();count();const start=Date.now();let restarted=false;
            while(Date.now()-start<300000){await new Promise(r=>setTimeout(r,2000));try{const r=await fetch('/api/server-ping');if(r.status===401){restarted=true;break;}const p=await r.json();if(boot&&(p.bootTimestamp!==boot.bootTimestamp||p.uptime<boot.uptime)){restarted=true;break;}}catch(_){restarted=true;}if(restarted)break;}
            document.getElementById('rebuildMessage').textContent=restarted?'🔒 Servidor Reiniciado — Sesión Vencida por Rebuild Automático':'Commit publicado; el servidor aún no informó un reinicio.';document.getElementById('rebuildLogin').style.display='inline-flex';
        }catch(_){overlay.style.display='none';notify('Error de conexión al aplicar cambios');}
    }
    window.CommandEditor={open(){startEditor();if(!files.length)list();},hasChanges(){return stagedCommandActions.size>0;},requestLeave:leave,select,filter:render,save(){if(editor)updateDraft();notify('Cambios guardados en el borrador');},create,duplicate,rename,remove,review,closeReview,discard,apply};
    window.discardStagedCommands=discard;window.closeCommandReview=closeReview;window.applyStagedCommands=apply;
    window.addEventListener('DOMContentLoaded',()=>{
        document.getElementById('commandSearch').addEventListener('input',render);document.getElementById('commandCategory').addEventListener('change',render);
        document.querySelector('#view-commands .section-card > div').innerHTML=`<input id="commandSearch" class="input-pro" placeholder="Buscar archivo…" style="max-width:220px"><select id="commandCategory" class="select-pro"><option value="">Todas las categorías</option></select><button class="btn-secondary" onclick="CommandEditor.create()">+ Crear Comando</button><button class="btn-secondary" onclick="CommandEditor.duplicate()">Duplicar</button><button class="btn-secondary" onclick="CommandEditor.rename()">Renombrar</button><button class="btn-secondary" onclick="CommandEditor.remove()">Eliminar</button><button class="btn-primary" onclick="CommandEditor.save()">Guardar en Borrador</button><button class="btn-primary" onclick="CommandEditor.review()">Revisar y Aplicar Cambios (<span id="stagedCount">0</span>)</button>`;
        document.getElementById('commandSearch').addEventListener('input',render);document.getElementById('commandCategory').addEventListener('change',render);
        document.querySelector('#commandReviewModal [onclick="discardStagedCommands()"]')?.addEventListener('click',discard);
        document.querySelector('#commandReviewModal [onclick="closeCommandReview()"]')?.addEventListener('click',closeReview);
        document.querySelector('#commandReviewModal [onclick="applyStagedCommands()"]')?.addEventListener('click',apply);
    });
})();
