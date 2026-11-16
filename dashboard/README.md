# KYVEN RESTORE dashboard (modo de desarrollo)

La aplicación conserva una sola página y el sidebar actual. `/dashboard` compone el documento desde `index.html`, `login.html` y las vistas de `ventanas/`; no se duplican la sesión ni la navegación.

## Dónde editar

- `ventanas/`: contenido visual de cada sección. `permission-center.html` contiene el panel de permisos.
- `css/dashboard.css`: estilos compartidos del dashboard.
- `js/dashboard.js`: navegación, sesión y funciones compartidas de la SPA.
- `server/permission-center/dashboard.js`: comportamiento propio de Permission Center.
- `server/command-editor.js`: editor de comandos.
- `server/api.js` y `server/permission-center/api.js`: rutas backend; no son plantillas.

Las vistas se ensamblan en `server/frontend.js`. Los recursos bajo `dashboard/` se sirven desde el middleware estático existente en `server/index.js`.
