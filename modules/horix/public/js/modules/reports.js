// reports.js - Reports module for Horix

let _rptPage = 0;
let _rptPageSize = 100;

function guardarRangoReporte() {
  const rango = document.getElementById('rpt-rango')?.value || 'mes';
  const desde = document.getElementById('rpt-fecha-desde')?.value || '';
  const hasta = document.getElementById('rpt-fecha-hasta')?.value || '';
  localStorage.setItem('he_rpt_rango', JSON.stringify({ rango, desde, hasta }));
}

function restaurarRangoReporte() {
  const raw = localStorage.getItem('he_rpt_rango');
  if (!raw) return;
  try {
    const { rango, desde, hasta } = JSON.parse(raw);
    const sel = document.getElementById('rpt-rango');
    if (sel) sel.value = rango;
    const inpDesde = document.getElementById('rpt-fecha-desde');
    const inpHasta = document.getElementById('rpt-fecha-hasta');
    if (rango === 'personalizado') {
      if (inpDesde) inpDesde.value = desde;
      if (inpHasta) inpHasta.value = hasta;
      const grpDesde = document.getElementById('rpt-grp-desde');
      const grpHasta = document.getElementById('rpt-grp-hasta');
      if (grpDesde) grpDesde.style.display = '';
      if (grpHasta) grpHasta.style.display = '';
    } else {
      onRptRangoChange();
    }
  } catch (e) { /* ignore */ }
}

function onRptRangoChange() {
  const rango = document.getElementById('rpt-rango')?.value;
  const grpDesde = document.getElementById('rpt-grp-desde');
  const grpHasta = document.getElementById('rpt-grp-hasta');
  const inpDesde = document.getElementById('rpt-fecha-desde');
  const inpHasta = document.getElementById('rpt-fecha-hasta');
  const hoy = new Date();
  const fmt = d => d.toISOString().split('T')[0];

  if (rango === 'personalizado') {
    if (grpDesde) grpDesde.style.display = '';
    if (grpHasta) grpHasta.style.display = '';
    guardarRangoReporte();
    return;
  }
  if (grpDesde) grpDesde.style.display = 'none';
  if (grpHasta) grpHasta.style.display = 'none';

  let desde = new Date(hoy);
  if (rango === 'semana') desde.setDate(hoy.getDate() - 7);
  else if (rango === 'quincena') desde.setDate(hoy.getDate() - 15);
  else if (rango === 'mes') desde.setMonth(hoy.getMonth() - 1);
  else if (rango === 'anio') desde.setFullYear(hoy.getFullYear() - 1);
  if (rango === 'todo') {
    if (inpDesde) inpDesde.value = '';
    if (inpHasta) inpHasta.value = '';
  } else {
    if (inpDesde) inpDesde.value = fmt(desde);
    if (inpHasta) inpHasta.value = fmt(hoy);
  }
  guardarRangoReporte();
  _rptPage = 0;
  renderReporte();
}

