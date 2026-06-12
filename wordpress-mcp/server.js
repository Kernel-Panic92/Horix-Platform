require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');

const PORT = parseInt(process.env.PORT || '3006', 10);
const WP_URL = (process.env.WP_URL || '').replace(/\/+$/, '');
const WP_USER = process.env.WP_USER || '';
const WP_APP_PASS = process.env.WP_APP_PASS || '';

if (!WP_URL || !WP_USER || !WP_APP_PASS) {
  console.error('Faltan variables: WP_URL, WP_USER, WP_APP_PASS');
  process.exit(1);
}

const AUTH = 'Basic ' + Buffer.from(WP_USER + ':' + WP_APP_PASS).toString('base64');

const app = express();
app.use(express.json());

// Utils
function rpcResult(id, result) { return { jsonrpc: '2.0', result, id }; }
function rpcError(id, code, message) { return { jsonrpc: '2.0', error: { code, message }, id }; }

async function apiFetch(method, basePath, path, body) {
  const url = WP_URL + basePath + path;
  const opts = { method, headers: { 'Authorization': AUTH } };
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body); }
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error('API error (' + r.status + '): ' + (await r.text()).slice(0, 500));
  return r;
}

async function wpGet(path) {
  const r = await apiFetch('GET', '/wp-json/wp/v2', path);
  const total = parseInt(r.headers.get('X-WP-Total') || '0');
  const data = await r.json();
  data._total = total;
  return data;
}

async function wpPost(path, data) { const r = await apiFetch('POST', '/wp-json/wp/v2', path, data); return r.json(); }
async function wpPut(path, data) { const r = await apiFetch('PUT', '/wp-json/wp/v2', path, data); return r.json(); }
async function wpDelete(path) { const r = await apiFetch('DELETE', '/wp-json/wp/v2', path); return r.json(); }

// ── WooCommerce API helpers ──
async function wcGet(path) {
  const r = await apiFetch('GET', '/wp-json/wc/v3', path);
  const data = await r.json();
  return data;
}
async function wcPost(path, data) { const r = await apiFetch('POST', '/wp-json/wc/v3', path, data); return r.json(); }
async function wcPut(path, data) { const r = await apiFetch('PUT', '/wp-json/wc/v3', path, data); return r.json(); }
async function wcDelete(path) { const r = await apiFetch('DELETE', '/wp-json/wc/v3', path); return r.json(); }

