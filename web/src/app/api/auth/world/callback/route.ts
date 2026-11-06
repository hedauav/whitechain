import { NextResponse, connection } from "next/server";
import { getUser } from "@/lib/auth";
import { DEFAULT_RETURN_PATH, completeCallback, safeReturnPath } from "@/lib/worldauth/stepup";

const LABEL = {
  AUTHORIZED: "approved",
  DENIED: "cancelled",
  EXPIRED: "expired",
  FAILED: "failed",
} as const;

/** OIDC redirect target. Always 302s back to the app; never puts tokens, codes or secrets in the URL. */
export async function GET(req: Request): Promise<Response> {
  try {
    await connection();
  } catch {
    /* outside a Next request (tests) */
  }
  const q = new URL(req.url).searchParams;
  let path = DEFAULT_RETURN_PATH;
  let label: string = "failed";
  let attempt: string | null = null;
  let code: string | null = null;
  try {
    const user = await getUser(req);
    const r = await completeCallback(
      { code: q.get("code"), state: q.get("state"), iss: q.get("iss"), error: q.get("error"), error_description: q.get("error_description") },
      user?.id ?? null,
    );
    path = safeReturnPath(r.returnPath);
    attempt = r.attemptId;
    code = r.code;
    label = r.code === "STEPUP_IDENTITY_MISMATCH" || r.code === "STEPUP_SAME_HUMAN" || r.code === "STEPUP_BINDING_MISMATCH" ? "mismatch" : LABEL[r.status];
  } catch (e) {
    console.error("step-up callback failed", e instanceof Error ? e.name : "error");
    code = "STEPUP_DEPENDENCY";
  }
  const u = new URL(path, "http://x.invalid");
  u.searchParams.set("stepup", label);
  if (attempt) u.searchParams.set("attempt", attempt);
  if (code) u.searchParams.set("code", code);
  const res = new NextResponse(null, { status: 302, headers: { Location: u.pathname + u.search + u.hash } });
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("Referrer-Policy", "no-referrer");
  return res;
}
