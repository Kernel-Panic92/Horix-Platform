const crypto = require('crypto');
const bcrypt = require('bcrypt');

const BCRYPT_ROUNDS = 12;
const AES_KEY = crypto.scryptSync(process.env.HE_SECRET || 'dev_secret_not_for_prod', 'he_salt_aes', 32);

function hashPassword(p) {
  return bcrypt.hash(p, BCRYPT_ROUNDS);
}

async function verificarPassword(plain, hash) {
  if (hash && hash.length === 64 && !hash.startsWith('$2')) {
    return { ok: false, legacy: true };
  }
  return { ok: await bcrypt.compare(plain, hash), migrar: false };
}

function encryptSmtp(text) {
  if (!text) return '';
  const iv         = crypto.randomBytes(16);
  const cipher     = crypto.createCipheriv('aes-256-gcm', AES_KEY, iv);
  const encrypted  = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag    = cipher.getAuthTag();
  return 'aes:' + iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted.toString('hex');
}

function decryptSmtp(stored) {
  if (!stored || !stored.startsWith('aes:')) return stored;
  try {
    const [, ivHex, tagHex, encHex] = stored.split(':');
    const decipher = crypto.createDecipheriv('aes-256-gcm', AES_KEY, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8');
  } catch { return ''; }
}

function validarPassword(p) {
  const errores = [];
  if (!p || p.length < 8)              errores.push('M\u00ednimo 8 caracteres');
  if (!/[A-Z]/.test(p))                errores.push('Al menos una may\u00fascula');
  if (!/[0-9]/.test(p))                errores.push('Al menos un n\u00famero');
  if (!/[!@#$%^&*(),.?":{}|<>_\-+=/\\[\]~`]/.test(p)) errores.push('Al menos un car\u00e1cter especial');
  return errores;
}

function generateToken() {
  return crypto.randomBytes(48).toString('hex');
}

module.exports = { hashPassword, verificarPassword, encryptSmtp, decryptSmtp, validarPassword, generateToken };
