#!/usr/bin/env bash
set -euo pipefail

# horix-erp installer
# Uso: sudo bash install.sh [test|prod]

MODE="${1:-test}"
CONFIG="/opt/horix-platform/config.env"
INSTALL_DIR="/opt/horix-platform"
PLATFORM_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== horix-erp installer ($MODE) ==="

if [ -f "$CONFIG" ]; then
  source "$CONFIG"
else
  echo "Configurando entorno..."
  mkdir -p "$INSTALL_DIR"
  if [ "$MODE" = "prod" ]; then
    read -rp "Dominio (ej: horix.app): " DOMAIN
  fi
  cat > "$CONFIG" <<EOF
MODE=$MODE
DOMAIN=${DOMAIN:-localhost}
LAUNCHER_PORT=3002
HORIX_PORT=3000
DOCFLOW_PORT=3100
INSTALL_DIR=$INSTALL_DIR
EOF
  source "$CONFIG"
fi

echo "URL:     https://$DOMAIN (Launcher + MCP)"
echo "Horix:   https://$DOMAIN/horix/"
echo "DocFlow: https://$DOMAIN/docflow/"

echo ">>> Verificando dependencias..."
for cmd in node npm nginx pm2 openssl; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "Falta $cmd. Instalando..."
    case "$cmd" in
      pm2) npm install -g pm2 ;;
      *)   apt-get install -y "$cmd" 2>/dev/null || true ;;
    esac
  fi
done

if [ "$MODE" = "test" ]; then
  echo ">>> Generando certificados SSL autofirmados..."
  mkdir -p "/etc/ssl/platform"
  if [ ! -f "/etc/ssl/platform/cert.pem" ]; then
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
      -keyout "/etc/ssl/platform/key.pem" \
      -out "/etc/ssl/platform/cert.pem" \
      -subj "/CN=${DOMAIN}/O=HorixERP/C=CO" 2>/dev/null
  fi
else
  echo ">>> Let's Encrypt..."
  apt-get install -y certbot python3-certbot-nginx 2>/dev/null || true
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "admin@$DOMAIN" 2>/dev/null || true
fi

echo ">>> Copiando archivos..."
if [ "$PLATFORM_DIR" != "$INSTALL_DIR" ]; then
  mkdir -p "$INSTALL_DIR/launcher" "$INSTALL_DIR/modules/horix" "$INSTALL_DIR/modules/docflow" "$INSTALL_DIR/nginx"
  cp -r "$PLATFORM_DIR/launcher/"*  "$INSTALL_DIR/launcher/"
  cp -r "$PLATFORM_DIR/modules/horix/"*  "$INSTALL_DIR/modules/horix/"
  cp -r "$PLATFORM_DIR/modules/docflow/"* "$INSTALL_DIR/modules/docflow/"
  cp "$PLATFORM_DIR/nginx/"*.conf "$INSTALL_DIR/nginx/"
else
  echo "  Ya estamos en $INSTALL_DIR — saltando copia"
fi

echo ">>> Instalando dependencias npm..."
for mod in launcher modules/horix modules/docflow; do
  if [ -d "$INSTALL_DIR/$mod" ]; then
    cd "$INSTALL_DIR/$mod"
    npm install --omit=dev 2>/dev/null || true
  fi
done

echo ">>> Migraciones..."
if [ -f "$INSTALL_DIR/modules/horix/src/db/migrations.js" ]; then
  cd "$INSTALL_DIR/modules/horix"
  node -e "require('./src/db/migrations')(require('./src/db').db)" 2>/dev/null || true
fi
if [ -f "$INSTALL_DIR/modules/docflow/src/db/migrate.js" ]; then
  cd "$INSTALL_DIR/modules/docflow"
  node src/db/migrate.js 2>/dev/null || true
fi

echo ">>> Configurando nginx..."
if [ "$MODE" = "test" ]; then
  cp "$PLATFORM_DIR/nginx/platform-test.conf" /etc/nginx/sites-available/horix-erp
else
  cp "$PLATFORM_DIR/nginx/platform-prod.conf" /etc/nginx/sites-available/horix-erp
fi
ln -sf /etc/nginx/sites-available/horix-erp /etc/nginx/sites-enabled/horix-erp
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo ">>> Arrancando servicios..."
pm2 delete horix-launcher 2>/dev/null || true
pm2 delete horix 2>/dev/null || true
pm2 delete docflow 2>/dev/null || true

if [ -f "$INSTALL_DIR/launcher/server.js" ]; then
  cd "$INSTALL_DIR/launcher"
  pm2 start server.js --name horix-launcher
fi
if [ -f "$INSTALL_DIR/modules/horix/server.js" ]; then
  cd "$INSTALL_DIR/modules/horix"
  pm2 start server.js --name horix
fi
if [ -f "$INSTALL_DIR/modules/docflow/src/server.js" ]; then
  cd "$INSTALL_DIR/modules/docflow"
  pm2 start src/server.js --name docflow
fi
pm2 save

echo ""
echo "=== Instalación completada ==="
echo "URL:     https://$DOMAIN"
echo "Horix:   https://$DOMAIN/horix/"
echo "DocFlow: https://$DOMAIN/docflow/"
