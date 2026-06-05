const express = require('express');

module.exports = function({ db, parseCookies }) {
  const router = express.Router();
  const insertTelemetria = db.prepare('INSERT INTO telemetria (evento, pagina, usuarioId, datos, ua, ip, creado) VALUES (?,?,?,?,?,?,?)');

  router.post('/telemetry', (req, res) => {
    try {
      const { evento, pagina, datos } = req.body || {};
      if (!evento) return res.status(400).json({ error: 'evento requerido' });
      const cookies = parseCookies(req);
      const authToken = cookies.he_token || req.headers['authorization']?.replace('Bearer ', '');
      let usuarioId = '';
      if (authToken) {
        const s = db.prepare('SELECT usuarioId FROM sesiones WHERE token = ? AND expira > datetime(\'now\')').get(authToken);
        if (s) usuarioId = s.usuarioId;
      }
      const ahora = new Date().toISOString();
      insertTelemetria.run(evento, pagina || '', usuarioId, JSON.stringify(datos || {}), req.headers['user-agent'] || '', req.ip || '', ahora);
      res.json({ ok: true });
    } catch (e) {
      console.error('Telemetry error:', e.message);
      res.status(500).json({ error: 'Error' });
    }
  });

  router.get('/telemetry/dashboard', (req, res) => {
    try {
      const cookies = parseCookies(req);
      const authToken = cookies.he_token || req.headers['authorization']?.replace('Bearer ', '');
      if (!authToken) return res.status(401).json({ error: 'No autorizado' });
      const sesion = db.prepare('SELECT usuarioId FROM sesiones WHERE token = ? AND expira > datetime(\'now\')').get(authToken);
      if (!sesion) return res.status(401).json({ error: 'Sesión inválida' });
      const u = db.prepare('SELECT rol FROM usuarios WHERE id = ?').get(sesion.usuarioId);
      if (!u || u.rol !== 'admin') return res.status(403).json({ error: 'Solo admin' });

      const hitsPagina = db.prepare(`SELECT pagina, COUNT(*) as total FROM telemetria WHERE evento='page_view' AND creado > datetime('now','-30 days') GROUP BY pagina ORDER BY total DESC`).all();
      const eventosRecientes = db.prepare(`SELECT t.*, u.nombre as usuarioNombre FROM telemetria t LEFT JOIN usuarios u ON t.usuarioId=u.id ORDER BY t.id DESC LIMIT 50`).all();
      const errores = db.prepare(`SELECT datos, COUNT(*) as total FROM telemetria WHERE evento='error_js' AND creado > datetime('now','-30 days') GROUP BY datos ORDER BY total DESC LIMIT 10`).all();
      const totales = db.prepare(`SELECT evento, COUNT(*) as total FROM telemetria WHERE creado > datetime('now','-30 days') GROUP BY evento ORDER BY total DESC`).all();
      const erroresBackendRecientes = db.prepare(`SELECT t.*, u.nombre as usuarioNombre FROM telemetria t LEFT JOIN usuarios u ON t.usuarioId=u.id WHERE t.evento='error_backend' OR t.evento='error_api' ORDER BY t.id DESC LIMIT 20`).all();
      const resumenDiario = db.prepare(`SELECT DATE(creado) as dia, COUNT(*) as total FROM telemetria WHERE creado > datetime('now','-30 days') GROUP BY dia ORDER BY dia`).all();

      res.json({ hitsPagina, eventosRecientes, errores, totales, erroresBackendRecientes, resumenDiario });
    } catch (e) {
      console.error('Telemetry dashboard error:', e.message);
      res.status(500).json({ error: 'Error' });
    }
  });

  return router;
};
