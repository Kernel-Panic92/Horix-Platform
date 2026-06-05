// import.js - CSV Import module for Horix

let _impFile = null;

function abrirModalImportarEmp() {
  const modal = document.getElementById('modal-importar-emp');
  if (modal) {
    modal.classList.add('open');
    modal.style.display = 'flex';
    _impFile = null;
    const info = document.getElementById('imp-filename');
    if (info) {
      info.textContent = '';
      info.style.display = 'none';
    }
    const btn = document.getElementById('btn-confirmar-importar');
    if (btn) {
      btn.disabled = true;
      btn.style.opacity = '0.5';
    }
  } else {
    console.error('modal-importar-emp NOT FOUND');
  }
}

function handleImpDrop(e) {
  e.preventDefault();
  e.currentTarget.classList.remove('drag-over');

  const file = e.dataTransfer.files[0];
  if (!file) return;

  if (!file.name.endsWith('.csv')) {
    showToast('Solo se permiten archivos CSV', 'warning');
    return;
  }

  _impFile = file;
  const info = document.getElementById('imp-filename');
  if (info) {
    info.textContent = `Archivo: ${file.name} (${formatBytes(file.size)})`;
    info.style.display = 'block';
  }
  const btn = document.getElementById('btn-confirmar-importar');
  if (btn) {
    btn.disabled = false;
    btn.style.opacity = '1';
  }
}

function seleccionarImpFile(input) {
  const file = input.files[0];
  if (!file) return;

  if (!file.name.endsWith('.csv')) {
    showToast('Solo se permiten archivos CSV', 'warning');
    return;
  }

  _impFile = file;
  const info = document.getElementById('imp-filename');
  if (info) {
    info.textContent = `Archivo: ${file.name} (${formatBytes(file.size)})`;
    info.style.display = 'block';
  }
  const btn = document.getElementById('btn-confirmar-importar');
  if (btn) {
    btn.disabled = false;
    btn.style.opacity = '1';
  }
}

async function confirmarImportarEmp() {
  if (!_impFile) {
    showToast('Selecciona un archivo CSV primero', 'warning');
    return;
  }

  confirmar({
    titulo: 'Importar Empleados',
    mensaje: `¿Importar empleados desde el archivo "${_impFile.name}"?`,
    icono: '📥',
    onConfirm: async () => {
      setLoading('btn-confirmar-importar', true);

      try {
        const fd = new FormData();
        fd.append('archivo', _impFile);

        const res = await fetchCSRF('/api/empleados/importar', {
          method: 'POST',
          body: fd
        });

        const data = await res.json();

        if (res.ok) {
          let msg = `${data.agregados} empleados importados`;
          if (data.omitidos > 0) msg += `, ${data.omitidos} omitidos (duplicados)`;
          if (data.errores > 0) msg += `, ${data.errores} con errores`;
          showToast(msg, 'success');
          cerrarModal('modal-importar-emp');
          _impFile = null;
          await loadAll();
          if (typeof renderEmpleados === 'function') renderEmpleados();
        } else {
          showToast(data.error || 'Error al importar', 'error');
        }
      } catch (e) {
        console.error('Import error:', e);
        showToast('Error de conexión', 'error');
      } finally {
        setLoading('btn-confirmar-importar', false);
      }
    }
  });
}
