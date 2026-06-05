module.exports = function({ getConfig, nodemailer, escapeHtml, BASE_URL, APP_NAME }) {
  return async function enviarCorreo(para, asunto, texto, htmlAdicional = '') {
    const cfg = getConfig();
    const transporter = nodemailer.createTransport({
      host:       cfg.smtp_host,
      port:       parseInt(cfg.smtp_puerto),
      secure:     cfg.smtp_puerto === '465',
      requireTLS: cfg.smtp_tls === 'true',
      auth:       { user: cfg.smtp_usuario, pass: cfg.smtp_password },
      tls:        { rejectUnauthorized: process.env.NODE_ENV === 'production' },
      connectionTimeout: 5000,
      greetingTimeout: 5000
    });

    const cuerpoHtml = escapeHtml(String(texto)).replace(/\n/g, '<br/><br/>');
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8"/>
<title>Horix - Horas Extra</title>
<style>
@media only screen and (max-width: 620px) {
  .email-container { width: 100% !important; padding: 20px 15px !important; }
  .email-content { font-size: 15px !important; }
  .email-title { font-size: 24px !important; }
}
</style>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f6f9;min-height:100vh;">
<tr>
<td align="center" style="padding:20px 10px;">
<table class="email-container" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;border:1px solid #e0e4ea;max-width:100%;">
<tr>
<td align="center" class="email-content" style="padding:30px 25px;color:#2c3e50;font-size:15px;line-height:1.8;text-align:left;">
<h1 class="email-title" style="color:#2563eb;font-size:28px;margin:0 0 8px;font-weight:bold;">Horix</h1>
<p style="color:#6b7a8f;font-size:13px;margin:0 0 25px;">Sistema de Control de Horas Extra</p>
<div>${cuerpoHtml}${htmlAdicional}</div>
<div style="margin-top:25px;padding-top:18px;border-top:1px solid #e0e4ea;text-align:center;">
<a href="${BASE_URL}" style="color:#2563eb;text-decoration:none;font-size:13px;">${APP_NAME}</a>
</div>
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`;

    await transporter.sendMail({
      from: cfg.smtp_remitente,
      to: para,
      subject: asunto,
      text: texto,
      html
    });
  };
};
