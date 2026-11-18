'use strict';

// Puente de compatibilidad: `index.js` carga `./dashboard/server`.
// Las rutas reales están en dashboard/server/api.js y frontend.js.
module.exports = require('./server/index');
