// @vitest-environment jsdom

import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { DreamwellCardViewData } from "../../components/DreamwellCardView";
import { createBattleInit } from "../integration/create-battle-init";
import { createInitialBattleState } from "../state/create-initial-state";
import {
  makeBattleTestCardDatabase,
  makeBattleTestDreamcallers,
  makeBattleTestSite,
  makeBattleTestState,
} from "../test-support";
import { BattleCardPickerOverlay } from "./BattleCardPickerOverlay";
import { BattleChoicePromptOverlay } from "./BattleChoicePromptOverlay";
import { CumulusRoot } from "../../cumulus/CumulusRoot";

function renderWithCumulus(root: Root, element: ReactElement): void {
  root.render(<CumulusRoot>{element}</CumulusRoot>);
}

// A self-constructed Dreamwell card so the test does not depend on production
// Dreamwell TOML data (which is subject to change). The fields are the structural
// subset DreamwellCardView renders.
const SAMPLE_DREAMWELL_CARD: DreamwellCardViewData = {
  id: "test-dreamwell-card",
  name: "Test Dreamwell Card",
  renderedText: "Gain 2 energy. Discard a card.",
  energyAdded: 1,
  imageNumber: 0,
};

function makeBattleState() {
  const battleInit = createBattleInit({
    battleEntryKey: "site-7::2::dreamscape-2",
    site: makeBattleTestSite(),
    state: makeBattleTestState(),
    cardDatabase: makeBattleTestCardDatabase(),
    dreamcallers: makeBattleTestDreamcallers(),
  });
  return createInitialBattleState(battleInit);
}

describe("Dreamwell prompt overlays surface the source card", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders the driving Dreamwell card inside the card-picker prompt", () => {
    const state = makeBattleState();
    const candidateIds = state.sides.player.hand.slice(0, 2);
    expect(candidateIds.length).toBeGreaterThan(0);

    act(() => {
      renderWithCumulus(root,
        <BattleCardPickerOverlay
          title="Discard a card"
          sourceCard={SAMPLE_DREAMWELL_CARD}
          candidateIds={candidateIds}
          count={1}
          optional={false}
          state={state}
          onConfirm={() => {}}
          onSkip={() => {}}
        />,
      );
    });

    const promptCard = container.querySelector(
      `[data-battle-dreamwell-prompt-card="${SAMPLE_DREAMWELL_CARD.id}"]`,
    );
    expect(promptCard).not.toBeNull();
    expect(container.textContent).toContain("Discard a card");
    // The actual candidate cards still render alongside the source card.
    expect(
      container.querySelectorAll("[data-battle-dreamwell-pick-card]").length,
    ).toBe(candidateIds.length);
  });

  it("renders the driving Dreamwell card inside the choice prompt", () => {
    act(() => {
      renderWithCumulus(root,
        <BattleChoicePromptOverlay
          title="Choose one"
          sourceCard={SAMPLE_DREAMWELL_CARD}
          options={[{ label: "Draw a card" }, { label: "Gain 1 energy" }]}
          onChoose={() => {}}
        />,
      );
    });

    const promptCard = container.querySelector(
      `[data-battle-dreamwell-prompt-card="${SAMPLE_DREAMWELL_CARD.id}"]`,
    );
    expect(promptCard).not.toBeNull();
    expect(container.textContent).toContain("Choose one");
    expect(container.textContent).toContain("Draw a card");
  });

  it("omits the source-card header when no Dreamwell card is provided", () => {
    act(() => {
      renderWithCumulus(root,
        <BattleChoicePromptOverlay
          title="Choose one"
          options={[{ label: "Draw a card" }]}
          onChoose={() => {}}
        />,
      );
    });

    expect(
      container.querySelector("[data-battle-dreamwell-prompt-card]"),
    ).toBeNull();
  });
});
