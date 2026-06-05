// records.js - Records (Registration + History) module for Horix

function actualizarSedeReg() {
  const empId = document.getElementById('reg-empleado')?.value;
  const sedeInput = document.getElementById('reg-sede');
  if (!sedeInput) return;
  
  if (empId) {
    const emp = empleados.find(e => e.id === empId);
    sedeInput.value = emp?.sede || '';
  } else {
    sedeInput.value = sesion?.usuario?.sede || '';
  }
}

function filtrarEmpleados() {
  const q = (document.getElementById('reg-emp-search')?.value || '').toLowerCase();
  const lista = document.getElementById('reg-emp-dropdown');
  if (!lista) return;
  
  const filtrados = empleados.filter(e => e.nombre.toLowerCase().includes(q));
  let html = '';
  for (let i = 0; i < filtrados.length; i++) {
    const emp = filtrados[i];
    html += `<div class="dropdown-item" onclick="seleccionarEmpleado('${esc(emp.id)}','${esc(emp.nombre)}')">${esc(emp.nombre)}</div>`;
  }
  lista.innerHTML = html;
  lista.style.display = filtrados.length ? 'block' : 'none';
}

function seleccionarEmpleado(id, nombre) {
  const input = document.getElementById('reg-emp-search');
  const hidden = document.getElementById('reg-empleado');
  const lista = document.getElementById('reg-emp-dropdown');
  
  if (input) input.value = nombre;
  if (hidden) hidden.value = id;
  if (lista) { lista.innerHTML = ''; lista.style.display = 'none'; }
  
  actualizarSedeReg();
}

async function guardarRegistro() {
  const empId = document.getElementById('reg-empleado')?.value;
  const fecha = document.getElementById('reg-fecha')?.value;
  const tipo = document.getElementById('reg-tipo')?.value;
  const esValor = esTipoValor(tipo);
  const nominaId = document.getElementById('reg-nomina')?.value || '';
  const motivo = document.getElementById('reg-motivo')?.value || '';
  const observaciones = document.getElementById('reg-observaciones')?.value || '';
  const transporte = esValor ? (parseFloat(document.getElementById('reg-transporte')?.value) || 0) : 0;
  
  if (!empId || !fecha || !tipo || !motivo) {
    showToast('Completa todos los campos incluyendo el motivo', 'warning');
    return;
  }
  const hoy = new Date().toISOString().split('T')[0];
  if (fecha > hoy) { showToast('La fecha no puede ser futura', 'warning'); return; }
  const nomSel = nominas.find(n => n.id === nominaId);
  if (nomSel && nomSel.inicio && nomSel.fin && (fecha < nomSel.inicio || fecha > nomSel.fin)) {
    showToast('La fecha no corresponde al período de nómina seleccionado', 'warning');
    return;
  }
  let horas = 0;
  if (!esValor) {
    const horaRaw = document.getElementById('reg-horas')?.value;
    const horaErr = errorHoraInput(horaRaw);
    if (horaErr) {
      const errEl = document.getElementById('reg-horas-err');
      if (errEl) { errEl.textContent = horaErr; errEl.style.display = 'block'; }
      showToast(horaErr, 'warning');
      return;
    }
    horas = validarDuracion(horaRaw);
    if (horas <= 0) { showToast('Las horas deben ser un número positivo', 'warning'); return; }
  }
  
  if (!puedeRegistrar()) {
    showToast('No tienes permiso para registrar horas', 'error');
    return;
  }
  
  setLoading('btn-guardar-reg', true);
  
  try {
    const body = { empleadoId: empId, nominaId, fecha, horas, tipo, motivo, observaciones, transporte };
    
    const res = await POST('/api/registros', body);
    const data = await res.json();
    
    if (res.ok) {
      // Upload attachments after record creation
      if (adjuntosSeleccionados?.length > 0 && data.id) {
        for (const adj of adjuntosSeleccionados) {
          const blob = new Blob([Uint8Array.from(atob(adj.datos), c => c.charCodeAt(0))], { type: adj.tipo });
          const fd = new FormData();
          fd.append('archivo', blob, adj.nombre);
          await fetchCSRF(`/api/registros/${data.id}/adjuntos`, {
            method: 'POST',
            body: fd
          });
        }
        adjuntosSeleccionados = [];
        renderAdjuntosSeleccionados();
      }
      
      // Save last nomina for next time
      if (nominaId) localStorage.setItem('he_last_nomina', nominaId);
      
      showToast('Registro guardado exitosamente', 'success');
      if (typeof enviarTelemetria === 'function') enviarTelemetria('registro_guardado', { tipo });
      limpiarFormulario();
      document.getElementById('reg-fecha')?.focus();
      await refreshRegistros();
      await reloadDashboardData();
      document.getElementById('page-registro')?.scrollIntoView({ behavior: 'smooth' });
    } else {
      showToast(data.error || 'Error al guardar', 'error');
    }
  } catch (e) {
    console.error('Save record error:', e);
    showToast('Error de conexión', 'error');
  } finally {
    setLoading('btn-guardar-reg', false);
  }
}

