"use client";
import { useEffect, useRef, useState } from "react";
import { ApiError, DEMO, asApiError, agentPass, errText, getStepUpAttempt, startStepUp, type ApiStepUpAttempt } from "./api";
import { chainFor, connectWallet, getChainConfig, readClient } from "@/lib/chain/client";
import { escrowAbi } from "@/lib/chain/escrow-abi";
import type { SplitResult } from "./hooks";

/**
 * World ID Agent Pass gate for AGENT-PROPOSED splits: an auth.world.org OIDC step-up (fresh Orb-class check) instead of an in-page proof.
 * It is a full-page redirect, so the SPA state is lost; the UI resumes from the server-side attempt (useStepUpReturn + StepUpReturnPanel).
 * The redirect query string is only a hint to go and look at the attempt. Only the server-validated attempt (status AUTHORIZED) and the
 * result of the final POST /split count as authorization.
 */

export type StepUpState = "approved" | "cancelled" | "expired" | "mismatch" | "failed";
export type StepUpReturn = { state: StepUpState; attempt: ApiStepUpAttempt | null; attemptId: string | null; code: string | null };

export const STEPUP_COPY: Record<StepUpState, string> = {
  approved: "Verified with World ID (fresh Orb-class check). Completing approval...",
  cancelled: "You cancelled at World ID. Nothing was approved.",
  expired: "The check expired. Nothing was approved. Start again.",
  mismatch: "That World ID is not the one linked to your account, or the split changed. Nothing was approved.",
  failed: "World ID could not be reached or validated. Nothing was approved.",
};
const STATES: StepUpState[] = ["approved", "cancelled", "expired", "mismatch", "failed"];

/** The query params are read and stripped exactly once per page load (survives React strict-mode double effects). */
let returned: Promise<StepUpReturn | null> | null = null;
function consumeReturn(): Promise<StepUpReturn | null> {
  if (returned) return returned;
  const q = new URLSearchParams(window.location.search);
  const hint = q.get("stepup");
  if (!hint) return (returned = Promise.resolve(null));
  const id = q.get("attempt");
  const code = q.get("code");
  q.delete("stepup");
  q.delete("attempt");
  q.delete("code");
  const qs = q.toString();
  window.history.replaceState(window.history.state, "", `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`);
  const want = (STATES as string[]).includes(hint) ? (hint as StepUpState) : "failed";
  returned = (async (): Promise<StepUpReturn> => {
    let attempt: ApiStepUpAttempt | null = null;
    if (id) {
      try {
        attempt = await getStepUpAttempt(id);
      } catch {
        attempt = null;
      }
    }
    if (want === "approved") {
      /* The query string alone never authorizes. No attempt, or an attempt that is not AUTHORIZED, is not an approval. */
      if (attempt && attempt.status === "AUTHORIZED") return { state: "approved", attempt, attemptId: id, code };
      if (attempt && attempt.status === "EXPIRED") return { state: "expired", attempt, attemptId: id, code: attempt.failureCode ?? code };
      return { state: "failed", attempt, attemptId: id, code: attempt?.failureCode ?? code };
    }
    return { state: want, attempt, attemptId: id, code: attempt?.failureCode ?? code };
  })();
  return returned;
}

/** On mount: reads ?stepup=&attempt=, GETs the attempt, strips the params from the URL. `undefined` while resolving, `null` when not returning from a step-up. */
export function useStepUpReturn(): StepUpReturn | null | undefined {
  const [r, setR] = useState<StepUpReturn | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    consumeReturn().then((x) => alive && setR(x));
    return () => {
      alive = false;
    };
  }, []);
  return r;
}

type Splits = { creatorWallet: string; amount: number }[];

