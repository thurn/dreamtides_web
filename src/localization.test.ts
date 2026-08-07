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
  it("provides every generated production message contract", () => {
    for (const id of FLUENT_MESSAGE_IDS) {
      expect(appLocalization.getBundle(id)).not.toBeNull();
    }
  });

  it("formats representative zero, one, and multiple counts without leaking IDs", () => {
    const messages = [
      ["deck-browser-card-count", "count"],
      ["battle-zone-browser-total-count", "count"],
      ["battle-card-memory-counter-count", "count"],
      ["battle-figment-create-action", "count"],
      ["exploration-card-copies-gained", "copyCount"],
      ["card-pool-tide-provenance-summary", "tideCount"],
    ] as const;

    for (const [id, variable] of messages) {
      for (const count of [0, 1, 2]) {
        const formatted = appLocalization.getString(id, {
          [variable]: count,
        });
        expect(formatted).not.toBe("");
        expect(formatted).not.toContain(id);
      }
    }
  });

  it("formats every battle phase and Transfiguration selector state", () => {
    for (const owner of ["viewer", "opponent"]) {
      for (const phase of ["dawn", "day", "dusk", "night", "challenge"]) {
        expect(
          appLocalization.getString("battle-phase-indicator", { owner, phase }),
        ).not.toBe("");
      }
    }
    for (const form of [
      "Empowered",
      "Amplified",
      "Kindled",
      "Inspired",
      "Enduring",
      "Hastened",
      "Resonant",
    ]) {
      expect(
        appLocalization.getString("exploration-card-transfiguring", {
          cardName: "Fixture",
          form,
        }),
      ).not.toBe("");
    }
  });

  it("formats every migrated semantic selector state without leaking IDs", () => {
    const cases: ReadonlyArray<
      readonly [id: string, variable: string, values: readonly string[]]
    > = [
      ["card-pool-viewer-title", "context", ["pool", "battle"]],
      ["card-pool-source-option", "source", ["run", "tides", "catalog", "signature", "deck", "history"]],
      ["card-pool-empty-state", "source", ["run", "tides", "catalog", "signature", "deck", "history"]],
      ["card-pool-sort-option", "sort", ["name", "cardNumber", "cost", "type", "subtype", "spark"]],
      ["card-pool-type-filter-option", "type", ["all", "character", "event"]],
      ["card-pool-cost-filter-option", "cost", ["all", "0", "1", "2", "3", "4", "fivePlus", "x"]],
      ["card-stat-accessible-name", "stat", ["energy", "spark", "dreamwellEnergy"]],
      ["gamble-starway-tier-action", "stage", ["initial", "climb"]],
    ];

    for (const [id, variable, values] of cases) {
      for (const value of values) {
        const variables: Record<string, string> = { [variable]: value };
        if (id === "card-stat-accessible-name") variables.change = "none";
        const formatted = appLocalization.getString(id, variables);
        expect(formatted).not.toBe("");
        expect(formatted).not.toContain(id);
      }
    }

    for (const state of [
      "unrevealed",
      "revealedLocked",
      "available",
      "completed",
      "forgone",
    ]) {
      const formatted = appLocalization.getString("atlas-node-accessible-name", {
        hasBiomeName: "no",
        biomeName: "",
        state,
        role: "regular",
        hasKnownDreamsign: "no",
      });
      expect(formatted).not.toBe("");
      expect(formatted).not.toContain("atlas-node-accessible-name");
    }
  });

  it("formats every migrated outcome and control state without diagnostics", () => {
    const selectorCases: ReadonlyArray<{
      readonly id: string;
      readonly variable: string;
      readonly values: readonly string[];
    }> = [
      { id: "battle-result-title", variable: "outcome", values: ["victory", "defeat", "draw"] },
      { id: "journey-failed-title", variable: "result", values: ["defeat", "draw"] },
      { id: "journey-failed-reason", variable: "reason", values: ["score_target_reached", "turn_limit_reached", "forced_result"] },
      { id: "journey-failed-stat-label", variable: "stat", values: ["battles", "round", "playerScore", "enemyScore"] },
      { id: "gamble-gravok-outcome-headline", variable: "outcome", values: ["won", "bust"] },
      { id: "gamble-ladder-outcome-headline", variable: "outcome", values: ["won", "miss"] },
      { id: "gamble-starway-outcome-headline", variable: "outcome", values: ["safe", "bust"] },
      { id: "gamble-four-suit-result-headline", variable: "outcome", values: ["transfiguration", "essence", "duplication", "purge"] },
      { id: "battle-tutorial-movement-error", variable: "reason", values: ["sendFailed", "exhaustedFrontRank", "noLegalCell"] },
      { id: "transfiguration-picker-instruction", variable: "state", values: ["standard", "enhanced", "loading"] },
      { id: "transfiguration-picker-empty-state", variable: "state", values: ["empty", "loading"] },
      { id: "transfiguration-decline-action", variable: "presentation", values: ["compact", "full"] },
      { id: "transfiguration-confirm-action", variable: "state", values: ["ready", "pending"] },
      { id: "duplication-picker-instruction", variable: "state", values: ["standard", "enhanced", "loading"] },
      { id: "duplication-picker-empty-state", variable: "state", values: ["empty", "loading"] },
      { id: "duplication-decline-action", variable: "presentation", values: ["compact", "full"] },
      { id: "duplication-confirm-action", variable: "state", values: ["ready", "pending"] },
      { id: "journey-start-carousel-navigation-action", variable: "direction", values: ["previous", "next"] },
      { id: "tide-alignment-name", variable: "tide", values: ["ember", "valor", "vision", "wild", "shadow"] },
    ];

    for (const { id, variable, values } of selectorCases) {
      for (const value of values) {
        const formatted = appLocalization.getString(id, { [variable]: value });
        expect(formatted).not.toBe("");
        expect(formatted).not.toContain(id);
      }
    }
  });

  it("formats compound selector messages from semantic values", () => {
    const cases = [
      ["battle-card-picker-zone-caption", { highlighted: "no", owner: "viewer", zone: "void" }],
      ["playing-card-accessible-name", { state: "visible", rank: "Q", suit: "hearts" }],
      ["card-type-line", { presentation: "other", hasSubtype: "yes", cardType: "Event", subtype: "Fixture" }],
      ["exploration-next-battle-modifier", { amount: 2, modifier: "opening-hand" }],
    ] as const;

    for (const [id, variables] of cases) {
      const formatted = appLocalization.getString(id, variables);
      expect(formatted).not.toBe("");
      expect(formatted).not.toContain(id);
    }

    for (const sparkCount of [0, 1, 2]) {
      const formatted = appLocalization.getString(
        "battle-figment-merge-legionnaire-warning",
        { sparkCount },
      );
      expect(formatted).not.toBe("");
      expect(formatted).not.toContain(
        "battle-figment-merge-legionnaire-warning",
      );
    }
  });
});
