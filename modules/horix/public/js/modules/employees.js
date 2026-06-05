// employees.js - Employees & Centers module for Horix

let _empFiltroCorruptos = false;
let _empCorruptosIds = new Set();

async function renderEmpleados() {
  const search = document.getElementById('emp-search');
  if (search) search.value = '';
  _empFiltroCorruptos = false;
  // Fetch corrupted employees list (admin only)
  if (soyAdmin()) {
    try {
      const res = await GET('/api/empleados/corruptos');
      if (res.ok) {
        const lista = await res.json();
        _empCorruptosIds = new Set(lista.map(e => e.id));
        actualizarBannerCorruptos();
      }
    } catch (e) { /* ignore */ }
  }
  buscarEmpleados();
}

function actualizarBannerCorruptos() {
  const banner = document.getElementById('emp-corruptos-banner');
  const msg = document.getElementById('emp-corruptos-msg');
  if (!banner || !msg) return;
  const n = _empCorruptosIds.size;
  if (n > 0 && soyAdmin()) {
    banner.style.display = 'flex';
    msg.textContent = `⚠️ ${n} empleado${n > 1 ? 's' : ''} con caracteres corruptos (�) en el nombre. Edítalo${n > 1 ? 's' : ''} para corregirl${n > 1 ? 'os' : 'o'}.`;
  } else {
    banner.style.display = 'none';
  }
}

function filtrarCorruptos() {
  _empFiltroCorruptos = !_empFiltroCorruptos;
  const btn = document.querySelector('#emp-corruptos-banner button');
  if (btn) btn.textContent = _empFiltroCorruptos ? 'Mostrar todos' : 'Mostrar afectados';
  buscarEmpleados();
}

function limpiarFiltroEmpleados() {
  const buscarInput = document.getElementById('emp-search');
  if (buscarInput) buscarInput.value = '';
  buscarEmpleados();
}

