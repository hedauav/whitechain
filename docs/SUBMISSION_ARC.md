# Arc submission — Best Smart Contracts with Advanced Stablecoin Logic, In Arc Studio

**Submitting for:** *Best Smart Contracts with Advanced Stablecoin Logic, In Arc Studio* ($3,000). Name and amount copied from the live prize page (https://ethglobal.com/events/mumbai/prizes) on 2026-11-06

**Status (2026-11-06; deadline Sat 2026-11-07 09:00 IST) — two tracks:**
- **BASELINE (on `main`, DEPLOYED & TESTED):** the 3-arg `ClippoEscrow` `(usdc, treasury, owner)` — conditional escrow, per-view retention window, `HumanSplit`/`PoolShare`, two-sided fees — was **compiled and deployed in Arc Studio** and lives on Arc testnet at `0xc7b9588ee0a4bff31e17ece1141ea404ad05e310`. The app is wired to it (`web/.env.local: ESCROW_ADDRESS`), the backend reads live contract state (`/api/chain/config` → fees `source: chain`), and the full money-flow suite passes **48/48** (`npm run e2e:chain`, real txs + exact balance assertions). A Playwright smoke test confirms the app loads clean against it.
- **TARGET (feature branches `feat/core-sponsor-integration`, `feat/cre-core`, commit `498f649` — NOT merged, NOT deployed):** a more advanced **enforcing escrow**, 4-arg `(usdc, treasury, owner, humanAttestor)`, that moves **World ID + CRE enforcement on-chain** and adds disputes + `claimFor`. Planned to merge to `main`, redeploy via Arc Studio, and become the final submission contract. Until then the baseline above is the working demo.

## One-liner
Clippo is a clipping-campaign marketplace. Sponsors fund campaigns in **USDC on Arc**; creators earn by views and get paid from an **advanced escrow contract** that does conditional release, a retention window on per-view credits, and pool splits — all on-chain. The escrow *is* the product: remove it and there is no funding, no payout, and no refund.

## Why it fits this bounty (their criteria → our code)
> The rows below describe the **target enforcing escrow** (branches, `498f649`). The **deployed baseline** implements the escrow lifecycle, retention, splits and fees; the dispute / `claimFor` / `humanAttestor` rows are target-only (not in the deployed 3-arg contract yet).

| What they asked for | Where it lives |
| --- | --- |
| Conditional escrow with dispute + automatic release | `contracts/src/ClippoEscrow.sol` — Funded → Approved/Rejected lifecycle. (Target) the campaigner disputes a creator's PerView credits still in the retention window (`disputeCredits`); an admin settles it (`resolveDispute`). Undisputed credits become claimable once the window passes; the creator (or `claimFor`) calls the claim. |
| Programmable payroll / vesting in USDC | Not a vesting schedule. PerView credits sit in a **retention window** (default 7 days, owner-set 0 to 30, snapshotted per campaign) before they are claimable. |
| Treasury mgmt + payment splitting (revenue splits, team/DAO payouts) | `HumanSplit` (an explicit split, World ID approved) and `PoolShare` (the pool is shared by CRE-reported views at close) split a pool across many creators. |
| Software-to-software payments | `ClippoReportReceiver` receives Chainlink CRE reports and calls `reportViews()`, which credits creators. The CRE workflow runs in local simulation only (single node, not deployed). |
| Conditional flows / onchain automation / multi-step settlement | fund → approve → credit → retention window → claim → close; pool-capped, deadline-gated |
| **Bonus:** reusable by other builders | Generic 3-mode escrow, custom errors, events, exported ABI (`contracts/abi/`), Foundry tests; the money flow is covered end-to-end by `npm run e2e:chain` (48 checks pass against the baseline). |

## Effective use of Arc + Circle developer tools
- **USDC as the settlement and gas token.** The constructor rejects any token whose `decimals() != 6`; the deploy defaults to Arc's official USDC `0x3600…0000`. Fees are paid in USDC, so a user needs only USDC — one Circle faucet drop covers funding **and** gas.
- **Arc Studio: used for the baseline.** The 3-arg `ClippoEscrow` was imported into Arc Studio, compiled, and **deployed from Studio** to Arc testnet (`0xc7b9588…`). Studio project: https://studio.arc.io/app/34ef3b95-32bd-48f9-9310-b8135e1d92ce (make it public with the Studio **Share** button before submitting). The target 4-arg enforcing escrow still needs the same Studio deploy once merged. (Prompt + import kit: `docs/tracks/arc-studio-prompt.md`.)
- **Real frontend + backend, not a mock.** `web/src/lib/chain/client.ts` sends the wallet transaction and waits for the receipt, then the API (`web/src/lib/chain/indexer.ts`) checks it on-chain before trusting it. The chain path **auto-enables** the moment `ESCROW_ADDRESS` is set (`web/src/lib/chain/config.ts`). Proven against the baseline (48/48 E2E, app wired). Note: the live site (`clippo-six.vercel.app`) still runs an older build against an older escrow — redeploy it before pointing judges there.

## Architecture
See the Mermaid source + money-flow sequence in `docs/ARCHITECTURE.md`. `docs/architecture.svg` reflects the baseline escrow; redraw it for the target design (humanAttestor, registerHuman, disputes, OIDC step-up) before exporting to PNG for the form.

## Submission fields
| Field | Value |
| --- | --- |
| Bounty | Best Smart Contracts with Advanced Stablecoin Logic, In Arc Studio |
| Arc Studio project URL | https://studio.arc.io/app/34ef3b95-32bd-48f9-9310-b8135e1d92ce (use the Studio **Share** button to make it public, then paste that link) |
| Deployed escrow (baseline) | `0xc7b9588ee0a4bff31e17ece1141ea404ad05e310` — https://explorer.testnet.arc.io/address/0xc7b9588ee0a4bff31e17ece1141ea404ad05e310 (replace with the enforcing-escrow address once it is deployed) |
| GitHub repo | https://github.com/Tan0610/Clippo_EthMumbai |
| Demo video (2 to 4 min, hard cap 4:00, 720p or better, no AI voiceover, not sped up) | `<VIDEO_URL>` (open: not recorded) — script in `docs/DEMO_SCRIPT.md` |
| Architecture diagram | `docs/architecture.svg` (baseline; update for the target design before exporting). Current design: Mermaid in `docs/ARCHITECTURE.md`. |

The repo holds the contract, the frontend, and the other integrations in one place; the app reads the escrow from `ESCROW_ADDRESS`. Baseline constructor: `(usdc 0x3600…0000, treasury 0x6c94…354e, owner 0x48c5…09bD)`. Target constructor adds `humanAttestor`.

---

## Deploy runbook — the steps only you can do (login + funded key)

### Step 1 — Fund a testnet wallet
Get testnet USDC at <https://faucet.circle.com> (also built into Arc Studio). USDC is the gas token on Arc.

### Step 2 — Build + deploy in Arc Studio (gating requirement)
Web path (`studio.arc.io`): **done for the baseline** (project above). To deploy the target enforcing escrow after it merges:
1. New project (or reuse the existing one) → import `contracts/src/ClippoEscrow.sol` (+ `MockUSDC.sol` for the sandbox) via the Code editor (the chat caps pastes at ~10k chars), ask Studio to compile and run the flows.
2. The target constructor adds `humanAttestor`; supply it alongside usdc/treasury/owner.
3. **Deploy to Arc testnet from Studio.** Record the **Studio project URL** and the **deployed address**.

### Step 3 — Point the app at the deployed contract
In `web/.env.local` (the deploy helper can also write these — `node scripts/deploy-arc.mjs` after a forge broadcast):
```
ESCROW_ADDRESS="0x<deployed escrow>"
ARC_RPC_URL="https://rpc.testnet.arc.io"
ARC_CHAIN_ID="5042002"
# USDC_ADDRESS defaults to Arc USDC 0x3600…0000; override only if Studio used MockUSDC
ESCROW_DEPLOY_BLOCK="<block the escrow was deployed at>"
HUMAN_ATTESTOR_PRIVATE_KEY="0x<attestor key>"   # target escrow only; its address is the constructor's humanAttestor
```
Never set `DEPLOYER_PRIVATE_KEY` on Vercel (only `scripts/deploy-arc.mjs` uses it). `UPDATER_PRIVATE_KEY` is optional (profile/referral modules).
The moment `ESCROW_ADDRESS` is a valid address, `chainConfig().enabled` flips true, chain endpoints stop answering 503 `CHAIN_NOT_CONFIGURED`, and the UI uses the **real** wallet path (the `0xdemo…` fallback exists only when `NEXT_PUBLIC_DEMO` is set, which must be unset when recording).

### Step 4 — Run the real end-to-end flow
Baseline: validated by `npm run e2e:chain` (48/48) and the wired app. For a live manual run: `cd web && npm run dev`, connect a wallet on Arc testnet, then fund → approve → (report views / split) → claim → close, watching each tx on `explorer.testnet.arc.io`. The target escrow additionally requires `registerHuman` (backend signs with `HUMAN_ATTESTOR_PRIVATE_KEY`) before a wallet can be credited, and a `HumanProof` on high-value approvals.

### Step 5 — Record the demo (2 to 4 min, hard cap 4:00; over 4:00 is rejected)
Show: the Arc Studio project → the app funding → a claim (HumanSplit is immediate; PerView needs a matured credit) → the txs on `explorer.testnet.arc.io`. Narrate "USDC is the gas + settlement token." Script: `docs/DEMO_SCRIPT.md`.

> After `docs/architecture.svg` is updated: to turn it into a PNG for the form, open it in a browser and export, or run `npx -y svgexport docs/architecture.svg docs/architecture.png 2x`.
