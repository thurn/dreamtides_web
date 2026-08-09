import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "smol-toml";
import { describe, expect, it } from "vitest";
import { compileAuguryData } from "./augury-data.mjs";

const source = () => parse(readFileSync(
  resolve(import.meta.dirname, "../data/augury.toml"),
  "utf8",
));

describe("compileAuguryData", () => {
  it("compiles every registered archetype", () => {
    const result = compileAuguryData(source());
    expect(result.archetypes).toHaveLength(13);
    expect(result.archetypes.every((entry) => entry.enabled)).toBe(true);
    expect(result.foldHash).toBe(result.contentHash);
    expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/u);
    expect(
      result.archetypes
        .filter(({ id }) => id === "dreamsign" || id === "add_site")
        .every(({ presentation }) => presentation.backgroundArt?.source === "card"),
    ).toBe(true);
  });

  it("requires background art only for symbolic full-art offers", () => {
    const missing = source();
    delete missing.archetype.find(({ id }) => id === "dreamsign").presentation["background-art-image-number"];
    expect(() => compileAuguryData(missing)).toThrow(/background-art-image-number/u);

    const unsupported = source();
    unsupported.archetype.find(({ id }) => id === "purge").presentation["background-art-image-number"] = 123;
    expect(() => compileAuguryData(unsupported)).toThrow(/unknown key/u);
  });

  it("compiles a reordered subset spanning two families", () => {
    const configured = source();
    configured.archetype = [configured.archetype[9], configured.archetype[0]];
    const result = compileAuguryData(configured);
    expect(result.archetypes.map(({ id }) => id)).toEqual([
      "purge",
      "fit_card_grant",
    ]);
  });

  it("rejects removed presentation fields", () => {
    const invalid = source();
    invalid.archetype[0].copy = { title: "Dead copy" };
    expect(() => compileAuguryData(invalid)).toThrow(/copy.*unknown key/u);
  });

  it("requires authored archetype names and presentation copy", () => {
    const missingName = source();
    delete missingName.archetype[0].name;
    expect(() => compileAuguryData(missingName)).toThrow(/missing key name/u);

    const emptySubtitle = source();
    emptySubtitle.archetype[0].presentation.subtitle.text = "  ";
    expect(() => compileAuguryData(emptySubtitle)).toThrow(/subtitle.*non-empty string/u);

    const unknownSlot = source();
    unknownSlot.archetype[0].presentation.subtitle.text = "Gain {unknown}";
    expect(() => compileAuguryData(unknownSlot)).toThrow(/unknown presentation slot/u);

    const unavailableSlot = source();
    unavailableSlot.archetype[1].presentation.subtitle.text = "Gain {cardName}";
    expect(() => compileAuguryData(unavailableSlot)).toThrow(/slot \{cardName\}.*unavailable/u);

    const wrongVariant = source();
    wrongVariant.archetype[0].presentation.subtitle = {
      kind: "count",
      one: "One",
      other: "Other",
    };
    expect(() => compileAuguryData(wrongVariant)).toThrow(/subtitle.kind.*must be text/u);
  });

  it("rejects policies that the archetype mechanic cannot execute", () => {
    const invalid = source();
    invalid.archetype.find(({ id }) => id === "fit_card_grant")["selection-policy-id"] = "purge-misfit";
    expect(() => compileAuguryData(invalid)).toThrow(/selection-policy-id.*unsupported/u);
  });

  it("rejects unsupported and out-of-range quantity controls", () => {
    const unknown = source();
    unknown.archetype.find(({ id }) => id === "fit_card_grant").quantities["target-count"] = 2;
    expect(() => compileAuguryData(unknown)).toThrow(/target-count.*unknown key/u);

    const invalidSize = source();
    invalidSize.archetype.find(({ id }) => id === "fit_card_draft").quantities["chooser-size"] = 1;
    expect(() => compileAuguryData(invalidSize)).toThrow(/chooser-size.*\[2, 4\]/u);
  });

  it("requires enabled archetypes to span both offer slots", () => {
    const invalid = source();
    for (const archetype of invalid.archetype) {
      archetype.enabled = archetype.id === "fit_card_grant" || archetype.id === "strong_card";
    }
    expect(() => compileAuguryData(invalid)).toThrow(/at least two families/u);
  });
});
