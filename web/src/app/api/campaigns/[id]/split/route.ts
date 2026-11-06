import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { attestationHash, normalizeSplit, onchainSplitArgs, splitHash } from "@/lib/chain/split";
import { db } from "@/lib/db";
import { canManageCampaign, getCampaign, proofSchema, type Ctx } from "@/lib/domain";
import { ApiError, ok, readJson, route } from "@/lib/http";
import { checkFreshProof, consumeProof } from "@/lib/worldid/fresh";
import { prepareSplitApproval } from "@/lib/splitapproval";
import { worldAuthConfig } from "@/lib/worldauth/config";
import { consumeStepUp, peekStepUp, stepUpError } from "@/lib/worldauth/stepup";
import { pendingProposals } from "@/lib/proposals";
import { classifyRefusal, recordAudit } from "@/lib/agentpass/audit";

const body = z.object({
  splits: z.array(z.object({ creatorWallet: z.string().min(1), amount: z.number().positive() })).min(1),
  /** Fresh World ID (Agent Pass) proof for THIS approver's approval. One use only. */
  worldIdProof: proofSchema.optional(),
  /** auth.world.org step-up attempt (World ID Agent Pass) completed for THIS approver and this exact split. Single use. */
  stepUpAttemptId: z.string().min(1).optional(),
  /** Agent Pass: the agent's proposal this approval is for. The split must hash-match it. */
  agentProposalId: z.string().optional(),
});

const SPLIT_ACTION = "clippo-approve-split";

/**
 * HUMAN_SPLIT approval. Each approver (campaigner, and admin when `approver = CAMPAIGNER_AND_ADMIN`) calls this with the
 * split and their own fresh World ID proof.
 *  - The split is canonicalised (wallet-sorted, micro-USDC) and hashed like the contract's `pendingSplit` hash.
 *  - CAMPAIGNER_AND_ADMIN: stays PENDING until BOTH approved the IDENTICAL split. A different split replaces the pending
 *    one and clears the other approval (same as the contract).
 *  - Cancelled / expired / invalid proof -> 403 WORLD_ID_DENIED; reused proof -> 409 PROOF_REUSED. Nothing is stored and the
 *    proof is not consumed, so the action is simply undone.
 *  - With a configured chain, finalisation is confirmed by the on-chain `SplitFinalized` event (status AWAITING_CHAIN
 *    until then); each approver must call `approveSplit(id, creators, amounts, attestation)` with the returned values.
 */
export const POST = route(async (req: Request, ctx: Ctx) => {
  const info: AuditCtx = {};
  try {
    return await approve(req, ctx, info);
  } catch (e) {
    // Every refusal is logged (visible in the Agent Pass activity panel) and, by construction, left the action undone.
    if (e instanceof ApiError && info.campaignId && info.audit) {
      const { outcome, proofStatus } = classifyRefusal(e);
      await recordAudit({ campaignId: info.campaignId, proposalId: info.proposalId, actorId: info.actorId, actorRole: info.role, event: "REFUSED", outcome, code: e.code, detail: `${e.message} Nothing was approved.`, splitHash: info.hash, proofStatus });
    }
    throw e;
  }
});

/** Step-up policy; an unconfigured provider falls back to the default so IDKit-only deployments keep working. */
function currentPolicy() {
  try {
    return worldAuthConfig().policy;
  } catch {
    return "agent-required" as const;
  }
}

type AuditCtx = { campaignId?: string; audit?: boolean; proposalId?: string; actorId?: string; role?: "CAMPAIGNER" | "ADMIN"; hash?: string };

