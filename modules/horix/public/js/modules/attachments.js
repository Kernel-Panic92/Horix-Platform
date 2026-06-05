// attachments.js - File attachment module for Horix

let adjuntosSeleccionados = [];

function onAdjuntosSelect(event) {
  const files = event.target.files;
  if (files.length > 0) {
    agregarArchivos(files);
  }
}

function onAdjuntosDrop(event) {
  event.preventDefault();
  const files = event.dataTransfer.files;
  if (files.length > 0) {
    agregarArchivos(files);
  }
}

function agregarArchivos(files) {
  const maxSize = 10 * 1024 * 1024; // 10MB
  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 
                         'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                         'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'];
  
  Array.from(files).forEach(file => {
    if (file.size > maxSize) {
      showToast(`Archivo ${file.name} excede el tamaño máximo (10MB)`, 'warning');
      return;
    }
    
    if (!allowedTypes.includes(file.type)) {
      showToast(`Tipo de archivo no permitido: ${file.name}`, 'warning');
      return;
    }
    
    // Read file as base64
    const reader = new FileReader();
    reader.onload = (e) => {
      adjuntosSeleccionados.push({
        nombre: file.name,
        tipo: file.type,
        tamano: file.size,
        datos: e.target.result.split(',')[1] // Remove data:type;base64, prefix
      });
      renderAdjuntosSeleccionados();
    };
    reader.readAsDataURL(file);
  });
}

function renderAdjuntosSeleccionados() {
  const cont = document.getElementById('adjuntos-lista');
  if (!cont) return;
  
  cont.innerHTML = '';
  adjuntosSeleccionados.forEach((adj, i) => {
    const div = document.createElement('div');
    div.className = 'adjunto-item';
    div.innerHTML = `
      <span>${iconoMime(adj.tipo)} ${esc(adj.nombre)} (${formatBytes(adj.tamano)})</span>
      <button class="btn btn-sm btn-danger" onclick="quitarAdjunto(${i})">✗</button>
    `;
    cont.appendChild(div);
  });
}

function quitarAdjunto(i) {
  adjuntosSeleccionados.splice(i, 1);
  renderAdjuntosSeleccionados();
}

async function cargarAdjuntosEnCelda(regId) {
  const cont = document.getElementById('adjuntos-detalle');
  if (!cont) return;
  
  try {
    const res = await GET(`/api/registros/${regId}/adjuntos`);
    if (res.ok) {
      const adjuntos = await res.json();
      cont.innerHTML = '';
      adjuntos.forEach(adj => {
        const span = document.createElement('span');
        span.className = 'adjunto-badge';
        span.innerHTML = `${iconoMime(adj.tipo)} <a href="#" onclick="descargarAdjuntoAuth('${esc(adj.id)}', '${esc(adj.nombre)}')">${esc(adj.nombre)}</a>`;
        cont.appendChild(span);
      });
    }
  } catch (e) {
    console.error('Load attachments error:', e);
  }
}

function abrirModalAdjuntos(regId) {
  const modal = document.getElementById('modal-detalle');
  const lista = document.getElementById('detalle-content');
  if (!modal || !lista) return;
  
  lista.innerHTML = 'Cargando...';
  modal.classList.add('open');
  modal.style.display = 'flex';
  
  GET(`/api/registros/${regId}/adjuntos`).then(res => {
    if (res.ok) {
      res.json().then(adjuntos => {
        lista.innerHTML = '';
        if (adjuntos.length === 0) {
          lista.innerHTML = '<p>No hay archivos adjuntos</p>';
          return;
        }
        adjuntos.forEach(adj => {
          const div = document.createElement('div');
          div.className = 'adjunto-item';
          div.innerHTML = `
            <span>${iconoMime(adj.tipo)} ${esc(adj.nombre)} (${formatBytes(adj.tamano)})</span>
            <div>
              <button class="btn btn-sm btn-outline" onclick="descargarAdjuntoAuth('${esc(adj.id)}', '${esc(adj.nombre)}')">⬇️</button>
              <button class="btn btn-sm btn-danger" onclick="eliminarAdjunto('${esc(adj.id)}', '${esc(regId)}')">🗑️</button>
            </div>
          `;
          lista.appendChild(div);
        });
      });
    }
  }).catch(e => {
    console.error('Load attachments error:', e);
    lista.innerHTML = '<p>Error cargando archivos</p>';
  });
}

async function descargarAdjuntoAuth(adjId, nombre) {
  try {
    const res = await fetch(API + `/api/adjuntos/${adjId}/descargar`);
    
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = nombre;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      showToast('Error descargando archivo', 'error');
    }
  } catch (e) {
    console.error('Download error:', e);
    showToast('Error de conexión', 'error');
  }
}

async function eliminarAdjunto(adjId, regId) {
  confirmar({
    titulo: 'Eliminar Archivo',
    mensaje: '¿Seguro que deseas eliminar este archivo?',
    icono: '🗑️',
    btnTxt: 'Eliminar',
    onConfirm: async () => {
      const res = await DEL(`/api/adjuntos/${adjId}`);
      if (res.ok) {
        showToast('Archivo eliminado', 'success');
        abrirModalAdjuntos(regId);
      } else {
        const data = await res.json();
        showToast(data.error || 'Error al eliminar', 'error');
      }
    }
  });
}
