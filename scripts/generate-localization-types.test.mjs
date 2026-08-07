import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  OUTPUT_PATH,
  buildLocalizationTypesSource,
  generateLocalizationTypes,
  parseMessageContracts,
} from "./generate-localization-types.mjs";

describe("generate-localization-types", () => {
  it("extracts message IDs and required variables from Fluent syntax", () => {
    const contracts = parseMessageContracts(`
title = Journey Complete
score = { $count } { $unit }
`);

    expect(contracts).toEqual([
      { id: "title", variables: [] },
      { id: "score", variables: ["count", "unit"] },
    ]);
  });

  it("emits typed message contracts", () => {
    const generated = buildLocalizationTypesSource([
      { id: "title", variables: [] },
      { id: "score", variables: ["count"] },
    ]);

    expect(generated).toContain('readonly "title": never;');
    expect(generated).toContain('"score",');
    expect(generated).toContain(
      'readonly "score": { readonly "count": FluentVariable };',
    );
  });

  it("rejects invalid Fluent syntax", () => {
    expect(() => parseMessageContracts("broken message")).toThrow(
      "Unable to generate localization types",
    );
  });

  it("rejects duplicate message IDs", () => {
    expect(() => parseMessageContracts("title = One\ntitle = Two\n")).toThrow(
      "Duplicate Fluent message ID: title",
    );
  });

  it("keeps the committed types synchronized with strings.flt", async () => {
    expect(readFileSync(OUTPUT_PATH, "utf8")).toBe(
      await generateLocalizationTypes(),
    );
  });
});
