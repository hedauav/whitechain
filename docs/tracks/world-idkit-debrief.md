# World, Best Use of IDKit: debrief (draft)

STATUS (2026-11-06): Developer Portal app, RP and three actions are created; no proof run has happened yet. FILL AFTER LIVE RUN fields stay blank until a real run (staging simulator or the World ID Sandbox app). Proofs use fake identities, not for production.

Prize page: https://ethglobal.com/events/mumbai/prizes/world

## What we built (in code, not yet run live)

IDKit (`IDKitRequestWidget`, `proofOfHuman` preset) at creator sign-up. The RP context is signed on the backend (`/api/worldid/rp-signature`); the IDKit result is forwarded unmodified to the Developer Portal v4 verify endpoint (`/api/worldid/verify`), `success` and environment are checked, and the nullifier is stored unique per human (409 `ALREADY_USED`). IDKit also still gates human-built splits when `WORLD_AUTH_POLICY=either`.

## Trust event and why this credential

- Trust event: creator sign-up unlocks channels, deals, submissions and claims, where USDC is paid.
- Risk: sybil payout farming.
- Proof of Human is the minimum credential that gives per-human uniqueness (one nullifier per human).
- Selfie Check proves a live person but not uniqueness across the population; Passport/NFC proves a document attribute we do not need.

## Paths to show (TODO: record)

| Path | Expected | Recorded |
| --- | --- | --- |
| Success | Account verified, features unlocked | TODO |
| Cancel | "You cancelled the check", account stays unverified | TODO |
| Credential unavailable / viewer-only | Clear message, no unlock | TODO (confirm the UI supports it) |
| Second account, same human | 409 `ALREADY_USED`, second account unverified | TODO |

## The four debrief items

1. Time to first success: FILL AFTER LIVE RUN: ____
2. Friction encountered: observed 2026-11-06 during Developer Portal setup (proof-run friction still FILL AFTER LIVE RUN):
   - The portal flow differs from the docs: there is no 'Enable World ID 4.0' banner. You create the app, open its 'World ID Configuration' tab (shows 'RP ID: Not registered'), click 'Register relying party', save the private signing key in a 'Generate new key' dialog, and wait about 8 seconds for the RP ID.
   - No app-type choice at creation (the dialog has only 'App name').
   - No per-action verification limit UI: the action dialog has only 'Identifier' (lowercase, numbers, dashes, max 32 chars) and 'Short description', so we cannot set one-per-human or unlimited; portal defaults apply. Open question: do defaults allow repeat verifications for the approve actions? TODO test with a second approval.
   - The separate auth.world.org portal (needed for Agent Pass OIDC clients) requires an enterprise Google account; a personal Gmail got 403 `account_not_eligible`, which blocked OIDC client registration.
3. Missing capability or documentation: observed so far: docs out of date against the portal UI (no 4.0 banner, no app type), no per-action limit setting documented or shown, no route for non-enterprise accounts to the auth.world.org portal. FILL AFTER LIVE RUN: the rest.
4. The one improvement with the greatest impact: FILL AFTER LIVE RUN: ____
