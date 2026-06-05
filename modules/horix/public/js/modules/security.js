// security.js - Security & Rate-Limit module for Horix

async function cargarSeguridadStatus() {
  const loadingEl  = document.getElementById('sec-bloqueadas-loading');
  const noneEl     = document.getElementById('sec-bloqueadas-none');
  const bodyEl     = document.getElementById('sec-bloqueadas-body');
  const seguNoneEl = document.getElementById('sec-seguimiento-none');
  const seguBodyEl = document.getElementById('sec-seguimiento-body');
  if (loadingEl) loadingEl.style.display = 'block';
  if (noneEl)    noneEl.style.display    = 'none';
  if (bodyEl)    bodyEl.style.display    = 'none';
  try {
    const res = await GET('/api/auth/ratelimit-status');
    if (!res.ok) return;
    const data = await res.json();
    document.getElementById('sec-bloqueadas').textContent  = data.totalBloqueadas;
    document.getElementById('sec-seguimiento').textContent = data.totalIpsEnSeguimiento;
    document.getElementById('sec-cfg-intentos').textContent = data.configuracion.maxIntentos + ' intentos';
    document.getElementById('sec-cfg-ventana').textContent  = data.configuracion.ventanaMinutos + ' minutos';
    document.getElementById('sec-cfg-bloqueo').textContent  = data.configuracion.bloqueoMinutos + ' minutos';
    if (loadingEl) loadingEl.style.display = 'none';
    if (!data.bloqueadas.length) {
      if (noneEl) noneEl.style.display = 'block';
    } else {
      if (bodyEl) {
        bodyEl.style.display = 'flex';
        bodyEl.innerHTML = data.bloqueadas.map(function(b) {
          return '<div style="background:rgba(247,97,79,0.08);border:1px solid rgba(247,97,79,0.2);border-radius:10px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;">'
            + '<div><div style="font-size:13px;font-weight:600;color:var(--text);font-family:monospace;">🔒 ' + esc(b.ip) + '</div>'
            + '<div style="font-size:11px;color:var(--muted);margin-top:3px;">' + esc(b.intentos) + ' intentos · Libera: ' + esc(b.bloqueadaHasta) + ' (' + esc(b.minutosRestantes) + ' min)</div></div>'
            + '<button class="btn btn-sm sec-btn-desbloquear" data-ip="' + esc(b.ip) + '" style="background:rgba(79,190,150,0.1);color:var(--success);border:1px solid rgba(79,190,150,0.3);white-space:nowrap;">🔓 Desbloquear</button>'
            + '</div>';
        }).join('');
        bodyEl.querySelectorAll('.sec-btn-desbloquear').forEach(function(btn) {
          btn.addEventListener('click', function() { desbloquearIP(this.dataset.ip); });
        });
      }
    }
    if (!data.enSeguimiento.length) {
      if (seguNoneEl) seguNoneEl.style.display = 'block';
      if (seguBodyEl) seguBodyEl.innerHTML = '';
    } else {
      if (seguNoneEl) seguNoneEl.style.display = 'none';
      if (seguBodyEl) {
        seguBodyEl.innerHTML = data.enSeguimiento.map(function(s) {
          const pct = Math.round((s.intentos / data.configuracion.maxIntentos) * 100);
          const color = pct >= 70 ? 'var(--danger)' : pct >= 40 ? 'var(--warning)' : 'var(--muted)';
          return '<div style="background:var(--surface2);border-radius:8px;padding:10px 12px;">'
            + '<div style="display:flex;justify-content:space-between;margin-bottom:5px;">'
            + '<span style="font-size:12px;font-family:monospace;color:var(--text);">' + esc(s.ip) + '</span>'
            + '<span style="font-size:11px;color:' + esc(color) + ';">' + esc(s.intentos) + '/' + esc(data.configuracion.maxIntentos) + ' intentos</span></div>'
            + '<div style="background:var(--border);border-radius:4px;height:4px;overflow:hidden;">'
            + '<div style="height:100%;background:' + esc(color) + ';width:' + esc(pct) + '%;border-radius:4px;transition:width 0.3s;"></div></div></div>';
        }).join('');
      }
    }
  } catch(e) {
    if (loadingEl) loadingEl.style.display = 'none';
    showToast('Error cargando estado de seguridad: ' + e.message, 'error');
  }
}

async function desbloquearIP(ip) {
  confirmar({
    titulo: 'Desbloquear IP',
    mensaje: '¿Desbloquear la IP ' + ip + '?',
    icono: '🔓',
    btnTxt: 'Desbloquear',
    onConfirm: async () => {
      await DEL('/api/auth/ratelimit-status/' + encodeURIComponent(ip));
      showToast('IP desbloqueada: ' + ip, 'success');
      cargarSeguridadStatus();
    }
  });
}
