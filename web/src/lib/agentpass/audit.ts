import { db } from "../db";
import type { ApiError } from "../http";

export type AuditOutcome =
  | "OK" | "CANCELLED" | "EXPIRED_PROOF" | "PROPOSAL_EXPIRED" | "REPLAYED" | "WRONG_APPROVER" | "SPLIT_CHANGED"
  | "ALREADY_RELEASED" | "ALREADY_APPROVED" | "PROOF_INVALID" | "AGENT_UNVERIFIED" | "AI_REJECTED" | "REFUSED"
  | "STEPUP_DENIED" | "STEPUP_EXPIRED" | "STEPUP_INVALID" | "STEPUP_ASSURANCE" | "STEPUP_STALE" | "STEPUP_IDENTITY" | "STEPUP_BINDING" | "STEPUP_REPLAYED" | "STEPUP_DEPENDENCY";
export type ProofStatus = "VALID" | "NONE" | "CANCELLED" | "EXPIRED" | "REPLAYED" | "INVALID"
  | "STEPUP_DENIED" | "STEPUP_EXPIRED" | "STEPUP_INVALID" | "STEPUP_ASSURANCE" | "STEPUP_STALE" | "STEPUP_IDENTITY" | "STEPUP_BINDING" | "STEPUP_REPLAYED" | "STEPUP_DEPENDENCY";

export interface AuditInput {
  campaignId: string;
  proposalId?: string | null;
  actorId?: string | null;
  actorRole?: "AGENT" | "CAMPAIGNER" | "ADMIN" | null;
  event: "DELEGATED" | "PROPOSED" | "APPROVED" | "REFUSED" | "STEPUP_REQUESTED";
  outcome: AuditOutcome;
  code?: string | null;
  detail: string;
  splitHash?: string | null;
  proofStatus?: ProofStatus | null;
  source?: "server" | "client";
}

/** Append one audit row. Never throws: an audit failure must not turn a refusal into a 500 or a success into a failure. */
export async function recordAudit(a: AuditInput): Promise<void> {
  try {
    await db.agentAudit.create({
      data: {
        campaignId: a.campaignId,
        proposalId: a.proposalId ?? null,
        actorId: a.actorId ?? null,
        actorRole: a.actorRole ?? null,
        event: a.event,
        outcome: a.outcome,
        code: a.code ?? null,
        detail: a.detail.slice(0, 500),
        splitHash: a.splitHash ?? null,
        proofStatus: a.proofStatus ?? null,
        source: a.source ?? "server",
      },
    });
  } catch (e) {
    console.error("agent audit write failed", e);
  }
}

/** Map a refused approval to an audit outcome + proof status. A refusal always means the action stayed undone. */
export function classifyRefusal(e: ApiError): { outcome: AuditOutcome; proofStatus: ProofStatus } {
  switch (e.code) {
    case "PROOF_REUSED": return { outcome: "REPLAYED", proofStatus: "REPLAYED" };
    case "WORLD_ID_DENIED": {
      if (/cancel|declin|reject/i.test(e.message)) return { outcome: "CANCELLED", proofStatus: "CANCELLED" };
      if (/expire|timed? ?out/i.test(e.message)) return { outcome: "EXPIRED_PROOF", proofStatus: "EXPIRED" };
      return { outcome: "PROOF_INVALID", proofStatus: "INVALID" };
    }
    case "PROPOSAL_EXPIRED": return { outcome: "PROPOSAL_EXPIRED", proofStatus: "NONE" };
    case "SPLIT_CHANGED": return { outcome: "SPLIT_CHANGED", proofStatus: "NONE" };
    case "ALREADY_RELEASED": return { outcome: "ALREADY_RELEASED", proofStatus: "NONE" };
    case "ALREADY_APPROVED": return { outcome: "ALREADY_APPROVED", proofStatus: "NONE" };
    case "WRONG_APPROVER":
    case "FORBIDDEN": return { outcome: "WRONG_APPROVER", proofStatus: "NONE" };
    case "AGENT_UNVERIFIED":
    case "AGENT_REVOKED": return { outcome: "AGENT_UNVERIFIED", proofStatus: "NONE" };
    case "STEPUP_DENIED": return { outcome: "STEPUP_DENIED", proofStatus: "STEPUP_DENIED" };
    case "STEPUP_EXPIRED": return { outcome: "STEPUP_EXPIRED", proofStatus: "STEPUP_EXPIRED" };
    case "STEPUP_TOKEN_INVALID":
    case "STEPUP_NONCE_MISMATCH":
    case "STEPUP_STATE_INVALID": return { outcome: "STEPUP_INVALID", proofStatus: "STEPUP_INVALID" };
    case "STEPUP_ASSURANCE": return { outcome: "STEPUP_ASSURANCE", proofStatus: "STEPUP_ASSURANCE" };
    case "STEPUP_STALE_AUTH": return { outcome: "STEPUP_STALE", proofStatus: "STEPUP_STALE" };
    case "STEPUP_IDENTITY_MISMATCH":
    case "STEPUP_SAME_HUMAN": return { outcome: "STEPUP_IDENTITY", proofStatus: "STEPUP_IDENTITY" };
    case "STEPUP_BINDING_MISMATCH": return { outcome: "STEPUP_BINDING", proofStatus: "STEPUP_BINDING" };
    case "STEPUP_CONSUMED": return { outcome: "STEPUP_REPLAYED", proofStatus: "STEPUP_REPLAYED" };
    case "STEPUP_DEPENDENCY": return { outcome: "STEPUP_DEPENDENCY", proofStatus: "STEPUP_DEPENDENCY" };
    default: return { outcome: "REFUSED", proofStatus: "NONE" };
  }
}

type AuditRow = { id: string; campaignId: string; proposalId: string | null; actorRole: string | null; event: string; outcome: string; code: string | null; detail: string; splitHash: string | null; proofStatus: string | null; source: string; createdAt: Date };
export const auditView = (r: AuditRow) => ({ ...r, createdAt: r.createdAt.toISOString() });
