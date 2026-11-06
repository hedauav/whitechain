/* Pure mapping from IDKit error codes to a user-facing failure kind. Kept free of React/IDKit runtime imports so it
   runs under vitest's node environment. Codes are plain strings matching IDKitErrorCodes values. */
export type SheetFail = { kind: "cancelled" | "expired" | "repeated" | "failed" | "unavailable" | "unconfigured"; message: string };

export const CREDENTIAL_UNAVAILABLE_MESSAGE =
  "Your World ID has no Proof of Human credential. You can browse as a viewer but cannot join campaigns as a creator.";
export const CREDENTIAL_HELP_URL = "https://docs.world.org/world-id/idkit/credentials";

/** Keys are IDKitErrorCodes string values (verified against @worldcoin/idkit-core 4.6 in errors.test.ts). */
export const FAIL_OF: Record<string, SheetFail> = {
  verification_rejected: { kind: "cancelled", message: "You declined the request in World App." },
  user_rejected: { kind: "cancelled", message: "You declined the request in World App." },
  cancelled: { kind: "cancelled", message: "You cancelled the check." },
  max_verifications_reached: { kind: "repeated", message: "World ID says this check was already used the maximum number of times for this action." },
  nullifier_replayed: { kind: "repeated", message: "World ID says this proof was already used." },
  connection_failed: { kind: "expired", message: "The connection to World App dropped before the check finished." },
  timeout: { kind: "expired", message: "The check timed out before it finished." },
  rp_signature_expired: { kind: "expired", message: "The check request expired before it was answered." },
  credential_unavailable: { kind: "unavailable", message: CREDENTIAL_UNAVAILABLE_MESSAGE },
};

export function failOf(code: string): SheetFail {
  return FAIL_OF[code] ?? { kind: "failed", message: `World ID could not complete the check (${code}).` };
}
