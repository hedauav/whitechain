import {
  ConsensusAggregationByFields,
  cre,
  bytesToHex,
  decodeJson,
  getNetwork,
  hexToBase64,
  identical,
  json,
  ok,
  Runner,
  TxStatus,
  type HTTPPayload,
  type HTTPSendRequester,
  type Runtime,
} from "@chainlink/cre-sdk";
import { EVM_PB } from "@chainlink/cre-sdk/pb";
import { keccak256, stringToHex } from "viem";
import { configSchema, httpTriggerConfig, type Config } from "./config";
import { assertFresh, chunkRows, encodeReport, normalizeSnapshotWithStats, parseFrozenFeed, type SnapshotRow } from "./snapshot";

/** What every node returns; each field must be IDENTICAL across nodes (frozen backend snapshot). */
type NodeView = { day: string; hash: string; rows: string; dropped: number };

/**
 * Runs on EACH node: fetch the frozen snapshot, validate + canonicalise rows, and return {day, hash, rows}
 * where hash = keccak256(canonical rows). The DON requires all three fields to be identical, so a node that sees
 * different bytes (e.g. a snapshot that changed mid-day) breaks consensus instead of being signed.
 */
const fetchSnapshot = (sendRequester: HTTPSendRequester, config: Config, day: string): NodeView => {
  const qs = day ? `?day=${encodeURIComponent(day)}` : "";
  const res = sendRequester.sendRequest({ url: `${config.backendUrl}${config.feedPath}${qs}`, method: "GET" }).result();
  if (!ok(res)) throw new Error(`snapshot request failed: HTTP ${res.statusCode}`);
  const feed = parseFrozenFeed(json(res));
  const { json: rows, dropped } = normalizeSnapshotWithStats(feed.rows);
  return { day: feed.day, hash: keccak256(stringToHex(rows)), rows, dropped };
};

const settle = (runtime: Runtime<Config>, requestedDay: string): string => {
  const cfg = runtime.config;

  // 1. Read + reach consensus on the frozen snapshot
  const http = new cre.capabilities.HTTPClient();
  const agreed = http
    .sendRequest(
      runtime,
      fetchSnapshot,
      ConsensusAggregationByFields<NodeView>({ day: identical, hash: identical, rows: identical, dropped: identical }),
    )(cfg, requestedDay)
    .result();
  runtime.log(`snapshot agreed: day=${agreed.day} hash=${agreed.hash}`);
  if (agreed.dropped > 0) runtime.log(`WARNING: dropped ${agreed.dropped} invalid snapshot row(s) during normalisation`);

  // 2. Staleness guard (DON time) + empty feed
  assertFresh(agreed.day, runtime.now(), cfg.maxStalenessDays);
  const rows = JSON.parse(agreed.rows) as SnapshotRow[];
  runtime.log(`snapshot rows: ${rows.length}`);
  if (rows.length === 0) return `no-op: empty snapshot for ${agreed.day}`;

  // 3. Sign + deliver in batches: report -> forwarder -> ClippoReportReceiver.onReport -> ClippoEscrow.reportViews
  const network = getNetwork({
    chainFamily: "evm",
    chainSelectorName: cfg.evm.chainSelectorName,
    isTestnet: cfg.evm.isTestnet,
  });
  if (!network) throw new Error(`unknown network ${cfg.evm.chainSelectorName}`);
  const evm = new cre.capabilities.EVMClient(network.chainSelector.selector);

  const batches = chunkRows(rows, cfg.maxRowsPerReport);
  const txs: string[] = [];
  batches.forEach((batch, i) => {
    const report = runtime
      .report({
        encodedPayload: hexToBase64(encodeReport(batch)),
        encoderName: "evm",
        signingAlgo: "ecdsa",
        hashingAlgo: "keccak256",
      })
      .result();

    const resp = evm
      .writeReport(runtime, {
        receiver: cfg.evm.receiverAddress,
        report,
        gasConfig: { gasLimit: cfg.evm.gasLimit },
      })
      .result();

    // TODO(ItemFailed): ClippoReportReceiver swallows per-item reverts and emits ItemFailed, so a SUCCESS write may
    // still have credited nothing for some/all rows. WriteReportReply (cre-sdk) exposes no receipt logs, so this cannot
    // be detected here; a read-back of ClippoEscrow state (or an off-workflow ItemFailed log scan) is needed.
    if (resp.txStatus !== TxStatus.SUCCESS) {
      throw new Error(`writeReport batch ${i + 1}/${batches.length} failed: ${resp.errorMessage ?? resp.txStatus}`);
    }
    if (resp.receiverContractExecutionStatus === EVM_PB.ReceiverContractExecutionStatus.REVERTED) {
      throw new Error(`onReport reverted for batch ${i + 1}/${batches.length}`);
    }
    const txHash = resp.txHash ? bytesToHex(resp.txHash) : "n/a";
    runtime.log(`batch ${i + 1}/${batches.length}: ${batch.length} rows, tx ${txHash}`);
    txs.push(txHash);
  });
  return `settled day=${agreed.day} rows=${rows.length} reports=${txs.length} txs=${txs.join(",")}`;
};

// Trigger 0: daily cron (default: yesterday's frozen snapshot).
const onCron = (runtime: Runtime<Config>): string => settle(runtime, "");

// Trigger 1: HTTP, for on-demand/manual settlement. Optional body {"day":"YYYY-MM-DD"} selects an older frozen day.
const onHttp = (runtime: Runtime<Config>, payload: HTTPPayload): string => {
  let day = "";
  if (payload.input && payload.input.length > 0) {
    const body = decodeJson(payload.input) as { day?: unknown };
    if (body.day !== undefined) {
      if (typeof body.day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.day)) throw new Error("input.day must be YYYY-MM-DD");
      day = body.day;
    }
  }
  return settle(runtime, day);
};

const initWorkflow = (config: Config) => {
  const cron = new cre.capabilities.CronCapability();
  const httpTrigger = new cre.capabilities.HTTPCapability();
  return [
    cre.handler(cron.trigger({ schedule: config.schedule }), onCron),
    // authorizedKeys come from config.httpAuthorizedKeys; production sets requireHttpAuthorizedKeys so startup fails if empty.
    cre.handler(httpTrigger.trigger(httpTriggerConfig(config)), onHttp),
  ];
};

export async function main() {
  const runner = await Runner.newRunner<Config>({ configSchema });
  await runner.run(initWorkflow);
}

main();
