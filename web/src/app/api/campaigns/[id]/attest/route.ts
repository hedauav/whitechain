import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { attestationHash } from "@/lib/chain/split";
import { db } from "@/lib/db";
import { getCampaign, proofSchema, type Ctx } from "@/lib/domain";
import { ApiError, ok, readJson, route } from "@/lib/http";
import { checkFreshProof, consumeProof } from "@/lib/worldid/fresh";
import { consumeStepUp, peekStepUp } from "@/lib/worldauth/stepup";

/** Either a fresh IDKit proof, or a completed auth.world.org step-up (operation CAMPAIGN_APPROVE, bound to "campaign:<id>"). */
const body = z.object({ worldIdProof: proofSchema.optional(), stepUpAttemptId: z.string().min(1).optional() });
const APPROVE_ACTION = "clippo-approve-campaign";

/**
 * Admin human confirmation for approving a FUNDED campaign (mandatory when `campaign.highValue`).
 * Verifies a fresh World ID proof (one use only), stores it, and returns the bytes32 `attestation` to pass on-chain as
 * `approveCampaign(onchainId, attestation)`. Denied / cancelled / expired -> 403 WORLD_ID_DENIED, repeated -> 409 PROOF_REUSED;
 * in all failure cases nothing is recorded.
 */
export const POST = route(async (req: Request, { params }: Ctx) => {
  const user = await requireUser(req, ["ADMIN"]);
  const c = await getCampaign((await params).id);
  if (c.status !== "FUNDED") throw new ApiError(409, "BAD_STATE", `Campaign is ${c.status}, expected FUNDED`);
  const v = body.parse(await readJson(req));
  if (!!v.worldIdProof === !!v.stepUpAttemptId) throw new ApiError(400, "PROOF_REQUIRED", "Send exactly one of worldIdProof or stepUpAttemptId");
  const bind = { userId: user.id, campaignId: c.id, splitHash: `campaign:${c.id}`, role: "ADMIN" as const };
  let proofHash = "";
  let nullifier = "";
  if (v.stepUpAttemptId) await peekStepUp(v.stepUpAttemptId, bind);
  else ({ proofHash, nullifier } = await checkFreshProof(v.worldIdProof!, APPROVE_ACTION, `approve:${c.id}`));
  let attestation = "";
  await db.$transaction(async (tx) => {
    if (v.stepUpAttemptId) {
      ({ proofHash, nullifier } = await consumeStepUp(tx, v.stepUpAttemptId, bind));
      await consumeProof(tx, user, proofHash, "stepup:approve");
    } else {
      await consumeProof(tx, user, proofHash, APPROVE_ACTION);
    }
    attestation = attestationHash({ kind: "APPROVE", campaignKey: c.onchainId ?? c.id, wallet: user.wallet, nullifier, proofHash });
    await tx.humanAttestation.create({
      data: { campaignId: c.id, userId: user.id, kind: "APPROVE", attestation, proofHash },
    });
  });
  return ok(
    {
      attestation,
      highValue: c.highValue,
      gate: v.stepUpAttemptId ? "stepup" : "idkit",
      onchain: c.onchainId ? { functionName: "approveCampaign", args: [c.onchainId, attestation] } : null,
    },
    201,
  );
});
