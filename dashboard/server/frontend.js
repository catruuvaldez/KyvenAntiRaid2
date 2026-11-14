'use strict';

function registerDashboardPage(app) {
app.get('/dashboard', (req, res) => {
    res.send(`<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>KYVEN RESTORE 2.0 • CONTROL CENTER</title>
    <link rel="icon" type="image/png" href="/api/brand-icon">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-base: #040309;
            --bg-surface: #0a0812;
            --bg-elevated: rgba(16, 13, 27, 0.82);
            --bg-glass: rgba(13, 10, 23, 0.78);
            --border-subtle: rgba(255, 255, 255, 0.07);
            --border-violet: rgba(168, 85, 247, 0.28);
            --border-violet-bright: rgba(192, 132, 252, 0.55);
            --accent-primary: #8b5cf6;
            --accent-secondary: #a855f7;
            --accent-light: #d8b4fe;
            --text-primary: #f8fafc;
            --text-secondary: #94a3b8;
            --text-muted: #64748b;
            --success: #10b981;
            --warning: #f59e0b;
            --danger: #ef4444;
            --radius-sm: 8px;
            --radius-md: 12px;
            --radius-lg: 16px;
            --radius-xl: 20px;
            --transition-fast: 180ms cubic-bezier(0.16, 1, 0.3, 1);
            --transition-smooth: 260ms cubic-bezier(0.16, 1, 0.3, 1);
        }

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            background-color: var(--bg-base);
            color: var(--text-primary);
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            font-size: 13.5px;
            line-height: 1.5;
            min-height: 100vh;
            overflow-x: hidden;
            -webkit-font-smoothing: antialiased;
        }

        body.no-animations *,
        body.no-animations *::before,
        body.no-animations *::after {
            animation: none !important;
            transition: none !important;
        }

        body.compact-mode td,
        body.compact-mode th {
            padding: 9px 14px !important;
        }

        .mono {
            font-family: 'JetBrains Mono', monospace;
        }

        .ambient-glow {
            position: fixed;
            top: -200px;
            left: 50%;
            transform: translateX(-50%);
            width: 960px;
            height: 440px;
            background: radial-gradient(ellipse at center, rgba(139, 92, 246, 0.14) 0%, rgba(88, 28, 135, 0.04) 50%, transparent 75%);
            pointer-events: none;
            z-index: 0;
        }

        /* ==========================================================
           1. LOGIN SCREEN CON KYVENICON Y PESTAÑAS FUNCIONALES
           ========================================================== */
        #loginScreen {
            position: relative;
            width: 100%;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 24px;
            overflow: hidden;
            z-index: 1;
        }

        #particleCanvas {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            z-index: 0;
            pointer-events: none;
        }

        .login-container {
            position: relative;
            z-index: 2;
            width: 100%;
            max-width: 430px;
            animation: viewEnter 300ms cubic-bezier(0.16, 1, 0.3, 1);
        }

        .login-brand-header {
            text-align: center;
            margin-bottom: 20px;
        }

        .login-brand-title {
            font-size: 21px;
            font-weight: 700;
            letter-spacing: -0.03em;
            color: #ffffff;
        }

        .login-brand-sub {
            font-size: 11.5px;
            color: var(--text-secondary);
            letter-spacing: 0.14em;
            text-transform: uppercase;
            margin-top: 4px;
        }

        .login-card {
            background: var(--bg-glass);
            backdrop-filter: blur(24px);
            -webkit-backdrop-filter: blur(24px);
            border: 1px solid rgba(168, 85, 247, 0.25);
            border-radius: var(--radius-xl);
            padding: 32px 30px;
            box-shadow: 0 28px 70px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.03) inset;
        }

        .kyven-brand-frame {
            width: 150px;
            height: 82px;
            margin: 0 auto 20px;
            border-radius: 14px;
            overflow: hidden;
            border: 1px solid rgba(168, 85, 247, 0.4);
            box-shadow: 0 8px 28px rgba(139, 92, 246, 0.28);
            background: #090612;
            display: flex;
            align-items: center;
            justify-content: center;
        }

        .kyven-brand-frame img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            display: block;
        }

        .login-tabs {
            display: flex;
            justify-content: center;
            gap: 28px;
            border-bottom: 1px solid var(--border-subtle);
            margin-bottom: 22px;
        }

        .login-tab {
            background: none;
            border: none;
            font-size: 13px;
            font-weight: 500;
            color: var(--text-muted);
            padding: 0 4px 11px;
            cursor: pointer;
            position: relative;
            transition: color var(--transition-fast);
        }

        .login-tab:hover {
            color: var(--text-primary);
        }

        .login-tab.active {
            color: var(--accent-light);
            font-weight: 600;
        }

        .login-tab.active::after {
            content: '';
            position: absolute;
            left: 0;
            right: 0;
            bottom: -1px;
            height: 2px;
            background: var(--accent-secondary);
            border-radius: 2px;
        }

        .form-group {
            margin-bottom: 16px;
        }

        .form-label {
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            font-weight: 500;
            color: var(--text-secondary);
            margin-bottom: 7px;
        }

        .input-wrapper {
            position: relative;
            display: flex;
            align-items: center;
        }

        .input-icon {
            position: absolute;
            left: 13px;
            color: var(--text-muted);
            pointer-events: none;
        }

        .input-field {
            width: 100%;
            background: rgba(7, 5, 13, 0.88);
            border: 1px solid rgba(255, 255, 255, 0.09);
            border-radius: var(--radius-md);
            padding: 11px 14px 11px 38px;
            color: var(--text-primary);
            font-size: 13.5px;
            outline: none;
            transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
        }

        .input-field.no-icon {
            padding-left: 14px;
        }

        .input-field:focus {
            border-color: var(--accent-secondary);
            box-shadow: 0 0 0 3px rgba(168, 85, 247, 0.16);
        }

        .btn-primary {
            width: 100%;
            padding: 12px 18px;
            border-radius: var(--radius-md);
            border: 1px solid rgba(255, 255, 255, 0.12);
            background: linear-gradient(135deg, #7c3aed 0%, #9333ea 100%);
            color: #ffffff;
            font-size: 13.5px;
            font-weight: 600;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: transform var(--transition-fast), box-shadow var(--transition-fast), filter var(--transition-fast);
            box-shadow: 0 6px 20px rgba(124, 58, 237, 0.35);
        }

        .btn-primary:hover:not(:disabled) {
            transform: translateY(-1px);
            filter: brightness(1.08);
            box-shadow: 0 10px 26px rgba(147, 51, 234, 0.5);
        }

        .btn-primary:disabled {
            opacity: 0.55;
            cursor: not-allowed;
        }

        .btn-secondary {
            padding: 8px 14px;
            border-radius: var(--radius-md);
            background: rgba(19, 15, 32, 0.9);
            border: 1px solid rgba(168, 85, 247, 0.25);
            color: var(--text-primary);
            font-size: 12.5px;
            font-weight: 500;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 7px;
            transition: all var(--transition-fast);
        }

        .btn-secondary:hover:not(:disabled) {
            background: rgba(139, 92, 246, 0.16);
            border-color: var(--border-violet-bright);
            transform: translateY(-1px);
        }

        .btn-secondary:disabled {
            opacity: 0.45;
            cursor: not-allowed;
        }

        .btn-danger-ghost {
            padding: 8px 14px;
            border-radius: var(--radius-md);
            background: rgba(239, 68, 68, 0.1);
            border: 1px solid rgba(239, 68, 68, 0.28);
            color: #fca5a5;
            font-size: 12.5px;
            font-weight: 500;
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            transition: all var(--transition-fast);
        }

        .btn-danger-ghost:hover {
            background: rgba(239, 68, 68, 0.18);
            border-color: rgba(239, 68, 68, 0.5);
        }

        .login-alert {
            display: none;
            align-items: center;
            gap: 10px;
            padding: 11px 14px;
            border-radius: var(--radius-md);
            background: rgba(239, 68, 68, 0.12);
            border: 1px solid rgba(239, 68, 68, 0.35);
            color: #fca5a5;
            font-size: 12.5px;
            margin-bottom: 16px;
        }

        .dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--success);
            box-shadow: 0 0 8px var(--success);
            display: inline-block;
            flex-shrink: 0;
        }
        .dot.warn { background: var(--warning); box-shadow: 0 0 8px var(--warning); }
        .dot.danger { background: var(--danger); box-shadow: 0 0 8px var(--danger); }

        /* ==========================================================
           2. SHELL PRINCIPAL Y SIDEBAR CATEGORIZADO
           ========================================================== */
        #dashboardApp {
            display: none;
            position: relative;
            z-index: 1;
            min-height: 100vh;
        }

        .app-shell {
            display: grid;
            grid-template-columns: 256px 1fr;
            min-height: 100vh;
        }

        .sidebar {
            background: rgba(8, 6, 15, 0.92);
            backdrop-filter: blur(20px);
            border-right: 1px solid var(--border-subtle);
            padding: 20px 14px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            position: sticky;
            top: 0;
            height: 100vh;
            overflow-y: auto;
        }

        .sidebar-brand {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 4px 8px 18px;
            border-bottom: 1px solid var(--border-subtle);
            margin-bottom: 16px;
        }

        .sidebar-brand-img {
            width: 44px;
            height: 44px;
            border-radius: 10px;
            object-fit: cover;
            border: 1px solid rgba(168, 85, 247, 0.45);
            box-shadow: 0 0 16px rgba(139, 92, 246, 0.3);
            flex-shrink: 0;
            background: #090612;
        }

        .nav-group {
            margin-bottom: 18px;
        }

        .nav-group-label {
            font-size: 10.5px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.1em;
            color: var(--text-muted);
            padding: 0 10px;
            margin-bottom: 6px;
        }

        .nav-list {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }

        .nav-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 9px 12px;
            border-radius: var(--radius-md);
            color: var(--text-secondary);
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            border: 1px solid transparent;
            background: transparent;
            width: 100%;
            text-align: left;
            transition: all var(--transition-fast);
            position: relative;
        }

        .nav-item-left {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .nav-item:hover {
            color: var(--text-primary);
            background: rgba(255, 255, 255, 0.03);
        }

        .nav-item.active {
            color: #ffffff;
            background: rgba(139, 92, 246, 0.15);
            border-color: rgba(168, 85, 247, 0.32);
            font-weight: 600;
        }

        .nav-item.active::before {
            content: '';
            position: absolute;
            left: -14px;
            top: 8px;
            bottom: 8px;
            width: 3px;
            border-radius: 0 4px 4px 0;
            background: var(--accent-secondary);
            box-shadow: 0 0 10px var(--accent-secondary);
        }

        .nav-badge {
            font-size: 11px;
            padding: 1px 7px;
            border-radius: 999px;
            background: rgba(168, 85, 247, 0.16);
            color: var(--accent-light);
            font-family: 'JetBrains Mono', monospace;
        }

        .sidebar-footer {
            border-top: 1px solid var(--border-subtle);
            padding-top: 14px;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .health-summary-box {
            background: rgba(14, 11, 24, 0.85);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            padding: 11px 12px;
            font-size: 11.5px;
        }

        /* ==========================================================
           3. ÁREA CENTRAL Y VISTAS INDEPENDIENTES CON TRANSICIÓN
           ========================================================== */
        .main-area {
            padding: 24px 32px 48px;
            max-width: 1440px;
            width: 100%;
            margin: 0 auto;
        }

        .top-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            padding-bottom: 20px;
            margin-bottom: 24px;
            border-bottom: 1px solid var(--border-subtle);
            flex-wrap: wrap;
        }

        .page-title-block h1 {
            font-size: 20px;
            font-weight: 700;
            letter-spacing: -0.02em;
            display: flex;
            align-items: center;
            gap: 10px;
        }

        .page-title-block p {
            color: var(--text-secondary);
            font-size: 12.5px;
            margin-top: 3px;
        }

        .header-actions {
            display: flex;
            align-items: center;
            gap: 10px;
            flex-wrap: wrap;
            position: relative;
        }

        .status-chip {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            padding: 7px 12px;
            background: rgba(15, 12, 26, 0.85);
            border: 1px solid var(--border-subtle);
            border-radius: 999px;
            font-size: 12px;
            color: var(--text-secondary);
        }

        /* Centro de Notificaciones Flotante */
        .notif-btn {
            position: relative;
            width: 36px;
            height: 36px;
            border-radius: var(--radius-md);
            background: rgba(19, 15, 32, 0.9);
            border: 1px solid rgba(168, 85, 247, 0.25);
            color: var(--text-primary);
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: all var(--transition-fast);
        }

        .notif-btn:hover {
            border-color: var(--border-violet-bright);
            background: rgba(139, 92, 246, 0.16);
        }

        .notif-counter {
            position: absolute;
            top: -5px;
            right: -5px;
            min-width: 18px;
            height: 18px;
            padding: 0 5px;
            border-radius: 999px;
            background: var(--accent-secondary);
            color: #fff;
            font-size: 10.5px;
            font-weight: 700;
            display: none;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 10px rgba(168, 85, 247, 0.6);
        }

        .notif-dropdown {
            position: absolute;
            top: 46px;
            right: 0;
            width: 370px;
            background: #0d0a18;
            border: 1px solid var(--border-violet);
            border-radius: var(--radius-lg);
            box-shadow: 0 24px 60px rgba(0, 0, 0, 0.85);
            z-index: 120;
            display: none;
            flex-direction: column;
            overflow: hidden;
            animation: viewEnter 180ms ease;
        }

        .notif-dropdown.open {
            display: flex;
        }

        .notif-head {
            padding: 14px 16px;
            border-bottom: 1px solid var(--border-subtle);
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-weight: 600;
            font-size: 13px;
        }

        .notif-list {
            max-height: 340px;
            overflow-y: auto;
            display: flex;
            flex-direction: column;
        }

        .notif-item {
            padding: 12px 16px;
            border-bottom: 1px solid rgba(255, 255, 255, 0.04);
            display: flex;
            gap: 10px;
            align-items: flex-start;
            font-size: 12.5px;
            transition: background var(--transition-fast);
        }

        .notif-item:hover {
            background: rgba(139, 92, 246, 0.08);
        }

        /* Módulos / Vistas Independientes */
        .module-view {
            display: none;
        }

        .module-view.active {
            display: block;
            animation: viewEnter 240ms cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes viewEnter {
            from {
                opacity: 0;
                transform: translateX(10px);
            }
            to {
                opacity: 1;
                transform: translateX(0);
            }
        }

        /* Tarjetas y Grillas Reutilizables */
        .kpi-grid-4 {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 16px;
            margin-bottom: 22px;
        }

        .kpi-grid-3 {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 18px;
            margin-bottom: 22px;
        }

        .two-col-grid {
            display: grid;
            grid-template-columns: 1.25fr 1fr;
            gap: 20px;
            margin-bottom: 22px;
        }

        .stat-card {
            background: var(--bg-elevated);
            backdrop-filter: blur(16px);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-lg);
            padding: 20px;
            transition: transform var(--transition-smooth), border-color var(--transition-smooth), box-shadow var(--transition-smooth);
        }

        .stat-card:hover {
            transform: translateY(-2px);
            border-color: var(--border-violet);
            box-shadow: 0 14px 32px rgba(0, 0, 0, 0.45);
        }

        .stat-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 10px;
        }

        .stat-title {
            font-size: 11.5px;
            font-weight: 600;
            color: var(--text-secondary);
            text-transform: uppercase;
            letter-spacing: 0.05em;
        }

        .stat-icon {
            width: 34px;
            height: 34px;
            border-radius: 9px;
            background: rgba(139, 92, 246, 0.12);
            border: 1px solid rgba(168, 85, 247, 0.25);
            display: flex;
            align-items: center;
            justify-content: center;
            color: var(--accent-light);
        }

        .stat-number {
            font-size: 28px;
            font-weight: 700;
            letter-spacing: -0.03em;
            color: #ffffff;
        }

        .stat-footer {
            margin-top: 10px;
            padding-top: 10px;
            border-top: 1px solid var(--border-subtle);
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 11.5px;
            color: var(--text-secondary);
        }

        .section-card {
            background: var(--bg-elevated);
            backdrop-filter: blur(16px);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-lg);
            padding: 22px;
            margin-bottom: 20px;
        }

        .section-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            margin-bottom: 16px;
            gap: 12px;
            flex-wrap: wrap;
        }

        .section-head h2 {
            font-size: 15px;
            font-weight: 600;
            color: var(--text-primary);
            display: flex;
            align-items: center;
            gap: 8px;
        }

        /* Badges de Estado */
        .badge-status {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 3px 9px;
            border-radius: 999px;
            font-size: 11px;
            font-weight: 600;
        }

        .badge-status.active, .badge-status.success {
            background: rgba(16, 185, 129, 0.12);
            color: #34d399;
            border: 1px solid rgba(16, 185, 129, 0.3);
        }

        .badge-status.refreshed, .badge-status.info {
            background: rgba(139, 92, 246, 0.15);
            color: #c084fc;
            border: 1px solid rgba(139, 92, 246, 0.35);
        }

        .badge-status.warning {
            background: rgba(245, 158, 11, 0.12);
            color: #fbbf24;
            border: 1px solid rgba(245, 158, 11, 0.35);
        }

        .badge-status.expired, .badge-status.error {
            background: rgba(239, 68, 68, 0.12);
            color: #f87171;
            border: 1px solid rgba(239, 68, 68, 0.3);
        }

        /* Tablas Administrativas */
        .table-toolbar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin-bottom: 16px;
            flex-wrap: wrap;
        }

        .select-pro {
            background: rgba(7, 5, 13, 0.88);
            border: 1px solid rgba(255, 255, 255, 0.09);
            border-radius: var(--radius-md);
            padding: 9px 12px;
            color: var(--text-primary);
            font-size: 12.5px;
            outline: none;
            cursor: pointer;
        }

        .table-wrapper {
            width: 100%;
            overflow-x: auto;
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            background: rgba(8, 6, 15, 0.65);
        }

        table {
            width: 100%;
            border-collapse: collapse;
            text-align: left;
        }

        thead th {
            padding: 12px 16px;
            font-size: 11px;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: var(--text-secondary);
            background: rgba(14, 11, 25, 0.92);
            border-bottom: 1px solid var(--border-subtle);
        }

        tbody tr {
            border-bottom: 1px solid rgba(255, 255, 255, 0.04);
            cursor: pointer;
            transition: background var(--transition-fast);
        }

        tbody tr:last-child { border-bottom: none; }

        tbody tr:hover {
            background: rgba(139, 92, 246, 0.08);
        }

        td {
            padding: 12px 16px;
            vertical-align: middle;
            font-size: 13px;
        }

        .user-cell-flex {
            display: flex;
            align-items: center;
            gap: 11px;
        }

        .user-avatar {
            width: 34px;
            height: 34px;
            border-radius: 50%;
            object-fit: cover;
            border: 1px solid rgba(168, 85, 247, 0.4);
            background: #130f22;
            flex-shrink: 0;
        }

        .pagination-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding-top: 14px;
            font-size: 12px;
            color: var(--text-secondary);
        }

        /* Tarjetas de Servidores Conectados */
        .servers-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 16px;
        }

        .server-card {
            background: rgba(13, 10, 23, 0.85);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-lg);
            padding: 18px;
            cursor: pointer;
            transition: all var(--transition-fast);
            display: flex;
            flex-direction: column;
            gap: 14px;
        }

        .server-card:hover {
            border-color: var(--border-violet-bright);
            transform: translateY(-2px);
            box-shadow: 0 12px 30px rgba(0, 0, 0, 0.5);
        }

        .server-icon {
            width: 46px;
            height: 46px;
            border-radius: 12px;
            background: linear-gradient(135deg, #4c1d95, #7c3aed);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 700;
            font-size: 16px;
            color: #fff;
            object-fit: cover;
            border: 1px solid rgba(168, 85, 247, 0.4);
        }

        /* Barras de progreso e indicadores */
        .progress-track {
            width: 100%;
            height: 9px;
            background: rgba(255, 255, 255, 0.06);
            border-radius: 999px;
            overflow: hidden;
            margin: 10px 0;
        }

        .progress-fill {
            height: 100%;
            width: 0%;
            background: linear-gradient(90deg, #7c3aed, #c084fc);
            border-radius: 999px;
            transition: width 280ms ease;
        }

        .health-row-item {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 11px 14px;
            background: rgba(9, 7, 17, 0.72);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            margin-bottom: 8px;
        }

        /* Drawers y Modales */
        .drawer-backdrop {
            position: fixed;
            inset: 0;
            background: rgba(3, 2, 7, 0.65);
            backdrop-filter: blur(4px);
            z-index: 140;
            opacity: 0;
            pointer-events: none;
            transition: opacity var(--transition-smooth);
        }

        .drawer-backdrop.open {
            opacity: 1;
            pointer-events: auto;
        }

        .side-drawer {
            position: fixed;
            top: 0;
            right: 0;
            width: 100%;
            max-width: 460px;
            height: 100vh;
            background: #0b0815;
            border-left: 1px solid var(--border-violet);
            box-shadow: -20px 0 60px rgba(0, 0, 0, 0.85);
            z-index: 150;
            transform: translateX(100%);
            transition: transform var(--transition-smooth);
            display: flex;
            flex-direction: column;
        }

        .side-drawer.open {
            transform: translateX(0);
        }

        .drawer-header {
            padding: 22px 24px;
            border-bottom: 1px solid var(--border-subtle);
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 14px;
            background: linear-gradient(180deg, rgba(139, 92, 246, 0.1) 0%, transparent 100%);
        }

        .drawer-content {
            padding: 20px 24px;
            overflow-y: auto;
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: 18px;
        }

        .info-grid-card {
            background: rgba(15, 12, 26, 0.78);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-md);
            padding: 15px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 13px;
        }

        .info-cell-label {
            font-size: 10.5px;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin-bottom: 3px;
        }

        .info-cell-val {
            font-size: 12.5px;
            color: var(--text-primary);
            font-weight: 500;
            word-break: break-all;
        }

        .timeline-list {
            display: flex;
            flex-direction: column;
            gap: 10px;
            position: relative;
            padding-left: 16px;
            border-left: 1px solid rgba(168, 85, 247, 0.3);
            margin-left: 8px;
        }

        .timeline-node {
            position: relative;
            background: rgba(15, 12, 26, 0.72);
            border: 1px solid var(--border-subtle);
            border-radius: var(--radius-sm);
            padding: 10px 12px;
        }

        .timeline-node::before {
            content: '';
            position: absolute;
            left: -21px;
            top: 14px;
            width: 9px;
            height: 9px;
            border-radius: 50%;
            background: var(--accent-secondary);
            box-shadow: 0 0 8px var(--accent-secondary);
        }

        .modal-overlay {
            position: fixed;
            inset: 0;
            background: rgba(3, 2, 8, 0.72);
            backdrop-filter: blur(5px);
            z-index: 160;
            display: none;
            align-items: center;
            justify-content: center;
            padding: 20px;
        }

        .modal-overlay.active {
            display: flex;
            animation: viewEnter 180ms ease;
        }

        .modal-box {
            background: #0d0a18;
            border: 1px solid var(--border-violet);
            border-radius: var(--radius-lg);
            max-width: 540px;
            width: 100%;
            padding: 24px;
            box-shadow: 0 25px 60px rgba(0, 0, 0, 0.85);
        }

        .toast-container {
            position: fixed;
            bottom: 22px;
            right: 22px;
            z-index: 220;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }

        .toast {
            background: rgba(16, 12, 28, 0.96);
            border: 1px solid var(--border-violet);
            border-left: 4px solid var(--accent-secondary);
            color: var(--text-primary);
            padding: 11px 15px;
            border-radius: var(--radius-md);
            font-size: 12.5px;
            box-shadow: 0 12px 30px rgba(0, 0, 0, 0.65);
            display: flex;
            align-items: center;
            gap: 10px;
            animation: viewEnter 200ms ease;
        }

        /* Toggle Switch Settings */
        .setting-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 14px 0;
            border-bottom: 1px solid var(--border-subtle);
            gap: 16px;
        }
        .setting-row:last-child { border-bottom: none; }

        .switch-btn {
            width: 44px;
            height: 24px;
            border-radius: 999px;
            background: rgba(255, 255, 255, 0.12);
            border: 1px solid var(--border-subtle);
            position: relative;
            cursor: pointer;
            transition: background var(--transition-fast);
            flex-shrink: 0;
        }

        .switch-btn.on {
            background: var(--accent-primary);
            border-color: var(--accent-secondary);
        }

        .switch-btn::after {
            content: '';
            position: absolute;
            top: 2px;
            left: 2px;
            width: 18px;
            height: 18px;
            border-radius: 50%;
            background: #fff;
            transition: transform var(--transition-fast);
        }

        .switch-btn.on::after {
            transform: translateX(20px);
        }

        @media (max-width: 1100px) {
            .app-shell { grid-template-columns: 1fr; }
            .sidebar { position: relative; height: auto; }
            .kpi-grid-4, .kpi-grid-3, .two-col-grid { grid-template-columns: 1fr; }
        }

        @media (prefers-reduced-motion: reduce) {
            *, *::before, *::after {
                animation-duration: 0.01ms !important;
                transition-duration: 0.01ms !important;
            }
        }
    </style>
</head>
<body>

    <div class="ambient-glow"></div>

    <!-- ==========================================================
         1. PANTALLA DE INICIO DE SESIÓN (KYVENICON + CAMPO VACÍO)
         ========================================================== -->
    <section id="loginScreen">
        <canvas id="particleCanvas"></canvas>

        <div class="login-container">
            <div class="login-brand-header">
                <div class="login-brand-title">KYVEN RESTORE</div>
                <div class="login-brand-sub">Control Center 2.0 • Acceso Privado</div>
            </div>

            <div class="login-card">
                <div class="kyven-brand-frame" title="KYVENICON Oficial">
                    <img src="/api/brand-icon" alt="KYVENICON" />
                </div>

                <div class="login-tabs">
                    <button type="button" class="login-tab active" id="tabBtnAuth" onclick="switchLoginTab('auth')">Autenticación</button>
                    <button type="button" class="login-tab" id="tabBtnStatus" onclick="switchLoginTab('status')">Estado del Sistema</button>
                </div>

                <!-- Sub-vista 1: Formulario de Acceso (Usuario completamente vacío) -->
                <div id="loginAuthPane">
                    <div class="login-alert" id="loginAlertBox">
                        <span id="loginAlertText">Credenciales inválidas</span>
                    </div>

                    <div class="form-group">
                        <label class="form-label">
                            <span>Usuario Administrador</span>
                            <span class="mono" style="font-size:11px;color:var(--accent-light);">PRIVADO</span>
                        </label>
                        <div class="input-wrapper">
                            <svg class="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                            <input type="text" id="loginUser" class="input-field" value="" placeholder="Ingresa tu usuario administrador" autocomplete="off" spellcheck="false" onkeydown="if(event.key==='Enter') handleLogin()" />
                        </div>
                    </div>

                    <div class="form-group" style="margin-bottom:22px;">
                        <label class="form-label">
                            <span>Código de Seguridad Personal (PIN)</span>
                            <span style="font-size:11px;color:var(--text-muted);">SHA-256</span>
                        </label>
                        <div class="input-wrapper">
                            <svg class="input-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                            <input type="password" id="loginPin" class="input-field" value="" placeholder="••••••••••" autocomplete="off" onkeydown="if(event.key==='Enter') handleLogin()" />
                        </div>
                    </div>

                    <button type="button" class="btn-primary" id="loginBtn" onclick="handleLogin()">
                        <span id="loginBtnText">Ingresar a Control Center</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>
                    </button>
                </div>

                <!-- Sub-vista 2: Estado del Sistema Funcional en el Login -->
                <div id="loginStatusPane" style="display:none;">
                    <div class="health-row-item">
                        <span style="color:var(--text-secondary);">Clúster MongoDB Atlas</span>
                        <span style="display:flex;align-items:center;gap:6px;font-weight:600;" id="pubMongoState">
                            <span class="dot" id="pubMongoDot"></span> Verificando...
                        </span>
                    </div>
                    <div class="health-row-item">
                        <span style="color:var(--text-secondary);">Discord Gateway Bot</span>
                        <span style="display:flex;align-items:center;gap:6px;font-weight:600;" id="pubBotState">
                            <span class="dot" id="pubBotDot"></span> Verificando...
                        </span>
                    </div>
                    <div class="health-row-item">
                        <span style="color:var(--text-secondary);">Latencia WebSocket</span>
                        <span class="mono" id="pubBotPing">-- ms</span>
                    </div>
                    <div class="health-row-item">
                        <span style="color:var(--text-secondary);">Tiempo Activo del Servidor</span>
                        <span class="mono" id="pubUptime">--</span>
                    </div>
                    <button type="button" class="btn-secondary" style="width:100%;justify-content:center;margin-top:10px;" onclick="verificarSaludPublica(true)">
                        🔄 Comprobar Estado Ahora
                    </button>
                </div>
            </div>
        </div>
    </section>

    <!-- ==========================================================
         2. APLICACIÓN SPA MULTI-MÓDULO (7 APARTADOS INDEPENDIENTES)
         ========================================================== -->
    <div id="dashboardApp">
        <div class="app-shell">
            <!-- Barra Lateral Categorizada -->
            <aside class="sidebar">
                <div>
                    <div class="sidebar-brand">
                        <img class="sidebar-brand-img" src="/api/brand-icon" alt="KYVENICON" />
                        <div>
                            <div style="font-weight:700;font-size:14px;letter-spacing:-0.02em;color:#fff;">KYVEN RESTORE</div>
                            <div style="font-size:10.5px;color:var(--accent-light);letter-spacing:0.08em;">CONTROL CENTER 2.0</div>
                        </div>
                    </div>

                    <!-- CATEGORÍA 1: GENERAL -->
                    <div class="nav-group">
                        <div class="nav-group-label">General</div>
                        <div class="nav-list">
                            <button class="nav-item active" data-module="overview" onclick="switchModule('overview')">
                                <span class="nav-item-left">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                                    <span>Overview</span>
                                </span>
                            </button>
                            <button class="nav-item" data-module="activity" onclick="switchModule('activity')">
                                <span class="nav-item-left">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                                    <span>Activity Log</span>
                                </span>
                                <span class="nav-badge" id="navBadgeActivity">0</span>
                            </button>
                        </div>
                    </div>

                    <!-- CATEGORÍA 2: OPERACIONES -->
                    <div class="nav-group">
                        <div class="nav-group-label">Operaciones</div>
                        <div class="nav-list">
                            <button class="nav-item" data-module="restore" onclick="switchModule('restore')">
                                <span class="nav-item-left">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                                    <span>Restore Center</span>
                                </span>
                                <span class="nav-badge" id="navBadgeRestore" style="display:none;">ACTIVO</span>
                            </button>
                            <button class="nav-item" data-module="members" onclick="switchModule('members')">
                                <span class="nav-item-left">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                                    <span>Verified Members</span>
                                </span>
                                <span class="nav-badge" id="navBadgeMembers">0</span>
                            </button>
                            <button class="nav-item" data-module="servers" onclick="switchModule('servers')">
                                <span class="nav-item-left">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><line x1="6" y1="6" x2="6.01" y2="6"/><line x1="6" y1="18" x2="6.01" y2="18"/></svg>
                                    <span>Connected Servers</span>
                                </span>
                                <span class="nav-badge" id="navBadgeServers">0</span>
                            </button>
                        </div>
                    </div>

                    <!-- CATEGORÍA 3: SISTEMA -->
                    <div class="nav-group">
                        <div class="nav-group-label">Sistema</div>
                        <div class="nav-list">
                            <button class="nav-item" data-module="security" onclick="switchModule('security')">
                                <span class="nav-item-left">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                                    <span>Security Center</span>
                                </span>
                            </button>
                            <button class="nav-item" data-module="settings" onclick="switchModule('settings')">
                                <span class="nav-item-left">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                                    <span>Settings</span>
                                </span>
                            </button>
                            <button class="nav-item" data-module="commands" onclick="switchModule('commands')"><span class="nav-item-left"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg><span>Comandos</span></span><span class="nav-badge" id="stagedCountBadge" style="display:none;">0</span></button>
                        </div>
                    </div>
                </div>

                <div class="sidebar-footer">
                    <div class="health-summary-box">
                        <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
                            <span style="color:var(--text-muted);">Administrador</span>
                            <span id="sideAdminName" style="color:var(--accent-light);font-weight:600;">Catrii</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
                            <span style="color:var(--text-muted);">MongoDB Atlas</span>
                            <span id="sideMongoStatus" style="color:var(--success);font-weight:600;">Conectado</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;">
                            <span style="color:var(--text-muted);">Hora Local</span>
                            <span id="liveClock" class="mono">--:--:--</span>
                        </div>
                    </div>
                </div>
            </aside>

            <!-- Contenedor de Páginas -->
            <main class="main-area">
                <!-- Barra Superior Global con Centro de Notificaciones -->
                <header class="top-header">
                    <div class="page-title-block">
                        <h1>
                            <span id="currentModuleTitle">Overview — Resumen General</span>
                        </h1>
                        <p id="currentModuleSubtitle">Estado global del sistema • Última sincronización: <span id="lastSyncLabel">--</span></p>
                    </div>

                    <div class="header-actions">
                        <div class="status-chip">
                            <span class="dot" id="headerHealthDot"></span>
                            <span id="headerBotTag">Conectando...</span>
                        </div>

                        <!-- Botón Centro de Notificaciones -->
                        <button type="button" class="notif-btn" onclick="toggleNotifCenter(event)" title="Centro de Notificaciones">
                            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
                            <span class="notif-counter" id="notifBadgeCount">0</span>
                        </button>

                        <!-- Dropdown de Notificaciones -->
                        <div class="notif-dropdown" id="notifDropdown" onclick="event.stopPropagation()">
                            <div class="notif-head">
                                <span>Centro de Notificaciones</span>
                                <button type="button" class="btn-secondary" style="padding:3px 8px;font-size:11px;" onclick="marcarNotificacionesLeidas()">Marcar leídas</button>
                            </div>
                            <div class="notif-list" id="notifListContainer"></div>
                        </div>

                        <button type="button" class="btn-secondary" onclick="sincronizarManual()">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
                            <span>Sincronizar</span>
                        </button>

                        <button type="button" class="btn-danger-ghost" onclick="cerrarSesion()">
                            <span>Salir</span>
                        </button>
                    </div>
                </header>

                <!-- ======================================================
                     MÓDULO 1: OVERVIEW (EXCLUSIVAMENTE RESUMEN GENERAL)
                     ====================================================== -->
                <section id="view-overview" class="module-view active">
                    <div class="kpi-grid-4">
                        <div class="stat-card">
                            <div class="stat-header">
                                <span class="stat-title">Usuarios Verificados</span>
                                <div class="stat-icon">
                                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                                </div>
                            </div>
                            <div style="display:flex;align-items:baseline;justify-content:space-between;">
                                <div class="stat-number mono" id="ovTotalUsers">0</div>
                                <svg id="ovSparklineUsers" width="84" height="26" viewBox="0 0 84 26"></svg>
                            </div>
                            <div class="stat-footer">
                                <span id="ovActiveTokensLabel">0 con OAuth2 activo</span>
                                <span style="color:var(--accent-light);cursor:pointer;" onclick="switchModule('members')">Ver directorio →</span>
                            </div>
                        </div>

                        <div class="stat-card">
                            <div class="stat-header">
                                <span class="stat-title">Servidores Conectados</span>
                                <div class="stat-icon">
                                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/></svg>
                                </div>
                            </div>
                            <div class="stat-number mono" id="ovTotalGuilds">0</div>
                            <div class="stat-footer">
                                <span id="ovGuildReachLabel">Alcance: 0 miembros</span>
                                <span style="color:var(--accent-light);cursor:pointer;" onclick="switchModule('servers')">Administrar →</span>
                            </div>
                        </div>

                        <div class="stat-card">
                            <div class="stat-header">
                                <span class="stat-title">Sistema OAuth2 & DB</span>
                                <div class="stat-icon">
                                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                                </div>
                            </div>
                            <div class="stat-number" id="ovSystemStatusText" style="font-size:21px;">Operativo</div>
                            <div class="stat-footer">
                                <span id="ovMongoStateSmall">MongoDB Atlas Activo</span>
                                <span class="mono" id="ovPingSmall">-- ms</span>
                            </div>
                        </div>

                        <div class="stat-card">
                            <div class="stat-header">
                                <span class="stat-title">Motor Anti-Rate Limit</span>
                                <div class="stat-icon">
                                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                                </div>
                            </div>
                            <div class="stat-number" id="ovQueueStateText" style="font-size:21px;">En Espera</div>
                            <div class="stat-footer">
                                <span id="ovLastRestoreSummary">Sin lote activo</span>
                                <span style="color:var(--accent-light);cursor:pointer;" onclick="switchModule('restore')">Restore Center →</span>
                            </div>
                        </div>
                    </div>

                    <div class="two-col-grid">
                        <!-- Salud de los Servicios en Tiempo Real -->
                        <div class="section-card">
                            <div class="section-head">
                                <h2>Estado y Salud de Servicios</h2>
                                <span class="badge-status active" id="ovHealthGlobalBadge">Todos los sistemas operativos</span>
                            </div>

                            <div class="health-row-item">
                                <div>
                                    <div style="font-weight:600;">Clúster MongoDB Atlas</div>
                                    <div style="font-size:11.5px;color:var(--text-muted);">Almacenamiento persistente de credenciales OAuth2 y auditoría</div>
                                </div>
                                <span class="badge-status active" id="ovHealthMongo">Conectado</span>
                            </div>

                            <div class="health-row-item">
                                <div>
                                    <div style="font-weight:600;">Cliente Discord Gateway</div>
                                    <div style="font-size:11.5px;color:var(--text-muted);" id="ovHealthBotDetail">Sesión activa del bot</div>
                                </div>
                                <span class="badge-status active" id="ovHealthBot">En Línea</span>
                            </div>

                            <div class="health-row-item">
                                <div>
                                    <div style="font-weight:600;">Pasarela OAuth2 (guilds.join + identify)</div>
                                    <div style="font-size:11.5px;color:var(--text-muted);">Renovación automática de tokens caducados habilitada</div>
                                </div>
                                <span class="badge-status active" id="ovHealthOAuth">Configurado</span>
                            </div>

                            <div class="health-row-item" style="margin-bottom:0;">
                                <div>
                                    <div style="font-weight:600;">Protección Anti-Rate Limit</div>
                                    <div style="font-size:11.5px;color:var(--text-muted);">Cadencia regulada a 1.35s por miembro (máx. 500 por lote)</div>
                                </div>
                                <span class="badge-status info">1.35s / req</span>
                            </div>
                        </div>

                        <!-- Resumen de Actividad Reciente -->
                        <div class="section-card">
                            <div class="section-head">
                                <h2>Resumen de Actividad Reciente</h2>
                                <button type="button" class="btn-secondary" style="padding:5px 10px;font-size:11.5px;" onclick="switchModule('activity')">Abrir Activity Log →</button>
                            </div>
                            <div id="ovRecentActivitiesList" style="display:flex;flex-direction:column;gap:8px;"></div>
                        </div>
                    </div>

                    <!-- Últimas Operaciones Importantes de Restauración -->
                    <div class="section-card">
                        <div class="section-head">
                            <h2>Últimas Operaciones de Restauración Registradas</h2>
                            <button type="button" class="btn-secondary" style="padding:5px 10px;font-size:11.5px;" onclick="switchModule('restore')">Ir a Restore Center →</button>
                        </div>
                        <div class="table-wrapper">
                            <table>
                                <thead>
                                    <tr>
                                        <th>ID Operación</th>
                                        <th>Servidor Destino</th>
                                        <th>Estado</th>
                                        <th>Completados / Procesados</th>
                                        <th>Fecha</th>
                                    </tr>
                                </thead>
                                <tbody id="ovLastRestoresBody"></tbody>
                            </table>
                        </div>
                    </div>
                </section>

                <!-- ======================================================
                     MÓDULO 2: ACTIVITY LOG (REGISTRO DE ACTIVIDAD COMPLETO)
                     ====================================================== -->
                <section id="view-activity" class="module-view">
                    <div class="section-card">
                        <div class="section-head">
                            <h2>Registro Cronológico de Actividad del Sistema</h2>
                            <span id="actTotalLabel" style="font-size:12px;color:var(--text-secondary);">0 eventos registrados</span>
                        </div>

                        <div class="table-toolbar">
                            <div style="flex:1;min-width:240px;">
                                <input type="text" id="actSearchInput" class="input-field no-icon" placeholder="Buscar por descripción, ID o detalle del evento..." oninput="renderActivityLogModule(1)" />
                            </div>
                            <div style="display:flex;gap:10px;flex-wrap:wrap;">
                                <select id="actTypeFilter" class="select-pro" onchange="renderActivityLogModule(1)">
                                    <option value="all">Tipo: Todos los eventos</option>
                                    <option value="verify">Usuarios Verificados</option>
                                    <option value="user_update">Actualizaciones de Usuario</option>
                                    <option value="restore_start">Restauraciones Iniciadas</option>
                                    <option value="restore_end">Restauraciones Finalizadas</option>
                                    <option value="guild_connect">Servidores Conectados</option>
                                    <option value="guild_disconnect">Servidores Desconectados</option>
                                    <option value="auth">Eventos de Autenticación</option>
                                    <option value="error">Errores y Sincronización</option>
                                    <option value="system">Eventos de Sistema</option>
                                </select>

                                <select id="actSeverityFilter" class="select-pro" onchange="renderActivityLogModule(1)">
                                    <option value="all">Severidad: Todas</option>
                                    <option value="success">Éxito</option>
                                    <option value="info">Información</option>
                                    <option value="warning">Advertencia</option>
                                    <option value="error">Error</option>
                                </select>

                                <input type="date" id="actDateFilter" class="select-pro" onchange="renderActivityLogModule(1)" />
                            </div>
                        </div>

                        <div class="table-wrapper">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Estado</th>
                                        <th>Categoría</th>
                                        <th>Acontecimiento</th>
                                        <th>Detalles Técnicos</th>
                                        <th>Fecha y Hora Exacta</th>
                                    </tr>
                                </thead>
                                <tbody id="actTableBody"></tbody>
                            </table>
                        </div>

                        <div class="pagination-bar">
                            <span id="actPaginationInfo">Página 1 de 1</span>
                            <div style="display:flex;gap:6px;">
                                <button type="button" class="btn-secondary" id="actPrevBtn" onclick="cambiarPaginaActivity(-1)">Anterior</button>
                                <button type="button" class="btn-secondary" id="actNextBtn" onclick="cambiarPaginaActivity(1)">Siguiente</button>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- ======================================================
                     MÓDULO 3: RESTORE CENTER (CENTRO DE RESTABLECIMIENTO)
                     ====================================================== -->
                <section id="view-restore" class="module-view">
                    <div class="two-col-grid">
                        <!-- Panel de Configuración y Lanzamiento -->
                        <div class="section-card">
                            <div class="section-head">
                                <h2>Configurar Operación en Restore Center</h2>
                                <span class="badge-status info">Máx. 500 por lote</span>
                            </div>

                            <div class="form-group">
                                <label class="form-label">
                                    <span>Seleccionar Servidor Asociado</span>
                                    <span style="color:var(--text-muted);">Bot presente</span>
                                </label>
                                <select id="rcGuildSelect" class="input-field no-icon"></select>
                            </div>

                            <div class="form-group">
                                <label class="form-label">
                                    <span>O Introducir ID de Servidor Manualmente</span>
                                    <span class="mono" style="color:var(--text-muted);">Opcional</span>
                                </label>
                                <input type="text" id="rcCustomGuildId" class="input-field no-icon mono" placeholder="Ej: 1547412298145202226" />
                            </div>

                            <div class="form-group" style="margin-bottom:20px;">
                                <label class="form-label">
                                    <span>Cantidad de Miembros a Transferir (1 - 500)</span>
                                    <span id="rcAvailableHint" style="color:var(--accent-light);">Disponibles: 0</span>
                                </label>
                                <input type="number" id="rcPullAmount" class="input-field no-icon mono" value="500" min="1" max="500" />
                            </div>

                            <button type="button" class="btn-primary" id="rcStartBtn" onclick="solicitarConfirmacionRestore()">
                                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                                <span>Iniciar Restauración en Restore Center</span>
                            </button>
                        </div>

                        <!-- Telemetría de Operación en Tiempo Real -->
                        <div class="section-card">
                            <div class="section-head">
                                <h2>Estado de la Operación Actual</h2>
                                <span class="badge-status info" id="rcLiveStatusBadge">En Espera</span>
                            </div>

                            <div style="display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px;">
                                <span id="rcLiveTargetLabel" style="color:var(--text-secondary);">Ninguna operación ejecutándose</span>
                                <span class="mono" id="rcLivePctLabel" style="color:var(--accent-light);font-weight:700;">0%</span>
                            </div>

                            <div class="progress-track">
                                <div class="progress-fill" id="rcLiveProgressBar"></div>
                            </div>

                            <div class="info-grid-card" style="margin-top:14px;">
                                <div>
                                    <div class="info-cell-label">Cantidad Procesada</div>
                                    <div class="info-cell-val mono" id="rcMetricProcessed">0</div>
                                </div>
                                <div>
                                    <div class="info-cell-label">Cantidad Pendiente</div>
                                    <div class="info-cell-val mono" id="rcMetricPending">0</div>
                                </div>
                                <div>
                                    <div class="info-cell-label">Unidos / Ya Presentes</div>
                                    <div class="info-cell-val mono" id="rcMetricCompleted" style="color:var(--success);">0 / 0</div>
                                </div>
                                <div>
                                    <div class="info-cell-label">Errores Encontrados</div>
                                    <div class="info-cell-val mono" id="rcMetricErrors" style="color:var(--danger);">0</div>
                                </div>
                                <div style="grid-column:span 2;">
                                    <div class="info-cell-label">Tiempo Transcurrido</div>
                                    <div class="info-cell-val mono" id="rcMetricElapsed">00:00</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Historial Persistente de Restauraciones -->
                    <div class="section-card">
                        <div class="section-head">
                            <h2>Historial de Restauraciones Ejecutadas</h2>
                            <span style="font-size:12px;color:var(--text-secondary);">Haz clic en cualquier operación para inspeccionar su reporte detallado</span>
                        </div>

                        <div class="table-wrapper">
                            <table>
                                <thead>
                                    <tr>
                                        <th>ID Operación</th>
                                        <th>Servidor Destino</th>
                                        <th>Estado</th>
                                        <th>Procesados</th>
                                        <th>Unidos</th>
                                        <th>Ya Presentes</th>
                                        <th>Errores</th>
                                        <th>Duración</th>
                                        <th>Fecha de Inicio</th>
                                        <th style="text-align:right;">Detalle</th>
                                    </tr>
                                </thead>
                                <tbody id="rcHistoryTableBody"></tbody>
                            </table>
                        </div>
                    </div>
                </section>

                <!-- ======================================================
                     MÓDULO 4: VERIFIED MEMBERS (DIRECTORIO EXCLUSIVO)
                     ====================================================== -->
                <section id="view-members" class="module-view">
                    <div class="section-card">
                        <div class="section-head">
                            <h2>Directorio de Miembros Verificados (OAuth2)</h2>
                            <span id="vmCountSummary" style="font-size:12.5px;color:var(--text-secondary);">Mostrando 0 usuarios</span>
                        </div>

                        <div class="table-toolbar">
                            <div style="flex:1;min-width:260px;">
                                <input type="text" id="vmSearchInput" class="input-field no-icon" placeholder="Buscar por nombre de usuario o ID de Discord..." oninput="renderMembersModule(1)" />
                            </div>

                            <div style="display:flex;gap:10px;flex-wrap:wrap;">
                                <select id="vmStatusFilter" class="select-pro" onchange="renderMembersModule(1)">
                                    <option value="all">Estado OAuth2: Todos</option>
                                    <option value="active">OAuth2 Activo</option>
                                    <option value="refreshed">Token Renovado</option>
                                    <option value="expired">Token Expirado</option>
                                </select>

                                <select id="vmSortSelect" class="select-pro" onchange="renderMembersModule(1)">
                                    <option value="verify_desc">Verificación: Más recientes</option>
                                    <option value="verify_asc">Verificación: Más antiguos</option>
                                    <option value="created_desc">Creación registro: Más recientes</option>
                                    <option value="created_asc">Creación registro: Más antiguos</option>
                                </select>
                            </div>
                        </div>

                        <div class="table-wrapper">
                            <table>
                                <thead>
                                    <tr>
                                        <th>Miembro</th>
                                        <th>ID de Discord</th>
                                        <th>Estado del Token</th>
                                        <th>Fecha de Verificación</th>
                                        <th>Creación del Registro</th>
                                        <th>Creación Cuenta Discord</th>
                                        <th style="text-align:right;">Perfil</th>
                                    </tr>
                                </thead>
                                <tbody id="vmTableBody"></tbody>
                            </table>
                        </div>

                        <div class="pagination-bar">
                            <span id="vmPaginationInfo">Página 1 de 1</span>
                            <div style="display:flex;gap:6px;">
                                <button type="button" class="btn-secondary" id="vmPrevBtn" onclick="cambiarPaginaMembers(-1)">Anterior</button>
                                <button type="button" class="btn-secondary" id="vmNextBtn" onclick="cambiarPaginaMembers(1)">Siguiente</button>
                            </div>
                        </div>
                    </div>
                </section>

                <!-- ======================================================
                     MÓDULO 5: CONNECTED SERVERS (SERVIDORES CONECTADOS)
                     ====================================================== -->
                <section id="view-servers" class="module-view">
                    <div class="section-card">
                        <div class="section-head">
                            <h2>Servidores Asociados al Sistema</h2>
                            <span id="csSummaryLabel" style="font-size:12.5px;color:var(--text-secondary);">0 servidores conectados</span>
                        </div>

                        <div class="table-toolbar">
                            <div style="flex:1;min-width:240px;">
                                <input type="text" id="csSearchInput" class="input-field no-icon" placeholder="Buscar servidor por nombre o ID..." oninput="renderServersModule()" />
                            </div>
                            <select id="csFilterSelect" class="select-pro" onchange="renderServersModule()">
                                <option value="all">Permisos: Todos los servidores</option>
                                <option value="admin">Con Administrador Completo</option>
                                <option value="primary">Servidor Principal</option>
                            </select>
                        </div>

                        <div class="servers-grid" id="csServersGrid"></div>
                    </div>
                </section>

                <!-- ======================================================
                     MÓDULO 6: SECURITY CENTER (CENTRO DE SEGURIDAD)
                     ====================================================== -->
                <section id="view-security" class="module-view">
                    <div class="kpi-grid-3">
                        <div class="stat-card">
                            <div class="stat-header">
                                <span class="stat-title">Sesiones Administrativas</span>
                                <span class="badge-status active">SHA-256</span>
                            </div>
                            <div class="stat-number mono" id="secActiveSessions">1</div>
                            <div class="stat-footer">
                                <span id="secSessionExpiryLabel">Expira en 12h</span>
                                <button type="button" class="btn-secondary" style="padding:3px 8px;font-size:11px;" onclick="revocarOtrasSesiones()">Cerrar otras</button>
                            </div>
                        </div>

                        <div class="stat-card">
                            <div class="stat-header">
                                <span class="stat-title">Escudo Anti-Fuerza Bruta</span>
                                <span class="badge-status active" id="secBruteBadge">Protegido</span>
                            </div>
                            <div class="stat-number mono" id="secFailedAttempts">0</div>
                            <div class="stat-footer">
                                <span id="secBlockedIpsLabel">0 IPs bloqueadas</span>
                                <span>Límite: 5 intentos</span>
                            </div>
                        </div>

                        <div class="stat-card">
                            <div class="stat-header">
                                <span class="stat-title">Salud de Tokens OAuth2</span>
                                <span class="badge-status info">Encriptación TLS</span>
                            </div>
                            <div class="stat-number mono" id="secOAuthHealthy">0</div>
                            <div class="stat-footer">
                                <span id="secOAuthBreakdown">Renovados: 0 • Expirados: 0</span>
                            </div>
                        </div>
                    </div>

                    <div class="two-col-grid">
                        <div class="section-card">
                            <div class="section-head">
                                <h2>Estado de Integraciones y Controles de Seguridad</h2>
                                <button type="button" class="btn-secondary" style="padding:5px 10px;font-size:11.5px;" onclick="ejecutarPingServicios()">Comprobar Servicios</button>
                            </div>

                            <div class="health-row-item">
                                <span>Autenticación de Panel Privado (Usuario: Catrii)</span>
                                <span class="badge-status active">Verificado</span>
                            </div>
                            <div class="health-row-item">
                                <span>Protección de Comandos Discord (Modal BACKUP_PIN)</span>
                                <span class="badge-status active">Activa</span>
                            </div>
                            <div class="health-row-item">
                                <span>Protección Anti-Rate Limit en Transferencias</span>
                                <span class="badge-status info">1350ms / usuario</span>
                            </div>
                            <div class="health-row-item">
                                <span>Ocultación de Tokens OAuth2 y Secretos en Frontend</span>
                                <span class="badge-status active">100% Filtrado en API</span>
                            </div>
                            <div class="health-row-item" style="margin-bottom:0;">
                                <span>Última Comprobación de Servicios Externos</span>
                                <span class="mono" id="secLastCheckTime">--</span>
                            </div>
                        </div>

                        <div class="section-card">
                            <div class="section-head">
                                <h2>Eventos Recientes de Seguridad y Acceso</h2>
                            </div>
                            <div id="secEventsList" style="display:flex;flex-direction:column;gap:8px;max-height:280px;overflow-y:auto;"></div>
                        </div>
                    </div>
                </section>

                <!-- ======================================================
                     MÓDULO 7: SETTINGS (CONFIGURACIÓN DEL PANEL)
                     ====================================================== -->
                <section id="view-settings" class="module-view">
                    <div class="two-col-grid">
                        <div class="section-card">
                            <div class="section-head">
                                <h2>Preferencias Visuales y de Experiencia</h2>
                            </div>

                            <div class="setting-row">
                                <div>
                                    <div style="font-weight:600;">Animaciones y Transiciones Fluidas</div>
                                    <div style="font-size:12px;color:var(--text-muted);">Habilitar transiciones suaves al cambiar de módulo y partículas en login</div>
                                </div>
                                <button type="button" class="switch-btn on" id="toggleAnimationsBtn" onclick="togglePreference('animations')"></button>
                            </div>

                            <div class="setting-row">
                                <div>
                                    <div style="font-weight:600;">Modo de Tabla Compacta</div>
                                    <div style="font-size:12px;color:var(--text-muted);">Reducir el espaciado vertical en Verified Members y Activity Log</div>
                                </div>
                                <button type="button" class="switch-btn" id="toggleCompactBtn" onclick="togglePreference('compact')"></button>
                            </div>

                            <div class="setting-row">
                                <div>
                                    <div style="font-weight:600;">Notificaciones Emergentes (Toasts)</div>
                                    <div style="font-size:12px;color:var(--text-muted);">Mostrar avisos en tiempo real cuando se verifiquen nuevos miembros o finalice un restore</div>
                                </div>
                                <button type="button" class="switch-btn on" id="toggleToastsBtn" onclick="togglePreference('toasts')"></button>
                            </div>

                            <div class="setting-row">
                                <div>
                                    <div style="font-weight:600;">Intervalo de Sincronización Automática</div>
                                    <div style="font-size:12px;color:var(--text-muted);">Frecuencia con la que el panel consulta a MongoDB Atlas</div>
                                </div>
                                <select id="settingSyncInterval" class="select-pro" onchange="cambiarIntervaloSync()">
                                    <option value="5000">Cada 5 segundos</option>
                                    <option value="8000" selected>Cada 8 segundos (Recomendado)</option>
                                    <option value="15000">Cada 15 segundos</option>
                                    <option value="30000">Cada 30 segundos</option>
                                </select>
                            </div>
                        </div>

                        <div class="section-card">
                            <div class="section-head">
                                <h2>Información de la Aplicación e Integraciones</h2>
                            </div>

                            <div class="info-grid-card" style="margin-bottom:16px;">
                                <div>
                                    <div class="info-cell-label">Versión del Sistema</div>
                                    <div class="info-cell-val mono">KYVEN RESTORE 2.0</div>
                                </div>
                                <div>
                                    <div class="info-cell-label">Entorno Node.js</div>
                                    <div class="info-cell-val mono" id="setNodeVer">--</div>
                                </div>
                                <div>
                                    <div class="info-cell-label">Identidad del Bot</div>
                                    <div class="info-cell-val" id="setBotTag">--</div>
                                </div>
                                <div>
                                    <div class="info-cell-label">Base de Datos</div>
                                    <div class="info-cell-val" id="setMongoState">MongoDB Atlas</div>
                                </div>
                            </div>

                            <button type="button" class="btn-secondary" style="width:100%;justify-content:center;" onclick="ejecutarPingServicios()">
                                ⚡ Ejecutar Diagnóstico de Latencia (MongoDB & Discord)
                            </button>
                        </div>
                    </div>
                </section>
                <section id="view-commands" class="module-view">
                    <div class="section-card" style="margin-bottom:14px;padding:16px;border-radius:12px;background:rgba(16,13,27,.82);border:1px solid rgba(255,255,255,.07);">
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                            <div style="display:flex;align-items:center;gap:10px;">
                                <input id="commandSearch" placeholder="&#128269; Buscar comando..." style="background:#07050e;border:1px solid rgba(255,255,255,.09);border-radius:10px;color:#f8fafc;padding:9px 12px;width:260px;">
                                <select id="commandCategory" style="background:#07050e;border:1px solid rgba(255,255,255,.09);border-radius:10px;padding:9px 12px;color:#f8fafc;"><option value="">Todas las categorias</option></select>
                            </div>
                            <div style="display:flex;align-items:center;justify-content:flex-end;gap:8px;">
                                <button onclick="CommandEditor.create()" style="background:#9333ea;color:#fff;padding:8px 14px;border:0;border-radius:10px;font-size:12px;font-weight:600;">+ Crear Comando</button>
                                <button onclick="CommandEditor.duplicate()" style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#e2e8f0;padding:8px 14px;border-radius:10px;font-size:12px;">Duplicar</button>
                                <button onclick="CommandEditor.rename()" style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);color:#e2e8f0;padding:8px 14px;border-radius:10px;font-size:12px;">Renombrar</button>
                                <button onclick="CommandEditor.remove()" style="background:rgba(239,68,68,.2);border:1px solid rgba(239,68,68,.35);color:#fca5a5;padding:8px 14px;border-radius:10px;font-size:12px;font-weight:600;">Eliminar</button>
                            </div>
                        </div>
                    </div>
                    <div style="display:grid;grid-template-columns:minmax(210px,280px) 1fr;gap:14px;min-height:560px;">
                        <div class="section-card" style="overflow:auto;padding:14px;">
                            <div style="font-size:12px;font-weight:700;color:#f8fafc;padding:2px 2px 10px;border-bottom:1px solid rgba(255,255,255,.08);margin-bottom:8px;">Comandos Detectados (<span id="detectedCommandCount">0</span>)</div>
                            <div id="commandFileList" style="display:flex;flex-direction:column;gap:4px;"></div>
                        </div>
                        <div class="section-card" style="padding:0;overflow:hidden;">
                            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:rgba(0,0,0,.45);border-bottom:1px solid rgba(255,255,255,.08);">
                                <span id="commandSelectedFilename" style="font-family:'JetBrains Mono',monospace;color:#d8b4fe;font-size:12px;font-weight:600;">Selecciona un comando</span>
                                <div style="display:flex;align-items:center;gap:8px;">
                                    <button onclick="CommandEditor.save()" style="padding:6px 14px;border-radius:10px;background:rgba(147,51,234,.28);border:1px solid rgba(168,85,247,.4);color:#e9d5ff;font-size:12px;font-weight:600;">&#128204; Guardar en Borrador</button>
                                    <button onclick="CommandEditor.review()" style="padding:6px 16px;border-radius:10px;background:#059669;color:#fff;font-size:12px;font-weight:700;border:none;">&#128190; Revisar y Subir a Bot / GitHub (<span id="stagedCount">0</span>)</button>
                                </div>
                            </div>
                            <div id="commandEditor" style="height:520px;width:100%;background:#1e1e1e;"></div>
                        </div>
                    </div>
                </section>
            </main>
        </div>
    </div>

    <!-- ==========================================================
         3. DRAWER LATERAL: PERFIL INDIVIDUAL DE USUARIO
         ========================================================== -->
    <div class="drawer-backdrop" id="drawerBackdrop" onclick="cerrarDrawers()"></div>

    <aside class="side-drawer" id="userDrawer">
        <div class="drawer-header">
            <div style="display:flex;align-items:center;gap:14px;">
                <img id="dwAvatar" src="https://cdn.discordapp.com/embed/avatars/0.png" style="width:54px;height:54px;border-radius:50%;border:2px solid var(--accent-secondary);" alt="Avatar" />
                <div>
                    <div id="dwUsername" style="font-size:16px;font-weight:700;color:#fff;">Usuario</div>
                    <div id="dwUserId" class="mono" style="font-size:12px;color:var(--accent-light);">000000000000000000</div>
                    <div id="dwStatusBadge" style="margin-top:5px;"></div>
                </div>
            </div>
            <button type="button" class="btn-secondary" style="padding:5px 9px;" onclick="cerrarDrawers()">✕</button>
        </div>

        <div class="drawer-content">
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;">
                <button type="button" class="btn-secondary" style="justify-content:center;" onclick="copiarDatoUsuario('id')">Copiar ID</button>
                <button type="button" class="btn-secondary" style="justify-content:center;" onclick="copiarDatoUsuario('username')">Copiar Nombre</button>
                <a id="dwProfileLink" class="btn-secondary" style="justify-content:center;text-decoration:none;" href="#" target="_blank" rel="noopener noreferrer">Abrir Perfil ↗</a>
            </div>

            <div>
                <div style="font-size:11.5px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px;">Ficha Técnica del Miembro</div>
                <div class="info-grid-card">
                    <div>
                        <div class="info-cell-label">Fecha de Verificación</div>
                        <div class="info-cell-val" id="dwVerifiedAt">--</div>
                    </div>
                    <div>
                        <div class="info-cell-label">Creación Cuenta Discord</div>
                        <div class="info-cell-val" id="dwDiscordCreated">--</div>
                    </div>
                    <div>
                        <div class="info-cell-label">Creación en Base de Datos</div>
                        <div class="info-cell-val" id="dwDbCreated">--</div>
                    </div>
                    <div>
                        <div class="info-cell-label">Última Actualización</div>
                        <div class="info-cell-val" id="dwDbUpdated">--</div>
                    </div>
                    <div style="grid-column:span 2;">
                        <div class="info-cell-label">Última Actividad Registrada</div>
                        <div class="info-cell-val" id="dwLastActivity">--</div>
                    </div>
                </div>
            </div>

            <div>
                <div style="font-size:11.5px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px;">Servidores Asociados</div>
                <div id="dwServersContainer" style="display:flex;flex-direction:column;gap:8px;"></div>
            </div>

            <div>
                <div style="font-size:11.5px;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px;">Historial de Eventos del Usuario</div>
                <div class="timeline-list" id="dwTimelineContainer"></div>
            </div>
        </div>
    </aside>

    <!-- ==========================================================
         4. DRAWER LATERAL: DETALLE DE SERVIDOR CONECTADO
         ========================================================== -->
    <aside class="side-drawer" id="serverDrawer">
        <div class="drawer-header">
            <div style="display:flex;align-items:center;gap:14px;">
                <div id="sdIconBox" class="server-icon">SV</div>
                <div>
                    <div id="sdName" style="font-size:16px;font-weight:700;color:#fff;">Servidor</div>
                    <div id="sdId" class="mono" style="font-size:12px;color:var(--accent-light);">000000000</div>
                </div>
            </div>
            <button type="button" class="btn-secondary" style="padding:5px 9px;" onclick="cerrarDrawers()">✕</button>
        </div>

        <div class="drawer-content">
            <div class="info-grid-card">
                <div>
                    <div class="info-cell-label">Cantidad de Miembros</div>
                    <div class="info-cell-val mono" id="sdMemberCount">0</div>
                </div>
                <div>
                    <div class="info-cell-label">Estado de Conexión</div>
                    <div class="info-cell-val" style="color:var(--success);">Conectado en caché</div>
                </div>
                <div>
                    <div class="info-cell-label">Estado de Integración</div>
                    <div class="info-cell-val" id="sdIntegration">--</div>
                </div>
                <div>
                    <div class="info-cell-label">Fecha de Registro Bot</div>
                    <div class="info-cell-val" id="sdJoinedAt">--</div>
                </div>
                <div>
                    <div class="info-cell-label">ID del Propietario</div>
                    <div class="info-cell-val mono" id="sdOwnerId">--</div>
                </div>
                <div>
                    <div class="info-cell-label">Última Sincronización</div>
                    <div class="info-cell-val" id="sdLastSync">--</div>
                </div>
            </div>

            <button type="button" class="btn-primary" onclick="seleccionarServidorParaRestore()">
                ⚡ Usar este Servidor en Restore Center
            </button>
        </div>
    </aside>

    <!-- ==========================================================
         5. MODALES DE CONFIRMACIÓN Y DETALLE DE OPERACIÓN RESTORE
         ========================================================== -->
    <div class="modal-overlay" id="confirmRestoreModal">
        <div class="modal-box">
            <h3 style="font-size:16px;font-weight:600;margin-bottom:10px;">Confirmar Operación en Restore Center</h3>
            <p id="confirmRestoreText" style="color:var(--text-secondary);font-size:13px;margin-bottom:20px;"></p>
            <div style="display:flex;justify-content:flex-end;gap:10px;">
                <button type="button" class="btn-secondary" onclick="cerrarModales()">Cancelar</button>
                <button type="button" class="btn-primary" style="width:auto;" onclick="confirmarYEjecutarRestore()">Confirmar e Iniciar</button>
            </div>
        </div>
    </div>

    <div class="modal-overlay" id="restoreDetailModal">
        <div class="modal-box">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
                <h3 style="font-size:16px;font-weight:600;" id="rdModalTitle">Detalle de Operación</h3>
                <button type="button" class="btn-secondary" style="padding:4px 8px;" onclick="cerrarModales()">✕</button>
            </div>
            <div class="info-grid-card" id="rdModalGrid" style="margin-bottom:14px;"></div>
            <div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:6px;">Registro de Incidencias del Lote</div>
            <div id="rdModalErrors" style="background:rgba(8,6,15,0.9);border:1px solid var(--border-subtle);border-radius:8px;padding:10px;max-height:160px;overflow-y:auto;font-size:12px;color:var(--text-secondary);"></div>
        </div>
    </div>

    <div class="toast-container" id="toastContainer"></div>
    <div class="modal-overlay" id="commandReviewModal"><div class="modal-box" style="width:min(900px,96vw);max-height:85vh;overflow:auto;background:#110e1c;border:1px solid rgba(168,85,247,.4);">
        <h3 style="margin-bottom:12px;">Revisión de cambios</h3><div id="commandDiffList" style="max-height:55vh;overflow:auto;margin-bottom:16px;"></div>
        <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;"><button class="btn-secondary" onclick="discardStagedCommands()">🗑️ Deshacer Todos los Cambios</button><div style="display:flex;gap:8px;"><button class="btn-secondary" onclick="closeCommandReview()">Seguir editando</button><button class="btn-primary" onclick="applyStagedCommands()">🚀 Aplicar Cambios y Actualizar Bot</button></div></div>
    </div></div>
    <div id="rebuildOverlay" style="display:none;position:fixed;inset:0;z-index:9999;background:rgba(4,3,9,.96);align-items:center;justify-content:center;text-align:center;"><div><div class="spinner" style="margin:0 auto 22px;"></div><h2 id="rebuildMessage">Sincronizando y Reiniciando Servidor...</h2><button id="rebuildLogin" class="btn-primary" style="display:none;margin:20px auto;" onclick="location.href='/dashboard'">Volver al Login</button></div></div>

    <!-- ==========================================================
         6. LÓGICA FRONTEND SPA COMPLETA
         ========================================================== -->
    <script src="https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs/loader.js"></script>
    <script>
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
                if (!userId || !/^\\d{17,20}$/.test(String(userId))) return null;
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
                    '<tr onclick="switchModule(\\'restore\\')">' +
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
                '<tr onclick="abrirDetalleRestore(\\'' + op.operation_id + '\\')">' +
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

                return '<tr onclick="abrirUserDrawer(\\'' + u.user_id + '\\')">' +
                    '<td><div class="user-cell-flex">' +
                        '<img class="user-avatar" src="' + u.avatar + '" onerror="this.src=\\'https://cdn.discordapp.com/embed/avatars/0.png\\'" alt="" />' +
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

                return '<div class="server-card" onclick="abrirServerDrawer(\\'' + g.id + '\\')">' +
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
    </script>
    <script src="/dashboard/server/command-editor.js"></script>
</body>
</html>`);
});

}

module.exports = { registerDashboardPage };
