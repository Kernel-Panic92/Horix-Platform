module.exports = function createRestoreUtils({ db, encryptSmtp }) {
  function restoreData(data, currentUserId) {
    return db.transaction(() => {
      let confItems = 0, empleados = 0, nominas = 0, registros = 0, usuarios = 0, sesionesCerradas = 0;
      if (data.configuracion) {
        const ins = db.prepare('INSERT OR REPLACE INTO configuracion VALUES (?,?)');
        for (const [clave, valor] of Object.entries(data.configuracion)) {
          ins.run(clave, clave === 'smtp_password' ? encryptSmtp(valor) : valor);
          confItems++;
        }
      }
      if (data.empleados?.length) {
        db.prepare('DELETE FROM empleados').run();
        const ins = db.prepare('INSERT OR REPLACE INTO empleados (id,nombre,cedula,cargo,departamento,sede,email,telefono) VALUES (?,?,?,?,?,?,?,?)');
        data.empleados.forEach(e => { ins.run(e.id, e.nombre, e.cedula, e.cargo, e.departamento, e.sede||'Principal', e.email||'', e.telefono||''); empleados++; });
      }
      if (data.nominas?.length) {
        db.prepare('DELETE FROM nominas').run();
        const ins = db.prepare('INSERT OR REPLACE INTO nominas VALUES (?,?,?,?,?)');
        data.nominas.forEach(n => { ins.run(n.id, n.nombre, n.tipo, n.inicio, n.fin); nominas++; });
      }
      if (data.registros?.length) {
        db.prepare('DELETE FROM registros').run();
        const ins = db.prepare('INSERT OR REPLACE INTO registros (id,empleadoId,nominaId,fecha,horas,tipo,aprobador,motivo,creado,concepto,sede,creadoPor,observaciones,transporte,estado,aprobadoPor,fechaAprobado) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)');
        data.registros.forEach(r => { ins.run(r.id, r.empleadoId, r.nominaId, r.fecha, r.horas, r.tipo, r.aprobador, r.motivo, r.creado, r.concepto||'', r.sede||'Principal', r.creadoPor||'', r.observaciones||'', parseFloat(r.transporte||0), r.estado||'pendiente', r.aprobadoPor||'', r.fechaAprobado||''); registros++; });
      }
      if (data.usuario_empleados?.length) {
        db.prepare('DELETE FROM usuario_empleados').run();
        const ins = db.prepare('INSERT OR IGNORE INTO usuario_empleados VALUES (?,?)');
        data.usuario_empleados.forEach(r => ins.run(r.usuarioId, r.empleadoId));
      }
      if (data.usuarios?.length) {
        const ins = db.prepare('INSERT OR REPLACE INTO usuarios (id,nombre,email,password,rol,sede,activo,cambio_password,creado) VALUES (?,?,?,?,?,?,?,?,?)');
        data.usuarios.forEach(u => { if (u.id !== currentUserId && u.password) { ins.run(u.id, u.nombre, u.email, u.password, u.rol, u.sede||'Principal', u.activo??1, u.cambio_password??0, u.creado); usuarios++; } });
      }
      if (data.dashboard_layout?.length) {
        db.prepare('DELETE FROM dashboard_layout').run();
        // Insertar dinámicamente según columnas que vengan en el backup
        const cols = ['usuarioId', ...Object.keys(data.dashboard_layout[0]).filter(k => k !== 'usuarioId')];
        const placeholders = cols.map(() => '?').join(',');
        const ins = db.prepare(`INSERT OR REPLACE INTO dashboard_layout (${cols.join(',')}) VALUES (${placeholders})`);
        data.dashboard_layout.forEach(d => ins.run(cols.map(c => d[c] ?? '')));
      }
      // Cerrar todas las sesiones activas para evitar corrupción
      const r = db.prepare('DELETE FROM sesiones').run();
      sesionesCerradas = r.changes;
      return { confItems, empleados, nominas, registros, usuarios: usuarios + ' (excluyendo tu usuario)', sesionesCerradas };
    })();
  }
  return { restoreData };
};
