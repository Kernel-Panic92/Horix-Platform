// helpers.js - Funciones utilitarias para Horix

function teleError(path, status, method) {
  if (typeof enviarTelemetria === 'function') {
    enviarTelemetria('error_api', { path, status, method: method || 'GET' });
  }
}

function esc(str) {
  if (str == null) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
}

// Format date as DD/MM/YYYY
function fmt(d) {
  if (!d) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    const [y, m, day] = d.split('-');
    return `${day}/${m}/${y}`;
  }
  const dt = new Date(d);
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// Format ISO date for locale
function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('es-ES');
}

// Generate color from employee name
function empColor(n) {
  let h = 0;
  for (let i = 0; i < n.length; i++) h = n.charCodeAt(i) + ((h << 5) - h);
  return `hsl(${h % 360}, 60%, 45%)`;
}

// Returns null for valid HH:mm (≤12h), or a specific error string
function errorHoraInput(str) {
  if (!str && str !== 0) return null;
  const s = String(str).trim();
  if (!s) return null;
  if (/^\d{1,2}:\s*$/.test(s)) return 'Faltan los minutos (ej: 5:00)';
  if (!s.includes(':')) return 'Debe incluir los minutos (ej: 5:00)';
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(s);
  if (!m) return 'Formato inválido. Usa HH:mm (ej: 5:00)';
  const min = Number(m[2]);
  if (min > 59) return 'Los minutos deben estar entre 00 y 59';
  const h = Number(m[1]);
  if (h > 12) return 'No puede superar 12:00 horas';
  const total = h + min / 60;
  if (total > 12) return 'No puede superar 12:00 horas';
  if (total === 0) return 'Debe ser mayor a 0 horas';
  return null;
}

// Validate HH:mm strict format → decimal hours. Returns NaN if invalid.
function validarDuracion(str) {
  return errorHoraInput(str) === null
    ? (() => { const [h, min] = String(str).trim().split(':'); return Math.round((Number(h) + Number(min) / 60) * 100) / 100; })()
    : NaN;
}

// Normalize to HH:mm and show inline error on blur
function validarHoraInput(input) {
  const errEl = document.getElementById(input.id + '-err');
  if (!errEl) return;
  const v = input.value.trim();
  if (!v) { errEl.style.display = 'none'; return; }
  const err = errorHoraInput(v);
  if (err) {
    errEl.textContent = err;
    errEl.style.display = 'block';
  } else {
    errEl.style.display = 'none';
    const [h, min] = v.split(':');
    input.value = String(Number(h)).padStart(2, '0') + ':' + String(Number(min)).padStart(2, '0');
  }
}

// Convert decimal hours to HH:MM string (e.g. 1.7 → "01:42")
function decimalAHoraMinuto(val) {
  if (val === null || val === undefined || val === '') return '';
  const v = parseFloat(val);
  if (isNaN(v)) return '';
  const h = Math.floor(v);
  const m = Math.round((v - h) * 60);
  return String(h).padStart(2, '0') + ':' + m.toString().padStart(2, '0');
}



// Populate a tipo <select> from the global tipos array
function poblarSelectTipos(selectId, selectedValue = '') {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const placeholder = esc(sel.getAttribute('data-placeholder') || 'Seleccionar tipo...');
  const soloActivos = sel.getAttribute('data-activos') !== 'false';
  let list = typeof tipos !== 'undefined' && Array.isArray(tipos) ? tipos : [];
  if (soloActivos) list = list.filter(t => t.activo);
  let html = '<option value="">' + placeholder + '</option>';
  list.sort((a, b) => a.id.localeCompare(b.id)).forEach(t => {
    html += '<option value="' + esc(t.id) + '">' + esc(t.id + ' ' + t.nombre) + '</option>';
  });
  sel.innerHTML = html;
  if (selectedValue) sel.value = selectedValue;
}

// Map tipo code to description (uses dynamic tipos array, falls back to raw code)
function nombreTipo(tipo) {
  if (typeof tipos !== 'undefined' && Array.isArray(tipos)) {
    const t = tipos.find(t => t.id === tipo);
    if (t) return t.id + ' ' + t.nombre;
  }
  return tipo;
}

// Show toast notification
function showToast(msg, type = 'info') {
  const t = document.getElementById('toast-msg');
  if (!t) return;
  t.textContent = msg;
  const iconMap = { success: '✓', error: '✗', warning: '⚠', info: 'ℹ' };
  const icon = document.getElementById('toast-icon');
  if (icon) icon.textContent = iconMap[type] || 'ℹ';
  const toast = document.getElementById('toast');
  if (toast) {
    toast.className = 'toast show ' + type;
    setTimeout(() => toast.classList.remove('show'), 3000);
  }
}

