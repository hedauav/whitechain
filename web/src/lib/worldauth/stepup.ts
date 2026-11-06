import { createHash } from "node:crypto";
import { Prisma, type Campaign, type StepUpAttempt, type User } from "@prisma/client";
import { db } from "../db";
import { ApiError } from "../http";
import { classifyRefusal, recordAudit } from "../agentpass/audit";
import { buildAuthorizeUrl, getWorldAuth } from "./client";
import { worldAuthConfig } from "./config";
import { STEPUP_ERROR_TO_API, STEPUP_HTTP_STATUS, StepUpError, validateIdToken, type StepUpApiCode } from "./idtoken";
import { newPkce, randomToken } from "./pkce";

export type StepUpOperation = "SPLIT_RELEASE" | "CAMPAIGN_APPROVE";
export type StepUpRole = "CAMPAIGNER" | "ADMIN";

export const ATTEMPT_TTL_MS = 10 * 60_000;
export const AUTHORIZED_TTL_MS = 5 * 60_000;
export const DEFAULT_RETURN_PATH = "/desk";

/** ApiError with the public step-up code and its fixed HTTP status. Messages are generic (no secrets, tokens or verifiers). */
export const stepUpError = (code: StepUpApiCode, message: string) => new ApiError(STEPUP_HTTP_STATUS[code], code, message);

/** Same-origin relative path only: starts with "/", not "//" or "/\", no scheme, no control characters. */
export function safeReturnPath(p: string | undefined | null): string {
  if (typeof p !== "string" || !p.startsWith("/") || p.startsWith("//") || p.startsWith("/\\") || /[\u0000-\u001f\\]/.test(p) || p.length > 500) return DEFAULT_RETURN_PATH;
  try {
    const u = new URL(p, "http://x.invalid");
    if (u.origin !== "http://x.invalid") return DEFAULT_RETURN_PATH;
  } catch {
    return DEFAULT_RETURN_PATH;
  }
  return p;
}

/** Converts anything thrown by the OIDC client into a step-up API code. Unknown errors fail closed as a dependency failure. */
function toApiCode(e: unknown): StepUpApiCode {
  if (e instanceof StepUpError) return STEPUP_ERROR_TO_API[e.code];
  return "STEPUP_DEPENDENCY";
}

export interface StartStepUpInput {
  operation: StepUpOperation;
  splits: unknown;
  agentProposalId?: string;
  splitHash: string;
  role: StepUpRole;
}

