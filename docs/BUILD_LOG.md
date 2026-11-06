# Clippo build log

A running record of what we changed, why, and how to go back. Newest entry at the top of "Log". Kept up to date by the rule in `CLAUDE.md`.

Branch: `feat/core-sponsor-integration`. Goal: win ETHGlobal Mumbai (deadline Sat 2026-11-07 09:00 IST) with Chainlink CRE, World (IDKit + Agent Pass) and Arc each at the core of the product, not as add-ons.

## How to go back

- See any step: `git show <hash>`
- Look at the project as it was then: `git checkout <hash>` (then `git checkout feat/core-sponsor-integration` to return)
- Undo one step safely: `git revert <hash>`
- Starting point before our work: `ce69f0a`

## Decisions (from you)

| Date | Decision |
| --- | --- |
| 2026-11-06 | Every reply is short and in simple language. |
| 2026-11-06 | Treat this as a fresh project. We don't raise ETHGlobal eligibility again, but we never rewrite git history or claim the old work was built at the event. |
| 2026-11-06 | Fix the contracts and redeploy them on Arc (through Arc Studio). You sign deploys with your own wallet. |
| 2026-11-06 | Commit in small steps and push to the feature branch. Nothing goes to `main` until you say so. |
| 2026-11-06 | Option 1 for payouts: Clippo's wallet triggers the payout and pays gas, but the contract can only send money to the creator who earned it. |
| 2026-11-06 | Keep this build log up to date after every step (this file). |

## Starting point (audit before our changes)

Ten inspectors plus four skeptics checked the project. Honest result at commit `ce69f0a`:

| Part | Done | Main problem |
| --- | --- | --- |
| Frontend | 70% | Looks good, but the live site was nearly empty (one $2 test campaign, Rickroll link). |
| Backend | 60% | 263 tests passed with fake services, but live had no `YOUTUBE_API_KEY`, so no clips, AI checks or views. |
| Contracts | 70% | 94 tests passed, but one admin key could send a pool to any wallet, and there was no dispute or clawback. |
| Web3 flow | 35% | Only fund and approve had ever run on Arc (one 2 USDC campaign). CRE, credits and claims had never run. |

Track status at the start:

| Track | Core? | Main problem |
| --- | --- | --- |
| Chainlink CRE | Partly | Simulation crashed (`Invalid url`), never run, production receiver address was `0x000`. |
| World Agent Pass | No | Repo used AgentKit, but the prize points to the OIDC product at `auth.world.org`. |
| World IDKit | Partly | Server blocked unverified creators, but the contract ignored World ID and no real run was recorded. |
| Arc | Partly | Real USDC escrow, but no Arc Studio project URL (every Arc prize requires one). |

## Log

### 6. Docs corrected and a focus guide added, commit `7a93a2c`

- **What:** two review passes fixed false and stale claims in the README, the track write-ups, the Arc submission file, the architecture text, the API reference and the deploy docs. Then a second pass removed contradictions between the docs. Added `docs/FOCUS.md` (plan, rules, what we may claim, order of work, prize checklists). Merged `main`'s two docs commits into this branch (`a7b30b9`) so their Arc claims could be corrected here.
- **Main corrections:**
  - Arc Studio: nothing was built or deployed with it. The contracts were written and tested in Foundry. The docs now say Studio is not created yet.
  - Video: the limit is 2 to 4 minutes (was written as 5, and 4:30 for the script).
  - Escrow: two OLD escrows are on Arc (`0xd845...c39c` is what the live site uses; `0xc7b9...e310` was cited in the Arc file). The new enforcing escrow is not deployed. No doc calls either old one "the" deployed contract.
  - World Agent Pass: the official product is the OIDC service at `auth.world.org`. The AgentKit code is not it.
  - CRE: the workflow now simulates; the docs say what ran (empty live feed, local fork credit) and what did not. The feed is `/api/snapshots/daily`.
  - AI verifier: Claude or Gemini (`LLM_PROVIDER`), not Claude only.
