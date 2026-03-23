const express = require('express');
const router = express.Router();
const { testConnection } = require('../services/accClient');
const {
  listConnections,
  createConnection,
  getWithSecrets,
  deleteConnection
} = require('../services/connectionService');
const { runScan, listViolations, listScanRuns } = require('../services/scanService');
const { scheduleConnection, removeJob } = require('../services/scheduler');

function optionalApiGuard(req, res, next) {
  const expected = process.env.DOC_CONTROLLER_API_KEY;
  if (!expected) return next();
  const got = req.headers['x-doc-controller-api-key'];
  if (got !== expected) {
    return res.status(401).json({ success: false, error: 'Invalid or missing X-Doc-Controller-Api-Key' });
  }
  next();
}

router.get('/health', (req, res) => {
  res.json({ ok: true, service: 'capsar-doc-controller' });
});

router.get('/connections', optionalApiGuard, (req, res) => {
  res.json({ success: true, connections: listConnections() });
});

router.post('/connections', optionalApiGuard, (req, res) => {
  try {
    const c = createConnection(req.body || {});
    scheduleConnection(c.id);
    res.status(201).json({ success: true, connection: c });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

router.post('/connections/:id/test-acc', optionalApiGuard, async (req, res) => {
  try {
    const conn = getWithSecrets(req.params.id);
    if (!conn) return res.status(404).json({ success: false, error: 'Not found' });
    const folderId = (conn.accFolderIds && conn.accFolderIds[0]) || req.body?.accFolderId;
    if (!folderId) {
      return res.status(400).json({ success: false, error: 'No folder configured' });
    }
    const result = await testConnection(
      conn.aps_client_id,
      conn.aps_client_secret,
      conn.accProjectId,
      folderId
    );
    res.json({ success: true, ...result });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

router.delete('/connections/:id', optionalApiGuard, (req, res) => {
  removeJob(req.params.id);
  deleteConnection(req.params.id);
  res.json({ success: true });
});

router.post('/connections/:id/scan', optionalApiGuard, async (req, res) => {
  try {
    const out = await runScan(req.params.id, 'manual');
    res.json({ success: true, ...out });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

router.get('/connections/:id/violations', optionalApiGuard, (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 200;
  res.json({ success: true, violations: listViolations(req.params.id, limit) });
});

router.get('/connections/:id/scans', optionalApiGuard, (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 20;
  res.json({ success: true, scans: listScanRuns(req.params.id, limit) });
});

router.use((req, res) => {
  res.status(404).json({ success: false, error: 'Not found' });
});

// Express error handler
router.use((err, req, res, _next) => {
  console.error('[api]', err);
  const status = err.status || 500;
  res.status(status).json({ success: false, error: err.message || 'Internal error' });
});

module.exports = { router };
