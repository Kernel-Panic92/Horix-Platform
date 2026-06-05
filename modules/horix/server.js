const express    = require('express');
const path       = require('path');
const fs         = require('fs');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const crypto     = require('crypto');
const nodemailer = require('nodemailer');
const multer     = require('multer');
const AdmZip     = require('adm-zip');
const escapeHtml = require('escape-html');

const ExcelJS   = require('exceljs');
require('dotenv').config();
const upload     = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const { db, uid } = require('./src/db');
require('./src/db/migrations')(db);
const { parseCookies, createAuth } = require('./src/middleware/auth');
const { hashPassword, verificarPassword, encryptSmtp, validarPassword, generateToken } = require('./src/utils/crypto');
const { getConfig, getAdminEmail } = require('./src/utils/config');
const { permisosPorRol, rolTienePermiso } = require('./src/utils/permisos');
const { restoreData } = require('./src/utils/restore')({ db, encryptSmtp });

const APP_NAME     = process.env.APP_NAME || 'Horix';
const BASE_URL     = process.env.BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
const enviarCorreo = require('./src/utils/email')({ getConfig, nodemailer, escapeHtml, BASE_URL, APP_NAME });
const PORT         = parseInt(process.env.PORT || '3000', 10);
const CORS_ORIGIN  = process.env.CORS_ORIGIN || '';
const BACKUP_TOKEN = process.env.BACKUP_TOKEN || '';

// Validar que HE_SECRET esté configurado (excepto en desarrollo)
if (!process.env.HE_SECRET && process.env.NODE_ENV === 'production') {
  console.error('❌ HE_SECRET no está configurado. Genera uno con: openssl rand -hex 32');
  process.exit(1);
}
const app = express();
app.set('trust proxy', 1);
const COOKIE_SECURE = process.env.NODE_ENV === 'production';

// CORS — restringir en producción
if (CORS_ORIGIN) {
  const origins = CORS_ORIGIN.split(',').map(s => s.trim());
  app.use(cors({ origin: origins, credentials: true }));
} else {
  if (process.env.NODE_ENV === 'production') console.warn('⚠ CORS_ORIGIN no configurado — todas las orígenes permitidas');
  app.use(cors());
}
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  hsts: process.env.NODE_ENV === 'production' ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false
}));

// CSP con nonce — reemplaza la directiva que helmet hubiera puesto
app.use((req, res, next) => {
  res.locals.nonce = crypto.randomBytes(16).toString('base64url');
  res.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self' 'nonce-" + res.locals.nonce + "' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net",
    "script-src-attr 'unsafe-inline'",
    "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'"
  ].join('; '));
  next();
});

// HTTPS redirect en producción (confía en proxy como nginx/caddy)
const ENFORCE_HTTPS = process.env.ENFORCE_HTTPS === 'true';
app.use((req, res, next) => {
  if (ENFORCE_HTTPS && req.protocol !== 'https') {
    const host = BASE_URL.replace(/^https?:\/\//, '');
    return res.redirect(301, 'https://' + host + req.originalUrl);
  }
  next();
});

app.use(express.json());

// Favicon — evitar 404 en telemetría
app.get('/favicon.ico', (req, res) => res.status(204).end());

const PUBLIC_DIR = path.resolve(__dirname, 'public');
const htmlCache = new Map();
function getHtmlCached(relPath) {
  const abs = path.resolve(PUBLIC_DIR, relPath.replace(/^\/+/, ''));
  const rel = path.relative(PUBLIC_DIR, abs);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  if (htmlCache.size > 20) htmlCache.delete(htmlCache.keys().next().value);
  if (!fs.existsSync(abs)) return null;
  const st = fs.statSync(abs);
  const cached = htmlCache.get(abs);
  if (cached && cached.mtime === st.mtimeMs) return cached.html;
  const html = fs.readFileSync(abs, 'utf8');
  htmlCache.set(abs, { html, mtime: st.mtimeMs });
  return html;
}
// Interceptar .html (y /) para inyectar nonce CSP — debe ir antes del static
app.get(['/', '/index.html', '/*.html'], (req, res) => {
  const relPath = req.path === '/' ? 'index.html' : req.path;
  const html = getHtmlCached(relPath);
  if (!html) return res.status(404).send('Not found');
  res.type('html')
    .set('Cache-Control', 'no-cache, must-revalidate')
    .set('Pragma', 'no-cache')
    .send(html.replace(/__NONCE__/g, res.locals.nonce));
});
app.use(express.static('public', {
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.set('Cache-Control', 'no-cache, must-revalidate');
      res.set('Pragma', 'no-cache');
    }
  }
}));

