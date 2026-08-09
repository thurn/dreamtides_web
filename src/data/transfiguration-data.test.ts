import { describe, expect, it } from "vitest";
import { transfigurationFixture } from "../testing/transfiguration-fixture";
import {
  parseTransfigurationData,
  transfigurationForm,
} from "./transfiguration-data";

interface MutableCatalog {
  forms: Array<Record<string, unknown>>;
}

function mutableFixture(): MutableCatalog {
  return structuredClone(transfigurationFixture()) as unknown as MutableCatalog;
}

describe("parseTransfigurationData", () => {
  it("accepts configured subsets and resolves stable form identity", () => {
    const value = mutableFixture();
    value.forms = value.forms.slice(0, 3).reverse();
    const parsed = parseTransfigurationData(mutableFixture());
    expect(transfigurationForm(parsed, "Hastened").id).toBe("Hastened");

    const subset = parseTransfigurationData(value);
    expect(subset.forms.map(({ id }) => id)).toEqual([
      "Kindled",
      "Amplified",
      "Empowered",
    ]);
  });

  it.each([
    (value: MutableCatalog) => { value.forms[1].id = value.forms[0].id; },
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
