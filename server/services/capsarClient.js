const https = require('https');
const { URL } = require('url');

/**
 * @param {string} baseUrl e.g. http://localhost:3001
 * @param {string} integrationKey plaintext
 * @param {string} projectId
 * @param {{ draftId?: string, midpId?: string }} query
 */
async function fetchSnapshot(baseUrl, integrationKey, projectId, query = {}) {
  let normalised = baseUrl.replace(/\/$/, '');
  if (!/^https?:\/\//i.test(normalised)) normalised = `http://${normalised}`;
  const u = new URL('/api/integrations/doc-controller/v1/snapshot', normalised);
  u.searchParams.set('projectId', projectId);
  if (query.draftId) u.searchParams.set('draftId', query.draftId);
  if (query.midpId) u.searchParams.set('midpId', query.midpId);

  return new Promise((resolve, reject) => {
    const opts = {
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: 'GET',
      headers: {
        'X-Capsar-Integration-Key': integrationKey,
        Accept: 'application/json'
      }
    };
    const lib = u.protocol === 'https:' ? https : require('http');
    const req = lib.request(opts, (res) => {
      let body = '';
      res.on('data', (c) => {
        body += c;
      });
      res.on('end', () => {
        let json;
        try {
          json = JSON.parse(body);
        } catch {
          return reject(new Error(`Invalid JSON from Capsar: ${body.slice(0, 200)}`));
        }
        if (res.statusCode >= 400) {
          const err = new Error(json.error || `Capsar ${res.statusCode}`);
          err.status = res.statusCode;
          err.body = json;
          return reject(err);
        }
        if (!json.success || !json.snapshot) {
          return reject(new Error('Unexpected Capsar response shape'));
        }
        resolve(json.snapshot);
      });
    });
    req.on('error', reject);
    req.end();
  });
}

module.exports = { fetchSnapshot };
