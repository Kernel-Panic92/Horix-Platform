require('dotenv').config();
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || '3002', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';


const db = new Database(path.join(__dirname, 'launcher.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    rol TEXT NOT NULL DEFAULT 'admin',
    activo INTEGER NOT NULL DEFAULT 1,
    creado TEXT NOT NULL DEFAULT (datetime('now')),
    actualizado TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);
// Migrate: rename comprador → operador
db.prepare("UPDATE usuarios SET rol = 'operador' WHERE rol = 'comprador'").run();

const adminEmail = 'admin@horix.com';
if (!db.prepare('SELECT id FROM usuarios WHERE email = ?').get(adminEmail)) {
  db.prepare('INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)').run('Admin', adminEmail, bcrypt.hashSync('admin123', 10), 'admin');
}

// ── New Tables ──
db.exec(`
  CREATE TABLE IF NOT EXISTS modulos_plataforma (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    descripcion TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    icon TEXT NOT NULL DEFAULT '📦',
    mcp_enabled INTEGER NOT NULL DEFAULT 1,
    activo INTEGER NOT NULL DEFAULT 1,
    orden INTEGER NOT NULL DEFAULT 0,
    public_url TEXT NOT NULL DEFAULT '',
    mcp_token TEXT NOT NULL DEFAULT ''
  )
`);

// Migrate columns
try { db.exec('ALTER TABLE modulos_plataforma ADD COLUMN url TEXT NOT NULL DEFAULT ""'); } catch {}
try { db.exec('ALTER TABLE modulos_plataforma ADD COLUMN icon TEXT NOT NULL DEFAULT "📦"'); } catch {}
try { db.exec('ALTER TABLE modulos_plataforma ADD COLUMN mcp_enabled INTEGER NOT NULL DEFAULT 1'); } catch {}
try { db.exec('ALTER TABLE modulos_plataforma ADD COLUMN activo INTEGER NOT NULL DEFAULT 1'); } catch {}
try { db.exec('ALTER TABLE modulos_plataforma ADD COLUMN orden INTEGER NOT NULL DEFAULT 0'); } catch {}
try { db.exec('ALTER TABLE modulos_plataforma ADD COLUMN public_url TEXT NOT NULL DEFAULT ""'); } catch {}
try { db.exec('ALTER TABLE modulos_plataforma ADD COLUMN mcp_token TEXT NOT NULL DEFAULT ""'); } catch {}
try { db.exec('ALTER TABLE modulos_plataforma ADD COLUMN proxy_prefix TEXT NOT NULL DEFAULT ""'); } catch {}

// Seed public_url from url if empty
db.prepare("UPDATE modulos_plataforma SET public_url = url WHERE public_url = '' AND url != ''").run();

function getModulos(onlyMcp) {
  let sql = 'SELECT * FROM modulos_plataforma WHERE activo = 1';
  if (onlyMcp) sql += ' AND mcp_enabled = 1';
  return db.prepare(sql + ' ORDER BY orden').all();
}



function parseCookies(req) {
  const raw = req.headers['cookie'] || '';
  const result = {};
  raw.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx !== -1) result[pair.slice(0, idx).trim()] = decodeURIComponent(pair.slice(idx + 1).trim());
  });
  return result;
}

function verificarToken(req, res, next) {
  let token = null;
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) token = header.split(' ')[1];
  if (!token) {
    const cookies = parseCookies(req);
    token = cookies.launcher_jwt;
  }
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  try {
    req.usuario = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function soloAdmin(req, res, next) {
  if (!req.usuario || req.usuario.rol !== 'admin') return res.status(403).json({ error: 'Se requiere rol admin' });
  next();
}

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Campos requeridos' });
  try {
    const user = db.prepare('SELECT * FROM usuarios WHERE email = ? AND activo = 1').get(email.toLowerCase().trim());
    if (!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(401).json({ error: 'Credenciales inválidas' });
    const payload = { id: user.id, email: user.email, nombre: user.nombre, rol: user.rol };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
    db.prepare("UPDATE usuarios SET actualizado = datetime('now') WHERE id = ?").run(user.id);
    res.cookie('launcher_jwt', token, { httpOnly: false, secure: false, sameSite: 'lax', maxAge: 24 * 60 * 60 * 1000 });
    res.json({ jwt: token, usuario: payload });
  } catch (e) { console.error('[LOGIN]', e.stack || e.message); res.status(500).json({ error: 'Error interno' }); }
});

app.get('/api/modulos', verificarToken, (req, res) => {
  res.json(getModulos(false).map(m => ({ id: m.id, nombre: m.nombre, url: m.public_url || m.url, icon: m.icon, descripcion: m.descripcion })));
});

