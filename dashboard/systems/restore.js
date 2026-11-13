'use strict';

function createRestoreSystem({ OAuthToken, RestoreOperation, registrarActividadSistema, sincronizarCache, client }) {
const esperar = (ms) => new Promise(res => setTimeout(res, ms));
let restoreEnCurso = false;
let progresoRestore = {
    operationId: null,
    activo: false,
    procesados: 0,
    pendientes: 0,
    total: 0,
    unidos: 0,
    yaEstaban: 0,
    fallidos: 0,
    targetGuildId: null,
    targetGuildName: null,
    startedAt: null,
    finishedAt: null,
    erroresRecientes: []
};

async function renovarAccessToken(doc) {
    try {
        const params = new URLSearchParams({
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            grant_type: 'refresh_token',
            refresh_token: doc.refresh_token
        });

        const res = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            body: params,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        });

        const data = await res.json();
        const now = new Date().toISOString();

        if (data.access_token) {
            await OAuthToken.updateOne(
                { user_id: doc.user_id },
                {
                    $set: {
                        access_token: data.access_token,
                        refresh_token: data.refresh_token,
                        updated_at: now,
                        oauth_status: 'refreshed'
                    },
                    $push: {
                        history: {
                            $each: [{ event: 'Token OAuth2 Renovado', detail: 'Renovación automática en Restore Center', timestamp: now }],
                            $slice: -40
                        }
                    }
                }
            );
            return data.access_token;
        } else {
            await OAuthToken.updateOne(
                { user_id: doc.user_id },
                {
                    $set: { oauth_status: 'expired', updated_at: now },
                    $push: {
                        history: {
                            $each: [{ event: 'Token OAuth2 Expirado', detail: 'El usuario revocó el acceso o el token caducó', timestamp: now }],
                            $slice: -40
                        }
                    }
                }
            );
            return null;
        }
    } catch (e) {
        return null;
    }
}

