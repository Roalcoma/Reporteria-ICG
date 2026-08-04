'use strict';

/** Exige sesión iniciada. */
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

/** Envuelve un handler async y enruta los errores al manejador central. */
const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { requireAuth, requireEditor, asyncH };
