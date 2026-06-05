// auditoria.js - Audit & Session monitoring module for Horix

function limpiarFiltrosAuditoria() {
  const buscar = document.getElementById('aud-buscar');
  const sesion = document.getElementById('aud-fil-sesion');
  const tipo = document.getElementById('aud-fil-tipo');
  const desde = document.getElementById('aud-fil-desde');
  const hasta = document.getElementById('aud-fil-hasta');
  if (buscar) buscar.value = '';
  if (sesion) sesion.value = '';
  if (tipo) tipo.value = '';
  if (desde) desde.value = '';
  if (hasta) hasta.value = '';
  cargarAuditoria();
}

async function cargarAuditoria() {
  const sesBody = document.getElementById('aud-sesiones-body');
  const histBody = document.getElementById('aud-historial-body');
  if (sesBody) sesBody.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:13px;">Cargando...</div>';
  if (histBody) histBody.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:13px;">Cargando...</div>';

  const buscar = (document.getElementById('aud-buscar')?.value || '').toLowerCase();
  const filSesion = document.getElementById('aud-fil-sesion')?.value || '';
  const tipo = document.getElementById('aud-fil-tipo')?.value || '';
  const desde = document.getElementById('aud-fil-desde')?.value || '';
  const hasta = document.getElementById('aud-fil-hasta')?.value || '';

  const params = new URLSearchParams();
  if (tipo) params.set('tipo', tipo);
  if (desde) params.set('desde', desde);
  if (hasta) params.set('hasta', hasta);
  const qs = params.toString();

  try {
    const res = await GET('/api/admin/auditoria' + (qs ? '?' + qs : ''));
    if (!res.ok) return;
    const data = await res.json();
    document.getElementById('aud-sesiones').textContent = data.stats.totalSesiones;
    document.getElementById('aud-exitos-hoy').textContent = data.stats.totalExitosHoy;
    document.getElementById('aud-fallidos-hoy').textContent = data.stats.totalFallidosHoy;

    if (sesBody) {
      let usuarios = data.sesiones;
      if (buscar) usuarios = usuarios.filter(function(u) {
        return (u.nombre||'').toLowerCase().includes(buscar) || (u.email||'').toLowerCase().includes(buscar);
      });
      if (filSesion === 'activa') usuarios = usuarios.filter(function(u) { return u.enSesion; });
      if (filSesion === 'inactiva') usuarios = usuarios.filter(function(u) { return !u.enSesion; });
      if (!usuarios.length) {
        sesBody.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:13px;">' + (buscar ? 'Sin resultados' : 'No hay usuarios registrados') + '</div>';
      } else {
        sesBody.innerHTML = usuarios.map(function(s) {
          const activa = s.enSesion;
          const creado = s.creado ? new Date(s.creado).toLocaleString('es-CO') : '—';
          const expira = s.expira ? new Date(s.expira).toLocaleString('es-CO') : '—';
          const statusText = activa ? 'Sesión activa' : 'Sin sesión';
          const statusBg = activa ? 'rgba(79,190,150,0.15)' : 'var(--border)';
          const statusColor = activa ? 'var(--success)' : 'var(--muted)';
          return '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-bottom:8px;opacity:' + esc(s.activo ? '1' : '0.5') + ';">'
            + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">'
            + '<span style="font-weight:600;font-size:14px;">' + esc(s.nombre||'—') + '</span>'
            + '<span style="display:flex;align-items:center;gap:8px;">'
            + (activa ? '<button class="btn btn-sm btn-danger" onclick="cerrarSesionAdmin(\'' + esc(s.token) + '\',\'' + esc(s.nombre) + '\')" title="Cerrar sesión" style="font-size:11px;padding:2px 8px;">🔒 Cerrar</button>' : '')
            + '<span style="font-size:11px;background:' + esc(statusBg) + ';color:' + esc(statusColor) + ';padding:2px 8px;border-radius:6px;font-weight:600;">' + esc(statusText) + '</span>'
            + '</span></div>'
            + '<div style="font-size:12px;color:var(--muted);display:flex;gap:16px;flex-wrap:wrap;">'
            + '<span>' + esc(s.email||'') + '</span>'
            + '<span style="background:var(--surface);padding:0 6px;border-radius:4px;font-size:11px;">' + esc(s.rol||'') + '</span>'
            + (!s.activo ? '<span style="color:var(--danger);font-size:11px;">🚫 Usuario inactivo</span>' : '')
            + '</div>'
            + '<div style="font-size:11px;color:var(--muted);margin-top:4px;">🕐 Ultimo login: ' + esc(s.ultimoLogin ? new Date(s.ultimoLogin).toLocaleString('es-CO') : '— Nunca') + '</div>'
            + (activa ? '<div style="font-size:12px;color:var(--muted);margin-top:4px;display:flex;gap:16px;flex-wrap:wrap;">'
              + '<span>🌐 ' + esc(s.ip||'—') + '</span>'
              + '<span title="' + esc(s.ua||'') + '">🖥️ ' + esc((s.ua||'').slice(0, 50) + ((s.ua||'').length > 50 ? '…' : '') || '—') + '</span>'
              + '<span>📅 ' + esc(creado) + '</span>'
              + '<span>⏳ Exp: ' + esc(expira) + '</span></div>' : '')
            + '</div>';
        }).join('');
      }
    }

    if (histBody) {
      if (!data.historial.length) {
        histBody.innerHTML = '<div style="text-align:center;padding:20px;color:var(--muted);font-size:13px;">Sin registros</div>';
      } else {
        histBody.innerHTML = data.historial.map(function(h) {
          const ts = new Date(h.timestamp).toLocaleString('es-CO');
          const icon = h.tipo === 'exito' ? '✅' : '❌';
          const color = h.tipo === 'exito' ? 'var(--success)' : 'var(--danger)';
          return '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-bottom:6px;">'
            + '<div style="display:flex;justify-content:space-between;align-items:center;">'
            + '<span style="font-size:13px;font-weight:500;">' + icon + ' ' + esc(h.email||'—') + '</span>'
            + '<span style="font-size:11px;color:' + esc(color) + ';font-weight:600;">' + esc(h.tipo==='exito'?'Exitoso':'Fallido') + '</span></div>'
            + '<div style="font-size:12px;color:var(--muted);margin-top:3px;display:flex;gap:12px;">'
            + '<span>🌐 ' + esc(h.ip||'—') + '</span>'
            + '<span>📅 ' + esc(ts) + '</span></div></div>';
        }).join('');
      }
    }
  } catch(e) {
    if (sesBody) sesBody.innerHTML = '<div style="text-align:center;padding:20px;color:var(--danger);font-size:13px;">Error: ' + esc(e.message) + '</div>';
    if (histBody) histBody.innerHTML = '';
    showToast('Error cargando auditoría: ' + esc(e.message), 'error');
  }
}

async function cerrarSesionAdmin(token, nombre) {
  confirmar({
    titulo: 'Cerrar Sesión',
    mensaje: '¿Cerrar la sesión de ' + nombre + '?',
    icono: '🔒',
    btnTxt: 'Cerrar',
    onConfirm: async () => {
      const res = await DEL('/api/admin/sesiones/' + encodeURIComponent(token));
      if (!res.ok) { showToast('Error al cerrar sesión', 'error'); return; }
      showToast('Sesión de ' + nombre + ' cerrada', 'success');
      cargarAuditoria();
    }
  });
}