function filtrarNominasRpt() {
  const q = document.getElementById('rpt-nom-search').value.toLowerCase();
  const dd = document.getElementById('rpt-nom-dropdown');
  if (!dd) return;
  const lista = [...nominas].sort((a, b) => a.inicio.localeCompare(b.inicio))
    .filter(n => !q || n.nombre.toLowerCase().includes(q));
  const esc = s => s.replace(/'/g, "&#39;");
  dd.innerHTML = `<div onmousedown="seleccionarNominaRpt('','')"
    style="padding:10px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border);color:var(--muted);"
    onmouseover="this.style.background='var(--border)'" onmouseout="this.style.background=''">
    Todos los períodos
  </div>` + (lista.length
    ? lista.map(n => `<div
        onmousedown="seleccionarNominaRpt('${esc(n.id)}','${esc(n.nombre)}')"
        style="padding:10px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border);"
        onmouseover="this.style.background='var(--border)'" onmouseout="this.style.background=''">
        <strong>${esc(n.nombre)}</strong>
        <span style="color:var(--muted);margin-left:8px;font-size:12px;">${esc(n.tipo)}</span>
      </div>`).join('')
    : '<div style="padding:12px 14px;color:var(--muted);font-size:13px;">Sin resultados</div>');
  dd.style.display = 'block';
}

function seleccionarNominaRpt(id, nombre) {
  document.getElementById('rpt-nomina').value = id;
  document.getElementById('rpt-nom-search').value = nombre;
  const dd = document.getElementById('rpt-nom-dropdown');
  if (dd) dd.style.display = 'none';
  _rptPage = 0;
  renderReporte();
}

function filtrarEmpleadosRpt() {
  const q = document.getElementById('rpt-emp-search').value.toLowerCase();
  const dd = document.getElementById('rpt-emp-dropdown');
  if (!dd) return;
  const lista = empleados.filter(e =>
    !q || e.nombre.toLowerCase().includes(q) || (e.cargo || '').toLowerCase().includes(q));
  const esc = s => s.replace(/'/g, "&#39;");
  dd.innerHTML = `<div onmousedown="seleccionarEmpleadoRpt('','')"
    style="padding:10px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border);color:var(--muted);"
    onmouseover="this.style.background='var(--border)'" onmouseout="this.style.background=''">
    Todos los empleados
  </div>` + (lista.length
    ? lista.map(e => `<div
        onmousedown="seleccionarEmpleadoRpt('${esc(e.id)}','${esc(e.nombre)}')"
        style="padding:10px 14px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border);"
        onmouseover="this.style.background='var(--border)'" onmouseout="this.style.background=''">
        <strong>${esc(e.nombre)}</strong>
        <span style="color:var(--muted);margin-left:8px;font-size:12px;">${esc(e.cargo || '')} 📍${esc(e.sede || '')}</span>
      </div>`).join('')
    : '<div style="padding:12px 14px;color:var(--muted);font-size:13px;">Sin resultados</div>');
  dd.style.display = 'block';
}

function seleccionarEmpleadoRpt(id, nombre) {
  document.getElementById('rpt-empleado').value = id;
  document.getElementById('rpt-emp-search').value = nombre;
  const dd = document.getElementById('rpt-emp-dropdown');
  if (dd) dd.style.display = 'none';
  _rptPage = 0;
  renderReporte();
}

function limpiarFiltrosReporte() {
  const ids = ['rpt-emp-search','rpt-empleado','rpt-nom-search','rpt-nomina','rpt-sede','rpt-tipo','rpt-estado','rpt-vinculo','rpt-fecha-desde','rpt-fecha-hasta'];
  ids.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  localStorage.removeItem('he_rpt_rango');
  const rango = document.getElementById('rpt-rango');
  if (rango) { rango.value = 'mes'; onRptRangoChange(); }
  _rptPage = 0;
  renderReporte();
}

let sortReporte = 'creado-desc';

function ordenarReporte(campo) {
  const key = campo + '-asc';
  const rev = campo + '-desc';
  if (sortReporte === key) sortReporte = rev;
  else if (sortReporte === rev) sortReporte = '';
  else sortReporte = key;
  _rptPage = 0;
  renderReporte();
}

function cambiarPageSizeRpt() {
  _rptPage = 0;
  renderReporte();
}

function paginaReporte(delta) {
  const newPage = _rptPage + delta;
  if (newPage < 0) return;
  _rptPage = newPage;
  renderReporte(false);
}

async function renderReporte(resetPage = true) {
  if (resetPage) _rptPage = 0;

  const pageSizeSel = document.getElementById('rpt-page-size');
  _rptPageSize = pageSizeSel ? parseInt(pageSizeSel.value) || 100 : 100;

  const empId = document.getElementById('rpt-empleado').value;
  const nomId = document.getElementById('rpt-nomina').value;
  const sedeId = document.getElementById('rpt-sede').value;
  const tipoId = document.getElementById('rpt-tipo').value;
  const estId = document.getElementById('rpt-estado')?.value || '';
  const vinId = document.getElementById('rpt-vinculo')?.value || '';
  const fechaDesde = document.getElementById('rpt-fecha-desde')?.value || '';
  const fechaHasta = document.getElementById('rpt-fecha-hasta')?.value || '';

  const params = new URLSearchParams();
  if (empId) params.set('empleadoId', empId);
  if (nomId) params.set('nominaId', nomId);
  if (sedeId) params.set('sede', sedeId);
  if (tipoId) params.set('tipo', tipoId);
  if (estId) params.set('estado', estId);
  if (vinId) params.set('vinculo', vinId);
  if (fechaDesde) params.set('fechaDesde', fechaDesde);
  if (fechaHasta) params.set('fechaHasta', fechaHasta);
  if (sortReporte) {
    const [campo, dir] = sortReporte.split('-');
    params.set('sort', campo);
    params.set('order', dir === 'asc' ? 'asc' : 'desc');
  }
  params.set('page', String(_rptPage));
  params.set('limit', String(_rptPageSize));

  const res = await GET('/api/registros/reportes?' + params.toString());
  if (!res.ok) { showToast('Error al cargar reporte', 'error'); return; }
  const data = await res.json();
  const { rows, total, summary } = data;

  // Sort indicators in table headers
  document.querySelectorAll('.table-wrap th[id^="rpt-th-"]').forEach(th => {
    th.textContent = th.textContent.replace(/ [▲▼]$/, '');
  });
  if (sortReporte) {
    const [campo] = sortReporte.split('-');
    const dir = sortReporte.endsWith('-desc') ? '▼' : '▲';
    const th = document.getElementById('rpt-th-' + campo);
    if (th) th.textContent = th.textContent.trim() + ' ' + dir;
  }

  // Summary cards
  const elTotal = document.getElementById('rpt-total');
  if (elTotal) elTotal.textContent = Number(summary.totalHoras || 0).toFixed(1);
  const elTransporte = document.getElementById('rpt-transporte');
  if (elTransporte) elTransporte.textContent = '$' + Number(summary.totalTransporte || 0).toLocaleString('es-CO');
  const elAprobados = document.getElementById('rpt-aprobados');
  if (elAprobados) elAprobados.textContent = summary.aprobados || 0;
  const elRechazados = document.getElementById('rpt-rechazados');
  if (elRechazados) elRechazados.textContent = summary.rechazados || 0;
  const elPendientes = document.getElementById('rpt-pendientes');
  if (elPendientes) elPendientes.textContent = summary.pendientes || 0;

  // Counter
  const counter = document.getElementById('rpt-counter');
  if (counter) counter.textContent = `Mostrando ${rows.length} de ${total} registros`;

  const tbody = document.getElementById('rpt-body');
  if (!tbody) return;

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="6"><div class="empty"><div class="empty-icon">📭</div><div class="empty-text">Sin datos para los filtros seleccionados</div></div></td></tr>';
    return;
  }

  tbody.innerHTML = rows.map(r => {
    const badgeEstado = r.estado === 'aprobado' ? 'success' : r.estado === 'rechazado' ? 'danger' : 'warning';
    return `<tr>
      <td data-label="Empleado"><strong>${esc(r.empleadoNombre || 'N/A')}</strong></td>
      <td data-label="Fecha">${esc(fmt(r.fecha))}</td>
      <td data-label="Creado" style="font-size:12px;color:var(--muted);white-space:nowrap;">${esc(fmt(r.creado))}</td>
      <td data-label="Horas"><strong>${esc(decimalAHoraMinuto(r.horas))}h</strong></td>
      <td data-label="Tipo"><span class="badge badge-${esc(r.tipo)}">${esc(nombreTipo(r.tipo))}</span></td>
      <td data-label="Estado"><span class="badge badge-${esc(badgeEstado)}">${esc(r.estado)}</span></td>
    </tr>`;
  }).join('');

  // Pagination controls
  const pagDiv = document.getElementById('rpt-pagination');
  const pageSizeBar = document.getElementById('rpt-page-size-bar');
  const prevBtn = document.getElementById('rpt-prev-btn');
  const nextBtn = document.getElementById('rpt-next-btn');
  const pageInfo = document.getElementById('rpt-page-info');
  if (!pagDiv) return;

  const totalPages = Math.ceil(total / _rptPageSize);
  const show = totalPages > 1;
  pagDiv.style.display = show ? 'flex' : 'none';
  if (pageSizeBar) pageSizeBar.style.display = show ? 'flex' : 'none';
  if (prevBtn) prevBtn.disabled = _rptPage <= 0;
  if (nextBtn) nextBtn.disabled = _rptPage >= totalPages - 1;
  if (pageInfo) pageInfo.textContent = `Página ${_rptPage + 1} de ${totalPages}`;
}
