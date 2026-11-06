# World, Best Use of IDKit (sign-up verification)

Scope: creator sign-up proof of human. The split-release gate belongs to the Agent Pass track (`WORLD_AGENT_PASS.md`); IDKit also still gates human-built splits when `WORLD_AUTH_POLICY=either`.

STATUS (2026-11-06): the widget and server verify are wired in code. DONE 2026-11-06: Developer Portal app 'Clippo' created, relying party registered (RP id and signer address shown), and actions `clippo-creator-signup`, `clippo-approve-split`, `clippo-approve-campaign` created; app id, RP id and signing key are in `web/.env.local`. No verification (proof) run has happened yet. Items marked TODO / FILL AFTER LIVE RUN need credentials and a real or sandbox World ID.

## Research notes (docs.world.org, read 2026-10-28)

- IDKit 4.x flow: backend signs an RP request (`signRequest`, never client side) giving `sig, nonce, created_at, expires_at`; client builds `rp_context {rp_id, nonce, created_at, expires_at, signature}` and renders `IDKitRequestWidget` with `app_id, action, environment, preset, allow_legacy_proofs`; backend forwards the IDKit result unmodified to `POST https://developer.world.org/api/v4/verify/{rp_id}` and accepts only `success === true` with matching `environment`.
- Environments for the request/verify body: `production` (default), `staging`, `sandbox`. The integrate page mentions the staging simulator (simulator.worldcoin.org); the Sandbox page says use `environment: sandbox` with the World ID (Sandbox) app (access requested in the Developer Portal; TestFlight / Play testing) and still post to the production verify endpoint.
- Nullifier: unique per (user, app/RP, action). Store it, reject reuse for the same action (docs suggest `NUMERIC(78,0)`). Docs recommend `handleVerify` so a backend refusal puts the widget in error (`failed_by_host_app`).
- Presets: `orbLegacy`, `proofOfHuman` documented. Clippo now uses `proofOfHuman({ signal })` (`components/IDKitSheet.tsx`), with `allow_legacy_proofs` on because the preset includes a legacy Orb fallback. The exact `identifier` string in a live result is not confirmed: TODO.
- Error codes (28) documented at /world-id/idkit/error-codes, incl. `user_rejected`, `max_verifications_reached`, `nullifier_replayed`, `rp_signature_expired`, `timeout`, `connection_failed`, `failed_by_host_app`.
- On-chain: v4 `WorldIDVerifier.verify(nullifier, action, rpId, nonce, signalHash, expiresAtMin, issuerSchemaId, credentialGenesisIssuedAtMin, uint256[5] proof)`; action = `keccak256(action) >> 8`. World Chain prod `0x00000000009E00F9FE82CfeeBB4556686da094d7`, staging `0x703a6316c975DEabF30b637c155edD53e24657DB`, **Arc prod (WorldIDSatellite) `0x304E14e4dC0508C0927e3b307a2C18422C07E394`**. Store nullifier in a mapping only after verify succeeds.
- Prize page (verified live): https://ethglobal.com/events/mumbai/prizes/world . "Best Use of IDKit", $2,500 (up to 2 teams x $1,250). Requirements: integrate IDKit in a functioning app; at least one supported credential (Proof of Human, Passport/NFC, Selfie Check) verified on a server or onchain; explain the specific product trust event and why the credential is the minimum sufficient assurance; show a successful verification and one meaningful alternative path (cancel, unavailable credential, rejection, ineligible user); a short debrief with four items (time to first success, friction encountered, missing capability or documentation, the one improvement with greatest impact). Proofs use fake identities, not for production. Duplicate continuity-only prizes exist; the two open ones are this and World ID Agent Pass (`WORLD_AGENT_PASS.md`).

## Developer Portal setup, as observed 2026-11-06 (differs from the docs)

- No 'Enable World ID 4.0' banner. Flow: create app (dialog has only 'App name'; no external / mini-app type choice) -> 'World ID Configuration' tab (App ID, 'RP ID: Not registered') -> 'Register relying party' -> 'Generate new key' dialog (private key, 'Download key file (.json)', 'I have saved my private key securely') -> Continue -> after about 8 seconds the RP ID (`rp_...`) and signer address appear, with 'Rotate signer key', 'Switch to self-managed', 'Delete app'.
- Actions are created from the Dashboard tab's actions list ('Create action'). The dialog has only 'Identifier' (lowercase letters, numbers, dashes, max 32 chars) and 'Short description'. There is no max-verifications / uniqueness setting, so portal defaults apply.
- Open question (TODO): whether the default action settings allow repeat verifications for `clippo-approve-split` and `clippo-approve-campaign`. Test with a second approval; if it is refused, record it here and in the debrief.
- Developer Portal login: Auth0 passwordless email code, or 'Continue with World'. No Google.

