#!/usr/bin/env node

const defaultBaseUrl = 'http://localhost:3020';
const baseUrl = (process.env.DOC_CONTROLLER_BASE_URL || defaultBaseUrl).replace(/\/$/, '');
const apiKey = process.env.DOC_CONTROLLER_API_KEY;
const shouldCheckConnections =
  process.argv.includes('--check-connections') || process.env.DOC_CONTROLLER_SMOKE_CHECK_CONNECTIONS === '1';

function buildHeaders() {
  const headers = { Accept: 'application/json' };
  if (apiKey) {
    headers['X-Doc-Controller-Api-Key'] = apiKey;
  }
  return headers;
}

async function getJson(pathname) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: 'GET',
    headers: buildHeaders()
  });

  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new Error(`Expected JSON from ${pathname}, received: ${text}`);
    }
  }

  if (!response.ok) {
    const detail = body && typeof body === 'object' ? JSON.stringify(body) : text;
    throw new Error(`GET ${pathname} failed with ${response.status}: ${detail}`);
  }

  return body;
}

async function main() {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is unavailable. Use Node 18+ to run the smoke test.');
  }

  const health = await getJson('/api/health');
  if (!health || health.ok !== true) {
    throw new Error(`Health check did not return ok: true. Received: ${JSON.stringify(health)}`);
  }

  console.log(`[smoke-test] Health OK at ${baseUrl}/api/health`);

  if (shouldCheckConnections) {
    const connections = await getJson('/api/connections');
    if (!connections || connections.success !== true || !Array.isArray(connections.connections)) {
      throw new Error(
        `Connections check returned an unexpected payload: ${JSON.stringify(connections)}`
      );
    }

    console.log(
      `[smoke-test] Connections OK, retrieved ${connections.connections.length} record(s)`
    );
  } else {
    console.log('[smoke-test] Connections check skipped');
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(`[smoke-test] Failed: ${error.message}`);
    process.exit(1);
  });