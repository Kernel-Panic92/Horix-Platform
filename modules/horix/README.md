# Horix ![GitHub package.json version](https://img.shields.io/github/package-json/v/Kernel-Panic92/Horix?label=versi%C3%B3n) — Sistema de Control de Horas Extra

Sistema web para la gestión y control de horas extra, reportes e histórico

## Requisitos

| Componente | Versión mínima | Notas |
|-----------|---------------|-------|
| Node.js   | 18.0.0        | Instalado automáticamente por el instalador |
| PM2       | cualquiera    | Instalado automáticamente por el instalador |
| Fail2Ban  | cualquiera    | Instalado automáticamente por el instalador |
| Nginx     | cualquiera    | Solo si se configura HTTPS. `sudo apt install nginx -y` |
| Linux     | Ubuntu 20.04+ / Debian 11+ | |

## Instalación

Para clonar el repositorio tienes dos opciones:
- Usar SSH (requiere configurar una clave SSH en GitHub):
```bash
git clone git@github.com:Kernel-Panic92/Horix.git horix
```
- Usar HTTPS (no requiere clave SSH):
```bash
git clone https://github.com/Kernel-Panic92/Horix.git horix
```
Luego:
```bash
cd horix
chmod +x install.sh
./install.sh
```

El instalador configura interactivamente:

- Puerto del servidor
- Nombre de la empresa
- Email y contraseña del administrador
- Centro de operación inicial
- Backup local y en servidor NAS (opcional)
- Cron de backup automático diario (opcional)
- **HTTPS con Nginx** — dominio y puerto configurables (opcional)

## Configuración HTTPS

Si seleccionas HTTPS durante la instalación, el instalador:

1. Instala Nginx si no está presente
2. Genera un certificado SSL autofirmado válido por 10 años
3. Configura Nginx como reverse proxy (HTTPS → Node.js)
4. Exporta el certificado a `~/horix_cert.crt` para distribuirlo a los clientes

### Distribución del certificado en red con Active Directory

**DNS interno** — Agrega un registro A en `dnsmgmt.msc`:
```
Zona: tudominio.local → Nuevo host (A)
  Nombre: horix
  IP: <IP del servidor>
```

**Certificado vía GPO** — En `gpmc.msc`:
```
Configuración del equipo → Directivas → Configuración de Windows
  → Configuración de seguridad → Directivas de clave pública
    → Entidades de certificación raíz de confianza → Importar → horix_cert.crt
```

Luego aplica con `gpupdate /force` en los equipos cliente.

## Configuración post-instalación

1. Abre la URL del sistema en el navegador
2. Inicia sesión con las credenciales definidas en el instalador
3. Ve a **Configuración → Config. Correo** para configurar el servidor SMTP
4. Ve a **Centros de Operación** para agregar las sedes de tu organización

## Roles de usuario

| Rol | Permisos |
|-----|----------|
| Admin | Acceso total |
| RRHH | Registrar, editar, aprobar, gestionar centros |
| Consulta | Solo lectura |
| Operador | Ver y registrar solo su centro |

## Comandos útiles

```bash
pm2 logs horix          # Ver logs en tiempo real
pm2 restart horix       # Reiniciar servidor
pm2 stop horix          # Detener servidor
./backup_horasextra_template.sh  # Ejecutar backup manual
node seed-demo.js       # Cargar datos de prueba
sudo crontab -l         # Ver tareas programadas
sudo fail2ban-client status horix-login   # Ver IPs bloqueadas
sudo fail2ban-client set horix-login unbanip <IP>  # Desbloquear IP
```

## Estructura del proyecto

