# Prize tracks to code

| Track | Where it lives | Status |
| --- | --- | --- |
| Chainlink, Best workflow with CRE | `cre/workflows/clippo-settlement/main.ts` (cron, HTTP read, consensus, signed report, `writeReport`), `snapshot.ts` (validate, canonicalise, ABI-encode), `workflow.yaml`, `config.staging.json`, `cre/project.yaml`; receiver `contracts/src/ClippoReportReceiver.sol`; data source `web/src/app/api/snapshots/{latest,refresh}/route.ts`, `web/src/lib/snapshots.ts` | Code typechecks. Compiles to WASM, typechecks; on-chain delivery verified on an anvil fork of Arc (see `docs/tracks/CRE.md`); `cre workflow simulate` needs `cre login` (not run). See id gap in `ARCHITECTURE.md`. |
| World, Agent Pass ("World ID Agent Pass", $5,000) | Human gate: auth.world.org step-up (`web/src/lib/worldauth/*`, `POST /api/campaigns/:id/stepup/start`, `GET /api/auth/world/callback`, `GET /api/stepup/:attemptId`) guarding release in `web/src/app/api/campaigns/[id]/split/route.ts` (two-party via `SplitProposal`). Proposer identity: AgentKit/AgentBook (`web/src/lib/agentpass/`, `/api/campaigns/:id/agent`, `/split/propose`), which is NOT the integration the prize asks for. UI: `DeskView.tsx`, `WorldCheck.tsx`, Agent Pass activity panel | Implemented in code, NOT yet run live. Needs an auth.world.org sandbox client, an HTTPS redirect URI and a sandbox World ID. Failure paths tested with doubles only. See `docs/tracks/WORLD_AGENT_PASS.md`, `agent-pass-debrief.md`, `agent-pass-demo.md`. |
| World, Best Use of IDKit | `web/src/app/api/worldid/verify/route.ts` (validates server-side, stores unique nullifier, 409 `ALREADY_USED`), `lib/worldid/index.ts`, `components/{JoinView,AccountView,WorldCheck}.tsx`; `POST /api/submissions` requires a verified user | IDKit widget (`proofOfHuman`) and server verify are wired in code; no live run yet (needs World credentials). See `docs/tracks/WORLD_IDKIT.md`, `world-idkit-debrief.md`, `world-idkit-demo.md`. |
| Arc, Smart Contracts with Advanced Stablecoin Logic | `contracts/src/ClippoEscrow.sol` (PerView, HumanSplit, PoolShare, two-sided fees capped at 50 bps, reject refund, deadline, pool cap), `contracts/test/ClippoEscrow.t.sol`, `script/Deploy.s.sol`, `abi/` | Contract code real and tested. Arc deployment and Arc Studio project not verified. Web integration is mocked. |

## Demo failure paths

Each path must leave the action undone. The backend enforces this; the UI shows the message.

| Path | How to trigger today (mock) | Expected result | Code |
| --- | --- | --- | --- |
| Cancelled | (Agent Pass also covers expired proposal, wrong approver, hash mismatch, already released, and the step-up rows below: see `tracks/agent-pass-demo.md`.) In the World sheet press Cancel or Esc (`cancelled`); via API send `proof: "cancelled"` | Creator stays unverified; or split not created (403 `WORLD_ID_DENIED`) | `WorldCheck.tsx` (`WORLD_FAIL`), `worldid/verify`, `split` routes |
| Expired | "Let it expire" (`expired`); API `proof: "expired"` | Same, nothing changed | same |
| Repeated | "Reuse an old proof" (`repeated`). UI handles this locally before calling the API. Real mode: the same human on a second account gives 409 `ALREADY_USED` (nullifier unique) | Second account stays unverified | `AccountView/JoinView/DeskView.tsx`, `worldid/verify` route |
| Step-up cancelled at World | Press Cancel at the auth.world.org page | Split not released (403 `STEPUP_DENIED`) | `lib/worldauth/*`, callback route |
| Step-up expired | Let the attempt expire, then return | Split not released (410 `STEPUP_EXPIRED`) | same |
| Step-up identity mismatch | Complete with a different identity than the approver's | Split not released (403 `STEPUP_IDENTITY_MISMATCH`; same person approving as both campaigner and admin: `STEPUP_SAME_HUMAN`) | same |
| Step-up binding mismatch | Change the split after starting the attempt | Split not released (409 `STEPUP_BINDING_MISMATCH` for a human-built split; for an agent proposal the changed split is refused earlier with 409 `SPLIT_CHANGED`) | same |
| Unsupported assurance / stale auth | Return with a lower `acr` or an old auth time | Split not released (403 `STEPUP_ASSURANCE` / `STEPUP_STALE_AUTH`) | same |

The step-up rows are implemented in code and not yet run live.

After a failure, show: user `verified` still false (`GET /api/auth/me`), and for split, `GET /api/creator/earnings` shows no new payouts and no on-chain call occurred. Note that in real World mode, replayed proofs for the split action are rejected by the Developer Portal per action/nullifier rules; confirm behavior with a real app before claiming it in the video.

Other safety paths worth showing: AI verdicts `NEEDS_HUMAN` for injection (`video id inject...`), off-topic `REJECT` (`bad...`), `EXCEEDS_POOL`, and escrow reverts (`PoolExceeded`, `NotApprover`, `BadState`).

## Integration debrief (World ID Agent Pass, four required items)

Full drafts: `tracks/agent-pass-debrief.md` and `tracks/world-idkit-debrief.md`. Fill in only after a live run; do not invent numbers.

```
Project: Clippo
Product: World ID Agent Pass (auth.world.org step-up) as the human gate for releasing an AI-proposed split; IDKit for sign-up
1. Time to first success: FILL AFTER LIVE RUN
2. Friction encountered: FILL AFTER LIVE RUN
3. Missing capability or documentation: FILL AFTER LIVE RUN
4. The one improvement with the greatest impact: FILL AFTER LIVE RUN
```

Two-party release: for `CAMPAIGNER_AND_ADMIN`, the split route keeps a `SplitProposal` PENDING until both the campaigner and an admin approved the identical split (verified in `web/src/app/api/campaigns/[id]/split/route.ts`). Whether each approver needs a step-up result follows `WORLD_AUTH_POLICY`.
