const { db } = require('../db');
const jwt = require('jsonwebtoken');

function parseCookies(req) {
  const raw = req.headers['cookie'] || '';
  const result = {};
  raw.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx !== -1) {
      result[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
    }
  });
  return result;
}

// JIT provision user from platform JWT claims
function provisionUsuario(payload) {
  let usuario = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(payload.email);
  if (!usuario) {
    db.prepare('INSERT INTO usuarios (nombre, email, password_hash, rol, activo) VALUES (?, ?, ?, ?, 1)').run(
      payload.nombre, payload.email, 'platform_jit', payload.rol
    );
    usuario = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(payload.email);
  } else if (!usuario.activo) {
    return null;
  }
  return usuario;
}

function createAuth({ BACKUP_TOKEN, enviarCorreo, getConfig, PLATFORM_JWT_SECRET }) {
  function notifyNewIP(usuarioId, oldIP, newIP, ua) {
    try {
      const usuario = db.prepare('SELECT nombre, email FROM usuarios WHERE id = ?').get(usuarioId);
      if (!usuario || !getConfig().smtp_host) return;
      const ahora = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
      enviarCorreo(usuario.email, 'Nuevo inicio de sesión en Horix',
        `Hola ${usuario.nombre},\n\nSe detectó un inicio de sesión en tu cuenta de Horix desde una dirección IP diferente.\n\n` +
        `IP anterior: ${oldIP}\nIP nueva: ${newIP}\nAgente: ${ua}\nFecha: ${ahora}\n\n` +
        `Si fuiste t, ignora este mensaje.\nSi no reconoces esta actividad, cambia tu contraseña inmediatamente.\n\nSaludos,\nEquipo HORIX`);
    } catch (e) {
      console.error('Error notificando nuevo IP:', e.message);
    }
  }

  function autenticar(rolesPermitidos = []) {
    return (req, res, next) => {
      // Platform mode: trust X-User-* headers from MCP Gateway proxy
      if (req.headers['x-user-id']) {
        const email = req.headers['x-user-email'];
        let usuario = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
        if (!usuario) {
          db.prepare('INSERT INTO usuarios (nombre, email, password_hash, rol, activo) VALUES (?, ?, ?, ?, 1)').run(
            req.headers['x-user-nombre'], email, 'platform_jit', req.headers['x-user-rol']
          );
          usuario = db.prepare('SELECT * FROM usuarios WHERE email = ?').get(email);
        }
        if (!usuario || !usuario.activo) return res.status(401).json({ error: 'Usuario inactivo' });
        req.usuario = { ...usuario, _permisos_globales: JSON.parse(req.headers['x-user-permisos'] || '[]') };
        if (rolesPermitidos.length && !rolesPermitidos.includes(usuario.rol))
          return res.status(403).json({ error: 'Sin permisos para esta acción' });
        return next();
      }

      const authHeader = req.headers['authorization'];

      // Platform JWT second
      if (authHeader?.startsWith('Bearer ') && PLATFORM_JWT_SECRET) {
        try {
          const payload = jwt.verify(authHeader.slice(7), PLATFORM_JWT_SECRET);
          const usuario = provisionUsuario(payload);
          if (!usuario) return res.status(401).json({ error: 'Usuario inactivo' });
          req.usuario = { ...usuario, _permisos_globales: payload.permisos || [] };
          if (rolesPermitidos.length && !rolesPermitidos.includes(usuario.rol))
            return res.status(403).json({ error: 'Sin permisos para esta acción' });
          return next();
        } catch {
          // JWT inválido → intentar cookie session como fallback
        }
      }

      // Fallback: cookie session (standalone mode)
      const cookies = parseCookies(req);
      const token = cookies.he_token || (authHeader ? authHeader.replace('Bearer ', '') : '');
      if (!token) return res.status(401).json({ error: 'No autenticado' });
      const sesion = db.prepare('SELECT * FROM sesiones WHERE token = ?').get(token);
      if (!sesion || new Date(sesion.expira) < new Date()) {
        if (sesion) db.prepare('DELETE FROM sesiones WHERE token = ?').run(token);
        return res.status(401).json({ error: 'Sesión expirada' });
      }

      const currentIP = req.ip || '';
      const currentUA = req.headers['user-agent'] || '';
      const currentBFP = req.headers['x-browser-fp'] || '';

      if (sesion.bfp && currentBFP && sesion.bfp !== currentBFP) {
        db.prepare('DELETE FROM sesiones WHERE token = ?').run(token);
        notifyNewIP(sesion.usuarioId, sesion.ip, currentIP, currentUA);
        console.warn(`Sesión eliminada por cambio de fingerprint: ${sesion.bfp} → ${currentBFP}`);
        return res.status(401).json({ error: 'Sesión invalidada por cambio de navegador' });
      }

      if (!sesion.bfp && currentBFP) {
        db.prepare('UPDATE sesiones SET bfp = ? WHERE token = ?').run(currentBFP, token);
      }

      if (sesion.ua && sesion.ua !== currentUA) {
        db.prepare('DELETE FROM sesiones WHERE token = ?').run(token);
        console.warn(`Sesión eliminada por cambio de User-Agent: ${sesion.ua} → ${currentUA}`);
        return res.status(401).json({ error: 'Sesión invalidada por cambio de agente' });
      }

      if (sesion.ip && sesion.ip !== currentIP) {
        notifyNewIP(sesion.usuarioId, sesion.ip, currentIP, currentUA);
        db.prepare('DELETE FROM sesiones WHERE token = ?').run(token);
        console.warn(`Sesión eliminada por cambio de IP: ${sesion.ip} → ${currentIP}`);
        return res.status(401).json({ error: 'Sesión invalidada por cambio de IP' });
      }

      const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ? AND activo = 1').get(sesion.usuarioId);
      if (!usuario) return res.status(401).json({ error: 'Usuario inactivo' });
      db.prepare("UPDATE sesiones SET expira = datetime('now', '+30 days') WHERE token = ?").run(token);
      if (rolesPermitidos.length && !rolesPermitidos.includes(usuario.rol))
        return res.status(403).json({ error: 'Sin permisos para esta acción' });
      req.usuario = usuario;
      next();
    };
  }

  function requierePermiso(permiso) {
    return (req, res, next) => {
      if (!req.usuario) return res.status(401).json({ error: 'No autenticado' });
      const tiene = db.prepare('SELECT 1 FROM permisos_roles WHERE rol = ? AND permiso = ?').get(req.usuario.rol, permiso);
      if (!tiene) return res.status(403).json({ error: 'Permiso denegado: ' + permiso });
      next();
    };
  }

  const soloAdmin      = autenticar(['admin']);
  const adminRrhh      = autenticar(['admin', 'rrhh']);
  const adminRrhhOp    = autenticar(['admin', 'rrhh', 'operador', 'gerencia']);
  const podeAprobar    = [autenticar([]), requierePermiso('aprobar')];
  const podeEditar     = [autenticar([]), requierePermiso('editar')];
  const todosRoles     = autenticar([]);

  function requiereBackupToken(req, res, next) {
    if (!BACKUP_TOKEN) return res.status(500).json({ error: 'BACKUP_TOKEN no configurado en .env' });
    const token = req.headers['authorization']?.replace('Bearer ', '');
    if (!token || token !== BACKUP_TOKEN) return res.status(401).json({ error: 'Token de backup inválido' });
    req.usuario = { rol: 'admin', id: null, nombre: 'Backup Automático' };
    next();
  }

  const soloAdminOBkp = (req, res, next) => {
    const token = req.headers['authorization']?.replace('Bearer ', '');
    if (token) return requiereBackupToken(req, res, next);
    soloAdmin(req, res, next);
  };

  return { autenticar, requierePermiso, soloAdmin, adminRrhh, adminRrhhOp, podeAprobar, podeEditar, todosRoles, requiereBackupToken, soloAdminOBkp };
}

module.exports = { parseCookies, createAuth };
