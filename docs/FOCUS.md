# Clippo focus guide

Keep us on track until the deadline: **Sat 2026-11-07 09:00 IST**. Read this before starting any task. Update it when a decision changes. The step-by-step history lives in `docs/BUILD_LOG.md`; this file is the plan and the rules.

## The one rule

A partner must sit in the **core** of Clippo. If we remove it, a real user must lose something the core loop depends on.

Before you build anything, answer these three questions. If any answer is "no", do not build it.

1. Which partner does this serve: **Chainlink CRE**, **World**, or **Arc**?
2. If that partner is removed, does the product change for a user, not just a label on a page?
3. Would a plain replacement (cron job, Postgres, phone check, another chain) do the same job with no user loss?

If the answer to 3 is "yes", the work is an add-on. Skip it, or cut it down to the part that has no plain replacement.

## The three partners (3 picks on the form, nothing else)

All tracks of one partner count as one pick. Do not add a fourth partner.

| Partner | Prize tracks we target | What makes it core | Status |
| --- | --- | --- | --- |
| Chainlink | Best workflow with CRE ($1,500) | The escrow accepts view credits only from the CRE report adapter, so no Clippo key can invent views. | Contract enforcement written (`498f649`), not deployed. Workflow simulated (`6f74f7b`): live-feed run is an empty no-op; a credit run was done on a local fork of Arc only. Not deployed. |
| World | Agent Pass ($5,000 / $2,500 Continuity), Best Use of IDKit ($2,500 / $2,500 Continuity) | One verified human per wallet is checked by the contract; a split needs a fresh human approval bound to that split. | `registerHuman` and approval check written (`498f649`). OIDC step-up at `auth.world.org` written (`19205ba`). Never run against the real issuer or a real proof. |
| Arc | Best Smart Contracts with Advanced Stablecoin Logic in Arc Studio ($3,000) | The escrow holds USDC and pays gas in USDC on Arc. | Old escrow is live on Arc testnet. New enforcing escrow is not deployed. No Arc Studio project exists. |

Prize text and requirements: https://ethglobal.com/events/mumbai/prizes (re-read it before submitting; partners can change it).

## What we may say today, and what we may not

| We may say | We may NOT say (yet) |
| --- | --- |
| The enforcing escrow is written and its Foundry tests pass (per the build log). | That it is deployed, or that the live site uses it. |
| The CRE workflow ran in the CRE simulator, and a credit was made on a local fork of Arc. | That CRE is deployed, ran on real Arc, or reaches consensus. |
| The Agent Pass step-up is written and tested against a local fake issuer. | That it works against the real `auth.world.org`. |
| The contracts were written and tested in Foundry. | That Arc Studio built or deployed anything. |
| Prize World proofs are mocked identities (World says so). | That any World proof has run in this repo. |

Rules: never claim something works unless it was run. Never invent tx hashes. Record real hashes in `docs/BUILD_LOG.md` the moment they exist.

## Order of work (each step unlocks the next)

1. **Deploy the new escrow on Arc** (owner signs). Needs the backend wallet address (`HUMAN_ATTESTOR_ADDRESS`). Until this is done, nothing "real" can be shown.
2. **Point the app at it.** Vercel env, `ESCROW_ADDRESS`, `ESCROW_DEPLOY_BLOCK`, and the real receiver in `cre/workflows/clippo-settlement/config.production.json`. Edit that file by hand: the deploy helper `scripts/deploy-arc.mjs` only writes `config.staging.json`.
3. **One full real run on Arc:** fund, approve, CRE report, claim, dispute. Save every tx hash in the build log.
4. **Arc Studio:** create the project, import the repo, get the shareable URL. Every Arc prize requires it.
5. **World:** create the portal client, run one real IDKit proof (simulator) and one real step-up. Fill in the debrief only with real numbers.
6. **CRE:** simulate again with the final config. Deploy only if CRE access is approved; otherwise submit the simulation and say so.
7. **Docs and video:** under 4:00, at least 720p, your own voice, not sped up. Fill `docs/SUBMISSION_CHECKLIST.md`.
8. **Submit before 09:00 IST.** Leave a buffer of at least one hour.

