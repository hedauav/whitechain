import { createHash, randomBytes } from "node:crypto";

const b64url = (b: Buffer) => b.toString("base64url");

/** RFC 7636 S256 PKCE pair. The verifier is server-only. */
export function newPkce(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(32));
  return { verifier, challenge: b64url(createHash("sha256").update(verifier).digest()) };
}

/** Unguessable URL-safe token (state, nonce). */
export function randomToken(bytes = 32): string {
  return b64url(randomBytes(bytes));
}
