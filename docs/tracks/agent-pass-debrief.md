# World ID Agent Pass: debrief (draft)

STATUS (2026-11-06): no live run of the step-up has happened; OIDC client registration at auth.world.org is blocked (see friction notes). Nothing here claims a run. Everything marked FILL AFTER LIVE RUN must stay blank until a real run against the auth.world.org sandbox. Do not submit invented numbers.

Prize page: https://ethglobal.com/events/mumbai/prizes/world

## What we built (compressed; implemented in code, not yet run live)

- Product: auth.world.org (OIDC, auth code + S256 PKCE, step-up with `max_age=0` and an `acr` claim; sandbox issuer `sandbox.auth.world.org`).
- Protected action: releasing an AI-proposed payout split. Claude proposes (advisory, code re-checks every number); the proposer's identity is an AgentKit/AgentBook-registered wallet (not the prize integration).
- Flow: Approve -> `POST /api/campaigns/:id/stepup/start` -> redirect to World -> `GET /api/auth/world/callback` (server-side code exchange, ID token validated, bound to the split hash) -> approval recorded. `GET /api/stepup/:attemptId` reports status. Two-party campaigns need both approvers on the identical split.
- Denied paths: cancelled (`STEPUP_DENIED` 403), expired (`STEPUP_EXPIRED` 410), token or nonce invalid (401), assurance too low (`STEPUP_ASSURANCE`), stale auth (`STEPUP_STALE_AUTH`), wrong identity (`STEPUP_IDENTITY_MISMATCH`), the same person approving as both campaigner and admin (`STEPUP_SAME_HUMAN`), human-built split changed after start (`STEPUP_BINDING_MISMATCH` 409; for an agent proposal `SPLIT_CHANGED` 409 comes first), already used (`STEPUP_CONSUMED` 409), IdP unreachable (`STEPUP_DEPENDENCY` 502). Each leaves the split unreleased.
- Secrets: client secret and token exchange are server-only; the browser only carries the redirect.
- Fake identities: sandbox identities are fake and not for production.

## The four debrief items

1. Time to first success
   FILL AFTER LIVE RUN: ____ (from registering the client to the first approved split).

2. Friction encountered
   FILL AFTER LIVE RUN: ____
   Observed 2026-11-06 (real, not a hypothesis):
   - The auth.world.org IdP portals (production https://auth.world.org/portal and sandbox https://sandbox.auth.world.org/portal) accept only 'Continue with Google', described as an 'enterprise Google account'. A personal Gmail account got HTTP 403 `{"error":"account_not_eligible"}` from the sandbox portal after Google sign-in. This blocked OIDC client registration; access has to be granted by World. The portal gives no self-service route and no hint on how to become eligible.
   - The Developer Portal (separate product) uses Auth0 passwordless email code or 'Continue with World' and has no Google option, so the two portals have different sign-in rules.
   - The Developer Portal flow differs from the docs: no 'Enable World ID 4.0' banner, no app-type choice, and actions have no per-action verification limit setting.
   Still hypotheses to check: exact HTTPS redirect URI (localhost http likely unsupported), token endpoint auth method, which `acr` values the sandbox returns.

3. Missing capability or documentation
   Observed so far: no documented path for a hackathon team without an enterprise Google account to register an OIDC client; no self-serve sandbox client. FILL AFTER LIVE RUN: the rest.

4. The one improvement with the greatest impact
   FILL AFTER LIVE RUN: ____

## Live-run record (fill in)

| Item | Result |
| --- | --- |
| Fallback note | If the portal stays blocked, a demo may use `WORLD_AUTH_POLICY=either` (agent proposals released with the IDKit proof). That is a fallback and NOT the official Agent Pass integration; say so in the video and here. TODO: decide and record. The OAuth Playground https://oauth-playground.toolsforhumanity.dev/ can show understanding of the flow but cannot test our client or redirect. |
| Success run | TODO |
| Cancelled at World (action not taken) | TODO |
| Expired (action not taken) | TODO |
| Split changed / wrong identity (action not taken) | TODO |
