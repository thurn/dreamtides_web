// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseProviderIdentity } from "./provider-identity.mjs";

describe("negotiated provider identity", () => {
  const supported = { sessionId: "synthetic-supported", protocolVersion: "2031-02-03", url: "http://localhost:8931/mcp" };
  it.each([
    { sessionId: undefined }, { sessionId: "" }, { sessionId: "unbound session" }, { sessionId: "invalid\nheader" },
    { protocolVersion: undefined }, { protocolVersion: "unsupported" }, { url: "file:///synthetic" },
    { url: "http://user:password@localhost:8931/mcp" }, { url: "http://localhost:8931/mcp#fragment" },
  ])("rejects unsupported metadata %j", (invalid) => {
    const identity = { ...supported, ...invalid };
    expect(parseProviderIdentity(identity.sessionId, identity.url, identity.protocolVersion)).toBeNull();
  });
  it("accepts a negotiated identity with a date-form protocol version", () => {
    expect(parseProviderIdentity(supported.sessionId, supported.url, supported.protocolVersion)).toEqual(supported);
  });
});
