const jwt = require('jsonwebtoken');
const db = require('../db');

/**
 * Verifica el JWT en el header Authorization: Bearer <token>
 * Adjunta req.usuario con datos del usuario local (JIT provisioning por email)
 */
async function authMiddleware(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Token requerido' });
    }

    const token = header.split(' ')[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // JIT: buscar o crear usuario local por email
    const { rows } = await db.query(
      'SELECT u.*, a.nombre AS area_nombre FROM usuarios u LEFT JOIN areas a ON a.id = u.area_id WHERE u.email = $1',
      [payload.email]
    );

    const permisosGlobales = payload.permisos || [];
    if (rows.length > 0) {
      req.usuario = { ...rows[0], _token: token, _permisos_globales: permisosGlobales };
    } else {
      const { rows: newRows } = await db.query(
        `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
         VALUES ($1, $2, 'platform_jit', $3, TRUE)
         RETURNING id, nombre, email, rol`,
        [payload.nombre, payload.email, payload.rol]
      );
      req.usuario = { ...newRows[0], _token: token, _permisos_globales: permisosGlobales };
      console.log('[Auth] JIT provisioned user:', payload.email);
    }

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Sesión expirada' });
    }
    console.error('[Auth middleware]', err.message);
    return res.status(401).json({ error: err.name === 'JsonWebTokenError' ? 'Token inválido' : 'Error de autenticación' });
  }
}

/**
 * Genera middleware de verificación de rol.
 * Uso: requireRol('admin', 'contador')
 */
function requireRol(...roles) {
  return (req, res, next) => {
    if (!req.usuario) {
      return res.status(401).json({ error: 'No autenticado' });
    }
    if (!roles.includes(req.usuario.rol)) {
      return res.status(403).json({
        error: `Acceso denegado. Roles requeridos: ${roles.join(', ')}`
      });
    }
    next();
  };
}

module.exports = { authMiddleware, requireRol };
