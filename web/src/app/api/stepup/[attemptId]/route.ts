import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, route } from "@/lib/http";
import { stepUpError } from "@/lib/worldauth/stepup";

type StepCtx = { params: Promise<{ attemptId: string }> };

/** Owner-only status of a step-up attempt, so the UI can resume after the full-page redirect. Never returns state/nonce/verifier. */
export const GET = route(async (req: Request, { params }: StepCtx) => {
  const user = await requireUser(req);
  const a = await db.stepUpAttempt.findUnique({ where: { id: (await params).attemptId } });
  if (!a || a.userId !== user.id) throw stepUpError("STEPUP_NOT_FOUND", "No such step-up.");
  const res = ok({
    status: a.status,
    failureCode: a.failureCode,
    operation: a.operation,
    campaignId: a.campaignId,
    splitHash: a.splitHash,
    splits: a.splits,
    agentProposalId: a.agentProposalId,
    authorizedUntil: a.authorizedUntil,
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
});