- **Files:** `README.md`, `contracts/README.md`, `cre/README.md`, `web/API.md`, `docs/*.md`, `docs/tracks/*.md`, `docs/architecture.svg` (text only), new `docs/FOCUS.md`.
- **How checked:** each edit was read against the code by a second reviewer, and a cross-doc pass compared all files. Nothing was run or deployed. Test counts are copied from this log, not re-run.
- **Not proven / left open:**
  - `docs/architecture.svg` still draws the older design (no humanAttestor, registerHuman, disputes, OIDC step-up). It needs a redraw.
  - `web/scripts/e2e-chain.mjs` and `e2e-api.mjs` still target the old design.
  - The demo script timings (3:50 total) were never rehearsed, and the claim step in it has no live path yet.
  - `main` carries these docs but not the feature-branch code, so some docs describe code that is only on `feat/core-sponsor-integration`.
  - No LICENSE file; the owner must choose one.

### 5. Official World Agent Pass step-up, commit `19205ba`

- **What:** approving an agent's split now needs a fresh OIDC step-up at `auth.world.org` (code flow with PKCE). The backend checks the ID token, issues a one-time token bound to the exact split, and signs the approval the escrow checks. IDKit stays only for "Build it myself" splits.
- **Why:** the Agent Pass prize needs the official product, a real denied path, and backend validation.
- **Files:** `web/src/lib/agentpass/stepup.ts`, routes under `web/src/app/api/agentpass/stepup/`, `web/src/components/stepup-client.ts`, split route, `DeskView`, `AdminSplits`, a new `User.worldIdpIdentity` column with a migration, `jose` dependency.
- **Tests:** 304 web tests pass (42 new, using a local fake issuer). Build succeeds, typecheck clean.
- **Not proven:** never run against the real issuer or in a browser. Which issuer and credential level the prize's mocked proofs use is unknown (ask World staff). A rejected wallet popup after the World ID check blocks a retry of that split.
- **Needs from you:** portal client, callback URL, env vars (see "Waiting on you").

### 4. CRE workflow fixed and simulated, commit `6f74f7b`

- **What:** removed the startup crash (strict URL check), refuse a zero receiver once there are rows, read the receipt because the forwarder hides a failed `onReport`. Replaced the old fake evidence with real `cre` CLI output. Local scripts now work on macOS and register creators as humans.
- **Why:** the Chainlink prize needs a real simulation, and a lost report must not look like success.
- **Files:** `cre/workflows/clippo-settlement/*`, `cre/scripts/*`, `docs/tracks/cre-simulation-output.txt`, `docs/tracks/CRE.md`.
- **Proof:** live-feed run exits 0 with an empty no-op. A local `--broadcast` run on an anvil fork of Arc credited creators in the escrow (checked with `cast call`), and an unlinked wallet was refused. 9 CRE tests pass.
- **Not proven:** nothing broadcast to real Arc, no deployed workflow, single-node simulator (no real consensus), pool-share not run through the CLI. `config.production.json` still has the zero receiver until we deploy.
- **Watch out:** the CRE CLI timed out reaching its API three times before passing on retry. Record the CRE part of the demo in advance.

### 3. Dispute screens and hire-funding fix, commit `dfd0d51`

- **What:** campaigners can dispute per-view credits and admins can settle them from the app. Hire funding no longer accepts a client-supplied on-chain id.
- **Why:** it closed a real hole: a fake campaign id could be used to drain another brand's pool.
- **Files:** `web/src/components/OnchainDisputes.tsx`, `web/src/app/api/chain/disputes/route.ts`, `DeskView`, `BenchView`, `web/src/lib/workspace/hires.ts`.
- **Tests:** 262 web tests pass.

### 2. App connected to the new contract, commit `292d107`

