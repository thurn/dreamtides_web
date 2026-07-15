// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import { CumulusRoot } from "../CumulusRoot";
import { DOUBLE_TAP_WINDOW_MS } from "../primitives/pointer-gesture";
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
  vi.restoreAllMocks();
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
    showPlayableOutline: false,
  };
}

function makeSide(
  owner: "enemy" | "player",
  cardOffset: number,
): MobileBattleSideView {
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
      { id: `${owner}-back-second-empty`, card: null },
    ],
    frontRank: [
      {
        id: `${owner}-front-filled`,
        card: makeCard(cardOffset + 3, `${owner}-front-card`),
      },
      { id: `${owner}-front-empty`, card: null },
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
    activeSide: "player",
    phase: "day",
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
      <CumulusRoot>
        <MobileBattleScreen view={view} interactions={interactions} />
      </CumulusRoot>,
    );
  });
  return { container, root };
}

describe("MobileBattleScreen", () => {
  it("renders the mobile control row between the battlefield and player status", () => {
    const { container, root } = mount();
    const screen = container.querySelector<HTMLElement>("[data-battle-mobile]");
    const rowNames = Array.from(
      screen?.querySelectorAll(":scope > [data-battle-mobile-row]") ?? [],
    ).map((row) => row.getAttribute("data-battle-mobile-row"));

    expect(screen?.className).toBe("cumulus");
    expect(screen?.style.position).toBe("fixed");
    expect(screen?.style.height).toBe("100dvh");
    expect(screen?.style.backgroundColor).toBe("var(--bg-app)");
    expect(screen?.style.backgroundImage).toContain("battle-background.png");
    expect(screen?.style.backgroundPosition).toBe("center center");
    expect(screen?.style.backgroundRepeat).toBe("no-repeat");
    expect(screen?.style.backgroundSize).toBe("100% 100%");
    expect(screen?.style.touchAction).toBe("none");
    expect(screen?.style.gridTemplateColumns).toBe("minmax(0, 1fr)");
    expect(screen?.style.gridTemplateRows).toBe(
      "minmax(0, 9fr) minmax(0, 12fr) minmax(0, 20fr) minmax(0, 20fr) minmax(0, 12fr) minmax(0, 27fr)",
    );
    const safeAreaBackdrop = screen?.querySelector<HTMLElement>(
      ":scope > [data-battle-mobile-safe-area-backdrop]",
    );
    expect(safeAreaBackdrop?.style.position).toBe("absolute");
    expect(safeAreaBackdrop?.style.inset).toBe("0 0 auto");
    expect(safeAreaBackdrop?.style.height).toBe(
      "var(--safe-area-inset-top)",
    );
    expect(safeAreaBackdrop?.style.background).toBe("var(--bg-app)");
    expect(rowNames).toEqual([
      "enemy-hand",
      "enemy-zones",
      "enemy-play-area",
      "player-play-area",
      "control-row",
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
      expect(row?.style.gridTemplateColumns).toBe(
        "minmax(0, 1fr) max-content minmax(0, 1fr)",
      );
      expect(row?.style.columnGap).toBe("var(--space-7)");
      expect(
        row?.querySelector<HTMLElement>("[data-battle-status-phase-anchor]")
          ?.style.width,
      ).toBe("max-content");
      const deckZone = row?.querySelector<HTMLElement>(
        `[data-battle-zone="${owner}-deck"]`,
      );
      const voidZone = row?.querySelector<HTMLElement>(
        `[data-battle-zone="${owner}-void"]`,
      );
      const pileFrames = row?.querySelectorAll<HTMLElement>(
        "[data-battle-pile-frame]",
      );
      expect(deckZone?.style.height).toBe(voidZone?.style.height);
      expect(pileFrames).toHaveLength(2);
      pileFrames?.forEach((frame) => {
        expect(frame.style.width).toBe("100%");
        expect(frame.style.maxWidth).toBe("90px");
      });
      expect(voidZone?.dataset.battleZoneTopCardId).toBe(
        view[owner].voidCards[0]?.id,
      );
      expect(
        voidZone?.querySelector<HTMLElement>("[data-card-pile-layer]")?.dataset
          .battleCardId,
      ).toBe(view[owner].voidCards[0]?.id);
    }

    const playerZones = container.querySelector<HTMLElement>(
      '[data-battle-mobile-row="player-zones"]',
    );
    const playerHand = container.querySelector<HTMLElement>(
      '[data-battle-mobile-row="player-hand"]',
    );
    expect(playerZones?.style.gridRow).toBe("6");
    expect(playerZones?.style.gridColumn).toBe("1");
    expect(playerHand?.style.gridRow).toBe("6");
    expect(playerHand?.style.gridColumn).toBe("1");
    expect(playerHand?.style.zIndex).toBe("15");
    expect(playerZones?.style.height).toBe("var(--space-12)");
    expect(playerZones?.style.transform).toBe(
      "translateY(calc(-1 * var(--space-7)))",
    );

    expect(container.textContent).not.toContain("Enemy deck");
    expect(container.textContent).not.toContain("Player deck");
    expect(container.textContent).not.toContain("Enemy void");
    expect(container.textContent).not.toContain("Player void");

    act(() => root.unmount());
  });

  it("moves one glowing phase light beneath the active player status", () => {
    const { container, root } = mount();
    const indicator = container.querySelector<HTMLElement>(
      '[data-battle-phase-indicator="player"]',
    );
    const light = indicator?.querySelector<HTMLElement>(
      "[data-battle-phase-light]",
    );
    const core = light?.querySelector<HTMLElement>(
      "[data-battle-phase-light-core]",
    );
    const halo = light?.querySelector<HTMLElement>(
      "[data-battle-phase-light-halo]",
    );
    const streak = light?.querySelector<HTMLElement>(
      "[data-battle-phase-light-streak]",
    );

    expect(
      container.querySelector('[data-battle-phase-indicator="enemy"]'),
    ).toBeNull();
    expect(indicator?.dataset.battleMobilePhase).toBe("day");
    expect(indicator?.getAttribute("aria-label")).toBe(
      "Player turn, Day phase",
    );
    expect(indicator?.parentElement?.dataset.battleStatusPhaseAnchor).toBe("");
    expect(indicator?.style.top).toBe("100%");
    expect(indicator?.style.bottom).toBe("");
    expect(light?.style.width).toBe("6px");
    expect(light?.style.height).toBe("6px");
    expect(light?.style.left).toBe("30%");
    expect(light?.style.transform).toBe("translate(-50%, -50%)");
    expect(light?.style.transition).toContain("var(--motion-object-travel)");
    expect(core?.style.width).toBe("6px");
    expect(core?.style.height).toBe("6px");
    expect(core?.style.backgroundColor).toBe("var(--accent-bright)");
    expect(core?.style.boxShadow).toBe("var(--glow-accent-soft)");
    expect(halo?.style.width).toBe("12px");
    expect(halo?.style.height).toBe("12px");
    expect(halo?.style.backgroundColor).toBe("var(--accent)");
    expect(halo?.style.animation).toBe("");
    expect(streak?.style.width).toBe("16px");
    expect(streak?.style.height).toBe("2px");
    expect(streak?.style.backgroundColor).toBe("var(--accent-bright)");
    expect(streak?.style.animation).toContain("battle-phase-comet-tail");
    expect(streak?.style.animation).toContain("var(--dur-slow)");

    act(() => root.unmount());
  });

  it("places the active opponent phase light above its status", () => {
    const view: MobileBattleView = {
      ...makeView(),
      activeSide: "enemy",
      phase: "challenge",
    };
    const { container, root } = mount(view);
    const indicator = container.querySelector<HTMLElement>(
      '[data-battle-phase-indicator="enemy"]',
    );
    const light = indicator?.querySelector<HTMLElement>(
      "[data-battle-phase-light]",
    );
    const halo = light?.querySelector<HTMLElement>(
      "[data-battle-phase-light-halo]",
    );

    expect(
      container.querySelector('[data-battle-phase-indicator="player"]'),
    ).toBeNull();
    expect(indicator?.dataset.battleMobilePhase).toBe("challenge");
    expect(indicator?.parentElement?.dataset.battleStatusPhaseAnchor).toBe("");
    expect(indicator?.style.top).toBe("0px");
    expect(indicator?.style.bottom).toBe("");
    expect(light?.style.left).toBe("90%");
    expect(light?.style.transform).toBe("translate(-50%, -50%)");
    expect(halo?.style.animation).toContain("battle-phase-challenge-pulse");
    expect(halo?.style.animation).toContain("var(--dur-slow)");

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
    expect(enemyArea?.querySelectorAll("[data-battle-slot-id]")).toHaveLength(
      view.enemy.backRank.length + view.enemy.frontRank.length,
    );
    const emptySlot = enemyArea?.querySelector<HTMLElement>(
      '[data-battle-slot-filled="false"]',
    );
    expect(emptySlot?.style.border).toBe("");
    expect(emptySlot?.style.borderRadius).toBe("");
    expect(
      playerArea?.querySelector('[data-battle-card-id="player-front-card"]'),
    ).not.toBeNull();

    for (const owner of ["enemy", "player"] as const) {
      const backRank = container.querySelector<HTMLElement>(
        `[data-battle-rank="${owner}-back"]`,
      );
      const frontRank = container.querySelector<HTMLElement>(
        `[data-battle-rank="${owner}-front"]`,
      );
      const backSlots = Array.from(
        container.querySelectorAll<HTMLElement>(
          `[data-battle-rank="${owner}-back"] [data-battle-slot-id]`,
        ),
      );
      const frontSlots = Array.from(
        container.querySelectorAll<HTMLElement>(
          `[data-battle-rank="${owner}-front"] [data-battle-slot-id]`,
        ),
      );
      expect(backRank?.style.display).toBe("flex");
      expect(frontRank?.style.display).toBe("flex");
      expect(backRank?.style.justifyContent).toBe("center");
      expect(frontRank?.style.justifyContent).toBe("center");
      expect(backRank?.style.zIndex).toBe("1");
      expect(frontRank?.style.zIndex).toBe("2");
      expect(backRank?.style.height).toBe(frontRank?.style.height);
      expect(backRank?.style.height).toContain("200cqh");
      const backTrack = backRank?.querySelector<HTMLElement>(
        "[data-battle-rank-track]",
      );
      const frontTrack = frontRank?.querySelector<HTMLElement>(
        "[data-battle-rank-track]",
      );
      expect(backTrack?.style.columnGap).toBe("var(--space-2)");
      expect(frontTrack?.style.columnGap).toBe("var(--space-2)");
      expect(backTrack?.style.gridTemplateColumns).toContain("repeat(2,");
      expect(frontTrack?.style.gridTemplateColumns).toContain("repeat(1,");
      expect(backSlots).toHaveLength(frontSlots.length + 1);
      backSlots.forEach((backSlot) => {
        expect(backSlot.style.aspectRatio).toBe("1 / 1");
        expect(backSlot.style.width).toBe(backRank?.style.height);
      });
      frontSlots.forEach((frontSlot) => {
        expect(frontSlot.style.width).toBe(backSlots[0]?.style.width);
        expect(frontSlot.style.position).toBe("relative");
        expect(frontSlot.style.transform).toBe("");
      });
    }

    act(() => root.unmount());
  });

  it("uses art-and-spark faces on the battlefield and complete faces in hand", () => {
    const { container, root } = mount();
    const battlefieldCards = Array.from(
      container.querySelectorAll<HTMLElement>(
        '[data-battle-card-zone$="-rank"] [data-game-card-source]',
      ),
    );
    const handCards = Array.from(
      container.querySelectorAll<HTMLElement>(
        '[data-battle-card-zone="player-hand"] [data-game-card-source]',
      ),
    );

    expect(battlefieldCards).toHaveLength(4);
    battlefieldCards.forEach((card) => {
      expect(card.dataset.revealCompleteGameCard).toBe("false");
      expect(
        card.querySelector<HTMLElement>(".card-view")?.dataset.cardPresentation,
      ).toBe("battlefield");
      expect(card.querySelector('[data-card-energy-anchor]')).toBeNull();
      expect(card.querySelector('[data-testid="card-type-line"]')).toBeNull();
      expect(card.textContent).not.toContain("Fixture Card");
      expect(card.textContent).not.toContain("Fixture");
      expect(card.textContent).not.toContain("A stable fixture ability");
    });
    expect(
      container.querySelectorAll(
        '[data-battle-card-zone$="-rank"] [data-card-stat="spark"]',
      ),
    ).toHaveLength(2);
    expect(handCards).toHaveLength(4);
    handCards.forEach((card) => {
      expect(card.dataset.revealCompleteGameCard).toBe("true");
      expect(
        card.querySelector<HTMLElement>(".card-view")?.dataset.cardPresentation,
      ).toBe("full");
      expect(card.querySelector('[data-card-energy-anchor]')).not.toBeNull();
      expect(card.querySelector('[data-testid="card-type-line"]')).not.toBeNull();
    });

    act(() => root.unmount());
  });

  it("draws the positive selection outline around playable hand cards", () => {
    const view = makeView();
    const outlinedCard = view.playerHand[1];
    if (outlinedCard === undefined) throw new Error("expected a hand card");
    const outlinedView: MobileBattleView = {
      ...view,
      playerHand: view.playerHand.map((card) => ({
        ...card,
        showPlayableOutline: card.id === outlinedCard.id,
      })),
    };
    const { container, root } = mount(outlinedView);
    const handCards = Array.from(
      container.querySelectorAll<HTMLElement>(
        '[data-battle-card-zone="player-hand"] [data-game-card-source]',
      ),
    );

    expect(handCards).toHaveLength(view.playerHand.length);
    expect(handCards[0]?.querySelector<HTMLElement>(".card-view")?.style.boxShadow)
      .not.toContain("var(--positive)");
    expect(handCards[1]?.querySelector<HTMLElement>(".card-view")?.style.boxShadow)
      .toContain("var(--positive)");
    expect(handCards[2]?.querySelector<HTMLElement>(".card-view")?.style.boxShadow)
      .not.toContain("var(--positive)");

    act(() => root.unmount());
  });

  it("centers occupied expanded ranks on one shared responsive card scale", () => {
    const view = makeView();
    const expandedBackRank = Array.from({ length: 6 }, (_, index) => ({
      id: `expanded-back-${String(index)}`,
      card:
        index < 5
          ? makeCard(60 + index, `expanded-back-card-${String(index)}`)
          : null,
    }));
    const expandedFrontRank = Array.from({ length: 5 }, (_, index) => ({
      id: `expanded-front-${String(index)}`,
      card:
        index < 4
          ? makeCard(70 + index, `expanded-front-card-${String(index)}`)
          : null,
    }));
    const expandedView: MobileBattleView = {
      ...view,
      enemy: {
        ...view.enemy,
        backRank: expandedBackRank,
        frontRank: expandedFrontRank,
      },
      player: {
        ...view.player,
        backRank: expandedBackRank,
        frontRank: expandedFrontRank,
      },
    };
    const { container, root } = mount(expandedView);

    for (const owner of ["enemy", "player"] as const) {
      const playArea = container.querySelector<HTMLElement>(
        `[data-battle-play-area="${owner}"]`,
      );
      expect(playArea?.style.containerType).toBe("size");
      for (const rank of ["back", "front"] as const) {
        const rankElement = container.querySelector<HTMLElement>(
          `[data-battle-rank="${owner}-${rank}"]`,
        );
        const track = rankElement?.querySelector<HTMLElement>(
          "[data-battle-rank-track]",
        );
        const slots = Array.from(
          rankElement?.querySelectorAll<HTMLElement>("[data-battle-slot-id]") ??
            [],
        );
        expect(rankElement?.style.height).toContain(
          "88cqw - 4 * var(--space-2)",
        );
        expect(rankElement?.style.height).toContain("200cqh");
        expect(track?.style.gridTemplateColumns).toContain(
          rank === "back" ? "repeat(5," : "repeat(4,",
        );
        expect(track?.style.width).toContain(
          rank === "back" ? "5 * min(" : "4 * min(",
        );
        expect(track?.style.columnGap).toBe("var(--space-2)");
        expect(slots[0]?.style.width).toContain("var(--space-2)");
        expect(slots[0]?.style.width).toContain("200cqh");
        expect(slots[0]?.style.height).toBe("");
      }
    }

    const enemyBack = container.querySelector<HTMLElement>(
      '[data-battle-rank="enemy-back"]',
    );
    const enemyFront = container.querySelector<HTMLElement>(
      '[data-battle-rank="enemy-front"]',
    );
    const playerFront = container.querySelector<HTMLElement>(
      '[data-battle-rank="player-front"]',
    );
    const playerBack = container.querySelector<HTMLElement>(
      '[data-battle-rank="player-back"]',
    );
    expect(enemyFront?.style.bottom).toBe("var(--space-1)");
    expect(playerFront?.style.top).toBe("var(--space-1)");
    expect(enemyBack?.style.bottom).toContain("var(--space-2)");
    expect(playerBack?.style.top).toContain("var(--space-2)");

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
    expect(
      enemyCards?.[0]?.querySelector("[data-battle-card-motion]"),
    ).not.toBeNull();
    expect(enemyCards?.[0]?.style.top).toBe("0px");
    expect(enemyCards?.[0]?.style.bottom).toBe("");
    expect(enemyCards?.[0]?.style.transformOrigin).toBe("50% 0%");
    expect(enemyCards?.[0]?.style.transform).toContain("rotate(6deg)");
    expect(enemyCards?.[enemyCards.length - 1]?.style.transform).toContain(
      "rotate(-6deg)",
    );
    expect(
      Array.from(enemyHand?.querySelectorAll("img") ?? []).map((image) =>
        image.getAttribute("alt"),
      ),
    ).toEqual(Array.from({ length: 6 }, () => "Enemy card"));
    expect(playerHand?.dataset.battleHandCount).toBe("4");
    expect(playerCards).toHaveLength(view.playerHand.length);
    expect(playerCards?.[0]?.parentElement?.style.top).toBe(
      "calc(var(--space-12) - var(--space-7) + var(--space-2))",
    );
    expect(playerCards?.[0]?.parentElement?.style.bottom).toBe("");

    act(() => root.unmount());
  });

  it("places a back arrow to the left of Next Phase in the upper control position", () => {
    const interactions = {
      canInteract: true,
      pendingCardId: null,
      onHandCardActivate: vi.fn(),
      onCardDragStart: vi.fn(),
      onCardDragEnd: vi.fn(),
      onSlotDrop: vi.fn(),
      onZoneDrop: vi.fn(),
      onPreviousPhase: vi.fn(),
      onNextPhase: vi.fn(),
    };
    const { container, root } = mount(makeView(), interactions);
    const controlRow = container.querySelector<HTMLElement>(
      '[data-battle-mobile-row="control-row"]',
    );
    const phaseControls = controlRow?.querySelector<HTMLElement>(
      '[data-battle-phase-controls="row"]',
    );
    const backSlot = phaseControls?.querySelector<HTMLElement>(
      "[data-battle-phase-back]",
    );
    const nextSlot = phaseControls?.querySelector<HTMLElement>(
      "[data-battle-phase-next]",
    );
    const buttons = phaseControls?.querySelectorAll<HTMLButtonElement>("button");
    const previous = buttons?.[0];
    const next = buttons?.[1];

    expect(controlRow?.style.gridRow).toBe("5");
    expect(controlRow?.style.display).toBe("flex");
    expect(controlRow?.style.justifyContent).toBe("flex-end");
    expect(controlRow?.style.paddingInline).toBe("var(--space-4)");
    expect(controlRow?.style.paddingTop).toBe("var(--space-4)");
    expect(controlRow?.style.boxSizing).toBe("border-box");
    expect(phaseControls?.style.display).toBe("flex");
    expect(phaseControls?.style.gap).toBe("var(--space-4)");
    expect(backSlot?.style.position).toBe("");
    expect(nextSlot?.style.width).toBe("120px");
    expect(buttons).toHaveLength(2);
    expect(previous?.getAttribute("aria-label")).toBe("Back");
    expect(previous?.querySelector(".bx-arrow-left")).not.toBeNull();
    expect(previous?.textContent).toBe("");
    expect(next?.textContent).toBe("Next Phase");
    expect(previous?.dataset.glassPlacement).toBe("onMedia");
    expect(next?.dataset.glassPlacement).toBe("onMedia");
    expect(previous?.dataset.glassVariant).toBe("default");
    expect(next?.dataset.glassVariant).toBe("accent");

    act(() => {
      previous?.click();
      next?.click();
    });

    expect(interactions.onPreviousPhase).toHaveBeenCalledTimes(1);
    expect(interactions.onNextPhase).toHaveBeenCalledTimes(1);
    expect(
      container.querySelector(
        "[data-quest-status-bar], [data-quest-menu], [data-battle-phase], [data-debug-rail]",
      ),
    ).toBeNull();
    expect(container.querySelector("style")?.textContent).toContain(
      "[data-connected-count]",
    );

    act(() => root.unmount());
  });

  it("shows the floating debug disclosure alongside the phase controls", () => {
    const { container, root } = mount();
    const controls = container.querySelectorAll(
      "button, input, select, textarea, [role=button]",
    );
    expect(controls).toHaveLength(3);
    expect(
      container.querySelector('[data-testid="battle-debug-menu-trigger"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-testid="battle-debug-fill-grid"]'),
    ).toBeNull();

    act(() => root.unmount());
  });

  it("opens the debug menu and requests a full battlefield and void layout", () => {
    const onFillBattlefieldPreview = vi.fn();
    const onFillTwentyCardBattlefieldPreview = vi.fn();
    const interactions = {
      canInteract: true,
      pendingCardId: null,
      onHandCardActivate: vi.fn(),
      onCardDragStart: vi.fn(),
      onCardDragEnd: vi.fn(),
      onSlotDrop: vi.fn(),
      onZoneDrop: vi.fn(),
      onPreviousPhase: vi.fn(),
      onNextPhase: vi.fn(),
      onFillBattlefieldPreview,
      onFillTwentyCardBattlefieldPreview,
    };
    const { container, root } = mount(makeView(), interactions);
    const trigger = container.querySelector<HTMLButtonElement>(
      '[data-testid="battle-debug-menu-trigger"]',
    );

    expect(trigger?.getAttribute("aria-expanded")).toBe("false");

    act(() => trigger?.click());

    expect(trigger?.getAttribute("aria-expanded")).toBe("true");
    const fill = container.querySelector<HTMLButtonElement>(
      '[data-testid="battle-debug-fill-grid"]',
    );
    expect(fill?.textContent).toContain("Fill Battlefield + Voids");
    expect(
      container.querySelector(
        '[data-testid="battle-debug-fill-twenty-player"]',
      )?.textContent,
    ).toContain("Fill 20 vs 9 + Voids");

    act(() => fill?.click());

    expect(onFillBattlefieldPreview).toHaveBeenCalledTimes(1);
    expect(onFillTwentyCardBattlefieldPreview).not.toHaveBeenCalled();
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    expect(
      container.querySelector('[data-testid="battle-debug-fill-grid"]'),
    ).toBeNull();

    act(() => root.unmount());
  });

  it("requests the twenty-player-card stress layout from the debug menu", () => {
    const onFillTwentyCardBattlefieldPreview = vi.fn();
    const interactions = {
      canInteract: true,
      pendingCardId: null,
      onHandCardActivate: vi.fn(),
      onCardDragStart: vi.fn(),
      onCardDragEnd: vi.fn(),
      onSlotDrop: vi.fn(),
      onZoneDrop: vi.fn(),
      onPreviousPhase: vi.fn(),
      onNextPhase: vi.fn(),
      onFillBattlefieldPreview: vi.fn(),
      onFillTwentyCardBattlefieldPreview,
    };
    const { container, root } = mount(makeView(), interactions);

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="battle-debug-menu-trigger"]',
        )
        ?.click();
    });

    const fillTwenty = container.querySelector<HTMLButtonElement>(
      '[data-testid="battle-debug-fill-twenty-player"]',
    );
    expect(fillTwenty?.textContent).toContain("Fill 20 vs 9 + Voids");

    act(() => fillTwenty?.click());

    expect(onFillTwentyCardBattlefieldPreview).toHaveBeenCalledTimes(1);
    expect(interactions.onFillBattlefieldPreview).not.toHaveBeenCalled();
    expect(
      container.querySelector(
        '[data-testid="battle-debug-fill-twenty-player"]',
      ),
    ).toBeNull();

    act(() => root.unmount());
  });

  it("routes physical card gestures through intent callbacks without adding gameplay controls", () => {
    const interactions = {
      canInteract: true,
      pendingCardId: "player-hand-0",
      onHandCardActivate: vi.fn(),
      onCardDragStart: vi.fn(),
      onCardDragEnd: vi.fn(),
      onSlotDrop: vi.fn(),
      onZoneDrop: vi.fn(),
      onPreviousPhase: vi.fn(),
      onNextPhase: vi.fn(),
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
    expect(playerHand?.style.overflow).toBe("visible");

    act(() => {
      handCard?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      handCard?.dispatchEvent(new Event("dragstart", { bubbles: true }));
      battlefieldCard?.dispatchEvent(new Event("dragstart", { bubbles: true }));
      emptySlot?.dispatchEvent(
        new Event("drop", { bubbles: true, cancelable: true }),
      );
      playerVoid?.dispatchEvent(
        new Event("drop", { bubbles: true, cancelable: true }),
      );
      playerHand?.dispatchEvent(
        new Event("drop", { bubbles: true, cancelable: true }),
      );
      handCard?.dispatchEvent(new Event("dragend", { bubbles: true }));
    });

    expect(handCard?.draggable).toBe(true);
    expect(interactions.onHandCardActivate).toHaveBeenCalledWith(
      "player-hand-0",
    );
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
    expect(container.querySelectorAll("button")).toHaveLength(3);

    act(() => root.unmount());
  });

  it("distinguishes a single hand-card tap from double-tap debug gestures on every face-up card", () => {
    vi.useFakeTimers();
    const interactions = {
      canInteract: true,
      pendingCardId: null,
      onHandCardActivate: vi.fn(),
      onCardDebugActivate: vi.fn(),
      onCardDragStart: vi.fn(),
      onCardDragEnd: vi.fn(),
      onSlotDrop: vi.fn(),
      onZoneDrop: vi.fn(),
      onPreviousPhase: vi.fn(),
      onNextPhase: vi.fn(),
    };
    const { container, root } = mount(makeView(), interactions);
    const handCard = container.querySelector<HTMLElement>(
      '[data-battle-card-id="player-hand-0"]',
    );
    const battlefieldCard = container.querySelector<HTMLElement>(
      '[data-battle-card-id="player-front-card"]',
    );

    act(() => {
      handCard?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      vi.advanceTimersByTime(300);
    });
    expect(interactions.onHandCardActivate).toHaveBeenCalledWith(
      "player-hand-0",
    );
    expect(interactions.onCardDebugActivate).not.toHaveBeenCalled();

    interactions.onHandCardActivate.mockClear();
    act(() => {
      handCard?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      handCard?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(interactions.onHandCardActivate).not.toHaveBeenCalled();
    expect(interactions.onCardDebugActivate).toHaveBeenCalledWith(
      "player-hand-0",
      "player-hand",
    );

    interactions.onCardDebugActivate.mockClear();
    act(() => {
      battlefieldCard?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      battlefieldCard?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(interactions.onCardDebugActivate).toHaveBeenCalledWith(
      "player-front-card",
      "battlefield",
    );

    act(() => root.unmount());
    vi.useRealTimers();
  });

  it("plays a quick touch tap but suppresses the click once a 300ms long press is detected", () => {
    vi.useFakeTimers();
    const interactions = {
      canInteract: true,
      pendingCardId: null,
      onHandCardActivate: vi.fn(),
      onCardDebugActivate: vi.fn(),
      onCardDragStart: vi.fn(),
      onCardDragEnd: vi.fn(),
      onSlotDrop: vi.fn(),
      onZoneDrop: vi.fn(),
      onPreviousPhase: vi.fn(),
      onNextPhase: vi.fn(),
    };
    const { container, root } = mount(makeView(), interactions);
    const handCard = container.querySelector<HTMLElement>(
      '[data-battle-card-id="player-hand-0"]',
    );
    const revealSource = handCard?.querySelector<HTMLElement>(
      "[data-game-card-source]",
    );
    const dispatchTouch = (type: "pointerdown" | "pointerup", pointerId: number) => {
      revealSource?.dispatchEvent(
        new PointerEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: 20,
          clientY: 30,
          pointerId,
          pointerType: "touch",
        }),
      );
    };

    act(() => {
      dispatchTouch("pointerdown", 41);
      vi.advanceTimersByTime(299);
      dispatchTouch("pointerup", 41);
      handCard?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      vi.advanceTimersByTime(DOUBLE_TAP_WINDOW_MS);
    });
    expect(interactions.onHandCardActivate).toHaveBeenCalledOnce();

    interactions.onHandCardActivate.mockClear();
    act(() => {
      dispatchTouch("pointerdown", 42);
      vi.advanceTimersByTime(300);
      dispatchTouch("pointerup", 42);
      handCard?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      vi.advanceTimersByTime(DOUBLE_TAP_WINDOW_MS);
    });
    expect(interactions.onHandCardActivate).not.toHaveBeenCalled();
    expect(interactions.onCardDebugActivate).not.toHaveBeenCalled();

    act(() => root.unmount());
    vi.useRealTimers();
  });

  it("drags a hand card by touch into the void without panning or leaving its reveal open", () => {
    const interactions = {
      canInteract: true,
      pendingCardId: null,
      onHandCardActivate: vi.fn(),
      onCardDragStart: vi.fn(),
      onCardDragEnd: vi.fn(),
      onSlotDrop: vi.fn(),
      onZoneDrop: vi.fn(),
      onPreviousPhase: vi.fn(),
      onNextPhase: vi.fn(),
    };
    const { container, root } = mount(makeView(), interactions);
    const handCard = container.querySelector<HTMLElement>(
      '[data-battle-card-id="player-hand-0"]',
    );
    const revealSource = handCard?.querySelector<HTMLElement>(
      "[data-game-card-source]",
    );
    const playerVoid = container.querySelector<HTMLElement>(
      '[data-battle-zone="player-void"]',
    );
    let pointerEventsDuringHitTest = "";
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => {
        pointerEventsDuringHitTest = handCard?.style.pointerEvents ?? "";
        return playerVoid;
      }),
    });
    expect(handCard?.draggable).toBe(true);
    expect(
      handCard?.querySelector(":scope > [data-battle-card-motion]"),
    ).not.toBeNull();
    if (handCard?.parentElement !== null && handCard?.parentElement !== undefined) {
      handCard.parentElement.style.transform = "matrix(0, 1, -1, 0, 0, 0)";
    }

    act(() => {
      revealSource?.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          clientX: 20,
          clientY: 30,
          pointerId: 7,
          pointerType: "touch",
        }),
      );
    });
    expect(revealSource?.dataset.revealActive).toBe("true");
    expect(handCard?.draggable).toBe(false);

    const dragMove = new PointerEvent("pointermove", {
      bubbles: true,
      cancelable: true,
      clientX: 44,
      clientY: 70,
      pointerId: 7,
      pointerType: "touch",
    });
    let transformDuringPointerMove = "";
    act(() => {
      handCard?.dispatchEvent(dragMove);
      transformDuringPointerMove = handCard?.style.transform ?? "";
    });

    expect(dragMove.defaultPrevented).toBe(true);
    expect(transformDuringPointerMove).toContain(
      "translate3d(40px, -24px, 0)",
    );
    expect(interactions.onCardDragStart).toHaveBeenCalledWith(
      "player-hand-0",
      "player-hand",
    );
    expect(revealSource?.dataset.revealActive).toBe("false");
    expect(handCard?.dataset.battleTouchDragging).toBe("true");
    expect(handCard?.style.pointerEvents).toBe("");
    expect(handCard?.style.transform).toContain("translate3d(40px, -24px, 0)");

    act(() => {
      handCard?.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          clientX: 44,
          clientY: 70,
          pointerId: 7,
          pointerType: "touch",
        }),
      );
    });

    expect(handCard?.draggable).toBe(true);
    expect(interactions.onZoneDrop).toHaveBeenCalledWith({
      owner: "player",
      zone: "void",
    });
    expect(interactions.onCardDragEnd).toHaveBeenCalledTimes(1);
    expect(pointerEventsDuringHitTest).toBe("none");
    expect(handCard?.dataset.battleTouchDragging).toBe("false");
    expect(handCard?.style.transform).toBe("");

    act(() => root.unmount());
  });
});
