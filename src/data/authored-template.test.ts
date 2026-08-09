import { describe, expect, it } from "vitest";
import { formatAuthoredTemplate } from "./authored-template";

describe("formatAuthoredTemplate", () => {
  it("substitutes authored numeric slots", () => {
    expect(
      formatAuthoredTemplate("Draft ({pickNumber}/{pickTotal})", {
        pickNumber: 2,
        pickTotal: 5,
      }),
    ).toBe("Draft (2/5)");
  });

  it("rejects a missing slot value", () => {
    expect(() => formatAuthoredTemplate("Purge {count}", {})).toThrow(
      /Missing authored template value/u,
    );
  });
});
