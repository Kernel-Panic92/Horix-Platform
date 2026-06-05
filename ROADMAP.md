# 🗺️ Horix ERP — Roadmap

Modular ERP with centralized SSO, MCP Gateway, and path-based micro-frontends.

## Architecture

```
                     ┌─────────────────────────────────────┐
                     │         Nginx (8443/443)            │
                     │  path-based routing, SSL            │
                     └──────┬──────┬──────┬──────┬─────────┘
                            │      │      │      │
               ┌────────────┘      │      │      └────────────┐
               ▼                   ▼      ▼                   ▼
       ┌──────────────┐    ┌──────────┐    ┌──────────┐  ┌────────┐
       │   Shell SPA  │    │ MCP GW   │    │  Horix   │  │ DocFlow│
       │  /           │    │ /api     │    │ /horix   │  │/docflow│
       │  Login+Admin │    │ /mcp     │    │          │  │        │
       └──────────────┘    │ /:mod/api│    │ Employees│  │Invoices │
                           └────┬─────┘    │ Payroll  │  │Vendors  │
                                │          └──────────┘  └────────┘
                     ┌──────────┴──────────┐
                     ▼                     ▼
              ┌──────────────┐    ┌────────────────┐
              │  SQLite DB   │    │  PostgreSQL    │
              │  (platform)  │    │  (docflow)     │
              └──────────────┘    └────────────────┘
```

**MCP Gateway** (`/api/`) — centralized auth, JWT, user/permission management, and API proxy.
**Horix** (`/horix/`) — employee hours, payroll, reports.
**DocFlow** (`/docflow/`) — invoice management, vendors, approvals.
**Shell** (`/`) — login, module launcher, admin panels.

## Current State

- Centralized SSO with JWT (24h expiry, `platform_jwt` cookie)
- MCP Gateway proxies `/horix/api/` and `/docflow/api/` with `X-User-*` headers
- Centralized RBAC: 19 permissions across 2 roles, checked per-module
- Path-based routing on single port (8443 test / 443 prod)

## Roadmap

### Week 1 — Consolidate shared code into MCP Gateway

Move backup orchestration, audit logging, and system config from individual modules into the MCP Gateway.

```
mcp-gateway/
├── server.js          ← Auth, proxy, routes
├── routes/
│   ├── backup.js      ← Central backup orchestrator
│   ├── audit.js       ← Centralized audit log
│   └── config.js      ← Global system config
```

Modules become thin: only business logic, no admin infrastructure.

### Week 2 — Clean up modules

Remove duplicate admin code from Horix and DocFlow (`usuarios.js`, `backup.js`, `auditoria.js`). Each module keeps only its domain logic.

```
horix/src/routes/         docflow/src/routes/
├── empleados.js          ├── facturas.js
├── registros.js          ├── proveedores.js
├── nomina.js             └── (no admin code)
├── centros.js
├── tipos.js
└── (no admin code)
```

### Week 3 — Database unification

Migrate Horix from SQLite to PostgreSQL, sharing the same database instance as DocFlow. Remove SQLite dependency.

### Installer

`install.sh` handles everything: copies files from repo, creates configs, runs migrations, starts PM2 processes. One command for any Linux server.

## Future

Adding a new module (e.g., CRM):
1. Add permissions to MCP Gateway seed
2. Create the module (API + DB tables)
3. Add `location /crm/api/` and `location /crm/` to nginx
4. The module reads `X-User-*` headers — zero auth code
