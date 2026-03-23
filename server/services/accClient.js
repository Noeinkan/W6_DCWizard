const https = require('https');
const { URL } = require('url');

const APS_BASE = 'https://developer.api.autodesk.com';
const tokenCache = new Map();

function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const opts = { hostname: parsed.hostname, path: parsed.pathname + parsed.search, headers };
    const req = https.get(opts, (res) => {
      let body = '';
      res.on('data', (c) => {
        body += c;
      });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          const err = new Error(`APS ${res.statusCode}: ${body.slice(0, 500)}`);
          err.status = res.statusCode;
          return reject(err);
        }
        resolve(body);
      });
    });
    req.on('error', reject);
  });
}

async function getAccessToken(clientId, clientSecret) {
  const cached = tokenCache.get(clientId);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: 'data:read'
  }).toString();

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const data = await httpPost(
    `${APS_BASE}/authentication/v2/token`,
    body,
    {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`
    }
  );
  const parsed = JSON.parse(data);
  if (!parsed.access_token) {
    const err = new Error(parsed.developerMessage || parsed.error || 'APS auth failed');
    err.status = 401;
    throw err;
  }
  tokenCache.set(clientId, {
    token: parsed.access_token,
    expiresAt: Date.now() + (parsed.expires_in - 60) * 1000
  });
  return parsed.access_token;
}

function httpPost(urlStr, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const opts = {
      hostname: parsed.hostname,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        'Content-Length': Buffer.byteLength(body),
        ...headers
      }
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', (c) => {
        data += c;
      });
      res.on('end', () => {
        if (res.statusCode >= 400) {
          const err = new Error(`APS ${res.statusCode}: ${data.slice(0, 500)}`);
          err.status = res.statusCode;
          return reject(err);
        }
        resolve(data);
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * One page of folder contents (items + folders).
 */
async function listFolderPage(clientId, clientSecret, projectId, folderId, pageUrl) {
  const token = await getAccessToken(clientId, clientSecret);
  const base = `${APS_BASE}/data/v1/projects/${encodeURIComponent(projectId)}/folders/${encodeURIComponent(folderId)}/contents`;
  const url = pageUrl || base;
  const raw = await httpGet(url, { Authorization: `Bearer ${token}` });
  const json = JSON.parse(raw);
  const items = [];
  for (const row of json.data || []) {
    if (row.type === 'items') {
      items.push({
        id: row.id,
        name: row.attributes?.displayName || row.attributes?.name || '',
        lastModifiedTime: row.attributes?.lastModifiedTime || null,
        versionNumber: row.attributes?.versionNumber || null
      });
    }
  }
  const next = json.links?.next || null;
  return { items, next };
}

/**
 * All files in a folder (paginated via links.next).
 */
async function listAllFilesInFolder(clientId, clientSecret, projectId, folderId) {
  const out = [];
  let next = null;
  do {
    const page = await listFolderPage(clientId, clientSecret, projectId, folderId, next);
    out.push(...page.items.filter((f) => f.name));
    next = page.next;
  } while (next);
  return out;
}

async function getItemAttributes(clientId, clientSecret, projectId, itemId) {
  const token = await getAccessToken(clientId, clientSecret);
  const url = `${APS_BASE}/data/v1/projects/${encodeURIComponent(projectId)}/items/${encodeURIComponent(itemId)}`;
  const raw = await httpGet(url, { Authorization: `Bearer ${token}` });
  const json = JSON.parse(raw);
  const attrs = json.data?.attributes || {};
  const flat = { ...attrs };
  if (json.data?.relationships?.tip?.data?.id) {
    flat.tipVersionId = json.data.relationships.tip.data.id;
  }
  return flat;
}

/**
 * Compare Capsar attributeMap (bepFieldKey -> ACC display name) to item attributes (case-insensitive keys).
 */
function findAttributeValue(attrs, accDisplayName) {
  if (!accDisplayName || !attrs) return undefined;
  const want = String(accDisplayName).toLowerCase();
  for (const [k, v] of Object.entries(attrs)) {
    if (String(k).toLowerCase() === want) return v != null ? String(v) : '';
  }
  for (const [k, v] of Object.entries(attrs)) {
    if (String(k).toLowerCase().includes(want)) return v != null ? String(v) : '';
  }
  return undefined;
}

function attributeViolations(parsedFields, attributeMap, itemAttrs) {
  const violations = [];
  if (!attributeMap || typeof attributeMap !== 'object') return violations;
  for (const [bepKey, accName] of Object.entries(attributeMap)) {
    const parsedVal = parsedFields[bepKey];
    if (parsedVal === undefined || parsedVal === '') continue;
    const accVal = findAttributeValue(itemAttrs, accName);
    if (accVal === undefined) {
      violations.push({ bepKey, accName, issue: 'missing_on_item', expected: parsedVal });
      continue;
    }
    if (String(accVal).trim() !== String(parsedVal).trim()) {
      violations.push({ bepKey, accName, issue: 'mismatch', expected: parsedVal, actual: accVal });
    }
  }
  return violations;
}

async function testConnection(clientId, clientSecret, projectId, folderId) {
  try {
    await listFolderPage(clientId, clientSecret, projectId, folderId, null);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = {
  getAccessToken,
  listFolderPage,
  listAllFilesInFolder,
  getItemAttributes,
  attributeViolations,
  testConnection
};
