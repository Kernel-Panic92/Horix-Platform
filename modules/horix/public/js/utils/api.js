// api.js - Shared API helpers for Horix

const API = '/horix';
function getBrowserFingerprint() {
  try {
    const parts = [
      navigator.userAgent,
      navigator.language,
      navigator.platform,
      screen.width + 'x' + screen.height,
      screen.colorDepth,
      new Date().getTimezoneOffset()
    ];
    return btoa(parts.join('|||'));
  } catch (e) {
    return navigator.userAgent || 'unknown';
  }
}
const _bfp = getBrowserFingerprint();

let sesion = null;
let empleados = [], nominas = [], registros = [], usuarios = [], centros = [], tipos = [];
let editEmpId = null, editUsrId = null;
let _empMap = new Map();

function rebuildEmpMap() {
  _empMap = new Map(empleados.map(e => [e.id, e]));
}

const api = async (method, path, body = undefined) => {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-browser-fp': _bfp
    }
  };
  if (sesion?.csrfToken && method !== 'GET') {
    opts.headers['x-csrf-token'] = sesion.csrfToken;
  }
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const newCsrf = res.headers.get('x-csrf-token');
  if (newCsrf && sesion) sesion.csrfToken = newCsrf;
  if (res.status === 401 && path !== '/api/auth/me') {
    localStorage.removeItem('he_logged_in');
    sesion = null;
    document.getElementById('app').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    showToast('Sesión expirada. Inicia sesión nuevamente.', 'warning');
  } else if (res.status >= 400 && res.status !== 404 && !(res.status === 401 && path === '/api/auth/me')) {
    teleError(path, res.status, method);
  }
  return res;
};

const GET = (p) => api('GET', p);
const POST = (p, b) => api('POST', p, b);
const PUT = (p, b) => api('PUT', p, b);
const DEL = (p) => api('DELETE', p);

// Refresh global registros array from server (called after any mutation)
async function refreshRegistros() {
  try {
    const res = await GET('/api/registros');
    if (res.ok) registros = await res.json();
  } catch {}
}