function limpiarFormulario() {
  const campos = {
    'reg-empleado': '',
    'reg-emp-search': '',
    'reg-fecha': '',
    'reg-tipo': '',
    'reg-horas': '',
    'reg-sede': sesion?.usuario?.sede || '',
    'reg-observaciones': ''
  };
  
  Object.entries(campos).forEach(([id, val]) => {
    const el = document.getElementById(id);
    if (el) el.value = val;
  });
  
  // Clear hours error
  const errEl = document.getElementById('reg-horas-err');
  if (errEl) errEl.style.display = 'none';
  
  // Clear attachments
  if (typeof adjuntosSeleccionados !== 'undefined') {
    adjuntosSeleccionados = [];
    if (typeof renderAdjuntosSeleccionados === 'function') renderAdjuntosSeleccionados();
  }
}

function esTipoValor(tipo) {
  if (typeof tipos !== 'undefined' && Array.isArray(tipos)) {
    const t = tipos.find(t => t.id === tipo);
    return t ? t.es_valor === 1 : false;
  }
  // Fallback while tipos not loaded
  return tipo === '202' || tipo === '621' || tipo === '222';
}

function onTipoChange() {
  const tipo = document.getElementById('reg-tipo')?.value;
  const esValor = esTipoValor(tipo);
  const transpGroup = document.getElementById('wrap-transporte');
  const horasGroup = document.getElementById('wrap-horas');
  if (transpGroup) transpGroup.style.display = esValor ? 'block' : 'none';
  if (horasGroup) horasGroup.style.display = esValor ? 'none' : 'block';
}

function populateRegistroSelects() {
  const selEmp = document.getElementById('fil-empleado');
  if (selEmp) {
    let html = '<option value="">Todos los empleados</option>';
    for (let i = 0; i < empleados.length; i++) {
      const e = empleados[i];
      html += `<option value="${esc(e.id)}">${esc(e.nombre)}</option>`;
    }
    selEmp.innerHTML = html;
  }
  
  const sn = document.getElementById('reg-nomina');
  if (!sn) return;
  
  const now = new Date();
  const anio = now.getFullYear();
  const mes = now.getMonth();
  const dia = now.getDate();
  const quincena = dia <= 15 ? 1 : 2;
  
  const relevantes = [...nominas]
    .sort((a, b) => b.inicio.localeCompare(a.inicio))
    .filter(n => {
      const inicio = new Date(n.inicio + 'T00:00:00');
      if (n.tipo === 'mensual') {
        return inicio.getFullYear() === anio && inicio.getMonth() === mes;
      }
      if (n.tipo === 'quincenal') {
        if (inicio.getFullYear() !== anio || inicio.getMonth() !== mes) return false;
        return quincena === 1 ? inicio.getDate() === 1 : inicio.getDate() > 1;
      }
      return false;
    });
  
  const todos = [...nominas].sort((a, b) => a.inicio.localeCompare(b.inicio));
  
  sn.innerHTML = '<option value="">Seleccionar período...</option>';
  
  if (relevantes.length) {
    const grp = document.createElement('optgroup');
    grp.label = 'Período actual';
    relevantes.forEach(n => {
      const opt = document.createElement('option');
      opt.value = n.id;
      opt.textContent = n.nombre;
      opt.selected = relevantes.length === 1;
      grp.appendChild(opt);
    });
    sn.appendChild(grp);
  }
  
  const grp2 = document.createElement('optgroup');
  grp2.label = 'Todos los períodos';
  todos.forEach(n => {
    const opt = document.createElement('option');
    opt.value = n.id;
    opt.textContent = n.nombre;
    grp2.appendChild(opt);
  });
  sn.appendChild(grp2);
  
  // Restore last used nomina
  const saved = localStorage.getItem('he_last_nomina');
  if (saved) {
    const exists = [...sn.options].some(o => o.value === saved);
    if (exists) sn.value = saved;
  }
}

// Save nomina on manual change
document.addEventListener('change', (e) => {
  if (e.target.id === 'reg-nomina' && e.target.value) {
    localStorage.setItem('he_last_nomina', e.target.value);
  }
});

let sortHistorial = 'creado-desc';
let seleccionHistorial = new Set();

function toggleSeleccionHist() {
  const allChecked = document.getElementById('hist-select-all')?.checked;
  seleccionHistorial.clear();
  document.querySelectorAll('#hist-body .hist-check').forEach(cb => {
    cb.checked = allChecked;
    if (allChecked) seleccionHistorial.add(cb.dataset.id);
  });
  actualizarBarraBatch();
}

function actualizarBarraBatch() {
  const bar = document.getElementById('hist-batch-bar');
  const count = document.getElementById('hist-selected-count');
  if (!bar || !count) return;
  const total = seleccionHistorial.size;
  if (total > 0) { bar.style.display = 'flex'; count.textContent = total; }
  else bar.style.display = 'none';
}

function alternarSeleccionHist(id, checked) {
  if (checked) seleccionHistorial.add(id);
  else seleccionHistorial.delete(id);
  actualizarBarraBatch();
  // Sync header checkbox
  const totalPendientes = document.querySelectorAll('#hist-body .hist-check').length;
  const seleccionados = document.querySelectorAll('#hist-body .hist-check:checked').length;
  const selAll = document.getElementById('hist-select-all');
  if (selAll) {
    selAll.checked = totalPendientes > 0 && seleccionados === totalPendientes;
    selAll.indeterminate = seleccionados > 0 && seleccionados < totalPendientes;
  }
}

