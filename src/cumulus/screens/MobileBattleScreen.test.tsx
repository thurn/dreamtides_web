// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseCardName } from "../../types/card-identity";
import {
  parseBattleCardId as cardId,
  parseBattleId,
  parseBattleSlotViewId,
  type BattleCardId,
} from "../../types/identifiers";
import { testCardId } from "../../types/test-identities";
import { CumulusRoot } from "../CumulusRoot";
import {
  MobileBattleScreen,
  type MobileBattleCardView,
  type MobileBattleInspectorSideView,
  type MobileBattleInteractions,
  type MobileBattleSideView,
  type MobileBattleView,
} from "./MobileBattleScreen";

type Owner = "enemy" | "player";
const roots: Root[] = [];

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

function makeCard(index: number, instanceId: BattleCardId): MobileBattleCardView {
  const id = testCardId(
    `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  );
  const displaySnapshot = {
    id,
    name: parseCardName(`Fixture Card ${String(index)}`),
    cardNumber: index,
    cardType: "Character",
    subtype: "Warrior",
    isStarter: false,
    energyCost: index % 4,
    spark: index % 5,
    isFast: false,
    renderedText: "A stable fixture ability.",
    imageNumber: index,
    artOwned: true,
  } as const;
  return {
    id: instanceId,
    model: { cardId: id, displaySnapshot },
    exhausted: false,
    figment: false,
    storedTime: 0,
    showPlayableOutline: false,
  };
}

function makeSide(owner: Owner, offset: number): MobileBattleSideView {
  const slot = (name: string, card: MobileBattleCardView | null) => ({
    id: parseBattleSlotViewId(`${owner}-${name}`),
    card,
  });
  return {
    owner,
    position: owner === "player" ? "near" : "far",
    deckCardIds: [cardId(`${owner}-deck-0`), cardId(`${owner}-deck-1`)],
    banishedCardCount: 0,
    voidCards: [makeCard(offset, cardId(`${owner}-void-top`))],
    backRank: [
      slot("back-empty", null),
      slot("back-filled", makeCard(offset + 1, cardId(`${owner}-back-card`))),
      slot("back-second-empty", null),
    ],
    frontRank: [
      slot("front-filled", makeCard(offset + 2, cardId(`${owner}-front-card`))),
      slot("front-empty", null),
    ],
    status: {
      avatar: { imageNumber: "0007", name: owner, title: "Fixture" },
      currentEnergy: 3,
      maxEnergy: 3,
      points: 5,
      pointsToWin: 10,
    },
  };
}

function inspectorSide(side: Owner): MobileBattleInspectorSideView {
  const zones = { hand: 4, deck: 2, void: 1, banished: 0 };
  return {
    side,
    heading: side === "player" ? "Player" : "Enemy",
    points: 5,
    currentEnergy: 3,
    maxEnergy: 3,
    zones: { ...zones, backRank: 1, frontRank: 1 },
    canDiscard: true,
    canShuffle: true,
  };
}

function makeView(): MobileBattleView {
  const [enemy, player] = [makeSide("enemy", 1), makeSide("player", 20)];
  const hand = (owner: Owner, length: number, offset: number) =>
    Array.from({ length }, (_, index) =>
      makeCard(offset + index, cardId(`${owner}-hand-${String(index)}`)),
    );
  const [enemyHand, playerHand] = [hand("enemy", 8, 60), hand("player", 4, 40)];
  const enemyHandCardIds = enemyHand.map((card) => card.id);
  return {
    battleId: parseBattleId("battle-mobile-fixture"),
    perspective: "player",
    near: player,
    far: enemy,
    nearHand: {
      owner: "player",
      position: "near",
      cardIds: playerHand.map((card) => card.id),
      cards: playerHand,
    },
    farHand: {
      owner: "enemy",
      position: "far",
      cardIds: enemyHandCardIds,
      cards: [],
    },
    promptNotice: null,
    aiApproval: null,
    cardPicker: null,
    choicePrompt: null,
    dreamwell: null,
    activeSide: "player",
    isOpeningTurn: false,
    phase: "day",
    enemyHandCardIds,
    enemyHand,
    enemy,
    player,
    playerHand,
    result: null,
    inspector: {
      opponentName: "enemy",
      perspective: "player",
      turn: "3",
      phase: "Day",
      activeSide: "Player",
      result: "In progress",
      nextDreamwellOrder: "4",
      isOpponentHandRevealed: false,
      isPlayerHandHidden: false,
      isFarHandRevealed: false,
      isNearHandHidden: false,
      sides: { player: inspectorSide("player"), enemy: inspectorSide("enemy") },
      ai: null,
    },
  };
}

function mount(
  view: MobileBattleView,
  overrides: Partial<MobileBattleInteractions> = {},
): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const interactions: MobileBattleInteractions = {
    canInteract: true,
    pendingCardId: null,
    onHandCardActivate: vi.fn(),
    onCardDragStart: vi.fn(),
    onCardDragEnd: vi.fn(),
    onSlotDrop: vi.fn(),
    onZoneDrop: vi.fn(),
    onPreviousPhase: vi.fn(),
    onNextPhase: vi.fn(),
    ...overrides,
  };
  const root = createRoot(container);
  roots.push(root);
  act(() => {
    root.render(
      <CumulusRoot>
        <MobileBattleScreen view={view} interactions={interactions} />
      </CumulusRoot>,
    );
  });
  return container;
}

function query(parent: ParentNode, selector: string): HTMLElement {
  const element = parent.querySelector<HTMLElement>(selector);
  if (element === null) throw new Error(`missing ${selector}`);
  return element;
}

function click(element: HTMLElement | undefined): void {
  act(() => element?.click());
}

function drop(target: HTMLElement, clientX = 0, clientY = 0): void {
  const init = { bubbles: true, cancelable: true, clientX, clientY };
  act(() => {
    target.dispatchEvent(new MouseEvent("drop", init));
  });
}

const emptySlot = (container: HTMLElement, rank: string) =>
  query(
    container,
    `[data-battle-rank="${rank}"] [data-battle-slot-filled="false"]`,
  );

describe("MobileBattleScreen", () => {
  it("renders both battlefields, hands, piles, and phase controls", () => {
    const container = mount(makeView());

    for (const rank of "enemy-back enemy-front player-front player-back".split(
      " ",
    )) {
      query(container, `[data-battle-rank="${rank}"]`);
    }
    query(container, '[data-battle-phase-controls="row"]');
    const farHand = query(container, '[data-battle-mobile-row="far-hand"]');
    const nearHand = query(container, '[data-battle-mobile-row="near-hand"]');
    expect(farHand.dataset.battleHandCount).toBe("8");
    expect(
      farHand.querySelectorAll('[data-battle-card-zone="far-hand"]').length,
    ).toBeLessThan(8);
    expect(
      nearHand.querySelectorAll('[data-battle-card-zone="near-hand"]'),
    ).toHaveLength(4);
  });

  it("dispatches phase changes and pile browsing from the controls", () => {
    const onPreviousPhase = vi.fn();
    const onNextPhase = vi.fn();
    const onZoneOpen = vi.fn();
    const container = mount(makeView(), {
      onPreviousPhase,
      onNextPhase,
      onZoneOpen,
    });
    const controls = query(container, '[data-battle-phase-controls="row"]');

    click(query(controls, "[data-battle-phase-back] button"));
    click(query(controls, "[data-battle-phase-next] button"));
    click(query(container, '[data-testid="player-battle-deck"]'));
    click(query(container, '[data-testid="player-battle-void"]'));

    expect(onPreviousPhase).toHaveBeenCalledOnce();
    expect(onNextPhase).toHaveBeenCalledOnce();
    expect(onZoneOpen.mock.calls).toEqual([
      [{ owner: "player", zone: "deck" }],
      [{ owner: "player", zone: "void" }],
    ]);
  });

  it("routes pending hand-card drops through the play intent to the closest open slot", () => {
    const [onHandCardDrop, onSlotDrop] = [vi.fn(), vi.fn()];
    const container = mount(makeView(), {
      pendingCardId: cardId("player-hand-0"),
      pendingCardSource: "near-hand",
      pendingCardOwner: "player",
      onHandCardDrop,
      onSlotDrop,
    });
    for (const [slotId, left] of [
      ["player-back-empty", 50],
      ["player-back-second-empty", 250],
    ] as const) {
      const slot = query(container, `[data-battle-slot-id="${slotId}"]`);
      vi.spyOn(slot, "getBoundingClientRect").mockReturnValue(
        new DOMRect(left, 200, 100, 140),
      );
    }

    drop(emptySlot(container, "enemy-back"));
    expect(onHandCardDrop).toHaveBeenCalledOnce();

    drop(query(container, "[data-battle-mobile]"), 290, 280);
    expect(onHandCardDrop).toHaveBeenLastCalledWith({
      owner: "player",
      rank: "back",
      slotId: "player-back-second-empty",
    });
    expect(onSlotDrop).not.toHaveBeenCalled();
  });

  it("accepts battlefield repositioning only on the dragged card's own side", () => {
    const onSlotDrop = vi.fn();
    const container = mount(makeView(), {
      pendingCardId: cardId("player-front-card"),
      pendingCardSource: "battlefield",
      pendingCardOwner: "player",
      onSlotDrop,
    });
    const [own, opposing] = [
      emptySlot(container, "player-back"),
      emptySlot(container, "enemy-back"),
    ];

    expect(own.dataset.battleDropTarget).toBe("true");
    expect(opposing.dataset.battleDropTarget).toBeUndefined();
    drop(opposing);
    drop(own);
    expect(onSlotDrop.mock.calls).toEqual([
      [{ owner: "player", rank: "back", slotId: "player-back-empty" }],
    ]);
  });

  it("selects inline card-picker candidates from the hand and submits their ids", () => {
    const view = makeView();
    const candidates = view.playerHand.slice(0, 2);
    const candidateIds = candidates.map((card) => card.id);
    const onCardPickerSelectionChange = vi.fn();
    const onCardPickerSubmit = vi.fn();
    const onHandCardActivate = vi.fn();
    const container = mount(
      {
        ...view,
        cardPicker: {
          key: 42,
          label: "Choose",
          side: "player",
          candidates: candidates.map((card) => ({
            instanceId: card.id,
            cardUuid: card.model.cardId,
            owner: "player",
            zone: "hand",
            card,
            highlighted: false,
          })),
          candidateIds,
          count: 2,
          optional: false,
          canResolve: true,
          presentation: "board",
        },
      },
      {
        canInteract: false,
        onHandCardActivate,
        onCardPickerSelectionChange,
        onCardPickerSubmit,
      },
    );
    const handCards = container.querySelectorAll<HTMLElement>(
      '[data-battle-card-zone="near-hand"] > [data-battlefield-card]',
    );
    const submit = () =>
      query(container, '[data-testid="battle-card-picker-submit"]');

    expect(container.querySelector("[data-battle-phase-controls]")).toBeNull();
    expect(submit().getAttribute("aria-disabled")).toBe("true");
    click(handCards[0]);
    expect(onCardPickerSelectionChange).toHaveBeenLastCalledWith([
      candidateIds[0],
    ]);
    click(handCards[2]);
    expect(onCardPickerSelectionChange).toHaveBeenCalledOnce();
    click(handCards[1]);
    expect(submit().getAttribute("aria-disabled")).toBeNull();

    click(submit());
    expect(onCardPickerSubmit).toHaveBeenCalledWith(candidateIds);
    expect(onHandCardActivate).not.toHaveBeenCalled();
  });

  it("replaces the phase advance with choice-prompt options", () => {
    const [onChoicePromptChoose, onNextPhase] = [vi.fn(), vi.fn()];
    const container = mount(
      {
        ...makeView(),
        choicePrompt: {
          key: 42,
          label: "Choose",
          options: [{ label: "First" }, { label: "Second" }],
          canResolve: true,
        },
      },
      { canInteract: false, onChoicePromptChoose, onNextPhase },
    );
    const options = query(
      container,
      "[data-battle-choice-prompt-controls]",
    ).querySelectorAll<HTMLButtonElement>("button");

    expect(options).toHaveLength(2);
    click(options[1]);
    expect(onChoicePromptChoose).toHaveBeenCalledWith(1);
    expect(onNextPhase).not.toHaveBeenCalled();
  });
});
