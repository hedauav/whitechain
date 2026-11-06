import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { canManageCampaign, getCampaign, type Ctx } from "@/lib/domain";
import { ApiError, ok, readJson, route } from "@/lib/http";
import { rateLimit } from "@/lib/ratelimit";
import { classifyRefusal, recordAudit } from "@/lib/agentpass/audit";
import { prepareSplitApproval } from "@/lib/splitapproval";
import { startStepUp } from "@/lib/worldauth/stepup";

const body = z.object({
  operation: z.enum(["SPLIT_RELEASE", "CAMPAIGN_APPROVE"]),
  splits: z.array(z.object({ creatorWallet: z.string().min(1), amount: z.number().positive() })).optional(),
  agentProposalId: z.string().optional(),
  returnPath: z.string().max(500).optional(),
});

/** Starts a World ID (auth.world.org) step-up for one approver and one exact action. Returns the URL to redirect the browser to. */
export const POST = route(async (req: Request, { params }: Ctx) => {
  const user = await requireUser(req, ["CAMPAIGNER", "ADMIN"]);
  await rateLimit(req, "worldauth/start", 20, 3600, user.id);
  const c = await getCampaign((await params).id);
  if (!canManageCampaign(user, c)) throw new ApiError(403, "FORBIDDEN", "Not your campaign");
  const v = body.parse(await readJson(req));
  const role: "CAMPAIGNER" | "ADMIN" = user.id === c.campaignerId ? "CAMPAIGNER" : "ADMIN";
  let hash = `campaign:${c.id}`;
  try {
    if (v.operation === "SPLIT_RELEASE") {
      if (!v.splits) throw new ApiError(400, "BAD_REQUEST", "splits are required for SPLIT_RELEASE");
      const prep = await prepareSplitApproval(user, c, { splits: v.splits, agentProposalId: v.agentProposalId });
      hash = prep.hash;
    } else if (role !== "ADMIN") {
      throw new ApiError(403, "WRONG_APPROVER", "Only an admin can approve a campaign");
    }
  } catch (e) {
    if (e instanceof ApiError && c.payoutMode === "HUMAN_SPLIT") {
      const { outcome, proofStatus } = classifyRefusal(e);
      await recordAudit({ campaignId: c.id, proposalId: v.agentProposalId, actorId: user.id, actorRole: role, event: "REFUSED", outcome, code: e.code, detail: `${e.message} Nothing was approved.`, splitHash: hash, proofStatus });
    }
    throw e;
  }
  const started = await startStepUp(user, c, { operation: v.operation, splits: v.splits, agentProposalId: v.agentProposalId, splitHash: hash, role }, v.returnPath);
  return ok(started, 201);
});
