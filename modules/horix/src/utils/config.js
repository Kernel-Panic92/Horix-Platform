const { db } = require('../db');
const { decryptSmtp } = require('./crypto');

function getConfig() {
  const rows = db.prepare('SELECT clave, valor FROM configuracion').all();
  const cfg  = Object.fromEntries(rows.map(r => [r.clave, r.valor]));
  if (cfg.smtp_password) cfg.smtp_password = decryptSmtp(cfg.smtp_password);
  return cfg;
}

function getAdminEmail() {
  const admin = db.prepare("SELECT email FROM usuarios WHERE rol='admin' AND activo=1 ORDER BY creado ASC LIMIT 1").get();
  return admin ? admin.email : null;
}

function getBaseUrl(BASE_URL) {
  return BASE_URL;
}

module.exports = { getConfig, getAdminEmail, getBaseUrl };
