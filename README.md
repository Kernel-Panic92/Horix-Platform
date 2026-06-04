# horix-platform

ERP modular multi-módulo con autenticación centralizada (SSO), launcher unificado y gateway MCP.

## Arquitectura

```
                    ┌──────────────────────────┐
                    │         Nginx            │
                    │  SSL + routing + SSO     │
                    │  (cookie→Authorization)  │
                    └──────┬──────────┬────────┘
                           │          │
              ┌────────────┼──────────┼──────────┐
              ▼            ▼          ▼          ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐
        │  Shell   │ │  Horix   │ │ DocFlow  │ │ MCP Gateway  │
        │(Vanilla) │ │ (SQLite) │ │(Postgres)│ │ Auth + MCP   │
        └──────────┘ └──────────┘ └──────────┘ └──────────────┘
              │            │            │            │
              └────────────┴────────────┴────────────┘
                           │ SSO
                           ▼
                   ┌──────────────┐
                   │  Login unif. │ ← /api/auth/login
                   └──────────────┘
```

| Componente | Stack | Ruta (test) | Ruta (prod) |
|-----------|-------|-------------|-------------|
| **Shell** | HTML + vanilla JS | `/` (`8443`) | `/` (`443`) |
| **Horix** | Express + SQLite | `/horix/` → `:3000` | `/horix/` → `:3000` |
| **DocFlow** | Express + PostgreSQL | `/docflow/` → `:3100` | `/docflow/` → `:3100` |
| **MCP Gateway** | Express + pg + JWT | `/mcp` + `/api/` → `:3002` | `/mcp` + `/api/` → `:3002` |
| **Nginx** | reverse proxy + SSL | inyecta `Authorization` desde cookie | — |

## Requisitos

- Ubuntu 22.04+ (o cualquier Linux con systemd)
- Node.js >= 18, npm, git, nginx, pm2
- PostgreSQL 14+ (solo para DocFlow)
- OpenSSL (para certs autofirmados en test)

### Dependencias opcionales

- `envsubst` (gettext-base) — para generar config.js
- `certbot` — para Let's Encrypt en producción

## Instalación

El instalador `install.sh` automatiza todo: dependencias, SSL, submódulos, configuración, migraciones, nginx y PM2.

### 1. Clonar con submódulos

```bash
git clone --recursive https://github.com/Kernel-Panic92/horix-platform.git
cd horix-platform
```

Si ya clonaste sin `--recursive`:
```bash
git submodule update --init --recursive
```

### 2. Ejecutar instalador

Dependiendo del entorno, corres:

```bash
# ── Modo prueba (localhost) ──
sudo bash install.sh test
```

```bash
# ── Modo producción (dominio público) ──
sudo bash install.sh prod
# Te pedirá el dominio (ej: miapp.midominio.com)
```

**Qué hace `install.sh` por ti:**

| Paso | Descripción |
|------|-------------|
| Config | Crea `config.env` en `/opt/horix-platform` con puertos y JWT_SECRET |
| Dependencias | Instala node, npm, git, nginx, pm2, openssl, envsubst si faltan |
| SSL | Genera certs autofirmados (test) o corre certbot (prod) |
| Submódulos | Inicializa `modules/horix` y `modules/docflow` |
| Config.js | Genera `shell/config.js` desde `config-template.js` con las URLs correctas |
| .env por módulo | Crea `.env` para Horix y DocFlow con puertos, DB, JWT compartido |
| npm install | Instala dependencias de cada módulo y del mcp-gateway |
| Migraciones | Corre migraciones de DB de ambos módulos |
| Nginx | Copia la config según el modo (test o prod) y recarga |
| PM2 | Arranca horix, docflow y mcp-gateway como procesos守护 |

### 3. Pre-requisitos según el modo

**Modo test** — agregar hosts antes de ejecutar:

```bash
# Linux/Mac
echo "127.0.0.1 shell.dev.local horix.dev.local docflow.dev.local" | sudo tee -a /etc/hosts

# Windows
# Agregar a C:\Windows\System32\drivers\etc\hosts:
#   127.0.0.1 shell.dev.local horix.dev.local docflow.dev.local
```

**Modo prod** — asegurar que el dominio apunte al servidor (DNS) y puertos 80/443 abiertos.

### 4. Verificar

```bash
# Ver procesos activos
pm2 status

# Probar endpoints
curl -k https://shell.dev.local:8443
curl -k https://horix.dev.local:8444/api/health
curl -k https://docflow.dev.local:8445/api/health
curl -k https://shell.dev.local:8443/mcp
```

## Autenticación SSO

El login es unificado: el usuario se autentica contra **Horix** (módulo primario) y el MCP Gateway genera un JWT firmado con el `JWT_SECRET` compartido.

### Flujo

```
Usuario → Shell → POST /api/auth/login → nginx → MCP Gateway
                                                    │
                                          ┌─────────┴──────────┐
                                          ▼                    ▼
                                      Horix (auth)    DocFlow (JIT provision)
                                          │                    │
                                          └─────────┬──────────┘
                                                    ▼
                                          MCP Gateway genera JWT
                                          + Set-Cookie (he_token + platform_jwt)
                                                    │
                                                    ▼
                                          Respuesta al navegador
```

### Cómo funciona el SSO entre módulos

