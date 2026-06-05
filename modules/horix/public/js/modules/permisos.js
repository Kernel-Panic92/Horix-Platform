let permisosData = {};
let permRolSeleccionado = '';

const PERMISOS_DISPONIBLES = {
  'Páginas': ['centros','usuarios','empleados','nominas','registros','configuracion','backup','reportes','siesa','tipos'],
  'Acciones': ['aprobar','editar','revertir','eliminar_registros','eliminar_empleados','eliminar_centros','eliminar_nominas'],
  'Visibilidad': ['ver_todos','ver_sede','ver_propios']
};

const LABEL_MAP = {
  centros: 'Centros de Operación',
  usuarios: 'Usuarios',
  empleados: 'Empleados',
  nominas: 'Nóminas',
  registros: 'Registros',
  configuracion: 'Configuración',
  backup: 'Backup',
  reportes: 'Reportes',
  siesa: 'Exportar Siesa',
  tipos: 'Tipos de Hora',
  aprobar: 'Aprobar / Rechazar registros',
  editar: 'Editar registros pendientes',
  revertir: 'Revertir a pendiente',
  eliminar_registros: 'Eliminar registros',
  eliminar_empleados: 'Eliminar empleados',
  eliminar_centros: 'Eliminar centros',
  eliminar_nominas: 'Eliminar períodos de nómina',
  ver_todos: 'Ver todos los registros (sin filtro)',
  ver_sede: 'Ver solo registros de mi sede',
  ver_propios: 'Ver solo mis propios registros'
};

async function cargarPermisos() {
  try {
    const res = await fetchCSRF('/api/permisos');
    if (!res.ok) { showToast('Error al cargar permisos', 'error'); return; }
    permisosData = await res.json();
    renderTabsPermisos();
    if (permRolSeleccionado && permisosData[permRolSeleccionado]) {
      renderPermisosRol(permRolSeleccionado);
    }
  } catch (e) { showToast('Error al cargar permisos: ' + e.message, 'error'); }
}

function renderTabsPermisos() {
  const tabContainer = document.getElementById('perm-rol-tabs');
  if (!tabContainer) return;
  const roles = Object.keys(permisosData).sort();
  tabContainer.innerHTML = roles.map(r => {
    const active = permRolSeleccionado === r;
    const esSistema = ['admin','rrhh','gerencia','operador','consulta'].includes(r);
    return `<span class="badge badge-${r}" onclick="seleccionarRolPermisos('${r}')" style="cursor:pointer;padding:8px 14px;font-size:13px;border-radius:20px;transition:all 0.15s;display:inline-flex;align-items:center;gap:6px;${active ? 'outline:2px solid var(--text);outline-offset:2px;' : 'opacity:0.55;'}">
      ${rolLabel(r)}
      ${!esSistema ? `<span class="badge-delete" onclick="event.stopPropagation();eliminarRol('${r}')" title="Eliminar rol">×</span>` : ''}
    </span>`;
  }).join('');
}

function abrirModalNuevoRol() {
  document.getElementById('rol-nombre').value = '';
  const modal = document.getElementById('modal-rol');
  if (modal) { modal.classList.add('open'); modal.style.display = 'flex'; }
}

async function guardarNuevoRol() {
  const nombre = document.getElementById('rol-nombre').value.trim();
  if (!nombre) { showToast('Ingresa un nombre para el rol', 'error'); return; }
  setLoading('btn-guardar-rol', true);
  try {
    const res = await fetchCSRF('/api/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nombre })
    });
    if (!res.ok) { const d = await res.json().catch(()=>({})); showToast(d.error || 'Error al crear rol', 'error'); return; }
    const data = await res.json();
    permisosData[data.nombre] = [];
    cerrarModal('modal-rol');
    seleccionarRolPermisos(data.nombre);
    showToast(`Rol "${rolLabel(data.nombre)}" creado. Asígnale permisos.`, 'success');
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
  setLoading('btn-guardar-rol', false);
}

async function eliminarRol(rol) {
  confirmar({
    titulo: 'Eliminar Rol',
    mensaje: `¿Eliminar el rol "${rolLabel(rol)}"? Los usuarios con este rol quedarán sin acceso hasta que se les asigne otro.`,
    icono: '⚠️',
    onConfirm: async () => {
      try {
        const res = await DEL('/api/roles/' + rol);
        delete permisosData[rol];
        if (permRolSeleccionado === rol) { permRolSeleccionado = ''; }
        renderTabsPermisos();
        document.getElementById('perm-lista').innerHTML = '<div style="text-align:center;padding:60px;color:var(--muted);">Selecciona un rol para ver y editar sus permisos.</div>';
        document.getElementById('perm-footer').style.display = 'none';
        showToast('Rol eliminado.');
      } catch (e) {
        showToast(e.message, 'error');
        await cargarPermisos();
      }
    }
  });
}

function seleccionarRolPermisos(rol) {
  permRolSeleccionado = rol;
  renderTabsPermisos();
  renderPermisosRol(rol);
}

function renderPermisosRol(rol) {
  const container = document.getElementById('perm-lista');
  const footer = document.getElementById('perm-footer');
  if (!container) return;
  const actuales = permisosData[rol] || [];
  let html = '';
  for (const [cat, perms] of Object.entries(PERMISOS_DISPONIBLES)) {
    html += `<div style="margin-bottom:20px;"><div style="font-weight:700;font-size:14px;color:var(--head);margin-bottom:10px;padding-bottom:4px;border-bottom:1px solid var(--border);text-transform:uppercase;letter-spacing:0.5px;">${cat}</div><div style="display:flex;flex-direction:column;gap:6px;">`;
    perms.forEach(p => {
      const checked = actuales.includes(p) ? 'checked' : '';
      html += `<label style="display:flex;align-items:center;gap:10px;padding:8px 14px;background:var(--surface2);border-radius:8px;cursor:pointer;font-size:13px;user-select:none;border:1px solid var(--border);transition:border-color 0.15s;" onmouseover="this.style.borderColor='var(--accent)'" onmouseout="this.style.borderColor='var(--border)'">
        <input type="checkbox" data-perm-key="${p}" ${checked} style="accent-color:var(--accent);width:18px;height:18px;cursor:pointer;">
        <span>${LABEL_MAP[p] || p}</span>
      </label>`;
    });
    html += `</div></div>`;
  }
  container.innerHTML = html;
  if (footer) footer.style.display = '';
}

async function guardarPermisos() {
  if (!permRolSeleccionado) return;
  const checks = document.querySelectorAll('#perm-lista input[data-perm-key]:checked');
  const permisos = Array.from(checks).map(c => c.dataset.permKey);
  try {
    const res = await fetchCSRF('/api/permisos', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rol: permRolSeleccionado, permisos })
    });
    if (!res.ok) { const d = await res.json().catch(()=>({})); showToast(d.error || 'Error al guardar', 'error'); return; }
    permisosData[permRolSeleccionado] = permisos;
    showToast(`Permisos de "${rolLabel(permRolSeleccionado)}" actualizados. Los cambios aplican al próximo inicio de sesión.`, 'success');
  } catch (e) { showToast('Error al guardar permisos: ' + e.message, 'error'); }
}
