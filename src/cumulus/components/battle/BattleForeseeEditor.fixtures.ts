// Shared fixtures for the Foresee and arrangement editor tests: battle card
// ids, editor models whose cards share a name, and the media query stub.
import { vi } from "vitest";
import { syntheticGameCard } from "../../test-helpers/component-test-fixtures";
import {
  parseBattleCardId,
  type BattleCardId,
} from "../../../types/identifiers";
import type { BattleForeseeEditorModel } from "./BattleForeseeEditor";
import type { BattleArrangeEditorModel } from "./BattleArrangeEditor";

export const id = (value: string): BattleCardId => parseBattleCardId(value);

export function makeView(initialCount = 1): BattleForeseeEditorModel {
  return {
    initialCount,
    allowedCounts: [1, 2, 3],
    cards: [1, 2, 3].map((index) => ({
      battleCardId: id(`battle-card-${String(index)}`),
      // Every card shares a name: the editor must track battle-instance ids.
      card: syntheticGameCard(index, "Duplicate"),
    })),
  };
}

export function stubMatchMedia(matches: boolean): void {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    media: "",
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  });
}

/** Two cards, one into the hand and the other on top or bottom; both start legally placed. */
export function arrangement(): BattleArrangeEditorModel {
  const lane = (
    destination: "top" | "bottom" | "hand",
    min: number,
    cardIds: readonly BattleCardId[],
  ) => ({ destination, label: destination, shortLabel: destination, min, max: 1, ordered: destination !== "hand", cardIds });
  return {
    title: "Arrange",
    subtitle: null,
    cards: [1, 2].map((index) => ({
      battleCardId: id(`battle-card-${String(index)}`),
      card: syntheticGameCard(index, "Duplicate"),
    })),
    lanes: [
      lane("top", 0, [id("battle-card-2")]),
      lane("bottom", 0, []),
      lane("hand", 1, [id("battle-card-1")]),
    ],
  };
}

/** The dialog's own controls outside its body: the Cancel disc, when it has one. */
export const dialogCloseButtons = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLButtonElement>("[data-glass-dialog-panel] button")).filter(
    (button) => button.closest("[data-glass-dialog-body]") === null,
  );
