# World / Arc / CRE: what only the human can do


Note: AgentKit registration is optional and not mentioned on the prize page; the prize page banner says proofs are mocked, so a sandbox app may not be needed. Re-read https://ethglobal.com/events/mumbai/prizes/world first.
Status 2026-11-06: the Developer Portal part (section 2) has been done live; nothing else below has been run live. The auth.world.org client (section 1) is BLOCKED, see the next section. Record results only after they actually happen.

## Blocker: auth.world.org access

Status as of 2026-11-06: OIDC client registration is BLOCKED. Both IdP portals (production https://auth.world.org/portal and sandbox https://sandbox.auth.world.org/portal) offer only "Continue with Google", described as an "enterprise Google account". A personal Gmail account signed in on the sandbox portal and got HTTP 403 `{"error":"account_not_eligible"}`. World must grant access or eligibility before a client can be registered. `WORLD_AUTH_*` is NOT configured, so the step-up gate is off.

Options:

- (a) Ask a World mentor/contact at the venue for portal eligibility, or for a pre-created sandbox client (client id and secret, with the redirect URI registered).
- (b) Test the flow in the OAuth Playground https://oauth-playground.toolsforhumanity.dev/ to show understanding of the flow. It cannot test our client or our redirect, so it is not evidence that Clippo's integration works.
- (c) Fallback for a demo ONLY if blocked: set `WORLD_AUTH_POLICY=either` so agent proposals can be released with the IDKit proof. State this honestly in the video and the debrief as a fallback and NOT the official Agent Pass integration. Without `WORLD_AUTH_*` and with the default `agent-required`, agent-proposal releases return 428 `STEPUP_REQUIRED`.

## 1. auth.world.org client (Agent Pass step-up; separate from the Developer Portal) - TODO, blocked

1. Ask your World contact for portal eligibility or a sandbox client (lead time about 1 hour; self-service registration is blocked, see above). Sandbox issuer: `https://sandbox.auth.world.org` (production: `https://auth.world.org`).
2. Register the redirect URI exactly: `https://<host>/api/auth/world/callback`. Localhost over http is probably unsupported: use an HTTPS tunnel or the deployed URL.
3. Create a sandbox World ID (fake identity) to complete the check.
4. Set in `web/.env.local` and in Vercel (Production and Preview as needed; the secret as Sensitive, never `NEXT_PUBLIC_*`):
   - `WORLD_AUTH_CLIENT_ID`
   - `WORLD_AUTH_CLIENT_SECRET`
   - `WORLD_AUTH_ISSUER` = `https://sandbox.auth.world.org`
   - `WORLD_AUTH_REDIRECT_URI` = the exact registered URL
   - `WORLD_AUTH_TOKEN_AUTH` = `basic` or `post` (default `basic`; use what the client is registered for)
   - `WORLD_AUTH_ACR` (default `https://world.org/oidc/acr/orb`; confirm what the sandbox issues)
   - `WORLD_AUTH_POLICY` = `agent-required` (default)
5. Run `npm run doctor` (fetches the discovery document) and check the acr and claim names it shows.

## 2. Developer Portal app (IDKit) - DONE 2026-11-06 (except the checks marked TODO)

1. DONE 2026-11-06: app 'Clippo' created at developer.world.org (login is an Auth0 passwordless email code, or 'Continue with World'; no Google). The real flow differs from the older docs: there is no 'Enable World ID 4.0' banner and no app-type choice. The create dialog has only 'App name'. Then the app's 'World ID Configuration' tab shows the App ID and 'RP ID: Not registered'; 'Register relying party' opens a 'Generate new key' dialog with the private signing key (copy or 'Download key file (.json)', tick 'I have saved my private key securely', Continue); after about 8 seconds the page shows the RP ID (`rp_...`) and signer address, plus 'Rotate signer key', 'Switch to self-managed' and 'Delete app'. App id, RP id and signing key were written to `web/.env.local`.
2. DONE 2026-11-06: actions `clippo-creator-signup`, `clippo-approve-split`, `clippo-approve-campaign` created from the Dashboard tab (actions list, 'Create action'). The dialog has only 'Identifier' (lowercase letters, numbers, dashes, max 32 chars) and 'Short description': there is NO max-verifications / uniqueness setting, so portal defaults apply. TODO (unresolved): do the defaults allow repeat verifications for the two approve actions? Test with a second approval on the same account; if the portal refuses it, note that here and in the debrief.
3. DONE (values set in `web/.env.local`; Vercel still TODO): `WORLD_ID_APP_ID`, `WORLD_ID_RP_ID`, `WORLD_ID_SIGNING_KEY`, `WORLD_ID_ACTION=clippo-creator-signup`, `WORLD_ID_ENVIRONMENT=staging` (or `sandbox`).
4. TODO: confirm the app/actions are set for the Simulator (staging) environment (precheck reported `is_staging=false`).

## 3. AgentKit proposer identity (not the prize integration)

1. `npx @worldcoin/agentkit-cli register <agent-address>` (needs a World App scan by a verified human), then set `AGENT_PASS_*` (`AGENT_PASS_PRIVATE_KEY`). Or use `AGENT_PASS_DEMO=1` (labelled demo).
2. `ANTHROPIC_API_KEY` (or Gemini) for "Ask Claude to propose".

## 4. Runs and recordings (each must show the protected action NOT happening on failure)

0. If the IdP stays blocked, see the fallback in 'Blocker: auth.world.org access' (option c) and label it as a fallback.
1. IDKit: success, cancel, credential unavailable / viewer-only, second account `ALREADY_USED` (simulator.worldcoin.org or World ID Sandbox app). See `docs/tracks/world-idkit-demo.md`.
2. Step-up (approvers must be IDKit-verified first): success, cancel at World, expired attempt, human-built split changed after start (`STEPUP_BINDING_MISMATCH`) or wrong identity. See `docs/tracks/agent-pass-demo.md`.
3. Fill the four debrief items in `agent-pass-debrief.md` and `world-idkit-debrief.md` from the real runs only.

## 5. Questions to ask a mentor / World contact

- Can you grant our account access to auth.world.org (sandbox portal), or pre-create a sandbox client? A personal Gmail gets `account_not_eligible`.
- Is AgentKit accepted for the Agent Pass prize, or only auth.world.org?
- Does the sandbox issue `acr` = orb (`https://world.org/oidc/acr/orb`)? What values does it issue?
- Is a localhost redirect URI allowed, or is HTTPS mandatory?
- What is the exact `identifier` string for the `proofOfHuman` preset in the IDKit result?
- Which token endpoint client authentication is the default (basic or post)?
- Does World return `credential_unavailable` for a user without a Proof of Human credential?

## 6. Arc, Chainlink, submission

1. Fund a deployer key on Arc testnet, deploy `ClippoEscrow` (`contracts/script/Deploy.s.sol`), set `ESCROW_ADDRESS` and `ESCROW_DEPLOY_BLOCK`; create the Arc Studio project.
2. `cre login`, then run `cre workflow simulate` and capture the output (`docs/tracks/CRE.md`).
3. Re-check the Arc and Chainlink prize pages (dead slug URLs in `ARC.md` / `CRE.md`).
4. Record the demo video (max 5 minutes); say plainly what was not run live. `NEXT_PUBLIC_DEMO` unset.
5. Work through `docs/SUBMISSION_CHECKLIST.md`.
