const Database = require('better-sqlite3');
const bcrypt = require('bcrypt');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'horas_extra.db');
const db = new Database(DB_PATH);

const uid = () => Math.random().toString(36).substring(2, 10) + Date.now().toString(36);

const hashPassword = (password) => bcrypt.hashSync(password, 10);

const firstNames = ['Juan', 'María', 'Pedro', 'Ana', 'Luis', 'Laura', 'Carlos', 'Sofía', 'Miguel', 'Daniela', 'José', 'Valentina', 'Andrés', 'Carmen', 'Roberto', 'Elena', 'Fernando', 'Paola', 'Diego', 'Mónica', 'Ricardo', 'Gabriela', 'Francisco', 'Patricia', 'Jorge', 'Alejandra', 'Manuel', 'Natalia', 'Sergio', 'Andrea', 'Raúl', 'Claudia', 'Eduardo', 'Mariana', 'Víctor', 'Lorena', 'Alberto', 'Silvia', 'Héctor', 'Marta', 'Oscar', 'Diana', 'Mario', 'Lucía', 'Ernesto', 'Beatriz', 'Gustavo', 'Rosa', 'Arturo', 'Cecilia'];
const lastNames = ['Pérez', 'González', 'Rodríguez', 'Gómez', 'Díaz', 'Martínez', 'Sánchez', 'López', 'Morales', 'Rojas', 'Silva', 'Torres', 'Ramírez', 'Vargas', 'Mendoza', 'Castro', 'Herrera', 'Medina', 'Guerrero', 'Rivera', 'Moreno', 'Blanco', 'Molina', 'Delgado', 'Ortega', 'Rubio', 'Marín', 'Soto', 'Castillo', 'Ruiz', 'Peña', 'Guerra', 'Cruz', 'Calderón', 'León', 'Méndez', 'Vega', 'Fuentes', 'Campos', 'Reyes', 'Carrillo', 'Miranda', 'Luna', 'Santos', 'Nieves', 'Vera', 'Cabrera', 'Flores', 'Aguilar', 'Paredes'];

const cargos = ['Desarrollador Senior', 'Desarrollador Junior', 'Analista de Sistemas', 'Contador', 'Auxiliar Contable', 'Recursos Humanos', 'Vendedor', 'Supervisor', 'Gerente', 'Almacenista', 'Analista Logística', 'Seguridad', 'Atención al Cliente', 'Técnico', 'Auxiliar Administrativo', 'Coordinador', 'Especialista', 'Pasante', 'Director', 'Asistente', 'Ingeniero', 'Diseñador', 'Mercadólogo', 'Auditor', 'Abogado', 'Consultor', 'Operador', 'Mecánico', 'Electricista', 'Enfermero', 'Médico', 'Docente', 'Investigador', 'Archivista', 'Recepcionista', 'Chofer', 'Cocinero', 'Limpieza', 'Jardinero', 'Mensajero'];
const departamentos = ['Tecnología', 'Finanzas', 'RRHH', 'Ventas', 'Operaciones', 'Logística', 'Seguridad', 'Administración', 'Legal', 'Marketing', 'Auditoría', 'Salud', 'Educación', 'Mantenimiento', 'Servicios Generales'];
const prefixes = ['V', 'E', 'J'];

const centers = [
  { id: uid(), nombre: 'Principal', activo: 1, creado: new Date().toISOString() },
  { id: uid(), nombre: 'Sucursal Norte', activo: 1, creado: new Date().toISOString() },
  { id: uid(), nombre: 'Sucursal Sur', activo: 1, creado: new Date().toISOString() },
  { id: uid(), nombre: 'Centro Logístico', activo: 1, creado: new Date().toISOString() },
  { id: uid(), nombre: 'Sucursal Este', activo: 1, creado: new Date().toISOString() },
  { id: uid(), nombre: 'Sucursal Oeste', activo: 1, creado: new Date().toISOString() },
];

const roleCounts = { admin: 2, rrhh: 4, gerencia: 4, operador: 8, consulta: 2 };
const users = [];
let uIdx = 0;
Object.entries(roleCounts).forEach(([role, count]) => {
  for (let i = 0; i < count; i++) {
    const fn = firstNames[uIdx % firstNames.length];
    const ln = lastNames[(uIdx * 3) % lastNames.length];
    const sede = role === 'operador' ? centers[i % centers.length].nombre : 'Principal';
    users.push({
      id: uid(),
      nombre: `${fn} ${ln}`,
      email: `${role}${i + 1}@horix.demo`,
      password: hashPassword('Demo123*'),
      rol: role,
      sede,
      activo: 1,
      cambio_password: 0,
      creado: new Date().toISOString(),
    });
    uIdx++;
  }
});