app.get('/api/auth/me', verificarToken, (req, res) => {
  const user = db.prepare('SELECT id, nombre, email, rol, activo, creado FROM usuarios WHERE id = ?').get(req.usuario.id);
  res.json(user);
});

app.get('/api/admin/usuarios', verificarToken, soloAdmin, (req, res) => {
  res.json(db.prepare('SELECT id, nombre, email, rol, activo, creado, actualizado FROM usuarios ORDER BY id').all());
});

app.post('/api/admin/usuarios', verificarToken, soloAdmin, (req, res) => {
  const { nombre, email, password } = req.body;
  if (!nombre || !email || !password) return res.status(400).json({ error: 'Campos requeridos' });
  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)').run(nombre, email.toLowerCase().trim(), hash, 'admin');
    res.json({ id: result.lastInsertRowid, nombre, email: email.toLowerCase().trim(), rol: 'admin', activo: 1 });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'El email ya existe' });
    console.error('[Create user]', e); res.status(500).json({ error: 'Error interno' });
  }
});

app.put('/api/admin/usuarios/:id', verificarToken, soloAdmin, (req, res) => {
  const { nombre, email, password, activo } = req.body;
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
  const user = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'No encontrado' });
  const updates = []; const params = [];
  if (nombre !== undefined) { updates.push('nombre = ?'); params.push(nombre); }
  if (email !== undefined) { updates.push('email = ?'); params.push(email.toLowerCase().trim()); }
  if (password) { updates.push('password_hash = ?'); params.push(bcrypt.hashSync(password, 10)); }
  if (activo !== undefined) { updates.push('activo = ?'); params.push(activo ? 1 : 0); }
  if (!updates.length) return res.status(400).json({ error: 'Sin cambios' });
  updates.push("actualizado = datetime('now')"); params.push(id);
  try {
    db.prepare(`UPDATE usuarios SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Error interno' }); }
});

app.delete('/api/admin/usuarios/:id', verificarToken, soloAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id) || id === req.usuario.id) return res.status(400).json({ error: 'ID inválido o no puedes desactivarte' });
  const user = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'No encontrado' });
  db.prepare("UPDATE usuarios SET activo = 0, actualizado = datetime('now') WHERE id = ?").run(id);
  res.json({ ok: true });
});

app.delete('/api/admin/usuarios/:id/permanent', verificarToken, soloAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id) || id === req.usuario.id) return res.status(400).json({ error: 'ID inválido o no puedes eliminarte' });
  const result = db.prepare('DELETE FROM usuarios WHERE id = ?').run(id);
  if (result.changes === 0) return res.status(404).json({ error: 'No encontrado' });
  res.json({ ok: true });
});

// ── API: Módulos ──
app.get('/api/admin/modulos', verificarToken, soloAdmin, (req, res) => {
  res.json(getModulos(false));
});

app.post('/api/admin/modulos', verificarToken, soloAdmin, (req, res) => {
  const { id, nombre, url, public_url, icon, descripcion, mcp_enabled, activo, proxy_prefix } = req.body;
  if (!id || !nombre) return res.status(400).json({ error: 'ID y nombre requeridos' });
  db.prepare('INSERT OR REPLACE INTO modulos_plataforma (id, nombre, descripcion, url, public_url, icon, mcp_enabled, activo, proxy_prefix) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, nombre, descripcion || '', url || '', public_url || url || '', icon || '📦', mcp_enabled !== false ? 1 : 0, activo !== false ? 1 : 0, proxy_prefix || '');
  res.json({ ok: true });
});

app.put('/api/admin/modulos/:id', verificarToken, soloAdmin, (req, res) => {
  const { nombre, url, public_url, icon, descripcion, mcp_enabled, activo, proxy_prefix } = req.body;
  const { id } = req.params;
  if (!db.prepare('SELECT id FROM modulos_plataforma WHERE id = ?').get(id)) return res.status(404).json({ error: 'No encontrado' });
  const u = [];
  const p = [];
  if (nombre !== undefined) { u.push('nombre = ?'); p.push(nombre); }
  if (url !== undefined) { u.push('url = ?'); p.push(url); }
  if (public_url !== undefined) { u.push('public_url = ?'); p.push(public_url); }
  if (icon !== undefined) { u.push('icon = ?'); p.push(icon); }
  if (descripcion !== undefined) { u.push('descripcion = ?'); p.push(descripcion); }
  if (mcp_enabled !== undefined) { u.push('mcp_enabled = ?'); p.push(mcp_enabled ? 1 : 0); }
  if (activo !== undefined) { u.push('activo = ?'); p.push(activo ? 1 : 0); }
  if (proxy_prefix !== undefined) { u.push('proxy_prefix = ?'); p.push(proxy_prefix); }
  if (!u.length) return res.status(400).json({ error: 'Sin cambios' });
  p.push(id);
  db.prepare(`UPDATE modulos_plataforma SET ${u.join(', ')} WHERE id = ?`).run(...p);
  res.json({ ok: true });
});

app.delete('/api/admin/modulos/:id', verificarToken, soloAdmin, (req, res) => {
  db.prepare('DELETE FROM modulos_plataforma WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── API: Health check ──
app.get('/api/admin/health', verificarToken, soloAdmin, async (req, res) => {
  const modulos = getModulos(false);
  const results = await Promise.all(modulos.map(async (m) => {
    try {
      const r = await fetch(m.url + '/mcp', { signal: AbortSignal.timeout(3000) });
      return { id: m.id, nombre: m.nombre, estado: r.ok ? 'online' : 'error', status: r.status };
    } catch (e) {
      return { id: m.id, nombre: m.nombre, estado: 'offline', error: e.message };
    }
  }));
  res.json(results);
});

// ── API: MCP config ──
app.get('/api/admin/mcp', verificarToken, soloAdmin, (req, res) => {
  res.json(db.prepare('SELECT id, nombre, icon, url, mcp_enabled, mcp_token FROM modulos_plataforma ORDER BY orden').all());
});

app.put('/api/admin/mcp/:id', verificarToken, soloAdmin, (req, res) => {
  const { url, mcp_enabled, mcp_token } = req.body;
  const { id } = req.params;
  if (!db.prepare('SELECT id FROM modulos_plataforma WHERE id = ?').get(id)) return res.status(404).json({ error: 'No encontrado' });
  const u = []; const p = [];
  if (url !== undefined) { u.push('url = ?'); p.push(url); }
  if (mcp_enabled !== undefined) { u.push('mcp_enabled = ?'); p.push(mcp_enabled ? 1 : 0); }
  if (mcp_token !== undefined) { u.push('mcp_token = ?'); p.push(mcp_token); }
  if (!u.length) return res.status(400).json({ error: 'Sin cambios' });
  p.push(id);
  db.prepare(`UPDATE modulos_plataforma SET ${u.join(', ')} WHERE id = ?`).run(...p);
  res.json({ ok: true });
});

app.post('/api/admin/mcp/:id/test', verificarToken, soloAdmin, async (req, res) => {
  const mod = db.prepare('SELECT * FROM modulos_plataforma WHERE id = ?').get(req.params.id);
  if (!mod) return res.status(404).json({ error: 'No encontrado' });
  try {
    const headers = { 'Content-Type': 'application/json' };
    if (mod.mcp_token) headers['Authorization'] = 'Bearer ' + mod.mcp_token;
    const r = await fetch(mod.url + '/mcp', { headers, signal: AbortSignal.timeout(5000) });
    const data = await r.json().catch(() => null);
    res.json({ ok: r.ok, status: r.status, data });
  } catch (e) {
    res.json({ ok: false, error: e.message });
  }
});

// ── Nginx config generation ──
function generarNginx() {
  const configPath = '/opt/horix-platform/config.env';
  let dominio = 'localhost';
  let mode = 'test';
  try {
    if (fs.existsSync(configPath)) {
      const raw = fs.readFileSync(configPath, 'utf8');
      const m = raw.match(/^DOMAIN=(.+)$/m);
      if (m) dominio = m[1].trim();
      const mm = raw.match(/^MODE=(.+)$/m);
      if (mm) mode = mm[1].trim();
    }
  } catch {}

  const isProd = mode === 'prod';
  const port = isProd ? 443 : 8445;
  const sslCert = isProd
    ? `/etc/letsencrypt/live/${dominio}/fullchain.pem`
    : '/etc/ssl/platform/cert.pem';
  const sslKey = isProd
    ? `/etc/letsencrypt/live/${dominio}/privkey.pem`
    : '/etc/ssl/platform/key.pem';

  const modulos = db.prepare("SELECT * FROM modulos_plataforma WHERE activo = 1 AND proxy_prefix != '' ORDER BY orden").all();

  let locations = '';
  for (const m of modulos) {
    if (!m.url) continue;
    const prefix = m.proxy_prefix.startsWith('/') ? m.proxy_prefix : '/' + m.proxy_prefix;
    const prefixClean = prefix.replace(/\/+$/, '');
    const prefixMatch = prefixClean.replace(/\//g, '\\/');
    locations += `
    location ${prefix} {
        rewrite ^${prefixMatch}(/.*)$ $1 break;
        proxy_pass ${m.url};
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
`;
  }

  return `# Auto-generated by horix-launcher
server {
    listen ${port} ssl http2;
    server_name ${isProd ? dominio : '_'};

    ssl_certificate     ${sslCert};
    ssl_certificate_key ${sslKey};
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_ciphers         ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 1d;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header X-Frame-Options SAMEORIGIN;
    add_header X-Content-Type-Options nosniff;

    client_max_body_size 50M;

    # Launcher: API + SPA + MCP
    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
${locations}}
`;
}

app.get('/api/admin/nginx', verificarToken, soloAdmin, (req, res) => {
  const config = generarNginx();
  const configPath = '/etc/nginx/sites-available/horix-erp';
  let actual = '';
  try { actual = fs.readFileSync(configPath, 'utf8'); } catch {}
  res.json({ config, actual, matches: config === actual });
});

app.post('/api/admin/nginx/generate', verificarToken, soloAdmin, (req, res) => {
  const config = generarNginx();
  const configPath = '/etc/nginx/sites-available/horix-erp';
  try {
    fs.writeFileSync(configPath, config, 'utf8');
    try {
      fs.symlinkSync('/etc/nginx/sites-available/horix-erp', '/etc/nginx/sites-enabled/horix-erp');
    } catch {}
    try {
      fs.unlinkSync('/etc/nginx/sites-enabled/default');
    } catch {}
    const { execSync } = require('child_process');
    execSync('nginx -t', { timeout: 5000 });
    execSync('systemctl reload nginx', { timeout: 5000 });
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, error: e.message || 'Error al generar nginx' });
  }
});

// ── MCP Gateway ──
app.post('/mcp', async (req, res) => {
  const msg = req.body;
  if (!msg || msg.jsonrpc !== '2.0') return res.status(400).json({ jsonrpc: '2.0', error: { code: -32600, message: 'Invalid Request' }, id: null });
  const id = msg.id ?? null;

  if (msg.method === 'tools/list') {
    const allTools = [];
    const modulos = getModulos(true);
    for (const m of modulos) {
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (m.mcp_token) headers['Authorization'] = 'Bearer ' + m.mcp_token;
        const r = await fetch(m.url + '/mcp', {
          method: 'POST', headers,
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
          signal: AbortSignal.timeout(5000),
        });
        const data = await r.json();
        if (data.result?.tools) {
          for (const t of data.result.tools) allTools.push({ ...t, name: m.id + '_' + t.name });
        }
      } catch (e) { console.warn(`[MCP] Failed to list tools from ${m.id}:`, e.message); }
    }
    return res.json({ jsonrpc: '2.0', result: { tools: allTools }, id });
  }

  if (msg.method === 'tools/call') {
    const { name, arguments: args } = msg.params || {};
    if (!name) return res.json({ jsonrpc: '2.0', error: { code: -32602, message: 'Missing tool name' }, id });
    const parts = name.split('_');
    const prefix = parts[0];
    const modulos = getModulos(true);
    const mod = modulos.find(m => m.id === prefix);
    if (!mod) return res.json({ jsonrpc: '2.0', error: { code: -32601, message: 'Unknown or disabled module: ' + prefix }, id });
    try {
      const headers = { 'Content-Type': 'application/json' };
      if (mod.mcp_token) headers['Authorization'] = 'Bearer ' + mod.mcp_token;
      const r = await fetch(mod.url + '/mcp', {
        method: 'POST', headers,
        body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: parts.slice(1).join('_'), arguments: args } }),
        signal: AbortSignal.timeout(30000),
      });
      return res.json(await r.json());
    } catch (e) {
      return res.json({ jsonrpc: '2.0', error: { code: -32000, message: 'Error contacting ' + prefix + ': ' + e.message }, id });
    }
  }

  if (msg.method === 'notifications/initialized') return res.status(202).end();
  return res.status(400).json({ jsonrpc: '2.0', error: { code: -32601, message: 'Method not found' }, id });
});

app.get('/mcp', (req, res) => res.json({ status: 'ok', server: 'horix-launcher' }));

app.use(express.static(path.join(__dirname, 'shell')));
app.get('*', (req, res) => {
  const htmlPath = path.join(__dirname, 'shell', 'index.html');
  if (fs.existsSync(htmlPath)) return res.sendFile(htmlPath);
  res.status(404).json({ error: 'Not found: ' + req.path });
});

app.listen(PORT, () => console.log('Launcher on port ' + PORT));
