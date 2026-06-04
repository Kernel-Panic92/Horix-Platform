let jwtToken = localStorage.getItem('platform_jwt');
let user = null;

const MODULES = [
  {
    id: 'horix',
    name: 'Horix',
    icon: '\u23f0',
    desc: 'Horas extra y empleados',
    url: PLATFORM_CONFIG.horixUrl,
  },
  {
    id: 'docflow',
    name: 'DocFlow',
    icon: '\ud83d\udcc4',
    desc: 'Facturas y proveedores',
    url: PLATFORM_CONFIG.docflowUrl,
  }
];

function show(id) {
  ['login-screen', 'launcher-screen', 'admin-screen', 'admin-form-overlay'].forEach(s => {
    document.getElementById(s).style.display = s === id ? 'block' : 'none';
  });
}

function showError(el, msg) {
  el.textContent = msg;
  el.classList.add('show');
}

async function login() {
  const email = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  const btn = document.getElementById('login-btn');
  const errEl = document.getElementById('login-error');

  if (!email || !password) {
    showError(errEl, 'Ingresa usuario y contrase\u00f1a');
    return;
  }

  errEl.classList.remove('show');
  btn.disabled = true;
  btn.textContent = 'Ingresando...';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Credenciales inv\u00e1lidas');
    }

    const data = await res.json();
    jwtToken = data.jwt;
    user = data.usuario;

    localStorage.setItem('platform_jwt', jwtToken);
    showLauncher();
  } catch (e) {
    showError(errEl, e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Ingresar';
  }
}

function showLauncher() {
  document.getElementById('launcher-user').textContent = user?.nombre || '';
  document.getElementById('launcher-role').textContent = user?.rol || '';

  const grid = document.getElementById('module-grid');
  grid.innerHTML = '';

  MODULES.forEach(mod => {
    const card = document.createElement('a');
    card.className = 'card';
    card.href = mod.url;
    card.target = '_blank';
    card.rel = 'noopener';
    card.innerHTML = `
      <div class="card-icon">${mod.icon}</div>
      <div class="card-title">${mod.name}</div>
      <div class="card-desc">${mod.desc}</div>
    `;
    grid.appendChild(card);
  });

  if (user?.rol === 'admin') {
    const adminCard = document.createElement('div');
    adminCard.className = 'card';
    adminCard.onclick = showAdmin;
    adminCard.innerHTML = `
      <div class="card-icon">&#9881;</div>
      <div class="card-title">Admin</div>
      <div class="card-desc">Gestionar usuarios</div>
    `;
    grid.appendChild(adminCard);
  }

  show('launcher-screen');
}

function logout() {
  localStorage.removeItem('platform_jwt');
  jwtToken = null;
  user = null;
  show('login-screen');
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
}

// ── Admin ──
function showAdmin() {
  document.getElementById('admin-header-user').textContent = user?.nombre || '';
  show('admin-screen');
  loadUsers();
}

async function loadUsers() {
  try {
    const res = await fetch('/api/admin/usuarios', {
      headers: { 'Authorization': 'Bearer ' + jwtToken }
    });
    if (!res.ok) throw new Error('Error al cargar usuarios');
    const users = await res.json();
    const tbody = document.querySelector('#users-table tbody');
    tbody.innerHTML = users.map(u => `
      <tr>
        <td>${u.id}</td>
        <td>${u.nombre}</td>
        <td>${u.email}</td>
        <td><span class="badge badge-${u.rol}">${u.rol}</span></td>
        <td>${u.activo ? '<span style="color:var(--success);">Activo</span>' : '<span class="badge badge-inactivo">Inactivo</span>'}</td>
        <td class="actions">
          <button class="btn btn-sm" onclick="editUser(${u.id})">Editar</button>
          ${u.activo ? `<button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id})">Desactivar</button>` : ''}
        </td>
      </tr>
    `).join('');
  } catch (e) {
    alert(e.message);
  }
}

function showUserForm(data) {
  document.getElementById('form-user-id').value = data?.id || '';
  document.getElementById('form-nombre').value = data?.nombre || '';
  document.getElementById('form-email').value = data?.email || '';
  document.getElementById('form-password').value = '';
  document.getElementById('form-rol').value = data?.rol || 'comprador';
  document.getElementById('form-title').textContent = data?.id ? 'Editar usuario' : 'Nuevo usuario';
  document.getElementById('form-submit-btn').textContent = data?.id ? 'Guardar cambios' : 'Crear usuario';
  document.getElementById('form-error').classList.remove('show');
  document.getElementById('admin-form-overlay').style.display = 'block';
}

function closeForm() {
  document.getElementById('admin-form-overlay').style.display = 'none';
}

async function saveUser() {
  const id = document.getElementById('form-user-id').value;
  const nombre = document.getElementById('form-nombre').value.trim();
  const email = document.getElementById('form-email').value.trim();
  const password = document.getElementById('form-password').value;
  const rol = document.getElementById('form-rol').value;
  const errEl = document.getElementById('form-error');

  if (!nombre || !email || !rol) {
    showError(errEl, 'Completa los campos requeridos');
    return;
  }
  if (!id && !password) {
    showError(errEl, 'Contraseña requerida para nuevo usuario');
    return;
  }

  try {
    const method = id ? 'PUT' : 'POST';
    const url = id ? `/api/admin/usuarios/${id}` : '/api/admin/usuarios';
    const body = { nombre, email, rol };
    if (password) body.password = password;

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwtToken },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Error al guardar');
    }

    closeForm();
    loadUsers();
  } catch (e) {
    showError(errEl, e.message);
  }
}

function editUser(id) {
  const row = document.querySelector(`#users-table tbody tr:nth-child(${id})`);
  fetch('/api/admin/usuarios', {
    headers: { 'Authorization': 'Bearer ' + jwtToken }
  }).then(r => r.json()).then(users => {
    const u = users.find(x => x.id === id);
    if (u) showUserForm(u);
  });
}

async function deleteUser(id) {
  if (!confirm('¿Desactivar este usuario?')) return;
  try {
    const res = await fetch(`/api/admin/usuarios/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + jwtToken }
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Error al desactivar');
    }
    loadUsers();
  } catch (e) {
    alert(e.message);
  }
}

// ── Session check ──
(async () => {
  if (jwtToken) {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': 'Bearer ' + jwtToken }
      });
      if (res.ok) {
        const data = await res.json();
        user = data;
        showLauncher();
        return;
      }
    } catch {}
    localStorage.removeItem('platform_jwt');
  }
  show('login-screen');
})();
