let editTipoId = null;

function renderTipos() {
  const body = document.getElementById('tipos-body');
  if (!body) return;
  const counter = document.getElementById('tipos-counter');
  if (counter) counter.textContent = tipos.length + ' tipo(s)';
  if (!tipos.length) {
    body.innerHTML = '<div style="text-align:center;padding:30px;color:var(--muted);">No hay tipos de hora configurados</div>';
    return;
  }
  body.innerHTML = '<div style="display:flex;flex-direction:column;gap:8px;">' + tipos.sort((a, b) => a.id.localeCompare(b.id)).map(t => {
    const activa = t.activo;
    const esValor = t.es_valor;
    return '<div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:12px 16px;display:flex;align-items:center;gap:14px;opacity:' + (activa ? '1' : '0.5') + ';">'
      + '<span style="font-weight:700;font-size:15px;font-family:monospace;background:var(--surface);padding:4px 10px;border-radius:6px;min-width:50px;text-align:center;">' + esc(t.id) + '</span>'
      + '<div style="flex:1;"><div style="font-weight:600;font-size:14px;">' + esc(t.nombre) + '</div>'
      + '<div style="font-size:12px;color:var(--muted);margin-top:2px;">' + (esValor ? '💰 Tipo valor (COP)' : '⏱️ Tipo horas') + ' · ' + (activa ? '<span style="color:var(--success);">Activo</span>' : '<span style="color:var(--danger);">Inactivo</span>') + '</div></div>'
      + '<div style="display:flex;gap:6px;">'
      + '<button class="btn btn-sm btn-secondary" onclick="editarTipo(\'' + esc(t.id) + '\')" title="Editar">✏️</button>'
      + '<button class="btn btn-sm ' + (activa ? 'btn-danger' : 'btn-success') + '" onclick="toggleTipo(\'' + esc(t.id) + '\')" title="' + (activa ? 'Desactivar' : 'Activar') + '">' + (activa ? '🚫' : '✅') + '</button>'
      + '</div></div>';
  }).join('') + '</div>';
}

function abrirModalTipo(id) {
  editTipoId = id || null;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay open';
  overlay.id = 'modal-tipo-overlay';
  overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  const tipo = id ? tipos.find(t => t.id === id) : null;
  overlay.innerHTML = '<div class="modal" style="width:480px;">'
    + '<div class="modal-title" style="font-size:17px;padding:16px 20px;border-bottom:1px solid var(--border);margin-bottom:0;">' + (tipo ? '✏️ Editar Tipo de Hora' : '➕ Nuevo Tipo de Hora') + '</div>'
    + '<div style="padding:20px;font-size:14px;">'
    + '<div style="display:grid;grid-template-columns:1fr 2fr;gap:12px;align-items:center;">'
    + '<label style="font-weight:600;color:var(--text);font-size:13px;">Código *</label>'
    + '<input class="form-control" id="tipo-id" value="' + esc(tipo ? tipo.id : '') + '"' + (tipo ? ' readonly style="background:var(--surface);color:var(--muted);cursor:not-allowed;font-family:monospace;font-weight:700;letter-spacing:1px;"' : ' placeholder="Ej: 015" style="font-family:monospace;font-weight:700;letter-spacing:1px;"') + '>'
    + '<label style="font-weight:600;color:var(--text);font-size:13px;">Nombre *</label>'
    + '<input class="form-control" id="tipo-nombre" value="' + esc(tipo ? tipo.nombre : '') + '" placeholder="Ej: HORA EXTRA NOCTURNA">'
    + '</div>'
    + '<div style="margin-top:16px;background:var(--surface);border-radius:8px;padding:14px;border:1px solid var(--border);">'
    + '<label style="display:flex;align-items:center;gap:10px;cursor:pointer;">'
    + '<input type="checkbox" id="tipo-es-valor"' + (tipo && tipo.es_valor ? ' checked' : '') + ' style="width:18px;height:18px;accent-color:var(--accent);cursor:pointer;">'
    + '<div><span style="font-weight:600;font-size:14px;">💰 Tipo valor (COP)</span>'
    + '<div style="font-size:12px;color:var(--muted);margin-top:2px;">Al activarlo, el campo horas se reemplaza por un valor monetario. Usado para transportes, bonificaciones y auxilios.</div></div>'
    + '</label>'
    + '</div>'
    + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:20px;padding-top:16px;border-top:1px solid var(--border);">'
    + '<button class="btn btn-secondary" onclick="this.closest(\'.modal-overlay\').remove()">Cancelar</button>'
    + '<button class="btn btn-primary" id="btn-guardar-tipo" onclick="guardarTipo()" style="min-width:100px;justify-content:center;">' + (tipo ? 'Actualizar' : 'Crear') + '</button>'
    + '</div></div></div>';
  document.body.appendChild(overlay);
  setTimeout(() => {
    const inp = document.getElementById('tipo-id') || document.getElementById('tipo-nombre');
    if (inp) inp.focus();
  }, 100);
}

