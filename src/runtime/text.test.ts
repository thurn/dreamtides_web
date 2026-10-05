import { describe, expect, it } from "vitest";
import { formatNumber } from "./format-number";
import {
  annotatedTextValue,
  annotateText,
  fillTemplate,
  plainAnnotatedText,
} from "./text";

describe("formatNumber", () => {
  it("groups thousands and keeps the shortest decimal form", () => {
    expect(formatNumber(999)).toBe("999");
    expect(formatNumber(1000)).toBe("1,000");
    expect(formatNumber(-1234567.5)).toBe("-1,234,567.5");
    expect(formatNumber(-0)).toBe("0");
  });
});

describe("fillTemplate", () => {
  it("fills placeholders by exact or snake_case name", () => {
    expect(
      fillTemplate("{count} of {deck_card}", { count: 1200, deckCard: "x" }),
    ).toBe("1,200 of x");
  });

  it("rejects a placeholder without a value", () => {
    expect(() => fillTemplate("{missing}")).toThrow();
  });
});

describe("annotateText", () => {
  it("splits annotated placeholder runs out of rendered copy", () => {
    const text = annotateText(
      (values) => `Gain ${values.card} and ${values.other}.`,
      { card: "Alpha", other: "Beta" },
      { card: 7 },
    );
    expect(text.parts).toEqual([
      { kind: "literal", value: "Gain " },
      { kind: "placeholder", name: "card", value: "Alpha", annotation: 7 },
      { kind: "literal", value: " and Beta." },
    ]);
    expect(text.annotations).toEqual({ card: 7 });
    expect(annotatedTextValue(text)).toBe("Gain Alpha and Beta.");
  });

  it("represents plain copy as one literal run", () => {
    expect(annotatedTextValue(plainAnnotatedText("Plain"))).toBe("Plain");
  });
});
