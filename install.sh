#!/usr/bin/env bash
set -euo pipefail

# ── horix-platform installer ──
# Uso: sudo bash install.sh [test|prod]
#   test → subdominios .dev.local con SSL autofirmado
#   prod → path-based en horixvitamar.fortiddns.com con Let's Encrypt

MODE="${1:-test}"
CONFIG="/opt/horix-platform/config.env"
INSTALL_DIR="/opt/horix-platform"

echo "=== horix-platform installer ($MODE) ==="

# --- Cargar o crear config ---
if [ -f "$CONFIG" ]; then
  source "$CONFIG"
else
  echo "Configurando entorno..."
  mkdir -p "$INSTALL_DIR"

  if [ "$MODE" = "prod" ]; then
    read -rp "Dominio (ej: miapp.midominio.com): " DOMAIN
    SHELL_HOST=$DOMAIN; HORIX_HOST=$DOMAIN; DOCFLOW_HOST=$DOMAIN
    SHELL_PORT=443; HORIX_PORT=443; DOCFLOW_PORT=443
  else
    SHELL_HOST=shell.dev.local
    HORIX_HOST=horix.dev.local
    DOCFLOW_HOST=docflow.dev.local
    SHELL_PORT=8443; HORIX_PORT=8444; DOCFLOW_PORT=8445
  fi

  cat > "$CONFIG" <<EOF
MODE=$MODE
SHELL_HOST=$SHELL_HOST
HORIX_HOST=$HORIX_HOST
DOCFLOW_HOST=$DOCFLOW_HOST
SHELL_PORT=$SHELL_PORT
HORIX_PORT=$HORIX_PORT
DOCFLOW_PORT=$DOCFLOW_PORT
HORIX_INTERNAL_PORT=3000
DOCFLOW_INTERNAL_PORT=3100
MCP_GATEWAY_PORT=3002
JWT_SECRET=$(openssl rand -hex 32)
HORIX_REPO=https://github.com/Kernel-Panic92/Horix.git
DOCFLOW_REPO=https://github.com/Kernel-Panic92/docflow.git
INSTALL_DIR=$INSTALL_DIR
EOF
  source "$CONFIG"
fi

echo "Shell:   https://$SHELL_HOST:$SHELL_PORT"
echo "Horix:   https://$HORIX_HOST:$HORIX_PORT"
echo "DocFlow: https://$DOCFLOW_HOST:$DOCFLOW_PORT"
echo "MCP:     https://$SHELL_HOST:$SHELL_PORT/mcp"

# --- Dependencias base ---
echo ">>> Verificando dependencias..."
for cmd in node npm git nginx pm2 openssl envsubst; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Falta $cmd. Instalando..."
    case "$cmd" in
      pm2) npm install -g pm2 ;;
      envsubst) apt-get install -y gettext-base 2>/dev/null || true ;;
      *)   apt-get install -y "$cmd" 2>/dev/null || true ;;
    esac
  fi
done

# --- SSL ---
if [ "$MODE" = "test" ]; then
  echo ">>> Generando certificados SSL autofirmados..."
  for name in platform horix docflow; do
    mkdir -p "/etc/ssl/$name"
    if [ ! -f "/etc/ssl/$name/cert.pem" ]; then
      openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
        -keyout "/etc/ssl/$name/key.pem" \
        -out "/etc/ssl/$name/cert.pem" \
        -subj "/CN=${name}.dev.local/O=HorixPlatform/C=CO" 2>/dev/null
    fi
  done
else
  echo ">>> Let's Encrypt..."
  apt-get install -y certbot python3-certbot-nginx 2>/dev/null || true
  certbot --nginx -d "$SHELL_HOST" --non-interactive --agree-tos -m "admin@$SHELL_HOST" 2>/dev/null || true
fi

# --- Módulos via git submodules ---
PLATFORM_DIR="$(cd "$(dirname "$0")" && pwd)"
echo ">>> Platform dir: $PLATFORM_DIR"

