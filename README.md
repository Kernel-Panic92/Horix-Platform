# Horix Platform

Modular ERP platform with independent micro-frontends. Each module has its own auth, frontend, and MCP server. The **launcher** orchestrates them all — CRUD, health checks, nginx config generation, and MCP gateway.

## Architecture

```
                    ┌──────────────┐
                    │  FortiGate /  │
                    │  Load Balancer│
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │  Horix   │ │ Launcher │ │ DocFlow  │
        │  :443    │ │ :9443    │ │ :9442    │
        └──────────┘ └──────────┘ └──────────┘
```

| Module | Tech | MCP Tools |
|--------|------|-----------|
| **Launcher** | Express, SQLite | Gateway, health, config, nginx gen |
| **Horix** | Express, SQLite | 16 tools (registros, empleados, reportes) |
| **DocFlow** | Express, PostgreSQL | 13 tools (facturas, dashboard, eventos) |

## Quick Start

```bash
git clone https://github.com/Kernel-Panic92/horix-erp.git
cd horix-erp
sudo bash install.sh prod
# O para pruebas locales:
sudo bash install.sh test
```

## Update

```bash
sudo git -C /opt/horix-platform pull
sudo npm install --prefix /opt/horix-platform/launcher
sudo pm2 restart horix-launcher
```

## MCP (Model Context Protocol)

The launcher provides a unified MCP gateway compatible with Claude Desktop and Claude Web. Tools are prefixed by module (`horix_*`, `docflow_*`).

### URLs

| URL | Puerto | Uso |
|-----|--------|-----|
| `https://dominio:9443/mcp` | 9443 | Directo al gateway (recomendado) |
| `https://dominio/mcp-gateway/mcp` | 443 | Alternativa vía nginx (firewalls restrictivos) |

### OAuth

Deshabilitado por defecto. Para habilitarlo:

```bash
sudo sqlite3 /opt/horix-platform/launcher/launcher.db \
  "UPDATE config SET value='true' WHERE key='mcp_oauth_enabled'"
sudo pm2 restart horix-launcher
```

### Windows TLS workaround (FortiGate)

Algunos firewalls corporativos rompen el handshake TLS en puertos no estándar con Windows. Solución: agregar en el nginx del puerto 443:

```nginx
location /mcp-gateway/ {
    proxy_pass http://127.0.0.1:3002/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;
    proxy_read_timeout 300s;
}
```

Luego usar `https://dominio/mcp-gateway/mcp` sin OAuth fields.

## Features

- **Auth**: login JWT por módulo (independiente), roles admin/operador
- **Nginx Generator**: Admin → Nginx → genera config con prefixes de módulos
- **Password Recovery**: SMTP configurable desde Admin, reset links con 1h de expiración
- **SMTP Config**: Admin → SMTP, con botón de prueba
- **MCP Gateway**: sesiones por módulo, auto-retry, health checks
- **Responsive**: mobile-friendly (max-width 640px)

## Config

`/opt/horix-platform/config.env`:

```env
MODE=prod
DOMAIN=horix.app
LAUNCHER_PORT=3002
MCP_PORT=9443
INSTALL_DIR=/opt/horix-platform
```

## Nginx

Editar los módulos desde Admin → Módulos, definir `URL` y `Proxy Prefix`. Luego Admin → Nginx → "Generar y recargar".

### Ports

| Service | Internal | HTTPS |
|---------|----------|-------|
| Horix API | 3000 | 443 |
| Launcher | 3002 | 9443 |
| DocFlow | 3005 | 9442 |
