const express = require('express');

module.exports = function({ db, parseCookies, middlewares: { soloAdmin } }) {
  const router = express.Router();

  router.get('/auditoria', soloAdmin, (req, res) => {
    const ahora = new Date().toISOString();
    db.prepare("DELETE FROM sesiones WHERE expira < ? OR usuarioId NOT IN (SELECT id FROM usuarios WHERE activo = 1)").run(ahora);
    const sesiones = db.prepare(`
      SELECT u.id, u.nombre, u.email, u.rol, u.activo,
             s.token, s.ip, s.ua, s.creado, s.expira,
             CASE WHEN s.token IS NOT NULL AND s.expira > ? THEN 1 ELSE 0 END AS enSesion,
             (SELECT MAX(a.timestamp) FROM auditoria_logins a WHERE a.usuarioId = u.id AND a.tipo = 'exito') AS ultimoLogin
      FROM usuarios u
      LEFT JOIN sesiones s ON s.usuarioId = u.id AND s.expira > ?
      ORDER BY enSesion DESC, u.nombre ASC
    `).all(ahora, ahora);
    const wh = []; const p = [];
    if (req.query.tipo)  { wh.push("a.tipo = ?");       p.push(req.query.tipo); }
    if (req.query.desde) { wh.push("a.timestamp >= ?");  p.push(req.query.desde); }
    if (req.query.hasta) { wh.push("a.timestamp <= ?");  p.push(req.query.hasta + 'T23:59:59.999Z'); }
    const historial = db.prepare(`
      SELECT a.* FROM auditoria_logins a
      ${wh.length ? 'WHERE ' + wh.join(' AND ') : ''}
      ORDER BY a.timestamp DESC LIMIT 200
    `).all(...p);
    const hoy = new Date().toISOString().slice(0, 10);
    const stats = {
      totalSesiones: sesiones.filter(s => s.enSesion).length,
      totalExitosHoy: db.prepare("SELECT COUNT(*) c FROM auditoria_logins WHERE tipo='exito' AND timestamp >= ?").get(hoy).c,
      totalFallidosHoy: db.prepare("SELECT COUNT(*) c FROM auditoria_logins WHERE tipo='fallido' AND timestamp >= ?").get(hoy).c
    };
    res.json({ sesiones, historial, stats });
  });

  router.delete('/sesiones/:token', soloAdmin, (req, res) => {
    const sesion = db.prepare('SELECT usuarioId FROM sesiones WHERE token = ?').get(req.params.token);
    if (!sesion) return res.status(404).json({ error: 'Sesión no encontrada' });
    db.prepare('DELETE FROM sesiones WHERE token = ?').run(req.params.token);
    res.json({ ok: true });
  });

  return router;
};
