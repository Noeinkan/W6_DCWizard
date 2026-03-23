# Extracting doc-controller into its own repository

These instructions move the `doc-controller/` subtree from the Capsar monorepo into a standalone Git repo while preserving the integration API on the Capsar side.

## What stays in Capsar (this repo)

Everything **outside** `doc-controller/`:

- `server/services/docControllerIntegrationService.js` — integration key hashing, `buildSnapshot()`
- `server/middleware/integrationKeyMiddleware.js` — `X-Capsar-Integration-Key` auth
- `server/routes/integrationsDocController.js` — `GET /api/integrations/doc-controller/v1/snapshot`
- `server/routes/projects.js` — key CRUD (`POST/GET/DELETE` `/:id/integration/doc-controller-keys`)
- `server/__tests__/docControllerIntegration.test.js`
- `server/database.js` — `doc_controller_integration_keys` table
- `docs/integration/` — OpenAPI and JSON Schema contract
- `docs/DOC_CONTROLLER_CUTOVER.md`

These remain in the Capsar codebase and are deployed with Capsar.

## What moves to the new repo

The entire `doc-controller/` directory. After extraction, the new repo root will look like:

```
capsar-doc-controller/
  package.json
  vitest.config.js
  .env.example
  README.md
  client/
  server/
    index.js
    db.js
    routes/api.js
    services/
      accClient.js
      capsarClient.js
      connectionService.js
      coverageService.js
      encryption.js
      scanService.js
      scheduler.js
      validationCore.js
    __tests__/
      validationCore.test.js
      coverageService.test.js
  data/            (gitignored — SQLite at runtime)
```

## Step-by-step

### 1. Create the new repo on GitHub

```bash
gh repo create capsar-doc-controller --private --description "ACC document compliance worker for Capsar"
```

### 2. Copy the subtree (preserving no Git history)

From the Capsar repo root:

```bash
# Create a clean copy
cp -r doc-controller /tmp/capsar-doc-controller
cd /tmp/capsar-doc-controller

# Init new repo
git init
git branch -M main

# Create .gitignore
cat > .gitignore << 'EOF'
node_modules/
data/*.db
data/*.db-shm
data/*.db-wal
.env
.env.local
.env.production
client/dist/
*.log
EOF

git add .
git commit -m "Initial extraction from Capsar monorepo"
git remote add origin git@github.com:YOUR_ORG/capsar-doc-controller.git
git push -u origin main
```

### 3. (Alternative) Preserve Git history with `git filter-repo`

If you want commits that touched `doc-controller/` in the new repo:

```bash
# Clone a throwaway copy
git clone /path/to/W3_bep_generator /tmp/dc-extract
cd /tmp/dc-extract

# Keep only doc-controller/ and re-root it
pip install git-filter-repo
git filter-repo --subdirectory-filter doc-controller

# Push to new remote
git remote add origin git@github.com:YOUR_ORG/capsar-doc-controller.git
git push -u origin main
```

### 4. Remove doc-controller from Capsar

Back in the Capsar repo:

```bash
# Remove the subtree
rm -rf doc-controller/

# Remove the convenience script from package.json
# (the "test:doc-controller" script)
```

Then update `package.json` to remove the `test:doc-controller` script.

Commit:

```bash
git add -A
git commit -m "Remove doc-controller subtree (now in capsar-doc-controller repo)"
```

### 5. Update .gitignore in Capsar

Remove the `doc-controller/data/` lines from `.gitignore` (they are no longer needed).

### 6. Verify

In the **new repo**:

```bash
cd capsar-doc-controller
cp .env.example .env
npm install
npm test          # should pass 8 tests
npm run dev       # starts API on :3020
```

In **Capsar**:

```bash
npm test          # should pass 65 tests (integration test still covers Capsar endpoints)
```

### 7. CI / deploy

- The new repo gets its own CI pipeline (GitHub Actions, etc.).
- Deploy to a separate VPS process or container.
- Set env vars: `CAPSAR_BASE_URL`, `LOCAL_ENCRYPTION_KEY`, `PORT`, optionally `DOC_CONTROLLER_API_KEY`.
- In Capsar production, set `DOC_CONTROLLER_KEY_PEPPER` (same value used when keys were created).

### 8. Integration smoke test

1. In Capsar, create an integration key:

```bash
curl -X POST http://localhost:3001/api/projects/<projectId>/integration/doc-controller-keys \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"label": "pilot"}'
```

2. In the Document Controller, create a connection using that key:

```bash
curl -X POST http://localhost:3020/api/connections \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Pilot",
    "capsarBaseUrl": "http://localhost:3001",
    "capsarProjectId": "<projectId>",
    "integrationKey": "<plainKey from step 1>",
    "apsClientId": "...",
    "apsClientSecret": "...",
    "accProjectId": "b.xxx",
    "accFolderIds": ["urn:adsk.wipprod:fs.folder:..."]
  }'
```

3. Trigger a scan:

```bash
curl -X POST http://localhost:3020/api/connections/<connectionId>/scan
```

The scan pulls the BEP naming + MIDP snapshot from Capsar, lists ACC files, and stores violations in the Document Controller's own database.
