# World, Agent Pass: research and requirement checklist

Prize: "World ID Agent Pass", $5,000 (1st $2,500, 2nd $1,500, 3rd $1,000). Prize page (verified live): https://ethglobal.com/events/mumbai/prizes/world . Use this URL only; older event-slug variants return 404.

STATUS (2026-11-06): the Developer Portal app 'Clippo' and three actions now exist (IDKit side, see `WORLD_IDKIT.md`), but the auth.world.org step-up has NOT been run: OIDC client registration is blocked (see 'Blocker: auth.world.org access' below) and `WORLD_AUTH_*` is not configured, so the step-up gate is off. Nothing in the step-up checklist has been run live. Items marked TODO / FILL AFTER LIVE RUN need real credentials and a recorded run. Where the text says "implemented in code, not yet run live", the code exists (or is being added) and is covered only by tests with doubles.

Cross-reference: AgentKit registration (AgentBook) is a different product, needs a real Orb-verified World App, is optional/unsupported by the prize page, and the page banner says proofs are mocked (no sandbox app needed to qualify). Verify on the page before relying on this.

## What "Agent Pass" is (prize page) and what Clippo uses

The prize page asks teams to integrate the official **World ID Agent Pass**. The official product is **auth.world.org**: an OIDC identity provider (authorization code + S256 PKCE; step-up with `max_age=0` and an `acr` claim; sandbox issuer `sandbox.auth.world.org`). It is NOT AgentKit / AgentBook. Prize requirements (from the page):

1. Integrate the official World ID Agent Pass.
2. A complete journey: verification request, user completion, validated result, protected app/agent action.
3. A denied / expired / cancelled / unsuccessful path where the protected action does NOT occur.
4. Validate identity results in a secure backend: no exposed client secrets, never treat an unvalidated client response as authorization.
5. A short debrief: time to first success, friction encountered, missing capability or documentation, the one improvement with greatest impact.

Proofs use fake identities and are not for production.

How Clippo maps to it (design, implemented in code, not yet run live):

| Piece | Role |
| --- | --- |
| AI proposer (Claude, signed with an AgentKit/AgentBook-registered wallet) | Proposes a payout split. Its identity is AgentKit/AgentBook. This is Clippo's agent identity and is NOT the integration the prize asks for. |
| auth.world.org step-up (`web/src/lib/worldauth/*`) | The human approver gate for RELEASING an agent-proposed split. Routes: `POST /api/campaigns/:id/stepup/start`, `GET /api/auth/world/callback`, `GET /api/stepup/:attemptId`. The backend does the code exchange, validates the ID token (signature, issuer, audience, nonce, `acr`, fresh auth time via `max_age=0`), binds the result to the exact split hash, and only then records the approval. |
| IDKit (proofOfHuman) | Sign-up uniqueness (one nullifier per human); still gates human-built splits when `WORLD_AUTH_POLICY=either`. See `WORLD_IDKIT.md`. |

Background on AgentKit (still used for the proposer identity):

