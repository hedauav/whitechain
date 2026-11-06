import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { newPkce, randomToken } from "./pkce";

describe("pkce", () => {
  it("challenge is base64url(SHA-256(verifier))", () => {
    const { verifier, challenge } = newPkce();
    expect(challenge).toBe(createHash("sha256").update(verifier).digest("base64url"));
    expect(challenge).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
  it("matches the RFC 7636 appendix B vector construction", () => {
    const v = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    expect(createHash("sha256").update(v).digest("base64url")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
  it("verifier length is valid and values are random", () => {
    const a = newPkce();
    const b = newPkce();
    expect(a.verifier.length).toBeGreaterThanOrEqual(43);
    expect(a.verifier.length).toBeLessThanOrEqual(128);
    expect(a.verifier).not.toBe(b.verifier);
    expect(randomToken()).not.toBe(randomToken());
    expect(randomToken().length).toBe(43);
    expect(randomToken(16).length).toBe(22);
  });
});