function buscarEmpleados() {
  const q = (document.getElementById('emp-search')?.value || '').toLowerCase().trim();
  let lista = q
    ? empleados.filter(e =>
        e.nombre.toLowerCase().includes(q) ||
        (e.cargo||'').toLowerCase().includes(q) ||
        (e.departamento||'').toLowerCase().includes(q) ||
        (e.sede||'').toLowerCase().includes(q) ||
        (e.email||'').toLowerCase().includes(q) ||
        (e.cedula||'').toLowerCase().includes(q)
      )
    : empleados;
  if (_empFiltroCorruptos && _empCorruptosIds.size) {
    lista = lista.filter(e => _empCorruptosIds.has(e.id));
  }

  const grid = document.getElementById('emp-grid');
  if (!grid) return;

  const countEl = document.getElementById('emp-count');
  if (countEl) {
    countEl.textContent = q
      ? `${lista.length} de ${empleados.length} empleados`
      : `${empleados.length} empleados`;
  }

  const btnNuevo = document.getElementById('btn-nuevo-emp');
  if (btnNuevo) btnNuevo.style.display = puedoEditar() ? '' : 'none';
  const btnImp = document.getElementById('btn-importar-emp');
  if (btnImp) btnImp.style.display = soyAdmin() ? '' : 'none';
  const permBanner = document.getElementById('emp-perm-banner');
  if (permBanner) permBanner.classList.toggle('show', !puedoEditar());

  if (!lista.length) {
    grid.innerHTML = q
      ? '<div class="empty" style="grid-column:1/-1"><div class="empty-icon">🔍</div><div class="empty-text">Sin resultados para "' + esc(q) + '"</div></div>'
      : '<div class="empty" style="grid-column:1/-1"><div class="empty-icon">👤</div><div class="empty-text">No hay empleados registrados</div></div>';
    return;
  }

  // No renderizar más de 200 empleados a la vez — el resto requiere búsqueda
  const _empMaxRenderSinBusqueda = 200;
  const sinBusqueda = !q && !_empFiltroCorruptos;
  if (sinBusqueda && lista.length > _empMaxRenderSinBusqueda) {
    lista = lista.slice(0, _empMaxRenderSinBusqueda);
    setTimeout(() => {
      const msg = document.getElementById('emp-search-msg');
      if (msg) msg.textContent = `Mostrando los primeros ${_empMaxRenderSinBusqueda} empleados. Escribí para filtrar.`;
    }, 0);
  } else {
    const msg = document.getElementById('emp-search-msg');
    if (msg) msg.textContent = '';
  }

  // Pre-computar stats por empleado (O(N) en vez de O(N*M))
  const empStats = {};
  const t0 = performance.now();
  registros.forEach(r => {
    if (!empStats[r.empleadoId]) empStats[r.empleadoId] = { horas: 0, count: 0 };
    empStats[r.empleadoId].horas += parseFloat(r.horas || 0);
    empStats[r.empleadoId].count += 1;
  });


  grid.innerHTML = lista.map(e => {
    const initials = esc(e.nombre).split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
    const stats = empStats[e.id] || { horas: 0, count: 0 };
    const acciones = puedoEditar()
      ? '<button class="btn btn-secondary btn-sm" onclick="editarEmpleado(\'' + esc(e.id) + '\')">✏ Editar</button>' +
        (hasPerm('eliminar_empleados') ? '<button class="btn btn-danger btn-sm" onclick="eliminarEmpleado(\'' + esc(e.id) + '\')">🗑</button>' : '')
      : '<span style="font-size:12px;color:var(--muted)">Solo lectura</span>';

    return '<div class="emp-card">'
      + '<div class="emp-avatar" style="background:' + esc(empColor(e.nombre)) + '">' + esc(initials) + '</div>'
      + '<div class="emp-name">' + esc(e.nombre) + (_empCorruptosIds.has(e.id) ? ' <span style="color:var(--danger);font-size:11px;" title="Nombre con caracteres corruptos">⚠️</span>' : '') + '</div>'
      + '<div class="emp-dept">' + esc(e.cargo || '') + ' · ' + esc(e.departamento || '') + '</div>'
      + '<div style="font-size:11px;color:var(--accent);margin-top:2px;">📍 ' + esc(e.sede || '—') + '</div>'
      + '<div style="font-size:11px;color:var(--muted);margin-top:2px;">🔗 ' + esc(e.tipo_vinculacion || 'vinculado') + '</div>'
      + '<div class="emp-stats">'
      + '<div class="emp-stat"><strong>' + esc(stats.horas.toFixed(1)) + '</strong>Total Horas</div>'
      + '<div class="emp-stat"><strong>' + esc(stats.count) + '</strong>Registros</div>'
      + '</div>'
      + (e.email ? '<div style="font-size:12px;color:var(--muted);margin-top:8px;">✉ ' + esc(e.email) + '</div>' : '')
      + '<div class="emp-actions">' + acciones + '</div>'
      + '</div>';
  }).join('');
}

function abrirModalEmpleado(id = null) {
  const modal = document.getElementById('modal-empleado');
  const titulo = document.getElementById('modal-emp-title');

  if (!modal || !titulo) return;

  editEmpId = id;
  titulo.textContent = id ? 'Editar Empleado' : 'Nuevo Empleado';

  if (id) {
    const e = empleados.find(e => e.id === id);
    if (e) {
      document.getElementById('emp-nombre').value = e.nombre;
      document.getElementById('emp-cedula').value = e.cedula;
      document.getElementById('emp-cargo').value = e.cargo || '';
      document.getElementById('emp-depto').value = e.departamento || '';
      document.getElementById('emp-email').value = e.email || '';
      document.getElementById('emp-tel').value = e.telefono || '';
      document.getElementById('emp-sede').value = e.sede || '';
      document.getElementById('emp-tipo-vinculacion').value = e.tipo_vinculacion || 'vinculado';
    }
  } else {
    ['emp-nombre','emp-cedula','emp-cargo','emp-depto','emp-email','emp-tel']
      .forEach(i => { const el = document.getElementById(i); if (el) el.value = ''; });
    document.getElementById('emp-sede').value = '';
    document.getElementById('emp-tipo-vinculacion').value = 'vinculado';
  }

  modal.classList.add('open');
  modal.style.display = 'flex';
}

