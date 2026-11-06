# Arc track: Best Smart Contracts with Advanced Stablecoin Logic, In Arc Studio

Researched 2026-10-28; requirements verified against the live Mumbai page 2026-11-06. Prize $3,000. Status key: DONE (in repo), TODO (not done), UNVERIFIED.

## Sources
- Arc docs index: https://docs.arc.io/llms.txt
- Connect to Arc: https://docs.arc.io/integrate/connect-to-arc and https://docs.arc.io/arc/references/rpc-endpoints.md
- Contract addresses: https://docs.arc.io/arc/references/contract-addresses
- Arc Studio: https://docs.arc.io/ai/arc-studio.md and CLI https://docs.arc.io/ai/arc-studio-cli.md
- ETHGlobal Mumbai Arc prize (verified 2026-11-06): https://ethglobal.com/events/mumbai/prizes/arc
- Connect to Arc (RPC host): https://docs.arc.io/arc/references/connect-to-arc.md
- Arc winners blog (judging wording): https://www.arc.io/blog/meet-the-arc-track-winners-from-ethglobal-cannes-hackathon-and-what-we-learned

## Network facts (official docs.arc.io)
| Item | Value |
| --- | --- |
| Chain ID | 5042002 |
| Primary RPC | https://rpc.testnet.arc.io (official docs; the older ".network" host appears only in third-party material and is stale). Set ARC_RPC_URL to override. Alternates: rpc.blockdaemon / rpc.drpc / rpc.quicknode .testnet.arc.io |
| Explorer | https://explorer.testnet.arc.io (older: testnet.arcscan.app). Gas tracker at /gas-tracker |
| Faucet | https://faucet.circle.com (Studio also has a built-in faucet). Third-party report: 20 USDC per 2 h per address, UNVERIFIED |
| USDC | 0x3600000000000000000000000000000000000000 (testnet and mainnet) |
| EURC (testnet) | 0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a |
| Decimals | Native gas balance 18 decimals; ERC-20 interface 6 decimals. Same balance, show one USDC row. Use only the ERC-20 interface (6) for transfers and balances |
| CCTP | domain 26; TokenMessengerV2 0x8FE6B999Dc680CcFDD5Bf7EB0974218be2542DAA; MessageTransmitterV2 0xE737e5cEBEEBa77EFE34D4aa090756590b1CE275 |
| Gateway | GatewayWallet 0x0077777d7EBA4688BDeF3E311b846F25870A19B9; GatewayMinter 0x0022222ABE238Cc2C7Bb1f21003F0a260052475B |

Gas semantics: fees are paid in USDC, so a campaigner or creator needs only USDC. One faucet drop covers both campaign funding and gas.

## Arc Studio
- Web app: https://studio.arc.io/ (docs describe no login flow; expect an account or wallet sign-in, UNVERIFIED).
- Prompt to full-stack app: plans, generates, compiles and deploys Solidity to Arc testnet only (never mainnet), live sandbox with real testnet transactions, chat refinement, built-in faucet, wallet connect.
- Export: "Push to GitHub". CLI `@circle-fin/arc-studio-cli` (`npm i -g`, Node 20+): `arc-studio login`, `arc-studio run "<prompt>" --file src/X.sol` (uploads existing code as context; this is the import path), `arc-studio pull --out ./onchain --paths "contracts/**"` (export), `arc-studio deployments`, `arc-studio clone <public github repo>`.
- No documented "import project" button; the supported import is `--file` context or `clone`. Web UI import UNVERIFIED.
- Studio warns generated code must be reviewed before use.

## Prize requirements checklist (VERIFIED 2026-11-06 against the live Mumbai page)

Source: https://ethglobal.com/events/mumbai/prizes/arc . Prize title (exact): "Best Smart Contracts with Advanced Stablecoin Logic, In Arc Studio" ($3,000).

> Every Arc prize requires using Arc Studio as the starting point. Please state which bounty you're submitting for in your submission.

> Write, test, and deploy smart contracts in Arc Studio that demonstrate advanced programmable logic using USDC or EURC, such as conditional flows, onchain automation, or multi-step settlement. Then connect them to a web or mobile app, new or existing, without leaving Studio.