echo ">>> Inicializando submodules..."
if [ -d "$PLATFORM_DIR/.git" ]; then
  cd "$PLATFORM_DIR"
  git submodule update --init --recursive 2>/dev/null || echo "  (no hay submodules registrados)"
  # Checkout branches defined in .gitmodules
  git submodule foreach -q --recursive '
    branch="$(git config -f $toplevel/.gitmodules submodule.$name.branch || echo main)"
    git checkout "$branch" 2>/dev/null && echo "  Submodulo $name actualizado a $branch"
  ' 2>/dev/null || true
else
  echo "  No es un repo git — usando directorios existentes"
  mkdir -p "$INSTALL_DIR/modules"
  for name in horix docflow; do
    if [ -d "$HOME/$name" ] && [ -d "$HOME/$name/.git" ]; then
      echo "  Vinculando ~/$name → $INSTALL_DIR/modules/$name"
      ln -sfn "$HOME/$name" "$INSTALL_DIR/modules/$name"
    else
      echo "  ADVERTENCIA: ~/$name no existe, instala manualmente"
    fi
  done
fi

# Copiar shell, nginx, mcp-gateway y módulos a $INSTALL_DIR
echo ">>> Copiando archivos de plataforma..."
mkdir -p "$INSTALL_DIR/shell" "$INSTALL_DIR/nginx" "$INSTALL_DIR/modules"
cp -r "$PLATFORM_DIR/shell/"* "$INSTALL_DIR/shell/"
cp -r "$PLATFORM_DIR/mcp-gateway" "$INSTALL_DIR/"
mkdir -p "$INSTALL_DIR/nginx"

# Copiar submódulos (se inicializaron en $PLATFORM_DIR/modules/)
for mod in horix docflow; do
  if [ -d "$PLATFORM_DIR/modules/$mod" ]; then
    echo "  Copiando módulo $mod..."
    # Si es un symlink (por el fallback de submodule), copiar el destino real
    if [ -L "$PLATFORM_DIR/modules/$mod" ]; then
      cp -rL "$PLATFORM_DIR/modules/$mod" "$INSTALL_DIR/modules/"
    else
      cp -r "$PLATFORM_DIR/modules/$mod" "$INSTALL_DIR/modules/"
    fi
  fi
done

# --- Generar shell/config.js desde template ---
echo ">>> Generando shell/config.js..."
export MODE
envsubst < "$PLATFORM_DIR/shell/config-template.js" > "$INSTALL_DIR/shell/config.js"

# --- Variables de entorno para cada módulo ---
setup_env() {
  local name="$1" env_file="$INSTALL_DIR/modules/$name/.env"
  case "$name" in
    horix)
      if [ ! -f "$env_file" ]; then
        echo "  Creando $env_file..."
        cat > "$env_file" <<EOF
PORT=$HORIX_INTERNAL_PORT
NODE_ENV=production
HE_SECRET=$(openssl rand -hex 32)
JWT_SECRET=$JWT_SECRET
BASE_URL=https://$HORIX_HOST:$HORIX_PORT
ADMIN_EMAIL=admin@horix.com
ADMIN_PASS=admin123
EOF
      elif ! grep -q "ADMIN_EMAIL" "$env_file" 2>/dev/null; then
        echo "  Agregando ADMIN_EMAIL/ADMIN_PASS a $env_file..."
        cat >> "$env_file" <<EOF
ADMIN_EMAIL=admin@horix.com
ADMIN_PASS=admin123
EOF
      fi
      ;;
    docflow)
      if [ ! -f "$env_file" ]; then
        echo "  Creando $env_file..."
        cat > "$env_file" <<EOF
