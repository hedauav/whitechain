# Submission checklist

| Item | Value / status |
| --- | --- |
| Repo link | `<REPO_URL>` (one repo; `contracts/lib/*` are git submodules, so clone with `--recurse-submodules`; `contracts/` and `web/` have no `.git` of their own) |
| Arc Studio project URL | `<ARC_STUDIO_PROJECT_URL>` (required; show Studio in the video) |
| Deployed escrow (Arc testnet explorer) | `<ARCSCAN_ESCROW_URL>` |
| Demo video (max 5 min) | `<VIDEO_URL>`, script in `docs/DEMO_SCRIPT.md` |
| Architecture diagram | `docs/ARCHITECTURE.md` (export the Mermaid to PNG for the form) |
| Live app URL (optional) | `<APP_URL>` |

## Per track

- (Chainlink CRE items are in the verified block below.)
- World ID Agent Pass (prize page: https://ethglobal.com/events/mumbai/prizes/world ; checked live, re-read before submitting). None of these has been run live yet:
  - [ ] auth.world.org client registered (sandbox): `WORLD_AUTH_CLIENT_ID` / `WORLD_AUTH_CLIENT_SECRET` (BLOCKED as of 2026-11-06: portal needs an enterprise Google account, personal Gmail gets `account_not_eligible`; ask a World mentor, see `docs/WORLD_USER_TODO.md` 'Blocker: auth.world.org access'; if it stays blocked and the demo uses `WORLD_AUTH_POLICY=either`, say in the video and debrief that it is a fallback, not the official Agent Pass integration)
  - [ ] Redirect URI(s) registered, exact HTTPS URL = `WORLD_AUTH_REDIRECT_URI` (tunnel or deployed host)
  - [ ] Sandbox World ID (fake identity) created
  - [ ] `npm run doctor` shows the world-auth block green (discovery document fetched)
  - [ ] Recorded: success, cancelled, expired, and one denied path (split changed or wrong identity), each showing the split NOT released
  - [ ] `docs/tracks/agent-pass-debrief.md` four items filled (time to first success, friction, missing capability/docs, one improvement)
- World Best Use of IDKit:
  - [x] Developer Portal app 'Clippo', relying party and actions `clippo-creator-signup`, `clippo-approve-split`, `clippo-approve-campaign` created (2026-11-06; no proof run yet)
  - [ ] Check whether default action settings allow repeat verifications for the approve actions (second approval; note the result)
  - [ ] Real `WORLD_ID_*` run with a supported credential (Proof of Human) verified server-side
  - [ ] Recorded: success plus one alternative path (cancel, credential unavailable, or second account `ALREADY_USED`)
  - [ ] Trust event and minimum-credential rationale said in the video (see `docs/tracks/WORLD_IDKIT.md`)
  - [ ] `docs/tracks/world-idkit-debrief.md` four items filled
- Arc and Chainlink prize pages RE-CHECKED live 2026-11-06 (https://ethglobal.com/events/mumbai/prizes/arc and /chainlink); verified items below. Re-read once more right before submitting.
- Arc, "Best Smart Contracts with Advanced Stablecoin Logic, In Arc Studio" ($3,000). Every Arc prize requires Arc Studio as the starting point. None of these is done yet:
  - [ ] State the bounty name exactly in the submission
  - [ ] Contracts written/tested/deployed in Arc Studio (see `docs/tracks/ARC.md` Arc Studio plan); deployed to Arc testnet
  - [ ] Shareable Arc Studio project URL that judges can open (filled in the table above)
  - [ ] Studio shown in the demo video
  - [ ] Functional MVP: working frontend and backend, campaign shown funding to claim
  - [ ] Architecture diagram
  - [ ] Video demonstration + presentation (effective use of Arc Studio and Circle developer tools)
  - [ ] Link to GitHub/Replit repo
- Chainlink "Best workflow with CRE" ($1,500; verified 2026-11-06):
  - [ ] Successful `cre workflow simulate` via the CRE CLI (needs `cre login`) or live deployment; deploy is not required
  - [ ] Workflow integrates a blockchain with an external API/data source and is meaningfully used (see `docs/tracks/CRE.md`)

## Before submitting

- [ ] Re-run `forge test`, `npm test`, `npm run lint`, `npm run typecheck` (web and cre).
- [ ] No secrets committed (`web/.env`, `web/.env.local`, `cre/.env` excluded).
- [ ] README status table matches reality (updated after the UI/demo pass; re-check after any live run).
- [ ] Demo data: `(cd web && node --env-file-if-exists=.env.local scripts/seed-demo.mjs --reset)` ran clean; no `[SEED]` rows in the production DB.
- [ ] Responsive: `npm run check:overflow` passes; device screenshots reviewed (`web/scripts/shoot-senior.mjs`, output in `design/shots/senior`).
- [ ] Video states what was not run live (CRE broadcast, live World ID / auth.world.org step-up / AgentBook, platform APIs if keys are missing). State plainly anything that was not run live.
- [ ] `NEXT_PUBLIC_DEMO` is unset in the recorded build.
