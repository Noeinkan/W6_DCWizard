# Capsar Document Controller (standalone)

Node service that:

1. Pulls **BEP naming + approved MIDP** from Capsar via `GET /api/integrations/doc-controller/v1/snapshot` (integration key).
2. Scans **Autodesk Construction Cloud** folders (2-legged OAuth, `data:read`).
3. Reports **naming**, **MIDP match**, **suitability**, **ACC metadata** (when `attributeMap` is set on the BEP snapshot), and **MIDP coverage** (missing expected deliverables).

## Setup

```bash
cp .env.example .env
npm install
```

- Set `LOCAL_ENCRYPTION_KEY` in `.env` to a real secret before storing credentials.
- In **Capsar**, create an integration key: `POST /api/projects/:id/integration/doc-controller-keys` (JWT), then store the returned `plainKey`.
- Run API: `npm run dev` (port **3020** by default).
- Optional dashboard: `npm run dev:client` (Vite on **5173**, proxies `/api` to 3020).

## Local verification

- Health check: `GET http://localhost:3020/api/health`
- Smoke test: `npm run smoke-test`
- Smoke test with DB check: `npm run smoke-test -- --check-connections`
- Tests: `npm test`
- Full end-to-end scan still requires a reachable Capsar instance plus valid APS and ACC credentials.

### No-live-APS local flow

- Start Capsar on port `3001` and this service on port `3020`.
- In Capsar, create a test project, publish a BEP draft with naming convention fields, and optionally approve a MIDP.
- Generate an integration key via `POST /api/projects/:id/integration/doc-controller-keys` in Capsar using JWT auth.
- In this service, call `POST /api/connections` with the Capsar base URL, project ID, integration key, and dummy APS values. Connection creation should succeed and persist the current Capsar snapshot ETag locally.
- Without real APS credentials, `POST /api/connections/:id/scan` is expected to fail during Autodesk auth. No code changes are needed once valid APS credentials are available.
- Set `DOC_CONTROLLER_BASE_URL` to target a non-default host/port. If `DOC_CONTROLLER_API_KEY` is enabled on the service, export that value before running the smoke test. Use `DOC_CONTROLLER_SMOKE_CHECK_CONNECTIONS=1` or `--check-connections` to include the DB accessibility check.

## Create a connection

`POST http://localhost:3020/api/connections`

```json
{
  "name": "Pilot hub",
  "capsarBaseUrl": "http://localhost:3001",
  "capsarProjectId": "<capsar-project-uuid>",
  "integrationKey": "<plain integration key>",
  "apsClientId": "...",
  "apsClientSecret": "...",
  "accProjectId": "b.xxx",
  "accFolderIds": ["urn:adsk.wipprod:fs.folder:..."],
  "pollingIntervalMins": 30
}
```

If `DOC_CONTROLLER_API_KEY` is set in `.env`, send header `X-Doc-Controller-Api-Key` on API calls (and `VITE_DOC_CONTROLLER_API_KEY` for the Vite dev client).

## Manual scan

`POST /api/connections/:id/scan`

## Related docs

- `DOC_CONTROLLER_CUTOVER.md` in this repo summarizes coexistence and user cutover.
- `EXTRACT_DOC_CONTROLLER.md` in this repo records the completed extraction from the Capsar monorepo.
- The integration contract and integration-key endpoints remain owned by the Capsar repo.
