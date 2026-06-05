// users.js - User management module for Horix

let _empAsigSeleccionados = new Set();

const ROL_DESC = {
  admin:    'Acceso total',
  rrhh:     'Registrar y editar',
  gerencia: 'Aprobar registros',
  operador: 'Ver su sede',
  consulta: 'Solo lectura'
};

let _rolesCache = null;

async function poblarRolesUsuarios() {
  if (_rolesCache) { aplicarRolesDropdowns(_rolesCache); return; }
  try {
    const res = await fetchCSRF('/api/roles');
    if (!res.ok) return;
    _rolesCache = await res.json();
    aplicarRolesDropdowns(_rolesCache);
  } catch {}
}

function aplicarRolesDropdowns(roles) {
  const filRol = document.getElementById('usr-fil-rol');
  const modalRol = document.getElementById('usr-rol');
  const actualFil = filRol?.value || '';
  const actualModal = modalRol?.value || '';
  if (filRol) {
    filRol.innerHTML = '<option value="">Todos los roles</option>' + roles.map(r => `<option value="${r}">${rolLabel(r)}</option>`).join('');
    if (actualFil) filRol.value = actualFil;
  }
  if (modalRol) {
    modalRol.innerHTML = roles.map(r => `<option value="${r}">${rolLabel(r)}${ROL_DESC[r] ? ' — ' + ROL_DESC[r] : ''}</option>`).join('');
    if (actualModal) modalRol.value = actualModal;
  }
}

function renderUsuarios() {
  poblarSedesUsuarios();
  poblarRolesUsuarios();
  const tbody = document.getElementById('usuarios-body');
  if (!tbody) return;

  const q = (document.getElementById('usr-buscar')?.value || '').toLowerCase();
  const filRol = document.getElementById('usr-fil-rol')?.value || '';
  const filSede = document.getElementById('usr-fil-sede')?.value || '';
  const filEstado = document.getElementById('usr-fil-estado')?.value || '';

  let data = usuarios;
  if (q) data = data.filter(u => u.nombre.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  if (filRol) data = data.filter(u => u.rol === filRol);
  if (filSede) data = data.filter(u => u.sede === filSede);
  if (filEstado !== '') data = data.filter(u => String(u.activo) === filEstado);

  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty"><div class="empty-icon">🔐</div><div class="empty-text">No hay usuarios</div></div></td></tr>';
    return;
  }
  tbody.innerHTML = data.map(u => `<tr>
    <td data-label="Nombre"><strong>${esc(u.nombre)}</strong></td>
    <td data-label="Email">${esc(u.email)}</td>
    <td data-label="Rol"><span class="badge badge-${esc(u.rol)}">${esc(rolLabel(u.rol))}</span></td>
    <td data-label="Sede"><span style="font-size:12px;color:var(--accent)">📍 ${esc(u.sede||'—')}</span></td>
    <td data-label="Estado"><span class="badge badge-${u.activo?'activo':'inactivo'}">${u.activo?'Activo':'Inactivo'}</span></td>
    <td data-label="Creado">${esc(fmtDate(u.creado))}</td>
    <td data-label="Acciones"><div class="actions-cell">
      <button class="btn btn-secondary btn-sm" onclick="editarUsuario('${esc(u.id)}')">✏ Editar</button>
      <button class="btn btn-secondary btn-sm" onclick="enviarResetPassword('${esc(u.id)}', this)">🔑 Reset</button>
      ${u.id !== sesion?.usuario?.id ? '<button class="btn btn-danger btn-sm" onclick="eliminarUsuario(\'' + esc(u.id) + '\')">🗑</button>' : ''}
    </div></td>
  </tr>`).join('');
}

function renderEmpModal(filtro = '') {
  const q = filtro.toLowerCase();
  const lista = q
    ? empleados.filter(e =>
        e.nombre.toLowerCase().includes(q) ||
        (e.cargo||'').toLowerCase().includes(q) ||
        (e.sede||'').toLowerCase().includes(q)
      )
    : empleados;

  const container = document.getElementById('usr-emp-list');
  if (!container) return;

  if (!lista.length) {
    container.innerHTML = '<div style="text-align:center;color:var(--muted);font-size:12px;padding:12px;">Sin resultados</div>';
    return;
  }
  container.innerHTML = lista.map(e => {
    const checked = _empAsigSeleccionados.has(e.id);
    return `<label style="display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:7px;cursor:pointer;transition:background 0.1s;" onmouseover="this.style.background='var(--border)'" onmouseout="this.style.background='transparent'">
      <input type="checkbox" value="${esc(e.id)}" ${checked?'checked':''} onchange="toggleEmpAsig('${esc(e.id)}',this.checked)"
        style="width:15px;height:15px;accent-color:var(--accent);cursor:pointer;flex-shrink:0;">
      <span style="flex:1;min-width:0;">
        <span style="font-size:13px;font-weight:500;">${esc(e.nombre)}</span>
        <span style="font-size:11px;color:var(--muted);margin-left:6px;">${esc(e.cargo||'')} · 📍${esc(e.sede||'')}</span>
      </span>
    </label>`;
  }).join('');
  actualizarContadorEmp();
}

function toggleEmpAsig(id, checked) {
  if (checked) _empAsigSeleccionados.add(id);
  else         _empAsigSeleccionados.delete(id);
  actualizarContadorEmp();
}

function filtrarEmpModal() {
  const q = document.getElementById('usr-emp-search')?.value || '';
  renderEmpModal(q);
}

