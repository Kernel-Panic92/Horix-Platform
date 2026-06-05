// auth.js - Authentication module for Horix

async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');
  if (errEl) { errEl.classList.remove('show'); errEl.textContent = ''; }
  
  if (!email || !password) {
    if (errEl) { errEl.textContent = 'Ingresa tu correo y contraseña.'; errEl.classList.add('show'); }
    return;
  }
  
  setLoading('btn-login', true);
  
  try {
    const res = await POST('/api/auth/login', { email, password });
    const data = await res.json();
    
    if (res.ok) {
      // Store only user info in memory (no localStorage — cookie handles auth)
      sesion = { usuario: data.usuario, csrfToken: data.csrfToken };
      localStorage.setItem('he_logged_in', '1');
      document.getElementById('login-screen').style.display = 'none';
      document.getElementById('app').style.display = 'flex';
      document.getElementById('app-screen').classList.add('show');
      document.getElementById('login-email').value = '';
      document.getElementById('login-pass').value = '';
      await iniciarApp();
    } else {
      if (errEl) { errEl.textContent = data.error || 'Error al iniciar sesión'; errEl.classList.add('show'); }
    }
  } catch (e) {
    console.error('Login error:', e);
    if (errEl) { errEl.textContent = 'Error de conexión'; errEl.classList.add('show'); }
  } finally {
    setLoading('btn-login', false);
  }
}

async function doLogout() {
  // Confirm logout
  if (!confirm('¿Seguro que deseas cerrar sesión?')) return;
  
  try {
    await POST('/api/auth/logout');
  } catch (e) {
    console.error('Logout error:', e);
  } finally {
    // Clear session
    localStorage.removeItem('he_logged_in');
    sesion = null;
    empleados = [];
    nominas = [];
    registros = [];
    usuarios = [];
    centros = [];
    
    // Show login, hide app
    document.getElementById('app').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    
    showToast('Sesión cerrada', 'info');
  }
}

function abrirForgot() {
  const modal = document.getElementById('modal-forgot');
  if (modal) {
    // Reset state
    const formEl = document.getElementById('forgot-form');
    const successEl = document.getElementById('forgot-success');
    const errEl = document.getElementById('forgot-error');
    if (formEl) formEl.style.display = 'block';
    if (successEl) { successEl.style.display = 'none'; successEl.innerHTML = ''; }
    if (errEl) { errEl.classList.remove('show'); errEl.textContent = ''; }
    const btn = modal.querySelector('.modal-footer .btn-secondary');
    if (btn) btn.textContent = 'Cancelar';
    const emailInput = document.getElementById('forgot-email');
    if (emailInput) emailInput.value = '';
    modal.classList.add('open');
    modal.style.display = 'flex';
  }
}

async function enviarReset() {
  const email = document.getElementById('forgot-email').value.trim();
  const errEl = document.getElementById('forgot-error');
  const successEl = document.getElementById('forgot-success');
  const formEl = document.getElementById('forgot-form');
  if (errEl) { errEl.classList.remove('show'); errEl.textContent = ''; }
  
  if (!email) {
    if (errEl) { errEl.textContent = 'Ingresa tu correo electrónico'; errEl.classList.add('show'); }
    return;
  }
  
  setLoading('btn-forgot', true);
  
  try {
    const res = await POST('/api/auth/forgot-password', { email });
    const data = await res.json();
    
    if (res.ok) {
      // Show success inside modal
      if (formEl) formEl.style.display = 'none';
      if (successEl) {
        successEl.style.display = 'block';
        successEl.innerHTML = '✅ Correo enviado correctamente.<br><br>Revisa tu bandeja de entrada (y la carpeta de spam) para encontrar el enlace de restablecimiento.';
      }
      const btn = document.querySelector('#modal-forgot .modal-footer .btn-secondary');
      if (btn) btn.textContent = 'Cerrar';
      document.getElementById('btn-forgot').style.display = 'none';
      // Auto-close after 4 seconds
      setTimeout(() => {
        const modal = document.getElementById('modal-forgot');
        if (modal) { modal.classList.remove('open'); modal.style.display = 'none'; }
      }, 4000);
    } else {
      if (errEl) { errEl.textContent = data.error || 'Error al enviar correo'; errEl.classList.add('show'); }
    }
  } catch (e) {
    console.error('Reset password error:', e);
    if (errEl) { errEl.textContent = 'Error de conexión'; errEl.classList.add('show'); }
  } finally {
    setLoading('btn-forgot', false);
  }
}