The page lists "Conditional escrow with onchain dispute and automatic release" as an example and gives a bonus for reusable contracts. Qualification (quoted):
- "Built in Arc Studio. Include a shareable Arc Studio project URL that judges can open, and show Studio in your demo."
- "Functional MVP and diagram: working frontend and backend plus an architecture diagram."
- "Video demonstration + presentation: ... effective use of Arc Studio and Circle's developer tools..."
- "Link to GitHub/Replit repo"

### Arc Studio is the required starting point (checklist, all TODO, none done)
- [ ] Create the project at https://studio.arc.io (human login).
- [ ] Get the escrow contracts into Studio via one of the two import options below, then have Studio write/iterate/test/deploy them.
- [ ] Deploy to Arc testnet from Studio (Studio deploys to testnet only).
- [ ] Copy the shareable Studio project URL into `docs/SUBMISSION_CHECKLIST.md`.
- [ ] State the bounty name exactly in the submission: "Best Smart Contracts with Advanced Stablecoin Logic, In Arc Studio".
- [ ] Show Studio on screen in the demo video.
- [ ] Architecture diagram (export from `docs/ARCHITECTURE.md`), repo link, video + presentation naming Studio and Circle tools.

| # | Requirement | Status |
| --- | --- | --- |
| 1 | Advanced USDC/EURC logic (conditional escrow, dispute, auto release) | Code DONE: ClippoEscrow (three modes, fee split, refunds, retention, attestations); not yet written/tested/deployed in Studio (TODO) |
| 2 | Built in Arc Studio, shareable Studio project URL | TODO (human) |
| 3 | Studio shown in demo | TODO |
| 4 | Functional MVP: working frontend and backend | Web and API exist; on-chain flow works once deployed and ESCROW_ADDRESS set (TODO) |
| 5 | Architecture diagram | TODO: draw from ARCHITECTURE.md |
| 6 | Video + presentation incl. Studio and Circle tools | TODO |
| 7 | GitHub/Replit repo link | TODO: push repo (public if using `arc-studio clone`) |
| 8 | State bounty name | TODO |

Superseded: the earlier table, inferred from the Cannes 2026 page and PRD (including "CCTP/Gateway/Forwarder named in track text" and the judging-blog criteria), is replaced by the verified list above. CCTP/Gateway remains a doc-only path below, not built.

## Arc Studio plan (all TODO, nothing below has been run)
Judges need a shareable Studio project URL and the prize says contracts are written, tested and deployed in Studio, so:
1. Install the CLI (Node 20+): `npm install -g @circle-fin/arc-studio-cli`; `arc-studio login` (browser device link, human action).
2. Import option A, upload files as editable round trip: `arc-studio run "Review, test and deploy this conditional escrow on Arc testnet" --file src/ClippoEscrow.sol:contracts/ClippoEscrow.sol` (Solidity under `contracts/`, web code under `src/`). Limits: 100 files, 1 MB each, 10 MB total, prompt max 10,000 chars, `.env` refused.
3. Import option B: `arc-studio clone <owner>/<repo>` clones a PUBLIC GitHub repo server-side (run one turn first so a live sandbox exists).
4. Have Studio iterate, test and deploy the escrow to Arc testnet; check with `arc-studio apps --json`, `arc-studio deployments`, `arc-studio open`; export with `arc-studio pull`.
5. Record the Studio project URL; keep the repo as the source of truth and re-sync.
6. Fund the deployer from https://faucet.circle.com (no account; 20 USDC per 2 hours per address per chain).
7. Show Studio in the demo video and say which bounty is entered.

