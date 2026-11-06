/**
 * World ID step-up (auth.world.org OIDC) integration tests against the throwaway test Postgres.
 * The OIDC provider is the FakeWorldAuth double (local RSA key, scripted token knobs). Every failure path must record the
 * attempt status + failureCode + an audit row and must leave the approval undone (no SplitProposal/HumanAttestation/UsedProof/Payout).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getOverride } from "@/lib/config";
import { splitHash, normalizeSplit } from "@/lib/chain/split";
import { clearDoubles, FAKE_WORLD_AUTH, FakeWorldAuth, installChainDouble, installDoubles } from "@/test/doubles";
import { resetDb } from "@/test/db";

process.env.ADMIN_WALLETS = "0xad00000000000000000000000000000000000001";
process.env.SESSION_SECRET = "test-secret";

type Db = typeof import("@/lib/db").db;
let db: Db;
let fake: FakeWorldAuth;

const ADMIN = "0xad00000000000000000000000000000000000001";
const CAMPAIGNER = "0xca00000000000000000000000000000000000002";
const UNVERIFIED = "0xca00000000000000000000000000000000000009";
const CREATOR = "0xc100000000000000000000000000000000000003";
const SPLITS = [{ creatorWallet: CREATOR, amount: 100 }];
const HASH = splitHash(normalizeSplit(SPLITS));

const req = (url: string, wallet: string | null, body?: unknown, method = "POST") =>
  new Request(`http://localhost${url}`, {
    method,
    headers: { "content-type": "application/json", ...(wallet ? { "x-wallet": wallet } : {}), host: "localhost" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

async function setup(over: Record<string, unknown> = {}, owner = CAMPAIGNER) {
  const campaigner = await db.user.findUniqueOrThrow({ where: { wallet: owner } });
  const creator = await db.user.findUniqueOrThrow({ where: { wallet: CREATOR } });
  const channel = await db.channel.findFirstOrThrow({ where: { userId: creator.id } });
  const c = await db.campaign.create({
    data: { campaignerId: campaigner.id, title: "t", story: {}, contentSource: "LINK", platforms: ["YOUTUBE"], payoutMode: "HUMAN_SPLIT", approver: "CAMPAIGNER_AND_ADMIN", poolSize: 500, status: "APPROVED", onchainId: "1", ...over } as never,
  });
  const vid = `v-${Math.random().toString(36).slice(2)}`;
  await db.submission.create({
    data: { campaignId: c.id, creatorId: creator.id, channelId: channel.id, link: `https://youtu.be/${vid}`, videoId: vid, metadata: {}, verdict: { create: { result: "APPROVE", confidence: 0.9, reason: "ok" } } },
  });
  return c;
}

async function start(campaignId: string, wallet: string, extra: Record<string, unknown> = {}) {
  const { POST } = await import("@/app/api/campaigns/[id]/stepup/start/route");
  const res = await POST(req(`/api/campaigns/${campaignId}/stepup/start`, wallet, { operation: "SPLIT_RELEASE", splits: SPLITS, returnPath: `/desk/c/${campaignId}`, ...extra }), ctx(campaignId));
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

async function callback(query: Record<string, string>, wallet: string | null) {
  const { GET } = await import("@/app/api/auth/world/callback/route");
  const res = await GET(req(`/api/auth/world/callback?${new URLSearchParams(query)}`, wallet, undefined, "GET"));
  return { status: res.status, location: res.headers.get("location") ?? "", headers: res.headers };
}

/** Starts a step-up and returns the attempt row. */
async function begin(c: { id: string }, wallet = CAMPAIGNER, extra: Record<string, unknown> = {}) {
  const r = await start(c.id, wallet, extra);
  expect(r.status).toBe(201);
  return db.stepUpAttempt.findUniqueOrThrow({ where: { id: r.body.attemptId } });
}
const attemptOf = (id: string) => db.stepUpAttempt.findUniqueOrThrow({ where: { id } });
const audits = (campaignId: string) => db.agentAudit.findMany({ where: { campaignId }, orderBy: { createdAt: "asc" } });

async function expectNothingApproved(campaignId: string) {
  expect(await db.splitProposal.count({ where: { campaignId } })).toBe(0);
  expect(await db.humanAttestation.count({ where: { campaignId } })).toBe(0);
  expect(await db.payout.count({ where: { campaignId } })).toBe(0);
  expect(await db.usedProof.count()).toBe(0);
}

