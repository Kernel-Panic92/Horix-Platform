const express = require('express');

module.exports = function createUsuariosRouter({
  db, uid, BASE_URL,
  hashPassword, generateToken, getConfig, validarPassword,
  rolTienePermiso, enviarCorreo, middlewares
}) {
  const router = express.Router();
  const { soloAdmin, todosRoles } = middlewares;

  router.get('/', todosRoles, (req, res) => {
    const rows = db.prepare('SELECT id, nombre, email, rol, sede, activo, cambio_password, creado FROM usuarios ORDER BY creado DESC').all();
    if (req.usuario.rol === 'admin' || rolTienePermiso(req.usuario.rol, 'usuarios')) return res.json(rows);
    res.json(rows.map(u => ({ id: u.id, nombre: u.nombre, rol: u.rol, sede: u.sede })));
  });

  router.post('/', soloAdmin, async (req, res) => {
    const { nombre, email, rol, sede } = req.body;
    if (!nombre || !email || !rol || !sede) return res.status(400).json({ error: 'Todos los campos son requeridos' });
    const rolesValidos = db.prepare('SELECT nombre FROM roles').all().map(r => r.nombre);
    if (!rolesValidos.includes(rol)) return res.status(400).json({ error: 'Rol inválido' });
    const centroValido = db.prepare('SELECT id FROM centros WHERE nombre=? AND activo=1').get(sede);
    if (!centroValido) return res.status(400).json({ error: 'Centro de operación inválido' });
    const existe = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(email.toLowerCase().trim());
    if (existe) return res.status(400).json({ error: 'Ya existe un usuario con ese correo' });

    const id = uid();
    const tempPass = Math.random().toString(36).slice(-10) + 'A1!';
    const pwHash = await hashPassword(tempPass);
    db.prepare('INSERT INTO usuarios (id,nombre,email,password,rol,sede,activo,cambio_password,creado) VALUES (?,?,?,?,?,?,?,?,?)').run(
       id, nombre.trim(), email.toLowerCase().trim(), pwHash, rol, sede, 1, 1, new Date().toISOString()
    );

    try {
      const cfg = getConfig();
      if (cfg.smtp_host) {
        db.prepare('DELETE FROM tokens_reset WHERE usuarioId = ?').run(id);
        const token  = generateToken();
        const expira = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        db.prepare('INSERT INTO tokens_reset VALUES (?,?,?)').run(token, id, expira);
        const rolTxt = {admin:'Admin',rrhh:'RRHH',gerencia:'Gerencia',consulta:'Consulta',operador:'Operador'}[rol]||rol;
        const enlace = `${BASE_URL}/reset-password.html?token=${token}`;
        await enviarCorreo(email, '👋 Bienvenido a Horix - Configura tu contraseña',
          `Hola ${nombre},\n\nTu cuenta ha sido creada en Horix.\n\n📧 Correo: ${email}\n🔑 Rol: ${rolTxt}\n📍 Sede: ${sede}\n\nPor favor configura tu contraseña haciendo clic en el siguiente enlace (válido por 7 días):\n${enlace}\n\nSaludos,\nEquipo Horix`
        );
      }
    } catch (e) { console.error('Error enviando correo:', e.message); }

    res.json({ id });
  });

  router.get('/:id/empleados', soloAdmin, (req, res) => {
    const rows = db.prepare('SELECT empleadoId FROM usuario_empleados WHERE usuarioId = ?').all(req.params.id);
    res.json(rows.map(r => r.empleadoId));
  });

  router.put('/:id/empleados', soloAdmin, (req, res) => {
    const { empleados: lista } = req.body;
    db.transaction(() => {
      db.prepare('DELETE FROM usuario_empleados WHERE usuarioId = ?').run(req.params.id);
      if (Array.isArray(lista)) {
        const ins = db.prepare('INSERT OR IGNORE INTO usuario_empleados VALUES (?,?)');
        for (const eid of lista) ins.run(req.params.id, eid);
      }
    })();
    res.json({ ok: true });
  });

  router.post('/:id/reset-password', soloAdmin, async (req, res) => {
    const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ? AND activo = 1').get(req.params.id);
    if (!usuario) return res.status(404).json({ error: 'Usuario no encontrado' });
    db.prepare('DELETE FROM tokens_reset WHERE usuarioId = ?').run(usuario.id);
    const token  = generateToken();
    const expira = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO tokens_reset VALUES (?,?,?)').run(token, usuario.id, expira);
    const cfg    = getConfig();
    const enlace = `${BASE_URL}/reset-password.html?token=${token}`;
    const cuerpo = `Hola ${usuario.nombre},\n\nUn administrador ha solicitado el restablecimiento de tu contraseña.\n\nPara crear una nueva contraseña, haz clic en el siguiente enlace:\n\n${enlace}\n\nEste enlace expira en 30 minutos.\n\nSi no solicitaste esto, ignora este correo.\n\n\nSaludos,\nEquipo Horix`;
    try {
      await enviarCorreo(usuario.email, '🔐 Restablecer contraseña - Horix', cuerpo);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: 'No se pudo enviar el correo.' });
    }
  });

  router.put('/:id', soloAdmin, async (req, res) => {
    const { nombre, email, rol, sede, activo, password } = req.body;
    const rolesValidos = db.prepare('SELECT nombre FROM roles').all().map(r => r.nombre);
    if (!rolesValidos.includes(rol)) return res.status(400).json({ error: 'Rol inválido' });
    const centroValido = db.prepare('SELECT id FROM centros WHERE nombre=? AND activo=1').get(sede);
    if (!centroValido) return res.status(400).json({ error: 'Centro de operación inválido' });
    if (req.params.id === req.usuario.id && activo === 0) return res.status(400).json({ error: 'No puedes desactivarte a ti mismo' });
    if (password && password.trim() !== '') {
      const errPassU = validarPassword(password);
      if (errPassU.length) return res.status(400).json({ error: 'Contraseña inválida: ' + errPassU.join(', ') });
      const pwHashU = await hashPassword(password);
      db.prepare('UPDATE usuarios SET nombre=?,email=?,rol=?,sede=?,activo=?,password=? WHERE id=?')
        .run(nombre.trim(), email.toLowerCase().trim(), rol, sede, activo?1:0, pwHashU, req.params.id);
    } else {
      db.prepare('UPDATE usuarios SET nombre=?,email=?,rol=?,sede=?,activo=? WHERE id=?')
        .run(nombre.trim(), email.toLowerCase().trim(), rol, sede, activo?1:0, req.params.id);
    }
    res.json({ ok: true });
  });

  router.post('/:id/forzar-cambio', soloAdmin, (req, res) => {
    if (req.params.id === req.usuario.id) return res.status(400).json({ error: 'No puedes forzar el cambio a tu propio usuario' });
    db.prepare('UPDATE usuarios SET cambio_password = 1 WHERE id = ?').run(req.params.id);
    db.prepare('DELETE FROM sesiones WHERE usuarioId = ?').run(req.params.id);
    res.json({ ok: true });
  });

  router.delete('/:id', soloAdmin, (req, res) => {
    if (req.params.id === req.usuario.id) return res.status(400).json({ error: 'No puedes eliminarte a ti mismo' });
    db.prepare('DELETE FROM sesiones WHERE usuarioId = ?').run(req.params.id);
    db.prepare('DELETE FROM usuarios WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  });

  return router;
};
