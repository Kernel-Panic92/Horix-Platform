// backup.js - Backup & Restore module for Horix

let restoreFile = null;
let _backupListenerInit = false;

async function cargarUltimoBackup() {
  const card = document.getElementById('ultimo-backup-card');
  const none = document.getElementById('ultimo-backup-none');
  try {
    const res = await GET('/api/backup/ultimo');
    if (!res.ok) { card.style.display = 'none'; none.style.display = 'block'; return; }
    const info = await res.json();
    if (!info) {
      card.style.display = 'none';
      none.style.display = 'block';
      return;
    }
    const fecha = new Date(info.fecha);
    const fechaStr = fecha.toLocaleString('es-CO', { dateStyle: 'full', timeStyle: 'short' });
    const diffMs = Date.now() - fecha.getTime();
    const diffH = Math.floor(diffMs / 3600000);
    const diffD = Math.floor(diffH / 24);
    const hace = diffD > 0 ? 'hace ' + diffD + ' día' + (diffD > 1 ? 's' : '') : diffH > 0 ? 'hace ' + diffH + 'h' : 'hace menos de 1h';

    document.getElementById('ultimo-bk-fecha').textContent = fechaStr;
    document.getElementById('ultimo-bk-hace').textContent = hace;
    document.getElementById('ultimo-bk-archivo').textContent = info.archivo || '—';
    document.getElementById('ultimo-bk-size').textContent = info.tamaño || '—';
    const redOk = info.red === true;
    const redEl = document.getElementById('ultimo-bk-red');
    redEl.textContent = redOk ? '✓ Copiado' : '✗ Solo local';
    redEl.style.color = redOk ? 'var(--success)' : 'var(--danger)';

    card.style.display = 'block';
    none.style.display = 'none';
  } catch (e) {
    if (card) card.style.display = 'none';
    if (none) none.style.display = 'block';
  }
}

async function cargarListaBackups() {
  const loading = document.getElementById('lista-backups-loading');
  const none = document.getElementById('lista-backups-none');
  const body = document.getElementById('lista-backups-body');
  if (!loading || !none || !body) return;

  loading.style.display = 'block';
  none.style.display = 'none';
  body.style.display = 'none';

  try {
    const res = await GET('/api/backup/lista');
    loading.style.display = 'none';
    if (!res.ok) { none.style.display = 'block'; return; }
    const lista = await res.json();
    if (!lista || !lista.length) {
      none.style.display = 'block';
      return;
    }

    body.style.display = 'flex';
    body.innerHTML = lista.map(function (b) {
      const fecha = new Date(b.fecha).toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'medium', timeStyle: 'short' });
      const tamaño = b.tamaño > 1024 * 1024
        ? (b.tamaño / 1024 / 1024).toFixed(1) + ' MB'
        : (b.tamaño / 1024).toFixed(0) + ' KB';
      return '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:12px 14px;display:flex;align-items:center;justify-content:space-between;gap:12px;">'
        + '<div style="min-width:0;">'
        + '<div style="font-size:12px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="' + esc(b.nombre) + '">📦 ' + esc(b.nombre) + '</div>'
        + '<div style="font-size:11px;color:var(--muted);margin-top:2px;">📅 ' + esc(fecha) + ' &nbsp;·&nbsp; ' + esc(tamaño) + '</div>'
        + '</div>'
        + '<div style="display:flex;gap:6px;flex-shrink:0;">'
        + '<button class="btn btn-secondary btn-sm bk-btn-download" data-nombre="' + esc(b.nombre) + '" title="Descargar">⬇️</button>'
        + '<button class="btn btn-sm bk-btn-restore" data-nombre="' + esc(b.nombre) + '" title="Restaurar este backup" style="background:rgba(247,97,79,0.1);color:var(--danger);border:1px solid rgba(247,97,79,0.3);">♻️ Restaurar</button>'
        + '</div>'
        + '</div>';
    }).join('');

    body.querySelectorAll('.bk-btn-download').forEach(function (btn) {
      btn.addEventListener('click', function () { descargarBackupAutomatico(this.dataset.nombre); });
    });
    body.querySelectorAll('.bk-btn-restore').forEach(function (btn) {
      btn.addEventListener('click', function () { restaurarBackupLocal(this.dataset.nombre); });
    });
  } catch (e) {
    loading.style.display = 'none';
    none.style.display = 'block';
    none.textContent = 'Error cargando backups: ' + e.message;
  }
}