// Toggle button loading state
function setLoading(id, v) {
  const btn = document.getElementById(id);
  if (!btn) return;
  if (!btn.dataset.txt) btn.dataset.txt = btn.textContent.trim();
  btn.disabled = v;
  if (v) {
    btn.innerHTML = '<span class="spinner"></span> Procesando...';
  } else {
    btn.textContent = btn.dataset.txt || 'Guardar';
  }
}

// Convert role to display label
function rolLabel(r) {
  const map = { admin: 'Administrador', rrhh: 'RRHH', gerencia: 'Gerencia', operador: 'Operador', consulta: 'Consulta' };
  return map[r] || r.charAt(0).toUpperCase() + r.slice(1).replace(/_/g, ' ');
}

// Permission checks
function puedoEditar() {
  return sesion && (hasPerm('empleados') || hasPerm('nominas') || hasPerm('centros'));
}

function puedeAprobar() {
  return sesion && hasPerm('aprobar');
}

function puedeEditar() {
  return sesion && hasPerm('editar');
}

function puedeRevertir() {
  return sesion && hasPerm('revertir');
}

function puedeRegistrar() {
  return sesion && hasPerm('registros');
}

function soyAdmin() {
  return sesion?.usuario?.rol === 'admin';
}

function soyGerencia() {
  return sesion?.usuario?.rol === 'gerencia';
}

function soyOperador() {
  return sesion?.usuario?.rol === 'operador';
}

function hasPerm(perm) {
  const perms = sesion?.usuario?.permisos;
  if (!perms) return false;
  return perms.includes(perm) || perms.includes('horix:' + perm);
}

// File helpers
function iconoMime(mime) {
  if (!mime) return '📎';
  if (mime.startsWith('image/')) return '🖼️';
  if (mime === 'application/pdf') return '📄';
  if (mime.includes('word')) return '📝';
  if (mime.includes('excel') || mime.includes('spreadsheet')) return '📊';
  return '📎';
}

