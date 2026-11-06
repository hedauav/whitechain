# World IDKit demo clicks (about 90 seconds)

STATUS: scripted, not yet recorded or run live. Sandbox/staging identities are FAKE and not for production; say so on camera.

Prereq (TODO): `.env.local` has `WORLD_ID_APP_ID`, `WORLD_ID_RP_ID`, `WORLD_ID_SIGNING_KEY`, `WORLD_ID_ACTION=clippo-creator-signup`, `WORLD_ID_ENVIRONMENT=staging` (or `sandbox`), and `NEXT_PUBLIC_DEMO` unset. Two wallets in the browser, one phone with the staging simulator or the World ID Sandbox app.

State the trust event: creator sign-up unlocks channels, deals, submissions, claims (where USDC is paid); the risk is sybil payout farming; Proof of Human is the minimum credential giving per-human uniqueness.

1. Wallet A: /join, "I clip", connect. Show step 2 greyed out. Optionally `POST /api/channels` returns 403 `NOT_VERIFIED`.
2. Cancel path: "Verify with World ID", show the IDKit QR, press Cancel: "You cancelled the check. Nothing was changed." `/api/auth/me` still unverified.
3. Success: press again, approve in the simulator/World app. Badge "Verified with World ID", step 2 unlocks. Show `/api/worldid/verify` 200.
4. Prove a channel, submit a clip: allowed.
5. Second account: wallet B, verify with the same World ID. "This World ID is already linked to another Clippo account" (409 `ALREADY_USED`); account B unverified, channel proof refused (403).
6. Credential unavailable / viewer-only: with an identity that lacks Proof of Human (or the widget reporting the credential unavailable), the UI shows "No Proof of Human credential" with a help link and a "Continue without verifying (viewer only)" button. That button only navigates to `/wire`; the account stays unverified and nothing unlocks (show `/api/auth/me` and a 403 `NOT_VERIFIED`). TODO: whether the real World app returns the `credential_unavailable` code is unverified; if it cannot be reproduced, say so in the video.
7. Optional: expired (let the QR time out): "The check timed out"; unset `WORLD_ID_APP_ID` shows the "not configured" sheet.
8. Close with the debrief (`world-idkit-debrief.md`).

Automated, credential-free: `npm run e2e:world` (gating 403s, not-configured sheet, refusals leave the account unverified). It cannot scan a QR: steps 3 and 5 need a real app.

Tests: `npx vitest run src/lib/worldid`.
