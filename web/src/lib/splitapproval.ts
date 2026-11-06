import type { AgentProposal, Campaign, User } from "@prisma/client";
import { chainMode } from "@/lib/chain/guards";
import { isValidSplitWallets, normalizeSplit, splitHash, type SplitEntry } from "@/lib/chain/split";
import { db } from "@/lib/db";
import { canManageCampaign } from "@/lib/domain";
import { ApiError } from "@/lib/http";

export interface SplitApprovalBody {
  splits: { creatorWallet: string; amount: number }[];
  agentProposalId?: string;
}

export interface PreparedSplitApproval {
  split: SplitEntry[];
  hash: string;
  role: "CAMPAIGNER" | "ADMIN";
  twoParty: boolean;
  agentProposal: AgentProposal | null;
}

/**
 * The cheap, proof-independent pre-checks of HUMAN_SPLIT approval (mirrors app/api/campaigns/[id]/split/route.ts):
 * permissions, state, pool bound, recipients, wrong approver, agent-proposal hash/expiry/revocation, already released/approved.
 * Throws ApiError and writes nothing except the lazy EXPIRED flag on a stale agent proposal (same as the split route).
 */
export async function prepareSplitApproval(user: User, c: Campaign, v: SplitApprovalBody): Promise<PreparedSplitApproval> {
  const role: "CAMPAIGNER" | "ADMIN" = user.id === c.campaignerId ? "CAMPAIGNER" : "ADMIN";
  if (!canManageCampaign(user, c)) throw new ApiError(403, "FORBIDDEN", "Not your campaign");
  if (c.payoutMode !== "HUMAN_SPLIT") throw new ApiError(409, "BAD_STATE", "Campaign is not HUMAN_SPLIT");
  if (c.status !== "APPROVED") throw new ApiError(409, "BAD_STATE", `Campaign is ${c.status}, expected APPROVED`);

  const split = normalizeSplit(v.splits);
  if (chainMode() === "chain" && !isValidSplitWallets(split)) throw new ApiError(400, "BAD_RECIPIENT", "Recipients must be valid 0x wallet addresses");
  const usablePool = c.grossFunded != null ? c.grossFunded - (c.campaignerFee ?? 0) : c.poolSize;
  const total = split.reduce((n, s) => n + s.amount, 0);
  const existing = await db.payout.aggregate({ where: { campaignId: c.id }, _sum: { amount: true } });
  if (total + (existing._sum.amount ?? 0) > usablePool + 1e-9) throw new ApiError(400, "EXCEEDS_POOL", "Splits exceed the campaign pool");
  const creators = await db.user.findMany({
    where: { wallet: { in: split.map((s) => s.creatorWallet) } },
    include: { submissions: { where: { campaignId: c.id, clipStatus: "LIVE", verdict: { result: "APPROVE" } }, select: { id: true } } },
  });
  for (const s of split) {
    const cr = creators.find((x) => x.wallet === s.creatorWallet);
    if (!cr || cr.submissions.length === 0) throw new ApiError(400, "BAD_RECIPIENT", `${s.creatorWallet} has no approved clip in this campaign`);
  }

  const twoParty = c.approver === "CAMPAIGNER_AND_ADMIN";
  const hash = splitHash(split);
  if (!twoParty && role !== "CAMPAIGNER") throw new ApiError(403, "WRONG_APPROVER", "This campaign is approved by the campaigner only");

  let agentProposal: AgentProposal | null = null;
  if (v.agentProposalId) {
    agentProposal = await db.agentProposal.findUnique({ where: { id: v.agentProposalId } });
    if (!agentProposal || agentProposal.campaignId !== c.id) throw new ApiError(404, "PROPOSAL_NOT_FOUND", "No such agent proposal for this campaign");
    const agent = await db.agentIdentity.findUnique({ where: { id: agentProposal.agentId } });
    if (!agent || agent.status !== "ACTIVE") throw new ApiError(409, "AGENT_REVOKED", "The agent that made this proposal is no longer delegated to the campaign");
    if (agentProposal.expiresAt.getTime() < Date.now()) {
      if (agentProposal.status === "PROPOSED") await db.agentProposal.update({ where: { id: agentProposal.id }, data: { status: "EXPIRED" } });
      throw new ApiError(410, "PROPOSAL_EXPIRED", "The agent's proposal expired. Ask the agent for a fresh proposal.");
    }
    if (agentProposal.splitHash !== hash) throw new ApiError(409, "SPLIT_CHANGED", "This split is not what the agent proposed (hash mismatch). Approve the agent's exact proposal.");
    if (agentProposal.status === "SUPERSEDED" || agentProposal.status === "EXPIRED") throw new ApiError(409, "PROPOSAL_EXPIRED", "That agent proposal was replaced by a newer one");
  }
  const released = await db.splitProposal.findFirst({ where: { campaignId: c.id, splitHash: hash, status: { in: ["AWAITING_CHAIN", "FINALIZED"] } } });
  if (released) throw new ApiError(409, "ALREADY_RELEASED", "This exact split was already approved by everyone and sent to the escrow");
  const active = await db.splitProposal.findFirst({ where: { campaignId: c.id, status: { in: ["PENDING", "AWAITING_CHAIN"] } }, orderBy: { createdAt: "desc" } });
  if (active && active.splitHash === hash) {
    const done = role === "CAMPAIGNER" ? active.campaignerApprovedAt : active.adminApprovedAt;
    if (done) throw new ApiError(409, "ALREADY_APPROVED", `The ${role.toLowerCase()} already approved this exact split`);
  }
  return { split, hash, role, twoParty, agentProposal };
}
