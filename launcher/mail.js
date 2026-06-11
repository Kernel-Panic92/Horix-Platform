const nodemailer = require('nodemailer');

let _transport = null;
let _config = {};

function getConfig(db) {
  const rows = db.prepare('SELECT key, value FROM config WHERE key LIKE "smtp_%"').all();
  const cfg = {};
  for (const r of rows) cfg[r.key] = r.value;
  return cfg;
}

function createTransport(cfg) {
  if (!cfg.smtp_host || !cfg.smtp_port) return null;
  return nodemailer.createTransport({
    host: cfg.smtp_host,
    port: parseInt(cfg.smtp_port, 10),
    secure: cfg.smtp_secure === 'true',
    auth: cfg.smtp_user ? {
      user: cfg.smtp_user,
      pass: cfg.smtp_pass || '',
    } : undefined,
    tls: { rejectUnauthorized: cfg.smtp_allow_self_signed === 'true' ? false : true },
  });
}

function init(db) {
  _config = getConfig(db);
  _transport = createTransport(_config);
}

function refresh(db) {
  init(db);
}

function isConfigured() {
  return !!_transport;
}

function getFromAddress() {
  return _config.smtp_from || _config.smtp_user || 'noreply@horix-platform.local';
}

function getFromName() {
  return _config.smtp_from_name || 'Horix Platform';
}

async function sendMail({ to, subject, html, text }) {
  if (!_transport) throw new Error('SMTP no configurado');
  return _transport.sendMail({
    from: `"${getFromName()}" <${getFromAddress()}>`,
    to,
    subject,
    html,
    text: text || html.replace(/<[^>]*>/g, ''),
  });
}

async function sendResetEmail(email, resetUrl, nombre) {
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  body{font-family:'Inter',sans-serif;background:#0d0f14;color:#e8ecf5;margin:0;padding:32px;}
  .box{background:#161a23;border:1px solid #2a3045;border-radius:16px;padding:32px;max-width:480px;margin:0 auto;}
  .logo{font-size:22px;font-weight:800;color:#e8ecf5;margin-bottom:4px;}
  .logo span{color:#4f8ef7;}
  .btn{display:inline-block;background:#4f8ef7;color:#fff;padding:12px 28px;border-radius:9px;text-decoration:none;font-weight:600;margin:16px 0;}
  .muted{color:#7a85a0;font-size:13px;}
  hr{border:none;border-top:1px solid #2a3045;margin:24px 0;}
</style></head><body>
<div class="box">
  <div class="logo">&#9889; <span>Horix Platform</span></div>
  <p style="margin:20px 0 8px;font-size:15px;">Hola <strong>${nombre || 'usuario'}</strong>,</p>
  <p style="color:#7a85a0;font-size:14px;">Recibimos una solicitud para restablecer tu contraseña. Haz clic en el botón para crear una nueva:</p>
  <div style="text-align:center;"><a class="btn" href="${resetUrl}">Restablecer contraseña</a></div>
  <p class="muted">Este enlace expira en 1 hora. Si no solicitaste este cambio, ignora este correo.</p>
  <hr>
  <p class="muted" style="font-size:11px;">&copy; 2026 Edgar Velasquez &middot; Horix Platform</p>
</div></body></html>`;
  return sendMail({ to: email, subject: 'Recuperación de contraseña - Horix Platform', html });
}

module.exports = { init, refresh, isConfigured, sendMail, sendResetEmail, getConfig: () => _config };
