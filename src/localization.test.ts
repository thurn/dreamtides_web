import { describe, expect, it } from "vitest";
import { appLocalization } from "./data/localization";
import { FLUENT_MESSAGE_IDS } from "./data/localization-messages";
import type { MessageFormatter } from "./cumulus/hooks/use-messages";

function _messageFormatterTypeGuards(t: MessageFormatter): string[] {
  const statId: "battles" | "cards" = "battles";
  const valid = [
    t("journey-complete-title"),
    t("journey-complete-stat-battles", { count: 1 }),
    t(`journey-complete-stat-${statId}`, { count: 1 }),
  ];

  // @ts-expect-error unknown message IDs are rejected.
  t("journey-complete-titel");
  // @ts-expect-error messages with variables require them.
  t("journey-complete-stat-battles");
  return valid;
}
void _messageFormatterTypeGuards;

describe("appLocalization", () => {
  it("provides every message used by the Journey Complete case study", () => {
    for (const id of FLUENT_MESSAGE_IDS) {
      expect(appLocalization.getBundle(id)).not.toBeNull();
    }
  });

  it("selects singular and plural labels from the count variable", () => {
    const singular = appLocalization.getString(
      "journey-complete-stat-battles",
      { count: 1 },
    );
    const plural = appLocalization.getString("journey-complete-stat-battles", {
      count: 2,
    });

    expect(singular).not.toBe(plural);
  });
});
