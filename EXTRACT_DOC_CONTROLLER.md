# Extraction status

The extraction from the Capsar monorepo is complete. This repository is already the standalone `capsar-doc-controller` service.

## What this file is for now

This document is retained as historical context so the repo split and ownership boundaries stay clear.

## Current ownership

### Lives in this repository

- The standalone Node service and React client.
- Local SQLite persistence for connections, scan runs, and violations.
- Runtime configuration, deployment configuration, and service-level tests.

### Lives in Capsar

- Integration key creation and deletion.
- Snapshot generation at `GET /api/integrations/doc-controller/v1/snapshot`.
- OpenAPI and JSON Schema for the integration contract.
- Any remaining in-app DC Manager coexistence behavior.

## Post-extraction operating model

1. Develop and deploy this service independently from Capsar.
2. Keep any integration-contract changes coordinated with the Capsar repository.
3. Run local unit tests in this repository before release.
4. Run cross-repo smoke tests only when a live Capsar environment and ACC credentials are available.

## Historical note

The original extraction plan covered subtree copy or history-preserving extraction, removal of the embedded `doc-controller/` folder from Capsar, and separate CI and deployment. Those steps are no longer instructions for this repository because the result of that migration is the repository you are in now.
