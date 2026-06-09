# Horix ERP — Roadmap

Modular ERP with independent micro-frontends, MCP orchestration, and git sub-modules.

## Architecture

```
                     ┌─────────────────────────────────────┐
                     │         Nginx (8443/443)            │
                     │  path-based routing, SSL            │
                     └──────┬──────┬──────┬────────────────┘
                            │      │      │
               ┌────────────┘      │      └────────────┐
               ▼                   ▼                   ▼
       ┌──────────────┐   ┌──────────┐       ┌──────────────┐
       │  horix-erp   │   │  Horix   │       │   DocFlow    │
       │  Launcher    │   │  /horix/ │       │  /docflow/   │
       │  / (Shell)   │   │  API+SPA │       │  API+SPA     │
       │  /api (Auth) │   │  Port 3000│      │  Port 3100   │
       │  /mcp (MCP)  │   │  SQLite  │       │  PostgreSQL  │
       └──────────────┘   └──────────┘       └──────────────┘
             Git:              Git:                 Git:
       Kernel-Panic92/    Kernel-Panic92/     Kernel-Panic92/
       horix-launcher     horix-api           docflow-api
```

**Launcher** — Shell SPA, auth, MCP Gateway (routes to modules by prefix).
**Horix** — employee hours, payroll, reports.
**DocFlow** — invoice management, vendors, approvals.

Each module is a standalone git submodule with its own DB, auth, and API.
MCP is aggregated by the Launcher via HTTP calls to each module's `/mcp`.

## Current State

- 3 independent repos managed as git submodules
- Path-based routing on single port (8443 test / 443 prod)
- No shared JWT or SSO between modules
- MCP aggregated by Launcher (prefix-based routing)

## Roadmap

### Phase 1 — Stability
- [x] Split into submodules (launcher, horix-api, docflow-api)
- [x] Each module handles its own auth independently
- [x] Nginx routes each module directly (no proxy)
- [x] Launcher aggregates MCP by prefix

### Phase 2 — Improvements
- [ ] Service tokens for module-to-module communication
- [ ] Unified audit log via Launcher API (optional POST)
- [ ] Backup scripts for each module

### Future
- Adding a new module (e.g., CRM):
  1. Create new repo with its own `/mcp`
  2. Add as submodule: `git submodule add <repo> modules/crm`
  3. Add `location /crm/` to nginx
  4. Add to `launcher/modules.json`