PORT=$DOCFLOW_INTERNAL_PORT
NODE_ENV=production
JWT_SECRET=$JWT_SECRET
DB_HOST=localhost
DB_PORT=5432
DB_NAME=docflow
DB_USER=docflow
DB_PASSWORD=docflow
CORS_ORIGIN=https://$SHELL_HOST:$SHELL_PORT
EOF
      fi
      if command -v psql &>/dev/null; then
        sudo -u postgres psql -c "CREATE DATABASE docflow;" 2>/dev/null || true
        sudo -u postgres psql -c "CREATE USER docflow WITH PASSWORD 'docflow';" 2>/dev/null || true
        sudo -u postgres psql -c "GRANT ALL ON DATABASE docflow TO docflow;" 2>/dev/null || true
      fi
      ;;
  esac
}

echo ">>> Configuración de entorno..."
setup_env "horix"
setup_env "docflow"

# --- Instalar dependencias ---
echo ">>> Instalando dependencias npm..."
for mod in horix docflow; do
  if [ -d "$INSTALL_DIR/modules/$mod" ]; then
    cd "$INSTALL_DIR/modules/$mod"
    npm install --omit=dev 2>/dev/null || true
  fi
done

cd "$INSTALL_DIR/mcp-gateway"
npm install --omit=dev 2>/dev/null || true

# --- Migraciones ---
echo ">>> Migraciones..."
if [ -f "$INSTALL_DIR/modules/horix/src/db/migrations.js" ]; then
  cd "$INSTALL_DIR/modules/horix"
  node -e "require('./src/db/migrations')(require('./src/db').db)" 2>/dev/null || true
fi

if [ -f "$INSTALL_DIR/modules/docflow/src/db/migrate.js" ]; then
  cd "$INSTALL_DIR/modules/docflow"
  node src/db/migrate.js 2>/dev/null || true
fi

# --- Nginx ---
echo ">>> Configurando nginx..."
if [ "$MODE" = "test" ]; then
  cp "$PLATFORM_DIR/nginx/platform-test.conf" /etc/nginx/sites-available/platform
else
  cp "$PLATFORM_DIR/nginx/platform-prod.conf" /etc/nginx/sites-available/platform
fi
ln -sf /etc/nginx/sites-available/platform /etc/nginx/sites-enabled/platform
rm -f /etc/nginx/sites-enabled/default

nginx -t && systemctl reload nginx

# --- Iniciar con PM2 ---
echo ">>> Arrancando servicios..."
pm2 delete horix  2>/dev/null || true
pm2 delete docflow 2>/dev/null || true
pm2 delete mcp-gateway 2>/dev/null || true

if [ -f "$INSTALL_DIR/modules/horix/server.js" ]; then
  cd "$INSTALL_DIR/modules/horix"
  pm2 start server.js --name horix
fi

if [ -f "$INSTALL_DIR/modules/docflow/src/server.js" ]; then
  cd "$INSTALL_DIR/modules/docflow"
  pm2 start src/server.js --name docflow
fi

cd "$INSTALL_DIR/mcp-gateway"
HORIX_PORT="$HORIX_INTERNAL_PORT" DOCFLOW_PORT="$DOCFLOW_INTERNAL_PORT" \
  JWT_SECRET="$JWT_SECRET" \
  pm2 start server.js --name mcp-gateway -- --port "$MCP_GATEWAY_PORT"

pm2 save

echo ""
echo "=== Instalación completada ==="
echo "Shell:   https://$SHELL_HOST:$SHELL_PORT"
echo "Horix:   https://$HORIX_HOST:$HORIX_PORT"
echo "DocFlow: https://$DOCFLOW_HOST:$DOCFLOW_PORT"
echo "MCP:     https://$SHELL_HOST:$SHELL_PORT/mcp"
echo ""
if [ "$MODE" = "test" ]; then
  echo "Agrega a /etc/hosts de la VM:"
  echo "  127.0.0.1  $SHELL_HOST $HORIX_HOST $DOCFLOW_HOST"
fi
