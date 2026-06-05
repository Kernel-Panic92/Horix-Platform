const express = require('express');

module.exports = function createPermisosRouter({ db, middlewares }) {
  const router = express.Router();
  const { soloAdmin } = middlewares;

  router.get('/', soloAdmin, (req, res) => {
    const roles = db.prepare('SELECT nombre FROM roles ORDER BY nombre').all().map(r => r.nombre);
    const result = {};
    roles.forEach(rol => {
      result[rol] = db.prepare('SELECT permiso FROM permisos_roles WHERE rol = ?').all(rol).map(p => p.permiso);
    });
    res.json(result);
  });

  router.put('/', soloAdmin, (req, res) => {
    const { rol, permisos } = req.body;
    if (!rol || !Array.isArray(permisos)) return res.status(400).json({ error: 'Rol y array de permisos requeridos' });
    const existing = db.prepare('SELECT nombre FROM roles WHERE nombre = ?').get(rol);
    if (!existing) return res.status(400).json({ error: 'El rol no existe' });
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM permisos_roles WHERE rol = ?').run(rol);
      const ins = db.prepare('INSERT INTO permisos_roles (rol, permiso) VALUES (?,?)');
      permisos.forEach(p => ins.run(rol, p));
    });
    tx();
    res.json({ ok: true });
  });

  return router;
};