async function aprobarMasivo(aprobar) {
  const ids = [...seleccionHistorial];
  if (!ids.length) { showToast('Selecciona al menos un registro', 'warning'); return; }
  const accion = aprobar ? 'aprobar' : 'rechazar';
  confirmar({
    titulo: (aprobar ? 'Aprobar' : 'Rechazar') + ' masivamente',
    mensaje: `¿Estás seguro de que deseas ${accion} ${ids.length} registro(s)?`,
    icono: aprobar ? '✓' : '✗',
    btnTxt: aprobar ? 'Aprobar todo' : 'Rechazar todo',
    onConfirm: async () => {
      const res = await POST('/api/registros/batch-aprobar', { ids, aprobar });
      if (!res.ok) { showToast('Error al procesar', 'error'); return; }
      const body = await res.json();
      const n = body.actualizados ?? ids.length;
      const tipo = n > 0 ? 'success' : 'warning';
      showToast(`${n} registro(s) ${aprobar ? 'aprobado(s)' : 'rechazado(s)'}${n < ids.length ? ` (${ids.length - n} omitido(s))` : ''}`, tipo);
      if (typeof enviarTelemetria === 'function') enviarTelemetria(aprobar ? 'registro_aprobado_masivo' : 'registro_rechazado_masivo', { cantidad: n });
      seleccionHistorial.clear();
      await refreshRegistros();
      await reloadDashboardData();
      await renderHistorial();
    }
  });
}

function limpiarSeleccionHist() {
  seleccionHistorial.clear();
  document.querySelectorAll('#hist-body .hist-check').forEach(cb => cb.checked = false);
  const selAll = document.getElementById('hist-select-all');
  if (selAll) { selAll.checked = false; selAll.indeterminate = false; }
  actualizarBarraBatch();
}

function ordenarHistorial(campo) {
  const key = campo + '-asc';
  const rev = campo + '-desc';
  if (sortHistorial === key) sortHistorial = rev;
  else if (sortHistorial === rev) sortHistorial = '';
  else sortHistorial = key;
  renderHistorial();
}

function guardarFiltrosHistorial() {
  const ids = ['fil-buscar','fil-tipo','fil-sede','fil-empleado','fil-nomina','fil-estado'];
  const obj = {};
  ids.forEach(id => { const el = document.getElementById(id); if (el) obj[id] = el.value; });
  localStorage.setItem('he_hist_filters', JSON.stringify(obj));
}

function restaurarFiltrosHistorial() {
  const raw = localStorage.getItem('he_hist_filters');
  if (!raw) return;
  try {
    const obj = JSON.parse(raw);
    Object.keys(obj).forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = obj[id] || '';
    });
  } catch (e) { /* ignore */ }
}

let _histPage = 0;
let _histPageSize = 100;

function cambiarPageSize() {
  _histPage = 0;
  renderHistorial();
}

function paginaHistorial(delta) {
  const newPage = _histPage + delta;
  if (newPage < 0) return;
  _histPage = newPage;
  renderHistorial(false);
}