function descargarBackupAutomatico(nombre) {
  const a = document.createElement('a');
  a.href = API + '/api/backup/descargar/' + encodeURIComponent(nombre);
  a.setAttribute('download', nombre);
  fetch(API + '/api/backup/descargar/' + encodeURIComponent(nombre)).then(function (r) {
    if (!r.ok) { showToast('Error al descargar el backup', 'error'); return; }
    return r.blob();
  }).then(function (blob) {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    a.href = url;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }).catch(function (e) { showToast('Error: ' + e.message, 'error'); });
}

async function restaurarBackupLocal(nombre) {
  confirmar({
    titulo: 'Restaurar Backup',
    mensaje: '¿Restaurar el backup "' + nombre + '"? Los datos actuales serán reemplazados. Tu sesión de administrador no se verá afectada.',
    icono: '🔄',
    btnTxt: 'Restaurar',
    onConfirm: async () => {
      const ok = document.getElementById('restore-ok');
      const err = document.getElementById('restore-err');
      if (ok) ok.style.display = 'none';
      if (err) err.style.display = 'none';
      showToast('Restaurando...', 'info');
      try {
        const res = await POST('/api/backup/restore/local/' + encodeURIComponent(nombre), {});
        const data = await res.json();
        if (!res.ok) {
          if (err) { err.textContent = '✗ ' + (data.error || 'Error al restaurar'); err.style.display = 'block'; }
          showToast('Error en la restauración', 'error');
        } else {
          if (ok) { ok.textContent = '✓ ' + (data.mensaje || 'Restauración completada correctamente'); ok.style.display = 'block'; }
          showToast('Restauración completada', 'success');
          if (typeof enviarTelemetria === 'function') enviarTelemetria('backup_restaurado', { nombre });
          mostrarResumenRestauracion(data.resumen);
        }
      } catch (e) {
        if (err) { err.textContent = '✗ ' + e.message; err.style.display = 'block'; }
        showToast('Error en la restauración', 'error');
      }
    }
  });
}