## Requirement checklist

| Requirement | Source | Status |
| --- | --- | --- |
| Official IDKit 4.x integration (`@worldcoin/idkit` ^4.6) | PRD 6.2, docs | Done: `IDKitSheet.tsx` uses `IDKitRequestWidget` |
| RP context signed on the backend, key server-only | docs integrate | Done: `/api/worldid/rp-signature`, `createRpContext` |
| Proof validated server-side via `/api/v4/verify/{rp_id}`, `success` + environment checked | docs, Cannes analogue | Done in code (mocked fetch in tests); not run against a live portal |
| Result forwarded unmodified; action/environment mismatch refused | docs verify API | Done: `RealWorldId`, tests |
| Account marked verified only after backend validation | PRD 6.2 | Done: `completeSignup` |
| One person one account: nullifier unique | PRD 6.2, docs nullifier | Done: `User.worldIdNullifier @unique`, normalised, P2002 race handled, 409 `ALREADY_USED`; swap on a verified account refused (`ACCOUNT_ALREADY_VERIFIED`) |
| World ID is a real constraint (gates features) | Cannes analogue | Done: 403 `NOT_VERIFIED` on channel create/verify, deals, submissions, claim |
| Failure paths: cancelled, expired, already used, not configured leave action undone | PRD 6.2 | Done in UI text + backend; real widget error mapping in `IDKitSheet` |
| On-chain verification | docs (optional per analogue) | Optional path built (`lib/worldid/onchain.ts`, env `WORLD_ID_ONCHAIN_VERIFIER`, `WORLD_ID_ONCHAIN_RPC_URL`); arg mapping unit tested; ABI types and rp id numeric form unverified on a live contract |
| Verified-human badge | PRD | Done: `VerifiedMark` in Join and Account |
| Real run with staging/sandbox app and screenshots | judges | PARTLY: app, RP and three actions created 2026-11-06; the proof run itself is TODO FILL AFTER LIVE RUN |
| Short debrief, four items | Prize page | Draft with live fields blank: `docs/tracks/world-idkit-debrief.md`. FILL AFTER LIVE RUN |
| Trust event and minimum-sufficient credential explained | Prize page | Done below ("Trust event and credential rationale"); keep in the video |
| One meaningful alternative path shown | Prize page | Scripted in `world-idkit-demo.md` (cancel, credential unavailable / viewer-only, second account `ALREADY_USED`). The viewer-only state exists in code (`CredentialUnavailable` in `JoinView`/`AccountView`, triggered by the IDKit error code `credential_unavailable`); its only action is a link to `/wire` (browse as a viewer). It creates no account state and unlocks nothing. Whether World really returns that code is unverified. TODO: recorded run |
| Supported credential verified server-side | Prize page | Proof of Human via `proofOfHuman`, server verify in code. TODO: live run |
| Use `handleVerify` so backend refusal shows inside the widget | docs react | Not adopted; we verify after `onSuccess` and show our own message |

## Trust event and credential rationale

- Trust event: a creator account sign-up. A verified account unlocks channels, deals, submissions and claims, which is where USDC is paid out.
- Risk: sybil payout farming (one person creating many accounts to collect many payouts).
- Why Proof of Human: it is the minimum credential that gives per-human uniqueness. The nullifier is unique per (human, app, action), so a second account by the same human is refused (409 `ALREADY_USED`).
- Why not Selfie Check: it shows a live person is present but does not give uniqueness across the whole population, so it does not stop one person opening many accounts.
- Why not Passport/NFC: it proves an attribute of a document (a real, valid passport), which Clippo does not need; it is not the property we are defending.
- Honest limits: not run live yet; whether a given credential is available to a given user is decided by World, and our UI shows the "credential unavailable / viewer-only" path (message plus a link to `/wire`; nothing is unlocked). TODO verify live that World reports this code.