async function consume(attemptId: string, o: { userId: string; campaignId: string; splitHash?: string; role?: "CAMPAIGNER" | "ADMIN" }) {
  const { consumeStepUp } = await import("@/lib/worldauth/stepup");
  return db.$transaction((tx) => consumeStepUp(tx, attemptId, { userId: o.userId, campaignId: o.campaignId, splitHash: o.splitHash ?? HASH, role: o.role ?? "CAMPAIGNER" }));
}

async function agentProposal(campaignId: string, ownerId: string, over: Record<string, unknown> = {}) {
  const agent = await db.agentIdentity.create({ data: { campaignId, ownerId, address: `0xa${Math.random().toString(16).slice(2, 12)}`, humanId: "h", mode: "demo" } });
  return db.agentProposal.create({
    data: { campaignId, agentId: agent.id, splitHash: HASH, splits: [], rationale: "r", nonce: `n-${Math.random()}`, payload: {}, expiresAt: new Date(Date.now() + 3600_000), ...over },
  });
}

let campaigner: { id: string };
let admin: { id: string };

beforeAll(async () => {
  installDoubles();
  installChainDouble();
  fake = getOverride<FakeWorldAuth>("worldAuth")!;
  db = (await import("@/lib/db")).db;
  await resetDb(db);
  admin = await db.user.create({ data: { wallet: ADMIN, role: "ADMIN", verified: true } });
  campaigner = await db.user.create({ data: { wallet: CAMPAIGNER, role: "CAMPAIGNER", verified: true } });
  await db.user.create({ data: { wallet: UNVERIFIED, role: "CAMPAIGNER", verified: false } });
  const creator = await db.user.create({ data: { wallet: CREATOR, role: "CREATOR", verified: true } });
  await db.channel.create({ data: { userId: creator.id, platform: "YOUTUBE", handle: "c", verificationCode: "x", verified: true } });
}, 120_000);

beforeEach(async () => {
  fake.reset();
  await db.user.updateMany({ data: { worldAuthIss: null, worldAuthSub: null } });
  await db.stepUpAttempt.deleteMany();
  await db.usedProof.deleteMany();
});

afterAll(async () => {
  clearDoubles();
  await db?.$disconnect();
});

describe("start", () => {
  it("returns an authorize URL and stores a PENDING attempt without secrets in the response", async () => {
    const c = await setup();
    const r = await start(c.id, CAMPAIGNER, { returnPath: "https://evil.example/x" });
    expect(r.status).toBe(201);
    const a = await attemptOf(r.body.attemptId);
    expect(a).toMatchObject({ status: "PENDING", returnPath: "/desk", allowEnroll: true, splitHash: HASH, actorRole: "CAMPAIGNER" });
    const url = new URL(r.body.authorizeUrl);
    expect(url.searchParams.get("state")).toBe(a.state);
    expect(url.searchParams.get("nonce")).toBe(a.nonce);
    expect(r.body.authorizeUrl).not.toContain(a.codeVerifier);
    expect(JSON.stringify(r.body)).not.toContain(FAKE_WORLD_AUTH.clientSecret);
    expect((await audits(c.id)).map((x) => x.event)).toContain("STEPUP_REQUESTED");
  });

  it("refuses the wrong approver, a non-matching proposal, an expired proposal, and an unconfigured server", async () => {
    const single = await setup({ approver: "CAMPAIGNER_ONLY" });
    const wrong = await start(single.id, ADMIN);
    expect(wrong.status).toBe(403);
    expect(wrong.body.error.code).toBe("WRONG_APPROVER");

    const c = await setup();
    const p = await agentProposal(c.id, campaigner.id, { splitHash: "deadbeef" });
    const changed = await start(c.id, CAMPAIGNER, { agentProposalId: p.id });
    expect(changed.status).toBe(409);
    expect(changed.body.error.code).toBe("SPLIT_CHANGED");
    expect((await db.agentProposal.findUniqueOrThrow({ where: { id: p.id } })).status).toBe("PROPOSED");

    const c2 = await setup();
    const old = await agentProposal(c2.id, campaigner.id, { expiresAt: new Date(Date.now() - 1000) });
    const expired = await start(c2.id, CAMPAIGNER, { agentProposalId: old.id });
    expect(expired.status).toBe(410);
    expect(expired.body.error.code).toBe("PROPOSAL_EXPIRED");

    const id = process.env.WORLD_AUTH_CLIENT_ID;
    delete process.env.WORLD_AUTH_CLIENT_ID;
    const off = await start(c.id, CAMPAIGNER);
    process.env.WORLD_AUTH_CLIENT_ID = id;
    expect(off.status).toBe(503);
    expect(off.body.error.code).toBe("NOT_CONFIGURED");

    expect(await db.stepUpAttempt.count()).toBe(0);
    for (const x of [single, c, c2]) await expectNothingApproved(x.id);
  });
});

