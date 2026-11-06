# Clippo CRE settlement workflow

Chainlink CRE (TypeScript SDK `@chainlink/cre-sdk` 1.23) workflow, `workflows/clippo-settlement/`.

The workflow does not read YouTube or any platform directly. It reads Clippo's own frozen snapshot feed, which the backend builds from its platform reads.

Flow (trigger 0: cron, daily; trigger 1: HTTP, optional body `{"day":"YYYY-MM-DD"}` to settle an older frozen day):
1. Each node calls `GET {backendUrl}/api/snapshots/daily` -> `{day, hash, rows: [{campaignId, creator, cumulativeViews}]}`.
2. `snapshot.ts` validates and canonicalises the rows (sorted, deduped, checksummed addresses) into a string; nodes must return an identical `{day, hash, rows}` (`ConsensusAggregationByFields`, `identical` per field). The backend therefore must serve one frozen snapshot per day.
3. Guards: a snapshot older than `maxStalenessDays` (or in the future) is rejected; an empty feed is a no-op; a zero `receiverAddress` is refused once there are rows to deliver.
4. The agreed rows are split into batches of `maxRowsPerReport` (25), ABI-encoded as `(uint256 campaignId, address creator, uint256 cumulativeViews)[]`, signed into a report (`runtime.report`), and written with `EVMClient.writeReport` to `ClippoReportReceiver`, which the forwarder calls `onReport` on -> `ClippoEscrow.reportViews` (credits only the delta, capped by the pool; the creator must be a linked World ID human).
5. The forwarder hides a reverted `onReport`, so the workflow reads the receipt: a missing `ReportProcessed` event fails the run, and rows the receiver skipped (`ItemFailed`, for example `NotHuman()`) are logged and counted as `failedRows` (the run still exits 0).

## Setup

```
cd cre
npm install                # or bun install
npm run typecheck          # tsc --noEmit
npm test                   # snapshot.ts unit tests (node:test)
```

Both pass (typecheck clean, 9 tests; run for this edit).

Install the CRE CLI (https://docs.chain.link/cre/getting-started/cli-installation), `cre login`, and Bun (needed by the CLI for compilation).

Config files in `workflows/clippo-settlement/`:
- `config.staging.json` (target `staging-settings`): `backendUrl` is the local mock feed `http://127.0.0.1:8787`, and `evm.receiverAddress` is a receiver on a local anvil fork. `scripts/local-chain.sh` rewrites `receiverAddress` on every run.
- `config.production.json` (target `production-settings`): `backendUrl` is `https://clippo-six.vercel.app`; `evm.receiverAddress` is still the zero address until a receiver is deployed (the workflow refuses to deliver rows while it is zero).

Fields: `backendUrl`, `feedPath` (`/api/snapshots/daily`), `maxStalenessDays`, `maxRowsPerReport`, `evm.receiverAddress` (deployed `ClippoReportReceiver`, see `../contracts/README.md`), `evm.chainSelectorName` (`arc-testnet`, present in SDK 1.23 chain selectors), `evm.gasLimit`, and `schedule` (6-field cron, default `0 30 0 * * *`, daily 00:30 UTC).

`project.yaml`: `staging-settings` RPC is `http://127.0.0.1:8545`, a local anvil FORK of Arc testnet, not real Arc. `production-settings` RPC is `https://rpc.testnet.arc.network`. Copy `.env.example` to `.env`; `CRE_ETH_PRIVATE_KEY` is only needed to broadcast (`scripts/simulate-local.sh` uses the public anvil key).

## Simulate

```
# real CLI simulation on a local anvil fork of Arc + mock feed (needs cre, bun, foundry, `cre login`)
bash scripts/simulate-local.sh
# live feed, no broadcast (npm run simulate:live)
cre workflow simulate ./workflows/clippo-settlement --target production-settings --non-interactive --trigger-index 0
```

`npm run simulate` and `npm run simulate:broadcast` use `staging-settings` with `--non-interactive --trigger-index 0`, so they need the local fork and mock feed that `simulate-local.sh` starts (see the manual steps in `../docs/tracks/CRE.md`). Trigger index 1 is the HTTP trigger (`--http-payload '{}'`).

For simulation, the CRE simulator's mock forwarder address must be set as `forwarder` on `ClippoReportReceiver` (`setForwarder`, or `FORWARDER_ADDRESS` at deploy) and the receiver registered via `ClippoEscrow.setReportAdapter`. The mock forwarder passes no workflow metadata, so the receiver must be deployed with `INSECURE_SKIP_WORKFLOW_CHECK=true` (or `setWorkflowCheckSkipped(true)`). For production use the KeystoneForwarder address for the target chain from the CRE docs, set `EXPECTED_WORKFLOW_OWNER` (required; receiver fails closed without it), optionally `setExpectedWorkflowId` after `cre workflow deploy`, and `setWorkflowCheckSkipped(false)`. See `../contracts/README.md`.

## Status

See `../docs/tracks/CRE.md` (requirements checklist, evidence, live path, unverified items) and `../docs/tracks/cre-simulation-output.txt` (real `cre` CLI output).

Run: `cre workflow simulate` (v1.39.0) ran against the live feed on `production-settings` without broadcast (exit 0, "no-op: empty snapshot", because the live feed has no rows). With `--broadcast` on a local anvil FORK of Arc, a mock feed and the Arc MockKeystoneForwarder, the receiver credited creators in the escrow (checked with `cast call`).

Not proven: nothing was broadcast to real Arc, no workflow is deployed (deploy needs CRE Early Access), and the simulator runs a single node, so real multi-node consensus never ran. The local fork run deployed fresh copies of the HEAD contracts (MockUSDC, escrow, receiver) on the fork. The enforcing escrow (`498f649`) is not deployed on real Arc, and `config.production.json` has no receiver yet. `cre workflow simulate` needs `cre login`, and its API check timed out intermittently during the runs. CLI-free supporting evidence: `bash scripts/capture-evidence.sh` (not the CLI simulation).
The workflow reads the frozen feed `GET /api/snapshots/daily` (`{day, hash, rows}`), not `/latest`.