async function renderHistorial(resetPage = true) {
  if (resetPage) _histPage = 0;
  const tbody = document.getElementById('hist-body');
  if (!tbody) return;

  // Read current page size from dropdown
  const pageSizeSel = document.getElementById('hist-page-size');
  _histPageSize = pageSizeSel ? parseInt(pageSizeSel.value) || 100 : 100;

  const filtroTexto = (document.getElementById('fil-buscar')?.value || '');
  const filtroTipo = document.getElementById('fil-tipo')?.value || '';
  const filtroSede = document.getElementById('fil-sede')?.value || '';
  const filtroEmp = document.getElementById('fil-empleado')?.value || '';
  const filtroNomina = document.getElementById('fil-nomina')?.value || '';
  const filtroEstado = document.getElementById('fil-estado')?.value || '';

  guardarFiltrosHistorial();

  const thAcciones = document.getElementById('hist-th-acciones');
  const puedeAprobarPerm = hasPerm('aprobar');
  const esAdmin = soyAdmin();
  const puedeEditPerm = hasPerm('editar');
  const puedeRevPerm = hasPerm('revertir');
  const puedeElimReg = hasPerm('eliminar_registros');
  if (thAcciones) thAcciones.style.display = (esAdmin || puedeAprobarPerm || puedeEditPerm || puedeRevPerm || puedeElimReg) ? '' : 'none';

  // Build search query params
  const params = new URLSearchParams();
  if (filtroTexto) params.set('buscar', filtroTexto);
  if (filtroTipo) params.set('tipo', filtroTipo);
  if (filtroSede) params.set('sede', filtroSede);
  if (filtroEmp) params.set('empleadoId', filtroEmp);
  if (filtroNomina) params.set('nominaId', filtroNomina);
  if (filtroEstado) params.set('estado', filtroEstado);
  if (sortHistorial) {
    const [campo, dir] = sortHistorial.split('-');
    params.set('sort', campo);
    params.set('order', dir === 'asc' ? 'asc' : 'desc');
  }
  params.set('page', String(_histPage));
  params.set('limit', String(_histPageSize));

  tbody.innerHTML = '<tr><td colspan="8"><div class="loading">Cargando...</div></td></tr>';

  let data;
  try {
    const res = await GET('/api/registros/search?' + params.toString());
    if (!res.ok) throw new Error('Error en búsqueda');
    data = await res.json();
  } catch (e) {
    console.error('Error al buscar registros:', e);
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--muted);">Error al cargar</td></tr>';
    return;
  }

  const { rows, total } = data;

  // Sort indicators
  document.querySelectorAll('#historial-table-wrap th[id^="hist-th-"]').forEach(th => {
    th.textContent = th.textContent.replace(/ [▲▼]$/, '');
  });
  if (sortHistorial) {
    const [campo] = sortHistorial.split('-');
    const dir = sortHistorial.endsWith('-desc') ? '▼' : '▲';
    const th = document.getElementById('hist-th-' + campo);
    if (th) th.textContent = th.textContent.trim() + ' ' + dir;
  }

  // Batch bar
  const batchBar = document.getElementById('hist-batch-bar');
  if (batchBar) batchBar.style.display = (puedeAprobarPerm && seleccionHistorial.size > 0) ? 'flex' : 'none';

  // Counter
  const counter = document.getElementById('hist-counter');
  if (counter) counter.textContent = `Mostrando ${rows.length} de ${total} registros`;

  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--muted);"><div style="font-size:40px;margin-bottom:12px;">🔍</div>No se encontraron registros</td></tr>';
    return;
  }

  // Sync select-all header checkbox after rows rendered

  // Build rows HTML
  let rowsHtml = '';
  for (let ri = 0; ri < rows.length; ri++) {
    const r = rows[ri];
    const nombreEmp = r.empleadoNombre || _empMap.get(r.empleadoId)?.nombre || 'N/A';
    const estadoCls = r.estado === 'aprobado' ? 'success' : r.estado === 'rechazado' ? 'danger' : 'warning';
    const isPendiente = r.estado === 'pendiente';
    const checked = seleccionHistorial.has(r.id) ? 'checked' : '';
    const cbHtml = isPendiente && puedeAprobarPerm
      ? `<input type="checkbox" class="hist-check" data-id="${esc(r.id)}" ${checked} onchange="alternarSeleccionHist('${esc(r.id)}',this.checked)">`
      : '';
    const actionsHtml = (isPendiente && puedeAprobarPerm
      ? `<button class="btn btn-sm btn-success" onclick="aprobarRegistro('${esc(r.id)}', true)" title="Aprobar">✓</button><button class="btn btn-sm btn-danger" onclick="aprobarRegistro('${esc(r.id)}', false)" title="Rechazar">✗</button>`
      : '') +
      (isPendiente && (puedeEditPerm || r.creadoPor === sesion?.usuario?.id) ? `<button class="btn btn-sm btn-secondary" onclick="editarRegistro('${esc(r.id)}')" title="Editar">✏️</button>` : '') +
      (!isPendiente && puedeRevPerm ? `<button class="btn btn-sm btn-secondary" onclick="revertirRegistro('${esc(r.id)}')" title="Revertir a pendiente">↩️</button>` : '') +
      (puedeElimReg ? `<button class="btn btn-sm btn-danger" onclick="eliminarRegistro('${esc(r.id)}')" title="Eliminar">🗑️</button>` : '');
    rowsHtml += `<tr data-id="${esc(r.id)}" style="cursor:pointer;" onclick="verDetalleRegistro('${esc(r.id)}')">
      <td style="width:36px;text-align:center;" onclick="event.stopPropagation();">${cbHtml}</td>
      <td><strong>${esc(nombreEmp)}</strong></td>
      <td>${esc(fmt(r.fecha))}</td>
      <td style="font-size:12px;color:var(--muted);white-space:nowrap;">${esc(fmt(r.creado))}</td>
      <td><strong>${esc(decimalAHoraMinuto(r.horas))}h</strong></td>
      <td>${esc(nombreTipo(r.tipo))}</td>
      <td><span class="badge badge-${estadoCls}">${esc(r.estado)}</span></td>
      <td><div class="actions-cell" onclick="event.stopPropagation();">${actionsHtml}</div></td>
    </tr>`;
  }
  tbody.innerHTML = rowsHtml;

  // Sync header checkbox
  const selAll = document.getElementById('hist-select-all');
  if (selAll) {
    const checks = tbody.querySelectorAll('.hist-check');
    const checked = tbody.querySelectorAll('.hist-check:checked');
    selAll.checked = checks.length > 0 && checked.length === checks.length;
    selAll.indeterminate = checked.length > 0 && checked.length < checks.length;
  }

  // Pagination controls
  const pagDiv = document.getElementById('hist-pagination');
  const pageSizeBar = document.getElementById('hist-page-size-bar');
  const prevBtn = document.getElementById('hist-prev-btn');
  const nextBtn = document.getElementById('hist-next-btn');
  const pageInfo = document.getElementById('hist-page-info');
  if (!pagDiv) return;

  const totalPages = Math.ceil(total / _histPageSize);
  const show = totalPages > 1;
  pagDiv.style.display = show ? 'flex' : 'none';
  if (pageSizeBar) pageSizeBar.style.display = show ? 'flex' : 'none';
  if (prevBtn) prevBtn.disabled = _histPage <= 0;
  if (nextBtn) nextBtn.disabled = _histPage >= totalPages - 1;
  if (pageInfo) pageInfo.textContent = `Página ${_histPage + 1} de ${totalPages}`;
}

