import { env, requireEnv } from "../config";

export type WorldAuthPolicy = "agent-required" | "either" | "required";
export type TokenAuthMethod = "basic" | "post";

export const DEFAULT_ISSUER = "https://auth.world.org";
export const DEFAULT_ACR = "https://world.org/oidc/acr/orb";

/** auth.world.org OIDC step-up config. Missing required vars -> 503 NOT_CONFIGURED (never fake success). */
export function worldAuthConfig() {
  const clientId = requireEnv("World ID step-up", "WORLD_AUTH_CLIENT_ID");
  const clientSecret = requireEnv("World ID step-up", "WORLD_AUTH_CLIENT_SECRET");
  const redirectUri = requireEnv("World ID step-up", "WORLD_AUTH_REDIRECT_URI");
  const issuer = (env("WORLD_AUTH_ISSUER") ?? DEFAULT_ISSUER).replace(/\/+$/, "");
  const tokenAuth: TokenAuthMethod = env("WORLD_AUTH_TOKEN_AUTH") === "post" ? "post" : "basic";
  const acr = env("WORLD_AUTH_ACR") ?? DEFAULT_ACR;
  const p = env("WORLD_AUTH_POLICY");
  const policy: WorldAuthPolicy = p === "either" || p === "required" ? p : "agent-required";
  return { clientId, clientSecret, redirectUri, issuer, tokenAuth, acr, acceptedAcrs: [acr], policy };
}
export type WorldAuthConfig = ReturnType<typeof worldAuthConfig>;
