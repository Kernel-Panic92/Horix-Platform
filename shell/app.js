// shell/app.js — Login + Launcher (SSO unificado)
let token = localStorage.getItem('platform_token');
let jwtToken = localStorage.getItem('platform_jwt');
let user = null;

// Module definitions with permission requirements
const MODULES = [
  {
    id: 'horix',
    name: 'Horas Extra',
    icon: '\u23f0',
    desc: 'Control de horas extra y empleados',
    url: PLATFORM_CONFIG.horixUrl,
    checkAccess: (user) => user?.rol != null
  },
  {
    id: 'docflow',
    name: 'Facturas',
    icon: '\ud83d\udcc4',
    desc: 'Gesti\u00f3n de facturas y proveedores',
    url: PLATFORM_CONFIG.docflowUrl,
    checkAccess: (user) => user?.docflowRol != null
  }
];

function show(id) {
  document.getElementById('login-screen').style.display = id === 'login' ? 'block' : 'none';
  document.getElementById('launcher-screen').style.display = id === 'launcher' ? 'block' : 'none';
}

async function login() {
  const email = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  const btn = document.getElementById('login-btn');
  const errEl = document.getElementById('login-error');

  if (!email || !password) {
    errEl.textContent = 'Ingresa usuario y contrase\u00f1a';
    errEl.classList.add('show');
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
      throw new Error(data.error || data.message || 'Credenciales inv\u00e1lidas');
    }

    const data = await res.json();
    token = data.token;
    jwtToken = data.jwt;
    user = data.usuario;

    localStorage.setItem('platform_token', token);
    localStorage.setItem('platform_jwt', jwtToken);
    showLauncher();
  } catch (e) {
    errEl.textContent = e.message;
    errEl.classList.add('show');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Ingresar';
  }
}

function showLauncher() {
  document.getElementById('launcher-user').textContent = user?.nombre || '';
  const role = user?.rol || '';
  document.getElementById('launcher-role').textContent = role;

  const grid = document.getElementById('module-grid');
  grid.innerHTML = '';

  MODULES.forEach(mod => {
    if (!mod.checkAccess(user)) return;
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

  show('launcher');
}

function logout() {
  localStorage.removeItem('platform_token');
  localStorage.removeItem('platform_jwt');
  token = null;
  jwtToken = null;
  user = null;
  show('login');
  document.getElementById('login-user').value = '';
  document.getElementById('login-pass').value = '';
}

// Check existing session
(async () => {
  if (jwtToken) {
    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': 'Bearer ' + jwtToken }
      });
      if (res.ok) {
        const data = await res.json();
        user = {
          nombre: data.nombre,
          email: data.email,
          rol: data.rol,
          docflowRol: data.docflowRol || null
        };
        showLauncher();
        return;
      }
    } catch {}
    localStorage.removeItem('platform_token');
    localStorage.removeItem('platform_jwt');
  }
  show('login');
})();
