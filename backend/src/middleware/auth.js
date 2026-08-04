'use strict';
/**
 * Guardas de acceso comunes a todas las rutas.
 *
 * Los permisos MÁS ESPECÍFICOS no viven aquí: cada módulo de rutas define el
 * suyo junto a las rutas que protege (requireAdmin en perfiles y usuarios,
 * requireAutogestion en dashboards, requireAuditor en auditoría). Así se lee el
 * permiso exigido en el mismo archivo donde está la ruta, en vez de saltar a un
 * fichero central. Aquí solo queda lo que usan todos.
 *
 * DISTINCIÓN 401 / 403, que importa para el cliente:
 *   401 — no hay sesión. El frontend debe llevar al login.
 *   403 — hay sesión, pero el rol no alcanza. Mostrar el mensaje, no el login.
 * Devolver 401 cuando falta un permiso haría que la aplicación expulsara al
 * usuario en vez de explicarle que no tiene acceso a esa acción.
 *
 * Ocultar un botón en la interfaz NO es un control de acceso: la comprobación
 * que cuenta es la de estas guardas. Toda ruta nueva debe llevar la suya.
 */

/** Exige sesión iniciada. Responde 401 si la cookie no corresponde a una sesión viva. */
function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.status(401).json({ error: 'No autenticado' });
  }
  next();
}

/** Exige rol con privilegio de creación/edición de reportes. */
function requireEditor(req, res, next) {
  const rol = req.session.user && req.session.user.appRol;
  if (!rol || !(rol.PuedeCrear || rol.PuedeEditar)) {
    return res.status(403).json({ error: 'Requiere rol Creador/Editor' });
  }
  next();
}

/**
 * Envuelve un handler async y enruta los errores al manejador central.
 *
 * Express 4 no captura los rechazos de una promesa: sin esto, un `await` que
 * falle deja la petición COLGADA hasta que expire el tiempo de espera, sin
 * respuesta ni traza. Toda ruta asíncrona debe ir envuelta en `asyncH`.
 */
const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { requireAuth, requireEditor, asyncH };
