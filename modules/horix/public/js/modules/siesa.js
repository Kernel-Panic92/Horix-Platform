// siesa.js - Exportar novedades a Siesa Nómina Web

let sieRegistros = [];

function seleccionarNominaActualSiesa() {
  const sel = document.getElementById('sie-nomina');
  if (!sel || sel.value) return;
  const hoy = new Date().toISOString().split('T')[0];
  let mejor = null;
  for (let i = 0; i < nominas.length; i++) {
    const n = nominas[i];
    if (n.inicio <= hoy && n.fin >= hoy) { mejor = n.id; break; }
  }
  if (!mejor && nominas.length) mejor = nominas[0].id;
  if (mejor) sel.value = mejor;
}

let _sieNominaLoaded = false;

function poblarSelectNominaSiesa() {
  const sel = document.getElementById('sie-nomina');
  if (!sel || _sieNominaLoaded) return;
  _sieNominaLoaded = true;
  let html = '<option value="">Todos los períodos</option>';
  if (typeof nominas !== 'undefined') {
    for (let i = 0; i < nominas.length; i++) {
      html += `<option value="${esc(nominas[i].id)}">${esc(nominas[i].nombre)}</option>`;
    }
  }
  sel.innerHTML = html;
  seleccionarNominaActualSiesa();
}

async function cargarSiesa() {
  poblarSelectNominaSiesa();
  const concepto = document.getElementById('sie-concepto')?.value || '';
  const vinculo = document.getElementById('sie-vinculo')?.value || '';
  const nominaId = document.getElementById('sie-nomina')?.value || '';

  try {
    const res = await GET('/api/registros');
    if (!res.ok) throw new Error('Error cargando registros');
    let data = await res.json();

    data = data.filter(r => r.estado === 'aprobado');
    if (concepto) data = data.filter(r => r.tipo === concepto);
    if (nominaId) data = data.filter(r => r.nominaId === nominaId);

    const empMap = {};
    if (typeof empleados !== 'undefined') {
      empleados.forEach(e => empMap[e.id] = e);
    }

    if (vinculo) {
      data = data.filter(r => {
        const emp = empMap[r.empleadoId];
        return emp && (emp.tipo_vinculacion || 'vinculado') === vinculo;
      });
    }

    sieRegistros = data.map(r => {
      const emp = empMap[r.empleadoId] || {};
      return { ...r, empCedula: emp.cedula || '', empNombre: emp.nombre || '', empSede: emp.sede || '' };
    });

    renderSiePreview();
  } catch (e) {
    showToast('Error cargando datos: ' + e.message, 'error');
  }
}

function renderSiePreview() {
  const tbody = document.getElementById('sie-body');
  const count = document.getElementById('sie-count');
  if (!tbody) return;

  if (!sieRegistros.length) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px;">No hay registros aprobados para exportar.</td></tr>';
    if (count) count.textContent = '0 registros';
    return;
  }

  if (count) count.textContent = sieRegistros.length + ' registros';

  tbody.innerHTML = sieRegistros.map(r => {
    const esValor = ['202','621','222'].includes(r.tipo);
    return '<tr>' +
      '<td>' + esc(r.empNombre) + '</td>' +
      '<td>' + esc(r.empCedula) + '</td>' +
      '<td>' + esc(r.empSede) + '</td>' +
      '<td>' + esc(nombreTipo(r.tipo)) + '</td>' +
      '<td>' + (esValor ? '—' : esc(decimalAHoraMinuto(r.horas))) + '</td>' +
      '<td>' + (esValor ? '$' + Number(r.transporte || 0).toLocaleString('es-CO') : '—') + '</td>' +
      '<td><span class="badge-' + r.estado + '">' + r.estado + '</span></td>' +
      '</tr>';
  }).join('');
}

async function exportarSiesa() {
  const concepto = document.getElementById('sie-concepto')?.value || '';
  const vinculo = document.getElementById('sie-vinculo')?.value || '';
  const nominaId = document.getElementById('sie-nomina')?.value || '';

  try {
    const params = new URLSearchParams();
    if (concepto) params.set('concepto', concepto);
    if (vinculo) params.set('vinculo', vinculo);
    if (nominaId) params.set('nominaId', nominaId);

    const url = '/api/exportar/siesa?' + params.toString();
    const res = await fetch(url);

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Error desconocido' }));
      showToast(err.error || 'Error exportando', 'error');
      return;
    }

    const blob = await res.blob();
    const urlBlob = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = urlBlob;
    a.download = `novedades_siesa_${new Date().toISOString().slice(0, 10)}.xlsx`;
    a.click();
    URL.revokeObjectURL(urlBlob);
    showToast('Archivo exportado correctamente.', 'success');
    if (typeof enviarTelemetria === 'function') enviarTelemetria('exportar_siesa', { concepto, vinculo, nominaId });
  } catch (e) {
    showToast('Error: ' + e.message, 'error');
  }
}

// Auto-load when page becomes visible
document.addEventListener('DOMContentLoaded', () => {
  const observer = new MutationObserver(() => {
    const page = document.getElementById('page-siesa');
    if (page && page.classList.contains('active')) {
      cargarSiesa();
    }
  });
  const appScreen = document.getElementById('app-screen');
  if (appScreen) observer.observe(appScreen, { attributes: true, subtree: true, attributeFilter: ['class'] });
});
