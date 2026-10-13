// @vitest-environment jsdom

// MobileBattleScreen: phase, pile, rank-shortcut, status, and log controls,
// and drops onto the battlefield.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseBattleCardId as cardId,
  parseBattleSlotViewId,
} from "../../types/identifiers";
import {
  click,
  makeView,
  makeCard,
  mount,
  query,
  roots,
} from "./MobileBattleScreen.fixtures";

import { dropMobileCardAtPoint } from "./battle-board/drop-resolution";
import type { MobileBattleInteractions } from "./MobileBattleScreen";

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

function drop(target: HTMLElement, clientX = 0, clientY = 0): void {
  act(() => void target.dispatchEvent(new MouseEvent("drop", { bubbles: true, cancelable: true, clientX, clientY })));
}

describe("MobileBattleScreen", () => {
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
    expect(onZoneOpen.mock.calls).toEqual([[{ owner: "player", zone: "deck" }], [{ owner: "player", zone: "void" }]]);
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
      vi.spyOn(slot, "getBoundingClientRect").mockReturnValue(new DOMRect(left, 200, 100, 140));
    }

    drop(query(container, "[data-battle-mobile]"), 290, 280);
    expect(onHandCardDrop).toHaveBeenLastCalledWith({ owner: "player", rank: "back", slotId: "player-back-second-empty" });
    expect(onSlotDrop).not.toHaveBeenCalled();
  });

  it("accepts a repositioning drop only on a legal destination", () => {
    const onSlotDrop = vi.fn();
    const legal = { owner: "player", rank: "back", slotId: parseBattleSlotViewId("player-back-second-empty") } as const;
    const container = mount(makeView(), {
      pendingCardId: cardId("player-front-card"),
      pendingCardSource: "battlefield",
      pendingCardOwner: "player",
      eligibleSlotTargets: [legal],
      onSlotDrop,
    });
    const target = (slot: string) => query(container, `[data-battle-slot-id="${slot}"]`);

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
    expect(mount(makeView(), { onAllForward }).querySelector("[data-battle-rank-shortcuts]")).toBeNull();
  });

  it("opens Avatar and Dreamsign abilities from the status display only while it has some", () => {
    const onStatusActivate = vi.fn();
    const inactive = mount(makeView(), { onStatusActivate });
    const active = mount(makeView(), { onStatusActivate, activatableStatusOwner: "player" });

    expect(inactive.querySelector("[data-battle-status-activatable]")).toBeNull();
    click(query(active, '[data-battle-status-activatable="player"]'));
    expect(onStatusActivate).toHaveBeenCalledWith("player");
  });

  it("opens the battle log from its control only when the screen offers one", () => {
    const onBattleLogOpen = vi.fn();
    expect(mount(makeView()).querySelector('[data-testid="battle-log-open"]')).toBeNull();
    click(query(mount(makeView(), { onBattleLogOpen }), '[data-testid="battle-log-open"]'));
    expect(onBattleLogOpen).toHaveBeenCalledTimes(1);
  });
});


