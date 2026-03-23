const crypto = require('crypto');
const db = require('../db');
const { encryptValue, decryptValue } = require('./encryption');

function newId() {
  return crypto.randomUUID();
}

function encryptTriple(plain) {
  if (!plain) return { enc: null, iv: null, tag: null };
  const e = encryptValue(plain);
  return { enc: e.encryptedValue, iv: e.iv, tag: e.authTag };
}

function rowToPublic(row) {
  if (!row) return null;
  let folderIds = [];
  try {
    folderIds = JSON.parse(row.acc_folder_ids || '[]');
  } catch {
    folderIds = [];
  }
  return {
    id: row.id,
    name: row.name,
    capsarBaseUrl: row.capsar_base_url,
    capsarProjectId: row.capsar_project_id,
    accProjectId: row.acc_project_id,
    accFolderIds: folderIds,
    pollingIntervalMins: row.polling_interval_mins,
    lastSyncedAt: row.last_synced_at,
    lastSnapshotEtag: row.last_snapshot_etag,
    status: row.status,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function getWithSecrets(id) {
  const row = db.prepare('SELECT * FROM dc_connections WHERE id = ?').get(id);
  if (!row) return null;
  const integrationKey = decryptValue(
    row.integration_key_enc,
    row.integration_key_iv,
    row.integration_key_tag
  );
  const apsClientId = decryptValue(row.aps_client_id_enc, row.aps_client_id_iv, row.aps_client_id_tag);
  const apsSecret = decryptValue(
    row.aps_client_secret_enc,
    row.aps_client_secret_iv,
    row.aps_client_secret_tag
  );
  return {
    ...rowToPublic(row),
    integration_key: integrationKey,
    aps_client_id: apsClientId,
    aps_client_secret: apsSecret
  };
}

function listConnections() {
  return db
    .prepare('SELECT * FROM dc_connections ORDER BY created_at DESC')
    .all()
    .map(rowToPublic);
}

function createConnection(payload) {
  const {
    name,
    capsarBaseUrl,
    capsarProjectId,
    integrationKey,
    apsClientId,
    apsClientSecret,
    accProjectId,
    accFolderIds,
    pollingIntervalMins = 30
  } = payload;
  if (!name || !capsarBaseUrl || !capsarProjectId || !integrationKey) {
    const e = new Error('name, capsarBaseUrl, capsarProjectId, integrationKey are required');
    e.status = 400;
    throw e;
  }
  if (!apsClientId || !apsClientSecret || !accProjectId) {
    const e = new Error('apsClientId, apsClientSecret, accProjectId are required');
    e.status = 400;
    throw e;
  }
  const folders = Array.isArray(accFolderIds) ? accFolderIds : accFolderIds ? [accFolderIds] : [];
  if (folders.length === 0) {
    const e = new Error('accFolderIds must include at least one folder URN');
    e.status = 400;
    throw e;
  }

  const id = newId();
  const now = new Date().toISOString();
  const ik = encryptTriple(integrationKey);
  const cid = encryptTriple(apsClientId);
  const cs = encryptTriple(apsClientSecret);

  db.prepare(
    `
    INSERT INTO dc_connections (
      id, name, capsar_base_url, capsar_project_id,
      integration_key_enc, integration_key_iv, integration_key_tag,
      aps_client_id_enc, aps_client_id_iv, aps_client_id_tag,
      aps_client_secret_enc, aps_client_secret_iv, aps_client_secret_tag,
      acc_project_id, acc_folder_ids, polling_interval_mins, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `
  ).run(
    id,
    name,
    capsarBaseUrl.replace(/\/$/, ''),
    capsarProjectId,
    ik.enc,
    ik.iv,
    ik.tag,
    cid.enc,
    cid.iv,
    cid.tag,
    cs.enc,
    cs.iv,
    cs.tag,
    accProjectId,
    JSON.stringify(folders),
    pollingIntervalMins,
    now,
    now
  );

  return rowToPublic(db.prepare('SELECT * FROM dc_connections WHERE id = ?').get(id));
}

function deleteConnection(id) {
  db.prepare('DELETE FROM dc_connections WHERE id = ?').run(id);
}

function updateAfterScan(id, { etag, syncedAt, status, lastError }) {
  const now = new Date().toISOString();
  db.prepare(
    `
    UPDATE dc_connections SET
      last_snapshot_etag = COALESCE(?, last_snapshot_etag),
      last_synced_at = COALESCE(?, last_synced_at),
      status = COALESCE(?, status),
      last_error = ?,
      updated_at = ?
    WHERE id = ?
  `
  ).run(
    etag ?? null,
    syncedAt ?? null,
    status ?? null,
    lastError === undefined ? null : lastError,
    now,
    id
  );
}

module.exports = {
  listConnections,
  createConnection,
  getWithSecrets,
  deleteConnection,
  updateAfterScan,
  newId
};