// Tools definition
const tools = [
  {
    name: 'listar_posts',
    description: 'Lista los posts del sitio. REQUIERE CONFIRMACION antes de modificar cualquier post obtenido aqui.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['publish', 'draft', 'pending', 'private', 'trash'], description: 'Filtrar por estado' },
        search: { type: 'string', description: 'Buscar por texto' },
        per_page: { type: 'number', default: 10, description: 'Resultados por pagina (max 100)' },
        page: { type: 'number', default: 1 },
        categorias: { type: 'string', description: 'IDs de categorias separadas por coma' }
      }
    }
  },
  {
    name: 'obtener_post',
    description: 'Obtiene un post por su ID.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'ID del post' }
      },
      required: ['id']
    }
  },
  {
    name: 'crear_post',
    description: 'REQUIERE CONFIRMACION DEL USUARIO. Crea un nuevo post en WordPress.',
    inputSchema: {
      type: 'object',
      properties: {
        titulo: { type: 'string', description: 'Titulo del post' },
        contenido: { type: 'string', description: 'Contenido en HTML' },
        estado: { type: 'string', enum: ['draft', 'publish', 'pending'], default: 'draft', description: 'Estado del post' },
        categorias: { type: 'array', items: { type: 'number' }, description: 'IDs de categorias' },
        etiquetas: { type: 'array', items: { type: 'number' }, description: 'IDs de etiquetas' },
        slug: { type: 'string', description: 'URL amigable' }
      },
      required: ['titulo']
    }
  },
  {
    name: 'actualizar_post',
    description: 'REQUIERE CONFIRMACION DEL USUARIO. Actualiza un post existente en WordPress.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'ID del post a actualizar' },
        titulo: { type: 'string', description: 'Nuevo titulo' },
        contenido: { type: 'string', description: 'Nuevo contenido en HTML' },
        estado: { type: 'string', enum: ['draft', 'publish', 'pending', 'private'] },
        categorias: { type: 'array', items: { type: 'number' } },
        etiquetas: { type: 'array', items: { type: 'number' } },
        slug: { type: 'string' }
      },
      required: ['id']
    }
  },
  {
    name: 'eliminar_post',
    description: 'REQUIERE CONFIRMACION DEL USUARIO. Envia un post a la papelera (trash).',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'ID del post a eliminar' }
      },
      required: ['id']
    }
  },
  {
    name: 'listar_paginas',
    description: 'Lista las paginas del sitio.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['publish', 'draft', 'pending', 'private'], description: 'Filtrar por estado' },
        search: { type: 'string' },
        per_page: { type: 'number', default: 10 },
        page: { type: 'number', default: 1 }
      }
    }
  },
  {
    name: 'obtener_pagina',
    description: 'Obtiene una pagina por su ID.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'ID de la pagina' }
      },
      required: ['id']
    }
  },
  {
    name: 'listar_categorias',
    description: 'Lista las categorias disponibles.',
    inputSchema: {
      type: 'object',
      properties: {
        per_page: { type: 'number', default: 50 },
        hide_empty: { type: 'boolean', description: 'Ocultar categorias sin posts' }
      }
    }
  },
  {
    name: 'listar_etiquetas',
    description: 'Lista las etiquetas disponibles.',
    inputSchema: {
      type: 'object',
      properties: {
        per_page: { type: 'number', default: 50 },
        search: { type: 'string' }
      }
    }
  },
  {
    name: 'listar_medios',
    description: 'Lista los archivos multimedia.',
    inputSchema: {
      type: 'object',
      properties: {
        per_page: { type: 'number', default: 20 },
        page: { type: 'number', default: 1 },
        media_type: { type: 'string', enum: ['image', 'video', 'audio', 'application'] }
      }
    }
  },
  {
    name: 'buscar',
    description: 'Busca contenido en todo el sitio (posts, paginas, medios).',
    inputSchema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Texto a buscar' },
        per_page: { type: 'number', default: 10 },
        type: { type: 'string', enum: ['post', 'page', 'attachment'], description: 'Tipo de contenido' }
      },
      required: ['search']
    }
  },
  {
    name: 'estadisticas',
    description: 'Obtiene estadisticas generales del sitio WordPress.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  // ── WooCommerce ──
  {
    name: 'listar_productos',
    description: 'Lista productos de WooCommerce.',
    inputSchema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Buscar por texto' },
        per_page: { type: 'number', default: 10 },
        page: { type: 'number', default: 1 },
        categoria: { type: 'number', description: 'ID de categoria de producto' },
        status: { type: 'string', enum: ['publish', 'draft', 'pending', 'private'], description: 'Estado del producto' }
      }
    }
  },
  {
    name: 'obtener_producto',
    description: 'Obtiene un producto de WooCommerce por su ID.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number', description: 'ID del producto' } },
      required: ['id']
    }
  },
  {
    name: 'crear_producto',
    description: 'REQUIERE CONFIRMACION DEL USUARIO. Crea un nuevo producto en WooCommerce.',
    inputSchema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre del producto' },
        descripcion: { type: 'string', description: 'Descripcion en HTML' },
        descripcion_corta: { type: 'string', description: 'Descripcion breve' },
        precio: { type: 'string', description: 'Precio regular (ej: 29.99)' },
        estado: { type: 'string', enum: ['publish', 'draft', 'pending'], default: 'draft' },
        categoria: { type: 'number', description: 'ID de categoria' },
        stock: { type: 'number', description: 'Cantidad en stock' },
        sku: { type: 'string', description: 'Codigo SKU unico' }
      },
      required: ['nombre', 'precio']
    }
  },
  {
    name: 'actualizar_producto',
    description: 'REQUIERE CONFIRMACION DEL USUARIO. Actualiza un producto existente en WooCommerce.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'number', description: 'ID del producto' },
        nombre: { type: 'string' },
        descripcion: { type: 'string' },
        descripcion_corta: { type: 'string' },
        precio: { type: 'string' },
        estado: { type: 'string', enum: ['publish', 'draft', 'pending', 'private'] },
        categoria: { type: 'number' },
        stock: { type: 'number' },
        sku: { type: 'string' }
      },
      required: ['id']
    }
  },
  {
    name: 'eliminar_producto',
    description: 'REQUIERE CONFIRMACION DEL USUARIO. Elimina un producto de WooCommerce.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number', description: 'ID del producto' } },
      required: ['id']
    }
  },
  {
    name: 'listar_pedidos',
    description: 'Lista pedidos de WooCommerce.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['pending', 'processing', 'on-hold', 'completed', 'cancelled', 'refunded', 'failed', 'trash'], description: 'Filtrar por estado' },
        per_page: { type: 'number', default: 10 },
        page: { type: 'number', default: 1 },
        search: { type: 'string', description: 'Buscar por cliente o ID' }
      }
    }
  },
  {
    name: 'obtener_pedido',
    description: 'Obtiene un pedido de WooCommerce por su ID.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number', description: 'ID del pedido' } },
      required: ['id']
    }
  },
  {
    name: 'listar_clientes',
    description: 'Lista clientes de WooCommerce.',
    inputSchema: {
      type: 'object',
      properties: {
        search: { type: 'string' },
        per_page: { type: 'number', default: 10 },
        page: { type: 'number', default: 1 },
        rol: { type: 'string', default: 'customer', description: 'Rol de usuario' }
      }
    }
  },
  {
    name: 'obtener_cliente',
    description: 'Obtiene un cliente de WooCommerce por su ID.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'number', description: 'ID del cliente' } },
      required: ['id']
    }
  },
  {
    name: 'estadisticas_woocommerce',
    description: 'Obtiene estadisticas generales de WooCommerce.',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  }
];

