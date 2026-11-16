        let sessionToken = sessionStorage.getItem('kyven_session') || '';
        let moduloActual = 'overview';
        let datosDashboard = null;
        let usuarioEnDrawer = null;
        let servidorEnDrawer = null;
        let pollTimer = null;
        let ultimoTotalUsuarios = null;
        let ultimoEstadoRestoreActivo = false;
        const stagedCommandActions = new Map();
        const originalCommandCodes = new Map();
        let commandFiles = [];
        let selectedCommandPath = '';
        let commandEditorInstance = null;
        let commandEditorLoading = false;
        let pendingModuleNavigation = '';
        let commandBootState = null;

        // Paginación independiente
        let paginaMembers = 1;
        const filasMembers = 12;
        let paginaActivity = 1;
        const filasActivity = 14;

        // Preferencias de usuario persistentes
        const prefs = {
            animations: localStorage.getItem('kyven_pref_anim') !== 'false',
            compact: localStorage.getItem('kyven_pref_compact') === 'true',
            toasts: localStorage.getItem('kyven_pref_toasts') !== 'false',
            syncMs: Number(localStorage.getItem('kyven_pref_sync') || 8000)
        };

        function aplicarPreferenciasVisuales() {
            document.body.classList.toggle('no-animations', !prefs.animations);
            document.body.classList.toggle('compact-mode', prefs.compact);
            const animBtn = document.getElementById('toggleAnimationsBtn');
            const compBtn = document.getElementById('toggleCompactBtn');
            const toastBtn = document.getElementById('toggleToastsBtn');
            const syncSel = document.getElementById('settingSyncInterval');
            if (animBtn) animBtn.classList.toggle('on', prefs.animations);
            if (compBtn) compBtn.classList.toggle('on', prefs.compact);
            if (toastBtn) toastBtn.classList.toggle('on', prefs.toasts);
            if (syncSel) syncSel.value = String(prefs.syncMs);
        }
        aplicarPreferenciasVisuales();

        function togglePreference(key) {
            prefs[key] = !prefs[key];
            if (key === 'animations') localStorage.setItem('kyven_pref_anim', prefs.animations);
            if (key === 'compact') localStorage.setItem('kyven_pref_compact', prefs.compact);
            if (key === 'toasts') localStorage.setItem('kyven_pref_toasts', prefs.toasts);
            aplicarPreferenciasVisuales();
            mostrarToast('Preferencia actualizada correctamente', true);
        }

        function cambiarIntervaloSync() {
            const val = Number(document.getElementById('settingSyncInterval').value || 8000);
            prefs.syncMs = val;
            localStorage.setItem('kyven_pref_sync', String(val));
            if (pollTimer) clearInterval(pollTimer);
            pollTimer = setInterval(() => cargarDashboardData(true), prefs.syncMs);
            mostrarToast('Intervalo de sincronización ajustado a ' + (val / 1000) + 's', true);
        }

        // Reloj en vivo
        function actualizarReloj() {
            const el = document.getElementById('liveClock');
            if (el) el.textContent = new Date().toLocaleTimeString('es-AR', { hour12: false });
        }
        setInterval(actualizarReloj, 1000);
        actualizarReloj();

        // Conmutador funcional de pestañas en el Login
        function switchLoginTab(tab) {
            const isAuth = tab === 'auth';
            document.getElementById('tabBtnAuth').classList.toggle('active', isAuth);
            document.getElementById('tabBtnStatus').classList.toggle('active', !isAuth);
            document.getElementById('loginAuthPane').style.display = isAuth ? 'block' : 'none';
            document.getElementById('loginStatusPane').style.display = isAuth ? 'none' : 'block';
            if (!isAuth) verificarSaludPublica();
        }

        async function verificarSaludPublica(showFeedback = false) {
            try {
                const res = await fetch('/api/public-health');
                if (!res.ok) return;
                const d = await res.json();
                document.getElementById('pubMongoState').innerHTML =
                    '<span class="dot ' + (d.mongoConnected ? '' : 'danger') + '"></span> ' + d.mongoStatusText;
                document.getElementById('pubBotState').innerHTML =
                    '<span class="dot ' + (d.botReady ? '' : 'warn') + '"></span> ' + d.botTag;
                document.getElementById('pubBotPing').textContent = (d.botPing || 0) + ' ms';
                const mins = Math.floor((d.uptimeSeconds || 0) / 60);
                document.getElementById('pubUptime').textContent = mins + ' min en línea';
                if (showFeedback) mostrarToast('Estado del sistema comprobado en vivo', true);
            } catch (e) {}
        }
        verificarSaludPublica();

        // Navegación SPA entre los 7 Módulos Independientes
        const titulosModulo = {
            overview: ['Overview — Resumen General', 'Centro de control global y telemetría de servicios'],
            activity: ['Activity Log — Registro de Actividad', 'Historial auditable de eventos, verificaciones y operaciones'],
            restore: ['Restore Center — Centro de Restablecimiento', 'Gestión de transferencias masivas de miembros y lotes históricos'],
            members: ['Verified Members — Directorio de Miembros', 'Base de datos OAuth2 e inspección individual de perfiles'],
            servers: ['Connected Servers — Servidores Conectados', 'Administración de servidores de Discord vinculados al bot'],
            security: ['Security Center — Centro de Seguridad', 'Supervisión de sesiones, protección Anti-Rate Limit y accesos'],
            settings: ['Settings — Configuración', 'Preferencias del panel administrativo y diagnóstico de red'],
            permissions: ['Permission Control Center — Administración Discord', 'Gestión visual de roles, canales y permisos del servidor'],
            commands: ['Comandos — Editor de archivos', 'Edición en borrador y aplicación atómica de cambios']
        };

        function switchModule(modKey, bypassDraft = false) {
            if (!titulosModulo[modKey]) return;
            if (!bypassDraft && moduloActual === 'commands' && modKey !== 'commands' && window.CommandEditor?.hasChanges()) { window.CommandEditor.requestLeave(modKey); return; }
            moduloActual = modKey;

            document.querySelectorAll('.nav-item').forEach(btn => {
                btn.classList.toggle('active', btn.getAttribute('data-module') === modKey);
            });

            document.querySelectorAll('.module-view').forEach(sec => {
                sec.classList.remove('active');
            });

            const targetSection = document.getElementById('view-' + modKey);
            if (targetSection) targetSection.classList.add('active');

            document.getElementById('currentModuleTitle').textContent = titulosModulo[modKey][0];
            const syncTime = document.getElementById('lastSyncLabel')?.textContent || '--';
            document.getElementById('currentModuleSubtitle').innerHTML =
                titulosModulo[modKey][1] + ' • Última sincronización: <span id="lastSyncLabel">' + syncTime + '</span>';

            cerrarDrawers();
            if (modKey === 'commands') window.CommandEditor?.open();
            if (modKey === 'permissions') pcLoad();
        }

        function mostrarToast(msg, force = false) {
            if (!prefs.toasts && !force) return;
            const wrap = document.getElementById('toastContainer');
            const div = document.createElement('div');
            div.className = 'toast';
            div.innerHTML = '<span style="color:var(--accent-light);">●</span><span>' + escaparHtml(msg) + '</span>';
            wrap.appendChild(div);
            setTimeout(() => {
                div.style.opacity = '0';
                setTimeout(() => div.remove(), 220);
            }, 3500);
        }

        function escaparHtml(str) {
            return String(str || '').replace(/[&<>"']/g, s => ({
                '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
            }[s]));
        }

        function formatearFecha(iso) {
            if (!iso) return 'No disponible';
            const d = new Date(iso);
            if (isNaN(d.getTime())) return 'No disponible';
            return d.toLocaleString('es-AR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
        }

        function obtenerFechaSnowflakeDiscord(userId) {
            try {
                if (!userId || !/^\d{17,20}$/.test(String(userId))) return null;
                const DISCORD_EPOCH = 1420070400000n;
                const ts = Number((BigInt(userId) >> 22n) + DISCORD_EPOCH);
                const d = new Date(ts);
                return isNaN(d.getTime()) ? null : d;
            } catch (e) {
                return null;
            }
        }

        // Autenticación (Requiere que el usuario escriba Catrii manualmente)
        async function handleLogin() {
            const username = document.getElementById('loginUser').value.trim();
            const pin = document.getElementById('loginPin').value.trim();
            const alertBox = document.getElementById('loginAlertBox');
            const alertText = document.getElementById('loginAlertText');
            const btn = document.getElementById('loginBtn');
            const btnText = document.getElementById('loginBtnText');

            alertBox.style.display = 'none';

            if (!username || !pin) {
                alertText.textContent = 'Completa tu usuario administrador y tu código PIN.';
                alertBox.style.display = 'flex';
                return;
            }

            btn.disabled = true;
            btnText.textContent = 'Verificando credenciales...';

            try {
                const res = await fetch('/api/dashboard-login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, pin })
                });
                const data = await res.json();

                if (!res.ok) {
                    alertText.textContent = data.error || 'Error de autenticación';
                    alertBox.style.display = 'flex';
                    return;
                }

                sessionToken = data.sessionToken;
                sessionStorage.setItem('kyven_session', sessionToken);
                document.getElementById('loginUser').value = '';
                document.getElementById('loginPin').value = '';
                mostrarToast('Sesión iniciada correctamente como ' + data.adminName, true);
                await cargarDashboardData(false);
            } catch (err) {
                alertText.textContent = 'Error de conexión con el servidor.';
                alertBox.style.display = 'flex';
            } finally {
                btn.disabled = false;
                btnText.textContent = 'Ingresar a Control Center';
            }
        }

        // Carga y distribución de datos reales a los 7 módulos
        async function cargarDashboardData(silencioso = false) {
            if (!sessionToken) return;
            try {
                const res = await fetch('/api/dashboard-stats', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ sessionToken })
                });

                if (!res.ok) {
                    sessionStorage.removeItem('kyven_session');
                    sessionToken = '';
                    document.getElementById('loginScreen').style.display = 'flex';
                    document.getElementById('dashboardApp').style.display = 'none';
                    return;
                }

                const data = await res.json();
                datosDashboard = data;

                document.getElementById('loginScreen').style.display = 'none';
                document.getElementById('dashboardApp').style.display = 'block';

                // Detectar nuevos eventos en tiempo real para notificaciones
                if (ultimoTotalUsuarios !== null && data.total > ultimoTotalUsuarios) {
                    mostrarToast('Nuevo miembro verificado en OAuth2 (Total: ' + data.total + ')');
                }
                ultimoTotalUsuarios = data.total;

                if (ultimoEstadoRestoreActivo && !data.progresoRestore?.activo) {
                    mostrarToast('Operación de restauración finalizada en Restore Center');
                }
                ultimoEstadoRestoreActivo = Boolean(data.progresoRestore?.activo);

                // Actualizar barra superior y sidebar
                const sh = data.systemHealth || {};
                document.getElementById('sideAdminName').textContent = data.adminName || 'Catrii';
                document.getElementById('sideMongoStatus').textContent = sh.mongoConnected ? 'Conectado' : 'Desconectado';
                document.getElementById('sideMongoStatus').style.color = sh.mongoConnected ? 'var(--success)' : 'var(--danger)';
                document.getElementById('headerBotTag').textContent = sh.botTag || 'Bot';
                document.getElementById('headerHealthDot').className = 'dot ' + (sh.mongoConnected && sh.botReady ? '' : 'warn');

                const syncEl = document.getElementById('lastSyncLabel');
                if (syncEl) syncEl.textContent = new Date().toLocaleTimeString('es-AR');

                document.getElementById('navBadgeMembers').textContent = data.total || 0;
                document.getElementById('navBadgeServers').textContent = (data.guilds || []).length;
                document.getElementById('navBadgeActivity').textContent = (data.activities || []).length;
                document.getElementById('navBadgeRestore').style.display = data.progresoRestore?.activo ? 'inline-block' : 'none';

                // Renderizar cada módulo con datos reales
                renderOverviewModule(data);
                renderRestoreCenterModule(data);
                renderMembersModule(silencioso ? paginaMembers : 1);
                renderServersModule();
                renderActivityLogModule(silencioso ? paginaActivity : 1);
                renderSecurityCenterModule(data);
                renderSettingsModule(data);
                renderNotifCenter(data.activities || []);

                if (!pollTimer) {
                    pollTimer = setInterval(() => cargarDashboardData(true), prefs.syncMs);
                }
            } catch (e) {}
        }

        // 1. Render Overview
        function renderOverviewModule(data) {
            const sh = data.systemHealth || {};
            const sec = data.securityOverview || {};
            const p = data.progresoRestore || {};

            document.getElementById('ovTotalUsers').textContent = data.total || 0;
            document.getElementById('ovActiveTokensLabel').textContent =
                (sec.oauthHealth?.activeTokens || 0) + ' con token activo';

            document.getElementById('ovTotalGuilds').textContent = (data.guilds || []).length;
            const reach = (data.guilds || []).reduce((acc, g) => acc + (g.count || 0), 0);
            document.getElementById('ovGuildReachLabel').textContent = 'Alcance: ' + reach + ' miembros';

            document.getElementById('ovSystemStatusText').textContent =
                sh.mongoConnected && sh.botReady ? 'Operativo' : 'Degradado';
            document.getElementById('ovMongoStateSmall').textContent = sh.mongoStateText || 'MongoDB';
            document.getElementById('ovPingSmall').textContent = (sh.botPing || 0) + ' ms';

            document.getElementById('ovQueueStateText').textContent = p.activo ? 'En Ejecución' : 'En Espera';
            document.getElementById('ovLastRestoreSummary').textContent = p.activo
                ? 'Procesados: ' + p.procesados + '/' + p.total
                : 'Unidos último lote: ' + (p.unidos || 0);

            // Sparkline últimos 7 días
            const svg = document.getElementById('ovSparklineUsers');
            if (svg) {
                const hoy = new Date();
                const bins = [0, 0, 0, 0, 0, 0, 0];
                (data.users || []).forEach(u => {
                    const d = new Date(u.fecha);
                    if (!isNaN(d.getTime())) {
                        const diff = Math.floor((hoy - d) / 86400000);
                        if (diff >= 0 && diff < 7) bins[6 - diff]++;
                    }
                });
                const maxV = Math.max(...bins, 1);
                const pts = bins.map((v, i) => (Math.round((i / 6) * 80) + 2) + ',' + (22 - Math.round((v / maxV) * 18))).join(' ');
                svg.innerHTML = '<polyline fill="none" stroke="#a855f7" stroke-width="2" stroke-linecap="round" points="' + pts + '"/>';
            }

            // Salud detallada
            document.getElementById('ovHealthMongo').textContent = sh.mongoConnected ? 'Conectado' : 'Desconectado';
            document.getElementById('ovHealthMongo').className = 'badge-status ' + (sh.mongoConnected ? 'active' : 'error');
            document.getElementById('ovHealthBot').textContent = sh.botReady ? 'En Línea' : 'Sin Conexión';
            document.getElementById('ovHealthBot').className = 'badge-status ' + (sh.botReady ? 'active' : 'warning');
            document.getElementById('ovHealthBotDetail').textContent = 'Autenticado como ' + (sh.botTag || 'Bot');

            // Resumen de 5 actividades recientes
            const actWrap = document.getElementById('ovRecentActivitiesList');
            const acts = (data.activities || []).slice(0, 5);
            actWrap.innerHTML = acts.length === 0
                ? '<div style="color:var(--text-muted);font-size:12.5px;">Aún no hay actividad registrada.</div>'
                : acts.map(a =>
                    '<div class="health-row-item" style="margin-bottom:0;">' +
                        '<div>' +
                            '<div style="font-weight:500;">' + escaparHtml(a.description) + '</div>' +
                            '<div style="font-size:11px;color:var(--text-muted);">' + escaparHtml(a.meta || '') + '</div>' +
                        '</div>' +
                        '<span class="mono" style="font-size:11px;color:var(--text-secondary);">' + formatearFecha(a.timestamp) + '</span>' +
                    '</div>'
                ).join('');

            // Últimas operaciones de restauración
            const restBody = document.getElementById('ovLastRestoresBody');
            const hist = (data.restoreHistory || []).slice(0, 5);
            restBody.innerHTML = hist.length === 0
                ? '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:20px;">No se han registrado operaciones de restauración todavía.</td></tr>'
                : hist.map(op =>
                    '<tr onclick="switchModule(\'restore\')">' +
                        '<td class="mono" style="color:var(--accent-light);">' + escaparHtml(op.operation_id) + '</td>' +
                        '<td>' + escaparHtml(op.target_guild_name) + '</td>' +
                        '<td><span class="badge-status ' + (op.status === 'completed' ? 'active' : 'info') + '">' + escaparHtml(op.status) + '</span></td>' +
                        '<td class="mono">' + (op.joined || 0) + ' unidos / ' + (op.processed || 0) + ' proc.</td>' +
                        '<td style="color:var(--text-secondary);">' + formatearFecha(op.started_at) + '</td>' +
                    '</tr>'
                ).join('');
        }

        // 2. Render Restore Center
        function renderRestoreCenterModule(data) {
            const select = document.getElementById('rcGuildSelect');
            const prevVal = select.value;
            const guilds = data.guilds || [];
            select.innerHTML = guilds.length > 0
                ? guilds.map(g => '<option value="' + g.id + '">' + escaparHtml(g.name) + ' (ID: ' + g.id + ' • ' + g.count + ' miembros)</option>').join('')
                : '<option value="">Sin servidores en caché (Ingresa ID manual)</option>';
            if (prevVal) select.value = prevVal;

            document.getElementById('rcAvailableHint').textContent = 'En base de datos: ' + (data.total || 0);

            const p = data.progresoRestore || {};
            const pct = p.total > 0 ? Math.round((p.procesados / p.total) * 100) : 0;

            document.getElementById('rcLiveStatusBadge').textContent = p.activo ? 'Procesando Lote' : 'En Espera';
            document.getElementById('rcLiveStatusBadge').className = 'badge-status ' + (p.activo ? 'warning' : 'info');
            document.getElementById('rcLiveTargetLabel').textContent = p.targetGuildName
                ? 'Destino: ' + p.targetGuildName + ' (' + (p.operationId || '') + ')'
                : 'Ninguna operación ejecutándose';
            document.getElementById('rcLivePctLabel').textContent = pct + '%';
            document.getElementById('rcLiveProgressBar').style.width = pct + '%';

            document.getElementById('rcMetricProcessed').textContent = p.procesados || 0;
            document.getElementById('rcMetricPending').textContent = p.pendientes || 0;
            document.getElementById('rcMetricCompleted').textContent = (p.unidos || 0) + ' / ' + (p.yaEstaban || 0);
            document.getElementById('rcMetricErrors').textContent = p.fallidos || 0;

            if (p.startedAt) {
                const endMs = p.finishedAt ? new Date(p.finishedAt).getTime() : Date.now();
                const secs = Math.max(Math.floor((endMs - new Date(p.startedAt).getTime()) / 1000), 0);
                const m = String(Math.floor(secs / 60)).padStart(2, '0');
                const s = String(secs % 60).padStart(2, '0');
                document.getElementById('rcMetricElapsed').textContent = m + ':' + s + ' (' + secs + 's)';
            } else {
                document.getElementById('rcMetricElapsed').textContent = '00:00';
            }

            const tbody = document.getElementById('rcHistoryTableBody');
            const hist = data.restoreHistory || [];
            if (hist.length === 0) {
                tbody.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:28px;color:var(--text-muted);">Aún no existen operaciones previas registradas en Restore Center.</td></tr>';
                return;
            }

            tbody.innerHTML = hist.map(op =>
                '<tr onclick="abrirDetalleRestore(\'' + op.operation_id + '\')">' +
                    '<td class="mono" style="color:var(--accent-light);">' + escaparHtml(op.operation_id) + '</td>' +
                    '<td>' + escaparHtml(op.target_guild_name) + '</td>' +
                    '<td><span class="badge-status ' + (op.status === 'completed' ? 'active' : 'warning') + '">' + escaparHtml(op.status) + '</span></td>' +
                    '<td class="mono">' + (op.processed || 0) + ' / ' + (op.total_candidates || 0) + '</td>' +
                    '<td class="mono" style="color:var(--success);">' + (op.joined || 0) + '</td>' +
                    '<td class="mono">' + (op.already_in || 0) + '</td>' +
                    '<td class="mono" style="color:var(--danger);">' + (op.failed || 0) + '</td>' +
                    '<td class="mono">' + (op.duration_seconds || 0) + 's</td>' +
                    '<td style="color:var(--text-secondary);">' + formatearFecha(op.started_at) + '</td>' +
                    '<td style="text-align:right;"><button type="button" class="btn-secondary" style="padding:4px 9px;font-size:11.5px;">Ver reporte</button></td>' +
                '</tr>'
            ).join('');
        }

        function abrirDetalleRestore(opId) {
            const op = (datosDashboard?.restoreHistory || []).find(item => item.operation_id === opId);
            if (!op) return;
            document.getElementById('rdModalTitle').textContent = 'Reporte de Operación ' + op.operation_id;
            document.getElementById('rdModalGrid').innerHTML =
                '<div><div class="info-cell-label">Servidor Destino</div><div class="info-cell-val">' + escaparHtml(op.target_guild_name) + '</div></div>' +
                '<div><div class="info-cell-label">ID Servidor</div><div class="info-cell-val mono">' + escaparHtml(op.target_guild_id) + '</div></div>' +
                '<div><div class="info-cell-label">Iniciado Por</div><div class="info-cell-val">' + escaparHtml(op.initiated_by) + '</div></div>' +
                '<div><div class="info-cell-label">Duración Total</div><div class="info-cell-val mono">' + (op.duration_seconds || 0) + ' segundos</div></div>' +
                '<div><div class="info-cell-label">Unidos Exitosamente</div><div class="info-cell-val mono" style="color:var(--success);">' + (op.joined || 0) + '</div></div>' +
                '<div><div class="info-cell-label">Ya Estaban / Fallos</div><div class="info-cell-val mono">' + (op.already_in || 0) + ' / ' + (op.failed || 0) + '</div></div>';

            const errBox = document.getElementById('rdModalErrors');
            if (Array.isArray(op.error_details) && op.error_details.length > 0) {
                errBox.innerHTML = op.error_details.map(e => '<div style="margin-bottom:4px;">• ' + escaparHtml(e) + '</div>').join('');
            } else {
                errBox.innerHTML = '<span style="color:var(--success);">✓ Operación ejecutada sin errores reportados.</span>';
            }
            document.getElementById('restoreDetailModal').classList.add('active');
        }

        // 3. Render Verified Members
        function renderMembersModule(nuevaPag) {
            if (nuevaPag) paginaMembers = nuevaPag;
            const users = datosDashboard?.users || [];
            const q = (document.getElementById('vmSearchInput')?.value || '').trim().toLowerCase();
            const stFilter = document.getElementById('vmStatusFilter')?.value || 'all';
            const sortBy = document.getElementById('vmSortSelect')?.value || 'verify_desc';

            const filtrados = users.filter(u => {
                const matchQ = !q || (u.username || '').toLowerCase().includes(q) || String(u.user_id).includes(q);
                const st = u.oauth_status || 'active';
                const matchSt = stFilter === 'all' || st === stFilter;
                return matchQ && matchSt;
            });

            filtrados.sort((a, b) => {
                const vA = new Date(a.fecha || 0).getTime();
                const vB = new Date(b.fecha || 0).getTime();
                const cA = new Date(a.created_at || a.fecha || 0).getTime();
                const cB = new Date(b.created_at || b.fecha || 0).getTime();
                if (sortBy === 'verify_desc') return vB - vA;
                if (sortBy === 'verify_asc') return vA - vB;
                if (sortBy === 'created_desc') return cB - cA;
                if (sortBy === 'created_asc') return cA - cB;
                return 0;
            });

            const totalPags = Math.max(Math.ceil(filtrados.length / filasMembers), 1);
            if (paginaMembers > totalPags) paginaMembers = totalPags;

            const inicio = (paginaMembers - 1) * filasMembers;
            const items = filtrados.slice(inicio, inicio + filasMembers);

            document.getElementById('vmCountSummary').textContent =
                'Mostrando ' + items.length + ' de ' + filtrados.length + ' miembros verificados';
            document.getElementById('vmPaginationInfo').textContent =
                'Página ' + paginaMembers + ' de ' + totalPags;
            document.getElementById('vmPrevBtn').disabled = paginaMembers <= 1;
            document.getElementById('vmNextBtn').disabled = paginaMembers >= totalPags;

            const tbody = document.getElementById('vmTableBody');
            if (items.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--text-muted);">No se encontraron miembros verificados con los filtros seleccionados.</td></tr>';
                return;
            }

            tbody.innerHTML = items.map(u => {
                const st = u.oauth_status || 'active';
                const stText = st === 'active' ? 'OAuth2 Activo' : (st === 'refreshed' ? 'Token Renovado' : 'Expirado');
                const discCreated = obtenerFechaSnowflakeDiscord(u.user_id);
                const discStr = discCreated ? discCreated.toLocaleDateString('es-AR') : 'No disponible';

                return '<tr onclick="abrirUserDrawer(\'' + u.user_id + '\')">' +
                    '<td><div class="user-cell-flex">' +
                        '<img class="user-avatar" src="' + u.avatar + '" onerror="this.src=\'https://cdn.discordapp.com/embed/avatars/0.png\'" alt="" />' +
                        '<span style="font-weight:600;color:#fff;">' + escaparHtml(u.username) + '</span>' +
                    '</div></td>' +
                    '<td class="mono" style="color:var(--accent-light);">' + u.user_id + '</td>' +
                    '<td><span class="badge-status ' + st + '">● ' + stText + '</span></td>' +
                    '<td style="color:var(--text-secondary);">' + formatearFecha(u.fecha) + '</td>' +
                    '<td style="color:var(--text-secondary);">' + formatearFecha(u.created_at) + '</td>' +
                    '<td style="color:var(--text-secondary);">' + discStr + '</td>' +
                    '<td style="text-align:right;"><button type="button" class="btn-secondary" style="padding:4px 9px;font-size:11.5px;">Inspeccionar</button></td>' +
                '</tr>';
            }).join('');
        }

        function cambiarPaginaMembers(delta) {
            renderMembersModule(paginaMembers + delta);
        }

        // 4. Render Connected Servers
        function renderServersModule() {
            const guilds = datosDashboard?.guilds || [];
            const q = (document.getElementById('csSearchInput')?.value || '').trim().toLowerCase();
            const f = document.getElementById('csFilterSelect')?.value || 'all';

            const filtrados = guilds.filter(g => {
                const matchQ = !q || g.name.toLowerCase().includes(q) || g.id.includes(q);
                const matchF = f === 'all' || (f === 'admin' && g.hasAdmin) || (f === 'primary' && g.isPrimaryGuild);
                return matchQ && matchF;
            });

            document.getElementById('csSummaryLabel').textContent = filtrados.length + ' servidores disponibles';
            const grid = document.getElementById('csServersGrid');

            if (filtrados.length === 0) {
                grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:34px;color:var(--text-muted);">No se encontraron servidores conectados que coincidan con la búsqueda.</div>';
                return;
            }

            grid.innerHTML = filtrados.map(g => {
                const initials = g.name.slice(0, 2).toUpperCase();
                const iconHtml = g.icon
                    ? '<img class="server-icon" src="' + g.icon + '" alt="" />'
                    : '<div class="server-icon">' + escaparHtml(initials) + '</div>';

                return '<div class="server-card" onclick="abrirServerDrawer(\'' + g.id + '\')">' +
                    '<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">' +
                        '<div style="display:flex;align-items:center;gap:12px;">' +
                            iconHtml +
                            '<div>' +
                                '<div style="font-weight:700;font-size:14.5px;color:#fff;">' + escaparHtml(g.name) + '</div>' +
                                '<div class="mono" style="font-size:11.5px;color:var(--accent-light);">ID: ' + g.id + '</div>' +
                            '</div>' +
                        '</div>' +
                        '<span class="badge-status ' + (g.hasAdmin ? 'active' : 'warning') + '">' + (g.hasAdmin ? 'Conectado' : 'Limitado') + '</span>' +
                    '</div>' +
                    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding-top:10px;border-top:1px solid var(--border-subtle);font-size:12px;">' +
                        '<div><span style="color:var(--text-muted);">Miembros:</span> <strong class="mono">' + g.count + '</strong></div>' +
                        '<div><span style="color:var(--text-muted);">Integración:</span> <strong>' + escaparHtml(g.integrationStatus) + '</strong></div>' +
                    '</div>' +
                '</div>';
            }).join('');
        }

        // 5. Render Activity Log Completo
        function renderActivityLogModule(nuevaPag) {
            if (nuevaPag) paginaActivity = nuevaPag;
            const acts = datosDashboard?.activities || [];
            const q = (document.getElementById('actSearchInput')?.value || '').trim().toLowerCase();
            const tFilter = document.getElementById('actTypeFilter')?.value || 'all';
            const sFilter = document.getElementById('actSeverityFilter')?.value || 'all';
            const dFilter = document.getElementById('actDateFilter')?.value || '';

            const filtrados = acts.filter(a => {
                const matchQ = !q || (a.description || '').toLowerCase().includes(q) || (a.meta || '').toLowerCase().includes(q);
                const matchT = tFilter === 'all' || a.type === tFilter;
                const sev = a.severity || 'info';
                const matchS = sFilter === 'all' || sev === sFilter;
                const matchD = !dFilter || (a.timestamp && a.timestamp.startsWith(dFilter));
                return matchQ && matchT && matchS && matchD;
            });

            const totalPags = Math.max(Math.ceil(filtrados.length / filasActivity), 1);
            if (paginaActivity > totalPags) paginaActivity = totalPags;

            const inicio = (paginaActivity - 1) * filasActivity;
            const items = filtrados.slice(inicio, inicio + filasActivity);

            document.getElementById('actTotalLabel').textContent = filtrados.length + ' acontecimientos encontrados';
            document.getElementById('actPaginationInfo').textContent = 'Página ' + paginaActivity + ' de ' + totalPags;
            document.getElementById('actPrevBtn').disabled = paginaActivity <= 1;
            document.getElementById('actNextBtn').disabled = paginaActivity >= totalPags;

            const tbody = document.getElementById('actTableBody');
            if (items.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--text-muted);">No existen acontecimientos registrados para los filtros seleccionados.</td></tr>';
                return;
            }

            tbody.innerHTML = items.map(a => {
                const sev = a.severity || 'info';
                const sevLabel = sev === 'success' ? 'Éxito' : (sev === 'warning' ? 'Advertencia' : (sev === 'error' ? 'Error' : 'Info'));
                return '<tr>' +
                    '<td><span class="badge-status ' + sev + '">● ' + sevLabel + '</span></td>' +
                    '<td class="mono" style="font-size:11.5px;color:var(--accent-light);">' + escaparHtml(a.type) + '</td>' +
                    '<td style="font-weight:500;color:#fff;">' + escaparHtml(a.description) + '</td>' +
                    '<td style="color:var(--text-secondary);">' + escaparHtml(a.meta || 'Sin metadatos adicionales') + '</td>' +
                    '<td class="mono" style="font-size:12px;color:var(--text-secondary);">' + formatearFecha(a.timestamp) + '</td>' +
                '</tr>';
            }).join('');
        }

        function cambiarPaginaActivity(delta) {
            renderActivityLogModule(paginaActivity + delta);
        }

        // 6. Render Security Center
        function renderSecurityCenterModule(data) {
            const sec = data.securityOverview || {};
            const oh = sec.oauthHealth || {};

            document.getElementById('secActiveSessions').textContent = sec.activeSessionsCount || 1;
            document.getElementById('secSessionExpiryLabel').textContent = 'Expira: ' + formatearFecha(sec.currentSessionExpiresAt);
            document.getElementById('secFailedAttempts').textContent = sec.failedLoginAttempts || 0;
            document.getElementById('secBlockedIpsLabel').textContent = (sec.blockedIpsCount || 0) + ' IPs en bloqueo temporal';
            document.getElementById('secOAuthHealthy').textContent = (oh.activeTokens || 0) + ' / ' + (oh.totalTokens || 0);
            document.getElementById('secOAuthBreakdown').textContent =
                'Renovados: ' + (oh.refreshedTokens || 0) + ' • Expirados: ' + (oh.expiredTokens || 0);
            document.getElementById('secLastCheckTime').textContent = formatearFecha(sec.lastSecurityCheck);

            const secEvents = (data.activities || []).filter(a => a.type === 'auth' || a.type === 'error' || a.type === 'system').slice(0, 12);
            const listEl = document.getElementById('secEventsList');
            listEl.innerHTML = secEvents.length === 0
                ? '<div style="color:var(--text-muted);font-size:12.5px;">Sin incidentes de seguridad registrados.</div>'
                : secEvents.map(e =>
                    '<div class="health-row-item" style="margin-bottom:0;">' +
                        '<div>' +
                            '<div style="font-weight:500;">' + escaparHtml(e.description) + '</div>' +
                            '<div style="font-size:11px;color:var(--text-muted);">' + escaparHtml(e.meta || '') + '</div>' +
                        '</div>' +
                        '<span class="mono" style="font-size:11px;color:var(--text-secondary);">' + formatearFecha(e.timestamp) + '</span>' +
                    '</div>'
                ).join('');
        }

        // 7. Render Settings
        function renderSettingsModule(data) {
            const sh = data.systemHealth || {};
            document.getElementById('setNodeVer').textContent = sh.nodeVersion || 'Node.js';
            document.getElementById('setBotTag').textContent = sh.botTag || 'Desconectado';
            document.getElementById('setMongoState').textContent = sh.mongoStateText || 'MongoDB Atlas';
        }

        // Centro de Notificaciones Global
        function renderNotifCenter(activities) {
            const relevantes = activities.filter(a =>
                a.type === 'verify' || a.type === 'restore_end' || a.type === 'error' || a.severity === 'error'
            ).slice(0, 15);

            const lastReadTs = Number(localStorage.getItem('kyven_notif_read_ts') || 0);
            const noLeidas = relevantes.filter(a => new Date(a.timestamp).getTime() > lastReadTs).length;

            const badge = document.getElementById('notifBadgeCount');
            if (noLeidas > 0) {
                badge.style.display = 'flex';
                badge.textContent = noLeidas > 9 ? '9+' : noLeidas;
            } else {
                badge.style.display = 'none';
            }

            const container = document.getElementById('notifListContainer');
            if (relevantes.length === 0) {
                container.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12.5px;">Sin notificaciones nuevas.</div>';
                return;
            }

            container.innerHTML = relevantes.map(n => {
                const colorDot = n.severity === 'error' ? 'danger' : (n.severity === 'warning' ? 'warn' : '');
                return '<div class="notif-item">' +
                    '<span class="dot ' + colorDot + '" style="margin-top:5px;"></span>' +
                    '<div>' +
                        '<div style="font-weight:500;color:#fff;">' + escaparHtml(n.description) + '</div>' +
                        '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">' + escaparHtml(n.meta || '') + ' • ' + formatearFecha(n.timestamp) + '</div>' +
                    '</div>' +
                '</div>';
            }).join('');
        }

        function toggleNotifCenter(e) {
            e.stopPropagation();
            document.getElementById('notifDropdown').classList.toggle('open');
        }

        function marcarNotificacionesLeidas() {
            localStorage.setItem('kyven_notif_read_ts', String(Date.now()));
            document.getElementById('notifBadgeCount').style.display = 'none';
            document.getElementById('notifDropdown').classList.remove('open');
            mostrarToast('Notificaciones marcadas como leídas');
        }

        window.addEventListener('click', () => {
            document.getElementById('notifDropdown')?.classList.remove('open');
        });

        // Drawers Interactivos (Usuario y Servidor)
        function abrirUserDrawer(userId) {
            const u = (datosDashboard?.users || []).find(item => String(item.user_id) === String(userId));
            if (!u) return;
            usuarioEnDrawer = u;

            document.getElementById('dwAvatar').src = u.avatar || 'https://cdn.discordapp.com/embed/avatars/0.png';
            document.getElementById('dwUsername').textContent = u.username || 'Usuario';
            document.getElementById('dwUserId').textContent = u.user_id;

            const st = u.oauth_status || 'active';
            const stLabel = st === 'active' ? 'OAuth2 Autorizado' : (st === 'refreshed' ? 'Token Renovado' : 'Token Expirado');
            document.getElementById('dwStatusBadge').innerHTML = '<span class="badge-status ' + st + '">● ' + stLabel + '</span>';
            document.getElementById('dwProfileLink').href = 'https://discord.com/users/' + u.user_id;

            const discCreated = obtenerFechaSnowflakeDiscord(u.user_id);
            document.getElementById('dwVerifiedAt').textContent = formatearFecha(u.fecha);
            document.getElementById('dwDiscordCreated').textContent = discCreated ? formatearFecha(discCreated.toISOString()) : 'No disponible';
            document.getElementById('dwDbCreated').textContent = formatearFecha(u.created_at || u.fecha);
            document.getElementById('dwDbUpdated').textContent = formatearFecha(u.updated_at || u.fecha);
            document.getElementById('dwLastActivity').textContent = formatearFecha(u.updated_at || u.fecha);

            const srvBox = document.getElementById('dwServersContainer');
            if (Array.isArray(u.servers_associated) && u.servers_associated.length > 0) {
                srvBox.innerHTML = u.servers_associated.map(s =>
                    '<div class="health-row-item" style="margin-bottom:0;">' +
                        '<span style="font-weight:500;">' + escaparHtml(s.name) + '</span>' +
                        '<span class="mono" style="font-size:11.5px;color:var(--text-muted);">' + s.id + '</span>' +
                    '</div>'
                ).join('');
            } else {
                srvBox.innerHTML = '<div style="color:var(--text-muted);font-size:12px;">No disponible</div>';
            }

            const tlBox = document.getElementById('dwTimelineContainer');
            const hist = Array.isArray(u.history) ? [...u.history].reverse() : [];
            tlBox.innerHTML = hist.map(h =>
                '<div class="timeline-node">' +
                    '<div style="font-weight:600;font-size:12.5px;color:#fff;">' + escaparHtml(h.event) + '</div>' +
                    '<div style="font-size:11.5px;color:var(--text-secondary);margin-top:2px;">' + escaparHtml(h.detail || '') + '</div>' +
                    '<div class="mono" style="font-size:10.5px;color:var(--text-muted);margin-top:4px;">' + formatearFecha(h.timestamp) + '</div>' +
                '</div>'
            ).join('');

            document.getElementById('serverDrawer').classList.remove('open');
            document.getElementById('drawerBackdrop').classList.add('open');
            document.getElementById('userDrawer').classList.add('open');
        }

        function abrirServerDrawer(guildId) {
            const g = (datosDashboard?.guilds || []).find(item => String(item.id) === String(guildId));
            if (!g) return;
            servidorEnDrawer = g;

            document.getElementById('sdName').textContent = g.name;
            document.getElementById('sdId').textContent = g.id;
            document.getElementById('sdMemberCount').textContent = g.count;
            document.getElementById('sdIntegration').textContent = g.integrationStatus;
            document.getElementById('sdJoinedAt').textContent = formatearFecha(g.joinedAt);
            document.getElementById('sdOwnerId').textContent = g.ownerId || 'No disponible';
            document.getElementById('sdLastSync').textContent = formatearFecha(g.lastSync);

            document.getElementById('userDrawer').classList.remove('open');
            document.getElementById('drawerBackdrop').classList.add('open');
            document.getElementById('serverDrawer').classList.add('open');
        }

        function seleccionarServidorParaRestore() {
            if (!servidorEnDrawer) return;
            const targetId = servidorEnDrawer.id;
            switchModule('restore');
            const sel = document.getElementById('rcGuildSelect');
            if (sel) sel.value = targetId;
            document.getElementById('rcCustomGuildId').value = targetId;
            mostrarToast('Servidor ' + servidorEnDrawer.name + ' cargado en Restore Center', true);
        }

        function cerrarDrawers() {
            document.getElementById('drawerBackdrop').classList.remove('open');
            document.getElementById('userDrawer').classList.remove('open');
            document.getElementById('serverDrawer').classList.remove('open');
        }

        function cerrarModales() {
            document.getElementById('confirmRestoreModal').classList.remove('active');
            document.getElementById('restoreDetailModal').classList.remove('active');
        }

        function copiarDatoUsuario(tipo) {
            if (!usuarioEnDrawer) return;
            const val = tipo === 'id' ? usuarioEnDrawer.user_id : usuarioEnDrawer.username;
            navigator.clipboard.writeText(val);
            mostrarToast('Copiado al portapapeles: ' + val, true);
        }

        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                cerrarDrawers();
                cerrarModales();
            }
        });

        // Operaciones Restore, Ping y Seguridad
        function solicitarConfirmacionRestore() {
            const guildId = document.getElementById('rcCustomGuildId').value.trim() || document.getElementById('rcGuildSelect').value;
            const cantidad = document.getElementById('rcPullAmount').value;
            if (!guildId) {
                mostrarToast('Selecciona un servidor o introduce un ID válido', true);
                return;
            }
            document.getElementById('confirmRestoreText').textContent =
                'Se iniciará la transferencia de hasta ' + cantidad + ' miembros verificados hacia el servidor ID ' + guildId + ' con protección Anti-Rate Limit (1.35s por miembro).';
            document.getElementById('confirmRestoreModal').classList.add('active');
        }

        async function confirmarYEjecutarRestore() {
            cerrarModales();
            const guildId = document.getElementById('rcCustomGuildId').value.trim() || document.getElementById('rcGuildSelect').value;
            const cantidad = document.getElementById('rcPullAmount').value;

            const res = await fetch('/api/dashboard-pull', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionToken, guildId, cantidad })
            });
            const data = await res.json();
            mostrarToast(data.message || data.error, true);
            await cargarDashboardData(true);
        }

        async function ejecutarPingServicios() {
            const res = await fetch('/api/dashboard-ping-services', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionToken })
            });
            const d = await res.json();
            if (res.ok) {
                mostrarToast('Diagnóstico completado • MongoDB: ' + (d.mongoPingMs ?? '--') + 'ms • Discord: ' + (d.discordPingMs ?? '--') + 'ms', true);
                cargarDashboardData(true);
            }
        }

        async function revocarOtrasSesiones() {
            const res = await fetch('/api/dashboard-revoke-other-sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionToken })
            });
            const d = await res.json();
            if (res.ok) {
                mostrarToast('Sesiones secundarias revocadas (' + d.revocadas + ')', true);
                cargarDashboardData(true);
            }
        }

        async function sincronizarManual() {
            await cargarDashboardData(true);
            mostrarToast('Datos sincronizados con MongoDB Atlas', true);
        }

        async function cerrarSesion() {
            try { await fetch('/api/dashboard-logout', { method: 'POST', credentials: 'same-origin' }); } catch (_) {}
            sessionStorage.removeItem('kyven_session');
            location.reload();
        }

        // Fondo interactivo de partículas en el Login
        (function iniciarParticulas() {
            const canvas = document.getElementById('particleCanvas');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            let w = canvas.width = window.innerWidth;
            let h = canvas.height = window.innerHeight;

            const mouse = { x: w / 2, y: h / 2, active: false };
            window.addEventListener('mousemove', e => {
                mouse.x = e.clientX;
                mouse.y = e.clientY;
                mouse.active = true;
            });
            window.addEventListener('resize', () => {
                w = canvas.width = window.innerWidth;
                h = canvas.height = window.innerHeight;
            });

            const count = Math.min(Math.floor((w * h) / 18000), 70);
            const nodes = Array.from({ length: count }, () => ({
                x: Math.random() * w,
                y: Math.random() * h,
                vx: (Math.random() - 0.5) * 0.32,
                vy: (Math.random() - 0.5) * 0.32,
                r: Math.random() * 1.6 + 0.8,
                d: Math.random() * 0.6 + 0.4
            }));

            function frame() {
                if (document.getElementById('loginScreen').style.display !== 'none' && prefs.animations) {
                    ctx.clearRect(0, 0, w, h);
                    for (let i = 0; i < nodes.length; i++) {
                        const n = nodes[i];
                        n.x += n.vx * n.d;
                        n.y += n.vy * n.d;
                        if (n.x < 0 || n.x > w) n.vx *= -1;
                        if (n.y < 0 || n.y > h) n.vy *= -1;

                        const px = n.x + (mouse.active ? (mouse.x - w / 2) * 0.014 * n.d : 0);
                        const py = n.y + (mouse.active ? (mouse.y - h / 2) * 0.014 * n.d : 0);

                        ctx.beginPath();
                        ctx.arc(px, py, n.r, 0, Math.PI * 2);
                        ctx.fillStyle = 'rgba(192, 132, 252, ' + (0.35 * n.d) + ')';
                        ctx.fill();

                        for (let j = i + 1; j < nodes.length; j++) {
                            const n2 = nodes[j];
                            const p2x = n2.x + (mouse.active ? (mouse.x - w / 2) * 0.014 * n2.d : 0);
                            const p2y = n2.y + (mouse.active ? (mouse.y - h / 2) * 0.014 * n2.d : 0);
                            const dist = Math.hypot(px - p2x, py - p2y);
                            if (dist < 125) {
                                ctx.beginPath();
                                ctx.moveTo(px, py);
                                ctx.lineTo(p2x, p2y);
                                ctx.strokeStyle = 'rgba(168, 85, 247, ' + ((1 - dist / 125) * 0.16) + ')';
                                ctx.lineWidth = 0.8;
                                ctx.stroke();
                            }
                        }
                    }
                }
                requestAnimationFrame(frame);
            }
            requestAnimationFrame(frame);
        })();


        if (sessionToken) cargarDashboardData(false);
