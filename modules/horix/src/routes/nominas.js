const express = require('express');

function generarPeriodos({ db, uid }, anio, tipo, periodos) {
  const insert = db.prepare('INSERT INTO nominas (id,nombre,tipo,inicio,fin) VALUES (?,?,?,?,?)');
  const created = [];
  db.transaction(() => {
    for (const p of periodos) {
      let inicio, fin;
      if (p.inicio && p.fin) {
        inicio = p.inicio;
        fin = p.fin;
      } else if (tipo === 'mensual') {
        const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        const idx = meses.indexOf(p.nombre.replace(` ${anio}`, ''));
        if (idx === -1) continue;
        inicio = `${anio}-${String(idx + 1).padStart(2, '0')}-01`;
        fin = new Date(anio, idx + 1, 0).toISOString().slice(0, 10);
      } else if (tipo === 'quincenal') {
        const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        const parts = p.nombre.split(' ');
        const mes = parts[0];
        const quincena = parseInt(parts[1]);
        const idx = meses.indexOf(mes);
        if (idx === -1) continue;
        if (quincena === 1) {
          inicio = `${anio}-${String(idx + 1).padStart(2, '0')}-01`;
          fin = `${anio}-${String(idx + 1).padStart(2, '0')}-15`;
        } else {
          inicio = `${anio}-${String(idx + 1).padStart(2, '0')}-16`;
          fin = new Date(anio, idx + 1, 0).toISOString().slice(0, 10);
        }
      } else {
        continue;
      }
      const id = uid();
      insert.run(id, p.nombre, tipo, inicio, fin);
      created.push({ id, nombre: p.nombre, tipo, inicio, fin });
    }
  })();
  return created;
}

module.exports = function createNominasRouter(deps) {
  const router = express.Router();
  const { middlewares: { todosRoles, adminRrhh, soloAdmin } } = deps;

  router.get('/', todosRoles, (req, res) =>
    res.json(deps.db.prepare('SELECT * FROM nominas ORDER BY inicio DESC').all()));

  router.post('/', adminRrhh, (req, res) => {
    const { nombre, tipo, inicio, fin } = req.body;
    const id = deps.uid();
    deps.db.prepare('INSERT INTO nominas VALUES (?,?,?,?,?)').run(id, nombre, tipo, inicio, fin);
    res.json({ id });
  });

  router.post('/generar', adminRrhh, (req, res) => {
    const { anio, tipo, periodos } = req.body;
    if (!anio || !tipo || !periodos?.length) {
      return res.status(400).json({ error: 'Datos inválidos' });
    }
    try {
      const created = generarPeriodos(deps, anio, tipo, periodos);
      res.json({ ok: true, count: created.length, periodos: created });
    } catch (e) {
      console.error('Error generating periods:', e);
      console.error('Error generando períodos:', e.message);
      res.status(500).json({ error: 'Error generando períodos' });
    }
  });

  router.delete('/:id', soloAdmin, (req, res) => {
    deps.db.prepare('DELETE FROM nominas WHERE id=?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
};
