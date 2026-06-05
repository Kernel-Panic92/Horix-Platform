const { db } = require('../db');

function permisosPorRol(rol) {
  const rows = db.prepare('SELECT permiso FROM permisos_roles WHERE rol = ?').all(rol);
  return rows.map(r => r.permiso);
}

function rolTienePermiso(rol, permiso) {
  return !!db.prepare('SELECT 1 FROM permisos_roles WHERE rol = ? AND permiso = ?').get(rol, permiso);
}

module.exports = { permisosPorRol, rolTienePermiso };
