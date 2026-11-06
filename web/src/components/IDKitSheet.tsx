"use client";
/* The real World ID widget (@worldcoin/idkit v4 IDKitRequestWidget). Loaded only on the client by WorldCheck.
   v4 needs an RP context signed by the backend (the signing key never reaches the browser): we ask `rpContext()` for a
   fresh one per check, so every check, approver and action gets its own nonce. The widget reports a proof or a failure
   kind. It never decides anything: the caller sends the proof to the backend, which verifies it.

   WHY PROOF OF HUMAN (credential rationale)
   Trust event: creator account sign-up. It unlocks channel proof, deals, submissions and claims, i.e. the place where
   USDC can be paid out. Risk: one person farming many creator accounts to collect multiple payouts (sybil).
   Proof of Human is the minimum credential that gives per-human uniqueness: one nullifier per human per action, stored
   unique in User.worldIdNullifier. Selfie Check would show "a live person" but not one-human-one-payout-account
   uniqueness. Passport/NFC proves a document attribute, not cross-population uniqueness. We claim no more than that:
   it limits duplicate accounts, it does not prove the person is honest or that their views are real.
   Release approvals need freshness/assurance rather than uniqueness and are gated separately (auth.world.org step-up).
   The preset includes a legacy Orb fallback, hence allow_legacy_proofs stays on. */
import { useCallback, useEffect, useRef, useState } from "react";
import { IDKitRequestWidget, proofOfHuman, type IDKitResult, type RpContext } from "@worldcoin/idkit";
import { ApiError } from "./api";
import { failOf, type SheetFail } from "../lib/worldid/errors";

export type SheetProof = { nullifier_hash: string; proof: string; merkle_root?: string; verification_level?: string; idkitResult: IDKitResult };
export type { SheetFail };
type SignedCtx = RpContext & { app_id: string; action?: string; environment?: "production" | "staging" | "sandbox" };

/** Pull the legacy (v3) fields out of an IDKit result so a v2-style verifier can read them; v4 results travel whole in `idkitResult`. */
function toProof(r: IDKitResult): SheetProof {
  const first = (r.responses?.[0] ?? {}) as unknown as Record<string, string | undefined>;
  return {
    nullifier_hash: first.nullifier ?? "",
    proof: typeof first.proof === "string" ? first.proof : JSON.stringify(first.proof ?? ""),
    merkle_root: first.merkle_root,
    verification_level: first.identifier,
    idkitResult: r,
  };
}

/** The backend signs the request (POST /api/worldid/rp-signature) and tells us the app id, action and environment to use. */
async function fetchRpContext(action: string): Promise<SignedCtx> {
  const res = await fetch("/api/worldid/rp-signature", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action }), credentials: "same-origin" });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, body?.error?.code ?? "ERROR", body?.error?.message ?? `World ID request could not be signed (${res.status}).`);
  return body.rpContext as SignedCtx;
}

export default function IDKitSheet({ action, signal, onProof, onFail }: { action: string; signal?: string; onProof: (p: SheetProof) => void; onFail: (f: SheetFail) => void }) {
  const [ctx, setCtx] = useState<SignedCtx | null>(null);
  const [open, setOpen] = useState(true);
  const settled = useRef(false);
  const fail = useCallback(
    (f: SheetFail) => {
      if (settled.current) return;
      settled.current = true;
      onFail(f);
    },
    [onFail],
  );

  useEffect(() => {
    let alive = true;
    fetchRpContext(action).then(
      (c) => alive && setCtx(c),
      (e: unknown) => {
        if (!alive) return;
        const nc = e instanceof ApiError && (e.code === "NOT_CONFIGURED" || e.status === 503);
        fail({ kind: nc ? "unconfigured" : "failed", message: e instanceof Error ? e.message : "The check could not be started." });
      },
    );
    return () => {
      alive = false;
    };
  }, [action, fail]);

  if (!ctx) return null;
  return (
    <IDKitRequestWidget
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        /* closed before a proof or an error arrived: a cancellation. The delay lets success and close race safely. */
        if (!o) setTimeout(() => fail({ kind: "cancelled", message: "You closed the check before it finished." }), 600);
      }}
      app_id={ctx.app_id as `app_${string}`}
      action={ctx.action ?? action}
      environment={ctx.environment}
      rp_context={ctx}
      allow_legacy_proofs
      preset={proofOfHuman({ signal })}
      autoClose
      onSuccess={(r) => {
        if (settled.current) return;
        settled.current = true;
        onProof(toProof(r));
      }}
      onError={(code) => fail(failOf(code))}
    />
  );
}
