const express = require('express');
const { execFile } = require('child_process');

function toCSV(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = v => `"${String(v??'').replace(/"/g,'""')}"`;
  return [cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n');
}

module.exports = function createBackupRouter({
  db, AdmZip, fs, path, __dirname, encryptSmtp, getConfig, getAdminEmail, enviarCorreo, middlewares, restoreData, parseCookies
}) {
  const router = express.Router();
  const { soloAdminOBkp, soloAdmin } = middlewares;

  // GET /export — JSON export for MCP Gateway orchestrator
  router.get('/export', soloAdmin, (req, res) => {
    try {
      const cfg = getConfig();
      const data = { version: '1.0', generado: new Date().toISOString(), app: 'HorasExtra', configuracion: cfg,
        usuarios: db.prepare('SELECT id,nombre,email,password,rol,sede,activo,cambio_password,creado FROM usuarios').all(),
        empleados: db.prepare('SELECT * FROM empleados').all(),
        nominas: db.prepare('SELECT * FROM nominas').all(),
        registros: db.prepare('SELECT * FROM registros').all(),
        usuario_empleados: db.prepare('SELECT * FROM usuario_empleados').all(),
        dashboard_layout: db.prepare('SELECT * FROM dashboard_layout').all(),
        centros: db.prepare('SELECT * FROM centros').all(),
        tipos: db.prepare('SELECT * FROM tipos').all(),
        roles: db.prepare('SELECT * FROM roles').all(),
        permisos_roles: db.prepare('SELECT * FROM permisos_roles').all(),
        configuracion: db.prepare('SELECT * FROM configuracion').all(),
        auditoria_logins: db.prepare('SELECT * FROM auditoria_logins ORDER BY timestamp DESC LIMIT 5000').all(),
      };
      res.json(data);
    } catch (e) { console.error('Error exportando datos:', e.message); res.status(500).json({ error: 'Error exportando datos' }); }
  });

  // GET /
  router.get('/', soloAdminOBkp, (req, res) => {
    try {
      const cfg = getConfig();
      const data = { version: '1.0', generado: new Date().toISOString(), app: 'HorasExtra', configuracion: cfg,
        usuarios: db.prepare('SELECT id,nombre,email,password,rol,sede,activo,cambio_password,creado FROM usuarios').all(),
        empleados: db.prepare('SELECT * FROM empleados').all(),
        nominas: db.prepare('SELECT * FROM nominas').all(),
        registros: db.prepare('SELECT * FROM registros').all(),
        usuario_empleados: db.prepare('SELECT * FROM usuario_empleados').all(),
        dashboard_layout: db.prepare('SELECT * FROM dashboard_layout').all(),
      };
      const zip = new AdmZip();
      zip.addFile('backup.json', Buffer.from(JSON.stringify(data, null, 2), 'utf8'));
      zip.addFile('empleados.csv', Buffer.from(toCSV(data.empleados), 'utf8'));
      zip.addFile('nominas.csv', Buffer.from(toCSV(data.nominas), 'utf8'));
      zip.addFile('registros.csv', Buffer.from(toCSV(data.registros), 'utf8'));
      zip.addFile('usuarios.csv', Buffer.from(toCSV(data.usuarios), 'utf8'));
      const fecha = new Date().toISOString().slice(0, 10);
      const filename = `horasextra_backup_${fecha}.zip`;
      const buffer = zip.toBuffer();
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Length', buffer.length);
      res.end(buffer);
    } catch (e) { console.error('Error generando backup:', e.message); res.status(500).json({ error: 'Error generando backup' }); }
  });

  // POST /alerta
  router.post('/alerta', soloAdminOBkp, async (req, res) => {
    const { error, detalle } = req.body;
    const fecha = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota' });
    try {
      await enviarCorreo(getAdminEmail()||req.usuario.email, `⚠ Error en Backup Automático — HorasExtra ${fecha}`,
        `Hola,\n\nEl backup automático programado de HorasExtra falló el ${fecha}.\n\nError:\n${error||'Error desconocido'}\n\nDetalle:\n${detalle||'Sin detalle adicional'}\n\nSaludos,\nSistema Horix`);
      res.json({ ok: true });
    } catch(e) { console.error('Error enviando alerta backup:', e.message); res.status(500).json({ error: 'No se pudo enviar el correo' }); }
  });

  function getBackupDir() {
    const candidatos = ['last_backup.json', '.ultimo_backup.json'].map(f => path.join(__dirname, f));
    for (const f of candidatos) {
      try { if (fs.existsSync(f) && JSON.parse(fs.readFileSync(f,'utf8')).archivo) { const d = path.join(require('os').homedir(),'backups','horix'); if (fs.existsSync(d)) return d; } } catch (e) { console.warn('Error leyendo archivo de backup:', f, e.message); }
    }
    const fb = path.join(require('os').homedir(),'backups','horix');
    return fs.existsSync(fb) ? fb : null;
  }

  function backupFileInDir(dir, filename) {
    if (!dir||!filename||!/^horix_backup_[\w\-]+\.zip$/.test(filename)) return null;
    try { const files = fs.readdirSync(dir).filter(f=>f===filename); return files.length===1?path.join(dir,files[0]):null; } catch (e) { console.warn('Error leyendo directorio de backups:', e.message); return null; }
  }

  // GET /lista
  router.get('/lista', soloAdmin, (req, res) => {
    const dir = getBackupDir();
    if (!dir||!fs.existsSync(dir)) return res.json([]);
    try {
      const archivos = fs.readdirSync(dir).filter(f=>f.startsWith('horix_backup_')&&f.endsWith('.zip'))
        .map(f => { const st=fs.statSync(path.join(dir,f)); return {nombre:f,tamaño:st.size,fecha:st.mtime.toISOString()}; })
        .sort((a,b)=>new Date(b.fecha)-new Date(a.fecha)).slice(0,7);
      res.json(archivos);
    } catch(e) { console.error('Error listando backups:', e.message); res.status(500).json({error:'Error listando backups'}); }
  });

  // GET /descargar/:filename
  router.get('/descargar/:filename', soloAdmin, (req, res) => {
    const dir = getBackupDir();
    if (!dir) return res.status(404).json({error:'Directorio de backups no encontrado'});
    const fp = backupFileInDir(dir, req.params.filename);
    if (!fp||!fs.existsSync(fp)) return res.status(404).json({error:'Archivo no encontrado'});
    res.download(fp, req.params.filename);
  });

  // POST /restore/local/:filename — included in backup router since it's closely related
  router.post('/restore/local/:filename', soloAdmin, (req, res) => {
    const dir = getBackupDir();
    if (!dir) return res.status(404).json({error:'Directorio de backups no encontrado'});
    const fp = backupFileInDir(dir, req.params.filename);
    if (!fp||!fs.existsSync(fp)) return res.status(404).json({error:'Archivo no encontrado'});
    try {
      const zip=new AdmZip(fp), entry=zip.getEntry('backup.json');
      if (!entry) return res.status(400).json({error:'El ZIP no contiene backup.json'});
      const token = parseCookies(req).he_token || req.headers['authorization']?.replace('Bearer ', '');
      const resumen = restoreData(JSON.parse(entry.getData().toString('utf8')), req.usuario.id);
      // Reinsertar la sesión del usuario actual para no cerrarla
      if (token) db.prepare('INSERT OR IGNORE INTO sesiones (token, usuarioId, expira) VALUES (?,?,?)').run(token, req.usuario.id, new Date(Date.now() + 24*60*60*1000).toISOString());
      res.json({ok:true,mensaje:'Restauración completada correctamente', resumen});
    } catch(e) { console.error('❌ Error restaurando backup local:', e.message, e.stack?.split('\n').slice(0,4).join('\n')); res.status(500).json({error:'Error restaurando backup'}); }
  });

  // GET /ultimo
  router.get('/ultimo', soloAdmin, (req, res) => {
    res.set('Cache-Control','no-store, no-cache, must-revalidate');
    for (const f of ['last_backup.json','.ultimo_backup.json'].map(f=>path.join(__dirname,f)))
      try { if (fs.existsSync(f)) return res.json(JSON.parse(fs.readFileSync(f,'utf8'))); } catch(e) { console.warn('Error leyendo último backup:', e.message); }
    res.json(null);
  });

  // POST /ejecutar
  router.post('/ejecutar', soloAdmin, async (req, res) => {
    const sp = path.join(__dirname, 'backup_horasextra.sh');
    if (!fs.existsSync(sp)) return res.status(400).json({error:'No se encontró backup_horasextra.sh'});
    execFile('bash', [sp], {timeout:120000,maxBuffer:1024*1024}, async(err,stdout,stderr)=>{
      const lines=(stdout||'').split('\n').filter(Boolean), errs=(stderr||'').split('\n').filter(Boolean);
      const ok=lines.some(l=>l.includes('completado exitosamente')), failed=lines.some(l=>l.includes('ERROR')||l.includes('✗'));
      const admins=db.prepare("SELECT email FROM usuarios WHERE rol='admin' AND activo=1").all();
      const fecha=new Date().toLocaleString('es-CO',{timeZone:'America/Bogota'});
      const tam=lines.find(l=>l.includes('.zip')&&l.includes('Backup:'))?.match(/\(([^)]+)\)/)?.[1]||'desconocido';
      const nom=lines.find(l=>l.includes('horix_backup_'))?.match(/horix_backup_[\w\-\.]+/)?.[0]||'—';
      const redOk=lines.some(l=>l.includes('Copia en red'));
      const asunto=ok?`✅ Backup completado — Horix ${fecha}`:`❌ Error en Backup — Horix ${fecha}`;
      const texto=ok?`Backup completado.\n\nArchivo: ${nom}\nTamaño: ${tam}\nCopia NAS: ${redOk?'✓ Realizada':'No configurada'}`:`Backup falló.\n\nError: ${errs.join('; ')||'Error desconocido'}`;
      for (const a of admins) try{await enviarCorreo(a.email,asunto,texto);}catch(e){console.warn('Error enviando correo de backup:', e.message);}
      if (err&&!ok) return res.json({ok:false,salida:[...lines,...errs],error:err.message});
      res.json({ok,salida:lines,error:failed?(errs.join('; ')||'Script reportó errores'):null});
    });
  });

  return router;
};