function editarTipo(id) { abrirModalTipo(id); }

async function guardarTipo() {
  const id = document.getElementById('tipo-id')?.value.trim();
  const nombre = document.getElementById('tipo-nombre')?.value.trim();
  const esValor = document.getElementById('tipo-es-valor')?.checked ? 1 : 0;
  if (!id || !nombre) { showToast('Código y nombre requeridos', 'warning'); return; }
  setLoading('btn-guardar-tipo', true);
  try {
    const res = editTipoId
      ? await PUT('/api/tipos/' + encodeURIComponent(editTipoId), { nombre, es_valor: esValor })
      : await POST('/api/tipos', { id, nombre, es_valor: esValor });
    if (!res.ok) { const d = await res.json(); showToast(d.error || 'Error', 'error'); return; }
    const updated = await res.json();
    // Update local cache
    const idx = tipos.findIndex(t => t.id === updated.id);
    if (idx >= 0) tipos[idx] = updated;
    else tipos.push(updated);
    showToast('Tipo ' + (editTipoId ? 'actualizado' : 'creado') + ' exitosamente', 'success');
    document.getElementById('modal-tipo-overlay')?.remove();
    // Re-populate selects
    if (typeof poblarSelectTipos === 'function') {
      poblarSelectTipos('reg-tipo');
      poblarSelectTipos('fil-tipo');
      poblarSelectTipos('rpt-tipo');
    }
    renderTipos();
  } catch (e) { showToast('Error: ' + e.message, 'error'); }
  finally { setLoading('btn-guardar-tipo', false); }
}

async function toggleTipo(id) {
  const tipo = tipos.find(t => t.id === id);
  if (!tipo) return;
  const activar = !tipo.activo;
  confirmar({
    titulo: activar ? '✅ Activar Tipo' : '🚫 Desactivar Tipo',
    mensaje: '¿' + (activar ? 'Activar' : 'Desactivar') + ' el tipo <strong>' + esc(tipo.id + ' ' + tipo.nombre) + '</strong>?' + (activar ? '' : '<br><br>Los registros existentes no se verán afectados, pero el tipo dejará de aparecer en el formulario de registro.'),
    icono: activar ? '✅' : '🚫',
    btnTxt: activar ? 'Sí, activar' : 'Sí, desactivar',
    onConfirm: async () => {
      try {
        const res = await PUT('/api/tipos/' + encodeURIComponent(id), { nombre: tipo.nombre, es_valor: tipo.es_valor, activo: activar ? 1 : 0 });
        if (!res.ok) { showToast('Error', 'error'); return; }
        const updated = await res.json();
        const idx = tipos.findIndex(t => t.id === updated.id);
        if (idx >= 0) tipos[idx] = updated;
        showToast('Tipo ' + (activar ? 'activado' : 'desactivado') + ': ' + id, 'success');
        if (typeof poblarSelectTipos === 'function') {
          poblarSelectTipos('reg-tipo');
          poblarSelectTipos('fil-tipo');
          poblarSelectTipos('rpt-tipo');
        }
        renderTipos();
      } catch (e) { showToast('Error: ' + e.message, 'error'); }
    }
  });
}