describe("callback failures", () => {
  it("cancel (access_denied) never redeems the code", async () => {
    const c = await setup();
    const a = await begin(c);
    const r = await callback({ error: "access_denied", error_description: "user cancelled", state: a.state }, CAMPAIGNER);
    expect(r.status).toBe(302);
    expect(r.location).toContain("stepup=cancelled");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("referrer-policy")).toBe("no-referrer");
    expect(fake.count("exchangeCode")).toBe(0);
    expect(await attemptOf(a.id)).toMatchObject({ status: "DENIED", failureCode: "STEPUP_DENIED" });
    expect((await audits(c.id)).some((x) => x.outcome === "STEPUP_DENIED")).toBe(true);
    await expectNothingApproved(c.id);
  });

  it("unknown state is refused; a replayed state does not redeem the code again", async () => {
    const c = await setup();
    const bad = await callback({ code: "abc", state: "nope" }, CAMPAIGNER);
    expect(bad.location).toContain("stepup=failed");
    expect(bad.location).toContain("code=STEPUP_STATE_INVALID");
    expect(fake.count("exchangeCode")).toBe(0);

    const a = await begin(c);
    const ok = await callback({ code: "c1", state: a.state, iss: FAKE_WORLD_AUTH.issuer }, CAMPAIGNER);
    expect(ok.location).toContain("stepup=approved");
    const again = await callback({ code: "c1", state: a.state }, CAMPAIGNER);
    expect(again.location).toContain("stepup=failed");
    expect(fake.count("exchangeCode")).toBe(1);
    expect(await attemptOf(a.id)).toMatchObject({ status: "AUTHORIZED" });
  });

  it("a different session user is refused (BINDING_MISMATCH) and the code is not redeemed", async () => {
    const c = await setup();
    const a = await begin(c);
    const r = await callback({ code: "c", state: a.state }, ADMIN);
    expect(r.location).toContain("stepup=mismatch");
    expect(fake.count("exchangeCode")).toBe(0);
    expect(await attemptOf(a.id)).toMatchObject({ status: "DENIED", failureCode: "STEPUP_BINDING_MISMATCH" });
    expect((await audits(c.id)).some((x) => x.outcome === "STEPUP_BINDING")).toBe(true);
    await expectNothingApproved(c.id);
  });

  it("an expired attempt is refused", async () => {
    const c = await setup();
    const a = await begin(c);
    await db.stepUpAttempt.update({ where: { id: a.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const r = await callback({ code: "c", state: a.state }, CAMPAIGNER);
    expect(r.location).toContain("stepup=expired");
    expect(fake.count("exchangeCode")).toBe(0);
    expect(await attemptOf(a.id)).toMatchObject({ status: "EXPIRED", failureCode: "STEPUP_EXPIRED" });
    expect((await audits(c.id)).some((x) => x.outcome === "STEPUP_EXPIRED")).toBe(true);
    await expectNothingApproved(c.id);
  });

  it("an `iss` parameter that is not the discovered issuer is refused before redeeming", async () => {
    const c = await setup();
    const a = await begin(c);
    const r = await callback({ code: "c", state: a.state, iss: "https://evil.example" }, CAMPAIGNER);
    expect(r.location).toContain("stepup=failed");
    expect(fake.count("exchangeCode")).toBe(0);
    expect(await attemptOf(a.id)).toMatchObject({ status: "FAILED", failureCode: "STEPUP_TOKEN_INVALID" });
    await expectNothingApproved(c.id);
  });

  it.each([["discovery"], ["dependency"], ["jwks"]] as const)("a %s failure fails closed (502, FAILED)", async (kind) => {
    const c = await setup();
    const a = await begin(c);
    fake.next({ throw: kind });
    const { completeCallback } = await import("@/lib/worldauth/stepup");
    const r = await completeCallback({ code: "c", state: a.state }, a.userId);
    expect(r.httpStatus).toBe(502);
    expect(r.code).toBe("STEPUP_DEPENDENCY");
    expect(await attemptOf(a.id)).toMatchObject({ status: "FAILED", failureCode: "STEPUP_DEPENDENCY" });
    expect((await audits(c.id)).some((x) => x.outcome === "STEPUP_DEPENDENCY")).toBe(true);
    await expectNothingApproved(c.id);
  });

  it("rejects a bad nonce, wrong acr and stale auth_time", async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ nonce: "other" }, "STEPUP_NONCE_MISMATCH"],
      [{ acr: "https://world.org/oidc/acr/device" }, "STEPUP_ASSURANCE"],
      [{ authTime: Math.floor(Date.now() / 1000) - 3600 }, "STEPUP_STALE_AUTH"],
    ];
    for (const [knob, code] of cases) {
      const c = await setup();
      const a = await begin(c);
      fake.next(knob);
      await callback({ code: "c", state: a.state }, CAMPAIGNER);
      expect(await attemptOf(a.id)).toMatchObject({ failureCode: code });
      await expectNothingApproved(c.id);
    }
  });

  it("refuses a World identity that differs from the one linked to the account", async () => {
    await db.user.update({ where: { id: campaigner.id }, data: { worldAuthIss: FAKE_WORLD_AUTH.issuer, worldAuthSub: "linked-sub" } });
    const c = await setup();
    const a = await begin(c);
    fake.setSub("someone-else");
    await callback({ code: "c", state: a.state }, CAMPAIGNER);
    expect(await attemptOf(a.id)).toMatchObject({ status: "DENIED", failureCode: "STEPUP_IDENTITY_MISMATCH" });
    expect((await audits(c.id)).some((x) => x.outcome === "STEPUP_IDENTITY")).toBe(true);
    await expectNothingApproved(c.id);
  });

  it("refuses a World identity already linked to another user", async () => {
    await db.user.update({ where: { id: admin.id }, data: { worldAuthIss: FAKE_WORLD_AUTH.issuer, worldAuthSub: "taken" } });
    const c = await setup({ approver: "CAMPAIGNER_ONLY" });
    const a = await begin(c);
    fake.setSub("taken");
    await callback({ code: "c", state: a.state }, CAMPAIGNER);
    expect(await attemptOf(a.id)).toMatchObject({ status: "DENIED", failureCode: "STEPUP_IDENTITY_MISMATCH" });
    expect((await db.user.findUniqueOrThrow({ where: { id: campaigner.id } })).worldAuthSub).toBeNull();
    await expectNothingApproved(c.id);
  });

  it("the same human cannot satisfy both approvers of a two-party campaign", async () => {
    const c = await setup();
    const a1 = await begin(c, CAMPAIGNER);
    await callback({ code: "c1", state: a1.state }, CAMPAIGNER);
    expect((await attemptOf(a1.id)).status).toBe("AUTHORIZED");
    const a2 = await begin(c, ADMIN);
    await callback({ code: "c2", state: a2.state }, ADMIN); // same default sub
    expect(await attemptOf(a2.id)).toMatchObject({ status: "DENIED", failureCode: "STEPUP_SAME_HUMAN" });
    expect((await db.user.findUniqueOrThrow({ where: { id: admin.id } })).worldAuthSub).toBeNull();
    await expectNothingApproved(c.id);
  });

  it("an unverified user cannot enroll a World identity", async () => {
    const c = await setup({}, UNVERIFIED);
    const a = await begin(c, UNVERIFIED);
    expect(a.allowEnroll).toBe(false);
    await callback({ code: "c", state: a.state }, UNVERIFIED);
    expect(await attemptOf(a.id)).toMatchObject({ status: "DENIED", failureCode: "STEPUP_IDENTITY_MISMATCH" });
    expect((await db.user.findUniqueOrThrow({ where: { wallet: UNVERIFIED } })).worldAuthSub).toBeNull();
    await expectNothingApproved(c.id);
  });
});

