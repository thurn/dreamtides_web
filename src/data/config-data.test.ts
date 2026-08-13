import { describe, expect, it } from "vitest";
import auguryJson from "../generated/config/augury-data.json";
import sitesJson from "../../public/sites-data.json";
import tidesJson from "../../public/tides4-data.json";
import { parseAuguryData } from "./augury-data";
import { buildRewardSelectionData } from "./reward-selection-data";
import { parseSitesData } from "./sites-data";
import { validateTides4Decks } from "../draft/pool/tides4-io";

describe("generated game configuration trust boundaries", () => {
  it("assembles selection tuning from the generated Tides, Sites, and Augury artifacts", () => {
    const augury = parseAuguryData(auguryJson);
    const selection = buildRewardSelectionData({
      tides: validateTides4Decks(tidesJson),
      augury,
      sites: parseSitesData(sitesJson),
    });
    expect(selection.schemaVersion).toBe(2);
    expect(selection.tuning.bandFraction).toBe(tidesJson.selection.bandFraction);
    expect(selection.tuning.minDeckForPurge).toBe(sitesJson.selection.minDeckForPurge);
    expect(selection.tuning.costBands).toEqual(augury.selection.costBands);
    expect(parseAuguryData(auguryJson).archetypes).toHaveLength(13);
  });

  it("keeps Augury authoring metadata and player presentation", () => {
    expect(auguryJson).not.toHaveProperty("dialogue");
    expect(auguryJson.archetypes.every((entry) => !("copy" in entry))).toBe(true);
    expect(auguryJson.archetypes.every((entry) =>
      entry.name.trim() !== "" && entry.presentation.headline.kind !== ""
    )).toBe(true);
  });

  it("rejects missing Augury authoring metadata at the runtime boundary", () => {
    const malformed = structuredClone(auguryJson) as unknown as {
      archetypes: Array<{ presentation: unknown }>;
    };
    malformed.archetypes[0].presentation = {
      headline: { kind: "text", text: "" },
      subtitle: { kind: "text", text: "Fixture" },
    };
    expect(() => parseAuguryData(malformed)).toThrow(/malformed augury-data/u);
  });
});