// Tool handlers
async function handleToolCall(name, args) {
  switch (name) {
    // ── Posts ──
    case 'listar_posts': {
      const qs = new URLSearchParams();
      if (args.status) qs.set('status', args.status);
      if (args.search) qs.set('search', args.search);
      qs.set('per_page', String(args.per_page || 10));
      qs.set('page', String(args.page || 1));
      if (args.categorias) qs.set('categories', args.categorias);
      const data = await wpGet('/posts?' + qs.toString());
      return data.map(p => ({ id: p.id, titulo: p.title.rendered, estado: p.status, fecha: p.date, slug: p.slug, link: p.link }));
    }

    case 'obtener_post': {
      const p = await wpGet('/posts/' + args.id);
      return { id: p.id, titulo: p.title.rendered, contenido: p.content.rendered, estado: p.status, fecha: p.date, slug: p.slug, link: p.link, categorias: p.categories, etiquetas: p.tags };
    }

    case 'crear_post': {
      const body = { title: args.titulo, content: args.contenido || '', status: args.estado || 'draft' };
      if (args.categorias) body.categories = args.categorias;
      if (args.etiquetas) body.tags = args.etiquetas;
      if (args.slug) body.slug = args.slug;
      const p = await wpPost('/posts', body);
      return { id: p.id, titulo: p.title.rendered, estado: p.status, link: p.link, edit_link: WP_URL + '/wp-admin/post.php?post=' + p.id + '&action=edit' };
    }

    case 'actualizar_post': {
      const body = {};
      if (args.titulo) body.title = args.titulo;
      if (args.contenido !== undefined) body.content = args.contenido;
      if (args.estado) body.status = args.estado;
      if (args.categorias) body.categories = args.categorias;
      if (args.etiquetas) body.tags = args.etiquetas;
      if (args.slug) body.slug = args.slug;
      const p = await wpPut('/posts/' + args.id, body);
      return { id: p.id, titulo: p.title.rendered, estado: p.status, link: p.link };
    }

    case 'eliminar_post': {
      const result = await wpDelete('/posts/' + args.id + '?force=false');
      return { deleted: result.deleted, previous: result.previous ? { id: result.previous.id, titulo: result.previous.title?.rendered } : null };
    }

    // ── Pages ──
    case 'listar_paginas': {
      const qs = new URLSearchParams();
      if (args.status) qs.set('status', args.status);
      if (args.search) qs.set('search', args.search);
      qs.set('per_page', String(args.per_page || 10));
      qs.set('page', String(args.page || 1));
      const data = await wpGet('/pages?' + qs.toString());
      return data.map(p => ({ id: p.id, titulo: p.title.rendered, estado: p.status, fecha: p.date, slug: p.slug }));
    }

    case 'obtener_pagina': {
      const p = await wpGet('/pages/' + args.id);
      return { id: p.id, titulo: p.title.rendered, contenido: p.content.rendered, estado: p.status, fecha: p.date, slug: p.slug };
    }

    // ── Taxonomies ──
    case 'listar_categorias': {
      const qs = new URLSearchParams();
      qs.set('per_page', String(args.per_page || 50));
      if (args.hide_empty) qs.set('hide_empty', 'true');
      const data = await wpGet('/categories?' + qs.toString());
      return data.map(c => ({ id: c.id, nombre: c.name, slug: c.slug, count: c.count }));
    }

    case 'listar_etiquetas': {
      const qs = new URLSearchParams();
      qs.set('per_page', String(args.per_page || 50));
      if (args.search) qs.set('search', args.search);
      const data = await wpGet('/tags?' + qs.toString());
      return data.map(t => ({ id: t.id, nombre: t.name, slug: t.slug, count: t.count }));
    }

    // ── Media ──
    case 'listar_medios': {
      const qs = new URLSearchParams();
      qs.set('per_page', String(args.per_page || 20));
      qs.set('page', String(args.page || 1));
      if (args.media_type) qs.set('media_type', args.media_type);
      const data = await wpGet('/media?' + qs.toString());
      return data.map(m => ({ id: m.id, titulo: m.title.rendered, url: m.source_url, tipo: m.media_type, mime: m.mime_type, fecha: m.date }));
    }

    // ── Search ──
    case 'buscar': {
      const qs = new URLSearchParams();
      qs.set('search', args.search);
      qs.set('per_page', String(args.per_page || 10));
      if (args.type) qs.set('type', args.type);
      const data = await wpGet('/search?' + qs.toString());
      return data.map(r => ({ id: r.id, titulo: r.title, tipo: r.type, url: r.url }));
    }

    // ── Stats ──
    case 'estadisticas': {
      const [posts, pages, media, cats, tags] = await Promise.all([
        wpGet('/posts?per_page=1&_fields=id'),
        wpGet('/pages?per_page=1&_fields=id'),
        wpGet('/media?per_page=1&_fields=id'),
        wpGet('/categories?per_page=1&_fields=id&hide_empty=true'),
        wpGet('/tags?per_page=1&_fields=id&hide_empty=true')
      ]);
      return {
        posts: posts._total,
        paginas: pages._total,
        medios: media._total,
        categorias: cats._total,
        etiquetas: tags._total,
        sitio: WP_URL
      };
    }

    // ── WooCommerce ──
    case 'listar_productos': {
      const qs = new URLSearchParams();
      if (args.search) qs.set('search', args.search);
      qs.set('per_page', String(args.per_page || 10));
      qs.set('page', String(args.page || 1));
      if (args.categoria) qs.set('category', String(args.categoria));
      if (args.status) qs.set('status', args.status);
      const data = await wcGet('/products?' + qs.toString());
      return data.map(p => ({ id: p.id, nombre: p.name, precio: p.price, sku: p.sku, stock: p.stock_quantity, estado: p.status, tipo: p.type, link: p.permalink }));
    }

    case 'obtener_producto': {
      const p = await wcGet('/products/' + args.id);
      return { id: p.id, nombre: p.name, descripcion: p.description, descripcion_corta: p.short_description, precio: p.price, sku: p.sku, stock: p.stock_quantity, estado: p.status, categorias: p.categories?.map(c => ({ id: c.id, nombre: c.name })), imagen: p.images?.[0]?.src, link: p.permalink };
    }

    case 'crear_producto': {
      const body = { name: args.nombre, regular_price: String(args.precio), description: args.descripcion || '', short_description: args.descripcion_corta || '', status: args.estado || 'draft' };
      if (args.categoria) body.categories = [{ id: args.categoria }];
      if (args.sku) body.sku = args.sku;
      if (args.stock !== undefined) { body.manage_stock = true; body.stock_quantity = args.stock; }
      const p = await wcPost('/products', body);
      return { id: p.id, nombre: p.name, precio: p.price, sku: p.sku, link: p.permalink };
    }

    case 'actualizar_producto': {
      const body = {};
      if (args.nombre) body.name = args.nombre;
      if (args.precio) body.regular_price = String(args.precio);
      if (args.descripcion !== undefined) body.description = args.descripcion;
      if (args.descripcion_corta !== undefined) body.short_description = args.descripcion_corta;
      if (args.estado) body.status = args.estado;
      if (args.categoria) body.categories = [{ id: args.categoria }];
      if (args.sku) body.sku = args.sku;
      if (args.stock !== undefined) { body.manage_stock = true; body.stock_quantity = args.stock; }
      const p = await wcPut('/products/' + args.id, body);
      return { id: p.id, nombre: p.name, precio: p.price, sku: p.sku, link: p.permalink };
    }

    case 'eliminar_producto': {
      const r = await wcDelete('/products/' + args.id + '?force=true');
      return { deleted: true, id: r.id };
    }

    case 'listar_pedidos': {
      const qs = new URLSearchParams();
      if (args.status) qs.set('status', args.status);
      qs.set('per_page', String(args.per_page || 10));
      qs.set('page', String(args.page || 1));
      if (args.search) qs.set('search', args.search);
      const data = await wcGet('/orders?' + qs.toString());
      return data.map(o => ({ id: o.id, numero: o.number, cliente: o.billing?.first_name + ' ' + o.billing?.last_name, email: o.billing?.email, total: o.total, estado: o.status, fecha: o.date_created, articulos: o.line_items?.length }));
    }

    case 'obtener_pedido': {
      const o = await wcGet('/orders/' + args.id);
      return {
        id: o.id, numero: o.number, estado: o.status, total: o.total, subtotal: o.subtotal, impuestos: o.total_tax,
        fecha: o.date_created, nota: o.customer_note,
        cliente: { nombre: o.billing?.first_name + ' ' + o.billing?.last_name, email: o.billing?.email, telefono: o.billing?.phone, direccion: o.billing?.address_1 + ', ' + o.billing?.city + ', ' + o.billing?.state },
        envio: { metodo: o.shipping_lines?.[0]?.method_title, total: o.shipping_lines?.[0]?.total, direccion: o.shipping?.address_1 + ', ' + o.shipping?.city + ', ' + o.shipping?.state },
        articulos: o.line_items?.map(i => ({ producto: i.name, cantidad: i.quantity, precio: i.price, total: i.total, sku: i.sku })),
        link: o.permalink
      };
    }

    case 'listar_clientes': {
      const qs = new URLSearchParams();
      if (args.search) qs.set('search', args.search);
      qs.set('per_page', String(args.per_page || 10));
      qs.set('page', String(args.page || 1));
      if (args.rol) qs.set('role', args.rol);
      const data = await wcGet('/customers?' + qs.toString());
      return data.map(c => ({ id: c.id, nombre: c.first_name + ' ' + c.last_name, email: c.email, rol: c.role, pedidos: c.orders_count, total_gastado: c.total_spent, fecha_registro: c.date_created }));
    }

    case 'obtener_cliente': {
      const c = await wcGet('/customers/' + args.id);
      return { id: c.id, nombre: c.first_name + ' ' + c.last_name, email: c.email, telefono: c.phone, rol: c.role, pedidos: c.orders_count, total_gastado: c.total_spent, direccion: c.billing?.address_1 + ', ' + c.billing?.city + ', ' + c.billing?.state, fecha_registro: c.date_created };
    }

    case 'estadisticas_woocommerce': {
      const [products, orders, customers] = await Promise.all([
        wcGet('/reports/products/totals'),
        wcGet('/reports/orders/totals'),
        wcGet('/customers?per_page=1')
      ]);
      const orderStats = {};
      if (Array.isArray(orders)) for (const o of orders) orderStats[o.slug] = o.total;
      return {
        productos: Array.isArray(products) ? products.reduce((a, c) => a + c.total, 0) : 0,
        pedidos: orderStats,
        clientes: Array.isArray(customers) ? (customers._total || customers.length) : 0
      };
    }

    default:
      throw new Error('Tool not found: ' + name);
  }
}

