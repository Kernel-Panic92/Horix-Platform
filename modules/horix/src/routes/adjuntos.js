const express = require('express');
const multer  = require('multer');

const ADJUNTOS_MAX_SIZE = 10 * 1024 * 1024;
const ADJUNTOS_TIPOS_PERMITIDOS = [
  'image/jpeg','image/png','image/gif','image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain','text/csv'
];

const uploadAdjunto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ADJUNTOS_MAX_SIZE },
  fileFilter: (req, file, cb) => {
    if (ADJUNTOS_TIPOS_PERMITIDOS.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Tipo de archivo no permitido'));
  }
});

module.exports = function({ db, uid, rolTienePermiso, middlewares: { todosRoles, adminRrhhOp, podeEditar, autenticar, requierePermiso } }) {
  const router = express.Router();

  router.get('/registros/:id/adjuntos', todosRoles, (req, res) => {
    const u = req.usuario;
    const reg = db.prepare('SELECT r.*, e.sede FROM registros r JOIN empleados e ON r.empleadoId = e.id WHERE r.id = ?').get(req.params.id);
    if (!reg) return res.status(404).json({ error: 'Registro no encontrado' });
    const verTodos = rolTienePermiso(u.rol, 'ver_todos');
    const verSede = rolTienePermiso(u.rol, 'ver_sede');
    const verPropios = rolTienePermiso(u.rol, 'ver_propios');
    if (!verTodos && !verSede && !verPropios) return res.status(403).json({ error: 'Sin permisos de visibilidad' });
    if (!verTodos && !(verSede && reg.sede === u.sede) && !(verPropios && reg.creadoPor === u.id)) {
      return res.status(403).json({ error: 'No tienes acceso a este registro' });
    }
    const rows = db.prepare(
      'SELECT id, nombre, mime, tamano, subido, subidoPor FROM adjuntos WHERE registroId = ? ORDER BY subido ASC'
    ).all(req.params.id);
    res.json(rows);
  });

  router.post('/registros/:id/adjuntos', autenticar([]), requierePermiso('registros'), (req, res, next) => {
    uploadAdjunto.single('archivo')(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message });
      if (!req.file) return res.status(400).json({ error: 'No se recibió ningún archivo' });
      const registro = db.prepare('SELECT id FROM registros WHERE id = ?').get(req.params.id);
      if (!registro) return res.status(404).json({ error: 'Registro no encontrado' });
      if (req.usuario.rol === 'operador') {
        const reg = db.prepare('SELECT empleadoId FROM registros WHERE id = ?').get(req.params.id);
        const asignados = db.prepare('SELECT empleadoId FROM usuario_empleados WHERE usuarioId = ?').all(req.usuario.id).map(r => r.empleadoId);
        if (asignados.length > 0 && !asignados.includes(reg.empleadoId)) {
          return res.status(403).json({ error: 'No tienes permiso sobre este registro.' });
        }
      }
      const id = uid();
      db.prepare(
        'INSERT INTO adjuntos (id, registroId, nombre, mime, tamano, datos, subido, subidoPor) VALUES (?,?,?,?,?,?,?,?)'
      ).run(id, req.params.id, req.file.originalname, req.file.mimetype, req.file.size, req.file.buffer, new Date().toISOString(), req.usuario.id);
      res.json({ id, nombre: req.file.originalname, mime: req.file.mimetype, tamano: req.file.size });
    });
  });

  router.get('/adjuntos/:id/descargar', todosRoles, (req, res) => {
    const adj = db.prepare('SELECT * FROM adjuntos WHERE id = ?').get(req.params.id);
    if (!adj) return res.status(404).json({ error: 'Adjunto no encontrado' });
    const u = req.usuario;
    const reg = db.prepare('SELECT r.*, e.sede FROM registros r JOIN empleados e ON r.empleadoId = e.id WHERE r.id = ?').get(adj.registroId);
    if (!reg) return res.status(404).json({ error: 'Registro no encontrado' });
    const verTodos = rolTienePermiso(u.rol, 'ver_todos');
    const verSede = rolTienePermiso(u.rol, 'ver_sede');
    const verPropios = rolTienePermiso(u.rol, 'ver_propios');
    if (!verTodos && !verSede && !verPropios) return res.status(403).json({ error: 'Sin permisos de visibilidad' });
    if (!verTodos && !(verSede && reg.sede === u.sede) && !(verPropios && reg.creadoPor === u.id)) {
      return res.status(403).json({ error: 'No tienes acceso a este adjunto' });
    }
    res.setHeader('Content-Type', adj.mime);
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(adj.nombre)}"`);
    res.send(adj.datos);
  });

  router.delete('/adjuntos/:id', podeEditar, (req, res) => {
    const adj = db.prepare('SELECT id, registroId, subidoPor FROM adjuntos WHERE id = ?').get(req.params.id);
    if (!adj) return res.status(404).json({ error: 'Adjunto no encontrado' });
    if (req.usuario.rol !== 'admin' && adj.subidoPor !== req.usuario.id) {
      return res.status(403).json({ error: 'No tienes permiso para eliminar este adjunto' });
    }
    db.prepare('DELETE FROM adjuntos WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
};
