const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DOC_CONTROLLER_DB_PATH
  ? path.resolve(process.cwd(), process.env.DOC_CONTROLLER_DB_PATH)
  : path.join(__dirname, '..', 'data', 'doc-controller.db');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS dc_connections (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    capsar_base_url TEXT NOT NULL,
    capsar_project_id TEXT NOT NULL,
    integration_key_enc TEXT,
    integration_key_iv TEXT,
    integration_key_tag TEXT,
    aps_client_id_enc TEXT,
    aps_client_id_iv TEXT,
    aps_client_id_tag TEXT,
    aps_client_secret_enc TEXT,
    aps_client_secret_iv TEXT,
    aps_client_secret_tag TEXT,
    acc_project_id TEXT NOT NULL,
    acc_folder_ids TEXT NOT NULL,
    polling_interval_mins INTEGER NOT NULL DEFAULT 30,
    last_synced_at TEXT,
    last_snapshot_etag TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS dc_scan_runs (
    id TEXT PRIMARY KEY,
    connection_id TEXT NOT NULL,
    files_scanned INTEGER NOT NULL DEFAULT 0,
    violations_found INTEGER NOT NULL DEFAULT 0,
    compliance_pct REAL,
    coverage_expected INTEGER,
    coverage_matched INTEGER,
    coverage_missing_json TEXT,
    triggered_by TEXT NOT NULL DEFAULT 'scheduler',
    status TEXT NOT NULL DEFAULT 'completed',
    started_at TEXT NOT NULL,
    completed_at TEXT,
    FOREIGN KEY (connection_id) REFERENCES dc_connections(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS dc_violations (
    id TEXT PRIMARY KEY,
    connection_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    item_id TEXT,
    violation_type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'error',
    details TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (connection_id) REFERENCES dc_connections(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_dc_violations_conn ON dc_violations(connection_id);
  CREATE INDEX IF NOT EXISTS idx_dc_scan_runs_conn ON dc_scan_runs(connection_id);
`);

module.exports = db;