// ── MCP JSON-RPC dispatcher ──
app.post('/mcp', async (req, res) => {
  const msg = req.body;
  if (!msg || msg.jsonrpc !== '2.0') return res.json(rpcError(null, -32600, 'Invalid Request'));

  const id = msg.id ?? null;

  try {
    if (msg.method === 'initialize') {
      return res.json(rpcResult(id, {
        protocolVersion: '2025-03-26',
        serverInfo: { name: 'wordpress-mcp', version: '1.0.0' },
        capabilities: { tools: {} }
      }));
    }

    if (msg.method === 'ping') {
      return res.json(rpcResult(id, {}));
    }

    if (msg.method === 'tools/list') {
      return res.json(rpcResult(id, { tools }));
    }

    if (msg.method === 'tools/call') {
      const { name, arguments: args } = msg.params || {};
      if (!name) return res.json(rpcError(id, -32602, 'Missing tool name'));
      const result = await handleToolCall(name, args || {});
      return res.json(rpcResult(id, { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] }));
    }

    if (msg.method?.startsWith('notifications/')) return res.json(rpcResult(null, null));

    return res.json(rpcError(id, -32601, 'Method not found: ' + msg.method));
  } catch (e) {
    console.error('[WordPress MCP]', e.message);
    return res.json(rpcError(id, -32000, e.message));
  }
});

app.get('/health', (req, res) => res.json({ ok: true, wp: WP_URL }));

app.listen(PORT, () => {
  console.log('WordPress MCP on port ' + PORT);
  console.log('Conectando a: ' + WP_URL);
});
