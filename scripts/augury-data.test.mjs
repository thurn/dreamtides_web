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
  it("compiles every archetype, including TOML-disabled builders", () => {
    const result = compileAuguryData(source());
    expect(result.archetypes).toHaveLength(17);
    expect(result.archetypes.filter((entry) => entry.enabled)).toHaveLength(13);
    expect(result.foldHash).toBe(result.contentHash);
    expect(result.contentHash).toMatch(/^[0-9a-f]{64}$/u);
  });

  it("rejects removed presentation fields", () => {
    const invalid = source();
    invalid.archetype[0].copy = { title: "Dead copy" };
    expect(() => compileAuguryData(invalid)).toThrow(/copy.*unknown key/u);
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