describe("happy path and consume", () => {
  async function authorized() {
    const c = await setup();
    const a = await begin(c);
    const r = await callback({ code: "good", state: a.state, iss: FAKE_WORLD_AUTH.issuer }, CAMPAIGNER);
    expect(r.location).toContain("stepup=approved");
    expect(r.location).not.toContain(a.codeVerifier);
    expect(r.location).not.toContain("good");
    return { c, a };
  }

  it("authorizes, enrolls worldAuthSub, and consume returns nullifier + proofHash once", async () => {
    const { c, a } = await authorized();
    const row = await attemptOf(a.id);
    expect(row).toMatchObject({ status: "AUTHORIZED", iss: FAKE_WORLD_AUTH.issuer, sub: "world-sub-1" });
    expect(row.authorizedUntil!.getTime()).toBeGreaterThan(Date.now());
    expect(await db.user.findUniqueOrThrow({ where: { id: campaigner.id } })).toMatchObject({ worldAuthIss: FAKE_WORLD_AUTH.issuer, worldAuthSub: "world-sub-1" });

    const { GET } = await import("@/app/api/stepup/[attemptId]/route");
    const res = await GET(req(`/api/stepup/${a.id}`, CAMPAIGNER, undefined, "GET"), { params: Promise.resolve({ attemptId: a.id }) });
    const view = JSON.stringify(await res.json());
    expect(res.status).toBe(200);
    for (const secret of [a.state, a.nonce, a.codeVerifier]) expect(view).not.toContain(secret);
    const other = await GET(req(`/api/stepup/${a.id}`, ADMIN, undefined, "GET"), { params: Promise.resolve({ attemptId: a.id }) });
    expect(other.status).toBe(404);

    const out = await consume(a.id, { userId: campaigner.id, campaignId: c.id });
    expect(out.nullifier).toBe(`oidc:${FAKE_WORLD_AUTH.issuer}:world-sub-1`);
    expect(out.proofHash).toMatch(/^[0-9a-f]{64}$/);
    expect((await attemptOf(a.id)).status).toBe("CONSUMED");
    await expect(consume(a.id, { userId: campaigner.id, campaignId: c.id })).rejects.toMatchObject({ code: "STEPUP_CONSUMED", status: 409 });
  });

  it("exactly one of two concurrent consumes succeeds", async () => {
    const { c, a } = await authorized();
    const results = await Promise.allSettled([consume(a.id, { userId: campaigner.id, campaignId: c.id }), consume(a.id, { userId: campaigner.id, campaignId: c.id })]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const lost = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(lost.reason).toMatchObject({ code: "STEPUP_CONSUMED" });
  });

  it("a split changed after step-up is refused at consume and the step-up stays unused", async () => {
    const { c, a } = await authorized();
    await expect(consume(a.id, { userId: campaigner.id, campaignId: c.id, splitHash: "other-hash" })).rejects.toMatchObject({ code: "STEPUP_BINDING_MISMATCH" });
    await expect(consume(a.id, { userId: campaigner.id, campaignId: c.id, role: "ADMIN" })).rejects.toMatchObject({ code: "STEPUP_BINDING_MISMATCH" });
    await expect(consume(a.id, { userId: admin.id, campaignId: c.id })).rejects.toMatchObject({ code: "STEPUP_NOT_FOUND" });
    expect((await attemptOf(a.id)).status).toBe("AUTHORIZED");
    await expectNothingApproved(c.id);
  });

  it("an authorization past authorizedUntil is refused", async () => {
    const { c, a } = await authorized();
    await db.stepUpAttempt.update({ where: { id: a.id }, data: { authorizedUntil: new Date(Date.now() - 1000) } });
    await expect(consume(a.id, { userId: campaigner.id, campaignId: c.id })).rejects.toMatchObject({ code: "STEPUP_EXPIRED", status: 410 });
    const { peekStepUp } = await import("@/lib/worldauth/stepup");
    await expect(peekStepUp(a.id, { userId: campaigner.id, campaignId: c.id, splitHash: HASH, role: "CAMPAIGNER" })).rejects.toMatchObject({ code: "STEPUP_EXPIRED" });
  });
});

describe("secrecy", () => {
  it("no error message, attempt failure detail or audit row contains the client secret or a code_verifier", async () => {
    const c = await setup();
    for (const knob of [{ throw: "dependency" as const }, { nonce: "x" }, { acr: "bad" }]) {
      const a = await begin(c);
      fake.next(knob);
      const { completeCallback } = await import("@/lib/worldauth/stepup");
      const r = await completeCallback({ code: "c", state: a.state }, a.userId);
      expect(r.message).not.toContain(FAKE_WORLD_AUTH.clientSecret);
      expect(r.message).not.toContain(a.codeVerifier);
    }
    const attempts = await db.stepUpAttempt.findMany();
    const blob = JSON.stringify([attempts.map((a) => [a.failureCode, a.failureDetail]), await audits(c.id)]);
    expect(blob).not.toContain(FAKE_WORLD_AUTH.clientSecret);
    for (const a of attempts) expect(blob).not.toContain(a.codeVerifier);
  });
});
