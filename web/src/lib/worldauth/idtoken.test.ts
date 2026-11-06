import { beforeAll, describe, expect, it } from "vitest";
import { SignJWT, generateKeyPair, type CryptoKey } from "jose";
import { StepUpError, validateIdToken, type StepUpErrorCode } from "./idtoken";

const ISS = "https://sandbox.auth.world.org";
const CLIENT = "app_client";
const NONCE = "nonce-123";
const ACR = "https://world.org/oidc/acr/orb";
const SECRET = "super-secret-client-secret";
const NOW = new Date("2026-11-06T12:00:00Z");
const nowSec = Math.floor(NOW.getTime() / 1000);
const STARTED = new Date(NOW.getTime() - 60_000);

let priv: CryptoKey;
let pub: CryptoKey;
let otherPriv: CryptoKey;

beforeAll(async () => {
  ({ privateKey: priv, publicKey: pub } = await generateKeyPair("RS256"));
  ({ privateKey: otherPriv } = await generateKeyPair("RS256"));
});

type Claims = Record<string, unknown>;
const base = (): Claims => ({ nonce: NONCE, acr: ACR, amr: ["orb"], auth_time: nowSec - 30, sub: "pairwise-sub" });

async function sign(over: Claims = {}, o: { key?: CryptoKey; iss?: string; aud?: string; exp?: number | string } = {}) {
  const claims = { ...base(), ...over };
  for (const k of Object.keys(claims)) if (claims[k] === undefined) delete claims[k];
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256" })
    .setIssuer(o.iss ?? ISS)
    .setAudience(o.aud ?? CLIENT)
    .setIssuedAt(nowSec - 30)
    .setExpirationTime(o.exp ?? nowSec + 300)
    .sign(o.key ?? priv);
}

const opts = (over: Partial<Parameters<typeof validateIdToken>[1]> = {}) => ({
  keys: pub, issuer: ISS, clientId: CLIENT, nonce: NONCE, acceptedAcrs: [ACR], attemptStartedAt: STARTED, now: NOW, ...over,
});

async function code(p: Promise<unknown>): Promise<StepUpErrorCode> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(StepUpError);
    return (e as StepUpError).code;
  }
  throw new Error("expected rejection");
}

describe("validateIdToken", () => {
  it("accepts a valid token", async () => {
    const r = await validateIdToken(await sign(), opts());
    expect(r.sub).toBe("pairwise-sub");
    expect(r.iss).toBe(ISS);
    expect(r.amr).toEqual(["orb"]);
    expect(r.authTime.getTime()).toBe((nowSec - 30) * 1000);
  });
  it("rejects wrong issuer", async () => {
    expect(await code(validateIdToken(await sign({}, { iss: "https://evil.example" }), opts()))).toBe("ISSUER_MISMATCH");
  });
  it("rejects wrong audience", async () => {
    expect(await code(validateIdToken(await sign({}, { aud: "other" }), opts()))).toBe("TOKEN_INVALID");
  });
  it("rejects expired token", async () => {
    expect(await code(validateIdToken(await sign({}, { exp: nowSec - 600 }), opts()))).toBe("TOKEN_INVALID");
  });
  it("rejects a token signed by a different key", async () => {
    expect(await code(validateIdToken(await sign({}, { key: otherPriv }), opts()))).toBe("TOKEN_INVALID");
  });
  it("refuses alg none", async () => {
    const h = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
    const p = Buffer.from(JSON.stringify({ ...base(), iss: ISS, aud: CLIENT, iat: nowSec, exp: nowSec + 300 })).toString("base64url");
    expect(await code(validateIdToken(`${h}.${p}.`, opts()))).toBe("TOKEN_INVALID");
  });
  it("refuses HS256", async () => {
    const t = await new SignJWT(base()).setProtectedHeader({ alg: "HS256" }).setIssuer(ISS).setAudience(CLIENT).setIssuedAt(nowSec).setExpirationTime(nowSec + 300).sign(new TextEncoder().encode(SECRET));
    expect(await code(validateIdToken(t, opts({ keys: new TextEncoder().encode(SECRET) })))).toBe("TOKEN_INVALID");
  });
  it("rejects nonce mismatch and missing nonce", async () => {
    expect(await code(validateIdToken(await sign({ nonce: "nope" }), opts()))).toBe("NONCE_MISMATCH");
    expect(await code(validateIdToken(await sign({ nonce: undefined }), opts()))).toBe("NONCE_MISMATCH");
  });
  it("rejects missing or wrong acr", async () => {
    expect(await code(validateIdToken(await sign({ acr: undefined }), opts()))).toBe("ASSURANCE_UNSUPPORTED");
    expect(await code(validateIdToken(await sign({ acr: "https://world.org/oidc/acr/device" }), opts()))).toBe("ASSURANCE_UNSUPPORTED");
  });
  it("rejects empty or missing amr", async () => {
    expect(await code(validateIdToken(await sign({ amr: [] }), opts()))).toBe("ASSURANCE_UNSUPPORTED");
    expect(await code(validateIdToken(await sign({ amr: undefined }), opts()))).toBe("ASSURANCE_UNSUPPORTED");
  });
  it("rejects stale auth_time (before attempt start, or older than max lifetime)", async () => {
    expect(await code(validateIdToken(await sign({ auth_time: nowSec - 3600 }), opts()))).toBe("AUTH_STALE");
    expect(await code(validateIdToken(await sign({ auth_time: nowSec - 1000 }), opts({ attemptStartedAt: new Date(NOW.getTime() - 3_600_000) })))).toBe("AUTH_STALE");
  });
  it("rejects auth_time in the future", async () => {
    expect(await code(validateIdToken(await sign({ auth_time: nowSec + 300 }), opts()))).toBe("AUTH_TIME_FUTURE");
  });
  it("rejects missing auth_time and missing sub", async () => {
    expect(await code(validateIdToken(await sign({ auth_time: undefined }), opts()))).toBe("TOKEN_INVALID");
    expect(await code(validateIdToken(await sign({ sub: undefined }), opts()))).toBe("TOKEN_INVALID");
  });
  it("accepts auth_time at the skew boundaries", async () => {
    const startSec = STARTED.getTime() / 1000;
    await expect(validateIdToken(await sign({ auth_time: startSec - 60 }), opts())).resolves.toBeTruthy();
    await expect(validateIdToken(await sign({ auth_time: nowSec + 60 }), opts())).resolves.toBeTruthy();
    expect(await code(validateIdToken(await sign({ auth_time: startSec - 61 }), opts()))).toBe("AUTH_STALE");
    expect(await code(validateIdToken(await sign({ auth_time: nowSec + 61 }), opts()))).toBe("AUTH_TIME_FUTURE");
  });
  it("never leaks the client secret or token in errors", async () => {
    const t = await new SignJWT(base()).setProtectedHeader({ alg: "HS256" }).setIssuer(ISS).setAudience(CLIENT).setExpirationTime(nowSec + 300).sign(new TextEncoder().encode(SECRET));
    try {
      await validateIdToken(t, opts());
    } catch (e) {
      const s = `${(e as Error).message} ${(e as Error).stack ?? ""} ${JSON.stringify(e)}`;
      expect(s).not.toContain(SECRET);
      expect(s).not.toContain(t);
    }
  });
});
