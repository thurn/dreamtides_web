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
  mount,
  query,
  roots,
} from "./MobileBattleScreen.fixtures";

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
