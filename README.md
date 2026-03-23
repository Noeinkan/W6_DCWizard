# Capsar Document Controller (standalone)

Node service that:

1. Pulls **BEP naming + approved MIDP** from Capsar via `GET /api/integrations/doc-controller/v1/snapshot` (integration key).
2. Scans **Autodesk Construction Cloud** folders (2-legged OAuth, `data:read`).
3. Reports **naming**, **MIDP match**, **suitability**, **ACC metadata** (when `attributeMap` is set on the BEP snapshot), and **MIDP coverage** (missing expected deliverables).

## Setup

```bash
cd doc-controller
cp .env.example .env
npm install
```

- In **Capsar**, create an integration key: `POST /api/projects/:id/integration/doc-controller-keys` (JWT), then store the returned `plainKey`.
- Run API: `npm run dev` (port **3020** by default).
- Optional dashboard: `npm run dev:client` (Vite on **5173**, proxies `/api` to 3020).

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

See [docs/DOC_CONTROLLER_CUTOVER.md](../docs/DOC_CONTROLLER_CUTOVER.md) in the Capsar repo for coexistence with in-app DC Manager.
