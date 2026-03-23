# Document Controller: coexistence and cutover

## Product split

- **Capsar (this repo)** defines ISO 19650 artefacts: published BEP naming conventions, approved MIDP, and optional `namingConventions.attributeMap` / `accAttributeMap` for ACC field names.
- **Standalone Document Controller** (`doc-controller/` in this repo, deployable as its own service) enforces rules against Autodesk Construction Cloud and stores scan history in its own database.

## Integration API (Capsar)

- Keys: `POST /api/projects/:projectId/integration/doc-controller-keys` (JWT, project owner). Store the returned `plainKey` once.
- Snapshot: `GET /api/integrations/doc-controller/v1/snapshot?projectId=...` with header `X-Capsar-Integration-Key`.
- Contract: [docs/integration/openapi-doc-controller.yaml](integration/openapi-doc-controller.yaml) and [schemas/capsar-dc-snapshot.schema.json](integration/schemas/capsar-dc-snapshot.schema.json).

## In-app DC Manager (freeze policy)

The LAP **DC Manager** under `/dc-manager` (batches, ACC connections, scheduler) remains for existing users until the standalone tool reaches feature parity. **New capabilities** (multi-folder ACC inventory, coverage reports, integration-first workflow) should land in **Document Controller** only, with Capsar limited to the integration surface above.

## User cutover

1. Create an integration key in Capsar for each project that will use the external worker.
2. In Document Controller, `POST /api/connections` with `capsarBaseUrl`, `capsarProjectId`, `integrationKey`, and APS credentials.
3. ACC secrets stored in Capsar `dc_connections` are **not** migrated automatically; users re-enter APS client ID/secret in Document Controller (or run both systems briefly for comparison).

## Optional UI direction

- Add a deep link from Capsar DC Manager to the hosted Document Controller URL when you are ready to deprecate in-app live monitoring.
- Track 2 (titleblock / PDF verification) is out of scope for both apps until specified.