```
horix/
├── server.js                   # Backend monolítico — Express + SQLite
├── public/
│   ├── index.html               # Frontend SPA
│   ├── reset-password.html      # Página de reset de contraseña
│   └── js/
│       ├── app.js               # Inicialización y navegación SPA
│       ├── components/
│       │   └── modals.js        # Gestión de modales (confirm, config)
│       ├── modules/             # Módulos de cada página
│       │   ├── auth.js          # Login/logout
│       │   ├── dashboard.js     # Dashboard widgets y charts
│       │   ├── records.js       # Registro e historial de horas
│       │   ├── employees.js     # CRUD empleados
│       │   ├── users.js         # CRUD usuarios
│       │   ├── nomina.js        # Períodos de nómina
│   │   ├── reports.js       # Reportes y análisis
│   │   ├── siesa.js         # Exportar novedades a Siesa
│   │   ├── attachments.js   # Archivos adjuntos
│   │   ├── backup.js        # Backup y restauración
│   │   ├── security.js      # Seguridad y rate limiting
│   │   ├── smtp.js          # Config. de correo SMTP
│   │   ├── telemetry.js     # Telemetría anónima
│   │   └── import.js        # Importar empleados CSV
│       └── utils/
│           └── helpers.js       # Funciones compartidas (toast, permisos, CSV)
├── scripts/                     # Scripts de utilidad
├── install.sh                   # Instalador interactivo
├── seed-demo.js                # Script para cargar datos de prueba
├── backup_horasextra_template.sh # Template para backups
├── package.json
└── .env.example               # Variables de entorno de ejemplo
```

## Rama `refactor/modularize`

El frontend ha sido refactorizado de un solo archivo `<script>` monolítico a módulos JS separados:

- Cada página SPA tiene su propio archivo en `public/js/modules/`
- La lógica de modales se centralizó en `public/js/components/modals.js`
- Las funciones compartidas (`showToast`, permisos, exportar CSV) están en `public/js/utils/helpers.js`
- La navegación y ciclo de vida de la app se manejan desde `public/js/app.js`
- Todos los `getElementById` del JS fueron cotejados contra los IDs reales del HTML para eliminar referencias rotas

Los bugs conocidos de esta rama están documentados en [CHANGELOG.md](CHANGELOG.md) bajo "Issues del refactor".

## Características principales

- Gestión de empleados y centros de operación
- Registro y aprobación de horas extra
- Generación de nóminas y reportes
- Backups automáticos (local y NAS SMB)
- Actualizaciones desde la interfaz web
- Gestión de permisos por rol
- Flujo seguro de creación de usuarios (contraseña temporal + reset)

## Seguridad

- Contraseñas almacenadas con bcrypt
- Contraseña SMTP cifrada con AES-256-GCM
- Tokens de sesión con expiración
- HTTPS mediante Nginx como reverse proxy
- Rate limiting y Fail2Ban para protección contra ataques
- Script de backup con credenciales generado localmente, nunca versionado

## Licencia

Copyright (c) 2026 Edgar Velasquez. Todos los derechos reservados.  
Consulta el archivo [LICENSE](LICENSE) para más información.

## Notas de clonación y SSH
- Si al clonar ves: "Permission denied (publickey)", significa que no tienes una clave SSH configurada para GitHub o no está cargada en el agente SSH.
- Opciones:
  - Configurar una clave SSH y vincularla a tu cuenta de GitHub.
  - O usar HTTPS para clonar (ya descrito en la sección de instalación).
- Guía rápida para SSH:
  1) Generar clave SSH: `ssh-keygen -t ed25519 -C "tu-email@example.com"`
  2) Iniciar el agente SSH: `eval "$(ssh-agent -s)"`
  3) Añadir la clave: `ssh-add ~/.ssh/id_ed25519`
  4) Copiar la clave pública: `cat ~/.ssh/id_ed25519.pub` y pegarla en GitHub en Settings > SSH and GPG keys > New SSH key.
  5) Probar conexión: `ssh -T git@github.com` (deberías ver un mensaje de éxito).
- Si ya usas HTTPS y quieres convertir el remoto a HTTPS:
  - Cambia el remote: `git remote set-url origin https://github.com/Kernel-Panic92/Horix.git`
