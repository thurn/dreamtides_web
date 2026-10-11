// @vitest-environment jsdom

// MobileBattleScreen: the prompt host, loop offers, number, card-picker,
// and choice prompts, and the prompt's source card.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseBattleCardId as cardId,
  parsePromptId,
} from "../../types/identifiers";
import type {
  MobileBattleCardPickerView,
  MobileBattleCardView,
} from "./MobileBattleScreen";
import type { BattlePromptHostView } from "./battle-overlays/BattlePromptHost";
import {
  click,
  makeCard,
  makeView,
  mount,
  query,
  rerender,
  roots,
} from "./MobileBattleScreen.fixtures";

const HOST: BattlePromptHostView = { key: null, heading: null, cancellable: false, number: null, arrange: null, loopOffer: null, notice: null };

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }));
});

afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()));
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

/** A board card picker over `entries`, each a candidate card and the zone it is in. */
function cardPicker(
  entries: readonly (readonly [MobileBattleCardView, "hand" | "backRank"])[],
  bounds: { count: number; minCount?: number },
): MobileBattleCardPickerView {
  return {
    key: 7,
    label: "Choose",
    side: "player",
    candidates: entries.map(([card, zone]) => ({ instanceId: card.id, cardUuid: card.model.cardId, owner: "player", zone, card, highlighted: false })),
    candidateIds: entries.map(([card]) => card.id),
    ...bounds,
    optional: false,
    canResolve: true,
    presentation: "board",
  };
}