function editarEmpleado(id) {
  abrirModalEmpleado(id);
}

async function guardarEmpleado() {
  const nombre = document.getElementById('emp-nombre').value.trim();
  const cedula = document.getElementById('emp-cedula').value.trim();
  const cargo  = document.getElementById('emp-cargo').value.trim();
  const depto  = document.getElementById('emp-depto').value.trim();
  const email  = document.getElementById('emp-email').value.trim();
  const tel    = document.getElementById('emp-tel').value.trim();
  const sede   = document.getElementById('emp-sede').value;
  const tipoVinculacion = document.getElementById('emp-tipo-vinculacion')?.value || 'vinculado';

  if (!nombre || !cedula || !cargo || !depto || !sede) {
    showToast('Completa los campos obligatorios incluyendo sede.', 'error');
    return;
  }

  setLoading('btn-guardar-emp', true);
  try {
    const body = { nombre, cedula, cargo, departamento: depto, sede, email, telefono: tel, tipo_vinculacion: tipoVinculacion };
    if (editEmpId) await PUT('/api/empleados/' + editEmpId, body);
    else           await POST('/api/empleados', body);
    cerrarModal('modal-empleado');
    await loadAll();
    renderEmpleados();
    showToast(editEmpId ? 'Empleado actualizado.' : 'Empleado registrado.');
  } catch (e) {
    showToast(e.message, 'error');
  }
  setLoading('btn-guardar-emp', false);
}

async function eliminarEmpleado(id) {
  confirmar({
    titulo: 'Eliminar Empleado',
    mensaje: '¿Estás seguro de que deseas eliminar este empleado? También se eliminarán todos sus registros de horas extra.',
    icono: '👤',
    onConfirm: async () => {
      try {
        await DEL('/api/empleados/' + id);
        await loadAll();
        renderEmpleados();
        showToast('Empleado eliminado.');
      } catch (e) {
        showToast(e.message, 'error');
      }
    }
  });
}

// Centers management
function poblarSelectsCentros() {
  const selects = [
    document.getElementById('emp-sede'),
    document.getElementById('usr-sede'),
    document.getElementById('reg-sede'),
    document.getElementById('fil-sede'),
    document.getElementById('rpt-sede')
  ];

  selects.forEach(sel => {
    if (!sel) return;
    const currentValue = sel.value;
    const isFilter = sel.id.includes('filtro') || sel.id.includes('fil-') || sel.id === 'rpt-sede';
    const filtered = centros.filter(c => c.activo);
    let html = isFilter ? '<option value="">Todos</option>' : '';
    for (let i = 0; i < filtered.length; i++) {
      html += '<option value="' + esc(filtered[i].nombre) + '">' + esc(filtered[i].nombre) + '</option>';
    }
    sel.innerHTML = html;
    if (currentValue) sel.value = currentValue;
  });
}

