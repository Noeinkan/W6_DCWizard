const db = require('../db');
const { newId, getWithSecrets, updateAfterScan } = require('./connectionService');
const { fetchSnapshot } = require('./capsarClient');
const {
  parseNamingConvention,
  parseFilename,
  matchToMIDP,
  classifyDocument
} = require('./validationCore');
const {
  listAllFilesInFolder,
  getItemAttributes,
  attributeViolations
} = require('./accClient');
const { computeMidpCoverage } = require('./coverageService');

function deleteViolations(connectionId) {
  db.prepare('DELETE FROM dc_violations WHERE connection_id = ?').run(connectionId);
}

function insertViolation(connectionId, filename, itemId, type, severity, details) {
  const id = newId();
  const now = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO dc_violations (id, connection_id, filename, item_id, violation_type, severity, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `
  ).run(
    id,
    connectionId,
    filename,
    itemId || null,
    type,
    severity,
    details ? JSON.stringify(details) : null,
    now
  );
}

function startScanRun(connectionId, triggeredBy) {
  const id = newId();
  const now = new Date().toISOString();
  db.prepare(
    `
    INSERT INTO dc_scan_runs (id, connection_id, triggered_by, status, started_at)
    VALUES (?, ?, ?, 'running', ?)
  `
  ).run(id, connectionId, triggeredBy, now);
  return id;
}

function completeScanRun(runId, payload) {
  const now = new Date().toISOString();
  db.prepare(
    `
    UPDATE dc_scan_runs SET
      files_scanned = ?,
      violations_found = ?,
      compliance_pct = ?,
      coverage_expected = ?,
      coverage_matched = ?,
      coverage_missing_json = ?,
      status = 'completed',
      completed_at = ?
    WHERE id = ?
  `
  ).run(
    payload.filesScanned,
    payload.violationsFound,
    payload.compliancePct,
    payload.coverageExpected ?? null,
    payload.coverageMatched ?? null,
    payload.coverageMissingJson ?? null,
    now,
    runId
  );
}

async function runScan(connectionId, triggeredBy = 'manual') {
  const conn = getWithSecrets(connectionId);
  if (!conn) {
    const e = new Error('Connection not found');
    e.status = 404;
    throw e;
  }

  const runId = startScanRun(connectionId, triggeredBy);
  let filesScanned = 0;
  let violationsFound = 0;

  try {
    const snapshot = await fetchSnapshot(
      conn.capsarBaseUrl,
      conn.integration_key,
      conn.capsarProjectId
    );

    const folders = conn.accFolderIds || [];
    const byId = new Map();
    for (const folderId of folders) {
      const files = await listAllFilesInFolder(
        conn.aps_client_id,
        conn.aps_client_secret,
        conn.accProjectId,
        folderId
      );
      for (const f of files) {
        if (f.id) byId.set(f.id, f);
      }
    }
    const uniqueFiles = [...byId.values()];
    filesScanned = uniqueFiles.length;

    const convention = parseNamingConvention(snapshot.namingConventions || {});
    const midpBlock = snapshot.midp || { containers: [], milestones: [] };
    const attributeMap = snapshot.attributeMap || {};

    deleteViolations(connectionId);

    const fileResults = [];
    let nonCompliantFiles = 0;

    for (const file of uniqueFiles) {
      let fileHasViolation = false;
      const parsed = parseFilename(file.name, convention);
      if (!parsed.valid) {
        insertViolation(connectionId, file.name, file.id, 'naming', 'error', {
          errors: parsed.errors,
          parsedFields: parsed.fields
        });
        violationsFound++;
        fileHasViolation = true;
        fileResults.push({ midpMatch: { matched: false }, parsedFields: parsed.fields });
        continue;
      }

      const midpMatch = matchToMIDP(parsed.fields, midpBlock);
      const classification = classifyDocument(parsed.fields);

      if (!midpMatch.matched) {
        insertViolation(connectionId, file.name, file.id, 'midp_missing', 'warning', {
          notes: midpMatch.notes,
          parsedFields: parsed.fields
        });
        violationsFound++;
        fileHasViolation = true;
      }

      if (classification.suitability.code === 'S0') {
        insertViolation(connectionId, file.name, file.id, 'suitability', 'warning', {
          suitability: classification.suitability,
          parsedFields: parsed.fields
        });
        violationsFound++;
        fileHasViolation = true;
      }

      if (Object.keys(attributeMap).length > 0 && file.id) {
        try {
          const attrs = await getItemAttributes(
            conn.aps_client_id,
            conn.aps_client_secret,
            conn.accProjectId,
            file.id
          );
          const av = attributeViolations(parsed.fields, attributeMap, attrs);
          if (av.length) {
            insertViolation(connectionId, file.name, file.id, 'acc_metadata', 'error', {
              mismatches: av,
              parsedFields: parsed.fields
            });
            violationsFound++;
            fileHasViolation = true;
          }
        } catch {
          insertViolation(connectionId, file.name, file.id, 'acc_metadata', 'warning', {
            issue: 'Could not read item attributes from ACC'
          });
          violationsFound++;
          fileHasViolation = true;
        }
      }

      if (fileHasViolation) nonCompliantFiles++;
      fileResults.push({ midpMatch, parsedFields: parsed.fields });
    }

    const coverage = computeMidpCoverage(midpBlock, fileResults);
    for (const m of coverage.missingDeliverables) {
      insertViolation(
        connectionId,
        '(MIDP expected deliverable)',
        null,
        'coverage_missing',
        'warning',
        m
      );
      violationsFound++;
    }

    // Compliance = % of scanned files with zero violations (multi-violation files count once)
    const compliancePct =
      filesScanned > 0
        ? Math.round(((filesScanned - nonCompliantFiles) / filesScanned) * 100)
        : 100;

    completeScanRun(runId, {
      filesScanned,
      violationsFound,
      compliancePct,
      coverageExpected: coverage.expectedCount,
      coverageMatched: coverage.matchedCount,
      coverageMissingJson: JSON.stringify(coverage.missingDeliverables)
    });

    updateAfterScan(connectionId, {
      etag: snapshot.etag,
      syncedAt: new Date().toISOString(),
      status: 'active',
      lastError: null
    });

    return {
      runId,
      filesScanned,
      violationsFound,
      compliancePct,
      coverage
    };
  } catch (err) {
    const now = new Date().toISOString();
    db.prepare(
      `UPDATE dc_scan_runs SET status = 'failed', completed_at = ? WHERE id = ?`
    ).run(now, runId);
    updateAfterScan(connectionId, {
      status: 'error',
      lastError: err.message || String(err)
    });
    throw err;
  }
}

function listViolations(connectionId, limit = 200) {
  return db
    .prepare(
      `SELECT * FROM dc_violations WHERE connection_id = ? ORDER BY created_at DESC LIMIT ?`
    )
    .all(connectionId, limit)
    .map((row) => ({
      ...row,
      details: row.details ? JSON.parse(row.details) : null
    }));
}

function listScanRuns(connectionId, limit = 20) {
  return db
    .prepare(
      `SELECT * FROM dc_scan_runs WHERE connection_id = ? ORDER BY started_at DESC LIMIT ?`
    )
    .all(connectionId, limit);
}

module.exports = {
  runScan,
  listViolations,
  listScanRuns
};
