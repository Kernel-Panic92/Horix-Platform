module.exports = function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id        TEXT PRIMARY KEY,
      nombre    TEXT NOT NULL,
      email     TEXT NOT NULL UNIQUE,
      password  TEXT NOT NULL,
      rol       TEXT NOT NULL DEFAULT 'consulta',
      sede      TEXT NOT NULL DEFAULT 'Principal',
      activo    INTEGER NOT NULL DEFAULT 1,
      creado    TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sesiones (
      token     TEXT PRIMARY KEY,
      usuarioId TEXT NOT NULL,
      expira    TEXT NOT NULL,
      csrf      TEXT
    );
    CREATE TABLE IF NOT EXISTS tokens_reset (
      token     TEXT PRIMARY KEY,
      usuarioId TEXT NOT NULL,
      expira    TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS configuracion (
      clave TEXT PRIMARY KEY,
      valor TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS empleados (
      id            TEXT PRIMARY KEY,
      nombre        TEXT NOT NULL,
      cedula        TEXT NOT NULL,
      cargo         TEXT NOT NULL,
      departamento  TEXT NOT NULL,
      sede          TEXT NOT NULL DEFAULT 'Principal',
      email         TEXT,
      telefono      TEXT
    );
    CREATE TABLE IF NOT EXISTS nominas (
      id      TEXT PRIMARY KEY,
      nombre  TEXT NOT NULL,
      tipo    TEXT NOT NULL,
      inicio  TEXT NOT NULL,
      fin     TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS registros (
      id          TEXT PRIMARY KEY,
      empleadoId  TEXT NOT NULL,
      nominaId    TEXT NOT NULL,
      fecha       TEXT NOT NULL,
      horas       REAL NOT NULL,
      tipo        TEXT NOT NULL,
      aprobador   TEXT NOT NULL,
      motivo      TEXT NOT NULL,
      creado      TEXT NOT NULL,
      concepto    TEXT NOT NULL DEFAULT '',
      observaciones TEXT NOT NULL DEFAULT '',
      transporte    REAL NOT NULL DEFAULT 0,
      sede        TEXT NOT NULL DEFAULT 'Principal',
      estado      TEXT NOT NULL DEFAULT 'pendiente',
      aprobadoPor TEXT NOT NULL DEFAULT '',
      fechaAprobado TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS usuario_empleados (
      usuarioId  TEXT NOT NULL,
      empleadoId TEXT NOT NULL,
      PRIMARY KEY (usuarioId, empleadoId)
    );
    CREATE TABLE IF NOT EXISTS centros (
      id      TEXT PRIMARY KEY,
      nombre  TEXT NOT NULL UNIQUE,
      activo  INTEGER NOT NULL DEFAULT 1,
      creado  TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS auditoria_logins (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      usuarioId TEXT,
      email     TEXT NOT NULL,
      ip        TEXT NOT NULL,
      tipo      TEXT NOT NULL,
      timestamp TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS telemetria (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      evento    TEXT NOT NULL,
      pagina    TEXT,
      usuarioId TEXT,
      datos     TEXT,
      ua        TEXT,
      ip        TEXT,
      creado    TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS tipos (
      id      TEXT PRIMARY KEY,
      nombre  TEXT NOT NULL,
      es_valor INTEGER NOT NULL DEFAULT 0,
      activo  INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS permisos_roles (
      rol     TEXT NOT NULL,
      permiso TEXT NOT NULL,
      PRIMARY KEY (rol, permiso)
    );
    CREATE TABLE IF NOT EXISTS roles (
      nombre  TEXT PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS adjuntos (
      id          TEXT PRIMARY KEY,
      registroId  TEXT NOT NULL,
      nombre      TEXT NOT NULL,
      mime        TEXT NOT NULL,
      tamano      INTEGER NOT NULL,
      datos       BLOB NOT NULL,
      subido      TEXT NOT NULL,
      subidoPor   TEXT NOT NULL,
      FOREIGN KEY (registroId) REFERENCES registros(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS dashboard_layout (
      usuarioId TEXT PRIMARY KEY,
      orden     TEXT NOT NULL DEFAULT '[]',
      tamanos   TEXT NOT NULL DEFAULT '{}'
    );
  `);

  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_registros_empleadoId ON registros(empleadoId)',
    'CREATE INDEX IF NOT EXISTS idx_registros_fecha       ON registros(fecha)',
    'CREATE INDEX IF NOT EXISTS idx_registros_creadoPor   ON registros(creadoPor)',
    'CREATE INDEX IF NOT EXISTS idx_registros_nominaId    ON registros(nominaId)',
    'CREATE INDEX IF NOT EXISTS idx_registros_estado      ON registros(estado)',
    'CREATE INDEX IF NOT EXISTS idx_registros_sede        ON registros(sede)',
    'CREATE INDEX IF NOT EXISTS idx_registros_search      ON registros(estado, tipo, nominaId, empleadoId, fecha)',
    'CREATE INDEX IF NOT EXISTS idx_empleados_sede        ON empleados(sede)',
    'CREATE INDEX IF NOT EXISTS idx_empleados_cedula      ON empleados(cedula)',
    'CREATE INDEX IF NOT EXISTS idx_sesiones_usuarioId    ON sesiones(usuarioId)',
    'CREATE INDEX IF NOT EXISTS idx_centros_nombre        ON centros(nombre)',
  ];
  for (const sql of indexes) {
    try { db.exec(sql); } catch {}
  }

  const alterMigrations = [
    `ALTER TABLE registros ADD COLUMN concepto TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE registros ADD COLUMN creadoPor TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE registros ADD COLUMN sede TEXT NOT NULL DEFAULT 'Principal'`,
    `ALTER TABLE registros ADD COLUMN observaciones TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE registros ADD COLUMN transporte REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE registros ADD COLUMN estado TEXT NOT NULL DEFAULT 'pendiente'`,
    `ALTER TABLE registros ADD COLUMN aprobadoPor TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE registros ADD COLUMN fechaAprobado TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE empleados ADD COLUMN sede TEXT NOT NULL DEFAULT 'Principal'`,
    `ALTER TABLE empleados ADD COLUMN tipo_vinculacion TEXT NOT NULL DEFAULT 'vinculado'`,
    `ALTER TABLE usuarios ADD COLUMN sede TEXT NOT NULL DEFAULT 'Principal'`,
    `ALTER TABLE usuarios ADD COLUMN cambio_password INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE sesiones ADD COLUMN csrf TEXT`,
    `ALTER TABLE sesiones ADD COLUMN ip TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE sesiones ADD COLUMN creado TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE sesiones ADD COLUMN ua TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE sesiones ADD COLUMN bfp TEXT NOT NULL DEFAULT ''`,
  ];
  for (const sql of alterMigrations) {
    try { db.exec(sql); } catch {}
  }
};