/** Button: start the step-up and leave for auth.world.org. */
export function StepUpApprove({ campaignId, splits, agentProposalId, label = "Approve with World ID step-up", onError }: { campaignId: string; splits: Splits; agentProposalId: string; label?: string; onError?: (text: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  async function go() {
    setBusy(true);
    setErr("");
    try {
      const returnPath = `${window.location.pathname}${window.location.search.replace(/[?&](stepup|attempt|code)=[^&]*/g, "").replace(/^&/, "?")}`;
      const s = await startStepUp(campaignId, { operation: "SPLIT_RELEASE", splits, agentProposalId, returnPath });
      window.location.assign(s.authorizeUrl);
    } catch (e) {
      const t = e instanceof ApiError && e.code === "STEPUP_REQUIRED" ? e.message : errText(e);
      setErr(`Nothing was approved. ${t}`);
      onError?.(t);
      setBusy(false);
    }
  }
  return (
    <div className="stack" style={{ gap: 6, justifyItems: "start" }}>
      <button className="btn sm" disabled={busy} onClick={go}>{busy ? "Opening World ID" : label}</button>
      {DEMO && <span className="micro">Demo build: the World ID redirect is simulated locally.</span>}
      {err && <p className="notice warn" role="alert"><b>Nothing approved</b>{err}</p>}
    </div>
  );
}

const releaseText = (res: SplitResult, n: number) =>
  res.proposal.status === "FINALIZED"
    ? `Split finalized for ${n} creator${n === 1 ? "" : "s"}. They can claim now.`
    : res.proposal.status === "AWAITING_CHAIN"
      ? "Both approvals are in. Waiting for the chain to confirm the split. Credits appear once the escrow reports it."
      : `Your approval is recorded${res.txHash ? " and sent on-chain" : ""}. Awaiting ${res.proposal.awaiting.join(" and ") || "the other approver"}: they must approve the identical split with their own World ID step-up. Nothing is payable yet.`;

/** POST /split with the AUTHORIZED attempt's own stored splits, then the approver's on-chain approveSplit. */
async function release(a: ApiStepUpAttempt, id: string): Promise<{ res: SplitResult; stage: "ok" }> {
  const r = await agentPass.releaseWithStepUp(a.campaignId, a.splits, a.agentProposalId ?? undefined, id);
  if (!r.onchain) return { res: { proposal: r.proposal, attestation: r.attestation, txHash: null }, stage: "ok" };
  const { chain: cfg } = await getChainConfig();
  if (!cfg.enabled || !cfg.escrow) return { res: { proposal: r.proposal, attestation: r.attestation, txHash: null }, stage: "ok" };
  const { address, wallet } = await connectWallet(cfg);
  const x = r.onchain.args;
  const txHash = await wallet.writeContract({ account: address, chain: chainFor(cfg), address: cfg.escrow, abi: escrowAbi, functionName: "approveSplit", args: [BigInt(x.id), x.creators, x.amounts.map((v) => BigInt(v)), x.attestation] });
  await readClient(cfg).waitForTransactionReceipt({ hash: txHash });
  return { res: { proposal: r.proposal, attestation: r.attestation, txHash }, stage: "ok" };
}
/**
 * Resume after the redirect. Mount it once on every page that can be a returnPath. Shows the outcome (denied states say the payout did NOT occur);
 * on a server-validated AUTHORIZED attempt it POSTs the release once, then calls `onSettled` so the page can refresh its panel/state.
 */
export function StepUpReturnPanel({ onSettled }: { onSettled?: (res: SplitResult | null, attempt: ApiStepUpAttempt | null) => void }) {
  const r = useStepUpReturn();
  const [done, setDone] = useState<{ ok: boolean; text: string } | null>(null);
  const started = useRef(false);
  const cb = useRef(onSettled);
  useEffect(() => {
    cb.current = onSettled;
  });
  useEffect(() => {
    if (!r || started.current) return;
    started.current = true;
    const a = r.attempt;
    if (r.state !== "approved" || !a || !r.attemptId) {
      cb.current?.(null, a);
      return;
    }
    const id = r.attemptId;
    (async () => {
      try {
        const out = await release(a, id);
        setDone({ ok: true, text: releaseText(out.res, a.splits.length) });
        cb.current?.(out.res, a);
      } catch (e) {
        setDone({ ok: false, text: `Split not released. The payout did NOT occur. ${errText(asApiError(e))}` });
        cb.current?.(null, a);
      }
    })();
  }, [r]);

  if (!r) return null;
  const denied = r.state !== "approved";
  const line = done ? done.text : STEPUP_COPY[r.state];
  const bad = denied || (done && !done.ok);
  return (
    <div className={`notice${bad ? " warn" : ""}`} role="status" style={{ marginBottom: 28 }}>
      <b>{denied ? "World ID step-up: nothing approved" : done ? (done.ok ? "Recorded" : "Nothing changed") : "World ID step-up"}</b>
      {line}
      {denied && <span className="micro">The payout did NOT occur.{r.code ? ` (${r.code})` : ""}</span>}
      {DEMO && r.attempt && r.attempt.agentProposalId !== undefined && <span className="micro">Demo build: simulated step-up.</span>}
    </div>
  );
}