## Arc-specific gotchas (official Arc docs, fetched 2026-11-06)
- USDC is the gas token. Minimum base fee is 20 Gwei, so transactions must set `maxFeePerGas >= 20 Gwei`.
- Web client fee handling: `web/src/lib/chain/client.ts` and `signer.ts` call viem `writeContract` with no explicit fee params, so viem derives fees from the node (EIP-1559 estimate: roughly 2 x baseFee plus priority fee, which should clear a 20 Gwei base fee). This was NOT tested against Arc; if a transaction is rejected as underpriced, add `maxFeePerGas: 20_000_000_000n` (or higher) to the write calls. Browser wallets estimate on their own.
- Sending to `address(0)` reverts on Arc.
- Do not mix 6-decimal (ERC-20 USDC) and 18-decimal (native gas balance) amounts.
- Arc docs recommend `arc-forge` / `arc-cast` (Arc Foundry fork; install: https://docs.arc.io/arc/tutorials/install-arc-foundry.md). Docs deploy example: `arc-forge create src/X.sol:X --rpc-url $ARC_TESTNET_RPC_URL --private-key $PRIVATE_KEY --broadcast`. Plain `forge` may work for tests; deployment should use `arc-forge` per Arc docs. Not run here.
## Deploy and verify (exact commands)
Prereqs: testnet-only deployer key funded at https://faucet.circle.com (USDC is gas). Required env (exact names Deploy.s.sol reads): ADMIN_ADDRESS, UPDATER_ADDRESS, FORWARDER_ADDRESS, plus EXPECTED_WORKFLOW_OWNER unless INSECURE_SKIP_WORKFLOW_CHECK=true (the script lists missing ones up front). FORWARDER_ADDRESS is the (Chainlink forwarder for Arc testnet from CRE docs, UNVERIFIED; any address works for a non-CRE demo).

```bash
export PATH="$HOME/.foundry/bin:$PATH"
cd contracts && forge build && forge test
export ADMIN_ADDRESS=0x... UPDATER_ADDRESS=0x... FORWARDER_ADDRESS=0x...
export EXPECTED_WORKFLOW_OWNER=0x...   # CRE workflow owner; REQUIRED (receiver fails closed). Optional: EXPECTED_WORKFLOW_ID (bytes32), EXPECTED_WORKFLOW_NAME (bytes10)
# simulation-only alternative (mock forwarder passes no metadata): export INSECURE_SKIP_WORKFLOW_CHECK=true   # NEVER for production
# optional: TREASURY_ADDRESS CAMPAIGNER_FEE_BPS=25 CREATOR_FEE_BPS=25 (max 50 each) RETENTION_SECONDS HIGH_VALUE_THRESHOLD
export PRIVATE_KEY=0x...   # testnet only (deploy-arc.mjs also accepts DEPLOYER_PRIVATE_KEY); forge reads it via --private-key, Deploy.s.sol does not
forge script script/Deploy.s.sol:Deploy --rpc-url https://rpc.testnet.arc.io \
  --private-key $PRIVATE_KEY --broadcast
# verify (explorer assumed Blockscout-style, UNVERIFIED; fall back to the explorer UI)
forge verify-contract <ESCROW_ADDR> src/ClippoEscrow.sol:ClippoEscrow --chain-id 5042002 \
  --verifier blockscout --verifier-url https://explorer.testnet.arc.io/api/ \
  --constructor-args $(cast abi-encode "constructor(address,address,address)" 0x3600000000000000000000000000000000000000 $TREASURY_ADDRESS <DEPLOYER>)
```
One-shot from repo root, which also writes config:
```bash
node scripts/deploy-arc.mjs --deploy     # forge script --broadcast --verify, then writes env
node scripts/deploy-arc.mjs              # only (re)write env from the last broadcast log
node scripts/deploy-arc.mjs --dry        # print only
```
It upserts ESCROW_ADDRESS, ESCROW_DEPLOY_BLOCK, REFERRAL_ADDRESS, PROFILE_ADDRESS, REPORT_RECEIVER_ADDRESS, ARC_RPC_URL, ARC_CHAIN_ID in web/.env.local; sets `evm.receiverAddress` in cre/workflows/clippo-settlement/config.staging.json; replaces the placeholder RPC in cre/project.yaml. Deploy.s.sol reverts off chain 5042002 unless ALLOW_ANY_CHAIN=true.

## CCTP deposit path (doc only)
A campaigner holding USDC on another chain bridges to Arc with CCTP V2 (domain 26) or App Kit Bridge (https://docs.arc.io/app-kit/bridge.md), using the Forwarding Service (https://docs.arc.io/app-kit/tutorials/bridge/use-forwarding-service.md) to mint straight to their Arc address, then approves and calls `createCampaign`. A hook contract that calls createCampaign on mint is a later add-on.

## Unverified
Judging weights (page lists none beyond qualification); Studio login and web import UI; blockscout verifier path; faucet cap; Chainlink forwarder address on Arc; Circle USDC blacklisting could make claim/refund revert for a blocked address.