describe("hand release policies through the rendered battlefield", () => {
  const exact = { owner: "player", rank: "back", slotId: parseBattleSlotViewId("player-back-second-empty") } as const;
  const invalidSelectors = {
    occupied: '[data-battle-slot-id="player-back-filled"] [data-battle-card-id]',
    foreign: '[data-battle-slot-id="enemy-back-filled"] [data-battle-card-id]',
    front: '[data-battle-slot-id="player-front-empty"]',
    padding: '[data-battle-slot-id="tutorial-padding:player:back:0"]',
    background: '[data-battle-mobile]',
  } as const;
  function setup() {
    const view = makeView();
    const padded = { ...view, near: { ...view.near, backRank: [...view.near.backRank, { id: parseBattleSlotViewId("tutorial-padding:player:back:0"), card: null }] } };
    const interactions: MobileBattleInteractions = {
      canInteract: true, pendingCardId: cardId("player-hand-0"), pendingCardSource: "near-hand", pendingCardOwner: "player",
      handDropPolicy: "exact-cell", isSlotDropEligible: target => target.owner === "player" && target.rank === "back" && target.slotId === exact.slotId,
      onHandCardActivate: vi.fn(), onCardDragStart: vi.fn(), onCardDragEnd: vi.fn(), onSlotDrop: vi.fn(), onZoneDrop: vi.fn(), onNextPhase: vi.fn(),
      onHandCardDrop: vi.fn(), onHandCardDropRejected: vi.fn(),
    };
    const container = mount(padded, interactions);
    container.querySelectorAll<HTMLElement>('[data-battle-mobile-drop-kind="slot"]').forEach((slot, index) => {
      vi.spyOn(slot, "getBoundingClientRect").mockReturnValue(new DOMRect(20 + index * 100, 100, 80, 80));
    });
    return { container, interactions };
  }
  function center(element: HTMLElement) {
    const slot = element.closest<HTMLElement>('[data-battle-mobile-drop-kind="slot"]');
    const rect = slot?.getBoundingClientRect();
    return rect === undefined ? { x: 15, y: 15 } : { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
  }
  function release(route: "pointer" | "native", interactions: MobileBattleInteractions, element: HTMLElement | null, x: number, y: number, sourceBattleScreen?: HTMLElement | null) {
    if (route === "native") { if (element !== null) drop(element, x, y); return; }
    const prior = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: vi.fn(() => element) });
    try { act(() => dropMobileCardAtPoint(interactions, x, y, x, y, sourceBattleScreen)); }
    finally { if (prior === undefined) Reflect.deleteProperty(document, "elementFromPoint"); else Object.defineProperty(document, "elementFromPoint", prior); }
  }
  it.each(["pointer", "native"] as const)("%s release denies actual invalid cells/background and recovers at the exact legal cell", route => {
    const { container, interactions } = setup();
    for (const selector of Object.values(invalidSelectors)) {
      const hit = query(container, selector), point = center(hit);
      release(route, interactions, hit, point.x, point.y, query(container, "[data-battle-mobile]"));
      expect(interactions.onHandCardDrop).not.toHaveBeenCalled();
      expect(interactions.onSlotDrop).not.toHaveBeenCalled();
      const cell = hit.closest<HTMLElement>('[data-battle-mobile-drop-kind="slot"]');
      expect(interactions.onHandCardDropRejected).toHaveBeenLastCalledWith(cell === null ? null : {
        owner: cell.dataset.battleMobileDropOwner, rank: cell.dataset.battleMobileDropRank, slotId: cell.dataset.battleMobileDropSlotId,
      });
    }
    const legal = query(container, `[data-battle-slot-id="${exact.slotId}"]`), point = center(legal);
    release(route, interactions, legal, point.x, point.y, query(container, "[data-battle-mobile]"));
    expect(interactions.onHandCardDrop).toHaveBeenCalledExactlyOnceWith(exact);
    expect(interactions.onSlotDrop).not.toHaveBeenCalled();
  });
  it("pointer release denies unavailable, foreign-root, nonfinite and out-of-bounds hits without choosing another cell", () => {
    const { container, interactions } = setup();
    const legal = query(container, `[data-battle-slot-id="${exact.slotId}"]`), point = center(legal);
    for (const [hit, x, y] of [[null, point.x, point.y], [legal, NaN, point.y], [legal, point.x, Infinity], [legal, -10, -10]] as const) {
      release("pointer", interactions, hit, x, y, query(container, "[data-battle-mobile]"));
      expect(interactions.onHandCardDrop).not.toHaveBeenCalled();
    }
    const outside = document.createElement("div");
    outside.dataset.battleMobileDropKind = "slot"; outside.dataset.battleMobileDropOwner = "player"; outside.dataset.battleMobileDropRank = "back"; outside.dataset.battleMobileDropSlotId = exact.slotId;
    document.body.append(outside);
    release("pointer", interactions, outside, point.x, point.y, query(container, "[data-battle-mobile]"));
    expect(interactions.onHandCardDrop).not.toHaveBeenCalled();
    expect(interactions.onHandCardDropRejected).toHaveBeenCalledTimes(5);
  });
  it("the actual source-card pointer route rejects another rendered board and recovers on its own board", () => {
    const { container, interactions } = setup();
    const other = setup().container;
    const ownCell = query(container, `[data-battle-slot-id="${exact.slotId}"]`), otherCell = query(other, `[data-battle-slot-id="${exact.slotId}"]`);
    const handCard = query(container, '[data-battle-mobile-row="near-hand"] [data-battlefield-card]');
    vi.spyOn(handCard, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 400, 80, 100));
    const prior = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
    let hit: HTMLElement = otherCell;
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: vi.fn(() => hit) });
    const pointer = (type: string, x: number, y: number) => {
      const event = new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y });
      Object.defineProperties(event, { pointerId: { value: 1 }, pointerType: { value: "mouse" } });
      act(() => void handCard.dispatchEvent(event));
    };
    const gesture = (cell: HTMLElement) => {
      const point = center(cell);
      pointer("pointerdown", 60, 450);
      pointer("pointermove", point.x, point.y);
      pointer("pointerup", point.x, point.y);
    };
    try {
      gesture(otherCell);
      expect(interactions.onHandCardDrop).not.toHaveBeenCalled();
      expect(interactions.onHandCardDropRejected).toHaveBeenCalledExactlyOnceWith(exact);
      expect(interactions.onCardDragStart).toHaveBeenCalledExactlyOnceWith(cardId("player-hand-0"), "near-hand");
      expect(interactions.onCardDragEnd).toHaveBeenCalledOnce();
      hit = ownCell;
      gesture(ownCell);
      expect(interactions.onHandCardDrop).toHaveBeenCalledExactlyOnceWith(exact);
      expect(interactions.onCardDragEnd).toHaveBeenCalledTimes(2);
    } finally { if (prior === undefined) Reflect.deleteProperty(document, "elementFromPoint"); else Object.defineProperty(document, "elementFromPoint", prior); }
  });
  it("exact pointer release without its source battlefield fails closed", () => {
    const { container, interactions } = setup();
    const legal = query(container, `[data-battle-slot-id="${exact.slotId}"]`), point = center(legal);
    release("pointer", interactions, legal, point.x, point.y);
    expect(interactions.onHandCardDrop).not.toHaveBeenCalled();
    expect(interactions.onHandCardDropRejected).toHaveBeenCalledExactlyOnceWith(exact);
  });
  it("exact pointer release rejects a rendered cell with unavailable geometry", () => {
    const { container, interactions } = setup();
    const legal = query(container, `[data-battle-slot-id="${exact.slotId}"]`);
    vi.spyOn(legal, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 0, 0));
    release("pointer", interactions, legal, 0, 0, query(container, "[data-battle-mobile]"));
    expect(interactions.onHandCardDrop).not.toHaveBeenCalled();
    expect(interactions.onHandCardDropRejected).toHaveBeenCalledExactlyOnceWith(exact);
  });
  it("native default resolves enemy-near ownership without optional interaction owner fields", () => {
    const source = makeView(), onHandCardDrop = vi.fn();
    const view = { ...source, perspective: "enemy" as const, near: { ...source.far, position: "near" as const }, far: { ...source.near, position: "far" as const }, nearHand: { ...source.nearHand, owner: "enemy" as const, cards: [makeCard(80, cardId("enemy-hand-0"))], cardIds: [cardId("enemy-hand-0")] }, farHand: { ...source.farHand, owner: "player" as const } };
    const container = mount(view, { pendingCardId: cardId("enemy-hand-0"), pendingCardSource: "near-hand", onHandCardDrop });
    for (const [id, left] of [["enemy-back-empty", 50], ["enemy-back-second-empty", 250], ["player-back-empty", 280]] as const) {
      vi.spyOn(query(container, `[data-battle-slot-id="${id}"]`), "getBoundingClientRect").mockReturnValue(new DOMRect(left, 200, 80, 80));
    }
    drop(query(container, "[data-battle-mobile]"), 290, 240);
    expect(onHandCardDrop).toHaveBeenCalledExactlyOnceWith({ owner: "enemy", rank: "back", slotId: "enemy-back-second-empty" });
  });
  it("pointer default keeps its existing player fallback and nearest-open behavior", () => {
    const onHandCardDrop = vi.fn(), view = makeView();
    const container = mount(view);
    vi.spyOn(query(container, '[data-battle-slot-id="player-back-second-empty"]'), "getBoundingClientRect").mockReturnValue(new DOMRect(250, 200, 80, 80));
    const interactions: MobileBattleInteractions = { canInteract: true, pendingCardId: cardId("player-hand-0"), pendingCardSource: "near-hand", onHandCardDrop, onHandCardActivate: vi.fn(), onCardDragStart: vi.fn(), onCardDragEnd: vi.fn(), onSlotDrop: vi.fn(), onZoneDrop: vi.fn(), onNextPhase: vi.fn() };
    release("pointer", interactions, query(container, '[data-battle-mobile]'), 290, 240);
    expect(onHandCardDrop).toHaveBeenCalledExactlyOnceWith({ owner: "player", rank: "back", slotId: "player-back-second-empty" });
  });
});