const employees = [];
for (let i = 0; i < 500; i++) {
  const fn = firstNames[i % firstNames.length];
  const ln1 = lastNames[(i * 2) % lastNames.length];
  const ln2 = lastNames[(i * 3) % lastNames.length];
  const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
  const cedulaNum = Math.floor(10000000 + Math.random() * 90000000);
  employees.push({
    id: uid(),
    nombre: `${fn} ${ln1} ${ln2}`,
    cedula: `${prefix}-${cedulaNum}`,
    cargo: cargos[Math.floor(Math.random() * cargos.length)],
    departamento: departamentos[Math.floor(Math.random() * departamentos.length)],
    sede: centers[Math.floor(Math.random() * centers.length)].nombre,
    email: `emp${i + 1}@empresa.com`,
    telefono: `04${Math.floor(Math.random() * 3) + 1}${Math.floor(1000000 + Math.random() * 9000000)}`,
    tipo_vinculacion: Math.random() > 0.3 ? 'vinculado' : 'temporal',
  });
}

const payrolls = [];
const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
for (let m = 0; m < 6; m++) {
  const year = 2026;
  const monthNum = String(m + 1).padStart(2, '0');
  const daysInMonth = m === 1 ? 28 : (m === 3 || m === 5 || m === 8 || m === 10 ? 30 : 31);
  payrolls.push({ id: uid(), nombre: `Quincena 1 - ${months[m]} ${year}`, tipo: 'quincenal', inicio: `${year}-${monthNum}-01`, fin: `${year}-${monthNum}-15` });
  payrolls.push({ id: uid(), nombre: `Quincena 2 - ${months[m]} ${year}`, tipo: 'quincenal', inicio: `${year}-${monthNum}-16`, fin: `${year}-${monthNum}-${daysInMonth}` });
  payrolls.push({ id: uid(), nombre: `Mes ${months[m]} ${year}`, tipo: 'mensual', inicio: `${year}-${monthNum}-01`, fin: `${year}-${monthNum}-${daysInMonth}` });
}

const conceptoKeys = ['005', '006', '007', '008', '009', '010', '011', '012', '013', '202', '621', '222'];
const statuses = ['pendiente', 'aprobado', 'rechazado'];
const approvers = users.filter(u => ['admin', 'rrhh', 'gerencia'].includes(u.rol)).map(u => u.nombre);
const reasons = [
  'Entrega urgente de proyecto', 'Soporte técnico fuera de horario', 'Cierre contable',
  'Inventario anual', 'Implementación de sistema nuevo', 'Atención a cliente prioritario',
  'Mantenimiento preventivo', 'Capacitación de personal', 'Auditoría externa',
  'Lanzamiento de producto', 'Actualización de infraestructura', 'Respaldo de datos',
  'Migración de servidores', 'Pruebas de carga', 'Despliegue a producción',
  'Soporte 24/7', 'Emergencia operativa', 'Reunión internacional', 'Entrega de informes',
  'Conteo físico de inventario',
];

const valueBased = new Set(['202', '621', '222']);
const records = [];
const startDate = new Date('2026-01-01');
for (let i = 0; i < 2000; i++) {
  const emp = employees[Math.floor(Math.random() * employees.length)];
  const pay = payrolls[Math.floor(Math.random() * payrolls.length)];
  const tipo = conceptoKeys[Math.floor(Math.random() * conceptoKeys.length)];
  const esValor = valueBased.has(tipo);
  const status = Math.random() > 0.3 ? 'aprobado' : (Math.random() > 0.5 ? 'pendiente' : 'rechazado');
  const hours = esValor ? 0 : parseFloat((Math.random() * 8 + 0.5).toFixed(2));
  const transporte = esValor ? parseFloat((Math.random() * 250000 + 50000).toFixed(0)) : 0;
  const date = new Date(pay.inicio);
  date.setDate(date.getDate() + Math.floor(Math.random() * (parseInt(pay.fin.split('-')[2]) - parseInt(pay.inicio.split('-')[2]) + 1)));
  const created = new Date(date);
  created.setDate(created.getDate() - Math.floor(Math.random() * 3) - 1);

  const aprobador = approvers[Math.floor(Math.random() * approvers.length)];
  const motivo = reasons[Math.floor(Math.random() * reasons.length)];
  const fechaAprobado = status !== 'pendiente' ? new Date(date.getTime() + 86400000).toISOString() : new Date().toISOString();

  records.push({
    id: uid(),
    empleadoId: emp.id,
    nominaId: pay.id,
    fecha: date.toISOString().split('T')[0],
    horas: hours,
    tipo: tipo,
    aprobador: aprobador,
    motivo: motivo,
    creado: created.toISOString(),
    concepto: '',
    observaciones: Math.random() > 0.7 ? reasons[Math.floor(Math.random() * reasons.length)] : '',
    transporte: transporte,
    sede: emp.sede,
    estado: status,
    aprobadoPor: status !== 'pendiente' ? approvers[Math.floor(Math.random() * approvers.length)] : '',
    fechaAprobado: fechaAprobado,
    creadoPor: users[Math.floor(Math.random() * users.length)].id,
  });
}

