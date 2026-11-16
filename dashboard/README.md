# KYVEN RESTORE 2.0 — Dashboard organizado

## Qué se modificó

Se hizo una **refactorización conservadora**, sin alterar las funciones del bot ni sus contratos API:

- `dashboard/ventanas/` → `dashboard/pages/`
- `dashboard/css/dashboard.css` → `dashboard/styles.css`
- `dashboard/js/dashboard.js` → `dashboard/app.js`
- Actualizadas las referencias en `dashboard/index.html` y `dashboard/server/frontend.js`.

Las funciones backend se mantuvieron en sus rutas originales para evitar introducir problemas en autenticación, Discord, restauración y base de datos. No se eliminaron funcionalidades ni se cambió el diseño intencionalmente.

## Dónde editar

| Objetivo | Archivo o carpeta |
| --- | --- |
| Menú y estructura principal | `dashboard/index.html` |
| Apariencia completa | `dashboard/styles.css` |
| Interacciones del panel | `dashboard/app.js` |
| Contenido de cada pantalla | `dashboard/pages/` |
| Construcción de páginas | `dashboard/server/frontend.js` |
| API general | `dashboard/server/api.js` |
| Editor de comandos (servidor) | `dashboard/server/command-editor.js` |
| Permisos y roles | `dashboard/server/permission-center/` |
| Sesiones | `dashboard/security/sessions.js` |
| Base de datos | `dashboard/database/models.js` |
| Restauración | `dashboard/systems/restore.js` |
| Eventos Discord | `dashboard/events/discord.js` |
| Entrada de la aplicación | `index.js` |

## Añadir funcionalidades

**Solo visual:** modificar `dashboard/pages/`, `dashboard/app.js` o `dashboard/styles.css`, según corresponda. Para una nueva pestaña, agregar su marcador `<!-- VIEW:nueva -->` y botón en `dashboard/index.html`, un archivo `dashboard/pages/nueva.html`, y una entrada en `views` en `dashboard/server/frontend.js`. Implementar navegación con la convención `switchModule` que utiliza la aplicación.

**Datos existentes:** reutilizar un endpoint actual; no hace falta tocar backend si ya proporciona toda la información.

**Datos o acciones nuevas:** agregar una ruta protegida al backend, respetando validaciones de sesión y permisos, y llamar a esa ruta desde el frontend. No llevar tokens privados ni permisos sensibles al navegador.

## Puesta en marcha

El paquete intencionalmente NO incluye `.env`, `bot.db`, `.git` ni `node_modules` para no redistribuir secretos, datos de usuarios o dependencias pesadas. **Conserva tu `.env` y `bot.db` originales y cópialos a la raíz de este proyecto antes de arrancarlo.** Ejecuta `npm ci` y `node index.js`. Verifica la conexión real a Discord y las funcionalidades en tu ambiente.

## Alcance de validación

La estructura y las referencias se han verificado estáticamente y la sintaxis JS con Node. **No se han probado los flujos reales de Discord, login, base de datos ni operaciones RESTORE**. Mantén un respaldo y realiza pruebas en un entorno de desarrollo antes de sustituir tu instalación.
