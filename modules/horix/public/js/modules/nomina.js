// nomina.js - Payroll periods module for Horix

function toggleNomAnio(anio) {
  if (!_nomCollapsed) return;
  _nomCollapsed[anio] = !_nomCollapsed[anio];

  const chevron = document.getElementById(`nom-chev-${anio}`);
  const body = document.getElementById(`nom-body-${anio}`);

  if (chevron) chevron.classList.toggle('collapsed');
  if (body) body.classList.toggle('collapsed');
}

function renderNomina() {
  const cont = document.getElementById('nomina-container');
  if (!cont) return;

  const nomBtns = document.getElementById('nom-btns');
  if (nomBtns) {
    const btns = nomBtns.querySelectorAll('button');
    btns.forEach(b => b.style.display = puedoEditar() ? '' : 'none');
  }

  if (!nominas.length) {
    cont.innerHTML = `<div class="table-wrap"><div class="empty"><div class="empty-icon">💼</div><div class="empty-text">No hay períodos registrados</div></div></div>`;
    return;
  }

  const ordenados  = [...nominas].sort((a, b) => a.inicio.localeCompare(b.inicio));
  const porAnio    = {};
  ordenados.forEach(n => {
    const anio = n.inicio.slice(0, 4);
    if (!porAnio[anio]) porAnio[anio] = [];
    porAnio[anio].push(n);
  });

  const anioActual = String(new Date().getFullYear());

  cont.innerHTML = Object.keys(porAnio).sort((a, b) => b - a).map(anio => {
    const lista    = porAnio[anio];
    const esActual = anio === anioActual;

    if (_nomCollapsed[anio] === undefined) _nomCollapsed[anio] = !esActual;
    const collapsed = _nomCollapsed[anio];

    const totalAnioH = lista.reduce((s, n) =>
      s + registros.filter(r => r.nominaId === n.id).reduce((ss, r) => ss + parseFloat(r.horas || 0), 0), 0);

    const filas = lista.map(n => {
      const regs   = registros.filter(r => r.nominaId === n.id);
      const totalH = regs.reduce((s, r) => s + parseFloat(r.horas || 0), 0);
      const puedeEliminar = hasPerm('eliminar_nominas');
      return `<tr>
        <td><strong>${esc(n.nombre)}</strong></td>
        <td><span class="badge badge-${esc(n.tipo)}">${esc(n.tipo)}</span></td>
        <td>${esc(fmt(n.inicio))}</td><td>${esc(fmt(n.fin))}</td>
        <td>${esc(regs.length)}</td>
        <td><strong>${esc(totalH.toFixed(1))}h</strong></td>
        <td>${puedeEliminar ? `<button class="btn btn-sm btn-outline" onclick="editarNomina('${esc(n.id)}')">✏️</button> <button class="btn btn-sm btn-danger" onclick="eliminarNomina('${esc(n.id)}')">🗑️</button>` : ''}</td>
      </tr>`;
    }).join('');

    return `<div class="table-wrap" style="margin-bottom:14px;overflow:hidden;">
      <div class="nom-anio-header table-head" style="padding:14px 20px;cursor:pointer;" onclick="toggleNomAnio('${esc(anio)}')">
        <div class="table-title" style="display:flex;align-items:center;gap:10px;">
          <span id="nom-chev-${esc(anio)}" class="nom-chevron${collapsed ? ' collapsed' : ''}">▾</span>
          📅 ${esc(anio)}
          ${esActual ? '<span style="font-size:11px;background:rgba(79,142,247,0.15);color:var(--accent);padding:2px 9px;border-radius:20px;font-weight:500;">Año actual</span>' : ''}
        </div>
        <span style="font-size:13px;color:var(--muted);">${esc(lista.length)} períodos · <strong style="color:var(--text)">${esc(totalAnioH.toFixed(1))}h</strong> totales</span>
      </div>
      <div id="nom-body-${esc(anio)}" class="nom-anio-body${collapsed ? ' collapsed' : ''}">
        <table>
          <thead><tr>
            <th>Nombre</th><th>Tipo</th><th>Inicio</th><th>Fin</th><th>Registros</th><th>Total Horas</th><th>Acciones</th>
          </tr></thead>
          <tbody>${filas}</tbody>
        </table>
      </div>
    </div>`;
  }).join('');
}

function abrirModalNomina() {
  const modal = document.getElementById('modal-nomina');
  if (!modal) return;
  modal.querySelectorAll('input, select').forEach(el => { if (el.type !== 'hidden') el.value = ''; });
  modal.classList.add('open');
  modal.style.display = 'flex';
}

function editarNomina(id) {
  const nom = nominas.find(n => n.id === id);
  if (!nom) return;

  abrirModalNomina();
  document.getElementById('nom-nombre').value = nom.nombre;
  document.getElementById('nom-tipo').value = nom.tipo;
}