// Global Rate Limiting — 1000 req / 15 min por IP
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intenta de nuevo en unos minutos.' }
});
app.use('/api', globalLimiter);

// CSRF Protection — skip GET/HEAD/OPTIONS, unauthenticated auth endpoints, and platform JWT
const CSRF_SKIP_PATHS = ['/auth/login', '/auth/forgot-password', '/auth/reset-password', '/backup/alerta', '/telemetry'];
function csrfProtection(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  if (CSRF_SKIP_PATHS.includes(req.path)) return next();
  // Skip CSRF when using platform JWT (sameSite:lax cookie + nginx injection)
  const authHeader = req.headers['authorization'];
  if (authHeader?.startsWith('Bearer ') && JWT_SECRET) {
    try {
      jwt.verify(authHeader.slice(7), JWT_SECRET);
      return next();
    } catch {}
  }
  const headerToken = req.headers['x-csrf-token'];
  const cookies = parseCookies(req);
  const authToken = cookies.he_token || (authHeader ? authHeader.replace('Bearer ', '') : '');
  if (!authToken || !headerToken) return res.status(403).json({ error: 'CSRF token requerido' });
  const sesion = db.prepare('SELECT csrf FROM sesiones WHERE token = ?').get(authToken);
  if (!sesion || sesion.csrf !== headerToken) return res.status(403).json({ error: 'CSRF token inválido' });
  const newToken = crypto.randomBytes(32).toString('hex');
  db.prepare('UPDATE sesiones SET csrf = ? WHERE token = ?').run(newToken, authToken);
  res.set('x-csrf-token', newToken);
  next();
}
app.use('/api', csrfProtection);

// ─────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────
// Startup: advertir si hay usuarios con hash SHA-256 legacy pendientes de migrar
try {
  const legacyCount = db.prepare("SELECT COUNT(*) as n FROM usuarios WHERE length(password)=64 AND password NOT LIKE '$2%'").get().n;
  if (legacyCount > 0) console.warn(`⚠️  ${legacyCount} usuario(s) tienen hash SHA-256 legacy. Deben usar "Olvidaste tu contraseña" para crear una nueva.`);
} catch {}

// Seeds (tipos, permisos, roles, centros, admin inicial)
const boot = (async () => {
  await require('./src/db/seeds')({ db, uid, hashPassword, encryptSmtp, BASE_URL, APP_NAME });
})();

const JWT_SECRET = process.env.JWT_SECRET || '';

const { soloAdmin, adminRrhh, adminRrhhOp, podeAprobar, podeEditar, todosRoles, soloAdminOBkp, autenticar, requierePermiso } = createAuth({
  BACKUP_TOKEN,
  enviarCorreo,
  getConfig,
  PLATFORM_JWT_SECRET: JWT_SECRET
});

// ─────────────────────────────────────────────
// RATE LIMITING — protección fuerza bruta login
// ─────────────────────────────────────────────
const loginAttempts  = new Map();
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS    = 5 * 60 * 1000;   // 5 min
const LOGIN_BLOCK_MS     = 30 * 60 * 1000;  // 30 min

setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of loginAttempts.entries()) {
    if (data.blockedUntil && now > data.blockedUntil) loginAttempts.delete(ip);
    else if (now - data.firstAttempt > LOGIN_WINDOW_MS) loginAttempts.delete(ip);
  }
}, 10 * 60 * 1000);