const userEmployeeAssignments = [];
const operatorUsers = users.filter(u => u.rol === 'operador');
employees.forEach((emp, idx) => {
  const opUser = operatorUsers[idx % operatorUsers.length];
  if (Math.random() > 0.3) {
    userEmployeeAssignments.push({ usuarioId: opUser.id, empleadoId: emp.id });
  }
});

console.log('🌱 Iniciando carga de datos de demostración...\n');

console.log('🧹 Limpiando datos existentes...');
db.transaction(() => {
  db.prepare('DELETE FROM usuario_empleados').run();
  db.prepare('DELETE FROM registros').run();
  db.prepare('DELETE FROM nominas').run();
  db.prepare('DELETE FROM empleados').run();
  db.prepare('DELETE FROM usuarios').run();
  db.prepare('DELETE FROM centros').run();
})();
console.log('   ✓ Datos anteriores eliminados\n');

const insertCenter = db.prepare('INSERT INTO centros (id, nombre, activo, creado) VALUES (?, ?, ?, ?)');
const insertUser = db.prepare('INSERT INTO usuarios (id, nombre, email, password, rol, sede, activo, cambio_password, creado) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
const insertEmployee = db.prepare('INSERT INTO empleados (id, nombre, cedula, cargo, departamento, sede, email, telefono, tipo_vinculacion) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
const insertPayroll = db.prepare('INSERT INTO nominas (id, nombre, tipo, inicio, fin) VALUES (?, ?, ?, ?, ?)');
const insertRecord = db.prepare(`INSERT INTO registros (id, empleadoId, nominaId, fecha, horas, tipo, aprobador, motivo, creado, concepto, observaciones, transporte, sede, estado, aprobadoPor, fechaAprobado, creadoPor) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
const insertAssignment = db.prepare('INSERT INTO usuario_empleados (usuarioId, empleadoId) VALUES (?, ?)');

try {
  db.transaction(() => {
    console.log('📍 Insertando centros de operación...');
    centers.forEach(c => insertCenter.run(c.id, c.nombre, c.activo, c.creado));
    console.log(`   ✓ ${centers.length} centros creados`);

    console.log('👥 Insertando usuarios...');
    users.forEach(u => insertUser.run(u.id, u.nombre, u.email, u.password, u.rol, u.sede, u.activo, u.cambio_password, u.creado));
    console.log(`   ✓ ${users.length} usuarios creados (2 admin, 4 rrhh, 4 gerencia, 8 operador, 2 consulta)`);

    console.log('👷 Insertando empleados...');
    employees.forEach(e => insertEmployee.run(e.id, e.nombre, e.cedula, e.cargo, e.departamento, e.sede, e.email, e.telefono, e.tipo_vinculacion));
    console.log(`   ✓ ${employees.length} empleados creados`);

    console.log('📅 Insertando períodos de nómina...');
    payrolls.forEach(p => insertPayroll.run(p.id, p.nombre, p.tipo, p.inicio, p.fin));
    console.log(`   ✓ ${payrolls.length} períodos creados`);

    console.log('⏰ Insertando registros de horas extra...');
    records.forEach(r => insertRecord.run(r.id, r.empleadoId, r.nominaId, r.fecha, r.horas, r.tipo, r.aprobador, r.motivo, r.creado, r.concepto, r.observaciones, r.transporte, r.sede, r.estado, r.aprobadoPor, r.fechaAprobado, r.creadoPor));
    console.log(`   ✓ ${records.length} registros creados`);

    console.log('🔗 Asignando empleados a operadores...');
    const uniqueAssignments = [...new Set(userEmployeeAssignments.map(a => `${a.usuarioId}-${a.empleadoId}`))];
    uniqueAssignments.forEach(key => {
      const a = userEmployeeAssignments.find(x => `${x.usuarioId}-${x.empleadoId}` === key);
      insertAssignment.run(a.usuarioId, a.empleadoId);
    });
    console.log(`   ✓ ${uniqueAssignments.length} asignaciones creadas`);
  })();

  console.log('\n✅ Datos de demostración cargados exitosamente!\n');
  console.log('📋 Credenciales de acceso (todas usan password: Demo123*):');
  users.forEach(u => console.log(`   ${u.rol.padEnd(12)} ${u.email}`));
  console.log('\n   Ejemplo: admin1@horix.demo / Demo123*\n');

} catch (err) {
  console.error('❌ Error al cargar datos:', err.message);
  process.exit(1);
} finally {
  db.close();
}
