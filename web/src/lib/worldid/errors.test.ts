import { describe, expect, it } from "vitest";
import { IDKitErrorCodes } from "@worldcoin/idkit-core";
import { CREDENTIAL_HELP_URL, CREDENTIAL_UNAVAILABLE_MESSAGE, FAIL_OF, failOf } from "./errors";

describe("IDKit error mapping", () => {
  it("keys match the installed IDKitErrorCodes values", () => {
    expect(IDKitErrorCodes.CredentialUnavailable).toBe("credential_unavailable");
    for (const k of ["VerificationRejected", "UserRejected", "Cancelled", "MaxVerificationsReached", "NullifierReplayed", "ConnectionFailed", "Timeout", "RpSignatureExpired"] as const) {
      expect(FAIL_OF[IDKitErrorCodes[k]], k).toBeDefined();
    }
  });
  it("maps CredentialUnavailable to the viewer-only alternative path", () => {
    const f = failOf(IDKitErrorCodes.CredentialUnavailable);
    expect(f.kind).toBe("unavailable");
    expect(f.message).toBe(CREDENTIAL_UNAVAILABLE_MESSAGE);
    expect(f.message).toMatch(/viewer/);
    expect(CREDENTIAL_HELP_URL).toBe("https://docs.world.org/world-id/idkit/credentials");
  });
  it("maps cancel and rejection to cancelled, replay to repeated, timeout to expired", () => {
    expect(failOf(IDKitErrorCodes.Cancelled).kind).toBe("cancelled");
    expect(failOf(IDKitErrorCodes.UserRejected).kind).toBe("cancelled");
    expect(failOf(IDKitErrorCodes.NullifierReplayed).kind).toBe("repeated");
    expect(failOf(IDKitErrorCodes.Timeout).kind).toBe("expired");
  });
  it("falls back to a generic failure for unknown codes", () => {
    expect(failOf("something_new")).toMatchObject({ kind: "failed" });
  });
});
