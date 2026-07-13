// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import { TangoRoot } from "../TangoRoot";
import {
  MobileBattleScreen,
  type MobileBattleCardView,
  type MobileBattleInteractions,
  type MobileBattleSideView,
  type MobileBattleView,
} from "./MobileBattleScreen";

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
});

afterEach(() => {
  document.body.innerHTML = "";
});

function makeCard(index: number, instanceId: string): MobileBattleCardView {
  const cardId = asCardId(
    `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  );
  const card: CardData = {
    id: cardId,
    name: asCardName(`Fixture Card ${String(index)}`),
    cardNumber: index,
    cardType: index % 2 === 0 ? "Character" : "Event",
    subtype: "Fixture",
    isStarter: false,
    energyCost: index % 4,
    spark: index % 2 === 0 ? index % 5 : null,
    isFast: false,
    renderedText: "A stable fixture ability.",
    imageNumber: index,
    artOwned: true,
  };
  return {
    id: instanceId,
    model: { cardId, displaySnapshot: card },
    exhausted: index % 3 === 0,
    figment: false,
    figmentTitleBar: false,
  };
}

function makeSide(owner: "enemy" | "player", cardOffset: number): MobileBattleSideView {
  return {
    deckCardIds: Array.from(
      { length: 4 },
      (_, index) => `${owner}-deck-${String(index)}`,
    ),
    voidCards: [
      makeCard(cardOffset, `${owner}-void-top`),
      makeCard(cardOffset + 1, `${owner}-void-under`),
    ],
    backRank: [
      { id: `${owner}-back-empty`, card: null },
      {
        id: `${owner}-back-filled`,
        card: makeCard(cardOffset + 2, `${owner}-back-card`),
      },
    ],
    frontRank: [
      {
        id: `${owner}-front-filled`,
        card: makeCard(cardOffset + 3, `${owner}-front-card`),
      },
      { id: `${owner}-front-empty`, card: null },
      {
        id: `${owner}-front-second`,
        card: makeCard(cardOffset + 4, `${owner}-front-second-card`),
      },
    ],
    status: {
      dreamcaller: {
        imageNumber: owner === "enemy" ? "0042" : "0007",
        name: owner === "enemy" ? "Enemy Dreamcaller" : "Player Dreamcaller",
        title: "Fixture",
      },
      currentEnergy: owner === "enemy" ? 2 : 3,
      maxEnergy: owner === "enemy" ? 4 : 3,
      points: owner === "enemy" ? 5 : 6,
    },
  };
}

function makeView(): MobileBattleView {
  return {
    battleId: "battle-mobile-fixture",
    enemyHandCardIds: Array.from(
      { length: 8 },
      (_, index) => `enemy-hand-${String(index)}`,
    ),
    enemy: makeSide("enemy", 1),
    player: makeSide("player", 20),
    playerHand: Array.from({ length: 4 }, (_, index) =>
      makeCard(40 + index, `player-hand-${String(index)}`),
    ),
  };
}

function mount(
  view = makeView(),
  interactions?: MobileBattleInteractions,
): {
  container: HTMLDivElement;
  root: Root;
} {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <TangoRoot>
        <MobileBattleScreen view={view} interactions={interactions} />
      </TangoRoot>,
    );
  });
  return { container, root };
}

describe("MobileBattleScreen", () => {
  it("renders exactly the six mobile battle rows in table order", () => {
    const { container, root } = mount();
    const screen = container.querySelector<HTMLElement>("[data-battle-mobile]");
    const rowNames = Array.from(screen?.children ?? []).map((row) =>
      row.getAttribute("data-battle-mobile-row"),
    );

    expect(screen?.className).toBe("tango");
    expect(screen?.style.position).toBe("fixed");
    expect(screen?.style.height).toBe("100dvh");
    expect(screen?.style.background).toBe("var(--battle-table)");
    expect(rowNames).toEqual([
      "enemy-hand",
      "enemy-zones",
      "enemy-play-area",
      "player-play-area",
      "player-zones",
      "player-hand",
    ]);

    act(() => root.unmount());
  });

  it("places decks, status cards, and topmost-first void piles without visible zone labels", () => {
    const view = makeView();
    const { container, root } = mount(view);

    for (const owner of ["enemy", "player"] as const) {
      const row = container.querySelector<HTMLElement>(
        `[data-battle-mobile-row="${owner}-zones"]`,
      );
      expect(
        Array.from(row?.children ?? []).map((zone) =>
          zone.getAttribute("data-battle-zone"),
        ),
      ).toEqual([`${owner}-deck`, `${owner}-status`, `${owner}-void`]);
      expect(
        row?.querySelector(`[data-testid="${owner}-battle-deck"]`),
      ).not.toBeNull();
      expect(
        row?.querySelector(`[data-testid="${owner}-battle-status"]`),
      ).not.toBeNull();
      const voidZone = row?.querySelector<HTMLElement>(
        `[data-battle-zone="${owner}-void"]`,
      );
      expect(voidZone?.dataset.battleZoneTopCardId).toBe(
        view[owner].voidCards[0]?.id,
      );
      expect(
        voidZone?.querySelector<HTMLElement>("[data-card-pile-layer]")?.dataset
          .battleCardId,
      ).toBe(view[owner].voidCards[0]?.id);
    }

    expect(container.textContent).not.toContain("Enemy deck");
    expect(container.textContent).not.toContain("Player deck");
    expect(container.textContent).not.toContain("Enemy void");
    expect(container.textContent).not.toContain("Player void");

    act(() => root.unmount());
  });

  it("renders dynamic staggered ranks in side-specific depth order", () => {
    const view = makeView();
    const { container, root } = mount(view);

    const enemyArea = container.querySelector<HTMLElement>(
      '[data-battle-mobile-row="enemy-play-area"]',
    );
    const playerArea = container.querySelector<HTMLElement>(
      '[data-battle-mobile-row="player-play-area"]',
    );
    expect(
      Array.from(enemyArea?.children ?? []).map((rank) =>
        rank.getAttribute("data-battle-rank"),
      ),
    ).toEqual(["enemy-back", "enemy-front"]);
    expect(
      Array.from(playerArea?.children ?? []).map((rank) =>
        rank.getAttribute("data-battle-rank"),
      ),
    ).toEqual(["player-front", "player-back"]);
    expect(
      enemyArea?.querySelectorAll("[data-battle-slot-id]"),
    ).toHaveLength(view.enemy.backRank.length + view.enemy.frontRank.length);
    const emptySlot = enemyArea?.querySelector<HTMLElement>(
      '[data-battle-slot-filled="false"]',
    );
    expect(emptySlot?.style.border).toContain("dashed");
    expect(emptySlot?.style.borderRadius).toBe("var(--radius-card)");
    expect(
      playerArea?.querySelector('[data-battle-card-id="player-front-card"]'),
    ).not.toBeNull();

    act(() => root.unmount());
  });

  it("caps the generic face-down enemy fan and keeps every face-up player hand card", () => {
    const view = makeView();
    const { container, root } = mount(view);
    const enemyHand = container.querySelector<HTMLElement>(
      '[data-battle-mobile-row="enemy-hand"]',
    );
    const playerHand = container.querySelector<HTMLElement>(
      '[data-battle-mobile-row="player-hand"]',
    );
    const enemyCards = enemyHand?.querySelectorAll<HTMLElement>(
      '[data-battle-card-zone="enemy-hand"]',
    );
    const playerCards = playerHand?.querySelectorAll<HTMLElement>(
      '[data-battle-card-zone="player-hand"]',
    );

    expect(enemyHand?.dataset.battleHandCount).toBe("8");
    expect(enemyCards).toHaveLength(6);
    expect(enemyCards?.[0]?.querySelector("[data-battle-card-motion]")).not.toBeNull();
    expect(
      Array.from(enemyHand?.querySelectorAll("img") ?? []).map(
        (image) => image.getAttribute("alt"),
      ),
    ).toEqual(Array.from({ length: 6 }, () => "Enemy card"));
    expect(playerHand?.dataset.battleHandCount).toBe("4");
    expect(playerCards).toHaveLength(view.playerHand.length);

    act(() => root.unmount());
  });

  it("contains no controls, phase UI, debug rail, or quest chrome", () => {
    const { container, root } = mount();
    expect(
      container.querySelector("button, input, select, textarea, [role=button]"),
    ).toBeNull();
    expect(
      container.querySelector(
        "[data-quest-status-bar], [data-quest-menu], [data-battle-phase], [data-battle-debug], [data-debug-rail]",
      ),
    ).toBeNull();
    expect(container.querySelector("style")?.textContent).toContain(
      "[data-connected-count]",
    );

    act(() => root.unmount());
  });

  it("routes physical card gestures through intent callbacks without adding controls", () => {
    const interactions = {
      canInteract: true,
      pendingCardId: "player-hand-0",
      onHandCardActivate: vi.fn(),
      onCardDragStart: vi.fn(),
      onCardDragEnd: vi.fn(),
      onSlotDrop: vi.fn(),
      onZoneDrop: vi.fn(),
    };
    const { container, root } = mount(makeView(), interactions);
    const handCard = container.querySelector<HTMLElement>(
      '[data-battle-card-id="player-hand-0"]',
    );
    const battlefieldCard = container.querySelector<HTMLElement>(
      '[data-battle-card-id="player-front-card"]',
    );
    const emptySlot = container.querySelector<HTMLElement>(
      '[data-battle-rank="player-back"] [data-battle-slot-filled="false"]',
    );
    const playerVoid = container.querySelector<HTMLElement>(
      '[data-battle-zone="player-void"]',
    );
    const playerHand = container.querySelector<HTMLElement>(
      '[data-battle-mobile-row="player-hand"]',
    );

    act(() => {
      handCard?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      handCard?.dispatchEvent(new Event("dragstart", { bubbles: true }));
      battlefieldCard?.dispatchEvent(new Event("dragstart", { bubbles: true }));
      emptySlot?.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
      playerVoid?.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
      playerHand?.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
      handCard?.dispatchEvent(new Event("dragend", { bubbles: true }));
    });

    expect(handCard?.draggable).toBe(true);
    expect(interactions.onHandCardActivate).toHaveBeenCalledWith("player-hand-0");
    expect(interactions.onCardDragStart).toHaveBeenNthCalledWith(
      1,
      "player-hand-0",
      "player-hand",
    );
    expect(interactions.onCardDragStart).toHaveBeenNthCalledWith(
      2,
      "player-front-card",
      "battlefield",
    );
    expect(interactions.onSlotDrop).toHaveBeenCalledWith({
      owner: "player",
      rank: "back",
      slotId: "player-back-empty",
    });
    expect(interactions.onZoneDrop).toHaveBeenCalledWith({
      owner: "player",
      zone: "void",
    });
    expect(interactions.onZoneDrop).toHaveBeenCalledWith({
      owner: "player",
      zone: "hand",
    });
    expect(interactions.onCardDragEnd).toHaveBeenCalledTimes(1);
    expect(
      container.querySelector("button, input, select, textarea, [role=button]"),
    ).toBeNull();

    act(() => root.unmount());
  });
});
