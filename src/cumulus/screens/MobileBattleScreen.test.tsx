// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseCardName } from "../../types/card-identity";
import {
  parseBattleCardId as cardId,
  parseBattleId,
  parseBattleSlotViewId,
  parsePromptId,
  type BattleCardId,
} from "../../types/identifiers";
import { testCardId } from "../../types/test-identities";
import { CumulusRoot } from "../CumulusRoot";
import {
  MobileBattleScreen,
  type MobileBattleCardView,
  type MobileBattleInspectorSideView,
  type MobileBattleInteractions,
  type MobileBattleScreenProps,
  type MobileBattleSideView,
  type MobileBattleView,
} from "./MobileBattleScreen";
import type { BattlePromptHostView } from "./battle-overlays/BattlePromptHost";

const HOST: BattlePromptHostView = {
  key: null,
  heading: null,
  cancellable: false,
  number: null,
  arrange: null,
  loopOffer: null,
  notice: null,
};

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
    },
  };
}

function mount(
  view: MobileBattleView,
  overrides: Partial<MobileBattleInteractions> = {},
  props: Partial<MobileBattleScreenProps> = {},
): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  mountedRoots.set(container, root);
  act(() => root.render(screen(view, overrides, props)));
  return container;
}

function screen(
  view: MobileBattleView,
  overrides: Partial<MobileBattleInteractions>,
  props: Partial<MobileBattleScreenProps>,
) {
  const interactions: MobileBattleInteractions = {
    canInteract: true,
    pendingCardId: null,
    onHandCardActivate: vi.fn(),
    onCardDragStart: vi.fn(),
    onCardDragEnd: vi.fn(),
    onSlotDrop: vi.fn(),
    onZoneDrop: vi.fn(),
    onNextPhase: vi.fn(),
    ...overrides,
  };
  return (
    <CumulusRoot>
      <MobileBattleScreen view={view} interactions={interactions} phaseNavigation="next-phase" {...props} />
    </CumulusRoot>
  );
}

const mountedRoots = new WeakMap<HTMLDivElement, Root>();