- **What:** the backend signs World ID approvals that the contract verifies, links verified wallets on-chain, and sends payouts through `claimFor`. Pool share uses CRE views only. New credits show right after a transaction, and sync errors no longer fail a claim after money moved.
- **Why:** the new contract changed how approvals, credits and payouts work.
- **Files:** `web/src/lib/chain/clippo-wallet.ts` (new), `client.ts`, `indexer.ts`, split, attest, approve and claim routes, `web/src/app/api/chain/report/route.ts` (new), regenerated ABI. Removed the old pool-share route.
- **Tests:** 262 web tests pass (some tests changed on purpose to match the new rules).
- **New env:** `HUMAN_ATTESTOR_PRIVATE_KEY` (Clippo's backend wallet), optional `CAMPAIGN_DEADLINE_SECONDS`.

### 1. Contracts enforce World ID and CRE, commit `498f649`

- **What:** no key can choose who gets paid.
  - PerView credits and PoolShare weights come only from the CRE report adapter, which can be set once.
  - HumanSplit credits need a fresh World ID approval signed by `humanAttestor` and bound to the exact split. Two-party splits need two different humans.
  - Only wallets linked to a unique human (`registerHuman`) can be credited.
  - Campaigners can dispute unreleased PerView credits. Admins settle them (upheld credits go back to the pool or brand, never to an admin). If nobody settles in time they release to the creator.
  - Retention and grace are fixed per campaign. Anyone can close a campaign after the deadline plus grace. Brands can reclaim a campaign nobody approved.
  - `claimFor` lets Clippo's wallet trigger a payout that can only reach the creator.
  - The report receiver can lock its settings for good (`lockConfig`), and in simulation mode only the workflow owner can report.
- **Why:** the audit showed one admin key could drain funds and skip World ID and CRE, which made both add-ons.
- **Files:** `contracts/src/ClippoEscrow.sol`, `ClippoReportReceiver.sol`, `contracts/script/Deploy.s.sol` (now needs `HUMAN_ATTESTOR_ADDRESS`), tests and `contracts/test/HumanHelper.sol`.
- **Tests:** 114 contract tests pass (was 94).
- **Not proven:** not deployed. The World ID check on-chain relies on a signature from Clippo's backend key, so that key must be trusted to sign honestly (it cannot move money by itself).

### 0. Audit and setup

- Built a scratch copy of the repo to run builds and tests without touching your code.
- Fetched the live Mumbai prize rules and checked the live site, the contracts and the explorer.
- Saved the project rules in Claude's memory.

## Waiting on you

1. **Clippo backend wallet:** create a new wallet, fund it with testnet USDC, and send me only its address. The address is fixed at deploy. The private key goes in Vercel as `HUMAN_ATTESTOR_PRIVATE_KEY`.
2. **Arc Studio:** `npm i -g @circle-fin/arc-studio-cli`, then `arc-studio login`.
3. **World portal (`auth.world.org/portal`):** create a client. Callback URL `https://clippo-six.vercel.app/api/agentpass/stepup/callback`, client auth `client_secret_basic`, and the same environment (production or sandbox) for portal, credentials and issuer.
4. **Vercel env:** `YOUTUBE_API_KEY`, `HUMAN_ATTESTOR_PRIVATE_KEY`, `WORLD_IDP_CLIENT_ID`, `WORLD_IDP_CLIENT_SECRET`, `WORLD_IDP_REDIRECT_URI`, `SESSION_SECRET` (32+ characters).
5. **Ask World staff:** which issuer and credential level do the prize's mocked proofs use?

## Coming next

1. Deploy the new contracts on Arc (you sign), then set the real receiver in `cre/.../config.production.json`, the new addresses in Vercel, and `ESCROW_DEPLOY_BLOCK`.
2. Build and show the work in Arc Studio, and get the shareable project URL.
3. Run one full real flow on Arc: fund, approve, CRE report, claim, dispute. Save the transaction hashes here.
4. Write the IDKit credential rationale and debrief (only after a real run), and redraw `docs/architecture.svg` for the new design.
5. Record the demo video (under 4 minutes), fill `docs/SUBMISSION_CHECKLIST.md`, submit before the deadline.

## Known gaps

- Nothing from our changes has run on real Arc yet.
- The live site still has no `YOUTUBE_API_KEY` and still runs the old build.
- `e2e-chain.mjs` was not updated for the new contract.
- `docs/architecture.svg` still shows the older design; the e2e scripts still target the old escrow.
- Read `docs/FOCUS.md` before starting new work.
