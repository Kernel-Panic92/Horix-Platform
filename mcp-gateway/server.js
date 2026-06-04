// MCP Gateway — orquestador + SSO Auth
// horix_* → Horix MCP (SQLite), docflow_* → PostgreSQL directo
const express = require('express');
const jwt = require('jsonwebtoken');
const app = express();
app.use(express.json());

const PORT = parseInt(process.env.MCP_PORT || '3002', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';
const HORIX_URL = 'http://127.0.0.1:' + (process.env.HORIX_PORT || '3000');
const DOCFLOW_URL = 'http://127.0.0.1:' + (process.env.DOCFLOW_PORT || '3100');

// DocFlow PostgreSQL connection (used directly by the gateway)
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

// ── SSO Auth routes ──
// Unified login: authenticates against Horix, returns JWT usable by all modules

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Campos requeridos' });

  try {
    // Forward user's real IP + UA so Horix stores session correctly
    const userIP = req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.ip || '';
    const userUA = req.headers['user-agent'] || '';
    const horixRes = await fetch(HORIX_URL + '/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': userIP,
        'X-Real-IP': userIP,
        'User-Agent': userUA,
      },
      body: JSON.stringify({ email, password })
    });
    const data = await horixRes.json();
    if (!horixRes.ok) return res.status(horixRes.status).json(data);

    const user = data.usuario || data.user;
    const horixToken = data.token;

    // Set Horix session cookie for same-origin SSO
    // (no forwardeamos la cookie de Horix porque tiene domain=127.0.0.1)
    res.cookie('he_token', horixToken, {
      httpOnly: true, secure: false, sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
      path: '/'
    });

    // Check if user exists in DocFlow; auto-provision if not
    let docflowRol = null;
    try {
      const tempJwt = jwt.sign(
        { id: user.id, email: user.email, nombre: user.nombre },
        JWT_SECRET,
        { expiresIn: '5m' }
      );
      const dfRes = await fetch(DOCFLOW_URL + '/api/auth/me', {
        headers: { 'Authorization': 'Bearer ' + tempJwt }
      });
      if (dfRes.ok) {
        const dfUser = await dfRes.json();
        docflowRol = dfUser.rol || null;
      } else {
        // JIT provision user in DocFlow
        try {
          const pool = await getPgPool();
          const exists = await pool.query('SELECT id FROM usuarios WHERE email = $1', [user.email]);
          if (exists.rows.length === 0) {
            await pool.query(
              `INSERT INTO usuarios (nombre, email, password_hash, rol, activo)
               VALUES ($1, $2, '', 'comprador', true)`,
              [user.nombre, user.email]
            );
            docflowRol = 'comprador';
          }
        } catch (e) {
          console.error('[SSO] Error provisioning DocFlow user:', e.message);
        }
      }
    } catch {
      // DocFlow might be offline; continue without docflow access
    }

    // Generate unified JWT with all known roles
    const unifiedToken = jwt.sign(
      { id: user.id, email: user.email, nombre: user.nombre, rol: user.rol, docflowRol },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Set JWT as cookie so nginx can inject Authorization header into modules
    res.cookie('platform_jwt', unifiedToken, {
      httpOnly: false, secure: false, sameSite: 'lax', maxAge: 24 * 60 * 60 * 1000
    });

    res.json({
      token: data.token,          // Horix session token (for direct Horix API calls)
      jwt: unifiedToken,          // Unified JWT (for DocFlow + future modules)
      usuario: {
        id: user.id,
        nombre: user.nombre,
        email: user.email,
        rol: user.rol,
        permisos: user.permisos || [],
        docflowRol
      }
    });
  } catch (e) {
    console.error('[SSO] Login error:', e.stack || e.message);
    res.status(500).json({ error: 'Error interno: ' + e.message });
  }
});

app.get('/api/auth/me', async (req, res) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return res.status(401).json({ error: 'Token requerido' });
  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    res.json(payload);
  } catch {
    res.status(401).json({ error: 'Token inválido o expirado' });
  }
});

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
        serverInfo: { name: 'horix-mcp-gateway', version: '2.0.0' }
      }));

    case 'tools/list':
      return res.json(rpcResult(id, {
        tools: [
          // Horix tools (SQLite via Horix MCP)
          { name: 'horix_consultar', description: 'SQL SELECT sobre Horix (SQLite)', inputSchema: { type: 'object', properties: { sql: { type: 'string' } }, required: ['sql'] } },
          { name: 'horix_tablas', description: 'Lista tablas de Horix', inputSchema: { type: 'object', properties: {} } },
          { name: 'horix_registros', description: 'Busca registros de horas extra', inputSchema: { type: 'object', properties: { estado: { type: 'string' }, sede: { type: 'string' }, limite: { type: 'number' } } } },
          { name: 'horix_empleados', description: 'Busca empleados en Horix', inputSchema: { type: 'object', properties: { termino: { type: 'string' }, sede: { type: 'string' } } } },
          { name: 'horix_estadisticas', description: 'Estadísticas de Horix', inputSchema: { type: 'object', properties: {} } },
          // DocFlow tools (PostgreSQL directo)
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

      // Horix → proxy a Horix MCP
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

      // DocFlow → PostgreSQL directo
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

// ── DocFlow tool handlers (direct PostgreSQL) ──

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