1. **Login**: Shell → `POST /api/auth/login` → MCP Gateway autentica contra Horix
2. **Cookies**: El gateway devuelve `Set-Cookie` con:
   - `he_token` — sesión de Horix (forwardeada)
   - `platform_jwt` — JWT unificado (para DocFlow y futuros módulos)
3. **Nginx**: Al servir `/horix/` o `/docflow/`, inyecta la cookie `platform_jwt` como header `Authorization: Bearer ...`
4. **Horix**: Usa su cookie de sesión (`he_token`) — funciona sin cambios
5. **DocFlow**: Recibe el JWT vía header `Authorization` — lo verifica con `JWT_SECRET`
6. **JIT provisioning**: Si el usuario no existe en DocFlow, se crea automáticamente con rol `comprador`

### Credenciales por defecto

| Login | Email | Contraseña | Módulos |
|-------|-------|-----------|---------|
| **Admin** | `admin@horix.com` | `admin123` | Horix + DocFlow |

> Todos los módulos se acceden desde el **mismo origen** (mismo dominio/puerto). No hay subdominios separados. Las cookies se comparten naturalmente entre rutas `/`, `/horix/`, `/docflow/`.

## Acceso

### Modo test

| Servicio | URL (mismo origen) |
|----------|-------------------|
| Shell | https://shell.dev.local:8443 |
| Horix | https://shell.dev.local:8443/horix/ |
| DocFlow | https://shell.dev.local:8443/docflow/ |
| Auth API | https://shell.dev.local:8443/api/auth/login |
| MCP Gateway | https://shell.dev.local:8443/mcp |

### Modo prod (ejemplo con `miapp.midominio.com`)

| Servicio | URL |
|----------|-----|
| Shell | https://miapp.midominio.com |
| Horix | https://miapp.midominio.com/horix/ |
| DocFlow | https://miapp.midominio.com/docflow/ |
| Auth API | https://miapp.midominio.com/api/auth/login |
| MCP Gateway | https://miapp.midominio.com/mcp |

## MCP Gateway (para Claude/LLMs)

El gateway unifica las herramientas de todos los módulos bajo un solo endpoint `/mcp`.

### Tools disponibles

| Tool | Módulo | Descripción |
|------|--------|-------------|
| `horix_consultar` | Horix | SQL SELECT sobre SQLite |
| `horix_tablas` | Horix | Lista tablas |
| `horix_registros` | Horix | Busca horas extra |
| `horix_empleados` | Horix | Busca empleados |
| `horix_estadisticas` | Horix | Dashboard de Horix |
| `docflow_facturas` | DocFlow | Busca facturas |
| `docflow_proveedores` | DocFlow | Lista proveedores |
| `docflow_estadisticas` | DocFlow | Dashboard de DocFlow |
| `docflow_sql` | DocFlow | SQL SELECT sobre PostgreSQL |

### Uso con Claude Desktop

Añadir en `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "horix-platform": {
      "url": "http://localhost:3002"
    }
  }
}
```

Para producción:
```json
{
  "mcpServers": {
    "horix-platform": {
      "url": "https://miapp.midominio.com/mcp"
    }
  }
}
```

## Añadir un nuevo módulo (ej: CRM)

1. Agregar submodule:
```bash
git submodule add https://github.com/Kernel-Panic92/crm.git modules/crm
```

2. Crear `nginx/crm.conf` con el routing correspondiente.

3. Actualizar `shell/app.js` con la nueva card y su `checkAccess`.

4. Agregar tools al MCP Gateway (`mcp-gateway/server.js`).

5. Reinstalar nginx:
```bash
sudo cp nginx/crm.conf /etc/nginx/sites-available/
sudo systemctl reload nginx
```

## Configuración

Copiar `config.env.example` a `config.env` y ajustar:

```bash
cp config.env.example config.env
# Editar config.env con los valores deseados
```

Luego ejecutar el instalador que lo leerá automáticamente.

### Variables principales

| Variable | Descripción | Default (test) |
|----------|-------------|----------------|
| `MODE` | `test` o `prod` | `test` |
| `JWT_SECRET` | Secreto compartido para SSO | auto-generado |
| `HORIX_INTERNAL_PORT` | Puerto interno de Horix | `3000` |
| `DOCFLOW_INTERNAL_PORT` | Puerto interno de DocFlow | `3100` |
| `MCP_GATEWAY_PORT` | Puerto del MCP Gateway | `3002` |

## Estructura del repositorio

```
horix-platform/
├── shell/              # Login + launcher SPA
│   ├── index.html
│   ├── app.js
│   └── config-template.js   # → config.js (generado)
├── nginx/
│   ├── platform-test.conf   # Config para modo test
│   └── platform-prod.conf   # Config para modo prod
├── mcp-gateway/        # Gateway MCP unificado
│   ├── server.js
│   └── package.json
├── modules/            # Submódulos git
│   ├── horix/          # https://github.com/Kernel-Panic92/Horix.git
│   └── docflow/        # https://github.com/Kernel-Panic92/docflow.git
├── install.sh          # Instalador
├── config.env.example
└── .gitmodules
```

## Comandos útiles

```bash
# Ver estado de PM2
pm2 status

# Logs
pm2 logs horix
pm2 logs docflow
pm2 logs mcp-gateway

# Recargar nginx tras cambiar config
sudo nginx -t && sudo systemctl reload nginx

# Actualizar submódulos
git submodule update --remote --merge

# Actualizar plataforma (desde /opt/horix-platform)
cd /opt/horix-platform && git pull && bash install.sh
```
