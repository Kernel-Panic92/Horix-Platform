module.exports = async function runSeeds({ db, uid, hashPassword, encryptSmtp, BASE_URL, APP_NAME }) {
  // Seed tipos
  try {
    const existing = db.prepare('SELECT COUNT(*) c FROM tipos').get().c;
    if (existing === 0) {
      const seed = [
        ['005', 'RECARGO NOCTURNO', 0],
        ['006', 'HORA EXTRA DIURNA', 0],
        ['007', 'HORA EXTRA NOCTURNA', 0],
        ['008', 'HORA DOMINICAL/FESTIVA DIURNA COMPENSADA', 0],
        ['009', 'HORA DOMINICAL/FESTIVA NOCTURNA COMPENSADA', 0],
        ['010', 'HORA DOMINICAL/FESTIVA DIURNA NO COMPENSADA', 0],
        ['011', 'HORA DOMINICAL/FESTIVA NOCTURNA NO COMPENSADA', 0],
        ['012', 'HORA EXTRA DOMINICAL/FESTIVA DIURNA', 0],
        ['013', 'HORA EXTRA DOMINICAL/FESTIVA NOCTURNA', 0],
        ['202', 'RECONOCIMIENTO DE TRANSPORTE', 1],
        ['621', 'BONIFICACION CAVERO', 1],
        ['222', 'AUXILIO DE COMUNICACION', 1],
      ];
      const ins = db.prepare('INSERT INTO tipos (id, nombre, es_valor) VALUES (?,?,?)');
      seed.forEach(s => ins.run(s[0], s[1], s[2]));
      console.log('🌱 Tipos sembrados:', seed.length);
    }
  } catch (e) { console.error('Error seed tipos:', e.message); }

  // Seed permisos_roles
  try {
    const existingPerms = db.prepare('SELECT COUNT(*) c FROM permisos_roles').get().c;
    if (existingPerms === 0) {
      const seedPerms = {
        admin:    ['centros','usuarios','empleados','nominas','registros','configuracion','backup','reportes','siesa','tipos','aprobar','editar','revertir','eliminar_registros','eliminar_empleados','eliminar_centros','eliminar_nominas','ver_todos'],
        rrhh:     ['centros','usuarios','empleados','nominas','registros','reportes','siesa','tipos','editar','revertir','ver_todos'],
        gerencia: ['registros','reportes','aprobar','editar','revertir','ver_todos'],
        operador: ['registros','reportes','editar','ver_sede'],
        consulta: ['reportes','ver_todos']
      };
      const insPerm = db.prepare('INSERT INTO permisos_roles (rol, permiso) VALUES (?,?)');
      for (const [rol, perms] of Object.entries(seedPerms)) {
        perms.forEach(p => insPerm.run(rol, p));
      }
      console.log('🔑 Permisos sembrados');
    }
  } catch (e) { console.error('Error seed permisos:', e.message); }

  // Seed roles
  try {
    const existingRoles = db.prepare('SELECT COUNT(*) c FROM roles').get().c;
    if (existingRoles === 0) {
      const rolesSeed = ['admin','rrhh','gerencia','operador','consulta'];
      const insRol = db.prepare('INSERT INTO roles (nombre) VALUES (?)');
      rolesSeed.forEach(r => insRol.run(r));
      console.log('👥 Roles sembrados:', rolesSeed.length);
    }
  } catch (e) { console.error('Error seed roles:', e.message); }

  // Migrar permisos de visibilidad para roles existentes
  try {
    const visibilidadRoles = { admin: 'ver_todos', rrhh: 'ver_todos', gerencia: 'ver_todos', consulta: 'ver_todos', operador: 'ver_sede' };
    for (const [rol, perm] of Object.entries(visibilidadRoles)) {
      const yaTiene = db.prepare('SELECT 1 FROM permisos_roles WHERE rol = ? AND permiso IN (?,?,?)').get(rol, 'ver_todos', 'ver_sede', 'ver_propios');
      if (!yaTiene) {
        db.prepare('INSERT INTO permisos_roles (rol, permiso) VALUES (?,?)').run(rol, perm);
        console.log(`🔧 Permiso de visibilidad "${perm}" agregado a "${rol}"`);
      }
    }
  } catch (e) { console.error('Error migración permisos visibilidad:', e.message); }

  // Migrar tipos antiguos de registros a códigos numéricos
  try {
    db.exec(`UPDATE registros SET tipo='006' WHERE tipo='diurna'`);
    db.exec(`UPDATE registros SET tipo='007' WHERE tipo='nocturna'`);
    db.exec(`UPDATE registros SET tipo='012' WHERE tipo='festivo'`);
    db.exec(`UPDATE registros SET tipo='202' WHERE tipo='transporte'`);
    db.exec(`UPDATE empleados SET tipo_vinculacion='temporal' WHERE tipo_vinculacion='directo'`);
  } catch {}

  // SMTP defaults
  const smtpDefaults = {
    smtp_host:      '',
    smtp_puerto:    '',
    smtp_tls:       '',
    smtp_usuario:   '',
    smtp_password:  '',
    smtp_remitente: 'Horix <mail@tuempresa.com>',
    reset_asunto:   'Recuperación de contraseña — Horix',
    reset_cuerpo:   'Hola {nombre},\n\nRecibimos una solicitud para restablecer tu contraseña.\n\nHaz clic en el siguiente enlace (válido por 30 minutos):\n{enlace}\n\nSi no solicitaste esto, ignora este correo.\n\nSaludos,\nEquipo Horix'
  };
  for (const [clave, valor] of Object.entries(smtpDefaults)) {
    const existe = db.prepare('SELECT clave FROM configuracion WHERE clave = ?').get(clave);
    if (!existe) db.prepare('INSERT INTO configuracion VALUES (?,?)').run(clave, valor);
  }

  // Migrar smtp_password a AES si está en texto plano
  {
    const row = db.prepare("SELECT valor FROM configuracion WHERE clave='smtp_password'").get();
    if (row && row.valor && !row.valor.startsWith('aes:')) {
      const encrypted = encryptSmtp(row.valor);
      db.prepare("UPDATE configuracion SET valor=? WHERE clave='smtp_password'").run(encrypted);
    }
  }

  // Seed centros
  const totalCentros = db.prepare('SELECT COUNT(*) as n FROM centros').get().n;
  if (totalCentros === 0) {
    db.prepare('INSERT INTO centros (id,nombre,activo,creado) VALUES (?,?,1,?)').run(uid(), 'Principal', new Date().toISOString());
    console.log('🏢 Centro de operación inicial creado: Principal');
  }

  // Seed admin
  const totalUsuarios = db.prepare('SELECT COUNT(*) as c FROM usuarios').get();
  if (totalUsuarios.c === 0) {
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPass  = process.env.ADMIN_PASS;
    if (!adminEmail || !adminPass) {
      console.error('❌ ADMIN_EMAIL y ADMIN_PASS deben estar configurados en .env para crear el admin inicial');
      process.exit(1);
    }
    const primerCentro = db.prepare('SELECT nombre FROM centros LIMIT 1').get()?.nombre || 'Principal';
    db.prepare('INSERT INTO usuarios (id,nombre,email,password,rol,sede,activo,creado) VALUES (?,?,?,?,?,?,?,?)').run(
      uid(), 'Administrador',
      adminEmail,
      await hashPassword(adminPass),
      'admin', primerCentro, 1, new Date().toISOString()
    );
    console.log('👤 Usuario admin creado');
  }
};
