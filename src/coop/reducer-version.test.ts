import { describe, expect, it } from "vitest";
import {
  classifyReducerVersion,
  COMPATIBLE_LEGACY_REDUCER_VERSIONS,
  CURRENT_REDUCER_VERSION,
  isReducerVersionCompatible,
} from "./reducer-version";

describe("reducer compatibility", () => {
  it("accepts the current semantic reducer protocol", () => {
    expect(classifyReducerVersion(CURRENT_REDUCER_VERSION)).toBe("current");
    expect(isReducerVersionCompatible(CURRENT_REDUCER_VERSION)).toBe(true);
  });

  it("accepts only reviewed legacy build identities", () => {
    for (const version of COMPATIBLE_LEGACY_REDUCER_VERSIONS) {
      expect(classifyReducerVersion(version)).toBe("legacy");
      expect(isReducerVersionCompatible(version)).toBe(true);
    }
  });

  it("rejects an unreviewed reducer identity", () => {
    expect(classifyReducerVersion("unknown-build")).toBe("incompatible");
    expect(isReducerVersionCompatible("unknown-build")).toBe(false);
  });
});
