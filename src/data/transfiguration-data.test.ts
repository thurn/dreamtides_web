import { describe, expect, it } from "vitest";
import { transfigurationFixture } from "../testing/transfiguration-fixture";
import {
  parseTransfigurationData,
  transfigurationForm,
} from "./transfiguration-data";

interface MutableCatalog {
  site: { formOrder: unknown[] };
  forms: Array<Record<string, unknown>>;
}

function mutableFixture(): MutableCatalog {
  return structuredClone(transfigurationFixture()) as unknown as MutableCatalog;
}

describe("parseTransfigurationData", () => {
  it("accepts a complete synthetic catalog and resolves stable form identity", () => {
    const parsed = parseTransfigurationData(mutableFixture());
    expect(transfigurationForm(parsed, "Hastened").id).toBe("Hastened");
  });

  it.each([
    (value: MutableCatalog) => {
      value.site.formOrder.reverse();
    },
    (value: MutableCatalog) => {
      value.forms[0].operation = { kind: "unknown" };
    },
    (value: MutableCatalog) => {
      value.forms[0].eligibility = { kind: "cardType", cardType: "Dream" };
    },
    (value: MutableCatalog) => {
      value.forms[0].pricing = { kind: "band", base: Number.NaN };
    },
  ])("rejects malformed closed catalog structures", (mutate) => {
    const value = mutableFixture();
    mutate(value);
    expect(() => parseTransfigurationData(value)).toThrow(/malformed/u);
  });
});