export async function startStepUp(user: User, campaign: Campaign, input: StartStepUpInput, returnPath: string | undefined) {
  const cfg = worldAuthConfig(); // 503 NOT_CONFIGURED when WORLD_AUTH_* is missing
  let discovery;
  try {
    discovery = await getWorldAuth().discovery();
  } catch (e) {
    if (e instanceof ApiError) throw e;
    throw stepUpError(toApiCode(e), "World ID step-up is temporarily unavailable");
  }
  const state = randomToken();
  const nonce = randomToken();
  const pkce = newPkce();
  const expiresAt = new Date(Date.now() + ATTEMPT_TTL_MS);
  const attempt = await db.stepUpAttempt.create({
    data: {
      state,
      nonce,
      codeVerifier: pkce.verifier,
      userId: user.id,
      campaignId: campaign.id,
      operation: input.operation,
      actorRole: input.role,
      splitHash: input.splitHash,
      splits: (input.splits ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      agentProposalId: input.agentProposalId ?? null,
      boundIss: user.worldAuthIss,
      boundSub: user.worldAuthSub,
      allowEnroll: user.verified && !user.worldAuthSub,
      requiredAcr: cfg.acceptedAcrs,
      maxAge: 0,
      returnPath: safeReturnPath(returnPath),
      expiresAt,
    },
  });
  const authorizeUrl = buildAuthorizeUrl({ discovery, clientId: cfg.clientId, redirectUri: cfg.redirectUri, state, nonce, challenge: pkce.challenge, acr: cfg.acr });
  await recordAudit({
    campaignId: campaign.id,
    proposalId: input.agentProposalId,
    actorId: user.id,
    actorRole: input.role,
    event: "STEPUP_REQUESTED",
    outcome: "OK",
    detail: `${input.role === "CAMPAIGNER" ? "Campaigner" : "Admin"} started a World ID step-up for ${input.operation}.`,
    splitHash: input.splitHash,
    proofStatus: "NONE",
  });
  return { attemptId: attempt.id, authorizeUrl, expiresAt };
}

export interface CallbackParams {
  code?: string | null;
  state?: string | null;
  iss?: string | null;
  error?: string | null;
  error_description?: string | null;
}

export interface CallbackResult {
  attemptId: string | null;
  returnPath: string;
  status: "AUTHORIZED" | "DENIED" | "EXPIRED" | "FAILED";
  code: StepUpApiCode | null;
  httpStatus: number;
  message: string;
}

const FAIL_STATUS: Partial<Record<StepUpApiCode, "DENIED" | "EXPIRED">> = {
  STEPUP_DENIED: "DENIED",
  STEPUP_EXPIRED: "EXPIRED",
  STEPUP_BINDING_MISMATCH: "DENIED",
  STEPUP_IDENTITY_MISMATCH: "DENIED",
  STEPUP_SAME_HUMAN: "DENIED",
  STEPUP_ASSURANCE: "DENIED",
};

async function failAttempt(a: StepUpAttempt, code: StepUpApiCode, message: string): Promise<CallbackResult> {
  const status = FAIL_STATUS[code] ?? "FAILED";
  try {
    await db.stepUpAttempt.update({ where: { id: a.id }, data: { status, failureCode: code, failureDetail: message.slice(0, 300) } });
  } catch (e) {
    console.error("step-up attempt update failed", e instanceof Error ? e.name : "error");
  }
  const { outcome, proofStatus } = classifyRefusal(new ApiError(STEPUP_HTTP_STATUS[code], code, message));
  await recordAudit({
    campaignId: a.campaignId,
    proposalId: a.agentProposalId,
    actorId: a.userId,
    actorRole: a.actorRole as StepUpRole,
    event: "REFUSED",
    outcome,
    code,
    detail: `World ID step-up refused: ${message} Nothing was approved.`,
    splitHash: a.splitHash,
    proofStatus,
  });
  return { attemptId: a.id, returnPath: a.returnPath, status, code, httpStatus: STEPUP_HTTP_STATUS[code], message };
}

/**
 * Handles the OIDC redirect back from auth.world.org. Never throws for protocol/identity failures: it records the failure
 * (attempt status + failureCode + audit row) and returns a result the route turns into a redirect or JSON.
 */
export async function completeCallback(p: CallbackParams, sessionUserId: string | null): Promise<CallbackResult> {
  const unknown: CallbackResult = { attemptId: null, returnPath: DEFAULT_RETURN_PATH, status: "FAILED", code: "STEPUP_STATE_INVALID", httpStatus: STEPUP_HTTP_STATUS.STEPUP_STATE_INVALID, message: "Unknown or already used step-up state" };
  if (!p.state) return unknown;
  // (1) Single-use claim: replay, unknown, or concurrent callbacks all lose here.
  const claim = await db.stepUpAttempt.updateMany({ where: { state: p.state, status: "PENDING" }, data: { status: "PROCESSING" } });
  if (claim.count !== 1) return unknown;
  const a = await db.stepUpAttempt.findUniqueOrThrow({ where: { state: p.state } });

  // (2) Session binding.
  if (!sessionUserId || sessionUserId !== a.userId) return failAttempt(a, "STEPUP_BINDING_MISMATCH", "This step-up belongs to a different signed-in user.");
  // (3) Expiry.
  if (Date.now() > a.expiresAt.getTime()) return failAttempt(a, "STEPUP_EXPIRED", "The step-up expired. Start again.");
  // (4) Provider error: never redeem the code.
  if (p.error) {
    if (p.error === "access_denied") return failAttempt(a, "STEPUP_DENIED", "The World ID check was cancelled.");
    return failAttempt(a, "STEPUP_TOKEN_INVALID", "The World ID provider reported an error.");
  }
  if (!p.code) return failAttempt(a, "STEPUP_TOKEN_INVALID", "The World ID provider returned no authorization code.");

  let validated;
  try {
    const cfg = worldAuthConfig();
    const wa = getWorldAuth();
    const discovery = await wa.discovery();
    // (5) RFC 9207 issuer identification: when the provider sends `iss` it must be the one we discovered.
    if (p.iss != null && p.iss !== discovery.issuer) return failAttempt(a, "STEPUP_TOKEN_INVALID", "Authorization response issuer does not match.");
    // (6) Redeem exactly once, then validate.
    await db.stepUpAttempt.update({ where: { id: a.id }, data: { codeRedeemedAt: new Date() } });
    const { id_token } = await wa.exchangeCode({ code: p.code, codeVerifier: a.codeVerifier, redirectUri: cfg.redirectUri });
    validated = await validateIdToken(id_token, {
      keys: await wa.getKeys(),
      issuer: discovery.issuer,
      clientId: cfg.clientId,
      nonce: a.nonce,
      acceptedAcrs: a.requiredAcr as string[],
      attemptStartedAt: a.createdAt,
      now: new Date(),
    });
  } catch (e) {
    const code = toApiCode(e);
    const generic = e instanceof StepUpError ? e.message : "World ID step-up is temporarily unavailable.";
    return failAttempt(a, code, generic);
  }

  // (7) Identity binding.
  const bound = a.boundIss != null && a.boundSub != null;
  if (bound && (a.boundIss !== validated.iss || a.boundSub !== validated.sub)) {
    return failAttempt(a, "STEPUP_IDENTITY_MISMATCH", "This World ID is not the one linked to your account.");
  }
  const campaign = await db.campaign.findUnique({ where: { id: a.campaignId } });
  if (campaign?.approver === "CAMPAIGNER_AND_ADMIN") {
    const other = await db.stepUpAttempt.findFirst({
      where: { campaignId: a.campaignId, operation: a.operation, actorRole: { not: a.actorRole }, iss: validated.iss, sub: validated.sub, status: { in: ["AUTHORIZED", "CONSUMED"] } },
      select: { id: true },
    });
    if (other) return failAttempt(a, "STEPUP_SAME_HUMAN", "The same person cannot approve for both the campaigner and the admin.");
  }
  const user = await db.user.findUnique({ where: { id: a.userId } });
  if (!user) return failAttempt(a, "STEPUP_BINDING_MISMATCH", "User not found.");
  const enroll = !bound;
  if (enroll) {
    if (!a.allowEnroll || !user.verified) return failAttempt(a, "STEPUP_IDENTITY_MISMATCH", "Verify with World ID before linking a World identity.");
    const holder = await db.user.findFirst({ where: { worldAuthIss: validated.iss, worldAuthSub: validated.sub, id: { not: a.userId } }, select: { id: true } });
    if (holder) return failAttempt(a, "STEPUP_IDENTITY_MISMATCH", "That World identity is already linked to another account.");
  }

  // (8) Authorize (+ enroll) atomically.
  const now = new Date();
  try {
    await db.$transaction(async (tx) => {
      if (enroll) {
        const u = await tx.user.updateMany({ where: { id: a.userId, worldAuthSub: null }, data: { worldAuthIss: validated.iss, worldAuthSub: validated.sub } });
        if (u.count !== 1) throw stepUpError("STEPUP_IDENTITY_MISMATCH", "This account is already linked to a World identity.");
      }
      const r = await tx.stepUpAttempt.updateMany({
        where: { id: a.id, status: "PROCESSING" },
        data: {
          status: "AUTHORIZED",
          iss: validated.iss,
          sub: validated.sub,
          acr: validated.acr,
          amr: validated.amr,
          authTime: validated.authTime,
          tokenJti: validated.jti ?? null,
          authorizedAt: now,
          authorizedUntil: new Date(now.getTime() + AUTHORIZED_TTL_MS),
        },
      });
      if (r.count !== 1) throw stepUpError("STEPUP_STATE_INVALID", "Step-up is no longer pending.");
    });
  } catch (e) {
    if (e instanceof ApiError) return failAttempt(a, e.code as StepUpApiCode, e.message);
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return failAttempt(a, "STEPUP_IDENTITY_MISMATCH", "That World identity is already linked to another account.");
    console.error("step-up authorize failed", e instanceof Error ? e.name : "error");
    return failAttempt(a, "STEPUP_DEPENDENCY", "Could not save the step-up result.");
  }
  return { attemptId: a.id, returnPath: a.returnPath, status: "AUTHORIZED", code: null, httpStatus: 200, message: "Step-up authorized" };
}

export interface StepUpExpectations {
  userId: string;
  campaignId: string;
  splitHash: string;
  role: StepUpRole;
}

type Reader = Pick<Prisma.TransactionClient, "stepUpAttempt">;

async function validateAttempt(client: Reader, attemptId: string, x: StepUpExpectations): Promise<StepUpAttempt> {
  const a = await client.stepUpAttempt.findUnique({ where: { id: attemptId } });
  if (!a || a.userId !== x.userId) throw stepUpError("STEPUP_NOT_FOUND", "No such step-up.");
  if (a.status === "CONSUMED") throw stepUpError("STEPUP_CONSUMED", "This World ID step-up was already used.");
  if (a.status !== "AUTHORIZED" || !a.authorizedUntil) throw stepUpError("STEPUP_REQUIRED", "Complete the World ID step-up first.");
  if (a.authorizedUntil.getTime() < Date.now()) throw stepUpError("STEPUP_EXPIRED", "The World ID step-up expired. Start again.");
  if (a.campaignId !== x.campaignId || a.splitHash !== x.splitHash || a.actorRole !== x.role) {
    throw stepUpError("STEPUP_BINDING_MISMATCH", "This step-up was for a different action. Nothing was approved.");
  }
  if (!a.iss || !a.sub) throw stepUpError("STEPUP_REQUIRED", "Complete the World ID step-up first.");
  return a;
}

/** Validates an authorized step-up WITHOUT consuming it (cheap pre-transaction failure). */
export async function peekStepUp(attemptId: string, x: StepUpExpectations): Promise<StepUpAttempt> {
  return validateAttempt(db, attemptId, x);
}

/** Atomically consumes the step-up inside the caller's transaction. Returns the identity to feed attestation + consumeProof. */
export async function consumeStepUp(tx: Prisma.TransactionClient, attemptId: string, x: StepUpExpectations): Promise<{ nullifier: string; proofHash: string }> {
  const a = await validateAttempt(tx, attemptId, x);
  const r = await tx.stepUpAttempt.updateMany({ where: { id: a.id, status: "AUTHORIZED" }, data: { status: "CONSUMED", consumedAt: new Date() } });
  if (r.count !== 1) throw stepUpError("STEPUP_CONSUMED", "This World ID step-up was already used.");
  return {
    nullifier: `oidc:${a.iss}:${a.sub}`,
    proofHash: createHash("sha256").update(`stepup:${a.id}:${a.tokenJti ?? a.id}`).digest("hex"),
  };
}