| Topic | Finding | Source |
| --- | --- | --- |
| Purpose | AgentKit lets a service tell human-backed agents apart from bots and scripts. | https://docs.world.org/agents/agent-kit |
| Agent to human link | A human registers the agent's wallet address in **AgentBook**, an on-chain registry on World Chain (`eip155:480`, contract `0xA23aB2712eA7BBa896930544C7d6636a96b944dA`). Registration is `npx @worldcoin/agentkit-cli register <agent-address>`; the World App verification flow prompts the person and the CLI submits the transaction through a hosted relay. `status <address>` checks it. | agent-kit docs; https://docs.world.org/agents/agent-kit/sdk-reference.md |
| Delegation | Not a separate feature. Registration in AgentBook is the delegation. There is no scoped or revocable delegation API in the docs. | agent-kit docs |
| Agent proves itself | The agent signs a SIWE (EIP-4361 / CAIP-122) payload; the server checks it and calls `lookupHuman(address)`, which returns an anonymous human id or `null`. Header name `agentkit` (base64 JSON). | sdk-reference |
| SDK | `@worldcoin/agentkit` (client `createAgentkitClient`, server `createAgentkitHooks`, `declareAgentkitExtension`, `InMemoryAgentKitStorage`) re-exporting `@worldcoin/agentkit-core` (`createAgentBookVerifier`, `parseAgentkitHeader`, `validateAgentkitMessage`, `verifyAgentkitSignature`, `formatSIWEMessage`, `AgentkitPayloadSchema`). CLI: `@worldcoin/agentkit-cli`. Installed here: `@worldcoin/agentkit@0.2.1` (read from node_modules typings). | npm; sdk-reference |
| Access modes and limits | `free`, `free-trial` (default 3 uses, per human per endpoint), `discount`. Usage counters are per endpoint and per human id, so several agents of one human share the allowance. No other rate limits are documented. | agent-kit docs |
| Replay protection | Optional storage hooks `hasUsedNonce` / `recordNonce`; production needs durable storage. | agent-kit docs |
| Human-in-the-loop | Separate kit: an agent pauses and a verified human approves via a World ID proof bound to an action string. Packages `@worldcoin/human-in-the-loop` (server, Workflow SDK + AI SDK v6) and `@worldcoin/human-in-the-loop-react`. Server must re-verify the proof at `POST https://developer.world.org/api/v4/verify/{rp_id}` with `environment: production`, bind the action to the operation, and consume the nullifier once in durable storage. | https://docs.world.org/agents/human-in-the-loop/integrate.md |
| auth.world.org / OIDC step-up | This IS the official Agent Pass product per the prize page: OIDC provider, auth code + S256 PKCE, step-up (`max_age=0` + `acr`), sandbox issuer `sandbox.auth.world.org`. Clippo's step-up gate is implemented in code (`lib/worldauth/*`), not yet run live. Exact claim and endpoint details are confirmed only by a live run against the sandbox issuer: TODO. | https://ethglobal.com/events/mumbai/prizes/world |
| Fake or mock identities | The docs describe no fake-identity fixture. They note that staging and sandbox environments accept test proofs, which is why production must be pinned on the server. The PRD says Agent Pass proofs use fake identities (demo only); that statement is **not confirmed by the public docs**. | human-in-the-loop docs; PRD 6.2 |
| What the prize judges | See the requirements list above (prize page https://ethglobal.com/events/mumbai/prizes/world, verified live). | https://ethglobal.com/events/mumbai/prizes/world |

## Requirement checklist

Status key: DONE (built and tested with doubles; NOT a live run), PARTLY, TODO (needs your credentials or a real device), UNVERIFIED (could not confirm from public sources). Rows 6-13 are tested failure paths of the earlier IDKit approval flow; the step-up equivalents are in the next section.

| # | Requirement | Source | Status |
| --- | --- | --- | --- |
| 1 | Proposer agent identity (AgentKit/AgentBook). NOT a prize requirement: the prize wants auth.world.org | Clippo design | DONE in code: the proposer is an AgentKit agent wallet; the backend verifies its SIWE payload and an AgentBook lookup (`lib/agentpass/`). TODO: register the real wallet in AgentBook (needs World App + a verified human). |
| 2 | Agent registered or delegated by the campaigner | Task brief | PARTLY: `POST /api/campaigns/:id/agent` binds the AgentBook-registered wallet to one campaign (revocable with DELETE). AgentBook itself has no scoped delegation, and it cannot prove that the registering human is the campaigner (human ids are anonymous). |
| 3 | AI proposes the split; proposals signed and attributed | PRD 6.2 | DONE: signed AgentKit payload bound to the split hash; stored and audited. The proposer is Claude (`claude-sonnet-5-5` via `lib/ai/llm.ts`), advisory only; the old proportional planner remains as the explicit `mode: "deterministic"` option and as the checked fallback. See "Claude-backed proposer" below. |
| 4 | Approver completes an auth.world.org step-up (or, with `WORLD_AUTH_POLICY=either`, a fresh IDKit proof) bound to the split hash; backend validates before the approval is recorded | Prize page | Implemented in code, not yet run live (step-up). The earlier IDKit path (proof bound to `split:<campaign>:<hash>`, Developer Portal v4, consumed once) is tested with doubles. TODO: run against the sandbox issuer. |
| 5 | Guardrail: agents never release payouts alone; high-value needs a fresh unique-human confirmation | PRD 4.8 | DONE: no agent code path writes payouts, approvals, attestations or proofs (guardrail tests); payouts only come from the on-chain event indexer; high-value campaign approval already needs `/attest`. |
| 6 | Failure path: cancelled | PRD 6.2 | DONE (backend 403 `WORLD_ID_DENIED`; widget cancel reported to the audit log) |
| 7 | Failure path: expired | PRD 6.2 | DONE (proof expired; and the agent proposal's own 30 minute expiry: 410 `PROPOSAL_EXPIRED`) |
| 8 | Failure path: repeated or replayed proof | PRD 6.2 | DONE (409 `PROOF_REUSED`, unique proof hash). Real-mode replay rule at World's side: UNVERIFIED. |
| 9 | Failure path: wrong approver | Task brief | DONE (403 `WRONG_APPROVER` / `FORBIDDEN`) |
| 10 | Failure path: split changed after the agent proposed (hash mismatch) | Task brief | DONE (409 `SPLIT_CHANGED`) |
| 11 | Failure path: already released | Task brief | DONE (409 `ALREADY_RELEASED`) |
| 12 | Each failure leaves the action undone and is logged, visible in the UI | Task brief | DONE: `AgentAudit` table, "Agent Pass activity" panel in the campaign desk and the bench |
| 13 | Agent Pass activity panel (what it proposed, who approved, proof status) | Task brief | DONE (`AgentPassPanel`, desk per campaign, bench across campaigns) |
| 14 | Short debrief with four items (time to first success, friction, missing capability/docs, greatest-impact improvement) | Prize page | Draft with live fields left blank: `docs/tracks/agent-pass-debrief.md`. FILL AFTER LIVE RUN. |
| 15 | Demo shows success plus denied/expired/cancelled paths where the protected action does not occur | Prize page | Script written: `docs/tracks/agent-pass-demo.md`. TODO: recorded run. |
| 16 | Proofs use fake identities, not for production | Prize page | Sandbox identities (sandbox.auth.world.org + World ID Sandbox) are fake by design. TODO: create one. `AGENT_PASS_DEMO=1` is a separate, locally derived demo wallet for the proposer, labelled "demo" everywhere. |
| 17 | Rate limits | Task brief | Documented only as the AgentKit free-trial counters; Clippo does not use x402 payment gating, so none apply. No Developer Portal rate limit is documented. |
| 18 | Prize page wording and judging criteria | Prize page | Checked live: https://ethglobal.com/events/mumbai/prizes/world . Re-read before submitting in case it changes. |

## auth.world.org step-up checklist (the official Agent Pass integration)

Status: "code" = implemented in code, covered by tests with doubles, not yet run live. Nothing here has run against sandbox.auth.world.org.

| # | Item | Status |
| --- | --- | --- |
| A1 | Register a client at auth.world.org (sandbox); get `WORLD_AUTH_CLIENT_ID` / `WORLD_AUTH_CLIENT_SECRET` | TODO, BLOCKED as of 2026-11-06: the portals accept only an enterprise Google account; a personal Gmail got 403 `account_not_eligible` |
| A2 | Register the redirect URI(s): exact HTTPS URL, `WORLD_AUTH_REDIRECT_URI` = `https://<host>/api/auth/world/callback`. Localhost over http is likely unsupported: use an HTTPS tunnel or the deployed URL | TODO |
| A3 | Create a sandbox World ID (fake identity) to complete the check | TODO |
| A4 | Start: `POST /api/campaigns/:id/stepup/start` creates an attempt bound to the split hash, with state, nonce and S256 PKCE, and returns the authorize URL (`max_age=0`, `acr` requested) | code |
| A5 | Callback: `GET /api/auth/world/callback` does the code exchange server-side with `WORLD_AUTH_TOKEN_AUTH`, validates the ID token (signature via issuer JWKS, issuer `WORLD_AUTH_ISSUER`, audience, nonce, `acr` against `WORLD_AUTH_ACR`, fresh auth time), checks that one person is not approving as both campaigner and admin on a two-party campaign (`STEPUP_SAME_HUMAN`), and records the approval. The `iss` authorization-response parameter is checked only when the provider sends it. A user's World identity (`iss`+`sub`) is enrolled on first use, and only for a user already IDKit-verified (`allowEnroll`); later step-ups must match it (`STEPUP_IDENTITY_MISMATCH`). The client response is never trusted as authorization | code |
| A6 | Status: `GET /api/stepup/:attemptId` (owner only; never returns state, nonce or code verifier) for the UI to resume after the full-page redirect | code |
| A7 | Failure codes leave the split unreleased: `STEPUP_REQUIRED` 428, `STEPUP_NOT_FOUND` 404, `STEPUP_STATE_INVALID` 400 (unknown or already-used callback state, so a replayed callback lands here), `STEPUP_DENIED` 403 (cancelled), `STEPUP_EXPIRED` 410, `STEPUP_TOKEN_INVALID` 401, `STEPUP_NONCE_MISMATCH` 401, `STEPUP_ASSURANCE` 403, `STEPUP_STALE_AUTH` 403, `STEPUP_IDENTITY_MISMATCH` 403, `STEPUP_SAME_HUMAN` 403, `STEPUP_BINDING_MISMATCH` 409, `STEPUP_CONSUMED` 409 (re-using an attempt id), `STEPUP_DEPENDENCY` 502. Ordering on the split route: for an agent proposal with no `stepUpAttemptId`, `STEPUP_REQUIRED` (428) is returned first, before any other split check. `STEPUP_BINDING_MISMATCH` from changing the split is only reachable for human-built splits: for an agent proposal a changed split already fails with `SPLIT_CHANGED` (409) at start and at approval. The callback also uses `STEPUP_BINDING_MISMATCH` when a different user is signed in than the one who started the attempt | code |
| A8 | Policy `WORLD_AUTH_POLICY` (default `agent-required`): `agent-required` = a split released from an agent proposal needs the step-up (an IDKit proof alone is refused with 428); human-built splits may use either gate. `either` = step-up or IDKit proof for any split. `required` = always the step-up. If `WORLD_AUTH_*` is not configured the split route falls back to `agent-required`, so agent proposals cannot be released until the step-up is configured. A request must carry exactly one of `worldIdProof` / `stepUpAttemptId` (400 `PROOF_REQUIRED`) | code |
| A8b | `POST /api/campaigns/:id/attest` also accepts `stepUpAttemptId` (operation `CAMPAIGN_APPROVE`, ADMIN only; bound to `campaign:<id>`), as an alternative to an IDKit proof; no policy applies there | code |
| A8c | Step-up start is rate limited (20 per hour per user and IP) when the rate limiter is active (production or `RATE_LIMIT=1`; off in dev and tests). Attempt lifetime 10 minutes; once authorized the attempt is usable for 5 minutes and is consumed exactly once in the approving transaction | code |
| A9 | Two-party release: `CAMPAIGNER_AND_ADMIN` campaigns need both approvals on the identical split (`SplitProposal`; verified by reading `web/src/app/api/campaigns/[id]/split/route.ts`). The earlier "one approval is accepted" limitation no longer applies | code |
| A10 | Recorded run: success | TODO FILL AFTER LIVE RUN |
| A11 | Recorded run: cancelled at World (protected action does not occur) | TODO FILL AFTER LIVE RUN |
| A12 | Recorded run: expired attempt | TODO FILL AFTER LIVE RUN |
| A13 | Recorded run: split changed after start / wrong identity | TODO FILL AFTER LIVE RUN |
| A14 | Exact `acr` values and claim names confirmed against the real issuer discovery document (`npm run doctor` fetches it when configured) | TODO |

## Blocker: auth.world.org access

Status as of 2026-11-06: OIDC client registration is BLOCKED. Both IdP portals (production https://auth.world.org/portal and sandbox https://sandbox.auth.world.org/portal) offer only "Continue with Google", described as an "enterprise Google account". A personal Gmail account signed in on the sandbox portal and got HTTP 403 `{"error":"account_not_eligible"}`. World must grant access or eligibility before a client can be registered. `WORLD_AUTH_*` is NOT configured, so the step-up gate is off.

Options:

- (a) Ask a World mentor/contact at the venue for portal eligibility, or for a pre-created sandbox client (client id and secret, with the redirect URI registered).
- (b) Test the flow in the OAuth Playground https://oauth-playground.toolsforhumanity.dev/ to show understanding of the flow. It cannot test our client or our redirect, so it is not evidence that Clippo's integration works.
- (c) Fallback for a demo ONLY if blocked: set `WORLD_AUTH_POLICY=either` so agent proposals can be released with the IDKit proof. State this honestly in the video and the debrief as a fallback and NOT the official Agent Pass integration. Without `WORLD_AUTH_*` and with the default `agent-required`, agent-proposal releases return 428 `STEPUP_REQUIRED`.

## Claude-backed proposer (PRD 4.4, 4.8, 6)

`POST /api/campaigns/:id/split/propose` takes an optional body `{ "mode": "llm" | "deterministic" }` (default `llm`).

| Topic | Behaviour |
| --- | --- |
| Inputs to the model | Campaign story, pool rules (net pool in micro-USDC, share basis VIEWS or APPROVED_CLIPS, optional `perCreatorCapUsdc` from the story), and per eligible creator: approved clip count, views (max snapshot), verdict confidence and flags, clips with the disclosure present, message points hit, appeals (overturned, upheld, pending), human-decided clips. |
| Untrusted text | Titles, verdict notes and transcript excerpts sit between `<<<UNTRUSTED_CLIP_DATA_<nonce>` ... `UNTRUSTED_CLIP_DATA_<nonce>>>>` lines, sanitized with the verifier's `sanitizeUntrusted`; the system prompt carries the anti-injection rules (same pattern as `lib/ai/verifier.ts`). `detectInjection` also adds an `injection_suspected` flag. |
| Output | Strict JSON `{splits:[{creator,amountMicroUsdc,reason}], rationale, confidence, flags}`, parsed with zod. |
| Enforced in code (`enforceConstraints`, never trusting the model) | integer micro-USDC; creators must be eligible (approved, live clip); no negatives, no duplicates (case-insensitive); total <= net pool; each amount <= per-creator cap when configured; confidence in 0..1; amounts must round-trip exactly to units. Zero amounts are dropped (flag). |
| Rounding dust | If the model leaves fewer micro-USDC than there are creators unallocated, the dust goes to the largest share (ties: lowest wallet) unless the cap forbids it. Larger gaps stay unallocated and are flagged `pool_partly_unallocated`. |
| Fallback | Any violation, malformed JSON, provider error or timeout (45 s) returns the deterministic split (also cap-clamped) and writes an audit row `REFUSED / AI_REJECTED` with the code (`CONSTRAINT_VIOLATION`, `MALFORMED_JSON`, `LLM_ERROR`, `LLM_TIMEOUT`) and the violations; the proposal is stored with `meta.fallback`. |
| Stored | Per-creator `reason` inside `AgentProposal.splits[]`, plus `rationale` and new `meta` (source, model, confidence, flags, fallback). Signing and attribution are unchanged: the AgentKit payload is bound to the split hash. Reasons and rationale are NOT covered by the signature (the hash binds the amounts only). |
| Not configured | Without `ANTHROPIC_API_KEY` the `llm` mode returns 503 `NOT_CONFIGURED`; there is no mock in production. `deterministic` mode works without a key and is labelled "Propose without AI" in the desk. |
| UI | `AgentPassPanel` (`ProposalReasons`) and the admin review in `AdminSplits` show source, model confidence, flags, any fallback reason and each creator's reason. |
| Guardrail | `lib/agentpass/llm-proposer.ts` is pure (LLM client injected, no db, chain, config, fetch, proofs, payout words); `guardrail.test.ts` covers it, and the existing check that agent code only writes `agentIdentity`, `agentProposal`, `agentAudit` still applies to the whole folder. Reasons are model-written text: approvers, not the model, decide. |
| Tests | `lib/agentpass/llm-proposer.test.ts` (LLM double: valid, over-pool, non-eligible, duplicates, negative/fractional, cap, malformed JSON, injection, error, timeout, dust) and DB tests in `agentpass.integration.test.ts` (stored reasons, audited fallback, 503 NOT_CONFIGURED). A live call to Claude was not run. |