function rerender(
  container: HTMLDivElement,
  view: MobileBattleView,
  overrides: Partial<MobileBattleInteractions> = {},
): void {
  const root = mountedRoots.get(container);
  act(() => root?.render(screen(view, overrides, {})));
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

describe("MobileBattleScreen", () => {
  it("renders both battlefields, hands, and piles, outlining only the playable cards", () => {
    const view = makeView();
    const playable = view.playerHand[1];
    const container = mount({
      ...view,
      playerHand: view.playerHand.map((card) =>
        card === playable ? { ...card, showPlayableOutline: true } : card,
      ),
    });

    for (const rank of "enemy-back enemy-front player-front player-back".split(
      " ",
    )) {
      query(container, `[data-battle-rank="${rank}"]`);
    }
    const farHand = query(container, '[data-battle-mobile-row="far-hand"]');
    const nearHand = query(container, '[data-battle-mobile-row="near-hand"]');
    expect(farHand.dataset.battleHandCount).toBe("8");
    expect(
      nearHand.querySelectorAll('[data-battle-card-zone="near-hand"]'),
    ).toHaveLength(4);
    expect(
      [...container.querySelectorAll("[data-battle-card-playable] [data-battle-card-id]")].map(
        (element) => element.getAttribute("data-battle-card-id"),
      ),
    ).toEqual([playable.id]);
  });

  it("enables the pass control only while the player may act, with no Back control", () => {
    const onNextPhase = vi.fn();
    const idle = mount(makeView(), { canInteract: false, onNextPhase });
    const idleNext = query(idle, "[data-battle-phase-next] button");
    expect(idleNext.getAttribute("aria-disabled")).toBe("true");
    click(idleNext);
    expect(onNextPhase).not.toHaveBeenCalled();

    for (const phaseNavigation of ["next-phase", "pass"] as const) {
      const container = mount(makeView(), { onNextPhase }, { phaseNavigation });
      expect(container.querySelector("[data-battle-phase-back]")).toBeNull();
      click(query(container, "[data-battle-phase-next] button"));
    }
    expect(onNextPhase).toHaveBeenCalledTimes(2);
  });

  it("opens piles from their controls", () => {
    const onZoneOpen = vi.fn();
    const container = mount(makeView(), { onZoneOpen });

    click(query(container, '[data-testid="player-battle-deck"]'));
    click(query(container, '[data-testid="player-battle-void"]'));
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

    drop(query(container, "[data-battle-mobile]"), 290, 280);
    expect(onHandCardDrop).toHaveBeenLastCalledWith({
      owner: "player",
      rank: "back",
      slotId: "player-back-second-empty",
    });
    expect(onSlotDrop).not.toHaveBeenCalled();
  });

  it("accepts a repositioning drop only on a legal destination", () => {
    const onSlotDrop = vi.fn();
    const legal = {
      owner: "player",
      rank: "back",
      slotId: parseBattleSlotViewId("player-back-second-empty"),
    } as const;
    const container = mount(makeView(), {
      pendingCardId: cardId("player-front-card"),
      pendingCardSource: "battlefield",
      pendingCardOwner: "player",
      eligibleSlotTargets: [legal],
      onSlotDrop,
    });
    const target = (slot: string) =>
      query(container, `[data-battle-slot-id="${slot}"]`);

    expect(target("player-back-second-empty").dataset.battleDropTarget).toBe("true");
    expect(target("player-back-empty").dataset.battleDropTarget).toBeUndefined();
    expect(target("enemy-back-empty").dataset.battleDropTarget).toBeUndefined();
    drop(target("player-back-empty"));
    drop(target("enemy-back-empty"));
    drop(target("player-back-second-empty"));
    expect(onSlotDrop.mock.calls).toEqual([[legal]]);
  });

  it("enables All Forward and All Back from the shortcuts the player can use", () => {
    const [onAllForward, onAllBack] = [vi.fn(), vi.fn()];
    const view = { ...makeView(), rankShortcuts: { allForward: true, allBack: false } };
    const container = mount(view, { onAllForward, onAllBack });
    const forward = query(container, '[data-testid="battle-all-forward"]');
    const back = query(container, '[data-testid="battle-all-back"]');

    expect(back.getAttribute("aria-disabled")).toBe("true");
    click(forward);
    click(back);
    expect(onAllForward).toHaveBeenCalledOnce();
    expect(onAllBack).not.toHaveBeenCalled();
    expect(
      mount(makeView(), { onAllForward }).querySelector("[data-battle-rank-shortcuts]"),
    ).toBeNull();
  });

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

  it("opens Avatar and Dreamsign abilities from the status display only while it has some", () => {
    const onStatusActivate = vi.fn();
    const inactive = mount(makeView(), { onStatusActivate });
    const active = mount(makeView(), { onStatusActivate, activatableStatusOwner: "player" });

    expect(inactive.querySelector("[data-battle-status-activatable]")).toBeNull();
    click(query(active, '[data-battle-status-activatable="player"]'));
    expect(onStatusActivate).toHaveBeenCalledWith("player");
  });

  it("selects card-picker candidates from the hand and submits between the fewest and most cards", () => {
    const view = makeView();
    const candidates = view.playerHand.slice(0, 3);
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
          count: 3,
          minCount: 2,
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
    expect(submit().getAttribute("aria-disabled")).toBe("true");
    click(handCards[3]);
    expect(onCardPickerSelectionChange).toHaveBeenCalledOnce();
    click(handCards[1]);
    expect(submit().getAttribute("aria-disabled")).toBeNull();

    click(submit());
    expect(onCardPickerSubmit).toHaveBeenCalledWith(candidateIds.slice(0, 2));
    expect(onHandCardActivate).not.toHaveBeenCalled();
  });

  it("opens the battle log from its control only when the screen offers one", () => {
    const onBattleLogOpen = vi.fn();
    expect(mount(makeView()).querySelector('[data-testid="battle-log-open"]')).toBeNull();
    click(query(mount(makeView(), { onBattleLogOpen }), '[data-testid="battle-log-open"]'));
    expect(onBattleLogOpen).toHaveBeenCalledTimes(1);
  });

  it("presents the opponent's play at reading size and badges lasting statuses on cards and status displays", () => {
    const view = makeView();
    const [empty, filled, secondEmpty] = view.player.backRank;
    if (empty === undefined || filled?.card == null || secondEmpty === undefined) throw new Error("fixture has no back rank");
    const badged = { ...filled, card: { ...filled.card, statuses: [{ kind: "duration", label: "a" }] } } as const;
    const player = {
      ...view.player,
      backRank: [empty, badged, secondEmpty],
      status: { ...view.player.status, statuses: [{ kind: "costModifier", label: "b" }] },
    } satisfies MobileBattleSideView;
    const played = makeCard(90, cardId("enemy-played"));
    const container = mount({ ...view, player, near: player, playReveal: { card: played, from: "hand" } });

    expect(query(container, "[data-battle-play-reveal]").querySelector(`[data-battle-card-id="${played.id}"]`)).not.toBeNull();
    expect(
      query(container, `[data-battle-rank="player-back"] [data-battle-card-id="${badged.card.id}"]`).querySelector(
        '[data-battle-status-badge="duration"]',
      ),
    ).not.toBeNull();
    expect(query(container, '[data-testid="player-battle-status"]').querySelector('[data-battle-status-badge="costModifier"]')).not.toBeNull();
    expect(query(container, '[data-testid="enemy-battle-status"]').querySelector("[data-battle-status-badges]")).toBeNull();
  });

  it("shows on mobile the front lanes on both sides of every occupied back-rank position", () => {
    const view = makeView();
    const canonical = (rank: "B" | "F", count: number, filled: readonly number[]) =>
      Array.from({ length: count }, (_unused, index) => ({
        id: parseBattleSlotViewId(`${rank}${String(index)}`),
        card: filled.includes(index) ? makeCard(70 + index, cardId(`player-${rank}${String(index)}`)) : null,
      }));
    const player = { ...view.player, backRank: canonical("B", 10, [0, 4, 6]), frontRank: canonical("F", 9, []) };
    const enemy = { ...view.enemy, backRank: canonical("B", 10, []), frontRank: canonical("F", 9, []) };
    const container = mount({ ...view, player, near: player, enemy, far: enemy });
    const shown = (rank: string) =>
      [...query(container, `[data-battle-rank="${rank}"]`).querySelectorAll("[data-battle-slot-id]")].map((slot) =>
        slot.getAttribute("data-battle-slot-id"),
      );

    expect(shown("player-front")).toEqual(expect.arrayContaining(["F0", "F3", "F4", "F5", "F6"]));
    expect(shown("player-back")).toEqual(expect.arrayContaining(["B0", "B4", "B6"]));
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