async function approve(req: Request, { params }: Ctx, info: AuditCtx): Promise<Response> {
  const user = await requireUser(req, ["CAMPAIGNER", "ADMIN"]);
  const c = await getCampaign((await params).id);
  info.campaignId = c.id;
  info.actorId = user.id;
  info.role = user.id === c.campaignerId ? "CAMPAIGNER" : "ADMIN";
  info.audit = c.payoutMode === "HUMAN_SPLIT";
  if (!canManageCampaign(user, c)) throw new ApiError(403, "FORBIDDEN", "Not your campaign");
  if (c.payoutMode !== "HUMAN_SPLIT") throw new ApiError(409, "BAD_STATE", "Campaign is not HUMAN_SPLIT");
  if (c.status !== "APPROVED") throw new ApiError(409, "BAD_STATE", `Campaign is ${c.status}, expected APPROVED`);
  const v = body.parse(await readJson(req));
  info.proposalId = v.agentProposalId;
  // Exactly one proof source: an IDKit proof or a completed auth.world.org step-up attempt.
  if (!!v.worldIdProof === !!v.stepUpAttemptId) throw new ApiError(400, "PROOF_REQUIRED", "Send exactly one of worldIdProof or stepUpAttemptId");
  info.hash = splitHash(normalizeSplit(v.splits));
  // Policy: an agent's proposal is released only through the step-up (an IDKit proof alone is refused) unless policy is "either".
  const policy = currentPolicy();
  const stepUpNeeded = policy === "required" || (!!v.agentProposalId && policy !== "either");
  if (stepUpNeeded && !v.stepUpAttemptId) throw stepUpError("STEPUP_REQUIRED", "Releasing this split needs a World ID step-up. Complete it, then approve again.");

  const { split, hash, role, twoParty, agentProposal } = await prepareSplitApproval(user, c, { splits: v.splits, agentProposalId: v.agentProposalId });
  info.hash = hash;
  const bind = { userId: user.id, campaignId: c.id, splitHash: hash, role };

  let proofHash = "";
  let nullifier = "";
  let gate: "stepup" | "idkit" = "idkit";
  if (v.stepUpAttemptId) {
    gate = "stepup";
    await peekStepUp(v.stepUpAttemptId, bind); // cheap failure; the real single-use consume happens in the transaction
  } else {
    ({ proofHash, nullifier } = await checkFreshProof(v.worldIdProof!, SPLIT_ACTION, `split:${c.id}:${hash}`));
  }
  let attestation = v.stepUpAttemptId ? "" : attestationHash({ kind: "SPLIT", campaignKey: c.onchainId ?? c.id, wallet: user.wallet, nullifier, proofHash, splitHash: hash });

  const result = await db.$transaction(async (tx) => {
    if (v.stepUpAttemptId) {
      ({ proofHash, nullifier } = await consumeStepUp(tx, v.stepUpAttemptId, bind));
      attestation = attestationHash({ kind: "SPLIT", campaignKey: c.onchainId ?? c.id, wallet: user.wallet, nullifier, proofHash, splitHash: hash });
      await consumeProof(tx, user, proofHash, "stepup:split");
    } else {
      await consumeProof(tx, user, proofHash, SPLIT_ACTION);
    }
    await tx.humanAttestation.create({ data: { campaignId: c.id, userId: user.id, kind: "SPLIT", splitHash: hash, attestation, proofHash } });

    let proposal = await tx.splitProposal.findFirst({ where: { campaignId: c.id, status: { in: ["PENDING", "AWAITING_CHAIN"] } }, orderBy: { createdAt: "desc" } });
    if (proposal && proposal.splitHash !== hash) {
      await tx.splitProposal.update({ where: { id: proposal.id }, data: { status: "SUPERSEDED" } });
      proposal = null;
    }
    const now = new Date();
    const approval =
      role === "CAMPAIGNER"
        ? { campaignerApprovedAt: now, campaignerAttestation: attestation }
        : { adminApprovedAt: now, adminAttestation: attestation, adminId: user.id };
    proposal = proposal
      ? await tx.splitProposal.update({ where: { id: proposal.id }, data: approval })
      : await tx.splitProposal.create({
          data: {
            campaignId: c.id,
            splitHash: hash,
            splits: split.map((s) => ({ creatorWallet: s.creatorWallet, amount: s.amount, units: s.units.toString() })),
            ...approval,
          },
        });

    const complete = twoParty ? !!(proposal.campaignerApprovedAt && proposal.adminApprovedAt) : true;
    const payouts: Awaited<ReturnType<typeof tx.payout.create>>[] = [];
    if (complete) {
      proposal = await tx.splitProposal.update({ where: { id: proposal.id }, data: { status: "AWAITING_CHAIN" } });
      if (agentProposal) await tx.agentProposal.update({ where: { id: agentProposal.id }, data: { status: "APPROVED" } });
    }
    return { proposal, payouts };
  });
  await recordAudit({
    campaignId: c.id,
    proposalId: v.agentProposalId,
    actorId: user.id,
    actorRole: role,
    event: "APPROVED",
    outcome: "OK",
    detail: `${role === "CAMPAIGNER" ? "Campaigner" : "Admin"} approved ${agentProposal ? "the agent's proposal" : "a human-built split"} with ${gate === "stepup" ? "a step-up via auth.world.org (acr orb, fresh)" : "a fresh World ID proof (valid, single use)"}. ${result.proposal.status === "AWAITING_CHAIN" ? "All approvals are in; waiting for the escrow to confirm." : "Waiting for the other approver."}`,
    splitHash: hash,
    proofStatus: "VALID",
  });

  const p = result.proposal;
  return ok(
    {
      payouts: result.payouts,
      proposal: {
        id: p.id,
        status: p.status,
        splitHash: p.splitHash,
        twoParty,
        approvals: { campaigner: !!p.campaignerApprovedAt, admin: !!p.adminApprovedAt },
        awaiting: [
          ...(twoParty && !p.campaignerApprovedAt ? ["campaigner"] : []),
          ...(twoParty && !p.adminApprovedAt ? ["admin"] : []),
          ...(p.status === "AWAITING_CHAIN" ? ["chain"] : []),
        ],
      },
      attestation,
      gate,
      onchain: c.onchainId
        ? { functionName: "approveSplit", args: { id: c.onchainId, ...onchainSplitArgs(split), attestation } }
        : null,
    },
    201,
  );
}

/** Pending split proposals of this campaign: status, approvers so far, who is awaited (campaigner/admin/chain), split hash. */
export const GET = route(async (req: Request, { params }: Ctx) => {
  const user = await requireUser(req, ["CAMPAIGNER", "ADMIN"]);
  const c = await getCampaign((await params).id);
  if (!canManageCampaign(user, c)) throw new ApiError(403, "FORBIDDEN", "Not your campaign");
  return ok({ proposals: await pendingProposals({ campaignId: c.id }) });
});
