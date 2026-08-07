import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "smol-toml";
import { describe, expect, it } from "vitest";
import { compileRewardSelectionData } from "./reward-selection-data.mjs";

const source = () => parse(readFileSync(
  resolve(import.meta.dirname, "../data/reward_selection.toml"),
  "utf8",
));

describe("compileRewardSelectionData", () => {
  it("compiles deterministic, hash-pinned tuning from the authored TOML", () => {
    const first = compileRewardSelectionData(source());
    const second = compileRewardSelectionData(source());
    expect(first).toEqual(second);
    expect(first.foldHash).toBe(first.contentHash);
    expect(first.contentHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(first.tuning.strongBlend.fit + first.tuning.strongBlend.quality).toBe(1);
  });

  it("rejects unknown designer keys instead of silently ignoring typos", () => {
    const invalid = source();
    invalid.eligibility["minimum-deck-for-fit"] = 6;
    expect(() => compileRewardSelectionData(invalid)).toThrow(/unknown key/u);
  });

  it("rejects cost-band gaps", () => {
    const invalid = source();
    invalid["cost-bands"]["big-minimum"] += 1;
    expect(() => compileRewardSelectionData(invalid)).toThrow(/contiguous/u);
  });
});
