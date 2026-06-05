const express = require('express');

module.exports = function createAuthRouter({
  db, crypto, BASE_URL, COOKIE_SECURE,
  verificarPassword, generateToken, hashPassword, validarPassword,
  getConfig, enviarCorreo, permisosPorRol, parseCookies,
  loginAttempts, LOGIN_WINDOW_MS, LOGIN_MAX_ATTEMPTS, LOGIN_BLOCK_MS,
  loginRegisterFail, loginRegisterSuccess, middlewares
}) {
  const router = express.Router();
  const { loginRateLimit, todosRoles, soloAdmin } = middlewares;
  const forgotCooldowns = new Map();

  // ── Login ──
  router.post('/login', loginRateLimit, async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Campos requeridos' });
    const normalizedEmail = email.toLowerCase().trim();
    const usuario = db.prepare('SELECT * FROM usuarios WHERE email = ? AND activo = 1').get(normalizedEmail);
    if (!usuario) { loginRegisterFail(req._loginIp, normalizedEmail); return res.status(401).json({ error: 'Correo o contraseña incorrectos' }); }
    const check = await verificarPassword(password, usuario.password);
    if (check.legacy) { loginRegisterFail(req._loginIp, normalizedEmail); return res.status(401).json({ error: 'Tu cuenta usa un formato de contraseña antiguo. Usa "Olvidaste tu contraseña" para crear una nueva.' }); }
    if (!check.ok) { loginRegisterFail(req._loginIp, normalizedEmail); return res.status(401).json({ error: 'Correo o contraseña incorrectos' }); }
    db.prepare('DELETE FROM sesiones WHERE usuarioId = ?').run(usuario.id);
    const token  = generateToken();
    const csrfToken = crypto.randomBytes(32).toString('hex');
    const ahora = new Date().toISOString();
    const expira = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const bfp = req.headers['x-browser-fp'] || '';
    db.prepare('INSERT INTO sesiones (token, usuarioId, expira, ip, creado, csrf, ua, bfp) VALUES (?,?,?,?,?,?,?,?)').run(token, usuario.id, expira, req._loginIp || '', ahora, csrfToken, req.headers['user-agent'] || '', bfp);
    loginRegisterSuccess(req._loginIp, usuario.id, usuario.email);
    const permisos = permisosPorRol(usuario.rol);
    res.cookie('he_token', token, { httpOnly: true, secure: COOKIE_SECURE, sameSite: 'strict', maxAge: 30 * 24 * 60 * 60 * 1000 });
    res.json({ token, csrfToken, usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol, sede: usuario.sede, cambio_password: usuario.cambio_password||0, permisos } });
  });

  // ── Rate Limiter Status ──
  router.get('/ratelimit-status', soloAdmin, (req, res) => {
    const now = Date.now();
    const bloqueadas = [];
    const enSeguimiento = [];
    for (const [ip, data] of loginAttempts.entries()) {
      if (data.blockedUntil && now < data.blockedUntil) {
        bloqueadas.push({
          ip, intentos: data.count,
          bloqueadaHasta: new Date(data.blockedUntil).toLocaleString('es-CO', { timeZone: 'America/Bogota' }),
          minutosRestantes: Math.ceil((data.blockedUntil - now) / 60000)
        });
      } else if (data.count > 0) {
        enSeguimiento.push({
          ip, intentos: data.count,
          ventanaExpiraEn: Math.ceil((LOGIN_WINDOW_MS - (now - data.firstAttempt)) / 60000)
        });
      }
    }
    res.json({
      configuracion: { maxIntentos: LOGIN_MAX_ATTEMPTS, ventanaMinutos: LOGIN_WINDOW_MS / 60000, bloqueoMinutos: LOGIN_BLOCK_MS / 60000 },
      totalIpsEnSeguimiento: loginAttempts.size, totalBloqueadas: bloqueadas.length, bloqueadas, enSeguimiento
    });
  });

  router.delete('/ratelimit-status/:ip', soloAdmin, (req, res) => {
    const ip = decodeURIComponent(req.params.ip);
    if (loginAttempts.has(ip)) {
      loginAttempts.delete(ip);
      res.json({ ok: true, mensaje: 'IP desbloqueada correctamente' });
    } else {
      res.status(404).json({ error: 'IP no encontrada en el rate limiter' });
    }
  });

  // ── Logout ──
  router.post('/logout', todosRoles, (req, res) => {
    const cookies = parseCookies(req);
    const token = cookies.he_token || req.headers['authorization']?.replace('Bearer ', '');
    if (token) db.prepare('DELETE FROM sesiones WHERE token = ?').run(token);
    res.clearCookie('he_token', { httpOnly: true, secure: COOKIE_SECURE, sameSite: 'strict' });
    res.json({ ok: true });
  });

  // ── Me ──
  router.get('/me', todosRoles, (req, res) => {
    const u = req.usuario;
    const cookies = parseCookies(req);
    const authToken = cookies.he_token || req.headers['authorization']?.replace('Bearer ', '');
    let csrfToken = '';
    if (authToken) {
      const sesion = db.prepare('SELECT csrf FROM sesiones WHERE token = ?').get(authToken);
      if (sesion) {
        csrfToken = sesion.csrf;
        if (!csrfToken) {
          csrfToken = crypto.randomBytes(32).toString('hex');
          db.prepare('UPDATE sesiones SET csrf = ? WHERE token = ?').run(csrfToken, authToken);
        }
      }
    }
    res.json({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, sede: u.sede, cambio_password: u.cambio_password||0, permisos: u._permisos_globales || permisosPorRol(u.rol), csrfToken });
  });

  // ── Forgot Password ──
  router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Correo requerido' });
    const emailNorm = email.toLowerCase().trim();
    const lastSent = forgotCooldowns.get(emailNorm);
    if (lastSent && (Date.now() - lastSent) < 60000) return res.status(429).json({ error: 'Espera un minuto antes de solicitar otro restablecimiento' });
    const usuario = db.prepare('SELECT * FROM usuarios WHERE email = ? AND activo = 1').get(emailNorm);
    if (!usuario) return res.json({ ok: true });
    db.prepare('DELETE FROM tokens_reset WHERE usuarioId = ?').run(usuario.id);
    const token  = generateToken();
    const expira = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    db.prepare('INSERT INTO tokens_reset VALUES (?,?,?)').run(token, usuario.id, expira);
    const cfg    = getConfig();
    const enlace = `${BASE_URL}/reset-password.html?token=${token}`;
    const textBody = cfg.reset_cuerpo.replace('{nombre}', usuario.nombre).replace('{enlace}', enlace);
    const htmlBtn = `<div style="text-align:center;margin:30px 0;">
       <a href="${enlace}" style="background-color:#2563eb;color:white;padding:14px 28px;text-decoration:none;border-radius:8px;font-weight:600;font-size:16px;display:inline-block;">🔒 Restablecer Contraseña</a>
     </div>
     <p style="font-size:13px;color:#7f8c8d;margin-top:20px;">O copia y pega este enlace en tu navegador:<br/>
     <span style="color:#3498db;word-break:break-all;">${enlace}</span></p>`;
    try {
      await enviarCorreo(usuario.email, cfg.reset_asunto, textBody, htmlBtn);
      forgotCooldowns.set(emailNorm, Date.now());
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ error: 'No se pudo enviar el correo. Verifica la configuración SMTP.' });
    }
  });

  // ── Cambio forzado ──
  router.post('/cambio-forzado', todosRoles, async (req, res) => {
    const { password } = req.body;
    const errores = validarPassword(password);
    if (errores.length) return res.status(400).json({ error: errores.join(', ') });
    const pwHashF = await hashPassword(password);
    db.prepare('UPDATE usuarios SET password = ?, cambio_password = 0 WHERE id = ?').run(pwHashF, req.usuario.id);
    db.prepare('DELETE FROM sesiones WHERE usuarioId = ? AND token != ?').run(req.usuario.id, req.headers['authorization']?.replace('Bearer ', ''));
    res.json({ ok: true });
  });

  // ── Reset Password ──
  router.post('/reset-password', async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Datos incompletos' });
    const errPassR = validarPassword(password);
    if (errPassR.length) return res.status(400).json({ error: 'Contraseña inválida: ' + errPassR.join(', ') });
    const registro = db.prepare('SELECT * FROM tokens_reset WHERE token = ?').get(token);
    if (!registro || new Date(registro.expira) < new Date()) {
      if (registro) db.prepare('DELETE FROM tokens_reset WHERE token = ?').run(token);
      return res.status(400).json({ error: 'El enlace es inválido o ya expiró' });
    }
    const pwHashR = await hashPassword(password);
    db.prepare('UPDATE usuarios SET password = ?, cambio_password = 0 WHERE id = ?').run(pwHashR, registro.usuarioId);
    db.prepare('DELETE FROM tokens_reset WHERE token = ?').run(token);
    db.prepare('DELETE FROM sesiones WHERE usuarioId = ?').run(registro.usuarioId);
    res.json({ ok: true });
  });

  return router;
};
