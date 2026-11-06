import { z } from "zod";

const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS_RE = /^0x0{40}$/i;

export const configSchema = z.object({
  // 6-field cron (seconds first). Daily at 00:30 UTC by default (after the backend freeze job).
  schedule: z.string(),
  // Clippo backend base URL; the workflow calls GET {backendUrl}{feedPath}[?day=YYYY-MM-DD]
  backendUrl: z.string().url(),
  // Frozen daily feed: { day, hash, rows }. Default /api/snapshots/daily.
  feedPath: z.string(),
  // Reject a snapshot whose day is older than this many UTC days (staleness / replay of an old feed).
  maxStalenessDays: z.number().int().min(0),
  // Rows per signed report (keeps each onReport under the gas budget).
  maxRowsPerReport: z.number().int().min(1),
  // EVM addresses allowed to trigger the DEPLOYED HTTP handler (cre-sdk http v1alpha AuthorizedKey).
  httpAuthorizedKeys: z
    .array(
      z.object({
        type: z.literal("KEY_TYPE_ECDSA_EVM"),
        publicKey: z.string().regex(ADDRESS_RE, "publicKey must be a 0x-prefixed EVM address"),
      }),
    )
    .optional(),
  // When true (production), startup fails unless httpAuthorizedKeys is non-empty, so the trigger is never left open.
  requireHttpAuthorizedKeys: z.boolean().optional(),
  evm: z.object({
    chainSelectorName: z.string(), // e.g. "arc-testnet"
    isTestnet: z.boolean(),
    // ClippoReportReceiver (the reporting adapter registered as ClippoEscrow.reportAdapter)
    receiverAddress: z
      .string()
      .regex(ADDRESS_RE, "receiverAddress must be a 0x-prefixed 20-byte address")
      .refine((a) => !ZERO_ADDRESS_RE.test(a), "receiverAddress is the zero address: set the deployed ClippoReportReceiver address"),
    gasLimit: z.string(), // per report
  }),
});

export type Config = z.infer<typeof configSchema>;

/** HTTP trigger config. Throws when keys are required but absent (never leave the deployed trigger open). */
export function httpTriggerConfig(config: Config): { authorizedKeys?: { type: "KEY_TYPE_ECDSA_EVM"; publicKey: string }[] } {
  const keys = config.httpAuthorizedKeys ?? [];
  if (config.requireHttpAuthorizedKeys && keys.length === 0) {
    throw new Error("httpAuthorizedKeys is required (requireHttpAuthorizedKeys=true) but none are configured; refusing to leave the HTTP trigger open");
  }
  return keys.length > 0 ? { authorizedKeys: keys } : {};
}
