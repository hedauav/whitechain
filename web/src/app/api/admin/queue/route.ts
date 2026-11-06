import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ok, route } from "@/lib/http";
import { pendingProposals } from "@/lib/proposals";

/** Admin oversight queue: campaigns awaiting approval, clips needing human review, pending appeals, anti-fraud flags (view spikes, deleted clips). */
export const GET = route(async (req: Request) => {
  await requireUser(req, ["ADMIN"]);
  const subInclude = {
    verdict: true,
    creator: { select: { id: true, wallet: true } },
    campaign: { select: { id: true, title: true, approver: true } },
  } as const;
  const [pendingCampaigns, needsHuman, appeals, fraudFlags, splitProposals] = await Promise.all([
    db.campaign.findMany({ where: { status: "FUNDED" }, orderBy: { createdAt: "asc" } }),
    db.submission.findMany({ where: { verdict: { result: "NEEDS_HUMAN" } }, orderBy: { createdAt: "asc" }, include: subInclude }),
    db.submission.findMany({ where: { verdict: { appealStatus: "PENDING" } }, orderBy: { createdAt: "asc" }, include: subInclude }),
    db.fraudFlag.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "asc" } }),
    pendingProposals(),
  ]);
  // PRD 4.2: a borderline clip goes to the campaigner, and to the admin only when the campaigner chose "me and an admin"
  // (approver = CAMPAIGNER_AND_ADMIN). The admin still owns unreadable clips (4.7) and anything with an open fraud flag
  // (4.6 / 8) regardless of approver. Campaigner-owned borderline clips stay visible via GET /api/campaigns/[id]/submissions.
  const fraudSubmissionIds = new Set(fraudFlags.map((f) => f.submissionId));
  const flaggedSubmissions = needsHuman.filter((s) => {
    const f = s.verdict?.flags;
    const flags = Array.isArray(f) ? (f as string[]) : [];
    return s.campaign.approver === "CAMPAIGNER_AND_ADMIN" || flags.includes("unreadable") || fraudSubmissionIds.has(s.id);
  });
  return ok({ pendingCampaigns, flaggedSubmissions, appeals, fraudFlags, splitProposals });
});
