# horix-erp

Modular ERP with independent micro-frontends.

| Module | Repo | Tech |
|--------|------|------|
| Launcher | [horix-launcher](https://github.com/Kernel-Panic92/horix-launcher) | Express, SQLite |
| Horix API | [horix-api](https://github.com/Kernel-Panic92/horix-api) | Express, SQLite |
| DocFlow API | [docflow-api](https://github.com/Kernel-Panic92/docflow-api) | Express, PostgreSQL |

## Quick Start

```bash
git clone --recurse-submodules https://github.com/Kernel-Panic92/horix-erp.git
cd horix-erp
sudo bash install.sh test
```

## Update

```bash
git pull --recurse-submodules
git submodule update --remote
# Then re-copy files to /opt/horix-platform and restart PM2
```

## MCP Gateway

Each module exposes an MCP server at `<module-url>/mcp`. The launcher acts as a unified gateway at:

| URL | Puerto | Uso |
|-----|--------|-----|
| `https://dominio:9443/mcp` | 9443 | Directo al gateway (recomendado) |
| `https://dominio/mcp-gateway/mcp` | 443 | Alternativa via nginx (ver abajo) |

### Windows TLS workaround (FortiGate / firewalls restrictivos)

Algunos firewalls corporativos (FortiGate con SSL inspection) rompen el handshake TLS en puertos no estándar como 9443 con Windows (`SEC_E_ILLEGAL_MESSAGE`). Solución: agregar una ruta en el nginx del puerto 443 que proxy al gateway:

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

Luego usar `https://dominio/mcp-gateway/mcp` en Claude Desktop (sin OAuth fields).
