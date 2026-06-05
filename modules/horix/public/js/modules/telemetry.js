// telemetry.js — Telemetry module for Horix

function enviarTelemetria(evento, datos) {
  try {
    const body = { evento, pagina: window._currentPage || '', datos: datos || {} };
    const blob = new Blob([JSON.stringify(body)], { type: 'application/json' });
    navigator.sendBeacon('/api/telemetry', blob);
  } catch {}
}

// Auto-track page views via sendBeacon (fires immediately, non-blocking)
const _teleOrigPushState = history.pushState;
history.pushState = function() {
  _teleOrigPushState.apply(this, arguments);
  enviarTelemetria('page_view');
};

window.addEventListener('popstate', () => {
  enviarTelemetria('page_view');
});

// Track JS errors
window.addEventListener('error', (e) => {
  enviarTelemetria('error_js', { msg: e.message, url: e.filename, line: e.lineno });
});

// ── Diagnostic page ──

async function cargarDiagnostico() {
  try {
    const res = await GET('/api/telemetry/dashboard');
    if (!res.ok) { showToast('Error al cargar diagnóstico', 'error'); return; }
    const data = await res.json();
    renderDiagnostico(data);
  } catch { showToast('Error de conexión', 'error'); }
}

function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function renderDiagnostico(data) {
  const cont = document.getElementById('diag-content');
  if (!cont) return;

  // Totales
  let html = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px;">';
  (data.totales || []).forEach(t => {
    html += `<div class="summary-item"><div class="label">${esc(t.evento)}</div><div class="val">${t.total}</div></div>`;
  });
  html += '</div>';

  // Hits por página (chart con barras inline)
  if (data.hitsPagina?.length) {
    html += '<div class="table-title" style="margin-bottom:10px;">Páginas más visitadas (30 días)</div>';
    html += '<div style="margin-bottom:24px;">';
    const maxHits = Math.max(...data.hitsPagina.map(h => h.total));
    data.hitsPagina.forEach(h => {
      const pct = (h.total / maxHits * 100).toFixed(0);
      html += `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;">
        <span style="min-width:120px;font-size:13px;">${esc(h.pagina || '—')}</span>
        <div style="flex:1;height:20px;background:var(--border);border-radius:4px;overflow:hidden;">
          <div style="height:100%;width:${pct}%;background:var(--accent);border-radius:4px;display:flex;align-items:center;padding-left:6px;font-size:11px;font-weight:600;color:var(--text);">${h.total}</div>
        </div>
      </div>`;
    });
    html += '</div>';
  }

  // Errores JS
  if (data.errores?.length) {
    html += '<div class="table-title" style="margin-bottom:10px;">Errores JS más frecuentes (30 días)</div>';
    html += '<table><thead><tr><th>Error</th><th>Módulo</th><th>Veces</th></tr></thead><tbody>';
    data.errores.forEach(e => {
      let msg = '', url = '', line = '', mod = '—';
      try { const d = JSON.parse(e.datos); msg = d.msg || ''; url = d.url || ''; line = d.line || ''; } catch { msg = e.datos; }
      if (url) {
        const parts = url.split('/');
        mod = parts.slice(parts.length - 2).join('/');
        if (line) mod += ':' + line;
      }
      html += `<tr><td style="font-size:12px;max-width:350px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(msg)}</td><td style="font-size:11px;white-space:nowrap;"><span style="background:var(--surface2);padding:2px 8px;border-radius:4px;font-family:monospace;font-size:11px;">${esc(mod)}</span></td><td>${e.total}</td></tr>`;
    });
    html += '</tbody></table>';
  }

  // Eventos recientes
  if (data.eventosRecientes?.length) {
    html += '<div class="table-title" style="margin:24px 0 10px;">Eventos recientes (últimos 50)</div>';
    html += '<div class="table-wrap" style="max-height:400px;overflow-y:auto;"><table><thead><tr><th>Fecha</th><th>Evento</th><th>Página</th><th>Usuario</th></tr></thead><tbody>';
    data.eventosRecientes.forEach(e => {
      html += `<tr><td style="font-size:12px;white-space:nowrap;">${esc(e.creado)}</td><td>${esc(e.evento)}</td><td>${esc(e.pagina || '')}</td><td>${esc(e.usuarioNombre || '—')}</td></tr>`;
    });
    html += '</tbody></table></div>';
  }

  // Errores backend recientes
  if (data.erroresBackendRecientes?.length) {
    html += '<div class="table-title" style="margin:24px 0 10px;">Errores Backend recientes (últimos 20)</div>';
    html += '<div class="table-wrap" style="max-height:400px;overflow-y:auto;"><table><thead><tr><th>Fecha</th><th>Evento</th><th>Detalle</th><th>Ruta</th></tr></thead><tbody>';
    data.erroresBackendRecientes.forEach(e => {
      let msg = '', path = '';
      try { const d = JSON.parse(e.datos || '{}'); msg = d.msg || ''; path = d.path || ''; } catch { msg = e.datos; }
      const d = e.creado ? e.creado.replace('T', ' ').replace(/\.\d+Z?$/, '') : '';
      html += `<tr><td style="font-size:12px;white-space:nowrap;">${esc(d)}</td><td>${esc(e.evento)}</td><td style="font-size:12px;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(msg)}</td><td style="font-size:11px;">${esc(path || e.pagina || '')}</td></tr>`;
    });
    html += '</tbody></table></div>';
  }

  cont.innerHTML = html || '<div style="text-align:center;padding:40px;color:var(--muted);">Sin datos de telemetría aún</div>';
}