function getRealIp(req) {
  const fwd = (req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(s => s && s !== '127.0.0.1');
  return fwd[0] || req.headers['x-real-ip'] || req.socket.remoteAddress || 'unknown';
}

function loginRateLimit(req, res, next) {
  const ip  = getRealIp(req);
  const now = Date.now();
  let data  = loginAttempts.get(ip) || { count: 0, firstAttempt: now, blockedUntil: null };
  if (data.blockedUntil && now < data.blockedUntil) {
    const mins = Math.ceil((data.blockedUntil - now) / 60000);
    return res.status(429).json({ error: `Demasiados intentos fallidos. Intenta de nuevo en ${mins} minuto${mins !== 1 ? 's' : ''}.` });
  }
  if (now - data.firstAttempt > LOGIN_WINDOW_MS) {
    data = { count: 0, firstAttempt: now, blockedUntil: null };
  }
  loginAttempts.set(ip, data);
  req._loginIp = ip;
  next();
}

function loginRegisterFail(ip, email = '') {
  const now  = Date.now();
  const data = loginAttempts.get(ip) || { count: 0, firstAttempt: now, blockedUntil: null };
  data.count++;
  if (data.count >= LOGIN_MAX_ATTEMPTS) {
    data.blockedUntil = now + LOGIN_BLOCK_MS;
    console.warn(`🔒 IP bloqueada por fuerza bruta: ${ip} (${data.count} intentos)`);
  }
  loginAttempts.set(ip, data);
  if (email) {
    db.prepare("INSERT INTO auditoria_logins (usuarioId, email, ip, tipo, timestamp) VALUES (NULL,?,?,'fallido',?)").run(email, ip, new Date().toISOString());
  }
}

function loginRegisterSuccess(ip, usuarioId, email) {
  loginAttempts.delete(ip);
  db.prepare("INSERT INTO auditoria_logins (usuarioId, email, ip, tipo, timestamp) VALUES (?,?,?,'exito',?)").run(usuarioId, email, ip, new Date().toISOString());
}

app.use('/api/auth', require('./src/routes/auth')({
  db, crypto, BASE_URL, COOKIE_SECURE,
  verificarPassword, generateToken, hashPassword, validarPassword,
  getConfig, enviarCorreo, permisosPorRol, parseCookies,
  loginAttempts, LOGIN_WINDOW_MS, LOGIN_MAX_ATTEMPTS, LOGIN_BLOCK_MS,
  loginRegisterFail, loginRegisterSuccess,
  middlewares: { loginRateLimit, todosRoles, soloAdmin }
}));

app.use('/api', require('./src/routes/misc')({ db, fs, path, __dirname, permisosPorRol, middlewares: { todosRoles } }));
app.use('/api/admin', require('./src/routes/auditoria')({ db, parseCookies, middlewares: { soloAdmin } }));

// ─────────────────────────────────────────────
// CONFIGURACIÓN SMTP (solo admin)
// ─────────────────────────────────────────────
app.use('/api/configuracion', require('./src/routes/configuracion')({ db, getConfig, encryptSmtp, enviarCorreo, middlewares: { soloAdmin } }));

// ─────────────────────────────────────────────
// CENTROS DE OPERACIÓN
// ─────────────────────────────────────────────
app.use('/api/centros', require('./src/routes/centros')({ db, uid, middlewares: { todosRoles, adminRrhh, soloAdmin } }));

app.use('/api/tipos', require('./src/routes/tipos')({ db, middlewares: { todosRoles, autenticar, requierePermiso } }));

// ─────────────────────────────────────────────
// USUARIOS
// ─────────────────────────────────────────────
app.use('/api/usuarios', require('./src/routes/usuarios')({ db, uid, BASE_URL, hashPassword, generateToken, getConfig, validarPassword, rolTienePermiso, enviarCorreo, middlewares: { soloAdmin, todosRoles } }));

// ─────────────────────────────────────────────
// PERMISOS CONFIGURABLES
// ─────────────────────────────────────────────
app.use('/api/roles', require('./src/routes/roles')({ db, middlewares: { adminRrhh, soloAdmin } }));
app.use('/api/permisos', require('./src/routes/permisos')({ db, middlewares: { soloAdmin } }));

app.use('/api/empleados', require('./src/routes/empleados')({ db, uid, upload, middlewares: { todosRoles, adminRrhh, soloAdmin } }));

// ─────────────────────────────────────────────
// NÓMINAS
// ─────────────────────────────────────────────
app.use('/api/nominas', require('./src/routes/nominas')({ db, uid, middlewares: { todosRoles, adminRrhh, soloAdmin } }));

// ─────────────────────────────────────────────
// REGISTROS
// ─────────────────────────────────────────────
app.use('/api/registros', require('./src/routes/registros')({
  db, uid, BASE_URL, getConfig, enviarCorreo, rolTienePermiso,
  middlewares: { todosRoles, adminRrhh, adminRrhhOp, podeEditar, podeAprobar, autenticar, requierePermiso }
}));

app.use('/api', require('./src/routes/dashboard')({ db, middlewares: { todosRoles } }));

// ─────────────────────────────────────────────
app.use('/api/backup', require('./src/routes/backup')({ db, AdmZip, fs, path, __dirname, encryptSmtp, getConfig, getAdminEmail, enviarCorreo, restoreData, parseCookies, middlewares: { soloAdminOBkp, soloAdmin } }));
app.use('/api/restore', require('./src/routes/backup').createRestoreRouter({ db, AdmZip, encryptSmtp, restoreData, parseCookies, middlewares: { soloAdmin } }));

app.use('/api', require('./src/routes/adjuntos')({ db, uid, rolTienePermiso, middlewares: { todosRoles, adminRrhhOp, podeEditar, autenticar, requierePermiso } }));
app.use('/api', require('./src/routes/exportar')({ db, ExcelJS, getConfig, enviarCorreo, rolTienePermiso, middlewares: { autenticar, requierePermiso, todosRoles } }));
app.use('/api', require('./src/routes/telemetry')({ db, parseCookies }));

// ─────────────────────────────────────────────
// CONSULTA — endpoint REST para chat web/móvil
// ─────────────────────────────────────────────
app.use('/api', require('./src/routes/consulta')({ db }));

// ─────────────────────────────────────────────
// MCP — Model Context Protocol (para LLMs)
// ─────────────────────────────────────────────
const mcp = require('./src/mcp/index');
app.use('/.well-known', mcp.createWellKnown());
app.use('/mcp/oauth', mcp.createOAuthRouter());
app.use('/mcp', mcp.createMiddleware());
// Fallback: Claude ignora registration_endpoint y llama a /register
app.use('/register', express.json(), mcp.createRegistrationFallback());
// Fallback: Claude ignora authorization_endpoint y construye /authorize en la raíz
app.use('/authorize', mcp.createAuthorizeFallback());
// Fallback: Claude ignora token_endpoint y construye /token en la raíz
app.use('/token', express.urlencoded({ extended: false }), mcp.createTokenFallback());
// Test endpoint para verificar que el servidor recibe requests nuevas
app.get('/mcp-test', (req, res) => res.send('MCP OK ' + Date.now()));

const logErrorTelemetry = db.prepare('INSERT INTO telemetria (evento, pagina, usuarioId, datos, creado) VALUES (?,?,?,?,?)');
// Error handler global — siempre responde JSON y registra en telemetría
app.use((err, req, res, next) => {
  console.error('❌ Error no manejado:', err?.message || err);
  try {
    logErrorTelemetry.run('error_backend', req.path || '', req.usuario?.id || '', JSON.stringify({ msg: err?.message }), new Date().toISOString());
  } catch (e2) { console.error('Error logging to telemetry:', e2.message); }
  res.status(500).json({ error: 'Error interno del servidor' });
});

// INICIAR
// ─────────────────────────────────────────────
boot.then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Servidor corriendo en http://0.0.0.0:${PORT}`);
  });
}).catch(err => {
  console.error('Error durante la inicialización:', err);
  process.exit(1);
});
