// MCP Gateway — Auth centralizada + MCP proxy a módulos
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const path = require('path');
const app = express();
app.use(express.json());

const PORT = parseInt(process.env.MCP_PORT || '3002', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const HORIX_URL = 'http://127.0.0.1:' + (process.env.HORIX_PORT || '3000');
const DOCFLOW_URL = 'http://127.0.0.1:' + (process.env.DOCFLOW_PORT || '3100');

// ── SQLite user DB ──
const db = new Database(path.join(__dirname, 'platform.db'));
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    rol TEXT NOT NULL DEFAULT 'comprador',
    activo INTEGER NOT NULL DEFAULT 1,
    creado TEXT NOT NULL DEFAULT (datetime('now')),
    actualizado TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS permisos (
    id TEXT PRIMARY KEY,
    nombre TEXT NOT NULL,
    descripcion TEXT NOT NULL DEFAULT '',
    modulo TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS roles_permisos (
    rol TEXT NOT NULL,
    permiso_id TEXT NOT NULL REFERENCES permisos(id),
    PRIMARY KEY (rol, permiso_id)
  )
`);

// ── Seed permisos ──
const PERMISOS = [
  ['horix:empleados',   'Empleados',        'Gestionar empleados',                    'horix'],
  ['horix:registros',   'Registros',        'Gestionar novedades y registros',        'horix'],
  ['horix:centros',     'Centros de costo', 'Gestionar centros de costo',             'horix'],
  ['horix:nomina',      'Nóminas',          'Gestionar períodos de nómina',           'horix'],
  ['horix:tipos',       'Tipos de concepto','Gestionar tipos de concepto',            'horix'],
  ['horix:usuarios',    'Usuarios',         'Gestionar usuarios del módulo',          'horix'],
  ['horix:configuracion','Configuración',   'Configuración del sistema',              'horix'],
  ['horix:siesa',       'Exportar Siesa',   'Exportar novedades a Siesa',             'horix'],
  ['horix:auditoria',   'Auditoría',        'Ver registro de auditoría',              'horix'],
  ['horix:backup',      'Backups',          'Gestionar backups',                      'horix'],
  ['horix:reportes',    'Reportes',         'Generar reportes',                       'horix'],
  ['horix:smtp',        'SMTP',             'Configurar correo SMTP',                 'horix'],
  ['horix:permisos',    'Permisos locales', 'Gestionar permisos locales de Horix',    'horix'],
  ['docflow:facturas',  'Facturas',         'Gestionar facturas',                     'docflow'],
  ['docflow:proveedores','Proveedores',     'Gestionar proveedores',                  'docflow'],
  ['docflow:configuracion','Configuración DocFlow','Configuración del módulo',        'docflow'],
  ['docflow:backup',    'Backup DocFlow',   'Gestionar backups de DocFlow',           'docflow'],
  ['docflow:admin',     'Admin DocFlow',    'Administración de DocFlow',              'docflow'],
  ['shell:admin',       'Admin Shell',      'Panel de administración del launcher',   'shell'],
];
const insPermiso = db.prepare('INSERT OR IGNORE INTO permisos (id, nombre, descripcion, modulo) VALUES (?, ?, ?, ?)');
for (const p of PERMISOS) insPermiso.run(...p);

// ── Seed roles_permisos ──
const PERMISOS_ADMIN = PERMISOS.map(p => p[0]);
const PERMISOS_COMPRADOR = ['horix:registros', 'horix:nomina', 'docflow:facturas'];

const seedPermisos = db.prepare('SELECT COUNT(*) as cnt FROM roles_permisos').get();
if (seedPermisos.cnt === 0) {
  const insRP = db.prepare('INSERT OR IGNORE INTO roles_permisos (rol, permiso_id) VALUES (?, ?)');
  for (const p of PERMISOS_ADMIN) insRP.run('admin', p);
  for (const p of PERMISOS_COMPRADOR) insRP.run('comprador', p);
  console.log('  Roles_permisos seeded');
}

function permisosPorRol(rol) {
  return db.prepare('SELECT permiso_id FROM roles_permisos WHERE rol = ?').all(rol).map(r => r.permiso_id);
}

const adminEmail = 'admin@horix.com';
const existing = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(adminEmail);
if (!existing) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)').run('Admin Horix', adminEmail, hash, 'admin');
  console.log('  Admin creado');
}

const seedEmail = 'comprador@horix.com';
const seedUser = db.prepare('SELECT id FROM usuarios WHERE email = ?').get(seedEmail);
if (!seedUser) {
  const hash = bcrypt.hashSync('comprador2026', 10);
  db.prepare('INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)').run('Comprador Demo', seedEmail, hash, 'comprador');
  console.log('  Usuario demo creado');
}

// ── DocFlow PostgreSQL (used by MCP tools) ──
let pgPool = null;
async function getPgPool() {
  if (!pgPool) {
    const { Pool } = require('pg');
    pgPool = new Pool({
      host:     process.env.DOCFLOW_DB_HOST     || 'localhost',
      port:     parseInt(process.env.DOCFLOW_DB_PORT || '5432'),
      database: process.env.DOCFLOW_DB_NAME     || 'docflow',
      user:     process.env.DOCFLOW_DB_USER     || 'docflow',
      password: process.env.DOCFLOW_DB_PASSWORD || 'docflow',
      max: 5,
    });
  }
  return pgPool;
}

const MODULES = {
  horix:   'http://127.0.0.1:' + (process.env.HORIX_PORT || '3000'),
};

function rpcResult(id, result) { return { jsonrpc: '2.0', result, id }; }
function rpcError(id, code, msg) { return { jsonrpc: '2.0', error: { code, message: msg }, id }; }

// ── Auth middleware ──
function verificarToken(req, res, next) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.split(' ')[1] : null;
  if (!token) return res.status(401).json({ error: 'Token requerido' });
  try {
    req.usuario = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
}

function soloAdmin(req, res, next) {
  if (!req.usuario || req.usuario.rol !== 'admin') {
    return res.status(403).json({ error: 'Se requiere rol admin' });
  }
  next();
}

// ── Auth routes ──
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Campos requeridos' });

  try {
    const user = db.prepare('SELECT * FROM usuarios WHERE email = ? AND activo = 1').get(email.toLowerCase().trim());
    if (!user) return res.status(401).json({ error: 'Credenciales inválidas' });

    const match = bcrypt.compareSync(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Credenciales inválidas' });

    const permisos = permisosPorRol(user.rol);
    const payload = { id: user.id, email: user.email, nombre: user.nombre, rol: user.rol, permisos };
    const unifiedToken = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });

    db.prepare('UPDATE usuarios SET actualizado = datetime(\'now\') WHERE id = ?').run(user.id);

    res.cookie('platform_jwt', unifiedToken, {
      httpOnly: false, secure: false, sameSite: 'lax', maxAge: 24 * 60 * 60 * 1000
    });

    res.json({
      token: unifiedToken,
      jwt: unifiedToken,
      usuario: { id: user.id, nombre: user.nombre, email: user.email, rol: user.rol, permisos }
    });
  } catch (e) {
    console.error('[LOGIN]', e.stack || e.message);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

app.get('/api/auth/me', verificarToken, (req, res) => {
  const permisos = req.usuario.permisos || permisosPorRol(req.usuario.rol);
  const user = db.prepare('SELECT id, nombre, email, rol, activo, creado FROM usuarios WHERE id = ?').get(req.usuario.id);
  res.json({ ...user, permisos });
});

// ── Admin: user CRUD ──
app.get('/api/admin/usuarios', verificarToken, soloAdmin, (req, res) => {
  const usuarios = db.prepare('SELECT id, nombre, email, rol, activo, creado, actualizado FROM usuarios ORDER BY id').all();
  res.json(usuarios);
});

app.post('/api/admin/usuarios', verificarToken, soloAdmin, (req, res) => {
  const { nombre, email, password, rol } = req.body;
  if (!nombre || !email || !password || !rol) return res.status(400).json({ error: 'Todos los campos son requeridos' });
  if (!['admin', 'comprador'].includes(rol)) return res.status(400).json({ error: 'Rol inválido' });

  try {
    const hash = bcrypt.hashSync(password, 10);
    const result = db.prepare('INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (?, ?, ?, ?)').run(nombre, email.toLowerCase().trim(), hash, rol);
    res.json({ id: result.lastInsertRowid, nombre, email: email.toLowerCase().trim(), rol, activo: 1 });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'El email ya existe' });
    throw e;
  }
});

app.put('/api/admin/usuarios/:id', verificarToken, soloAdmin, (req, res) => {
  const { nombre, email, password, rol, activo } = req.body;
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });

  const user = db.prepare('SELECT id FROM usuarios WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  const updates = [];
  const params = [];
  if (nombre !== undefined) { updates.push('nombre = ?'); params.push(nombre); }
  if (email !== undefined) { updates.push('email = ?'); params.push(email.toLowerCase().trim()); }
  if (rol !== undefined) { updates.push('rol = ?'); params.push(rol); }
  if (activo !== undefined) { updates.push('activo = ?'); params.push(activo ? 1 : 0); }
  if (password) {
    updates.push('password_hash = ?');
    params.push(bcrypt.hashSync(password, 10));
  }
  updates.push("actualizado = datetime('now')");
  params.push(id);

  try {
    db.prepare(`UPDATE usuarios SET ${updates.join(', ')} WHERE id = ?`).run(...params);
    res.json({ ok: true });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'El email ya existe' });
    throw e;
  }
});

app.delete('/api/admin/usuarios/:id', verificarToken, soloAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido' });
  if (id === req.usuario.id) return res.status(400).json({ error: 'No puedes desactivarte a ti mismo' });

  const user = db.prepare('SELECT id FROM usuarios WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  db.prepare('UPDATE usuarios SET activo = 0, actualizado = datetime(\'now\') WHERE id = ?').run(id);
  res.json({ ok: true });
});

// ── Admin: permission CRUD ──
app.get('/api/admin/permisos', verificarToken, soloAdmin, (req, res) => {
  const all = db.prepare('SELECT * FROM permisos ORDER BY modulo, id').all();
  res.json(all);
});

app.get('/api/admin/permisos/roles', verificarToken, soloAdmin, (req, res) => {
  const roles = db.prepare('SELECT DISTINCT rol FROM roles_permisos ORDER BY rol').all().map(r => r.rol);
  const result = {};
  for (const rol of roles) {
    result[rol] = permisosPorRol(rol);
  }
  res.json(result);
});

app.put('/api/admin/permisos/rol/:rol', verificarToken, soloAdmin, (req, res) => {
  const { rol } = req.params;
  const { permisos } = req.body;
  if (!Array.isArray(permisos)) return res.status(400).json({ error: 'permisos debe ser un array' });
  if (!['admin', 'comprador'].includes(rol)) return res.status(400).json({ error: 'Rol inválido' });

  const del = db.prepare('DELETE FROM roles_permisos WHERE rol = ?');
  const ins = db.prepare('INSERT INTO roles_permisos (rol, permiso_id) VALUES (?, ?)');
  const txn = db.transaction(() => {
    del.run(rol);
    for (const p of permisos) ins.run(rol, p);
  });
  txn();
  res.json({ ok: true, rol, permisos });
});

// ── MCP endpoint ──
app.post('/', async (req, res) => {
  const msg = req.body;
  if (!msg || msg.jsonrpc !== '2.0') {
    return res.status(400).json(rpcError(null, -32600, 'Invalid Request'));
  }
  const id = msg.id ?? null;

  switch (msg.method) {
    case 'initialize':
      return res.json(rpcResult(id, {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'horix-mcp-gateway', version: '3.0.0' }
      }));

    case 'tools/list':
      return res.json(rpcResult(id, {
        tools: [
          { name: 'horix_consultar', description: 'SQL SELECT sobre Horix (SQLite)', inputSchema: { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'] } },
          { name: 'horix_tablas', description: 'Lista tablas de Horix', inputSchema: { type: 'object', properties: {} } },
          { name: 'horix_registros', description: 'Busca registros de horas extra', inputSchema: { type: 'object', properties: { estado: { type: 'string' }, sede: { type: 'string' }, limite: { type: 'number' } } } },
          { name: 'horix_empleados', description: 'Busca empleados en Horix', inputSchema: { type: 'object', properties: { termino: { type: 'string' }, sede: { type: 'string' } } } },
          { name: 'horix_estadisticas', description: 'Estadísticas de Horix', inputSchema: { type: 'object', properties: {} } },
          { name: 'docflow_facturas', description: 'Busca facturas en DocFlow', inputSchema: { type: 'object', properties: { estado: { type: 'string' }, proveedor: { type: 'string' }, limite: { type: 'number' } } } },
          { name: 'docflow_proveedores', description: 'Lista proveedores en DocFlow', inputSchema: { type: 'object', properties: { termino: { type: 'string' } } } },
          { name: 'docflow_estadisticas', description: 'Estadísticas de DocFlow', inputSchema: { type: 'object', properties: {} } },
          { name: 'docflow_sql', description: 'SQL SELECT sobre DocFlow (PostgreSQL)', inputSchema: { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'] } },
        ]
      }));

    case 'tools/call': {
      const { name, arguments: args } = msg.params || {};
      if (!name) return res.json(rpcError(id, -32602, 'Missing tool name'));

      const parts = name.split('_');
      const prefix = parts[0];

      if (prefix === 'horix') {
        const toolName = parts.slice(1).join('_');
        const moduleUrl = MODULES[prefix];
        if (!moduleUrl) return res.json(rpcError(id, -32601, 'Module not found: ' + prefix));
        try {
          const rpcRes = await fetch(moduleUrl + '/mcp', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', id, method: 'tools/call', params: { name: toolName, arguments: args } })
          });
          return res.json(await rpcRes.json());
        } catch (e) {
          return res.json(rpcError(id, -32000, 'Error contacting ' + prefix + ': ' + e.message));
        }
      }

      if (prefix === 'docflow') {
        try {
          const toolName = parts.slice(1).join('_');
          let result;
          switch (toolName) {
            case 'facturas':     result = await buscarFacturas(args); break;
            case 'proveedores':  result = await listarProveedores(args); break;
            case 'estadisticas': result = await obtenerEstadisticas(); break;
            case 'sql':          result = await ejecutarSql(args); break;
            default: return res.json(rpcError(id, -32601, 'Tool not found: ' + name));
          }
          return res.json(rpcResult(id, result));
        } catch (e) {
          return res.json(rpcError(id, -32000, e.message));
        }
      }

      return res.json(rpcError(id, -32601, 'Unknown module: ' + prefix));
    }

    case 'notifications/initialized':
      return res.status(202).end();

    default:
      return res.status(400).json(rpcError(id, -32601, 'Method not found'));
  }
});

app.get('/', (req, res) => res.json({ status: 'ok', server: 'horix-mcp-gateway' }));

// ── DocFlow tool handlers ──
async function buscarFacturas({ estado, proveedor, limite }) {
  const pool = await getPgPool();
  let sql = `SELECT f.id, f.numero, f.valor_total, f.estado, p.nombre as proveedor,
             f.fecha_emision, f.fecha_vencimiento
             FROM facturas f JOIN proveedores p ON p.id = f.proveedor_id WHERE 1=1`;
  const params = [];
  if (estado) { sql += ` AND f.estado = $${params.length + 1}`; params.push(estado); }
  if (proveedor) { sql += ` AND p.nombre ILIKE $${params.length + 1}`; params.push(`%${proveedor}%`); }
  sql += ` ORDER BY f.fecha_emision DESC`;
  if (limite) { sql += ` LIMIT $${params.length + 1}`; params.push(limite); }
  const { rows } = await pool.query(sql, params);
  return rows;
}

async function listarProveedores({ termino }) {
  const pool = await getPgPool();
  let sql = `SELECT id, nombre, nit, email, telefono, activo FROM proveedores WHERE 1=1`;
  const params = [];
  if (termino) { sql += ` AND (nombre ILIKE $1 OR nit ILIKE $1)`; params.push(`%${termino}%`); }
  sql += ` ORDER BY nombre`;
  const { rows } = await pool.query(sql, params);
  return rows;
}

async function obtenerEstadisticas() {
  const pool = await getPgPool();
  const { rows: totales } = await pool.query(`
    SELECT COUNT(*)::int as total,
           COALESCE(SUM(valor_total), 0) as valor_total,
           COUNT(*) FILTER (WHERE estado = 'pendiente')::int as pendientes,
           COUNT(*) FILTER (WHERE estado = 'aprobada')::int as aprobadas,
           COUNT(*) FILTER (WHERE estado = 'pagada')::int as pagadas,
           COUNT(*) FILTER (WHERE estado = 'vencida')::int as vencidas,
           COUNT(*) FILTER (WHERE estado = 'anulada')::int as anuladas
    FROM facturas
  `);
  const { rows: porMes } = await pool.query(`
    SELECT TO_CHAR(fecha_emision, 'YYYY-MM') as mes,
           COUNT(*)::int as cantidad,
           COALESCE(SUM(valor_total), 0) as valor
    FROM facturas GROUP BY mes ORDER BY mes DESC LIMIT 12
  `);
  return { totales: totales[0], porMes };
}

async function ejecutarSql({ sql }) {
  const pool = await getPgPool();
  const cleaned = sql.trim().toUpperCase();
  if (!cleaned.startsWith('SELECT')) throw new Error('Solo queries SELECT');
  const { rows } = await pool.query(sql);
  return rows;
}

app.listen(PORT, () => console.log('MCP Gateway on port ' + PORT));
