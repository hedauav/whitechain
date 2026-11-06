# Demo script (target 3:50, hard cap 4:00)

ETHGlobal rule: 2 to 4 minutes, 720p or better, no AI voiceover, not sped up. Anything over 4:00 is rejected. The timings below add up to 3:50. They are a plan and have not been rehearsed: time a real take and cut rows if it runs past 3:50. The old 4:30 / 5:00 targets were wrong.

Setup before recording: `cd web && npm run db:local` (or a real Postgres), `npx prisma migrate deploy`, `npm run doctor`, then **stop anything else holding the single local DB connection** and seed: `node --env-file-if-exists=.env.local --env-file-if-exists=.env scripts/seed-demo.mjs --reset` (add `--ui-only` on a local DB to lay out screens without a chain), then `npm run dev`. Three browser profiles or sessions: Campaigner, Creator, Admin (admin wallet = a value from `ADMIN_WALLETS`). Be honest on camera about anything not exercised live (see the README status table). Never record with `NEXT_PUBLIC_DEMO=1`.

| Time | Screen | Say / do |
| --- | --- | --- |
| 0:00 | Landing | One line: brands fund a USDC pool, verified humans clip, AI checks, escrow on Arc pays, AI never moves money alone. (15 s) |
| 0:15 | Arc Studio project (URL from checklist) then explorer | OPEN: Arc Studio has not been used and no project URL exists. If the project exists by recording time, show it and the deployed `ClippoEscrow`. If not, do not claim it: say the contract was written and tested in Foundry and show the explorer address that the app uses. The enforcing escrow is not deployed; say which address the app points to. (20 s) |
| 0:35 | Campaigner: `/desk/new` wizard | Type an idea, press the buttons (YouTube, Pool/Per view, approver), accept the AI story (note `aiMode`). (20 s) |
| 0:55 | `/desk/[id]/fund` | Fund the pool in USDC on Arc testnet through the wallet; show the fee range. Without `ESCROW_ADDRESS` the button refuses with a not-configured message: say so, do not fake it. Campaign shows pending admin. (20 s) |
| 1:15 | Admin: queue | Approve the campaign. Mention reject refunds the full pool. (10 s) |
| 1:25 | Creator: `/join` | Press verify, World sheet. Show one failure (Cancel), account still unverified, then Verify; account verified. Cut Expire and Reuse unless time allows. The World ID proof is a mocked fake identity, say so. (30 s) |
| 1:55 | Creator: channel + submit | Verify channel (code in bio, real platform read). Submit a clip: AI verdict with reason. Open the seeded REJECT and NEEDS_HUMAN slips on `/slips/[id]`. Without an LLM key (`ANTHROPIC_API_KEY` or `GEMINI_API_KEY`, per `LLM_PROVIDER`) or without `YOUTUBE_API_KEY`, these calls answer 503 (the live site has no `YOUTUBE_API_KEY`): show the seeded verdicts instead and say so. (30 s) |
| 2:25 | Admin or campaigner `/bench` | Resolve the NEEDS_HUMAN item by hand. (10 s) |
| 2:35 | Campaigner `/desk` human split | Open a HUMAN_SPLIT campaign. The agent proposes the split. Click release: the Agent Pass step-up (OIDC redirect to auth.world.org). Cancel: show the "Split not approved" message. Verify: payouts created. Not proven: the step-up has never run against the real issuer or in a browser. If it still has not, say so and show the integration tests, not a live pass. (30 s) |
| 3:05 | Terminal in `cre/` | `curl <backend>/api/snapshots/daily` (the feed the workflow reads), then `bash scripts/simulate-local.sh` (starts the local anvil fork and a mock feed), or replay `docs/tracks/cre-simulation-output.txt`; show the report written (or say simulation output if not broadcast). `npm run simulate:live` is an empty no-op, do not use it. It is a single-node simulation, nothing is on real Arc, and CRE reads Clippo's snapshot feed, not YouTube. Explain delta-only crediting. (20 s) |
| 3:25 | Creator `/ledger` (claim) | Needs a matured campaign or HumanSplit; not proven. No live path exists yet: PerView credits are claimable only after the retention window (default 7 days), and close needs the deadline plus grace to have passed. On a fresh campaign Claim answers NothingToClaim and Close answers DeadlineNotReached. Either use a campaign that is already matured and closed, or show the ledger with the claimable amount and say the claim waits for the window. Do not click Claim on a fresh campaign (and not Close either). (15 s) |
| 3:40 | Architecture diagram | Close on the diagrams in `docs/ARCHITECTURE.md` (current design) and the tracks. Do not show `docs/architecture.svg` until it is updated: it shows the older design. Ends at 3:50. (10 s) |

Click path summary: `/desk/new` -> `/desk/[id]/fund` -> (admin) `/bench` approve -> (creator) `/join` -> `/wire` browse and submit -> `/slips/[id]` verdict and appeal -> `/desk` split -> `/ledger` claim -> close.

Seeded data (`web/scripts/seed-demo.mjs`, everything labelled `[SEED]`, wallets `0x5eed...`):
- Users: admin `0x5eed...01` (add to `ADMIN_WALLETS` to act as admin), campaigners `...02`/`...03`, five creators `...11`-`...15` (four World-verified with verified YouTube channels, one deliberately unverified to show the gate). Sign in as any of them with the dev sign-in outside production.
- Campaigns: one DRAFT always; per-view, human-split, pool-share (+ one rejected) only with `ESCROW_ADDRESS` configured or `--ui-only` (local DB, no chain fields, not fundable or claimable).
- Verdicts: APPROVE, REJECT (with a pending appeal), NEEDS_HUMAN, plus seven days of view snapshots for the approved clips.
- A hire workspace (brief, three creators in proposed/approved states, share link) and a shortlist; the script prints their share URLs.
- Not seeded, by design: tx hashes, funded pools, payouts, claims. Do those live: fund on Arc testnet, approve, then `POST /api/chain/sync` and `POST /api/snapshots/refresh`.
- Real integrations (World ID, Claude, YouTube) need their keys; without them those steps answer 503 NOT_CONFIGURED and must not be shown as working. The mock links (`bad...`, `inject...`) of the old script no longer exist: show the seeded REJECT and NEEDS_HUMAN verdicts on `/slips/[id]`, or submit real clips if keys are set.

Fallback: if the API is down the UI shows an error with retry (sample data only exists with `NEXT_PUBLIC_DEMO=1`, for screenshots, not for recording).
