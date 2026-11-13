'use strict';

const fs = require('fs');
const path = require('path');

function createDashboardPages(rootDir) {
function localizarArchivoKyvenIcon() {
    const candidatos = [
        path.join(rootDir, 'kyvenico.png'),
        path.join(rootDir, 'kyvenicon.png'),
        path.join(rootDir, 'KYVENICON.png'),
        path.join(rootDir, 'keyvenicon.gif'),
        path.join(rootDir, 'kyvenicon.gif'),
        path.join(rootDir, 'assets', 'kyvenico.png'),
        path.join(rootDir, 'assets', 'kyvenicon.png'),
        path.join(rootDir, 'assets', 'keyvenicon.gif'),
        path.join(rootDir, 'assets', 'kyvenicon.gif')
    ];
    for (const ruta of candidatos) {
        if (fs.existsSync(ruta)) return ruta;
    }
    try {
        const archivosRaiz = fs.readdirSync(rootDir);
        const matchRaiz = archivosRaiz.find(f => /kyvenico|kyvenicon|keyvenicon/i.test(f) && /\.(png|gif|jpg|jpeg|webp)$/i.test(f));
        if (matchRaiz) return path.join(rootDir, matchRaiz);

        const assetsDir = path.join(rootDir, 'assets');
        if (fs.existsSync(assetsDir)) {
            const archivosAssets = fs.readdirSync(assetsDir);
            const matchAssets = archivosAssets.find(f => /kyvenico|kyvenicon|keyvenicon/i.test(f) && /\.(png|gif|jpg|jpeg|webp)$/i.test(f));
            if (matchAssets) return path.join(assetsDir, matchAssets);
        }
    } catch (e) {}
    return null;
}

// ==========================================================
// 4. PÁGINA DE ERROR DE VERIFICACIÓN OAUTH2
// ==========================================================
function renderErrorPage(titulo, mensaje, submensaje) {
    return `<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kyven Anti Raid • Verificación</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        * { box-sizing: border-box; font-family: 'Inter', system-ui, sans-serif; }
        body {
            background: radial-gradient(circle at 50% 0%, #190d2e 0%, #05040a 75%);
            color: #f8fafc;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            padding: 20px;
        }
        .card {
            background: rgba(14, 11, 24, 0.88);
            backdrop-filter: blur(20px);
            border: 1px solid rgba(168, 85, 247, 0.25);
            box-shadow: 0 24px 60px rgba(0, 0, 0, 0.7), 0 0 40px rgba(139, 92, 246, 0.12);
            border-radius: 18px;
            padding: 40px 32px;
            max-width: 440px;
            width: 100%;
            text-align: center;
        }
        .brand-img {
            max-width: 130px;
            height: auto;
            border-radius: 12px;
            margin: 0 auto 20px;
            display: block;
            border: 1px solid rgba(168, 85, 247, 0.3);
        }
        h1 { font-size: 20px; font-weight: 600; color: #f8fafc; margin: 0 0 10px; }
        p { color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 20px; }
        .sub {
            background: rgba(9, 7, 16, 0.9);
            border: 1px solid rgba(168, 85, 247, 0.18);
            border-radius: 10px;
            padding: 12px;
            font-size: 12.5px;
            color: #d8b4fe;
            margin-bottom: 24px;
        }
        .btn {
            display: inline-block;
            width: 100%;
            padding: 13px;
            border-radius: 10px;
            background: linear-gradient(135deg, #7c3aed, #9333ea);
            color: #fff;
            font-size: 14px;
            font-weight: 600;
            text-decoration: none;
        }
        .footer { margin-top: 22px; font-size: 11.5px; color: #64748b; }
    </style>
</head>
<body>
    <div class="card">
        <img class="brand-img" src="/api/brand-icon" alt="KYVENICON" />
        <h1>${titulo}</h1>
        <p>${mensaje}</p>
        <div class="sub">${submensaje}</div>
        <a class="btn" href="https://discord.com/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join">
            Iniciar Verificación OAuth2
        </a>
        <div class="footer">KYVEN SHOP • Servicio Automático</div>
    </div>
</body>
</html>`;
}
    return { localizarArchivoKyvenIcon, renderErrorPage };
}

module.exports = { createDashboardPages };
