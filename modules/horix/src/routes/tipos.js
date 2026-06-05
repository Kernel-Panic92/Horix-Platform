const express = require('express');

module.exports = function createTiposRouter({ db, middlewares }) {
  const router = express.Router();
  const { todosRoles, autenticar, requierePermiso } = middlewares;

  router.get('/', todosRoles, (req, res) => {
    const activos = req.query.activos === '1';
    let sql = 'SELECT * FROM tipos';
    if (activos) sql += ' WHERE activo=1';
    sql += ' ORDER BY id ASC';
    res.json(db.prepare(sql).all());
  });

  router.get('/:id', todosRoles, (req, res) => {
    const tipo = db.prepare('SELECT * FROM tipos WHERE id=?').get(req.params.id);
    if (!tipo) return res.status(404).json({ error: 'Tipo no encontrado' });
    res.json(tipo);
  });

  router.post('/', autenticar([]), requierePermiso('tipos'), (req, res) => {
    const { id, nombre, es_valor } = req.body;
    if (!id || !nombre) return res.status(400).json({ error: 'Código y nombre requeridos' });
    const existente = db.prepare('SELECT id FROM tipos WHERE id=?').get(id);
    if (existente) return res.status(400).json({ error: 'Ya existe un tipo con ese código' });
    db.prepare('INSERT INTO tipos (id, nombre, es_valor) VALUES (?,?,?)').run(id.trim(), nombre.trim(), es_valor ? 1 : 0);
    res.json(db.prepare('SELECT * FROM tipos WHERE id=?').get(id.trim()));
  });

  router.put('/:id', autenticar([]), requierePermiso('tipos'), (req, res) => {
    const { nombre, es_valor, activo } = req.body;
    if (!nombre) return res.status(400).json({ error: 'Nombre requerido' });
    db.prepare('UPDATE tipos SET nombre=?, es_valor=?, activo=? WHERE id=?').run(nombre.trim(), es_valor ? 1 : 0, activo !== undefined ? (activo?1:0) : 1, req.params.id);
    res.json(db.prepare('SELECT * FROM tipos WHERE id=?').get(req.params.id));
  });

  return router;
};
