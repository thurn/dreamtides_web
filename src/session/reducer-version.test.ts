import { describe, expect, it } from "vitest";
import {
  CURRENT_REDUCER_VERSION,
  isReducerVersionCompatible,
} from "./reducer-version";
import { parseReducerVersion } from "../types/reducer-version";

describe("reducer compatibility", () => {
  it("accepts the current semantic reducer protocol", () => {
    expect(isReducerVersionCompatible(CURRENT_REDUCER_VERSION)).toBe(true);
  });

  it("rejects a preceding semantic reducer protocol", () => {
    expect(isReducerVersionCompatible("dreamtides-coop-v29")).toBe(false);
  });

  it("rejects an unreviewed reducer identity", () => {
    const unknownBuild = parseReducerVersion("unknown-build");
    expect(isReducerVersionCompatible(unknownBuild)).toBe(false);
  });
});