Optional, only if steps 1 to 7 are done and there is time left. Both come from the earlier review and have not been started:

- CRE reads views from YouTube itself instead of Clippo's feed. This makes the "Clippo cannot invent views" claim true. Without it, the claim is weaker. (Estimated 6 to 7 hours.)
- A confirmed fraud flag bans the person, not just the account (about 6 hours). See the trap below.

## Prize requirements checklist

Tick only when it exists and was run.

**Chainlink CRE**
- [ ] A CRE workflow that links a blockchain with an external API, data source, LLM or agent
- [ ] A successful CLI simulation or a live deploy
- [ ] The workflow is meaningfully used by the project (the escrow depends on it)

**World Agent Pass**
- [ ] Official Agent Pass integration (OIDC at `auth.world.org`)
- [ ] Full journey: request, user completion, validated result, protected action
- [ ] A denied, expired or cancelled path where the action does not happen
- [ ] Result validated in the backend, with no client secret in the browser
- [ ] Short debrief: time to first success, friction, missing docs, best improvement

**World IDKit**
- [ ] IDKit in a working app
- [ ] Result verified on the server or onchain
- [ ] A written trust moment and why this credential is enough
- [ ] One success and one alternative path (cancelled, rejected, ineligible)
- [ ] Short debrief

**Arc (smart contracts track)**
- [ ] Shareable Arc Studio project URL, and Studio shown in the demo
- [ ] Working frontend and backend, plus an architecture diagram
- [ ] Video and presentation, repo link
- [ ] The submission names the exact bounty

**Everyone**
- [ ] Public repo with small commits (no single large final commit)
- [ ] What existed before the event is written down, and what is new
- [ ] Where AI tools were used is written down
- [ ] Video 2 to 4 minutes

## Traps to avoid

- **Fraud flags:** `web/src/lib/antifraud/flags.ts` confirms flags of two kinds, `VIEW_ANOMALY` and `CLIP_DELETED`. If you add a ban, ban only on `VIEW_ANOMALY`, or a creator who deletes a clip gets banned.
- **New CRE data route:** if you add a route that CRE reads, apply the same filters as `web/src/lib/snapshots.ts`: approved campaign, PerView or PoolShare mode, clip still live, AI verdict approve, and the `VIEW_ANOMALY` fraud hold. That file does not check "verified human" or caps; the escrow enforces those. A new route that skips the filters bypasses the rules.
- **Wrong escrow address:** two old escrows exist on Arc testnet (`0xd845…c39c` is what the live site uses; `0xc7b9…e310` is cited in `docs/SUBMISSION_ARC.md`). Neither is the new escrow. Do not quote either as "the" deployed contract.
- **Single-node simulator:** CRE simulation has no real consensus. Say that; do not claim a trust gain you did not show.
- **Do not mix World proof versions.** Pick one and keep it.
- **No LICENSE file** is tracked. The owner must choose a license; do not add one without asking.

## Rejected on purpose (do not spend time here)

- Uniswap, ENS, 0G, Hedera, Whitechain, 1inch, Arkiv, Definitive, EF tracks, CCIP: each would sit beside the core loop, and a plain replacement does the same job.
- Arc DeFi, consumer-agent and Bridge Kit tracks: they would mean reframing Clippo or take too long. Arc Studio Continuity is the fallback if the smart-contracts track cannot be met.

## Open decisions for the owner

1. Which old escrow address is the one to cite, if any (`0xd845…c39c` or `0xc7b9…e310`)?
2. Is the optional CRE-reads-YouTube work worth the hours, or do we submit what the simulation shows?
3. License for the repo.
4. Who owns each file when two sessions work at once (one session per file group avoids overwrites).
