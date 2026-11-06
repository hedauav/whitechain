import { jwtVerify, type JWTVerifyGetKey, type CryptoKey, type KeyObject, type JWK } from "jose";

export type StepUpErrorCode =
  | "TOKEN_INVALID" | "NONCE_MISMATCH" | "ASSURANCE_UNSUPPORTED" | "AUTH_STALE" | "AUTH_TIME_FUTURE" | "ISSUER_MISMATCH" | "DEPENDENCY";

/** Typed step-up failure. Messages are generic: never include the client secret, code_verifier, or raw tokens. */
export class StepUpError extends Error {
  constructor(public readonly code: StepUpErrorCode, message: string) {
    super(message);
    this.name = "StepUpError";
  }
}

export type StepUpApiCode =
  | "STEPUP_REQUIRED" | "STEPUP_NOT_FOUND" | "STEPUP_STATE_INVALID" | "STEPUP_DENIED" | "STEPUP_EXPIRED" | "STEPUP_TOKEN_INVALID"
  | "STEPUP_NONCE_MISMATCH" | "STEPUP_ASSURANCE" | "STEPUP_STALE_AUTH" | "STEPUP_IDENTITY_MISMATCH" | "STEPUP_SAME_HUMAN"
  | "STEPUP_BINDING_MISMATCH" | "STEPUP_CONSUMED" | "STEPUP_DEPENDENCY";

export const STEPUP_HTTP_STATUS: Record<StepUpApiCode, number> = {
  STEPUP_REQUIRED: 428,
  STEPUP_NOT_FOUND: 404,
  STEPUP_STATE_INVALID: 400,
  STEPUP_DENIED: 403,
  STEPUP_EXPIRED: 410,
  STEPUP_TOKEN_INVALID: 401,
  STEPUP_NONCE_MISMATCH: 401,
  STEPUP_ASSURANCE: 403,
  STEPUP_STALE_AUTH: 403,
  STEPUP_IDENTITY_MISMATCH: 403,
  STEPUP_SAME_HUMAN: 403,
  STEPUP_BINDING_MISMATCH: 409,
  STEPUP_CONSUMED: 409,
  STEPUP_DEPENDENCY: 502,
};

/** Maps a StepUpError code to the public API error code. */
export const STEPUP_ERROR_TO_API: Record<StepUpErrorCode, StepUpApiCode> = {
  TOKEN_INVALID: "STEPUP_TOKEN_INVALID",
  NONCE_MISMATCH: "STEPUP_NONCE_MISMATCH",
  ASSURANCE_UNSUPPORTED: "STEPUP_ASSURANCE",
  AUTH_STALE: "STEPUP_STALE_AUTH",
  AUTH_TIME_FUTURE: "STEPUP_STALE_AUTH",
  ISSUER_MISMATCH: "STEPUP_TOKEN_INVALID",
  DEPENDENCY: "STEPUP_DEPENDENCY",
};

export interface ValidatedIdToken {
  iss: string;
  sub: string;
  acr: string;
  amr: string[];
  authTime: Date;
  jti?: string;
  exp: number;
  iat: number;
}

export interface ValidateIdTokenOptions {
  keys: JWTVerifyGetKey | CryptoKey | KeyObject | JWK | Uint8Array;
  issuer: string;
  clientId: string;
  nonce: string;
  acceptedAcrs: string[];
  attemptStartedAt: Date;
  now: Date;
  clockSkewSec?: number;
  maxAttemptLifetimeSec?: number;
}

/** Pure ID token validation (no DB, no network). RS256 only; max_age=0 freshness is relative to the attempt, not literal 0. */
export async function validateIdToken(jwt: string, o: ValidateIdTokenOptions): Promise<ValidatedIdToken> {
  const skew = o.clockSkewSec ?? 60;
  const maxLife = o.maxAttemptLifetimeSec ?? 900;
  let payload: Record<string, unknown>;
  try {
    const res = await jwtVerify(jwt, o.keys as never, {
      algorithms: ["RS256"],
      issuer: o.issuer,
      audience: o.clientId,
      clockTolerance: skew,
      currentDate: o.now,
      requiredClaims: ["exp", "iat", "sub"],
    });
    payload = res.payload as Record<string, unknown>;
  } catch (e) {
    const x = e as { code?: string; claim?: string };
    if (x.code === "ERR_JWT_CLAIM_VALIDATION_FAILED" && x.claim === "iss")
      throw new StepUpError("ISSUER_MISMATCH", "ID token issuer does not match");
    throw new StepUpError("TOKEN_INVALID", "ID token failed validation");
  }
  if (typeof payload.sub !== "string" || !payload.sub) throw new StepUpError("TOKEN_INVALID", "ID token has no subject");
  if (typeof payload.nonce !== "string" || payload.nonce !== o.nonce) throw new StepUpError("NONCE_MISMATCH", "ID token nonce does not match");
  if (typeof payload.acr !== "string" || !o.acceptedAcrs.includes(payload.acr))
    throw new StepUpError("ASSURANCE_UNSUPPORTED", "ID token assurance level is not accepted");
  const amr = payload.amr;
  if (!Array.isArray(amr) || amr.length === 0 || !amr.every((x) => typeof x === "string"))
    throw new StepUpError("ASSURANCE_UNSUPPORTED", "ID token has no authentication methods");
  const authTime = payload.auth_time;
  if (typeof authTime !== "number" || !Number.isFinite(authTime)) throw new StepUpError("TOKEN_INVALID", "ID token has no auth_time");
  const nowSec = o.now.getTime() / 1000;
  if (authTime > nowSec + skew) throw new StepUpError("AUTH_TIME_FUTURE", "auth_time is in the future");
  if (authTime < o.attemptStartedAt.getTime() / 1000 - skew || nowSec - authTime > maxLife)
    throw new StepUpError("AUTH_STALE", "Authentication is not fresh enough");
  return {
    iss: String(payload.iss),
    sub: payload.sub,
    acr: payload.acr,
    amr: amr as string[],
    authTime: new Date(authTime * 1000),
    jti: typeof payload.jti === "string" ? payload.jti : undefined,
    exp: payload.exp as number,
    iat: payload.iat as number,
  };
}