async function descargarBackup() {
  setLoading('btn-descargar-backup', true);
  const backupOk = document.getElementById('backup-ok');
  if (backupOk) backupOk.style.display = 'none';
  try {
    const res = await fetch(API + '/api/backup');
    if (!res.ok) {
      const j = await res.json();
      showToast(j.error || 'Error al generar backup', 'error');
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const fecha = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = 'horasextra_backup_' + fecha + '.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    if (backupOk) { backupOk.style.display = 'block'; setTimeout(function () { backupOk.style.display = 'none'; }, 5000); }
    if (typeof enviarTelemetria === 'function') enviarTelemetria('backup_generado', {});
  } catch (e) {
    showToast('Error al descargar: ' + e.message, 'error');
  }
  setLoading('btn-descargar-backup', false);
}

async function ejecutarBackupScript() {
  const btn = document.getElementById('btn-ejecutar-backup-script');
  const log = document.getElementById('bk-script-log');
  if (!btn || !log) return;
  setLoading('btn-ejecutar-backup-script', true);
  log.style.display = 'block';
  log.textContent = 'Ejecutando script de backup...\n';
  try {
    const res = await POST('/api/backup/ejecutar', {});
    const data = await res.json();
    log.textContent += (data.salida || []).join('\n');
    if (data.ok) {
      log.textContent += '\n\n✅ Backup completado exitosamente';
      log.style.borderColor = 'var(--success)';
      cargarUltimoBackup();
      cargarListaBackups();
    } else {
      log.textContent += '\n\n❌ Error: ' + (data.error || 'Falló la ejecución');
      log.style.borderColor = 'var(--danger)';
    }
  } catch (e) {
    log.textContent += '\n❌ Error de conexión: ' + e.message;
    log.style.borderColor = 'var(--danger)';
  }
  setLoading('btn-ejecutar-backup-script', false);
  log.scrollTop = log.scrollHeight;
}

function initBackupListeners() {
  if (_backupListenerInit) return;
  _backupListenerInit = true;
  const inp = document.getElementById('restore-file');
  if (inp) {
    inp.addEventListener('change', function () {
      if (!this.files || !this.files[0]) return;
      restoreFile = this.files[0];
      document.getElementById('restore-filename').textContent = '📄 ' + restoreFile.name;
      document.getElementById('restore-filename').style.display = 'block';
      document.getElementById('btn-restaurar').disabled = false;
      document.getElementById('btn-restaurar').style.opacity = '1';
      const okEl = document.getElementById('restore-ok');
      const errEl = document.getElementById('restore-err');
      if (okEl) okEl.style.display = 'none';
      if (errEl) errEl.style.display = 'none';
    });
  }
}

function seleccionarArchivoRestore(input) {
  const file = input.files ? input.files[0] : input;
  if (!file) return;
  restoreFile = file;
  document.getElementById('restore-filename').textContent = '📄 ' + restoreFile.name;
  document.getElementById('restore-filename').style.display = 'block';
  document.getElementById('btn-restaurar').disabled = false;
  document.getElementById('btn-restaurar').style.opacity = '1';
  const okEl = document.getElementById('restore-ok');
  const errEl = document.getElementById('restore-err');
  if (okEl) okEl.style.display = 'none';
  if (errEl) errEl.style.display = 'none';
}

function handleRestoreDrop(e) {
  e.preventDefault();
  const drop = document.getElementById('restore-drop');
  if (drop) drop.style.borderColor = 'var(--border)';
  const file = e.dataTransfer.files[0];
  if (!file) return;
  seleccionarArchivoRestore({ files: [file] });
}

async function restaurarBackup() {
  if (!restoreFile) return;
  const archivoARestaurar = restoreFile;
  confirmar({
    titulo: 'Restaurar Backup',
    mensaje: '¿Estás seguro? Los datos actuales serán reemplazados por los del archivo "' + archivoARestaurar.name + '". Esta acción no se puede deshacer.',
    icono: '♻️',
    btnTxt: 'Restaurar',
    onConfirm: async () => {
      setLoading('btn-restaurar', true);
      const okEl = document.getElementById('restore-ok');
      const errEl = document.getElementById('restore-err');
      if (okEl) okEl.style.display = 'none';
      if (errEl) errEl.style.display = 'none';
      try {
        const form = new FormData();
        form.append('backup', archivoARestaurar);
        const res = await fetchCSRF(API + '/api/restore', {
          method: 'POST',
          body: form
        });
        const json = await res.json();
        if (!res.ok) {
          if (errEl) { errEl.textContent = '✗ ' + (json.error || 'Error al restaurar'); errEl.style.display = 'block'; }
        } else {
          if (okEl) { okEl.textContent = '✓ ' + json.mensaje; okEl.style.display = 'block'; }
          if (typeof enviarTelemetria === 'function') enviarTelemetria('backup_restaurado', { archivo: archivoARestaurar.name });
          mostrarResumenRestauracion(json.resumen);
          restoreFile = null;
          const fileInput = document.getElementById('restore-file');
          if (fileInput) fileInput.value = '';
          document.getElementById('restore-filename').style.display = 'none';
          document.getElementById('btn-restaurar').disabled = true;
          document.getElementById('btn-restaurar').style.opacity = '0.5';
        }
      } catch (e) {
        if (errEl) { errEl.textContent = '✗ ' + e.message; errEl.style.display = 'block'; }
      }
      setLoading('btn-restaurar', false);
    }
  });
}

function mostrarResumenRestauracion(r) {
  if (!r) return;
  const o = document.createElement('div');
  o.className = 'modal-overlay open';
  o.innerHTML = `<div class="modal" style="width:420px;"><div class="modal-title">♻️ Restauración Completada</div>
    <div style="font-size:14px;line-height:2;">
      <div>📦 Configuración: <strong>${r.confItems}</strong> items</div>
      <div>👥 Empleados: <strong>${r.empleados}</strong></div>
      <div>📅 Nóminas: <strong>${r.nominas}</strong></div>
      <div>📋 Registros: <strong>${r.registros}</strong></div>
      <div>👤 Usuarios: <strong>${r.usuarios}</strong></div>
      <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);color:var(--danger);">🔒 Otras sesiones cerradas: <strong>${r.sesionesCerradas - 1 < 0 ? 0 : r.sesionesCerradas - 1}</strong></div>
      <div style="font-size:12px;color:var(--muted);margin-top:8px;">Tu sesión se mantuvo activa. Las demás sesiones fueron cerradas por seguridad.</div>
    </div>
    <button class="btn btn-primary" style="margin-top:20px;width:100%;" onclick="this.closest('.modal-overlay').remove();location.reload()">✅ Entendido, recargar</button>
  </div>`;
  document.body.appendChild(o);
}
