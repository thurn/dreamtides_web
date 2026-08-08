import { describe, expect, it } from "vitest";
import auguryJson from "../generated/config/augury-data.json";
import rewardSelectionJson from "../generated/config/reward-selection-data.json";
import { parseAuguryData } from "./augury-data";
import { parseRewardSelectionData } from "./reward-selection-data";

describe("generated game configuration trust boundaries", () => {
  it("accepts the generated Reward Selection and Augury artifacts", () => {
    expect(parseRewardSelectionData(rewardSelectionJson).schemaVersion).toBe(1);
    expect(parseAuguryData(auguryJson).archetypes).toHaveLength(17);
  });

  it("rejects a mismatched fold hash", () => {
    expect(() => parseRewardSelectionData({
      ...rewardSelectionJson,
      foldHash: "0".repeat(64),
    })).toThrow(/malformed reward-selection-data/u);
  });

  it("omits Augury presentation data from the generated runtime artifact", () => {
    expect(auguryJson).not.toHaveProperty("dialogue");
    expect(auguryJson.archetypes.every((entry) => !("copy" in entry))).toBe(true);
  });
});
