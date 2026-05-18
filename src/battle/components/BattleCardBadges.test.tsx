// @vitest-environment jsdom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { BattleCardInstance, BattleCardNote } from "../types";
import { BattleCardBadges } from "./BattleCardBadges";

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  document.body.innerHTML = "";
});

describe("BattleCardBadges", () => {
  it("renders marker chips when the instance has markers set", () => {
    const instance = makeInstance({
      markers: { isPrevented: true, isCopied: true },
    });
    const container = mount(<BattleCardBadges instance={instance} />);

    expect(container.querySelector('[data-battle-card-marker="prevented"]')).not.toBeNull();
    expect(container.querySelector('[data-battle-card-marker="copied"]')).not.toBeNull();
  });

  it("omits marker chips when the flags are false", () => {
    const instance = makeInstance({
      markers: { isPrevented: false, isCopied: false },
    });
    const container = mount(<BattleCardBadges instance={instance} />);

    expect(container.querySelector('[data-battle-card-marker="prevented"]')).toBeNull();
    expect(container.querySelector('[data-battle-card-marker="copied"]')).toBeNull();
  });

  it("renders up to three note chips and a +N more overflow chip", () => {
    const notes: BattleCardNote[] = [0, 1, 2, 3, 4].map((index) => ({
      noteId: `note_${String(index)}`,
      text: `note number ${String(index)} with a long body`,
      createdAtTurnNumber: 1,
      createdAtSide: "player",
      createdAtMs: index,
      expiry: { kind: "manual" },
    }));
    const instance = makeInstance({ notes });
    const container = mount(<BattleCardBadges instance={instance} />);

    const noteChips = container.querySelectorAll(
      '[data-battle-card-note]:not([data-battle-card-note="overflow"])',
    );
    expect(noteChips).toHaveLength(3);
    expect(noteChips[0].getAttribute("data-battle-card-note")).toBe("note_0");
    expect(noteChips[2].getAttribute("data-battle-card-note")).toBe("note_2");
    const overflow = container.querySelector('[data-battle-card-note="overflow"]');
    expect(overflow).not.toBeNull();
    expect(overflow?.textContent).toContain("+2 more");
  });

  it("truncates long note text but keeps the full text in title", () => {
    const notes: BattleCardNote[] = [
      {
        noteId: "note_truncated",
        text: "this is a very long note exceeding the chip limit",
        createdAtTurnNumber: 1,
        createdAtSide: "player",
        createdAtMs: 1,
        expiry: { kind: "manual" },
      },
    ];
    const instance = makeInstance({ notes });
    const container = mount(<BattleCardBadges instance={instance} />);

    const chip = container.querySelector('[data-battle-card-note="note_truncated"]');
    expect(chip?.textContent?.length).toBeLessThanOrEqual(16);
    expect(chip?.getAttribute("title")).toBe(
      "this is a very long note exceeding the chip limit",
    );
  });
});

function mount(element: ReturnType<typeof BattleCardBadges>): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(element);
  });
  return container;
}

function makeInstance(overrides: {
  markers?: BattleCardInstance["markers"];
  notes?: BattleCardInstance["notes"];
}): BattleCardInstance {
  return {
    battleCardId: "bc_test",
    definition: {
      sourceDeckEntryId: null,
      cardNumber: 1,
      name: "Test Card",
      battleCardKind: "character",
      subtype: "Seeker",
      energyCost: 1,
      printedEnergyCost: 1,
      printedSpark: 2,
      isFast: false,
      reclaimCost: null,
      tides: [],
      renderedText: "",
      imageNumber: 1,
      transfiguration: null,
      isBane: false,
    },
    owner: "player",
    controller: "player",
    sparkDelta: 0,
    isRevealedToPlayer: true,
    markers: overrides.markers ?? { isPrevented: false, isCopied: false },
    notes: overrides.notes ?? [],
    provenance: {
      kind: "quest-deck",
      sourceBattleCardId: null,
      chosenSpark: null,
      chosenSubtype: null,
      createdAtTurnNumber: null,
      createdAtSide: null,
      createdAtMs: null,
    },
  };
}