// Event delegation for historial row clicks
document.addEventListener('click', (e) => {
  const tr = e.target.closest('#hist-body tr');
  if (tr && tr.dataset.id) {
    verDetalleRegistro(tr.dataset.id);
  }
});

let editAdjuntosPendientes = [];

function editarAgregarAdjuntos(files) {
  if (!files || !files.length) return;
  const listEl = document.getElementById('edit-adjuntos-list');
  for (const f of files) {
    editAdjuntosPendientes.push(f);
    const div = document.createElement('div');
    div.style.cssText = 'display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px;';
    div.innerHTML = `📎 ${esc(f.name)} <span style="color:var(--muted);font-size:11px;">(${(f.size/1024).toFixed(1)} KB)</span>
      <span style="margin-left:auto;cursor:pointer;color:var(--danger);" onclick="this.parentElement.remove();editarRemoverAdjunto(${editAdjuntosPendientes.length - 1})">✕</span>`;
    listEl.appendChild(div);
  }
}

function editarRemoverAdjunto(idx) {
  editAdjuntosPendientes.splice(idx, 1);
}

function editarEliminarAdjunto(id, el) {
  confirmar({
    titulo: 'Eliminar Adjunto',
    mensaje: '¿Eliminar este archivo?',
    icono: '🗑️',
    btnTxt: 'Eliminar',
    onConfirm: async () => {
      const res = await DEL(`/api/adjuntos/${id}`);
      if (!res.ok) { showToast('Error al eliminar', 'error'); return; }
      el.closest('div').remove();
      showToast('Adjunto eliminado', 'success');
    }
  });
}