function seleccionarTodosEmp(sel) {
  if (sel) empleados.forEach(e => _empAsigSeleccionados.add(e.id));
  else     _empAsigSeleccionados.clear();
  renderEmpModal(document.getElementById('usr-emp-search')?.value || '');
}

function actualizarContadorEmp() {
  const n = _empAsigSeleccionados.size;
  const el = document.getElementById('usr-emp-count');
  if (el) el.textContent = n > 0 ? `${n} seleccionado${n>1?'s':''}` : 'Sin restricción';
}

function abrirModalUsuario(id = null) {
  editUsrId = id;
  document.getElementById('modal-usr-title').textContent = id ? 'Editar Usuario' : 'Nuevo Usuario';
  const passGroup = document.getElementById('usuario-password-group');
  const activoGroup = document.getElementById('usr-activo-group');

  if (id) {
    const u = usuarios.find(u => u.id === id);
    document.getElementById('usr-nombre').value = u.nombre;
    document.getElementById('usr-email').value = u.email;
    document.getElementById('usr-rol').value = u.rol;
    document.getElementById('usr-sede').value = u.sede || '';
    document.getElementById('usr-activo').value = u.activo ? '1' : '0';
    if (passGroup) passGroup.style.display = 'none';
    if (activoGroup) activoGroup.style.display = 'flex';
  } else {
    ['usr-nombre','usr-email'].forEach(i => { const el = document.getElementById(i); if (el) el.value = ''; });
    document.getElementById('usr-rol').value = 'operador';
    document.getElementById('usr-sede').value = '';
    if (passGroup) passGroup.style.display = 'block';
    if (activoGroup) activoGroup.style.display = 'none';
  }

  _empAsigSeleccionados = new Set();
  const searchEl = document.getElementById('usr-emp-search');
  if (searchEl) searchEl.value = '';

  if (id) {
    GET('/api/usuarios/' + id + '/empleados').then(res => {
      if (res.ok) return res.json();
      return [];
    }).then(lista => {
      _empAsigSeleccionados = new Set(lista);
      renderEmpModal();
    }).catch(() => renderEmpModal());
  } else {
    renderEmpModal();
  }

  document.getElementById('modal-usuario').classList.add('open');
  document.getElementById('modal-usuario').style.display = 'flex';
}

function editarUsuario(id) {
  abrirModalUsuario(id);
}

async function guardarUsuario() {
  const nombre = document.getElementById('usr-nombre')?.value.trim();
  const email = document.getElementById('usr-email')?.value.trim();
  const rol = document.getElementById('usr-rol')?.value;
  const sede = document.getElementById('usr-sede')?.value;
  const activo = document.getElementById('usr-activo')?.value === '1';

  if (!nombre || !email || !rol || !sede) {
    showToast('Completa todos los campos incluyendo sede.', 'error');
    return;
  }

  setLoading('btn-guardar-usr', true);

  try {
    let idGuardado = editUsrId;
    if (editUsrId) {
      await PUT('/api/usuarios/' + editUsrId, { nombre, email, rol, sede, activo });
    } else {
      const res = await POST('/api/usuarios', { nombre, email, rol, sede });
      const data = await res.json();
      if (!res.ok) { showToast(data.error || 'Error al crear', 'error'); setLoading('btn-guardar-usr', false); return; }
      idGuardado = data.id;
    }
    if (idGuardado) {
      await PUT('/api/usuarios/' + idGuardado + '/empleados', { empleados: [..._empAsigSeleccionados] });
    }
    cerrarModal('modal-usuario');
    await loadAll();
    renderUsuarios();
    showToast(editUsrId ? 'Usuario actualizado.' : 'Usuario creado. Se envió correo de bienvenida.');
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    setLoading('btn-guardar-usr', false);
  }
}

async function eliminarUsuario(id) {
  confirmar({
    titulo: 'Eliminar Usuario',
    mensaje: '¿Estás seguro de que deseas eliminar este usuario? Perderá acceso al sistema de forma permanente.',
    icono: '🔐',
    onConfirm: async () => {
      const res = await DEL('/api/usuarios/' + id);
      if (res.ok) { await loadAll(); renderUsuarios(); showToast('Usuario eliminado.'); }
      else { const d = await res.json(); showToast(d.error || 'Error', 'error'); }
    }
  });
}

async function enviarResetPassword(id, btn) {
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Enviando...'; }
  try {
    const res = await POST('/api/usuarios/' + id + '/reset-password', {});
    if (res.ok) showToast('Correo de recuperación enviado.');
    else { const d = await res.json(); showToast(d.error || 'Error', 'error'); }
  } catch (e) {
    showToast(e.message, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '🔑 Reset'; }
  }
}

function filtrarUsuarios() {
  renderUsuarios();
}

function limpiarFiltrosUsuario() {
  ['usr-buscar','usr-fil-rol','usr-fil-sede','usr-fil-estado'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  renderUsuarios();
}

// Poblar dropdown de sedes desde centros global
function poblarSedesUsuarios() {
  const sel = document.getElementById('usr-fil-sede');
  if (!sel) return;
  const actual = sel.value;
  sel.innerHTML = '<option value="">Todas las sedes</option>';
  if (centros && centros.length) {
    centros.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.nombre;
      opt.textContent = c.nombre;
      if (c.nombre === actual) opt.selected = true;
      sel.appendChild(opt);
    });
  }
}


