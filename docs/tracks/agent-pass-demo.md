# World ID Agent Pass: demo clicks

STATUS: scripted, not yet recorded. The flow below is implemented in code and has NOT been run live. Say so in the video for anything not shown running.

Identities: sandbox identities (sandbox.auth.world.org, World ID Sandbox) are FAKE and not for production. Say this on camera.

Setup (TODO): `WORLD_AUTH_CLIENT_ID`, `WORLD_AUTH_CLIENT_SECRET`, `WORLD_AUTH_ISSUER` (sandbox), `WORLD_AUTH_REDIRECT_URI` (exact HTTPS URL, e.g. a tunnel or the deployed host; localhost http is likely unsupported), `WORLD_AUTH_TOKEN_AUTH`, `WORLD_AUTH_ACR`, `WORLD_AUTH_POLICY=agent-required` (also the fallback when `WORLD_AUTH_*` is unset, in which case agent proposals cannot be released). Each approver must first be IDKit-verified (sign-up): the first step-up enrolls their World identity only for a verified user. Run `npm run doctor`. Proposer: `AGENT_PASS_DEMO=1` (labelled demo) or a registered `AGENT_PASS_PRIVATE_KEY`. An LLM key for "Ask Claude to propose".

Prepare: a LIVE human-split campaign (approver "me and admin" for two-party), at least one approved clip. Desk as campaigner; bench as admin in a second window.

## Happy path

1. Desk: **Ask Claude to propose**. The agent proposes; a banner says nothing is payable yet. Show **Agent Pass activity** (proposal hash, creators, rationale).
2. Click **Approve with World ID** (step-up). The browser redirects to the sandbox IdP.
3. Complete the check with the sandbox identity. You return to Clippo: "approved". The panel shows the step-up with the `acr` and "fresh" (auth time within the window).
4. Two-party: the admin does the same from the bench on the identical split. Status: both approved, awaiting chain.
5. Show backend validation: the callback did the code exchange server-side; no secret reached the browser.

## Failure paths (the protected action does NOT occur; show the proof each time)

| What you do | Expected | Code |
| --- | --- | --- |
| Cancel at World | Back in Clippo: "not approved". Split not released | `STEPUP_DENIED` 403 |
| Let the attempt expire, then return | Split not released; start again | `STEPUP_EXPIRED` 410 |
| Human-built split: change the split after starting, then approve | Approval refused | `STEPUP_BINDING_MISMATCH` 409 |
| Agent proposal: edit the amounts | Refused before any step-up | `SPLIT_CHANGED` 409 (wins over the binding check) |
| Complete with a different identity than the approver's | Refused | `STEPUP_IDENTITY_MISMATCH` 403 |
| Replay the callback URL | Refused, nothing changes | `STEPUP_STATE_INVALID` 400 (state is single use) |
| Re-use an already used attempt on approve | Refused | `STEPUP_CONSUMED` 409 |
| Low assurance / stale auth | Refused | `STEPUP_ASSURANCE` / `STEPUP_STALE_AUTH` 403 |
| Agent proposal released with no step-up (direct API call, IDKit proof only) | Refused before any other split check | `STEPUP_REQUIRED` 428 |

Earlier-flow failures (agent proposal expired, wrong approver, already released, AI proposal rejected) are listed in `WORLD_AGENT_PASS.md`.

After each failure show: the activity panel row, `GET /api/stepup/:attemptId` status, `GET /api/campaigns/:id/split` has no new approval, `GET /api/creator/earnings` shows no new payout, no on-chain call.

## Guardrail talking point

Show `src/lib/agents/guardrail.test.ts` and `src/lib/agentpass/guardrail.test.ts`: agent code can only write agent tables; releasing needs a validated human step-up; payouts only come from the escrow's on-chain event. The proposer's identity is AgentKit/AgentBook; the prize integration is auth.world.org.
