const express = require('express');

module.exports = function({ db, middlewares: { todosRoles } }) {
  const router = express.Router();

  // Save dashboard widget layout per user
  router.put('/dashboard/layout', todosRoles, (req, res) => {
    try {
      const { order, sizes } = req.body;
      if (!Array.isArray(order) || typeof sizes !== 'object') {
        return res.status(400).json({ error: 'Formato inválido' });
      }
      db.prepare(`INSERT INTO dashboard_layout (usuarioId, orden, tamanos) VALUES (?, ?, ?)
        ON CONFLICT(usuarioId) DO UPDATE SET orden = excluded.orden, tamanos = excluded.tamanos`)
        .run(req.usuario.id, JSON.stringify(order), JSON.stringify(sizes));
      res.json({ ok: true });
    } catch (e) {
      console.error('Error guardando layout:', e.message);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });

  // Load dashboard widget layout per user
  router.get('/dashboard/layout', todosRoles, (req, res) => {
    try {
      const row = db.prepare('SELECT orden, tamanos FROM dashboard_layout WHERE usuarioId = ?').get(req.usuario.id);
      res.json({
        order: row ? JSON.parse(row.orden) : [],
        sizes: row ? JSON.parse(row.tamanos) : {}
      });
    } catch (e) {
      console.error('Error cargando layout:', e.message);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });

  router.get('/dashboard/resumen', todosRoles, (req, res) => {
    try {
      const u = req.usuario;
      const currentYear = new Date().getFullYear();
      const currentMonth = String(new Date().getMonth() + 1).padStart(2, '0');
      const yearStart = currentYear + '-01-01';
      const mesPrefix = currentYear + '-' + currentMonth;

      const permisos = db.prepare('SELECT permiso FROM permisos_roles WHERE rol = ?').all(u.rol).map(p => p.permiso);
      const verTodos = permisos.includes('ver_todos');
      const verSede = permisos.includes('ver_sede');
      const verPropios = permisos.includes('ver_propios');
      const efectivo = verTodos ? 'todos' : verSede ? 'sede' : 'propios';

      let whereVis = '';
      const visParams = [];
      if (efectivo === 'sede') { whereVis = ' AND e.sede = ?'; visParams.push(u.sede); }
      else if (efectivo === 'propios') { whereVis = ' AND r.creadoPor = ?'; visParams.push(u.id); }

      const regBase = ' FROM registros r JOIN empleados e ON r.empleadoId = e.id WHERE 1=1' + whereVis;

      const tipos = db.prepare("SELECT id FROM tipos WHERE es_valor = 1 AND activo = 1").all().map(t => t.id);
      let whereValor = '';
      const valorParams = [];
      if (tipos.length) {
        whereValor = ' AND r.tipo IN (' + tipos.map(() => '?').join(',') + ')';
        valorParams.push(...tipos);
      }

      const porMes = db.prepare("SELECT substr(r.fecha,1,7) AS mes, SUM(r.horas) AS total" + regBase + " AND r.estado='aprobado' AND r.fecha >= ? GROUP BY mes").all(...visParams, yearStart);
      const porMesObj = {}; porMes.forEach(r => porMesObj[r.mes] = r.total);
      const porEstado = db.prepare("SELECT r.estado, COUNT(*) AS total" + regBase + " AND r.fecha >= ? GROUP BY r.estado").all(...visParams, yearStart);
      const porEstadoObj = { pendiente: 0, aprobado: 0, rechazado: 0 }; porEstado.forEach(r => porEstadoObj[r.estado] = r.total);
      const porSede = db.prepare("SELECT r.sede, SUM(r.horas) AS total" + regBase + " AND r.estado='aprobado' AND r.fecha >= ? GROUP BY r.sede ORDER BY total DESC").all(...visParams, yearStart);
      const topEmp = db.prepare("SELECT r.empleadoId, e.nombre, SUM(r.horas) AS total" + regBase + " AND r.estado='aprobado' AND r.fecha >= ? GROUP BY r.empleadoId ORDER BY total DESC LIMIT 5").all(...visParams, yearStart);
      const porMesCOP = db.prepare("SELECT substr(r.fecha,1,7) AS mes, SUM(r.transporte) AS total" + regBase + " AND r.estado='aprobado' AND r.fecha >= ?" + whereValor + " GROUP BY mes").all(...visParams, yearStart, ...valorParams);
      const porMesCOPObj = {}; porMesCOP.forEach(r => porMesCOPObj[r.mes] = r.total);
      const stats = db.prepare("SELECT SUM(CASE WHEN r.estado='aprobado' THEN r.horas ELSE 0 END) AS totalHoras, SUM(CASE WHEN r.estado='aprobado' AND r.fecha >= ? THEN r.horas ELSE 0 END) AS horasAnio, SUM(CASE WHEN r.estado='aprobado' AND r.fecha LIKE ? THEN r.horas ELSE 0 END) AS horasMes, SUM(CASE WHEN r.estado='pendiente' THEN r.horas ELSE 0 END) AS horasPendientes, COUNT(DISTINCT CASE WHEN r.estado='aprobado' THEN r.empleadoId END) AS empleadosConHoras, COUNT(CASE WHEN r.estado='aprobado' AND r.fecha >= ? THEN 1 END) AS totalAprobados, COUNT(CASE WHEN r.estado='rechazado' AND r.fecha >= ? THEN 1 END) AS totalRechazados" + regBase).get(...visParams, yearStart, mesPrefix + '%', yearStart, yearStart);
      const valCOPTotal = db.prepare("SELECT SUM(CASE WHEN r.fecha LIKE ? THEN r.transporte ELSE 0 END) AS valorMes, SUM(CASE WHEN r.fecha >= ? THEN r.transporte ELSE 0 END) AS valorAnio" + regBase + " AND r.estado='aprobado'" + whereValor).get(...visParams, mesPrefix + '%', yearStart, ...valorParams);
      const mejorMes = db.prepare("SELECT substr(r.fecha,1,7) AS mes, SUM(r.horas) AS total" + regBase + " AND r.estado='aprobado' GROUP BY mes ORDER BY total DESC LIMIT 1").get(...visParams);

      res.json({
        porMes: porMesObj, porEstado: porEstadoObj, porSede, topEmpleados: topEmp, porMesCOP: porMesCOPObj,
        stats: { totalHoras: stats?.totalHoras || 0, horasAnio: stats?.horasAnio || 0, horasMes: stats?.horasMes || 0, horasPendientes: stats?.horasPendientes || 0, empleadosConHoras: stats?.empleadosConHoras || 0, totalAprobados: stats?.totalAprobados || 0, totalRechazados: stats?.totalRechazados || 0, valorMes: valCOPTotal?.valorMes || 0, valorAnio: valCOPTotal?.valorAnio || 0 },
        mejorMes: mejorMes ? { mes: mejorMes.mes, total: mejorMes.total } : null
      });
    } catch (e) {
      console.error('Error cargando resumen:', e.message);
      res.status(500).json({ error: 'Error interno del servidor' });
    }
  });

  return router;
};
