const express = require('express');

module.exports = function createRolesRouter({ db, middlewares }) {
  const router = express.Router();
  const { adminRrhh, soloAdmin } = middlewares;

  router.get('/', adminRrhh, (req, res) => {
    const rows = db.prepare('SELECT nombre FROM roles ORDER BY nombre').all();
    res.json(rows.map(r => r.nombre));
  });

  router.post('/', soloAdmin, (req, res) => {
    const { nombre } = req.body;
    if (!nombre || !/^[a-záéíóúñA-ZÁÉÍÓÚÑ0-9_]+$/.test(nombre)) return res.status(400).json({ error: 'Nombre de rol inválido (solo letras, números y guión bajo)' });
    const key = nombre.toLowerCase().replace(/\s+/g, '_');
    const existing = db.prepare('SELECT nombre FROM roles WHERE nombre = ?').get(key);
    if (existing) return res.status(409).json({ error: 'El rol ya existe' });
    db.prepare('INSERT INTO roles (nombre) VALUES (?)').run(key);
    res.json({ nombre: key });
  });

  router.delete('/:rol', soloAdmin, (req, res) => {
    const rol = req.params.rol;
    const usersCount = db.prepare('SELECT COUNT(*) c FROM usuarios WHERE rol = ?').get(rol).c;
    if (usersCount > 0) return res.status(400).json({ error: `No se puede eliminar: ${usersCount} usuario(s) tienen este rol` });
    db.prepare('DELETE FROM permisos_roles WHERE rol = ?').run(rol);
    db.prepare('DELETE FROM roles WHERE nombre = ?').run(rol);
    res.json({ ok: true });
  });

  return router;
};