function formatBytes(b) {
  if (b === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return parseFloat((b / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// Export data to CSV
function exportarCSV(modo) {
  if (modo === 'reporte') {
    exportarXLSX();
    return;
  }
  let rows = [];
  if (modo === 'empleados') {
    rows = [['Nombre', 'Cédula', 'Cargo', 'Departamento', 'Sede', 'Tipo Vinculación', 'Email', 'Teléfono']];
    empleados.forEach(e => rows.push([e.nombre, e.cedula, e.cargo, e.departamento, e.sede, e.tipo_vinculacion||'vinculado', e.email||'', e.telefono||'']));
  } else if (modo === 'registros') {
    rows = [['Fecha', 'Empleado', 'Descripción', 'Horas', 'Sede', 'Estado']];
    registros.forEach(r => {
      const emp = empleados.find(x => x.id === r.empleadoId);
      rows.push([fmt(r.fecha), emp?.nombre || '', nombreTipo(r.tipo), decimalAHoraMinuto(r.horas), r.sede, r.estado]);
    });
  } else if (modo === 'nominas') {
    rows = [['Período', 'Tipo', 'Empleados', 'Total Horas', 'Monto']];
    nominas.forEach(n => rows.push([n.nombre, n.tipo, n.total_empleados, n.total_horas, '$' + n.total_monto.toFixed(2)]));
  } else if (modo === 'historial') {
    rows = [['Fecha', 'Empleado', 'Período', 'Horas', 'Descripción', 'Estado', 'Aprobador', 'Motivo']];
    registros.forEach(r => {
      const emp = empleados.find(x => x.id === r.empleadoId);
      const nom = nominas.find(n => n.id === r.nominaId);
      rows.push([fmt(r.fecha), emp?.nombre || '', nom?.nombre || '', decimalAHoraMinuto(r.horas), nombreTipo(r.tipo), r.estado, r.aprobador || '', r.motivo || '']);
    });
  } else if (modo === 'reporte') {
    let data = [...registros];
    const empId = document.getElementById('rpt-empleado')?.value;
    const nomId = document.getElementById('rpt-nomina')?.value;
    const sedeId = document.getElementById('rpt-sede')?.value;
    const tipoId = document.getElementById('rpt-tipo')?.value;
    const estId = document.getElementById('rpt-estado')?.value || '';
    const fechaDesde = document.getElementById('rpt-fecha-desde')?.value || '';
    const fechaHasta = document.getElementById('rpt-fecha-hasta')?.value || '';
    if (empId)  data = data.filter(r => r.empleadoId === empId);
    if (nomId)  data = data.filter(r => r.nominaId === nomId);
    if (sedeId) data = data.filter(r => (r.sede || empleados.find(e => e.id === r.empleadoId)?.sede || '') === sedeId);
    if (tipoId) data = data.filter(r => r.tipo === tipoId);
    if (estId)  data = data.filter(r => r.estado === estId);
    if (fechaDesde) data = data.filter(r => r.fecha >= fechaDesde);
    if (fechaHasta) data = data.filter(r => r.fecha <= fechaHasta);
    if (!data.length) { showToast('No hay datos para exportar.', 'error'); return; }

    const headers = ['Empleado', 'Cédula', 'Cargo', 'Departamento', 'Período Nómina', 'Fecha', 'Horas', 'Código', 'Descripción', 'Motivo', 'Estado', 'Aprobador/Rechazado por', 'Motivo de rechazo', 'Observaciones', 'Valor COP', 'Registrado por'];

    rows = [headers];
    data.forEach(r => {
      const emp = empleados.find(e => e.id === r.empleadoId) || {};
      const nom = nominas.find(n => n.id === r.nominaId) || {};
      const estado = r.estado === 'rechazado' ? 'Rechazado' : r.estado === 'aprobado' ? 'Aprobado' : 'Pendiente';
      const aprobador = r.estado === 'rechazado' || r.estado === 'aprobado'
        ? (r.aprobadoPor
            ? (usuarios.find(u => u.id === r.aprobadoPor)?.nombre || r.aprobadoPor)
            : r.aprobador || '')
        : '';
      rows.push([
        emp.nombre || '',
        emp.cedula || '',
        emp.cargo || '',
        emp.departamento || '',
        nom.nombre || '',
        r.fecha || '',
        decimalAHoraMinuto(r.horas) || '',
        r.tipo || '',
        nombreTipo(r.tipo) || '',
        r.motivo || '',
        estado,
        aprobador,
        r.estado === 'rechazado' ? r.motivo || '' : '',
        r.observaciones || '',
        r.transporte || 0,
        r.nombreCreador || r.creadoPor || ''
      ]);
    });
    if (data.length) showToast('Archivo exportado.');
  }
  if (!rows.length) return;
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `horas_extra_${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// Wrapper around fetch that handles CSRF token rotation
async function fetchCSRF(url, options = {}) {
  const headers = options.headers || {};
  headers['x-csrf-token'] = sesion?.csrfToken || '';
  options.headers = headers;
  const res = await fetch(url, options);
  const newCsrf = res.headers.get('x-csrf-token');
  if (newCsrf && sesion) sesion.csrfToken = newCsrf;
  if (res.status >= 400 && res.status !== 404) teleError(url, res.status, options.method);
  return res;
}

async function exportarXLSX() {
  const empId = document.getElementById('rpt-empleado')?.value;
  const nomId = document.getElementById('rpt-nomina')?.value;
  const sedeId = document.getElementById('rpt-sede')?.value;
  const tipoId = document.getElementById('rpt-tipo')?.value;
  const estId = document.getElementById('rpt-estado')?.value || '';
  const vinId = document.getElementById('rpt-vinculo')?.value || '';
  const fechaDesde = document.getElementById('rpt-fecha-desde')?.value || '';
  const fechaHasta = document.getElementById('rpt-fecha-hasta')?.value || '';

  const res = await fetchCSRF('/api/exportar/reporte', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filters: { empleadoId: empId, nominaId: nomId, sede: sedeId, tipo: tipoId, estado: estId, vinculo: vinId, fechaDesde, fechaHasta } })
  });
  if (!res.ok) { const d = await res.json().catch(()=>({})); showToast(d.error || 'Error al exportar', 'error'); return; }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `reporte_horas_extra_${new Date().toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Reporte exportado en Excel', 'success');
  if (typeof enviarTelemetria === 'function') enviarTelemetria('exportar_reporte', { formato: 'xlsx' });
}

// ── Manual / Ayuda ──
function abrirManual() {
  const rol = sesion?.usuario?.rol || 'operador';
  window.open('/manual.html?rol=' + rol, '_blank');
}
