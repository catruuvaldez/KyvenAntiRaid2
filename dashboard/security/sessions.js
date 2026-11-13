'use strict';

function createSessionSecurity() {
const sesionesActivas = new Map(); // token -> { adminName, ip, createdAt, expiresAt }
const intentosFallidos = new Map(); // ip -> { count, lastAttempt, lockUntil }

function verificarRateLimitIP(ip) {
    const registro = intentosFallidos.get(ip);
    if (!registro) return { bloqueado: false };
    if (registro.lockUntil && Date.now() < registro.lockUntil) {
        const minRestantes = Math.ceil((registro.lockUntil - Date.now()) / 60000);
        return { bloqueado: true, minRestantes };
    }
    if (registro.lockUntil && Date.now() >= registro.lockUntil) {
        intentosFallidos.delete(ip);
    }
    return { bloqueado: false };
}

function registrarFalloIP(ip) {
    const actual = intentosFallidos.get(ip) || { count: 0, lastAttempt: null, lockUntil: null };
    actual.count += 1;
    actual.lastAttempt = new Date().toISOString();
    if (actual.count >= 5) {
        actual.lockUntil = Date.now() + 15 * 60 * 1000;
    }
    intentosFallidos.set(ip, actual);
}

function validarSesionToken(token) {
    if (!token || !sesionesActivas.has(token)) return false;
    const sesion = sesionesActivas.get(token);
    if (Date.now() > sesion.expiresAt) {
        sesionesActivas.delete(token);
        return false;
    }
    return true;
}
    return { sesionesActivas, intentosFallidos, verificarRateLimitIP, registrarFalloIP, validarSesionToken };
}

module.exports = { createSessionSecurity };
