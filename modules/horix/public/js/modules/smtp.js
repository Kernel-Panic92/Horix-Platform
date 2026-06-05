// smtp.js - SMTP Configuration module for Horix

async function cargarSmtp() {
  try {
    const res = await GET('/api/configuracion');
    if (!res.ok) return;
    const cfg = await res.json();
    document.getElementById('cfg-host').value      = cfg.smtp_host      || '';
    document.getElementById('cfg-puerto').value    = cfg.smtp_puerto    || '587';
    document.getElementById('cfg-tls').value       = cfg.smtp_tls       || 'true';
    document.getElementById('cfg-usuario').value   = cfg.smtp_usuario   || '';
    document.getElementById('cfg-password').value  = '';
    document.getElementById('cfg-remitente').value = cfg.smtp_remitente || '';
    document.getElementById('cfg-asunto').value    = cfg.reset_asunto   || '';
    document.getElementById('cfg-cuerpo').value    = cfg.reset_cuerpo   || '';
  } catch { showToast('Error cargando configuración.', 'error'); }
}

async function guardarSmtp() {
  setLoading('btn-guardar-smtp', true);
  try {
    const res = await PUT('/api/configuracion', {
      smtp_host:      document.getElementById('cfg-host').value.trim(),
      smtp_puerto:    document.getElementById('cfg-puerto').value.trim(),
      smtp_tls:       document.getElementById('cfg-tls').value,
      smtp_usuario:   document.getElementById('cfg-usuario').value.trim(),
      smtp_password:  document.getElementById('cfg-password').value,
      smtp_remitente: document.getElementById('cfg-remitente').value.trim(),
      reset_asunto:   document.getElementById('cfg-asunto').value.trim(),
      reset_cuerpo:   document.getElementById('cfg-cuerpo').value
    });
    if (res.ok) {
      showToast('✓ Configuración guardada.');
      document.getElementById('cfg-password').value = '';
    } else {
      const data = await res.json();
      showToast(data.error || 'Error al guardar', 'error');
    }
  } catch(e) { showToast(e.message, 'error'); }
  setLoading('btn-guardar-smtp', false);
}

async function testSmtp() {
  setLoading('btn-test-smtp', true);
  try {
    const res = await POST('/api/configuracion/test', {});
    const data = await res.json();
    if (res.ok) {
      showToast('✓ Correo de prueba enviado a tu cuenta.');
    } else {
      showToast(data.error || 'Error al enviar correo de prueba', 'error');
    }
  } catch(e) { showToast('Error: ' + e.message, 'error'); }
  setLoading('btn-test-smtp', false);
}