describe("MobileBattleScreen", () => {
  it("offers Cancel on the prompt host only while the prompt is cancellable", () => {
    const onPromptCancel = vi.fn();
    const host = (cancellable: boolean) =>
      mount(
        {
          ...makeView(),
          promptHost: { ...HOST, key: parsePromptId("1:0:0"), heading: { title: "Choose", detail: null }, cancellable },
        },
        { canInteract: false, canPrompt: true, onPromptCancel },
      );

    expect(host(false).querySelector('[data-testid="battle-prompt-cancel"]')).toBeNull();
    click(query(host(true), '[data-testid="battle-prompt-cancel"]'));
    expect(onPromptCancel).toHaveBeenCalledOnce();
  });

  it("repeats the loop on offer a chosen number of times or until victory", () => {
    const onRepeatLoop = vi.fn();
    mount({ ...makeView(), promptHost: { ...HOST, loopOffer: { maxCount: 3 } } }, { onRepeatLoop });
    const dialog = () => {
      click(query(document.body, '[data-testid="battle-loop-open"]'));
      return query(document.body, "[data-battle-loop-dialog]");
    };
    const [, increment] = dialog().querySelectorAll<HTMLElement>("[role='group'] button");

    click(increment);
    click(query(document.body, '[data-testid="battle-loop-repeat-count"]'));
    click(query(dialog(), '[data-testid="battle-loop-repeat-until-victory"]'));
    expect(onRepeatLoop.mock.calls).toEqual([[2], ["untilVictory"]]);
    expect(document.body.querySelector("[data-battle-loop-dialog]")).toBeNull();
  });

  it("submits only a legal number, keeping it through a bounce and starting over when the prompt changes", () => {
    const onPromptNumberSubmit = vi.fn();
    const view = (key: string) => ({
      ...makeView(),
      promptHost: { ...HOST, key: parsePromptId(key), heading: { title: "X", detail: null }, number: { label: "X", values: [1, 3, 4] } },
    });
    const container = mount(view("1:0:0"), { canInteract: false, canPrompt: true, onPromptNumberSubmit });
    const picker = () => query(container, "[data-battle-number-picker]");
    const [decrement, increment] = picker().querySelectorAll<HTMLElement>("[role='group'] button");

    expect(decrement?.getAttribute("aria-disabled")).toBe("true");
    click(increment);
    click(increment);
    expect(increment?.getAttribute("aria-disabled")).toBe("true");
    click(query(picker(), '[data-testid="battle-number-picker-submit"]'));
    expect(onPromptNumberSubmit).toHaveBeenLastCalledWith(4);
    // A bounced answer leaves the same prompt pending: the selection stays.
    rerender(container, view("1:0:0"), { canInteract: false, canPrompt: true, onPromptNumberSubmit });
    click(query(picker(), '[data-testid="battle-number-picker-submit"]'));
    expect(onPromptNumberSubmit).toHaveBeenLastCalledWith(4);
    rerender(container, view("1:0:1"), { canInteract: false, canPrompt: true, onPromptNumberSubmit });
    click(query(picker(), '[data-testid="battle-number-picker-submit"]'));
    expect(onPromptNumberSubmit).toHaveBeenLastCalledWith(1);
  });

  it("selects card-picker candidates from the hand and submits between the fewest and most cards", () => {
    const view = makeView();
    const candidates = view.playerHand.slice(0, 3);
    const candidateIds = candidates.map((card) => card.id);
    const [onCardPickerSelectionChange, onCardPickerSubmit, onHandCardActivate] = [vi.fn(), vi.fn(), vi.fn()];
    const picker = cardPicker(candidates.map((card) => [card, "hand"] as const), { count: 3, minCount: 2 });
    const container = mount(
      { ...view, cardPicker: picker },
      { canInteract: false, onHandCardActivate, onCardPickerSelectionChange, onCardPickerSubmit },
    );
    const handCards = container.querySelectorAll<HTMLElement>('[data-battle-card-zone="near-hand"] > [data-battlefield-card]');
    const submit = () => query(container, '[data-testid="battle-card-picker-submit"]');

    expect(container.querySelector("[data-battle-phase-controls]")).toBeNull();
    expect(submit().getAttribute("aria-disabled")).toBe("true");
    click(handCards[0]);
    expect(onCardPickerSelectionChange).toHaveBeenLastCalledWith([candidateIds[0]]);
    expect(submit().getAttribute("aria-disabled")).toBe("true");
    click(handCards[3]);
    expect(onCardPickerSelectionChange).toHaveBeenCalledOnce();
    click(handCards[1]);
    expect(submit().getAttribute("aria-disabled")).toBeNull();

    click(submit());
    expect(onCardPickerSubmit).toHaveBeenCalledWith(candidateIds.slice(0, 2));
    expect(onHandCardActivate).not.toHaveBeenCalled();
  });

  it("steps the prompt's source card aside while a choice on the battlefield is open", () => {
    const view = { ...makeView(), revealedHandCard: makeCard(91, cardId("asking-card")) };
    const backCard = view.player.backRank[1]?.card;
    const handCard = view.playerHand[0];
    if (backCard == null || handCard === undefined) throw new Error("fixture has no cards");
    const picker = (card: MobileBattleCardView, zone: "hand" | "backRank") => cardPicker([[card, zone]], { count: 1 });
    const placement = (container: HTMLElement) =>
      query(container, "[data-battle-revealed-hand-card]").dataset.battleRevealedHandCardPlacement;

    expect(placement(mount(view))).toBe("reading");
    expect(placement(mount(view, { targetableCardIds: [backCard.id] }))).toBe("aside");
    expect(placement(mount({ ...view, cardPicker: picker(backCard, "backRank") }))).toBe("aside");
    expect(placement(mount({ ...view, cardPicker: picker(handCard, "hand") }))).toBe("reading");
  });

  it("replaces the phase advance with choice-prompt options", () => {
    const [onChoicePromptChoose, onNextPhase] = [vi.fn(), vi.fn()];
    const choicePrompt = { key: 42, label: "Choose", options: [{ label: "First" }, { label: "Second" }], canResolve: true };
    const container = mount({ ...makeView(), choicePrompt }, { canInteract: false, onChoicePromptChoose, onNextPhase });
    const options = query(container, "[data-battle-choice-prompt-controls]").querySelectorAll<HTMLButtonElement>("button");

    expect(options).toHaveLength(2);
    click(options[1]);
    expect(onChoicePromptChoose).toHaveBeenCalledWith(1);
    expect(onNextPhase).not.toHaveBeenCalled();
  });
});
