import { createRemoteJWKSet, type JWTVerifyGetKey, type CryptoKey } from "jose";
import { getOverride } from "../config";
import { worldAuthConfig } from "./config";
import { StepUpError } from "./idtoken";

export interface WorldAuthDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
}

export interface WorldAuthClient {
  readonly mode: string;
  discovery(): Promise<WorldAuthDiscovery>;
  exchangeCode(p: { code: string; codeVerifier: string; redirectUri: string }): Promise<{ id_token: string }>;
  getKeys(): Promise<JWTVerifyGetKey | CryptoKey>;
}

const DISCOVERY_TTL_MS = 10 * 60_000;
const TIMEOUT_MS = 8000;
const dep = (m: string) => new StepUpError("DEPENDENCY", m);

export class RealWorldAuth implements WorldAuthClient {
  readonly mode = "real" as const;
  private cache?: { at: number; issuer: string; d: WorldAuthDiscovery };
  private jwks?: { uri: string; get: JWTVerifyGetKey };

  async discovery(): Promise<WorldAuthDiscovery> {
    const cfg = worldAuthConfig();
    if (this.cache && this.cache.issuer === cfg.issuer && Date.now() - this.cache.at < DISCOVERY_TTL_MS) return this.cache.d;
    let d: Partial<WorldAuthDiscovery>;
    try {
      const res = await fetch(`${cfg.issuer}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "application/json" } });
      if (!res.ok) throw dep(`World auth discovery failed (${res.status})`);
      d = (await res.json()) as Partial<WorldAuthDiscovery>;
    } catch (e) {
      if (e instanceof StepUpError) throw e;
      throw dep("World auth discovery unreachable");
    }
    if (d.issuer !== cfg.issuer) throw new StepUpError("ISSUER_MISMATCH", "Discovery issuer does not match configured issuer");
    if (!d.authorization_endpoint || !d.token_endpoint || !d.jwks_uri) throw dep("World auth discovery is incomplete");
    const full = { issuer: d.issuer, authorization_endpoint: d.authorization_endpoint, token_endpoint: d.token_endpoint, jwks_uri: d.jwks_uri };
    this.cache = { at: Date.now(), issuer: cfg.issuer, d: full };
    return full;
  }

  async exchangeCode(p: { code: string; codeVerifier: string; redirectUri: string }): Promise<{ id_token: string }> {
    const cfg = worldAuthConfig();
    const d = await this.discovery();
    const form = new URLSearchParams({ grant_type: "authorization_code", client_id: cfg.clientId, code: p.code, redirect_uri: p.redirectUri, code_verifier: p.codeVerifier });
    const headers: Record<string, string> = { "content-type": "application/x-www-form-urlencoded", accept: "application/json" };
    if (cfg.tokenAuth === "basic") {
      headers.authorization = `Basic ${Buffer.from(`${encodeURIComponent(cfg.clientId)}:${encodeURIComponent(cfg.clientSecret)}`).toString("base64")}`;
    } else form.set("client_secret", cfg.clientSecret);
    try {
      const res = await fetch(d.token_endpoint, { method: "POST", headers, body: form, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw dep(`World auth token exchange failed (${res.status})`);
      const j = (await res.json()) as { id_token?: unknown };
      if (typeof j.id_token !== "string" || !j.id_token) throw dep("World auth token response had no id_token");
      return { id_token: j.id_token };
    } catch (e) {
      if (e instanceof StepUpError) throw e;
      throw dep("World auth token endpoint unreachable");
    }
  }

  async getKeys(): Promise<JWTVerifyGetKey | CryptoKey> {
    const d = await this.discovery();
    if (!this.jwks || this.jwks.uri !== d.jwks_uri) {
      this.jwks = { uri: d.jwks_uri, get: createRemoteJWKSet(new URL(d.jwks_uri), { timeoutDuration: TIMEOUT_MS }) };
    }
    return this.jwks.get;
  }
}

export function getWorldAuth(): WorldAuthClient {
  return getOverride<WorldAuthClient>("worldAuth") ?? new RealWorldAuth();
}

/** Builds the authorize URL: scope=openid only, S256 PKCE, max_age=0 and an essential acr claim request. */
export function buildAuthorizeUrl(p: {
  discovery: Pick<WorldAuthDiscovery, "authorization_endpoint">;
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  challenge: string;
  acr: string;
}): string {
  const u = new URL(p.discovery.authorization_endpoint);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", p.clientId);
  u.searchParams.set("redirect_uri", p.redirectUri);
  u.searchParams.set("scope", "openid");
  u.searchParams.set("state", p.state);
  u.searchParams.set("nonce", p.nonce);
  u.searchParams.set("code_challenge", p.challenge);
  u.searchParams.set("code_challenge_method", "S256");
  u.searchParams.set("max_age", "0");
  u.searchParams.set("claims", JSON.stringify({ id_token: { acr: { essential: true, value: p.acr } } }));
  return u.toString();
}