async function editarRegistro(id) {
  const reg = registros.find(r => r.id === id);
  if (!reg) return;
  const emp = empleados.find(e => e.id === reg.empleadoId);
  const empNombre = emp?.nombre || '';

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay open';
  overlay.innerHTML = `
    <div class="modal" style="width:520px;">
      <div class="modal-title">✏️ Editar Registro</div>
      <div style="font-size:14px;">
        <div class="form-group">
          <label>Empleado</label>
          <input class="form-control" id="edit-emp-search" value="${esc(empNombre)}" disabled>
          <input type="hidden" id="edit-empleado" value="${esc(reg.empleadoId)}">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label>Fecha</label>
            <input class="form-control" type="date" id="edit-fecha" value="${esc(reg.fecha)}" max="${new Date().toISOString().split('T')[0]}">
          </div>
          <div class="form-group" id="edit-wrap-horas">
            <label>Horas <span style="font-weight:400;color:var(--muted);font-size:12px;">(HH:mm, máx. 12h)</span></label>
            <input class="form-control" type="text" id="edit-horas" value="${esc(decimalAHoraMinuto(reg.horas))}" placeholder="HH:mm" inputmode="numeric" onblur="validarHoraInput(this)" onfocus="document.getElementById('edit-horas-err').style.display='none'">
            <small id="edit-horas-err" style="color:var(--danger);display:none;margin-top:4px;"></small>
          </div>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          <div class="form-group">
            <label>Tipo</label>
            <select class="form-control" id="edit-tipo">${document.getElementById('reg-tipo')?.innerHTML || ''}</select>
          </div>
          <div class="form-group">
            <label>Período Nómina</label>
            <select class="form-control" id="edit-nomina">${document.getElementById('reg-nomina')?.innerHTML || ''}</select>
          </div>
        </div>
        <div class="form-group" id="edit-wrap-transporte" style="${esTipoValor(reg.tipo) ? 'display:block' : 'display:none'}">
          <label>Valor COP</label>
          <input class="form-control" type="number" id="edit-transporte" value="${reg.transporte || 0}">
        </div>
        <div class="form-group">
          <label>Motivo</label>
          <textarea class="form-control" id="edit-motivo" rows="2">${esc(reg.motivo || '')}</textarea>
        </div>
        <div class="form-group">
          <label>Observaciones</label>
          <textarea class="form-control" id="edit-observaciones" rows="2">${esc(reg.observaciones || '')}</textarea>
        </div>
        <div class="form-group">
          <label>Archivos Adjuntos <span style="font-weight:400;color:var(--muted);font-size:12px;">(Opcional)</span></label>
          <div id="edit-adjuntos-existentes" style="margin-bottom:8px;"></div>
          <div id="edit-adjuntos-drop-zone" style="border:2px dashed var(--border);border-radius:10px;padding:16px;text-align:center;cursor:pointer;transition:border-color 0.2s;background:var(--surface2);font-size:13px;color:var(--muted);"
            onclick="document.getElementById('edit-adjuntos-input').click()"
            ondragover="event.preventDefault();this.style.borderColor='var(--accent)'"
            ondragleave="this.style.borderColor='var(--border)'"
            ondrop="event.preventDefault();editarAgregarAdjuntos(event.dataTransfer.files);this.style.borderColor='var(--border)'">
            📎 Arrastra archivos aquí o haz clic para seleccionar
          </div>
          <input type="file" id="edit-adjuntos-input" multiple style="display:none" onchange="editarAgregarAdjuntos(this.files)">
          <div id="edit-adjuntos-list" style="margin-top:8px;"></div>
        </div>
      </div>
      <div style="margin-top:24px;display:flex;gap:10px;">
        <button class="btn btn-primary" id="btn-guardar-edit">💾 Guardar Cambios</button>
        <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

  // Set selected tipo
  const selTipo = document.getElementById('edit-tipo');
  if (selTipo) selTipo.value = reg.tipo;
  const selNom = document.getElementById('edit-nomina');
  if (selNom) selNom.value = reg.nominaId;

  // Show/hide transporte and horas on tipo change
  if (selTipo) {
    selTipo.addEventListener('change', () => {
      const esValor = esTipoValor(selTipo.value);
      const wrapTrans = document.getElementById('edit-wrap-transporte');
      const wrapHoras = document.getElementById('edit-wrap-horas');
      if (wrapTrans) wrapTrans.style.display = esValor ? 'block' : 'none';
      if (wrapHoras) wrapHoras.style.display = esValor ? 'none' : 'block';
    });
  }

  // Load existing attachments
  fetch(`/api/registros/${id}/adjuntos`).then(r => r.json()).then(files => {
    const cont = document.getElementById('edit-adjuntos-existentes');
    if (!cont) return;
    if (!files.length) { cont.style.display = 'none'; return; }
    cont.innerHTML = '<div style="font-size:12px;color:var(--muted);margin-bottom:4px;">Adjuntos actuales:</div>' +
      files.map(f => `
        <div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px;">
          <span>📎</span>
          <span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(f.nombre)}</span>
          <span style="color:var(--muted);font-size:11px;">(${(f.tamano/1024).toFixed(1)} KB)</span>
          <span style="cursor:pointer;color:var(--danger);font-size:15px;" onclick="editarEliminarAdjunto('${esc(f.id)}', this)">✕</span>
        </div>
      `).join('');
  }).catch(() => {});

  document.getElementById('btn-guardar-edit').onclick = async () => {
    const editTipo = document.getElementById('edit-tipo')?.value || '';
    const editEsValor = esTipoValor(editTipo);
    let editHoras = 0;
    if (!editEsValor) {
      const horaRaw = document.getElementById('edit-horas')?.value;
      const horaErr = errorHoraInput(horaRaw);
      if (horaErr) {
        const errEl = document.getElementById('edit-horas-err');
        if (errEl) { errEl.textContent = horaErr; errEl.style.display = 'block'; }
        showToast(horaErr, 'warning');
        return;
      }
      editHoras = validarDuracion(horaRaw);
      if (editHoras <= 0) { showToast('Las horas deben ser un número positivo', 'warning'); return; }
    }
    const body = {
      empleadoId: reg.empleadoId,
      nominaId: document.getElementById('edit-nomina')?.value || '',
      fecha: document.getElementById('edit-fecha')?.value || '',
      horas: editHoras,
      tipo: editTipo,
      motivo: document.getElementById('edit-motivo')?.value || '',
      observaciones: document.getElementById('edit-observaciones')?.value || '',
      transporte: editEsValor ? (parseFloat(document.getElementById('edit-transporte')?.value) || 0) : 0
    };
    if (!body.fecha || !body.tipo || !body.motivo) { showToast('Completa fecha, tipo y motivo', 'warning'); return; }
    const hoy = new Date().toISOString().split('T')[0];
    if (body.fecha > hoy) { showToast('La fecha no puede ser futura', 'warning'); return; }
    // Validate fecha against selected period
    const nomSel = nominas.find(n => n.id === body.nominaId);
    if (nomSel && nomSel.inicio && nomSel.fin && (body.fecha < nomSel.inicio || body.fecha > nomSel.fin)) {
      showToast('La fecha no corresponde al período de nómina seleccionado', 'warning');
      return;
    }

    setLoading('btn-guardar-edit', true);
    const res = await PUT(`/api/registros/${id}`, body);
    if (!res.ok) { setLoading('btn-guardar-edit', false); const d = await res.json(); showToast(d.error || 'Error al editar', 'error'); return; }

    // Upload new attachments
    if (editAdjuntosPendientes.length > 0) {
      for (const f of editAdjuntosPendientes) {
        const fd = new FormData();
        fd.append('archivo', f);
        await fetchCSRF(`/api/registros/${id}/adjuntos`, {
          method: 'POST',
          body: fd
        });
      }
      editAdjuntosPendientes = [];
    }

    setLoading('btn-guardar-edit', false);
    showToast('Registro actualizado', 'success');
    if (typeof enviarTelemetria === 'function') enviarTelemetria('registro_editado', { id, tipo: body.tipo });
    overlay.remove();
    await refreshRegistros();
    await reloadDashboardData();
    renderHistorial();
  };
}

async function revertirRegistro(id) {
  confirmar({
    titulo: 'Revertir a Pendiente',
    mensaje: '¿Estás seguro de revertir este registro a estado pendiente?',
    icono: '↩️',
    btnTxt: 'Revertir',
    onConfirm: async () => {
      const res = await POST(`/api/registros/${id}/revertir`, {});
      if (!res.ok) { const d = await res.json(); showToast(d.error || 'Error', 'error'); return; }
      showToast('Registro revertido a pendiente', 'success');
      if (typeof enviarTelemetria === 'function') enviarTelemetria('registro_revertido', { id });
      await refreshRegistros();
      await reloadDashboardData();
      renderHistorial();
    }
  });
}

async function eliminarRegistro(id) {
  confirmar({
    titulo: 'Eliminar Registro',
    mensaje: '¿Estás seguro de que deseas eliminar este registro de horas extra? Esta acción no se puede deshacer.',
    icono: '🗑️',
    onConfirm: async () => {
      try {
        const res = await DEL(`/api/registros/${id}`);
        if (res.ok) {
          showToast('Registro eliminado', 'success');
          if (typeof enviarTelemetria === 'function') enviarTelemetria('registro_eliminado', { id });
          await refreshRegistros();
          await reloadDashboardData();
          renderHistorial();
        } else {
          const data = await res.json();
          showToast(data.error || 'Error', 'error');
        }
      } catch (e) {
        showToast(e.message || 'Error de conexión', 'error');
      }
    }
  });
}

async function aprobarRegistro(id, aprobar) {
  const accion = aprobar ? 'aprobar' : 'rechazar';
  const obsLabel = aprobar ? 'Motivo de aprobación (opcional)' : 'Motivo de rechazo (opcional)';
  confirmar({
    titulo: (aprobar ? 'Aprobar' : 'Rechazar') + ' Registro',
    mensaje: `¿Estás seguro de que deseas ${accion} este registro?`,
    icono: aprobar ? '✓' : '✗',
    btnTxt: aprobar ? 'Aprobar' : 'Rechazar',
    obsLabel,
    onConfirm: async () => {
      const obs = document.getElementById('confirm-obs')?.value || '';
      const res = await POST(`/api/registros/${id}/aprobar`, { aprobar, observaciones: obs });
      if (!res.ok) {
        const data = await res.json().catch(()=>({error:'Error'}));
        showToast(data.error || 'Error', 'error');
        return;
      }
      showToast(`Registro ${aprobar ? 'aprobado' : 'rechazado'}`, 'success');
      if (typeof enviarTelemetria === 'function') enviarTelemetria(aprobar ? 'registro_aprobado' : 'registro_rechazado', { id, observaciones: obs });
      await refreshRegistros();
      await reloadDashboardData();
      renderHistorial();
    }
  });
}

function resaltarRegistro(registroId) {
  navigate('historial');
  setTimeout(() => {
    const row = document.querySelector(`tr[data-id="${registroId}"]`);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      row.classList.add('highlight');
      setTimeout(() => {
        row.classList.remove('highlight');
        window.history.replaceState({}, document.title, window.location.pathname);
      }, 4000);
    }
  }, 600);
}

function verDetalleRegistro(id) {
  try {
    const modal = document.getElementById('modal-detalle');
    const content = document.getElementById('detalle-content');
    const adjDiv = document.getElementById('adjuntos-detalle');
    const footer = modal?.querySelector('.modal-footer');
    if (!modal || !content) return;
    
    const reg = registros.find(r => r.id === id);
    if (!reg) {
      content.innerHTML = '<p style="text-align:center;padding:20px;color:var(--muted);">Registro no encontrado</p>';
      modal.classList.add('open');
      modal.style.display = 'flex';
      return;
    }
    
    const emp = empleados.find(e => e.id === reg.empleadoId);
    const nom = nominas.find(n => n.id === reg.nominaId);
    const sede = emp?.sede || reg.sede || sesion?.usuario?.sede || '—';
    
    const tipoBadge = `<span class="badge badge-${esc(reg.tipo)}">${esc(nombreTipo(reg.tipo))}</span>`;
    const estadoCls = reg.estado === 'aprobado' ? 'success' : reg.estado === 'rechazado' ? 'danger' : 'warning';
    const estadoBadge = `<span class="badge badge-${estadoCls}">${esc(reg.estado)}</span>`;
    const transporte = reg.transporte > 0 ? new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',maximumFractionDigits:0}).format(reg.transporte) : '—';
    
    content.innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px 24px;margin-bottom:20px;">
        <div><div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:4px;">Empleado</div><div style="font-size:15px;font-weight:600;">${esc(emp?.nombre||'—')}</div></div>
        <div><div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:4px;">Cargo</div><div style="font-size:15px;">${esc(emp?.cargo||'—')}</div></div>
        <div><div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:4px;">Sede</div><div style="font-size:15px;color:var(--accent);">📍 ${esc(sede)}</div></div>
        <div><div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:4px;">Fecha</div><div style="font-size:15px;">${esc(fmt(reg.fecha))}</div></div>
        <div><div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:4px;">Horas</div><div style="font-size:15px;font-weight:700;">${esc(decimalAHoraMinuto(reg.horas))}h</div></div>
        <div><div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:4px;">Tipo</div><div>${tipoBadge}</div></div>
        <div><div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:4px;">Período</div><div>${nom?`<span class="badge badge-${esc(nom.tipo)}">${esc(nom.nombre)}</span>`:'—'}</div></div>
        <div><div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:4px;">Estado</div><div>${estadoBadge}</div></div>
        <div><div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:4px;">Concepto</div><div><code style="background:var(--surface2);padding:2px 7px;border-radius:5px;font-size:13px;">${esc(reg.concepto||'—')}</code></div></div>
        <div><div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:4px;">${reg.estado === 'aprobado' || reg.estado === 'rechazado' ? 'Aprobado/Rechazado por' : 'Aprobador'}</div><div style="font-size:14px;">${reg.estado === 'aprobado' || reg.estado === 'rechazado' ? esc(usuarios.find(u=>u.id===reg.aprobadoPor)?.nombre||reg.aprobadoPor||'—') : esc(reg.aprobador||'—')}</div></div>
        <div><div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:4px;">Registrado por</div><div style="font-size:13px;color:var(--muted);">${esc(reg.nombreCreador||reg.creadoPor||'—')}</div></div>
        <div><div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:4px;">Transporte</div><div style="font-size:15px;font-weight:600;color:var(--success);">${esc(transporte)}</div></div>
      </div>
      <div style="margin-bottom:16px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:6px;">Motivo</div>
        <div style="font-size:14px;background:var(--surface2);padding:12px;border-radius:8px;">${esc(reg.motivo||'—')}</div>
      </div>
      ${reg.observaciones ? `<div style="margin-bottom:16px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:6px;">Observaciones</div>
        <div style="font-size:14px;background:var(--surface2);padding:12px;border-radius:8px;">${esc(reg.observaciones)}</div>
      </div>` : ''}
      <div id="detalle-adjuntos" style="margin-bottom:20px;">
        <div style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);margin-bottom:6px;">Adjuntos</div>
        <div id="detalle-adj-list" style="color:var(--muted);font-size:13px;">Cargando...</div>
      </div>
    `;
    
    if (adjDiv) adjDiv.style.display = 'none';
    
    if (footer) {
      footer.innerHTML = `
        ${reg.estado === 'pendiente' && hasPerm('aprobar') ? `
          <button class="btn btn-success" onclick="aprobarRegistro('${esc(reg.id)}', true); cerrarModal('modal-detalle');">✓ Aprobar</button>
          <button class="btn btn-danger" onclick="aprobarRegistro('${esc(reg.id)}', false); cerrarModal('modal-detalle');">✗ Rechazar</button>
        ` : ''}
        ${reg.estado === 'pendiente' && (hasPerm('editar') || reg.creadoPor === sesion?.usuario?.id) ? `<button class="btn btn-secondary" onclick="cerrarModal('modal-detalle');editarRegistro('${esc(reg.id)}')">✏️ Editar</button>` : ''}
        ${reg.estado !== 'pendiente' && hasPerm('revertir') ? `<button class="btn btn-secondary" onclick="cerrarModal('modal-detalle');revertirRegistro('${esc(reg.id)}')">↩️ Revertir a pendiente</button>` : ''}
        ${hasPerm('eliminar_registros') ? `<button class="btn btn-danger" onclick="eliminarRegistro('${esc(reg.id)}'); cerrarModal('modal-detalle');">🗑 Eliminar</button>` : ''}
        <button class="btn btn-secondary" onclick="cerrarModal('modal-detalle')">Cerrar</button>
      `;
    }
    
    modal.classList.add('open');
    modal.style.display = 'flex';
    modal.onclick = (e) => { if (e.target === modal) cerrarModal('modal-detalle'); };
    
    fetch(`/api/registros/${reg.id}/adjuntos`).then(r => r.json()).then(files => {
      const cont = document.getElementById('detalle-adj-list');
      if (!cont) return;
      if (!files.length) { cont.textContent = 'Sin archivos adjuntos'; return; }
      cont.innerHTML = files.map(f =>
        `<div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border);">
          <span>📎</span>
          <span onclick="descargarAdjuntoAuth('${esc(f.id)}','${esc(f.nombre)}')" style="color:var(--accent);cursor:pointer;text-decoration:underline;font-size:13px;">${esc(f.nombre)}</span>
          <span style="color:var(--muted);font-size:11px;">(${esc((f.tamano/1024).toFixed(1))} KB)</span>
        </div>`
      ).join('');
    }).catch(() => {
      const cont = document.getElementById('detalle-adj-list');
      if (cont) cont.textContent = 'Error cargando adjuntos';
    });
  } catch (e) {
    console.error('verDetalleRegistro error:', e);
  }
}

// Hide employee dropdown when clicking outside
document.addEventListener('click', (e) => {
  const wrap = document.getElementById('reg-emp-wrap');
  const dropdown = document.getElementById('reg-emp-dropdown');
  if (dropdown && wrap && !wrap.contains(e.target)) {
    dropdown.style.display = 'none';
  }
});

// ── Real-time polling for historial ──
let _histPollTimer = null;

function iniciarPollHistorial() {
  if (_histPollTimer) return;
  _histPollTimer = setInterval(async () => {
    if (window._currentPage !== 'historial') return;
    try {
      const res = await GET('/api/registros');
      if (!res.ok) return;
      const nuevos = await res.json();
      const oldJson = JSON.stringify(registros);
      if (JSON.stringify(nuevos) !== oldJson) {
        registros = nuevos;
        renderHistorial();
      }
    } catch {}
  }, 30000);
}
iniciarPollHistorial();
