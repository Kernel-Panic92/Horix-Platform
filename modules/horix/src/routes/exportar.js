const express = require('express');

function esTipoValor(db, tipo) {
  if (!tipo) return false;
  const row = db.prepare('SELECT es_valor FROM tipos WHERE id = ?').get(tipo);
  return row ? row.es_valor === 1 : false;
}

module.exports = function({ db, ExcelJS, getConfig, enviarCorreo, rolTienePermiso, middlewares: { autenticar, requierePermiso, todosRoles } }) {
  const router = express.Router();

  router.get('/exportar/siesa', autenticar([]), requierePermiso('siesa'), async (req, res) => {
    try {
      const { concepto, vinculo, nominaId } = req.query;
      let sql = `
        SELECT r.*, e.cedula, e.nombre AS empleadoNombre, e.sede, e.departamento
        FROM registros r
        JOIN empleados e ON r.empleadoId = e.id
        WHERE r.estado = 'aprobado'
      `;
      const params = [];
      if (concepto) { sql += ' AND r.tipo = ?'; params.push(concepto); }
      if (vinculo) { sql += ' AND e.tipo_vinculacion = ?'; params.push(vinculo); }
      if (nominaId) { sql += ' AND r.nominaId = ?'; params.push(nominaId); }
      sql += ' ORDER BY e.nombre, r.fecha';

      const rows = db.prepare(sql).all(...params);
      if (!rows.length) return res.status(404).json({ error: 'No hay registros aprobados para exportar.' });

      const data = rows.map(r => {
        const esValor = esTipoValor(db, r.tipo);
        const cedula = (r.cedula || '').trim();
        const horas = r.horas != null ? r.horas : '';
        const valor = r.transporte != null ? r.transporte : '';
        return { A: cedula, B: r.empleadoNombre || '', C: r.tipo || '', D: '', E: '', F: '',
                 G: esValor ? '' : horas, H: esValor ? valor : '', I: '', J: '', K: '', L: '',
                 M: '', N: '', O: '', P: '', Q: '', R: '', S: '', T: r.observaciones || '' };
      });

      const headers = [
        'CODIGO DEL EMPLEADO (Obligatorio)', 'SUCURSAL (Obligatorio)', 'CODIGO DEL CONCEPTO (Obligatorio)',
        'CENTRO DE OPERACION (No obligatorio Vacío asume el centro de operación del contrato)',
        'CENTRO DE COSTO (No obligatorio Vacío asume el centro de costo del contrato)',
        'FECHA MOVIMIENTO (YYYYMMDD No obligatorio)',
        'HORAS (Puede recibir dos decimales con separador punto (.). Obligatorio)',
        'VALOR (Puede recibir dos decimales con separador punto (.) Obligatorio)',
        'CANTIDAD (No obligatorio)', 'PROYECTO (No obligatorio Vacío asume el proyecto del contrato)',
        'NUMERO DE CONTRATO DEL EMPLEADO (No obligatorio si el empleado tiene 1 contrato activo se toma este de lo contrario genera error)',
        'UNIDAD DE NEGOCIO (No obligatorio Vacío asume la unidad de negocio del contrato)',
        'FECHA DE CAUSACION (YYYYMMDD No obligatorio)', 'NUMERO DE CUOTA (No obligatorio)',
        'FECHA INICIAL (Obligatorio si el concepto es liquidacion por agrupacion YYYYMMDD)',
        'FECHA FINAL (Obligatorio si el concepto es liquidacion por agrupacion YYYYMMDD)',
        'ID AGRUPACION (Obligatorio si el concepto es liquidacion por agrupacion)',
        'IND LIQUIDACION (Obligatorio si el concepto es liquidacion por agrupacion 0 = Sueldo 1 = Sueldo+Promedio 2 = Promedio de agrupacion)',
        'DIAS (No Obligatorio)', 'NOTAS (No obligatorio)'
      ];

      const wb = new ExcelJS.Workbook();
      wb.creator = 'Horix';
      const ws = wb.addWorksheet('Novedades');
      const headerRow = ws.addRow(headers);
      headerRow.eachCell((cell) => { cell.font = { bold: true, size: 11, name: 'Calibri' }; cell.alignment = { horizontal: 'center', vertical: 'center', wrapText: true }; });
      headerRow.height = 30;

      data.forEach(r => {
        const aVal = r.A != null && r.A !== '' ? Number(r.A) : null;
        const gVal = r.G != null && r.G !== '' ? Number(r.G) : null;
        const hVal = r.H != null && r.H !== '' ? Number(r.H) : null;
        ws.addRow([aVal, r.B||null, r.C||null, null,null,null, gVal, hVal, null,null,null, null,null,null, null,null,null, null,null, r.T||null]);
      });

      const colWidths = [38,45,38,20,20,16,44,38,16,20,20,20,20,16,20,20,20,16,12,30];
      colWidths.forEach((w,i)=>{ws.getColumn(i+1).width=w;});
      ws.views=[{state:'frozen',ySplit:1}];
      const buf=await wb.xlsx.writeBuffer();
      const filename=`novedades_siesa_${new Date().toISOString().slice(0,10)}.xlsx`;
      res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(filename)}"`);
      res.send(Buffer.from(buf));
    } catch(e) { console.error('Error exportando siesa:', e.message); res.status(500).json({error:'Error generando archivo'}); }
  });

  router.post('/exportar/reporte', todosRoles, async (req, res) => {
    try {
      const { filters } = req.body;
      let sql = `
        SELECT r.*, e.nombre AS empleadoNombre, e.cedula, e.cargo, e.departamento, e.sede,
               e.tipo_vinculacion, n.nombre AS nominaNombre, u.nombre AS creadorNombre,
               t.nombre AS tipoNombre, ua.nombre AS aprobadorNombre
        FROM registros r
        LEFT JOIN empleados e ON r.empleadoId = e.id
        LEFT JOIN nominas n ON r.nominaId = n.id
        LEFT JOIN usuarios u ON r.creadoPor = u.id
        LEFT JOIN tipos t ON r.tipo = t.id
        LEFT JOIN usuarios ua ON r.aprobadoPor = ua.id
        WHERE 1=1`;
      const params = [];
      if (filters.empleadoId) { sql += ' AND r.empleadoId = ?'; params.push(filters.empleadoId); }
      if (filters.nominaId) { sql += ' AND r.nominaId = ?'; params.push(filters.nominaId); }
      if (filters.sede) { sql += ' AND e.sede = ?'; params.push(filters.sede); }
      if (filters.tipo) { sql += ' AND r.tipo = ?'; params.push(filters.tipo); }
      if (filters.estado) { sql += ' AND r.estado = ?'; params.push(filters.estado); }
      if (filters.vinculo) { sql += ' AND e.tipo_vinculacion = ?'; params.push(filters.vinculo); }
      if (filters.fechaDesde) { sql += ' AND r.fecha >= ?'; params.push(filters.fechaDesde); }
      if (filters.fechaHasta) { sql += ' AND r.fecha <= ?'; params.push(filters.fechaHasta); }
      const u = db.prepare('SELECT rol, sede FROM usuarios WHERE id = ?').get(req.usuario.id);
      const verTodos = rolTienePermiso(u.rol, 'ver_todos');
      const verSede = rolTienePermiso(u.rol, 'ver_sede');
      const verPropios = rolTienePermiso(u.rol, 'ver_propios');
      const efectivo = verTodos ? 'todos' : verSede ? 'sede' : 'propios';
      if (efectivo === 'sede') { sql += ' AND e.sede = ?'; params.push(u.sede); }
      else if (efectivo === 'propios') { sql += ' AND r.creadoPor = ?'; params.push(req.usuario.id); }
      if (efectivo === 'todos' && filters.sede) { sql += ' AND e.sede = ?'; params.push(filters.sede); }
      sql += ' ORDER BY r.fecha DESC';

      const rows = db.prepare(sql).all(...params);
      if (!rows.length) return res.status(404).json({ error: 'No hay datos para exportar' });

      const wb = new ExcelJS.Workbook();
      wb.creator = 'Horix';
      const ws = wb.addWorksheet('Reporte Horas Extra');

      const columns = [
        { header:'Empleado',key:'empleadoNombre',width:30 }, { header:'Cédula',key:'cedula',width:18 },
        { header:'Cargo',key:'cargo',width:25 }, { header:'Departamento',key:'departamento',width:22 },
        { header:'Período',key:'nominaNombre',width:22 }, { header:'Fecha',key:'fecha',width:14 },
        { header:'Horas',key:'horas',width:10 }, { header:'Tipo',key:'tipo',width:12 },
        { header:'Descripción',key:'descripcion',width:22 },
        { header:'Motivo',key:'motivo',width:22 }, { header:'Estado',key:'estado',width:14 },
        { header:'Aprobador',key:'aprobador',width:25 }, { header:'Valor COP',key:'valor',width:16 },
        { header:'Registrado por',key:'creadorNombre',width:22 },
      ];

      const hStyle={font:{bold:true,color:{argb:'FFFFFFFF'},size:11,name:'Calibri'},fill:{type:'pattern',pattern:'solid',fgColor:{argb:'FF2563EB'}},alignment:{horizontal:'center',vertical:'center',wrapText:true},border:{top:{style:'thin',color:{argb:'FFCCCCCC'}},bottom:{style:'thin',color:{argb:'FFCCCCCC'}},left:{style:'thin',color:{argb:'FFCCCCCC'}},right:{style:'thin',color:{argb:'FFCCCCCC'}}}};
      const cBorder={top:{style:'thin',color:{argb:'FFE0E0E0'}},bottom:{style:'thin',color:{argb:'FFE0E0E0'}},left:{style:'thin',color:{argb:'FFE0E0E0'}},right:{style:'thin',color:{argb:'FFE0E0E0'}}};
      const altFill={type:'pattern',pattern:'solid',fgColor:{argb:'FFF2F4F7'}};

      const hr=ws.addRow(columns.map(c=>c.header));
      hr.eachCell(c=>{c.font=hStyle.font;c.fill=hStyle.fill;c.alignment=hStyle.alignment;c.border=hStyle.border;});
      hr.height=30;

      rows.forEach((r,i)=>{
        const estado=r.estado==='aprobado'?'Aprobado':r.estado==='rechazado'?'Rechazado':'Pendiente';
        const aprob=r.estado==='rechazado'||r.estado==='aprobado'?(r.aprobadorNombre||r.aprobadoPor||r.aprobador||''):'';
        const isValor=esTipoValor(db, r.tipo);
        const row=ws.addRow([r.empleadoNombre||'',r.cedula||'',r.cargo||'',r.departamento||'',r.nominaNombre||'',r.fecha||'',r.horas!=null?r.horas:0,r.tipo||'',r.tipoNombre||r.tipo||'',r.motivo||'',estado,aprob,!isValor?0:(r.transporte||0),r.creadorNombre||r.creadoPor||'']);
        const isAlt=i%2===1;
        row.eachCell((c,col)=>{c.border=cBorder;c.alignment={vertical:'middle'};if(isAlt)c.fill=altFill;if(col===7||col===13)c.alignment={horizontal:'right',vertical:'middle'};if(col===13&&c.value)c.numFmt='$#,##0.00';if(col===7&&c.value)c.numFmt='#,##0.00';if(col===11)c.alignment={horizontal:'center',vertical:'middle'};});
        row.height=22;
      });

      columns.forEach((c,i)=>{ws.getColumn(i+1).width=c.width;});
      ws.views=[{state:'frozen',ySplit:1}];
      ws.autoFilter={from:{row:1,col:1},to:{row:rows.length+1,col:columns.length}};

      const buf=await wb.xlsx.writeBuffer();
      const filename=`reporte_horas_extra_${new Date().toISOString().slice(0,10)}.xlsx`;
      res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition',`attachment; filename="${encodeURIComponent(filename)}"`);
      res.send(Buffer.from(buf));
    } catch(e) { console.error('Error exportando reporte:', e.message); res.status(500).json({error:'Error generando archivo'}); }
  });

  return router;
};