async function transferirMiembrosSeguro(guildId, cantidadMax = 500, initiatedBy = 'Catrii') {
    if (restoreEnCurso) throw new Error('Ya hay una operación de restauración en curso.');
    restoreEnCurso = true;

    const guildObj = client.guilds.cache.get(guildId);
    const guildName = guildObj ? guildObj.name : `Servidor ID: ${guildId}`;
    const opId = 'OP-' + Date.now().toString(36).toUpperCase();
    const startIso = new Date().toISOString();
    const startMs = Date.now();

    const usuarios = await OAuthToken.find().limit(Math.min(cantidadMax, 500));
    progresoRestore = {
        operationId: opId,
        activo: true,
        procesados: 0,
        pendientes: usuarios.length,
        total: usuarios.length,
        unidos: 0,
        yaEstaban: 0,
        fallidos: 0,
        targetGuildId: guildId,
        targetGuildName: guildName,
        startedAt: startIso,
        finishedAt: null,
        erroresRecientes: []
    };

    await RestoreOperation.create({
        operation_id: opId,
        target_guild_id: guildId,
        target_guild_name: guildName,
        requested_count: cantidadMax,
        total_candidates: usuarios.length,
        processed: 0,
        joined: 0,
        already_in: 0,
        failed: 0,
        status: 'running',
        started_at: startIso,
        initiated_by: initiatedBy,
        error_details: []
    }).catch(() => {});

    await registrarActividadSistema(
        'restore_start',
        'info',
        `Restauración ${opId} iniciada hacia ${guildName}`,
        `Lote objetivo: ${usuarios.length} miembros • Iniciado por: ${initiatedBy}`
    );

    for (const u of usuarios) {
        try {
            let tokenActual = u.access_token;
            let res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${u.user_id}`, {
                method: 'PUT',
                headers: {
                    Authorization: `Bot ${process.env.TOKEN}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ access_token: tokenActual })
            });

            if (res.status === 401 || res.status === 403) {
                const nuevoToken = await renovarAccessToken(u);
                if (nuevoToken) {
                    res = await fetch(`https://discord.com/api/v10/guilds/${guildId}/members/${u.user_id}`, {
                        method: 'PUT',
                        headers: {
                            Authorization: `Bot ${process.env.TOKEN}`,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ access_token: nuevoToken })
                    });
                }
            }

            const now = new Date().toISOString();

            if (res.status === 201) {
                progresoRestore.unidos++;
                await OAuthToken.updateOne(
                    { user_id: u.user_id },
                    {
                        $set: { updated_at: now, oauth_status: 'active' },
                        $addToSet: { servers_associated: guildId },
                        $push: {
                            history: {
                                $each: [{ event: 'Transferido en Restore Center', detail: `Unido exitosamente a ${guildName} (${opId})`, timestamp: now }],
                                $slice: -40
                            }
                        }
                    }
                );
            } else if (res.status === 204) {
                progresoRestore.yaEstaban++;
                await OAuthToken.updateOne(
                    { user_id: u.user_id },
                    { $addToSet: { servers_associated: guildId } }
                );
            } else if (res.status === 429) {
                const retryData = await res.json().catch(() => ({}));
                const waitMs = (retryData.retry_after || 5) * 1000;
                progresoRestore.erroresRecientes.push(`Pausa Anti-Rate Limit (${retryData.retry_after || 5}s) en usuario ${u.user_id}`);
                await esperar(waitMs);
            } else {
                progresoRestore.fallidos++;
                if (progresoRestore.erroresRecientes.length < 25) {
                    progresoRestore.erroresRecientes.push(`Usuario ${u.username || u.user_id} (${u.user_id}): HTTP ${res.status}`);
                }
            }
        } catch (e) {
            progresoRestore.fallidos++;
            if (progresoRestore.erroresRecientes.length < 25) {
                progresoRestore.erroresRecientes.push(`Usuario ${u.user_id}: ${e.message || 'Fallo de red'}`);
            }
        }

        progresoRestore.procesados++;
        progresoRestore.pendientes = Math.max(progresoRestore.total - progresoRestore.procesados, 0);

        if (progresoRestore.procesados % 5 === 0 || progresoRestore.procesados === progresoRestore.total) {
            await RestoreOperation.updateOne(
                { operation_id: opId },
                {
                    $set: {
                        processed: progresoRestore.procesados,
                        joined: progresoRestore.unidos,
                        already_in: progresoRestore.yaEstaban,
                        failed: progresoRestore.fallidos,
                        duration_seconds: Math.floor((Date.now() - startMs) / 1000),
                        error_details: progresoRestore.erroresRecientes
                    }
                }
            ).catch(() => {});
        }

        await esperar(1350);
    }

    const endIso = new Date().toISOString();
    const totalDuration = Math.floor((Date.now() - startMs) / 1000);

    await sincronizarCache();
    restoreEnCurso = false;
    progresoRestore.activo = false;
    progresoRestore.finishedAt = endIso;

    await RestoreOperation.updateOne(
        { operation_id: opId },
        {
            $set: {
                processed: progresoRestore.procesados,
                joined: progresoRestore.unidos,
                already_in: progresoRestore.yaEstaban,
                failed: progresoRestore.fallidos,
                status: 'completed',
                finished_at: endIso,
                duration_seconds: totalDuration,
                error_details: progresoRestore.erroresRecientes
            }
        }
    ).catch(() => {});

    await registrarActividadSistema(
        'restore_end',
        progresoRestore.fallidos > 0 ? 'warning' : 'success',
        `Restauración ${opId} finalizada en ${guildName}`,
        `Unidos: ${progresoRestore.unidos} • Ya presentes: ${progresoRestore.yaEstaban} • Errores: ${progresoRestore.fallidos} • Tiempo: ${totalDuration}s`
    );

    return progresoRestore;
}
    return { get restoreEnCurso() { return restoreEnCurso; }, get progresoRestore() { return progresoRestore; }, transferirMiembrosSeguro };
}

module.exports = { createRestoreSystem };
