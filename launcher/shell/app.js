let jwtToken = localStorage.getItem('platform_jwt');
let user = null;

function show(id) {
  ['login-screen', 'launcher-screen', 'admin-screen', 'admin-form-overlay', 'modulo-form-overlay'].forEach(s => {
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
    await showLauncher();
  } catch (e) {
    showError(errEl, e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Ingresar';
  }
}

async function showLauncher() {
  document.getElementById('launcher-user').textContent = user?.nombre || '';
  document.getElementById('launcher-role').textContent = user?.rol || '';

  const grid = document.getElementById('module-grid');
  grid.innerHTML = '<div style="color:var(--muted);text-align:center;padding:20px;grid-column:1/-1;">Cargando...</div>';

  try {
    const res = await fetch('/api/modulos', {
      headers: { 'Authorization': 'Bearer ' + jwtToken }
    });
    if (!res.ok) throw new Error('Error al cargar módulos');
    const modulos = await res.json();
    grid.innerHTML = '';
    for (const mod of modulos) {
      const card = document.createElement('a');
      card.className = 'card';
      card.href = mod.url;
      card.target = '_blank';
      card.rel = 'noopener';
      card.innerHTML = `
        <div class="card-icon">${mod.icon}</div>
        <div class="card-title">${mod.nombre}</div>
        <div class="card-desc">${mod.descripcion}</div>
      `;
      grid.appendChild(card);
    }
  } catch (e) {
    grid.innerHTML = '<div style="color:var(--danger);text-align:center;padding:20px;grid-column:1/-1;">Error: ' + e.message + '</div>';
  }

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
  showAdminTab('usuarios');
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
          ${!u.activo ? `<button class="btn btn-sm btn-danger" onclick="deleteUserPermanent(${u.id})">Eliminar</button>` : ''}
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
  document.getElementById('form-rol').value = data?.rol || 'operador';
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

async function deleteUserPermanent(id) {
  if (!confirm('¿Eliminar permanentemente este usuario? Esta acción no se puede deshacer.')) return;
  try {
    const res = await fetch(`/api/admin/usuarios/${id}/permanent`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + jwtToken }
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Error al eliminar');
    }
    loadUsers();
  } catch (e) {
    alert(e.message);
  }
}

// ── Módulos ──
async function loadModulos() {
  try {
    const res = await fetch('/api/admin/modulos', {
      headers: { 'Authorization': 'Bearer ' + jwtToken }
    });
    if (!res.ok) throw new Error('Error al cargar módulos');
    const modulos = await res.json();
    const tbody = document.querySelector('#modulos-table tbody');
    tbody.innerHTML = modulos.map(m => `
      <tr>
        <td>${m.id}</td>
        <td>${m.icon} ${m.nombre}</td>
        <td style="font-size:11px;max-width:150px;overflow:hidden;text-overflow:ellipsis;" title="${m.public_url || m.url}">${m.public_url || m.url}</td>
        <td style="font-size:11px;color:var(--muted);">${m.proxy_prefix || '—'}</td>
        <td>${m.mcp_enabled ? '<span style="color:var(--success);">Sí</span>' : '<span style="color:var(--muted);">No</span>'}</td>
        <td id="health-${m.id}"><span style="color:var(--muted);">—</span></td>
        <td class="actions">
          <button class="btn btn-sm" onclick="editModulo('${m.id}')">Editar</button>
          <button class="btn btn-sm btn-danger" onclick="deleteModulo('${m.id}')">Eliminar</button>
        </td>
      </tr>
    `).join('');
  } catch (e) {
    document.querySelector('#modulos-table tbody').innerHTML = '<tr><td colspan="7" style="color:var(--danger);">Error: ' + e.message + '</td></tr>';
  }
}

async function loadHealth() {
  try {
    const res = await fetch('/api/admin/health', {
      headers: { 'Authorization': 'Bearer ' + jwtToken }
    });
    if (!res.ok) throw new Error('Error');
    const results = await res.json();
    for (const r of results) {
      const el = document.getElementById('health-' + r.id);
      if (el) {
        el.innerHTML = r.estado === 'online'
          ? '<span style="color:var(--success);">✅ Online</span>'
          : '<span style="color:var(--danger);">❌ ' + (r.error || r.status) + '</span>';
      }
    }
  } catch (e) {
    alert('Health check error: ' + e.message);
  }
}

const EMOJIS = ['⏰','📄','📊','📦','⚡','🔧','🚀','💼','🗂️','📋','🔗','🎯','📈','🛠️','💻','🌐','🔐','📁','📝','🔄','🤖','💡','⭐','🔔','🛡️','⚙️','📡','🎛️','🧩','📎'];

function renderEmojiPicker(selected) {
  const container = document.getElementById('modulo-form-icon-picker');
  container.innerHTML = EMOJIS.map(e => `
    <span onclick="selectEmoji(this)" style="font-size:24px;cursor:pointer;padding:4px 8px;border-radius:6px;border:2px solid transparent;${e === selected ? 'border-color:var(--accent);background:var(--surface2);' : ''}transition:all 0.15s;">${e}</span>
  `).join('');
}

function selectEmoji(el) {
  document.querySelectorAll('#modulo-form-icon-picker span').forEach(s => { s.style.borderColor = 'transparent'; s.style.background = 'transparent'; });
  el.style.borderColor = 'var(--accent)';
  el.style.background = 'var(--surface2)';
  document.getElementById('modulo-form-icon').value = el.textContent;
}

function showModuloForm(data) {
  document.getElementById('modulo-form-id').value = data?.id || '';
  document.getElementById('modulo-form-id-input').value = data?.id || '';
  document.getElementById('modulo-form-id-input').disabled = !!data?.id;
  document.getElementById('modulo-form-nombre').value = data?.nombre || '';
  document.getElementById('modulo-form-url').value = data?.url || '';
  document.getElementById('modulo-form-public-url').value = data?.public_url || '';
  document.getElementById('modulo-form-proxy-prefix').value = data?.proxy_prefix || '';
  document.getElementById('modulo-form-desc').value = data?.descripcion || '';
  document.getElementById('modulo-form-mcp').checked = data ? !!data.mcp_enabled : true;
  renderEmojiPicker(data?.icon || '📦');
  document.getElementById('modulo-form-icon').value = data?.icon || '📦';
  document.getElementById('modulo-form-title').textContent = data?.id ? 'Editar módulo' : 'Nuevo módulo';
  document.getElementById('modulo-form-submit-btn').textContent = data?.id ? 'Guardar cambios' : 'Crear módulo';
  document.getElementById('modulo-form-error').classList.remove('show');
  document.getElementById('modulo-form-overlay').style.display = 'block';
}

function closeModuloForm() {
  document.getElementById('modulo-form-overlay').style.display = 'none';
}

async function saveModulo() {
  const id = document.getElementById('modulo-form-id').value || document.getElementById('modulo-form-id-input').value.trim();
  const nombre = document.getElementById('modulo-form-nombre').value.trim();
  const url = document.getElementById('modulo-form-url').value.trim();
  const public_url = document.getElementById('modulo-form-public-url').value.trim();
  const icon = document.getElementById('modulo-form-icon').value.trim() || '📦';
  const desc = document.getElementById('modulo-form-desc').value.trim();
  const mcp_enabled = document.getElementById('modulo-form-mcp').checked;
  const proxy_prefix = document.getElementById('modulo-form-proxy-prefix').value.trim();
  const errEl = document.getElementById('modulo-form-error');
  if (!id || !nombre) { showError(errEl, 'ID y nombre requeridos'); return; }
  try {
    const method = document.getElementById('modulo-form-id').value ? 'PUT' : 'POST';
    const res = await fetch(method === 'PUT' ? `/api/admin/modulos/${id}` : '/api/admin/modulos', {
      method,
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwtToken },
      body: JSON.stringify({ id, nombre, url, public_url, icon, descripcion: desc, mcp_enabled, proxy_prefix })
    });
    if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Error'); }
    closeModuloForm();
    loadModulos();
  } catch (e) { showError(errEl, e.message); }
}

function editModulo(id) {
  fetch('/api/admin/modulos', {
    headers: { 'Authorization': 'Bearer ' + jwtToken }
  }).then(r => r.json()).then(modulos => {
    const m = modulos.find(x => x.id === id);
    if (m) showModuloForm(m);
  });
}

async function deleteModulo(id) {
  if (!confirm(`¿Eliminar módulo ${id}?`)) return;
  try {
    const res = await fetch(`/api/admin/modulos/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': 'Bearer ' + jwtToken }
    });
    if (!res.ok) throw new Error('Error');
    loadModulos();
  } catch (e) { alert(e.message); }
}

// ── MCP URL display ──
async function loadMcpUrl() {
  const el = document.getElementById('mcp-url-display');
  if (!el) return;
  try {
    const res = await fetch('/api/admin/mcp/url', { headers: { 'Authorization': 'Bearer ' + jwtToken } });
    if (!res.ok) throw new Error('Error');
    const data = await res.json();
    el.textContent = data.url;
  } catch {
    el.textContent = 'No disponible';
  }
}
function copiarMcpUrl() {
  const el = document.getElementById('mcp-url-display');
  if (!el || !el.textContent) return;
  navigator.clipboard.writeText(el.textContent).then(() => {
    const btn = document.querySelector('#mcp-url-box .btn');
    if (btn) { btn.textContent = '✅ Copiado'; setTimeout(() => btn.textContent = '📋 Copiar', 2000); }
  }).catch(() => {
    const range = document.createRange(); range.selectNode(el);
    window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
    document.execCommand('copy'); window.getSelection().removeAllRanges();
  });
}

// ── Password recovery ──
function showForgotPassword() {
  document.getElementById('forgot-step-email').style.display = 'block';
  document.getElementById('forgot-step-done').style.display = 'none';
  document.getElementById('forgot-error').classList.remove('show');
  document.getElementById('forgot-email').value = '';
  document.getElementById('forgot-modal').style.display = 'block';
}
function closeForgot() {
  document.getElementById('forgot-modal').style.display = 'none';
}
async function sendResetToken() {
  const email = document.getElementById('forgot-email').value.trim();
  const errEl = document.getElementById('forgot-error');
  const btn = document.querySelector('#forgot-step-email .btn');
  if (!email) { showError(errEl, 'Ingresa tu correo electrónico'); return; }
  errEl.classList.remove('show');
  btn.disabled = true; btn.textContent = 'Enviando...';
  try {
    const res = await fetch('/api/auth/forgot', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({email}) });
    const data = await res.json();
    if (!data.ok) { showError(errEl, data.error || 'Error'); btn.disabled = false; btn.textContent = 'Enviar enlace'; return; }
    // If the server returned a resetUrl, SMTP is not configured — show it directly
    if (data.resetUrl) {
      const link = window.location.origin + data.resetUrl;
      document.getElementById('forgot-link').textContent = link;
      document.getElementById('forgot-step-email').style.display = 'none';
      document.getElementById('forgot-step-done').style.display = 'block';
    } else {
      // SMTP is configured — show confirmation message
      document.getElementById('forgot-step-email').style.display = 'none';
      document.getElementById('forgot-step-done').style.display = 'block';
      document.getElementById('forgot-link').textContent = '';
      document.querySelector('#forgot-step-done .box-info')?.remove();
      const info = document.createElement('div');
      info.className = 'box-info';
      info.style.cssText = 'background:var(--surface2);border-radius:9px;padding:14px;margin-bottom:16px;font-size:13px;';
      info.innerHTML = '📧 Si el correo existe en el sistema, recibirás un enlace de recuperación. Revisa tu bandeja de entrada.';
      document.getElementById('forgot-link').parentElement.before(info);
    }
  } catch(e) { showError(errEl, 'Error de conexión'); }
  finally { btn.disabled = false; btn.textContent = 'Enviar enlace'; }
}
function closeReset() {
  document.getElementById('reset-modal').style.display = 'none';
  show('login-screen');
}
async function submitReset() {
  const pwd = document.getElementById('reset-password').value;
  const pwd2 = document.getElementById('reset-password2').value;
  const errEl = document.getElementById('reset-error');
  if (!pwd || pwd.length < 6) { showError(errEl, 'La contraseña debe tener al menos 6 caracteres'); return; }
  if (pwd !== pwd2) { showError(errEl, 'Las contraseñas no coinciden'); return; }
  errEl.classList.remove('show');
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (!token) { showError(errEl, 'Token no encontrado en la URL'); return; }
  const btn = document.querySelector('#reset-form .btn');
  btn.disabled = true; btn.textContent = 'Cambiando...';
  try {
    const res = await fetch('/api/auth/reset', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({token, password:pwd}) });
    const data = await res.json();
    if (!data.ok) { showError(errEl, data.error || 'Error'); btn.disabled = false; btn.textContent = 'Cambiar contraseña'; return; }
    document.getElementById('reset-form').style.display = 'none';
    document.getElementById('reset-done').style.display = 'block';
  } catch(e) { showError(errEl, 'Error de conexión'); }
  finally { btn.disabled = false; btn.textContent = 'Cambiar contraseña'; }
}

// ── MCP config ──
async function loadMcpConfig() {
  try {
    const res = await fetch('/api/admin/mcp', { headers: { 'Authorization': 'Bearer ' + jwtToken } });
    if (!res.ok) throw new Error('Error');
    const modulos = await res.json();
    let html = '';
    for (const m of modulos) {
      html += `<div class="perm-rol-section" data-modulo-id="${m.id}">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
          <div style="font-weight:600;font-size:14px;">${m.icon} ${m.nombre}</div>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;">
            <input type="checkbox" ${m.mcp_enabled ? 'checked' : ''} onchange="toggleMcp('${m.id}', this.checked)" style="width:16px;height:16px;accent-color:var(--accent);cursor:pointer;">
            MCP activo
          </label>
        </div>
        <label style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px;">URL interna</label>
        <div style="display:flex;gap:8px;margin-bottom:8px;">
          <input type="text" id="mcp-url-${m.id}" value="${m.url}" style="flex:1;" placeholder="http://localhost:3000" onchange="saveMcpField('${m.id}')">
        </div>
        <label style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:0.4px;">API Token <span style="text-transform:none;font-weight:400;">(opcional)</span></label>
        <div style="display:flex;gap:8px;margin-bottom:8px;">
          <input type="password" id="mcp-token-${m.id}" value="${m.mcp_token}" style="flex:1;" placeholder="Bearer token" onchange="saveMcpField('${m.id}')">
          <button class="btn btn-sm" onclick="toggleToken('${m.id}')" style="white-space:nowrap;">👁</button>
        </div>
        <div id="mcp-test-${m.id}"></div>
        <button class="btn btn-sm" onclick="testMcp('${m.id}')">🔌 Test conexión</button>
      </div>`;
    }
    document.getElementById('mcp-container').innerHTML = html;
  } catch (e) {
    document.getElementById('mcp-container').innerHTML = '<div style="color:var(--danger);">Error: ' + e.message + '</div>';
  }
}

let _mcpTimers = {};
function saveMcpField(id) {
  clearTimeout(_mcpTimers[id]);
  _mcpTimers[id] = setTimeout(async () => {
    const url = document.getElementById('mcp-url-' + id).value.trim();
    const mcp_token = document.getElementById('mcp-token-' + id).value;
    try {
      await fetch('/api/admin/mcp/' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwtToken },
        body: JSON.stringify({ url, mcp_token })
      });
    } catch (e) { alert('Error: ' + e.message); }
  }, 600);
}

async function toggleMcp(id, enabled) {
  try {
    await fetch('/api/admin/mcp/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + jwtToken },
      body: JSON.stringify({ mcp_enabled: enabled })
    });
  } catch (e) { alert('Error: ' + e.message); }
}

function toggleToken(id) {
  const el = document.getElementById('mcp-token-' + id);
  el.type = el.type === 'password' ? 'text' : 'password';
}

async function testMcp(id) {
  const el = document.getElementById('mcp-test-' + id);
  el.innerHTML = '<span style="color:var(--muted);">Probando...</span>';
  try {
    const res = await fetch('/api/admin/mcp/' + id + '/test', {
      headers: { 'Authorization': 'Bearer ' + jwtToken }
    });
    const data = await res.json();
    if (data.ok) {
      el.innerHTML = '<span style="color:var(--success);">✅ Conectado (status ' + data.status + ')</span>';
    } else {
      el.innerHTML = '<span style="color:var(--danger);">❌ ' + (data.error || 'Error ' + data.status) + '</span>';
    }
  } catch (e) {
    el.innerHTML = '<span style="color:var(--danger);">❌ ' + e.message + '</span>';
  }
}

// ── SMTP ──
async function loadSmtpConfig() {
  const resultEl = document.getElementById('smtp-result');
  resultEl.innerHTML = '<span style="color:var(--muted);">Cargando...</span>';
  try {
    const res = await fetch('/api/admin/smtp', { headers: { 'Authorization': 'Bearer ' + jwtToken } });
    const data = await res.json();
    for (const [k, v] of Object.entries(data.config)) {
      const el = document.getElementById(k);
      if (!el) continue;
      if (el.type === 'checkbox') el.checked = v === 'true';
      else el.value = v;
    }
    const badge = document.getElementById('smtp-status-badge');
    if (badge) badge.innerHTML = data.configured ? '<span style="color:var(--success);">✅ Configurado</span>' : '<span style="color:var(--warning);">⚠️ No configurado</span>';
    resultEl.innerHTML = '';
  } catch (e) {
    resultEl.innerHTML = '<span style="color:var(--danger);">❌ ' + e.message + '</span>';
  }
}
async function saveSmtpConfig() {
  const resultEl = document.getElementById('smtp-result');
  const keys = ['smtp_host','smtp_port','smtp_secure','smtp_user','smtp_pass','smtp_from','smtp_from_name','smtp_allow_self_signed'];
  const body = {};
  for (const k of keys) {
    const el = document.getElementById(k);
    if (!el) continue;
    body[k] = el.type === 'checkbox' ? (el.checked ? 'true' : 'false') : el.value;
  }
  resultEl.innerHTML = '<span style="color:var(--muted);">Guardando...</span>';
  try {
    const res = await fetch('/api/admin/smtp', {
      method: 'PUT', headers: { 'Authorization': 'Bearer ' + jwtToken, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data.ok) {
      resultEl.innerHTML = '<span style="color:var(--success);">✅ Configuración guardada</span>';
      const badge = document.getElementById('smtp-status-badge');
      if (badge) badge.innerHTML = data.configured ? '<span style="color:var(--success);">✅ Configurado</span>' : '<span style="color:var(--warning);">⚠️ No configurado</span>';
    } else {
      resultEl.innerHTML = '<span style="color:var(--danger);">❌ ' + (data.error || 'Error') + '</span>';
    }
  } catch (e) {
    resultEl.innerHTML = '<span style="color:var(--danger);">❌ ' + e.message + '</span>';
  }
}
async function testSmtpConfig() {
  const resultEl = document.getElementById('smtp-result');
  resultEl.innerHTML = '<span style="color:var(--muted);">Enviando correo de prueba...</span>';
  try {
    const res = await fetch('/api/admin/smtp/test', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + jwtToken }
    });
    const data = await res.json();
    if (data.ok) {
      resultEl.innerHTML = '<span style="color:var(--success);">✅ Correo de prueba enviado (ID: ' + data.messageId + ')</span>';
    } else {
      resultEl.innerHTML = '<span style="color:var(--danger);">❌ ' + (data.error || 'Error') + '</span>';
    }
  } catch (e) {
    resultEl.innerHTML = '<span style="color:var(--danger);">❌ ' + e.message + '</span>';
  }
}

// ── Admin tab router ──
function showAdminTab(tab) {
  document.querySelectorAll('#admin-screen .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('#admin-screen .tab-content').forEach(t => t.classList.toggle('active', t.id === 'tab-' + tab));
  if (tab === 'usuarios') loadUsers();
  else if (tab === 'modulos') loadModulos();
   else if (tab === 'mcp') { loadMcpConfig(); loadMcpUrl(); }
   else if (tab === 'smtp') loadSmtpConfig();
   else if (tab === 'nginx') loadNginx();
}

// ── Nginx ──
async function loadNginx() {
  const pre = document.getElementById('nginx-config');
  const statusEl = document.getElementById('nginx-status');
  pre.textContent = 'Cargando...';
  statusEl.innerHTML = '';
  try {
    const res = await fetch('/api/admin/nginx', {
      headers: { 'Authorization': 'Bearer ' + jwtToken }
    });
    if (!res.ok) throw new Error('Error');
    const data = await res.json();
    pre.textContent = data.config;
    if (data.actual) {
      statusEl.innerHTML = '<span style="color:var(--success);font-size:13px;">✓ Configuración actual coincide con la generada</span>';
    } else if (data.actual === '') {
      statusEl.innerHTML = '<span style="color:var(--muted);font-size:13px;">No hay archivo nginx en /etc/nginx/sites-available/horix-erp</span>';
    } else {
      statusEl.innerHTML = '<span style="color:var(--warning);font-size:13px;">⚠ La configuración actual difiere de la generada</span>';
    }
  } catch (e) {
    pre.textContent = 'Error: ' + e.message;
  }
}

async function generarNginx() {
  const btn = document.getElementById('nginx-gen-btn');
  const statusEl = document.getElementById('nginx-status');
  btn.disabled = true;
  btn.textContent = 'Generando...';
  statusEl.innerHTML = '<span style="color:var(--muted);font-size:13px;">Generando y recargando nginx...</span>';
  try {
    const res = await fetch('/api/admin/nginx/generate', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + jwtToken }
    });
    const data = await res.json();
    if (data.ok) {
      statusEl.innerHTML = '<span style="color:var(--success);font-size:13px;">✓ Nginx generado y recargado exitosamente</span>';
    } else {
      statusEl.innerHTML = '<span style="color:var(--danger);font-size:13px;">❌ ' + (data.error || 'Error') + '</span>';
    }
    loadNginx();
  } catch (e) {
    statusEl.innerHTML = '<span style="color:var(--danger);font-size:13px;">❌ ' + e.message + '</span>';
  } finally {
    btn.disabled = false;
    btn.textContent = '⚡ Generar y recargar';
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
        await showLauncher();
        return;
      }
    } catch {}
    localStorage.removeItem('platform_jwt');
  }
  show('login-screen');
  const params = new URLSearchParams(window.location.search);
  if (params.get('token')) {
    document.getElementById('reset-password').value = '';
    document.getElementById('reset-password2').value = '';
    document.getElementById('reset-error').classList.remove('show');
    document.getElementById('reset-form').style.display = 'block';
    document.getElementById('reset-done').style.display = 'none';
    document.getElementById('reset-modal').style.display = 'block';
  }
})();
