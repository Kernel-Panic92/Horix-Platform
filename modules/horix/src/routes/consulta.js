const express = require('express');
const { ejecutarTool } = require('../mcp/index');

module.exports = function ({ db }) {
  const router = express.Router();

  router.post('/consulta', async (req, res) => {
    try {
      const { tool, args } = req.body;
      if (!tool || typeof tool !== 'string') return res.status(400).json({ error: 'Tool requerida' });
      if (args !== undefined && (typeof args !== 'object' || Array.isArray(args) || args === null)) {
        return res.status(400).json({ error: 'Args inválidos' });
      }
      const resultado = await ejecutarTool(tool, args || {});
      res.json({ ok: true, data: resultado });
    } catch (e) {
      res.status(400).json({ error: e.message });
    }
  });

  return router;
};
