#!/usr/bin/env bash
set -euo pipefail

# Platform installer
# Uso: sudo bash install.sh [test|prod]

MODE="${1:-test}"
CONFIG="/opt/horix-platform/config.env"
INSTALL_DIR="/opt/horix-platform"
PLATFORM_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Platform installer ($MODE) ==="

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
INSTALL_DIR=$INSTALL_DIR
EOF
  source "$CONFIG"
fi

echo "URL:     https://$DOMAIN (navegador) o http://localhost:3002 (directo)"

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
  mkdir -p "$INSTALL_DIR/launcher" "$INSTALL_DIR/nginx"
  cp -r "$PLATFORM_DIR/launcher/"*  "$INSTALL_DIR/launcher/"
  cp "$PLATFORM_DIR/nginx/"*.conf "$INSTALL_DIR/nginx/"
else
  echo "  Ya estamos en $INSTALL_DIR — saltando copia"
fi

echo ">>> Generando .env para launcher..."
if [ ! -f "$INSTALL_DIR/launcher/.env" ]; then
  cat > "$INSTALL_DIR/launcher/.env" <<EOF
PORT=$LAUNCHER_PORT
JWT_SECRET=$(openssl rand -hex 32 2>/dev/null || echo "dev_jwt_secret")
EOF
fi

echo ">>> Instalando dependencias npm..."
if [ -d "$INSTALL_DIR/launcher" ]; then
  cd "$INSTALL_DIR/launcher"
  npm install --omit=dev 2>/dev/null || true
fi
if [ -d "$INSTALL_DIR/wordpress-mcp" ]; then
  cd "$INSTALL_DIR/wordpress-mcp"
  npm install --omit=dev 2>/dev/null || true
fi

echo ">>> Arrancando servicios..."
pm2 delete horix-launcher 2>/dev/null || true

if [ -f "$INSTALL_DIR/launcher/server.js" ]; then
  cd "$INSTALL_DIR/launcher"
  pm2 start server.js --name horix-launcher
fi
pm2 save

echo ""
echo ">>> Para configurar nginx desde la UI del launcher:"
echo "    Admin → Nginx → 'Generar y recargar'"
echo "    (requiere registrar previamente los módulos con su prefijo proxy)"

echo "=== Instalación completada ==="
echo "Launcher: http://localhost:$LAUNCHER_PORT"
echo "Admin:    http://localhost:$LAUNCHER_PORT (admin@horix.com / admin123)"
echo ""
echo "⚠  Cambia la contraseña del admin después del primer ingreso."
echo "   Los módulos se registran desde Admin → Módulos."
