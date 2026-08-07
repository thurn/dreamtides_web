import { describe, expect, it } from "vitest";
import { appLocalization } from "./data/localization";

const REQUIRED_MESSAGES = [
  "journey-complete-title",
  "journey-complete-new-journey",
  "journey-complete-stat-battles",
  "journey-complete-stat-dreamscapes",
  "journey-complete-stat-cards",
  "journey-complete-stat-dreamsigns",
  "journey-complete-stat-essence",
] as const;

describe("appLocalization", () => {
  it("provides every message used by the Journey Complete case study", () => {
    for (const id of REQUIRED_MESSAGES) {
      expect(appLocalization.getBundle(id)).not.toBeNull();
    }
  });

  it("selects singular and plural labels from the count variable", () => {
    const singular = appLocalization.getString(
      "journey-complete-stat-battles",
      { count: 1 },
    );
    const plural = appLocalization.getString(
      "journey-complete-stat-battles",
      { count: 2 },
    );

    expect(singular).not.toBe(plural);
  });
});