function renderCentros() {
  const tbody = document.getElementById('centros-body');
  if (!tbody) return;
  if (!centros.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:32px;">No hay centros registrados</td></tr>';
    return;
  }
  const rows = [];
  centros.forEach(function(c) {
    const empsCount = empleados.filter(function(e){ return e.sede === c.nombre; }).length;
    const estadoBadge = c.activo
      ? '<span style="background:rgba(79,190,150,0.15);color:#4fbe96;border-radius:6px;padding:2px 10px;font-size:11px;font-weight:700;">ACTIVO</span>'
      : '<span style="background:rgba(247,97,79,0.12);color:var(--danger);border-radius:6px;padding:2px 10px;font-size:11px;font-weight:700;">INACTIVO</span>';
    const fecha = c.creado ? new Date(c.creado).toLocaleDateString('es-CO') : '-';
    const puedeEliminar = empsCount === 0 && hasPerm('eliminar_centros');
    let acciones = '';
    if (puedoEditar()) {
      acciones += '<button class="btn btn-secondary btn-sm centro-btn-editar" data-id="' + esc(c.id) + '">✏️ Editar</button> ';
    }
    if (puedeEliminar) {
      acciones += '<button class="btn btn-sm centro-btn-eliminar" data-id="' + esc(c.id) + '" data-nombre="' + esc(c.nombre) + '" style="background:rgba(247,97,79,0.1);color:var(--danger);border:1px solid rgba(247,97,79,0.3);">🗑️ Eliminar</button>';
    }
    rows.push(
       '<tr>' +
       '<td data-label="Nombre" style="font-weight:600;">' + esc(c.nombre) + '</td>' +
       '<td data-label="Estado">' + estadoBadge + '</td>' +
       '<td data-label="Creado" style="color:var(--muted);font-size:13px;">' + esc(fecha) + '</td>' +
       '<td data-label="Empleados" style="color:var(--muted);">' + esc(empsCount) + ' empleado' + (empsCount !== 1 ? 's' : '') + '</td>' +
       '<td data-label="Acciones"><div style="display:flex;gap:8px;">' + acciones + '</div></td>' +
       '</tr>'
     );
  });
  tbody.innerHTML = rows.join('');

  tbody.querySelectorAll('.centro-btn-editar').forEach(function(btn) {
    btn.addEventListener('click', function() { editarCentro(this.dataset.id); });
  });
  tbody.querySelectorAll('.centro-btn-eliminar').forEach(function(btn) {
    btn.addEventListener('click', function() {
      eliminarCentro(this.dataset.id, this.dataset.nombre);
    });
  });
}

function abrirModalCentro() {
  document.getElementById('centro-id').value = '';
  document.getElementById('centro-nombre').value = '';
  document.getElementById('centro-activo-group').style.display = 'none';
  document.getElementById('modal-centro-title').textContent = 'Nuevo Centro de Operación';
  document.getElementById('modal-centro').classList.add('open');
  document.getElementById('modal-centro').style.display = 'flex';
}

function editarCentro(id) {
  const c = centros.find(x => x.id === id);
  if (!c) return;
  document.getElementById('centro-id').value = id;
  document.getElementById('centro-nombre').value = c.nombre;
  document.getElementById('centro-activo').value = c.activo ? '1' : '0';
  document.getElementById('centro-activo-group').style.display = '';
  document.getElementById('modal-centro-title').textContent = 'Editar Centro de Operación';
  document.getElementById('modal-centro').classList.add('open');
  document.getElementById('modal-centro').style.display = 'flex';
}

async function guardarCentro() {
  const id     = document.getElementById('centro-id').value;
  const nombre = document.getElementById('centro-nombre').value.trim();
  const activo = document.getElementById('centro-activo').value;
  if (!nombre) { showToast('El nombre es requerido', 'error'); return; }
  const body = { nombre, activo: activo === '1' };
  setLoading('btn-guardar-centro', true);
  try {
    const res = id
      ? await PUT('/api/centros/' + id, body)
      : await POST('/api/centros', body);
    if (!res.ok) { const d = await res.json(); showToast(d.error || 'Error al guardar', 'error'); return; }
    cerrarModal('modal-centro');
    showToast(id ? 'Centro actualizado' : 'Centro creado', 'success');
    await loadAll();
    renderCentros();
    poblarSelectsCentros();
  } catch(e) { showToast(e.message, 'error'); }
  setLoading('btn-guardar-centro', false);
}

async function eliminarCentro(id, nombre) {
  confirmar({
    titulo: 'Eliminar Centro',
    mensaje: '¿Estás seguro de eliminar el centro <strong>' + esc(nombre) + '</strong>?',
    icono: '🏢',
    btnTxt: 'Eliminar',
    onConfirm: async () => {
      const res = await DEL('/api/centros/' + id);
      if (!res.ok) { const d = await res.json(); showToast(d.error || 'Error al eliminar', 'error'); return; }
      showToast('Centro eliminado', 'success');
      await loadAll();
      renderCentros();
      poblarSelectsCentros();
    }
  });
}
