const cron = require('node-cron');
const db = require('../db');
const { runScan } = require('./scanService');

const jobs = new Map();

function removeJob(connectionId) {
  const t = jobs.get(connectionId);
  if (t) {
    t.stop();
    jobs.delete(connectionId);
  }
}

function scheduleConnection(connectionId) {
  removeJob(connectionId);
  const row = db.prepare('SELECT polling_interval_mins, status FROM dc_connections WHERE id = ?').get(connectionId);
  if (!row || row.status !== 'active') return;

  const rawMins = Math.max(1, Math.min(1440, row.polling_interval_mins || 30));

  // node-cron minute field only supports 0-59 steps; for >= 60 min use hour-level cron
  let expr;
  if (rawMins < 60) {
    expr = `*/${rawMins} * * * *`;
  } else {
    const hours = Math.max(1, Math.round(rawMins / 60));
    expr = `0 */${hours} * * *`;
  }
  if (!cron.validate(expr)) {
    console.warn('[scheduler] Invalid cron for connection', connectionId, expr);
    return;
  }
  const task = cron.schedule(expr, () => {
    runScan(connectionId, 'scheduler').catch((err) => {
      console.error(`[scheduler] Scan failed ${connectionId}:`, err.message);
    });
  });
  jobs.set(connectionId, task);
  console.log(`[scheduler] Connection ${connectionId} (${expr})`);
}

function initScheduler() {
  const rows = db.prepare(`SELECT id FROM dc_connections WHERE status = 'active'`).all();
  for (const r of rows) {
    scheduleConnection(r.id);
  }
  console.log(`[scheduler] Started ${rows.length} job(s)`);
}

module.exports = {
  scheduleConnection,
  removeJob,
  initScheduler
};