async function guardarNomina() {
  const nombre = document.getElementById('nom-nombre')?.value.trim();
  const tipo = document.getElementById('nom-tipo')?.value;

  if (!nombre || !tipo) {
    showToast('Completa todos los campos', 'warning');
    return;
  }

  setLoading('btn-guardar-nom', true);

  try {
    const res = await POST('/api/nominas', { nombre, tipo });
    if (res.ok) {
      showToast('Período guardado', 'success');
      cerrarModal('modal-nomina');
      await loadAll();
      renderNomina();
    } else {
      const data = await res.json();
      showToast(data.error || 'Error al guardar', 'error');
    }
  } catch (e) {
    console.error('Save payroll period error:', e);
    showToast('Error de conexión', 'error');
  } finally {
    setLoading('btn-guardar-nom', false);
  }
}

async function eliminarNomina(id) {
  confirmar({
    titulo: 'Eliminar Período',
    mensaje: '¿Seguro que deseas eliminar este período de nómina?',
    icono: '📅',
    btnTxt: 'Eliminar',
    onConfirm: async () => {
      const res = await DEL(`/api/nominas/${id}`);
      if (res.ok) {
        showToast('Período eliminado', 'success');
        await loadAll();
        renderNomina();
      } else {
        const data = await res.json();
        showToast(data.error || 'Error al eliminar', 'error');
      }
    }
  });
}

// Populate nomina selects in historial/registration
function poblarSelectsNominas() {
  const selects = [
    document.getElementById('fil-nomina'),
    document.getElementById('reg-nomina')
  ];

  selects.forEach(sel => {
    if (!sel) return;
    const currentValue = sel.value;
    const isFilter = sel.id === 'fil-nomina';
    const filtered = nominas.filter(n => n.estado !== 'cerrado');
    let html = isFilter ? '<option value="">Todos los períodos</option>' : '<option value="">Seleccionar...</option>';
    for (let i = 0; i < filtered.length; i++) {
      html += `<option value="${esc(filtered[i].id)}">${esc(filtered[i].nombre)}</option>`;
    }
    sel.innerHTML = html;
    if (currentValue) sel.value = currentValue;
  });
}

// Generate payroll periods
function abrirModalGenerarNomina() {
  const modal = document.getElementById('modal-generar-nom');
  const anioSelect = document.getElementById('gen-anio');

  if (!modal || !anioSelect) return;

  const currentYear = new Date().getFullYear();
  let html = '';
  for (let y = currentYear + 1; y >= currentYear - 2; y--) {
    html += `<option value="${y}">${y}</option>`;
  }
  anioSelect.innerHTML = html;

  modal.classList.add('open');
  modal.style.display = 'flex';
  actualizarPreviewNomina();
}

function generarPeriodos(anio, tipo) {
  const periodos = [];
  const meses = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
                 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  if (tipo === 'mensual') {
    meses.forEach((mes, i) => {
      periodos.push({
        nombre: `${mes} ${anio}`,
        tipo: 'mensual'
      });
    });
  } else if (tipo === 'quincenal') {
    meses.forEach((mes, i) => {
      periodos.push({
        nombre: `${mes} 1 ${anio}`,
        tipo: 'quincenal'
      });
      periodos.push({
        nombre: `${mes} 2 ${anio}`,
        tipo: 'quincenal'
      });
    });
  } else if (tipo === 'semanal') {
    const startDate = new Date(anio, 0, 1);
    let weekNum = 1;
    while (startDate.getFullYear() === anio) {
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);

      if (endDate.getFullYear() > anio) {
        endDate.setFullYear(anio, 11, 31);
      }

      periodos.push({
        nombre: `Semana ${weekNum} ${anio}`,
        tipo: 'semanal',
        inicio: startDate.toISOString().slice(0, 10),
        fin: endDate.toISOString().slice(0, 10)
      });

      startDate.setDate(startDate.getDate() + 7);
      weekNum++;
    }
  }

  return periodos;
}

function actualizarPreviewNomina() {
  const anio = document.getElementById('gen-anio')?.value;
  const tipo = document.getElementById('gen-tipo')?.value;
  const preview = document.getElementById('gen-preview');

  if (!preview || !anio || !tipo) return;

  const periodos = generarPeriodos(anio, tipo);
  preview.innerHTML = `<strong>Se generarán ${periodos.length} períodos:</strong><br>`;
  periodos.slice(0, 5).forEach(p => {
    preview.innerHTML += `• ${p.nombre}<br>`;
  });
  if (periodos.length > 5) {
    preview.innerHTML += `... y ${periodos.length - 5} más`;
  }
}

async function confirmarGenerarNomina() {
  const anio = document.getElementById('gen-anio')?.value;
  const tipo = document.getElementById('gen-tipo')?.value;

  if (!anio || !tipo) {
    showToast('Selecciona año y tipo', 'warning');
    return;
  }

  const periodos = generarPeriodos(anio, tipo);

  if (!confirm(`¿Generar ${periodos.length} períodos de nómina para ${anio}?`)) return;

  setLoading('btn-confirmar-generar', true);

  try {
    const res = await POST('/api/nominas/generar', { anio, tipo, periodos });
    if (res.ok) {
      showToast('Períodos generados exitosamente', 'success');
      cerrarModal('modal-generar-nom');
      await loadAll();
      renderNomina();
    } else {
      const data = await res.json();
      showToast(data.error || 'Error al generar', 'error');
    }
  } catch (e) {
    console.error('Generate payroll error:', e);
    showToast('Error de conexión', 'error');
  } finally {
    setLoading('btn-confirmar-generar', false);
  }
}
