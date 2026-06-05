const Database = require('better-sqlite3');
const crypto   = require('crypto');

const db = new Database(process.env.DB_PATH || 'horas_extra.db');
db.pragma('journal_mode = WAL');

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

module.exports = { db, uid };