// Separate router for /api/restore (not under /api/backup)
module.exports.createRestoreRouter = function({ db, AdmZip, encryptSmtp, middlewares, restoreData, parseCookies }) {
  const router = express.Router();
  const { soloAdmin } = middlewares;

  router.post('/', soloAdmin, require('multer')({storage:require('multer').memoryStorage(),limits:{fileSize:50*1024*1024}}).single('backup'), (req,res)=>{
    if (!req.file) return res.status(400).json({error:'No se recibió ningún archivo'});
    try {
      let data;
      if (req.file.originalname.endsWith('.zip')) {
        if (req.file.buffer.length < 4 || req.file.buffer.toString('utf8',0,4) !== 'PK\u0003\u0004')
          return res.status(400).json({error:'El archivo no es un ZIP válido'});
        const zip=new AdmZip(req.file.buffer), entry=zip.getEntry('backup.json');
        if (!entry) return res.status(400).json({error:'El ZIP no contiene backup.json'});
        data=JSON.parse(entry.getData().toString('utf8'));
      } else {
        if (!req.file.originalname.endsWith('.json'))
          return res.status(400).json({error:'Formato no soportado, use .zip o .json'});
        data=JSON.parse(req.file.buffer.toString('utf8'));
      }
      if (data.app!=='HorasExtra') return res.status(400).json({error:'Archivo de backup inválido'});
      const token = parseCookies(req).he_token || req.headers['authorization']?.replace('Bearer ', '');
      const resumen = restoreData(data,req.usuario.id);
      if (token) db.prepare('INSERT OR IGNORE INTO sesiones (token, usuarioId, expira) VALUES (?,?,?)').run(token, req.usuario.id, new Date(Date.now() + 24*60*60*1000).toISOString());
      res.json({ok:true,mensaje:'Restauración completada correctamente', resumen});
    } catch(e) {console.error('❌ Error restaurando backup subido:', e.message, e.stack?.split('\n').slice(0,4).join('\n'));res.status(500).json({error:'Error restaurando backup'});}
  });

  return router;
};
