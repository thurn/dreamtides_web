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

  it("requires rooms to use the current descriptor protocol", () => {
    expect(COMPATIBLE_LEGACY_REDUCER_VERSIONS.size).toBe(0);
    expect(classifyReducerVersion("dreamtides-coop-v22")).toBe("incompatible");
    expect(isReducerVersionCompatible("dreamtides-coop-v22")).toBe(false);
  });

  it("rejects an unreviewed reducer identity", () => {
    expect(classifyReducerVersion("unknown-build")).toBe("incompatible");
    expect(isReducerVersionCompatible("unknown-build")).toBe(false);
  });
});
