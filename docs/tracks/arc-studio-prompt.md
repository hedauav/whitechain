# Arc Studio prompt and import kit for the Clippo escrow

Status: Arc Studio has NOT been used yet. No Studio project exists and there is no Studio project URL. Every Arc prize requires one, including the bounty entered, "Best Smart Contracts with Advanced Stablecoin Logic, In Arc Studio" ($3,000). `contracts/src/ClippoEscrow.sol` was written and tested in Foundry, not in Studio. Nothing below has been run.

Plan: create the Studio project, have Studio generate an escrow from the prompt, then replace it with Clippo's reviewed contract, compile and test it, and record the real Studio URL. Studio deploys to Arc testnet only (https://docs.arc.io/ai/arc-studio.md). The current contract is not deployed anywhere. Two older-design escrows are live on Arc testnet (see `docs/tracks/ARC.md`).

## Option A, web (https://studio.arc.io/)
1. New project, paste the prompt below.
2. When Studio produces its contract, paste `contracts/src/ClippoEscrow.sol` (and `contracts/src/MockUSDC.sol` for the sandbox) and ask: "Replace your escrow with this contract, compile it, and run these tests." Paste `contracts/test/ClippoEscrow.t.sol` and `contracts/test/HumanHelper.sol` if Studio runs Foundry tests (UNVERIFIED, nobody has tried); otherwise ask it to exercise the flows in the sandbox with real testnet transactions.
3. Deploy to Arc testnet from Studio, record the Studio project URL and address. Push to GitHub from Studio if wanted. Deploying from Studio needs a `humanAttestor` address (constructor argument, cannot be changed later).

## Option B, CLI
```bash
npm install -g @circle-fin/arc-studio-cli   # Node 20+
arc-studio login
arc-studio run "<paste the prompt below>" \
  --file contracts/src/ClippoEscrow.sol --file contracts/test/ClippoEscrow.t.sol --file contracts/test/HumanHelper.sol --output json
arc-studio deployments
arc-studio pull --out ./onchain --paths "contracts/**"
```

## Prompt
The prompt describes the current contract (`contracts/src/ClippoEscrow.sol` at commit 498f649 and later), not the old design.
```text
Build a USDC escrow for a clipping-campaign marketplace on Arc testnet.

Token: USDC at 0x3600000000000000000000000000000000000000. Use ONLY the ERC-20 interface, which has 6 decimals (the native gas balance has 18; never mix them). The constructor is constructor(usdc, treasury, owner, humanAttestor) and must revert if decimals() != 6 or any address is zero. Use SafeERC20, ReentrancyGuard, Ownable and EIP-712 (domain "ClippoEscrow", version "1"); creators pull payouts.

Roles: owner, admins (owner-managed; the owner is an admin), campaigner (funds a campaign), creators (earn), a reportAdapter (the only caller of reportViews; the owner can set it once and never change it), a treasury, and an immutable humanAttestor (a backend key that signs World ID results; it cannot move funds and cannot be replaced). No privileged key may choose who gets paid. Admins can approve or reject campaigns and settle disputes, and can never receive creator funds.

World ID humans: registerHuman(wallet, proof) links a wallet to a unique human using an EIP-712 HumanRegistration(wallet, human, expiresAt) signature from the humanAttestor. Anyone may relay it. One human links one wallet and one wallet one human. Only linked wallets can be credited (NotHuman otherwise).

Lifecycle: Funded -> Approved (admin) -> Closed, or Funded -> Rejected (admin rejectCampaign refunds the full gross including fee). If no admin approves before the deadline, the campaigner calls reclaimUnapproved for a full refund. createCampaign(mode, ratePer1kViews, poolAmount, deadline, requireAdminApproval, metadataURI) pulls poolAmount; the campaigner fee (bps of poolAmount) is held in escrow and only accrues to the treasury on approval. Nothing can be credited or claimed before approval.

Three modes:
1. PerView: reportViews(id, creator, cumulativeViews), callable only by the reportAdapter (Chainlink CRE), credits (delta * ratePer1kViews / 1000), capped at the remaining pool, ignores non-increasing reports, accepted until deadline + grace. Credits are kept as tranches and become claimable only after the campaign's retention period (default 7 days, max 30).
2. HumanSplit: approveSplit(id, creators[], amounts[], proof) by the campaigner, or by an admin if requireAdminApproval. Each call needs a one-time EIP-712 HumanApproval(campaignId, kind, subject, approver, human, expiresAt) signature from the humanAttestor, bound to the exact split hash and to msg.sender. Sum <= remaining pool. If requireAdminApproval, the campaigner and an admin must submit the identical split with two different humans (SameHuman otherwise); a different split resets approvals. Accepted until deadline + grace.
3. PoolShare: reportViews from the reportAdapter sets each creator's weight to their cumulative views. closeCampaign splits the whole pool pro rata by weight, rounding dust is refunded to the campaigner, no weights means a full refund. Claims open after close. There is no setWeights; weights come only from reports.

Disputes (PerView only): the campaigner calls disputeCredits(id, creator) on that creator's tranches still inside the retention window. They cannot be claimed while the dispute is open. An admin calls resolveDispute(id, creator, upheld). Upheld: the disputed credits go back to the pool (or straight to the campaigner if the campaign is closed). Not upheld, or not settled within one retention period after the dispute was opened: they release on the normal schedule. A tranche can be disputed only once.

Fees: two-sided, in bps, owner-set, hard cap 50 bps each (default 25/25), snapshotted per campaign. The creator fee is deducted from the gross at claim. withdrawFees() sends accrued fees to the treasury.

Claims: claim(id) pays msg.sender. claimFor(id, creator) lets anyone trigger the payout, but the money can only go to that creator.

Close and refunds: closeCampaign can be called by anyone after deadline + grace period (default 1 day, max 7). It returns the unallocated pool to the campaigner. Creator credits stay claimable.

High-value campaigns (pool above an owner-set threshold, default 1000 USDC) must use approveCampaign(id, proof) with a humanAttestor-signed approval, recorded on-chain with a HumanAttested event. Smaller campaigns use approveCampaign(id).

Add events for every state change, custom errors, and views getCampaign, claimable, pendingTotal, tranches, remainingPool, weightCreators. Write Foundry tests covering all three modes, fee math at 0 and 50 bps, rejection refund, deadline refund, pool cap, reentrancy, access control, World ID registration and approval replay, disputes, claimFor, and a fuzz test that total paid out never exceeds funded.
```

## Local reference
Final Solidity: `contracts/src/ClippoEscrow.sol`. Tests: `contracts/test/ClippoEscrow.t.sol`. ABI: `contracts/abi/ClippoEscrow.json`. Run `cd contracts && forge test`.
