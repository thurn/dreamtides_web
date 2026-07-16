// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { asCardId, asCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import { CumulusRoot } from "../CumulusRoot";
import { resolveColor } from "../primitives/color";
import { DOUBLE_TAP_WINDOW_MS } from "../primitives/pointer-gesture";
import {
  MobileBattleScreen,
  type MobileBattleCardView,
  type MobileBattleInteractions,
  type MobileBattleSideView,
  type MobileBattleView,
} from "./MobileBattleScreen";

function mockDesktopViewport(matches: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

beforeEach(() => {
  (
    globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true;
  mockDesktopViewport(false);
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
    figmentCount: 1,
    storedTime: 0,
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
    banishedCardCount: 0,
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
    aiApproval: null,
    cardPicker: null,
    choicePrompt: null,
    dreamwell: null,
    activeSide: "player",
    phase: "day",
    enemyHandCardIds: Array.from(
      { length: 8 },
      (_, index) => `enemy-hand-${String(index)}`,
    ),
    enemyHand: Array.from({ length: 8 }, (_, index) =>
      makeCard(60 + index, `enemy-hand-${String(index)}`),
    ),
    enemy: makeSide("enemy", 1),
    player: makeSide("player", 20),
    playerHand: Array.from({ length: 4 }, (_, index) =>
      makeCard(40 + index, `player-hand-${String(index)}`),
    ),
    result: null,
    inspector: {
      opponentName: "Enemy Dreamcaller",
      turn: "3",
      phase: "Day",
      activeSide: "Player",
      result: "In progress",
      nextDreamwellOrder: "4",
      isOpponentHandRevealed: false,
      isPlayerHandHidden: false,
      sides: {
        player: { side: "player", heading: "Your", points: 6, currentEnergy: 3, maxEnergy: 3, zones: { hand: 4, deck: 4, void: 2, banished: 0, backRank: 1, frontRank: 1 }, canDiscard: true, canShuffle: true },
        enemy: { side: "enemy", heading: "Enemy", points: 5, currentEnergy: 2, maxEnergy: 4, zones: { hand: 8, deck: 4, void: 2, banished: 0, backRank: 1, frontRank: 1 }, canDiscard: true, canShuffle: true },
      },
      ai: null,
    },
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
  it("keeps battle-instance status readable on battlefield and hand cards", () => {
    const view = makeView();
    const battlefieldCard = view.player.frontRank[0]?.card;
    const handCard = view.playerHand[0];
    if (battlefieldCard === null || battlefieldCard === undefined || handCard === undefined) {
      throw new Error("fixture cards missing");
    }
    const statusBattlefieldCard: MobileBattleCardView = {
      ...battlefieldCard,
      exhausted: true,
      figment: true,
      figmentCount: 3,
      storedTime: 4,
    };
    const statusHandCard: MobileBattleCardView = {
      ...handCard,
      exhausted: true,
      figmentCount: 2,
      storedTime: 5,
    };
    const statusView: MobileBattleView = {
      ...view,
      player: {
        ...view.player,
        frontRank: [
          { ...view.player.frontRank[0], card: statusBattlefieldCard },
          ...view.player.frontRank.slice(1),
        ],
      },
      playerHand: [statusHandCard, ...view.playerHand.slice(1)],
    };
    const { container, root } = mount(statusView);

    const battlefield = container.querySelector<HTMLElement>(
      '[data-battle-card-id="player-front-card"][data-battle-card-zone="player-front-rank"]',
    );
    const hand = container.querySelector<HTMLElement>(
      '[data-battle-card-id="player-hand-0"][data-battle-card-zone="player-hand"]',
    );
    expect(battlefield?.dataset.battleCardExhausted).toBe("true");
    expect(battlefield?.dataset.battleCardStoredTime).toBe("4");
    expect(battlefield?.dataset.battleCardFigmentCount).toBe("3");
    expect(battlefield?.querySelector('[aria-label="Exhausted"]')).not.toBeNull();
    expect(battlefield?.querySelector('[aria-label="3 Figments"]')).not.toBeNull();
    expect(
      battlefield?.querySelector('[aria-label="4 stored-time counters"]'),
    ).not.toBeNull();
    expect(
      battlefield?.querySelector('[data-battle-card-status="figment-count"]')
        ?.textContent,
    ).toBe("x3");
    const figmentBadge = battlefield?.querySelector<HTMLElement>(
      '[data-battle-card-status="figment-count"]',
    );
    expect(figmentBadge?.style.background).toBe("var(--surface-status-badge)");
    expect(figmentBadge?.style.borderColor).toBe("var(--text-on-accent)");
    expect(figmentBadge?.style.borderRadius).toBe("var(--radius-status-badge)");
    expect(figmentBadge?.style.color).toBe("var(--text-on-accent)");
    const exhaustedIcon = battlefield?.querySelector<HTMLElement>(
      '[data-battle-card-status="exhausted"] i',
    );
    const exhaustedBadge = battlefield?.querySelector<HTMLElement>(
      '[data-battle-card-status="exhausted"]',
    );
    const whiteStyle = document.createElement("span").style;
    whiteStyle.color = resolveColor("white");
    expect(exhaustedBadge?.style.border).toContain("var(--text-on-accent)");
    expect(exhaustedIcon?.style.color).toBe(whiteStyle.color);
    const storedTimeBadge = battlefield?.querySelector<HTMLElement>(
      '[data-battle-card-status="stored-time"]',
    );
    const storedTimeChip = storedTimeBadge?.querySelector<HTMLElement>(
      '[data-resource-chip-kind="counter"]',
    );
    expect(storedTimeChip?.dataset.resourceChipSize).toBe("sm");
    expect(storedTimeChip?.textContent).toBe("4");
    expect(storedTimeChip?.firstElementChild?.nodeName).toBe("SPAN");
    expect(storedTimeChip?.lastElementChild?.nodeName).toBe("I");
    expect(
      (storedTimeChip?.lastElementChild as HTMLElement | null)?.style.color,
    ).toBe("inherit");
    expect(storedTimeChip?.style.gap).toBe("0px");
    expect(storedTimeBadge?.style.background).toBe("var(--surface-status-badge)");
    expect(storedTimeBadge?.style.border).toContain("var(--text-on-accent)");
    expect(storedTimeBadge?.style.borderRadius).toBe("var(--radius-status-badge)");
    expect(
      battlefield?.querySelector('[data-battle-card-status="automated"]'),
    ).toBeNull();
    expect(
      battlefield?.querySelector<HTMLElement>("[data-battle-card-motion]")
        ?.style.filter,
    ).toContain("grayscale");

    expect(hand?.querySelector('[aria-label="Exhausted"]')).not.toBeNull();
    expect(hand?.querySelector('[aria-label="2 Figments"]')).not.toBeNull();
    expect(
      hand?.querySelector('[aria-label="5 stored-time counters"]'),
    ).not.toBeNull();
    expect(
      hand?.querySelector('[data-battle-card-status="figment-count"]')
        ?.textContent,
    ).toBe("x2");

    const committedView: MobileBattleView = {
      ...statusView,
      player: {
        ...statusView.player,
        frontRank: [
          {
            ...statusView.player.frontRank[0],
            card: {
              ...statusBattlefieldCard,
              exhausted: false,
              figmentCount: 1,
              storedTime: 0,
            },
          },
          ...statusView.player.frontRank.slice(1),
        ],
      },
    };
    act(() => {
      root.render(
        <CumulusRoot>
          <MobileBattleScreen view={committedView} />
        </CumulusRoot>,
      );
    });
    const updatedBattlefield = container.querySelector<HTMLElement>(
      '[data-battle-card-id="player-front-card"][data-battle-card-zone="player-front-rank"]',
    );
    expect(updatedBattlefield?.dataset.battleCardExhausted).toBe("false");
    expect(updatedBattlefield?.dataset.battleCardStoredTime).toBe("0");
    expect(updatedBattlefield?.dataset.battleCardFigmentCount).toBe("1");
    expect(updatedBattlefield?.querySelector("[data-battle-card-status]")).toBeNull();

    act(() => root.unmount());
  });

  it("places the result surface above the battle shell and forwards its actions", () => {
    const onResultAction = vi.fn();
    const { container, root } = mount(
      {
        ...makeView(),
        result: { outcome: "defeat", dismissed: false },
      },
      {
        canInteract: false,
        pendingCardId: null,
        onHandCardActivate: vi.fn(),
        onCardDragStart: vi.fn(),
        onCardDragEnd: vi.fn(),
        onSlotDrop: vi.fn(),
        onZoneDrop: vi.fn(),
        onPreviousPhase: vi.fn(),
        onNextPhase: vi.fn(),
        onResultAction,
      },
    );

    expect(container.querySelector("[data-battle-mobile]")).not.toBeNull();
    expect(
      container.querySelector('[data-battle-result-surface="defeat"]'),
    ).not.toBeNull();
    act(() => {
      container
        .querySelector<HTMLButtonElement>('[data-testid="battle-result-inspect"]')
        ?.click();
    });
    expect(onResultAction).toHaveBeenCalledWith("dismiss");

    act(() => root.unmount());
  });

  it("overlaps a static Dreamwell card above the player status display", () => {
    const cardId = asCardId("3a4293da-55a1-4094-898a-df402ffa1c92");
    const view: MobileBattleView = {
      ...makeView(),
      dreamwell: {
        side: "enemy",
        model: {
          cardId,
          displaySnapshot: {
            id: cardId,
            name: "Fixture Beacon",
            renderedText: "Draw a card.",
            energyAdded: 2,
            imageNumber: 42,
          },
        },
      },
    };
    const { container, root } = mount(view);

    const playerStatus = container.querySelector<HTMLElement>(
      '[data-battle-zone="player-status"]',
    );
    const layer = playerStatus?.querySelector<HTMLElement>(
      "[data-battle-dreamwell-layer]",
    );
    expect(layer?.dataset.battleDreamwellSide).toBe("enemy");
    expect(layer?.style.position).toBe("absolute");
    expect(layer?.style.bottom).toBe(
      "calc(100% + var(--space-3) + var(--space-12) + var(--space-4))",
    );
    expect(layer?.style.pointerEvents).toBe("none");
    expect(layer?.style.animation).toBe("none");
    expect(layer?.style.transition).toBe("none");
    expect(
      layer?.querySelector<HTMLElement>("[data-dreamwell-card]")?.dataset
        .dreamwellCard,
    ).toBe(cardId);
    expect(
      container.querySelector('[data-battle-zone="enemy-status"] [data-battle-dreamwell-layer]'),
    ).toBeNull();

    act(() => root.unmount());
  });

  it("renders the mobile control row between the battlefield and player status", () => {
    const { container, root } = mount();
    const screen = container.querySelector<HTMLElement>("[data-battle-mobile]");
    const rowNames = Array.from(
      screen?.querySelectorAll(":scope > [data-battle-mobile-row]") ?? [],
    ).map((row) => row.getAttribute("data-battle-mobile-row"));

    expect(screen?.className).toBe("cumulus");
    expect(screen?.style.position).toBe("relative");
    expect(screen?.style.height).toBe("100dvh");
    expect(screen?.style.backgroundColor).toBe("var(--bg-app)");
    expect(screen?.style.backgroundImage).toBe("");
    expect(screen?.style.touchAction).toBe("none");
    expect(screen?.style.gridTemplateColumns).toBe("minmax(0, 1fr)");
    expect(screen?.style.gridTemplateRows).toBe(
      "minmax(0, 9fr) minmax(0, 12fr) minmax(0, 20fr) minmax(0, 20fr) minmax(0, 12fr) minmax(0, 27fr)",
    );
    const backdrop = screen?.querySelector<HTMLElement>(
      ":scope > [data-battle-backdrop]",
    );
    expect(backdrop?.style.width).toBe("100%");
    expect(backdrop?.style.height).toBe("100%");
    expect(backdrop?.style.transform).toBe("translate(-50%, -50%)");
    expect(backdrop?.style.backgroundImage).toContain("battle-background.png");
    expect(backdrop?.style.backgroundPosition).toBe("center center");
    expect(backdrop?.style.backgroundRepeat).toBe("no-repeat");
    expect(backdrop?.style.backgroundSize).toBe("100% 100%");
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

  it("renders a landscape desktop composition with a rotated backdrop and flatter hand", () => {
    mockDesktopViewport(true);
    const { container, root } = mount();
    const screen = container.querySelector<HTMLElement>("[data-battle-mobile]");
    const backdrop = screen?.querySelector<HTMLElement>(
      ":scope > [data-battle-backdrop]",
    );
    const enemyZones = container.querySelector<HTMLElement>(
      '[data-battle-mobile-row="enemy-zones"]',
    );
    const playerZones = container.querySelector<HTMLElement>(
      '[data-battle-mobile-row="player-zones"]',
    );
    const playerHand = container.querySelector<HTMLElement>(
      '[data-battle-mobile-row="player-hand"]',
    );
    const enemyHand = container.querySelector<HTMLElement>(
      '[data-battle-mobile-row="enemy-hand"]',
    );
    const firstEnemyCard = enemyHand?.querySelector<HTMLElement>(
      '[data-battle-card-id="enemy-hand-0"]',
    );
    const firstHandCard = playerHand?.querySelector<HTMLElement>(
      '[data-battle-card-id="player-hand-0"]',
    )?.parentElement;
    const lastHandCard = playerHand?.querySelector<HTMLElement>(
      '[data-battle-card-id="player-hand-3"]',
    )?.parentElement;
    const controls = container.querySelector<HTMLElement>(
      '[data-battle-mobile-row="control-row"]',
    );
    const phaseControls = controls?.querySelector<HTMLElement>(
      '[data-battle-phase-controls="row"]',
    );
    const desktopBackSlots = container.querySelectorAll(
      '[data-battle-rank="player-back"] [data-battle-slot-id]',
    );
    const desktopFrontSlots = container.querySelectorAll(
      '[data-battle-rank="player-front"] [data-battle-slot-id]',
    );

    expect(screen?.dataset.battleLayout).toBe("desktop");
    expect(screen?.style.backgroundImage).toBe("");
    expect(screen?.style.gridTemplateRows).toBe(
      "minmax(0, 8fr) minmax(0, 11fr) minmax(0, 23fr) minmax(0, 23fr) minmax(0, 11fr) minmax(0, 24fr)",
    );
    expect(backdrop?.style.width).toBe("100vh");
    expect(backdrop?.style.height).toBe("100vw");
    expect(backdrop?.style.transform).toBe(
      "translate(-50%, -50%) rotate(90deg)",
    );
    expect(backdrop?.style.backgroundImage).toContain("battle-background.png");
    expect(enemyZones?.style.width).toBe("100%");
    expect(enemyZones?.style.maxWidth).toBe("540px");
    expect(enemyZones?.style.boxSizing).toBe("border-box");
    expect(enemyZones?.style.columnGap).toBe("var(--space-12)");
    expect(playerZones?.style.gridRow).toBe("5");
    expect(playerZones?.style.transform).toContain("translateY(max(0px");
    expect(playerZones?.style.height).toBe("");
    expect(
      playerZones?.querySelector<HTMLElement>(
        "[data-battle-status-phase-anchor]",
      )?.style.height,
    ).toBe("");
    expect(
      playerZones?.querySelector<HTMLElement>(
        '[data-battle-zone="player-status"]',
      )?.style.alignItems,
    ).toBe("center");
    expect(enemyHand?.style.display).toBe("flex");
    expect(enemyHand?.style.justifyContent).toBe("center");
    expect(enemyHand?.style.gap).toBe("var(--space-2)");
    expect(firstEnemyCard?.style.position).toBe("relative");
    expect(firstEnemyCard?.style.left).toBe("");
    expect(firstEnemyCard?.style.transform).not.toContain("translateX");
    expect(playerHand?.style.display).toBe("flex");
    expect(playerHand?.style.justifyContent).toBe("center");
    expect(playerHand?.style.gap).toBe("var(--space-2)");
    expect(playerHand?.style.paddingTop).toBe("var(--space-8)");
    expect(playerHand?.style.paddingLeft).toContain(
      "--battle-hud-start-clearance",
    );
    expect(playerHand?.style.paddingRight).toContain(
      "--battle-hud-end-clearance",
    );
    const playerCards = playerHand?.querySelectorAll<HTMLElement>(
      '[data-battle-card-zone="player-hand"]',
    );
    const playerSlots = playerHand?.querySelectorAll<HTMLElement>(
      "[data-battle-player-hand-slot]",
    );
    expect(playerSlots).toHaveLength(playerCards?.length ?? 0);
    expect(playerSlots?.[0]?.style.flex).toBe("0 1 auto");
    expect(playerSlots?.[0]?.style.minWidth).toBe("0px");
    expect(playerCards?.[0]?.parentElement?.style.left).toBe("0px");
    expect(playerCards?.[1]?.parentElement?.style.left).toBe("50%");
    expect(playerHand?.style.transform).toBe(
      "translateY(var(--space-8))",
    );
    expect(playerHand?.style.pointerEvents).toBe("none");
    expect(controls?.style.justifyContent).toBe("center");
    expect(controls?.style.gridColumn).toBe("1");
    expect(controls?.style.width).toBe("100%");
    expect(controls?.style.containerType).toBe("inline-size");
    expect(controls?.style.paddingInline).toBe("0px");
    expect(phaseControls?.style.justifyContent).toBe("flex-end");
    expect(phaseControls?.style.width).toContain("46dvh");
    expect(controls?.style.transform).toBe("");
    expect(controls?.style.pointerEvents).toBe("none");
    expect(phaseControls?.style.pointerEvents).toBe("auto");
    expect(desktopBackSlots).toHaveLength(10);
    expect(desktopFrontSlots).toHaveLength(9);
    expect(firstHandCard?.style.position).toBe("absolute");
    expect(firstHandCard?.style.height).toBe("100%");
    expect(firstHandCard?.style.pointerEvents).toBe("auto");
    expect(firstHandCard?.style.left).toBe("0px");
    expect(firstHandCard?.style.top).toBe("0px");
    expect(lastHandCard?.style.right).toBe("0px");
    expect(firstHandCard?.style.transform).toContain("rotate(-4deg)");
    expect(lastHandCard?.style.transform).toContain("rotate(4deg)");
    expect(firstHandCard?.style.transform).toContain("translateY(2%)");
    expect(lastHandCard?.style.transform).toContain("translateY(2%)");

    act(() => root.unmount());
  });

  it("opens the unified rail on desktop and dispatches side-scoped actions", () => {
    mockDesktopViewport(true);
    const onInspectorAction = vi.fn();
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
      onInspectorAction,
    };
    const { container, root } = mount(makeView(), interactions);

    expect(container.querySelector('[data-battle-inspector="docked"]')).not.toBeNull();
    expect(container.querySelector('[data-battle-debug="player-state-panel"]')).toBeNull();
    expect(container.textContent).toContain("Battle Snapshot");
    expect(container.textContent).toContain("Your Resources");
    expect(container.textContent).toContain("Back Rank");
    expect(container.textContent).not.toContain("Stack cards");

    act(() => {
      container.querySelector<HTMLButtonElement>('[data-testid="battle-inspector-draw-player"]')?.click();
      Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent === "Open Banished")
        ?.click();
      const enemyTab = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
        .find((button) => button.textContent === "Enemy");
      enemyTab?.click();
    });

    expect(onInspectorAction).toHaveBeenCalledWith({ kind: "draw", side: "player" });
    expect(onInspectorAction).toHaveBeenCalledWith({
      kind: "open-zone",
      side: "player",
      zone: "banished",
    });
    expect(onInspectorAction).toHaveBeenCalledWith({ kind: "side-selected", side: "enemy" });
    expect(container.textContent).toContain("Enemy Resources");

    act(() => root.unmount());
  });

  it("opens both history drawers from the desktop inspector rail", () => {
    mockDesktopViewport(true);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const onInspectorAction = vi.fn();
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
      onInspectorAction,
    };
    const { container, root } = mount(makeView(), interactions);

    expect(container.textContent).toContain("History");
    act(() => {
      container.querySelector<HTMLButtonElement>(
        '[data-testid="battle-inspector-open-battle-log"]',
      )?.click();
    });
    expect(onInspectorAction).toHaveBeenCalledWith({ kind: "open-battle-log" });
    expect(container.querySelector('[data-battle-inspector="docked"]')).toBeNull();

    act(() => {
      container.querySelector<HTMLButtonElement>(
        '[data-testid="battle-inspector-trigger"]',
      )?.click();
    });
    act(() => {
      container.querySelector<HTMLButtonElement>(
        '[data-testid="battle-inspector-open-dreamwell-history"]',
      )?.click();
    });
    expect(onInspectorAction).toHaveBeenCalledWith({
      kind: "open-dreamwell-history",
    });
    expect(container.querySelector('[data-battle-inspector="docked"]')).toBeNull();

    act(() => root.unmount());
  });

  it("keeps the inspector closed initially in the takeover layout", () => {
    mockDesktopViewport(false);
    const { container, root } = mount();

    expect(container.querySelector('[data-battle-inspector]')).toBeNull();
    expect(container.querySelector('[data-testid="battle-inspector-trigger"]')).not.toBeNull();

    act(() => root.unmount());
  });

  it("opens a full-screen takeover with collapsed secondary sections and restores trigger focus on Escape", () => {
    mockDesktopViewport(false);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => { callback(0); return 1; });
    const { container, root } = mount();
    const trigger = container.querySelector<HTMLButtonElement>('[data-testid="battle-inspector-trigger"]');
    trigger?.focus();
    act(() => trigger?.click());

    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(container.querySelector('[data-battle-inspector="takeover"]')).not.toBeNull();
    expect(container.querySelector('[data-disclosure-expanded="true"]')).toBeNull();

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    act(() => root.unmount());
  });

  it("dismisses the mobile inspector takeover before opening Foresee", () => {
    mockDesktopViewport(false);
    const onInspectorAction = vi.fn();
    const { container, root } = mount(makeView(), {
      canInteract: true,
      pendingCardId: null,
      onHandCardActivate: vi.fn(),
      onCardDragStart: vi.fn(),
      onCardDragEnd: vi.fn(),
      onSlotDrop: vi.fn(),
      onZoneDrop: vi.fn(),
      onPreviousPhase: vi.fn(),
      onNextPhase: vi.fn(),
      onInspectorAction,
    });

    act(() => {
      container.querySelector<HTMLButtonElement>(
        '[data-testid="battle-inspector-trigger"]',
      )?.click();
    });
    expect(container.querySelector('[data-battle-inspector="takeover"]')).not.toBeNull();

    const foresee = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent === "Foresee");
    act(() => foresee?.click());

    expect(onInspectorAction).toHaveBeenCalledWith({ kind: "foresee", side: "player" });
    expect(container.querySelector('[data-battle-inspector="takeover"]')).toBeNull();
    act(() => root.unmount());
  });

  it("disables discard and shuffle from live side availability", () => {
    mockDesktopViewport(true);
    const view = makeView();
    const constrained: MobileBattleView = {
      ...view,
      inspector: {
        ...view.inspector,
        sides: {
          ...view.inspector.sides,
          player: { ...view.inspector.sides.player, canDiscard: false, canShuffle: false },
        },
      },
    };
    const { container, root } = mount(constrained, {
      canInteract: true,
      pendingCardId: null,
      onHandCardActivate: vi.fn(),
      onCardDragStart: vi.fn(),
      onCardDragEnd: vi.fn(),
      onSlotDrop: vi.fn(),
      onZoneDrop: vi.fn(),
      onPreviousPhase: vi.fn(),
      onNextPhase: vi.fn(),
      onInspectorAction: vi.fn(),
    });
    const discard = container.querySelector<HTMLButtonElement>('[data-testid="battle-inspector-discard-player"]');
    const shuffle = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((button) => button.textContent === "Shuffle");
    expect(discard?.getAttribute("aria-disabled")).toBe("true");
    expect(shuffle?.getAttribute("aria-disabled")).toBe("true");
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
      expect(
        row?.querySelector<HTMLElement>("[data-battle-status-phase-anchor]")
          ?.style.height,
      ).toBe("");
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
      expect(
        voidZone?.querySelector("[data-game-card-source]"),
      ).toBeNull();
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

  it("opens deck and void browsers from the physical piles", () => {
    const onZoneOpen = vi.fn();
    const interactions: MobileBattleInteractions = {
      canInteract: true,
      pendingCardId: null,
      onHandCardActivate: vi.fn(),
      onCardDragStart: vi.fn(),
      onCardDragEnd: vi.fn(),
      onSlotDrop: vi.fn(),
      onZoneDrop: vi.fn(),
      onZoneOpen,
      onPreviousPhase: vi.fn(),
      onNextPhase: vi.fn(),
    };
    const { container, root } = mount(makeView(), interactions);

    act(() => {
      container.querySelector<HTMLButtonElement>(
        '[data-testid="player-battle-deck"]',
      )?.click();
      container.querySelector<HTMLButtonElement>(
        '[data-testid="player-battle-void"]',
      )?.click();
    });

    expect(onZoneOpen).toHaveBeenNthCalledWith(1, {
      owner: "player",
      zone: "deck",
    });
    expect(onZoneOpen).toHaveBeenNthCalledWith(2, {
      owner: "player",
      zone: "void",
    });
    expect(
      container.querySelector('[data-battle-zone="player-banished"]'),
    ).toBeNull();

    act(() => root.unmount());
  });

  it("shows a block icon button at the desktop top left for a non-empty banished zone", () => {
    mockDesktopViewport(true);
    const view = makeView();
    const onZoneOpen = vi.fn();
    const interactions: MobileBattleInteractions = {
      canInteract: true,
      pendingCardId: null,
      onHandCardActivate: vi.fn(),
      onCardDragStart: vi.fn(),
      onCardDragEnd: vi.fn(),
      onSlotDrop: vi.fn(),
      onZoneDrop: vi.fn(),
      onZoneOpen,
      onPreviousPhase: vi.fn(),
      onNextPhase: vi.fn(),
    };
    const { container, root } = mount({
      ...view,
      player: { ...view.player, banishedCardCount: 2 },
      enemy: { ...view.enemy, banishedCardCount: 0 },
    }, interactions);

    const controlFrame = container.querySelector<HTMLElement>(
      '[data-battle-zone="player-banished"]',
    );
    const button = controlFrame?.querySelector<HTMLButtonElement>(
      '[data-testid="player-battle-banished"]',
    );
    const topLeftControls = container.querySelector<HTMLElement>(
      "[data-battle-top-left-controls]",
    );

    expect(topLeftControls?.style.position).toBe("absolute");
    expect(topLeftControls?.style.left).toBe(
      "calc(var(--safe-area-inset-left) + var(--space-4))",
    );
    expect(controlFrame?.dataset.battleZoneCount).toBe("2");
    expect(button?.getAttribute("aria-label")).toBe(
      "Open banished cards, 2 cards",
    );
    expect(button?.querySelector(".bx-block")).not.toBeNull();

    act(() => button?.click());
    expect(onZoneOpen).toHaveBeenCalledWith({
      owner: "player",
      zone: "banished",
    });

    act(() => root.unmount());
  });

  it("keeps the banished icon button off the mobile battle layout", () => {
    const view = makeView();
    const { container, root } = mount({
      ...view,
      player: { ...view.player, banishedCardCount: 2 },
    }, {
      canInteract: true,
      pendingCardId: null,
      onHandCardActivate: vi.fn(),
      onCardDragStart: vi.fn(),
      onCardDragEnd: vi.fn(),
      onSlotDrop: vi.fn(),
      onZoneDrop: vi.fn(),
      onZoneOpen: vi.fn(),
      onPreviousPhase: vi.fn(),
      onNextPhase: vi.fn(),
    });

    expect(
      container.querySelector('[data-battle-zone="player-banished"]'),
    ).toBeNull();

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
    const icon = core?.querySelector<HTMLElement>("i");
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
    expect(light?.style.width).toBe("24px");
    expect(light?.style.height).toBe("24px");
    expect(light?.style.left).toBe("30%");
    expect(light?.style.transform).toBe("translate(-50%, -100%)");
    expect(light?.style.transition).toContain("var(--motion-object-travel)");
    expect(icon?.classList.contains("bxf")).toBe(true);
    expect(icon?.classList.contains("bx-sun")).toBe(true);
    expect(core?.style.width).toBe("24px");
    expect(core?.style.height).toBe("24px");
    expect(icon?.style.width).toBe("var(--space-8)");
    expect(icon?.style.height).toBe("var(--space-8)");
    expect(icon?.style.color).toBe("var(--accent-bright)");
    expect(icon?.style.filter.match(/drop-shadow/g)).toHaveLength(2);
    expect(halo?.style.width).toBe("24px");
    expect(halo?.style.height).toBe("24px");
    expect(halo?.style.backgroundColor).toBe("var(--accent)");
    expect(halo?.style.animation).toBe("");
    expect(streak?.style.width).toBe("28px");
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
    expect(light?.style.transform).toBe("translate(-50%, 0%)");
    expect(halo?.style.animation).toContain("battle-phase-challenge-pulse");
    expect(halo?.style.animation).toContain("var(--dur-slow)");

    act(() => root.unmount());
  });

  it.each([
    ["dawn", "bx-sun-rise"],
    ["day", "bx-sun"],
    ["dusk", "bx-sun-set"],
    ["night", "bx-moon-stars"],
    ["challenge", "bx-sword-alt"],
  ] as const)("renders the filled %s phase glyph", (phase, iconClass) => {
    const { container, root } = mount({ ...makeView(), phase });
    const icon = container.querySelector<HTMLElement>(
      "[data-battle-phase-light-core] i",
    );

    expect(icon?.classList.contains("bxf")).toBe(true);
    expect(icon?.classList.contains(iconClass)).toBe(true);

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
      expect(backTrack?.style.gridTemplateColumns).toContain("repeat(3,");
      expect(frontTrack?.style.gridTemplateColumns).toContain("repeat(2,");
      expect(backTrack?.style.width).toContain("3 * min(");
      expect(frontTrack?.style.width).toContain("2 * min(");
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
      const physicalCard = card.closest<HTMLElement>("[data-battle-card-id]");
      expect(physicalCard?.style.transform).toBe("");
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

  it("uses hand cards and the controls row for an inline card-picker prompt", () => {
    const view = makeView();
    const candidateIds = view.playerHand.slice(0, 2).map((card) => card.id);
    const pickerView: MobileBattleView = {
      ...view,
      cardPicker: {
        key: "prompt-42",
        side: "player",
        label: "Discard 2 cards",
        candidateIds,
        count: 2,
        optional: false,
        canResolve: true,
      },
      playerHand: view.playerHand.map((card, index) => ({
        ...card,
        showPlayableOutline: index === 2,
      })),
    };
    const onCardPickerSelectionChange = vi.fn();
    const onCardPickerSubmit = vi.fn();
    const onHandCardActivate = vi.fn();
    const { container, root } = mount(pickerView, {
      canInteract: false,
      pendingCardId: null,
      onHandCardActivate,
      onCardDragStart: vi.fn(),
      onCardDragEnd: vi.fn(),
      onSlotDrop: vi.fn(),
      onZoneDrop: vi.fn(),
      onPreviousPhase: vi.fn(),
      onNextPhase: vi.fn(),
      onCardPickerSelectionChange,
      onCardPickerSubmit,
    });

    const handCards = () => Array.from(
      container.querySelectorAll<HTMLElement>(
        '[data-battle-card-zone="player-hand"]',
      ),
    );
    const cardShadow = (index: number): string =>
      handCards()[index]
        ?.querySelector<HTMLElement>(".card-view")
        ?.style.boxShadow ?? "";
    const submit = () => container.querySelector<HTMLButtonElement>(
      '[data-testid="battle-card-picker-submit"]',
    );

    expect(container.querySelector("[data-battle-phase-controls]")).toBeNull();
    expect(container.querySelector("[data-battle-card-picker-controls]")).not.toBeNull();
    expect(container.querySelector("[data-battle-card-picker-progress]")?.textContent)
      .toBe("Discard 2 cards · 0/2");
    expect(submit()?.getAttribute("aria-disabled")).toBe("true");
    handCards().forEach((_card, index) => {
      expect(cardShadow(index)).not.toContain("var(--positive)");
      expect(cardShadow(index)).not.toContain("var(--color-gold-light)");
    });

    act(() => handCards()[0]?.click());

    expect(cardShadow(0)).toContain("var(--color-gold-light)");
    expect(cardShadow(1)).not.toContain("var(--color-gold-light)");
    expect(submit()?.getAttribute("aria-disabled")).toBe("true");
    expect(onCardPickerSelectionChange).toHaveBeenLastCalledWith([
      candidateIds[0],
    ]);

    act(() => handCards()[2]?.click());
    expect(onCardPickerSelectionChange).toHaveBeenCalledTimes(1);
    expect(onHandCardActivate).not.toHaveBeenCalled();

    act(() => handCards()[1]?.click());

    expect(cardShadow(0)).toContain("var(--color-gold-light)");
    expect(cardShadow(1)).toContain("var(--color-gold-light)");
    expect(submit()?.getAttribute("aria-disabled")).toBeNull();
    expect(container.querySelector("[data-battle-card-picker-progress]")?.textContent)
      .toBe("Discard 2 cards · 2/2");

    act(() => submit()?.click());
    expect(onCardPickerSubmit).toHaveBeenCalledWith(candidateIds);
    expect(onHandCardActivate).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  it("keeps an optional inline card-picker skippable", () => {
    const view = makeView();
    const onCardPickerSkip = vi.fn();
    const { container, root } = mount({
      ...view,
      cardPicker: {
        key: "prompt-optional",
        side: "player",
        label: "Choose a card",
        candidateIds: [view.playerHand[0]?.id ?? "missing"],
        count: 1,
        optional: true,
        canResolve: true,
      },
    }, {
      canInteract: false,
      pendingCardId: null,
      onHandCardActivate: vi.fn(),
      onCardDragStart: vi.fn(),
      onCardDragEnd: vi.fn(),
      onSlotDrop: vi.fn(),
      onZoneDrop: vi.fn(),
      onPreviousPhase: vi.fn(),
      onNextPhase: vi.fn(),
      onCardPickerSkip,
    });

    act(() => {
      container.querySelector<HTMLButtonElement>(
        '[data-testid="battle-card-picker-skip"]',
      )?.click();
    });
    expect(onCardPickerSkip).toHaveBeenCalledOnce();

    act(() => root.unmount());
  });

  it("replaces Next Phase with inline choice-prompt buttons", () => {
    const onChoicePromptChoose = vi.fn();
    const { container, root } = mount({
      ...makeView(),
      choicePrompt: {
        key: "prompt-choice-42",
        label: "Discard your hand and redraw?",
        options: [{ label: "Yes" }, { label: "Skip" }],
        canResolve: true,
      },
    }, {
      canInteract: false,
      pendingCardId: null,
      onHandCardActivate: vi.fn(),
      onCardDragStart: vi.fn(),
      onCardDragEnd: vi.fn(),
      onSlotDrop: vi.fn(),
      onZoneDrop: vi.fn(),
      onPreviousPhase: vi.fn(),
      onNextPhase: vi.fn(),
      onChoicePromptChoose,
    });
    const nextSlot = container.querySelector<HTMLElement>(
      "[data-battle-phase-next]",
    );
    const choiceControls = container.querySelector<HTMLElement>(
      "[data-battle-choice-prompt-controls]",
    );
    const promptMessage = container.querySelector<HTMLElement>(
      "[data-battle-choice-prompt-message]",
    );
    const optionButtons = Array.from(
      choiceControls?.querySelectorAll<HTMLButtonElement>("button") ?? [],
    );

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(choiceControls).toBe(nextSlot);
    expect(choiceControls?.getAttribute("aria-label")).toBe(
      "Discard your hand and redraw?",
    );
    expect(choiceControls?.style.width).toBe("");
    expect(choiceControls?.style.display).toBe("flex");
    expect(optionButtons.map((button) => button.textContent)).toEqual([
      "Yes",
      "Skip",
    ]);
    expect(nextSlot?.textContent).not.toContain("Next Phase");
    expect(promptMessage?.textContent).toBe("Discard your hand and redraw?");

    act(() => {
      optionButtons[1]?.click();
    });
    expect(onChoicePromptChoose).toHaveBeenCalledWith(1);

    act(() => root.unmount());
  });

  it("reveals the full enemy hand when that side owns the inline picker", () => {
    const view = makeView();
    const candidateId = view.enemyHandCardIds[7];
    if (candidateId === undefined) throw new Error("expected an enemy hand card");
    const onCardPickerSubmit = vi.fn();
    const { container, root } = mount({
      ...view,
      cardPicker: {
        key: "prompt-enemy",
        side: "enemy",
        label: "Choose a card to discard",
        candidateIds: view.enemyHandCardIds,
        count: 1,
        optional: false,
        canResolve: true,
      },
    }, {
      canInteract: false,
      pendingCardId: null,
      onHandCardActivate: vi.fn(),
      onCardDragStart: vi.fn(),
      onCardDragEnd: vi.fn(),
      onSlotDrop: vi.fn(),
      onZoneDrop: vi.fn(),
      onPreviousPhase: vi.fn(),
      onNextPhase: vi.fn(),
      onCardPickerSubmit,
    });
    const enemyHand = container.querySelector<HTMLElement>(
      '[data-battle-mobile-row="enemy-hand"]',
    );
    const enemyCards = enemyHand?.querySelectorAll<HTMLElement>(
      ':scope > [data-battle-card-zone="enemy-hand"]',
    );
    const candidate = enemyHand?.querySelector<HTMLElement>(
      `[data-battle-card-id="${candidateId}"]`,
    );

    expect(enemyHand?.dataset.battleHandVisibleCount).toBe("8");
    expect(enemyCards).toHaveLength(8);
    expect(candidate?.dataset.battleCardFace).toBe("up");

    act(() => {
      candidate?.querySelector<HTMLElement>(
        '[data-battle-card-zone="enemy-hand"]',
      )?.click();
    });

    expect(
      candidate?.querySelector<HTMLElement>(".card-view")?.style.boxShadow,
    ).toContain("var(--color-gold-light)");
    act(() => {
      container.querySelector<HTMLButtonElement>(
        '[data-testid="battle-card-picker-submit"]',
      )?.click();
    });
    expect(onCardPickerSubmit).toHaveBeenCalledWith([candidateId]);

    act(() => root.unmount());
  });

  it("centers materialized expanded mobile ranks on one shared responsive card scale", () => {
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
          "88cqw - 5 * var(--space-2)",
        );
        expect(rankElement?.style.height).toContain("200cqh");
        expect(track?.style.gridTemplateColumns).toContain(
          rank === "back" ? "repeat(6," : "repeat(5,",
        );
        expect(track?.style.width).toContain(
          rank === "back" ? "6 * min(" : "5 * min(",
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

  it("centers each mobile rank when the two sides have different materialized widths", () => {
    const view = makeView();
    const playerBackRank = Array.from({ length: 6 }, (_, index) => ({
      id: `player-expanded-back-${String(index)}`,
      card: index < 5
        ? makeCard(80 + index, `player-expanded-back-card-${String(index)}`)
        : null,
    }));
    const playerFrontRank = Array.from({ length: 5 }, (_, index) => ({
      id: `player-expanded-front-${String(index)}`,
      card: index < 4
        ? makeCard(90 + index, `player-expanded-front-card-${String(index)}`)
        : null,
    }));
    const { container, root } = mount({
      ...view,
      player: {
        ...view.player,
        backRank: playerBackRank,
        frontRank: playerFrontRank,
      },
    });

    const trackColumns = (owner: "enemy" | "player", rank: "back" | "front") =>
      container.querySelector<HTMLElement>(
        `[data-battle-rank="${owner}-${rank}"] [data-battle-rank-track]`,
      )?.style.gridTemplateColumns;

    expect(trackColumns("enemy", "back")).toContain("repeat(3,");
    expect(trackColumns("enemy", "front")).toContain("repeat(2,");
    expect(trackColumns("player", "back")).toContain("repeat(6,");
    expect(trackColumns("player", "front")).toContain("repeat(5,");

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
    expect(controlRow?.style.zIndex).toBe("10");
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

  it("replaces Next Phase with AI proposal controls and a compact mobile caption", () => {
    const interactions = {
      canInteract: false,
      pendingCardId: null,
      onHandCardActivate: vi.fn(),
      onCardDragStart: vi.fn(),
      onCardDragEnd: vi.fn(),
      onSlotDrop: vi.fn(),
      onZoneDrop: vi.fn(),
      onPreviousPhase: vi.fn(),
      onNextPhase: vi.fn(),
      onApproveAiProposal: vi.fn(),
      onRejectAiProposal: vi.fn(),
    };
    const view: MobileBattleView = {
      ...makeView(),
      aiApproval: {
        description: "Play a fixture card to B2.",
        canReject: true,
      },
    };
    const { container, root } = mount(view, interactions);
    const nextSlot = container.querySelector<HTMLElement>(
      "[data-battle-phase-next]",
    );
    const phaseControls = container.querySelector<HTMLElement>(
      '[data-battle-phase-controls="row"]',
    );
    const backButton = container.querySelector<HTMLButtonElement>(
      "[data-battle-phase-back] button",
    );
    const rejectButton = nextSlot?.querySelector<HTMLButtonElement>(
      '[aria-label="Reject AI action"]',
    );
    const continueButton = Array.from(
      nextSlot?.querySelectorAll<HTMLButtonElement>("button") ?? [],
    ).find((button) => button.textContent === "Continue");

    expect(nextSlot?.dataset.battleAiApprovalControls).toBe("");
    expect(nextSlot?.textContent).not.toContain("Next Phase");
    expect(nextSlot?.querySelectorAll("button")).toHaveLength(2);
    expect(nextSlot?.style.width).toBe("");
    expect(nextSlot?.style.gap).toBe("var(--space-4)");
    expect(phaseControls?.style.gap).toBe("var(--space-4)");
    expect(backButton?.getAttribute("aria-disabled")).toBe("true");
    expect(rejectButton?.getAttribute("aria-disabled")).toBeNull();
    expect(continueButton?.getAttribute("aria-disabled")).toBeNull();
    expect(continueButton?.dataset.glassVariant).toBe("accent");
    const message = container.querySelector<HTMLElement>(
      "[data-battle-ai-approval-message]",
    );
    const topLeftControls = container.querySelector<HTMLElement>(
      "[data-battle-top-left-controls]",
    );
    expect(message?.textContent).toBe("Play a fixture card to B2.");
    expect(topLeftControls?.style.position).toBe("absolute");
    expect(message?.style.font).toBe("var(--t-caption)");

    act(() => {
      rejectButton?.click();
      continueButton?.click();
    });

    expect(interactions.onRejectAiProposal).toHaveBeenCalledTimes(1);
    expect(interactions.onApproveAiProposal).toHaveBeenCalledTimes(1);
    expect(interactions.onNextPhase).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  it("shows the held AI action as a small desktop-only status message", () => {
    mockDesktopViewport(true);
    const view: MobileBattleView = {
      ...makeView(),
      aiApproval: {
        description: "Pass from Day to Dusk.",
        canReject: false,
      },
    };
    const { container, root } = mount(view, {
      canInteract: false,
      pendingCardId: null,
      onHandCardActivate: vi.fn(),
      onCardDragStart: vi.fn(),
      onCardDragEnd: vi.fn(),
      onSlotDrop: vi.fn(),
      onZoneDrop: vi.fn(),
      onPreviousPhase: vi.fn(),
      onNextPhase: vi.fn(),
      onApproveAiProposal: vi.fn(),
      onRejectAiProposal: vi.fn(),
    });
    const message = container.querySelector<HTMLElement>(
      "[data-battle-ai-approval-message]",
    );
    const topLeftControls = container.querySelector<HTMLElement>(
      "[data-battle-top-left-controls]",
    );
    const nextSlot = container.querySelector<HTMLElement>(
      "[data-battle-phase-next]",
    );

    expect(message?.textContent).toBe("Pass from Day to Dusk.");
    expect(topLeftControls?.style.position).toBe("absolute");
    expect(message?.style.font).toBe("var(--t-caption)");
    expect(message?.style.textShadow).toBe("var(--text-outline-media)");
    expect(nextSlot?.querySelectorAll("button")).toHaveLength(1);
    expect(nextSlot?.querySelector("button")?.textContent).toBe("Continue");
    expect(
      nextSlot?.querySelector('[aria-label="Reject AI action"]'),
    ).toBeNull();

    act(() => root.unmount());
  });

  it("shows the floating debug disclosure alongside the phase controls", () => {
    const { container, root } = mount();
    const controls = container.querySelectorAll(
      "button, input, select, textarea, [role=button]",
    );
    expect(controls).toHaveLength(4);
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

  it("routes a hand-card drop anywhere on the table through the semantic play intent", () => {
    const interactions = {
      canInteract: true,
      pendingCardId: "player-hand-0",
      pendingCardSource: "player-hand" as const,
      pendingCardOwner: "player" as const,
      onHandCardActivate: vi.fn(),
      onHandCardDrop: vi.fn(),
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
    const enemySlot = container.querySelector<HTMLElement>(
      '[data-battle-rank="enemy-back"] [data-battle-slot-filled="false"]',
    );
    const playerHand = container.querySelector<HTMLElement>(
      '[data-battle-mobile-row="player-hand"]',
    );
    expect(playerHand?.style.overflow).toBe("visible");

    act(() => {
      handCard?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      enemySlot?.dispatchEvent(
        new Event("drop", { bubbles: true, cancelable: true }),
      );
    });

    expect(handCard?.draggable).toBe(false);
    expect(interactions.onHandCardActivate).toHaveBeenCalledWith(
      "player-hand-0",
    );
    expect(interactions.onCardDragStart).not.toHaveBeenCalled();
    expect(interactions.onHandCardDrop).toHaveBeenCalledTimes(1);
    expect(interactions.onSlotDrop).not.toHaveBeenCalled();
    expect(interactions.onZoneDrop).not.toHaveBeenCalled();
    expect(interactions.onCardDragEnd).not.toHaveBeenCalled();
    expect(container.querySelectorAll("button")).toHaveLength(4);

    act(() => root.unmount());
  });

  it("routes a hand-card drag to the closest open player back-row slot", () => {
    const interactions = {
      canInteract: true,
      pendingCardId: "player-hand-0",
      pendingCardSource: "player-hand" as const,
      pendingCardOwner: "player" as const,
      onHandCardActivate: vi.fn(),
      onHandCardDrop: vi.fn(),
      onCardDragStart: vi.fn(),
      onCardDragEnd: vi.fn(),
      onSlotDrop: vi.fn(),
      onZoneDrop: vi.fn(),
      onPreviousPhase: vi.fn(),
      onNextPhase: vi.fn(),
    };
    const { container, root } = mount(makeView(), interactions);
    const screen = container.querySelector<HTMLElement>("[data-battle-mobile]");
    const leftSlot = container.querySelector<HTMLElement>(
      '[data-battle-slot-id="player-back-empty"]',
    );
    const rightSlot = container.querySelector<HTMLElement>(
      '[data-battle-slot-id="player-back-second-empty"]',
    );
    vi.spyOn(leftSlot as HTMLElement, "getBoundingClientRect").mockReturnValue({
      x: 50,
      y: 200,
      left: 50,
      top: 200,
      right: 150,
      bottom: 340,
      width: 100,
      height: 140,
      toJSON: () => ({}),
    });
    vi.spyOn(rightSlot as HTMLElement, "getBoundingClientRect").mockReturnValue({
      x: 250,
      y: 200,
      left: 250,
      top: 200,
      right: 350,
      bottom: 340,
      width: 100,
      height: 140,
      toJSON: () => ({}),
    });

    act(() => {
      screen?.dispatchEvent(
        new MouseEvent("drop", {
          bubbles: true,
          cancelable: true,
          clientX: 290,
          clientY: 280,
        }),
      );
    });

    expect(interactions.onHandCardDrop).toHaveBeenCalledWith({
      owner: "player",
      rank: "back",
      slotId: "player-back-second-empty",
    });

    act(() => root.unmount());
  });

  it("offers battlefield drop targets only on the dragged card's own side", () => {
    const interactions = {
      canInteract: true,
      pendingCardId: "player-front-card",
      pendingCardSource: "battlefield" as const,
      pendingCardOwner: "player" as const,
      onHandCardActivate: vi.fn(),
      onCardDragStart: vi.fn(),
      onCardDragEnd: vi.fn(),
      onSlotDrop: vi.fn(),
      onZoneDrop: vi.fn(),
      onPreviousPhase: vi.fn(),
      onNextPhase: vi.fn(),
    };
    const { container, root } = mount(makeView(), interactions);
    const playerSlot = container.querySelector<HTMLElement>(
      '[data-battle-rank="player-back"] [data-battle-slot-filled="false"]',
    );
    const enemySlot = container.querySelector<HTMLElement>(
      '[data-battle-rank="enemy-back"] [data-battle-slot-filled="false"]',
    );

    expect(playerSlot?.dataset.battleDropTarget).toBe("true");
    expect(enemySlot?.dataset.battleDropTarget).toBeUndefined();
    act(() => {
      enemySlot?.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
      playerSlot?.dispatchEvent(new Event("drop", { bubbles: true, cancelable: true }));
    });
    expect(interactions.onSlotDrop).toHaveBeenCalledTimes(1);
    expect(interactions.onSlotDrop).toHaveBeenCalledWith({
      owner: "player",
      rank: "back",
      slotId: "player-back-empty",
    });

    act(() => root.unmount());
  });

  it("keeps an in-play card inside its battlefield half while dragging", () => {
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
    const playArea = container.querySelector<HTMLElement>(
      '[data-battle-play-area="player"]',
    );
    const battlefieldCard = container.querySelector<HTMLElement>(
      '[data-battle-card-id="player-front-card"]',
    );
    const revealSource = battlefieldCard?.querySelector<HTMLElement>(
      "[data-game-card-source]",
    );
    vi.spyOn(playArea as HTMLElement, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 100,
      left: 0,
      top: 100,
      right: 500,
      bottom: 300,
      width: 500,
      height: 200,
      toJSON: () => ({}),
    });
    vi.spyOn(battlefieldCard as HTMLElement, "getBoundingClientRect").mockReturnValue({
      x: 100,
      y: 200,
      left: 100,
      top: 200,
      right: 200,
      bottom: 300,
      width: 100,
      height: 100,
      toJSON: () => ({}),
    });

    act(() => {
      revealSource?.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 150,
          clientY: 250,
          pointerId: 21,
          pointerType: "mouse",
        }),
      );
      battlefieldCard?.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 150,
          clientY: 0,
          pointerId: 21,
          pointerType: "mouse",
        }),
      );
    });

    expect(battlefieldCard?.style.transform).toContain(
      "translate3d(0px, -100px, 0)",
    );

    act(() => {
      battlefieldCard?.dispatchEvent(
        new PointerEvent("pointercancel", {
          bubbles: true,
          cancelable: true,
          pointerId: 21,
          pointerType: "mouse",
        }),
      );
      root.unmount();
    });
  });

  it("ignores a pointer drop from an in-play card onto the opponent battlefield", () => {
    const interactions = {
      canInteract: true,
      pendingCardId: "player-front-card",
      pendingCardSource: "battlefield" as const,
      pendingCardOwner: "player" as const,
      onHandCardActivate: vi.fn(),
      onCardDragStart: vi.fn(),
      onCardDragEnd: vi.fn(),
      onSlotDrop: vi.fn(),
      onZoneDrop: vi.fn(),
      onPreviousPhase: vi.fn(),
      onNextPhase: vi.fn(),
    };
    const { container, root } = mount(makeView(), interactions);
    const battlefieldCard = container.querySelector<HTMLElement>(
      '[data-battle-card-id="player-front-card"]',
    );
    const revealSource = battlefieldCard?.querySelector<HTMLElement>(
      "[data-game-card-source]",
    );
    const enemySlot = container.querySelector<HTMLElement>(
      '[data-battle-rank="enemy-back"] [data-battle-slot-filled="false"]',
    );
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => enemySlot),
    });

    act(() => {
      revealSource?.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 20,
          clientY: 30,
          pointerId: 22,
          pointerType: "mouse",
        }),
      );
      battlefieldCard?.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 20,
          clientY: 0,
          pointerId: 22,
          pointerType: "mouse",
        }),
      );
      battlefieldCard?.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 20,
          clientY: 0,
          pointerId: 22,
          pointerType: "mouse",
        }),
      );
    });

    expect(interactions.onSlotDrop).not.toHaveBeenCalled();
    expect(interactions.onZoneDrop).not.toHaveBeenCalled();
    expect(interactions.onCardDragEnd).toHaveBeenCalledTimes(1);

    act(() => root.unmount());
  });

  it("draws empty staggered battlefield slots with the battlefield card radius and gray dotted border", () => {
    const view = makeView();
    const { container, root } = mount(view);
    const slots = [
      ...view.enemy.backRank,
      ...view.enemy.frontRank,
      ...view.player.backRank,
      ...view.player.frontRank,
    ];
    const emptySlotCount = slots.filter((slot) => slot.card === null).length;
    const battlefieldCard = container.querySelector<HTMLElement>(
      '.card-view[data-card-presentation="battlefield"]',
    );
    const battlefieldCardRadius = battlefieldCard?.style.getPropertyValue(
      "--cv-radius",
    );

    const outlines = Array.from(
      container.querySelectorAll<HTMLElement>("[data-battle-slot-outline]"),
    );
    expect(battlefieldCardRadius).toBe("3.6%");
    expect(outlines).toHaveLength(emptySlotCount);
    outlines.forEach((outline) => {
      expect(outline.parentElement?.dataset.battleSlotFilled).toBe("false");
      expect(outline.style.position).toBe("absolute");
      expect(outline.style.inset).toBe("0px");
      expect(outline.style.borderRadius).toBe(battlefieldCardRadius);
      expect(outline.style.border).toBe("var(--battlefield-slot-border)");
      expect(outline.style.boxSizing).toBe("border-box");
      expect(outline.style.pointerEvents).toBe("none");
    });

    act(() => root.unmount());
  });

  it("outlines a battlefield card's vacated source slot as soon as dragging starts", () => {
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
    const sourceSlot = container.querySelector<HTMLElement>(
      '[data-battle-slot-id="player-front-filled"]',
    );
    const battlefieldCard = sourceSlot?.querySelector<HTMLElement>(
      '[data-battle-card-id="player-front-card"]',
    );
    const revealSource = battlefieldCard?.querySelector<HTMLElement>(
      "[data-game-card-source]",
    );

    expect(sourceSlot?.querySelector("[data-battle-slot-outline]")).toBeNull();

    act(() => {
      revealSource?.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 20,
          clientY: 30,
          pointerId: 14,
          pointerType: "mouse",
        }),
      );
      battlefieldCard?.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 44,
          clientY: 70,
          pointerId: 14,
          pointerType: "mouse",
        }),
      );
    });

    expect(
      sourceSlot?.querySelector("[data-battle-slot-outline]"),
    ).not.toBeNull();

    act(() => {
      battlefieldCard?.dispatchEvent(
        new PointerEvent("pointercancel", {
          bubbles: true,
          cancelable: true,
          pointerId: 14,
          pointerType: "mouse",
        }),
      );
    });

    expect(sourceSlot?.querySelector("[data-battle-slot-outline]")).toBeNull();

    act(() => root.unmount());
  });

  it("keeps a dragged battlefield card out of shared layout motion through its committed reposition", () => {
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
    const view = makeView();
    const movingCard = view.player.frontRank[0]?.card;
    expect(movingCard).not.toBeNull();
    expect(movingCard).not.toBeUndefined();
    const { container, root } = mount(view, interactions);
    const battlefieldCard = container.querySelector<HTMLElement>(
      '[data-battle-card-id="player-front-card"]',
    );
    const revealSource = battlefieldCard?.querySelector<HTMLElement>(
      "[data-game-card-source]",
    );

    act(() => {
      revealSource?.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 20,
          clientY: 30,
          pointerId: 13,
          pointerType: "mouse",
        }),
      );
      battlefieldCard?.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 44,
          clientY: 70,
          pointerId: 13,
          pointerType: "mouse",
        }),
      );
    });

    expect(
      battlefieldCard?.querySelector<HTMLElement>(
        ":scope > [data-battle-card-motion]",
      )?.dataset.battleCardLayoutMotion,
    ).toBe("snap");

    const committedView: MobileBattleView = {
      ...view,
      player: {
        ...view.player,
        backRank: view.player.backRank.map((slot, index) =>
          index === 0 ? { ...slot, card: movingCard ?? null } : slot,
        ),
        frontRank: view.player.frontRank.map((slot, index) =>
          index === 0 ? { ...slot, card: null } : slot,
        ),
      },
    };
    act(() => {
      root.render(
        <CumulusRoot>
          <MobileBattleScreen
            view={committedView}
            interactions={interactions}
          />
        </CumulusRoot>,
      );
    });

    const committedCard = container.querySelector<HTMLElement>(
      '[data-battle-card-id="player-front-card"]',
    );
    expect(
      committedCard?.closest<HTMLElement>("[data-battle-slot-id]")?.dataset
        .battleSlotId,
    ).toBe("player-back-empty");
    expect(
      committedCard?.querySelector<HTMLElement>(
        ":scope > [data-battle-card-motion]",
      )?.dataset.battleCardLayoutMotion,
    ).toBe("snap");

    act(() => root.unmount());
  });

  it("snaps a dragged hand card into its committed battlefield slot", () => {
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
    const view = makeView();
    const movingCard = view.playerHand[0];
    expect(movingCard).not.toBeUndefined();
    const { container, root } = mount(view, interactions);
    const handCard = container.querySelector<HTMLElement>(
      '[data-battle-card-id="player-hand-0"]',
    );
    const revealSource = handCard?.querySelector<HTMLElement>(
      "[data-game-card-source]",
    );
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => null),
    });

    expect(
      handCard?.querySelector<HTMLElement>(
        ":scope > [data-battle-card-motion]",
      )?.dataset.battleCardLayoutMotion,
    ).toBe("travel");

    act(() => {
      revealSource?.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 20,
          clientY: 30,
          pointerId: 15,
          pointerType: "mouse",
        }),
      );
      handCard?.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 44,
          clientY: 70,
          pointerId: 15,
          pointerType: "mouse",
        }),
      );
    });

    expect(
      handCard?.querySelector<HTMLElement>(
        ":scope > [data-battle-card-motion]",
      )?.dataset.battleCardLayoutMotion,
    ).toBe("snap");

    act(() => {
      handCard?.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 44,
          clientY: 70,
          pointerId: 15,
          pointerType: "mouse",
        }),
      );
    });

    const committedView: MobileBattleView = {
      ...view,
      player: {
        ...view.player,
        backRank: view.player.backRank.map((slot, index) =>
          index === 2 ? { ...slot, card: movingCard ?? null } : slot,
        ),
      },
      playerHand: view.playerHand.slice(1),
    };
    act(() => {
      root.render(
        <CumulusRoot>
          <MobileBattleScreen
            view={committedView}
            interactions={interactions}
          />
        </CumulusRoot>,
      );
    });

    const committedCard = container.querySelector<HTMLElement>(
      '[data-battle-card-id="player-hand-0"]',
    );
    expect(
      committedCard?.closest<HTMLElement>("[data-battle-slot-id]")?.dataset
        .battleSlotId,
    ).toBe("player-back-second-empty");
    expect(
      committedCard?.querySelector<HTMLElement>(
        ":scope > [data-battle-card-motion]",
      )?.dataset.battleCardLayoutMotion,
    ).toBe("snap");

    act(() => root.unmount());
  });

  it("keeps physical cards out of native HTML drag", () => {
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
    const dataTransfer = { setDragImage: vi.fn(), effectAllowed: "uninitialized" };
    const dragStart = new Event("dragstart", { bubbles: true, cancelable: true });
    Object.defineProperty(dragStart, "dataTransfer", {
      value: dataTransfer,
    });

    act(() => {
      handCard?.dispatchEvent(dragStart);
    });

    expect(handCard?.draggable).toBe(false);
    expect(dataTransfer.setDragImage).not.toHaveBeenCalled();
    expect(interactions.onCardDragStart).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it("moves the physical card with a captured mouse pointer and drops by hit test", () => {
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
    if (handCard?.parentElement !== null && handCard?.parentElement !== undefined) {
      handCard.parentElement.style.transform = "none";
    }
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => playerVoid),
    });

    act(() => {
      revealSource?.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 20,
          clientY: 30,
          pointerId: 9,
          pointerType: "mouse",
        }),
      );
      handCard?.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 44,
          clientY: 70,
          pointerId: 9,
          pointerType: "mouse",
        }),
      );
    });

    expect(handCard?.style.transform).toContain("translate3d(24px, 40px, 0)");
    expect(handCard?.dataset.battlePointerDragging).toBe("true");
    expect(interactions.onCardDragStart).toHaveBeenCalledWith(
      "player-hand-0",
      "player-hand",
    );

    act(() => {
      handCard?.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 44,
          clientY: 70,
          pointerId: 9,
          pointerType: "mouse",
        }),
      );
    });

    expect(interactions.onZoneDrop).toHaveBeenCalledWith({
      owner: "player",
      zone: "void",
    });
    expect(interactions.onCardDragEnd).toHaveBeenCalledTimes(1);
    expect(handCard?.style.transform).toBe("");
    expect(handCard?.dataset.battlePointerDragging).toBe("false");

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
      { presentation: "sheet" },
    );

    interactions.onCardDebugActivate.mockClear();
    act(() => {
      battlefieldCard?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      battlefieldCard?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(interactions.onCardDebugActivate).toHaveBeenCalledWith(
      "player-front-card",
      "battlefield",
      { presentation: "sheet" },
    );

    act(() => root.unmount());
    vi.useRealTimers();
  });

  it("uses immediate primary clicks and right click for card debug actions on desktop", () => {
    mockDesktopViewport(true);
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
      handCard?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(interactions.onHandCardActivate).toHaveBeenCalledTimes(2);
    expect(interactions.onCardDebugActivate).not.toHaveBeenCalled();

    act(() => {
      handCard?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 240,
          clientY: 720,
        }),
      );
      battlefieldCard?.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          cancelable: true,
          clientX: 960,
          clientY: 420,
        }),
      );
    });
    expect(interactions.onCardDebugActivate).toHaveBeenNthCalledWith(
      1,
      "player-hand-0",
      "player-hand",
      { presentation: "context-menu", x: 240, y: 720 },
    );
    expect(interactions.onCardDebugActivate).toHaveBeenNthCalledWith(
      2,
      "player-front-card",
      "battlefield",
      { presentation: "context-menu", x: 960, y: 420 },
    );

    act(() => root.unmount());
  });

  it("plays a quick touch tap but keeps a captured long press revealed and suppresses its click", () => {
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
    const dispatchTouch = (type: "pointerdown" | "pointerout" | "pointerup", pointerId: number) => {
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
      vi.advanceTimersByTime(30);
    });
    expect(document.querySelector("[data-cumulus-reveal-portal]")).not.toBeNull();
    act(() => {
      dispatchTouch("pointerout", 42);
      vi.advanceTimersByTime(270);
    });
    expect(document.querySelector("[data-cumulus-reveal-portal]")).not.toBeNull();
    act(() => {
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
    expect(handCard?.draggable).toBe(false);
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
    expect(handCard?.dataset.battlePointerDragging).toBe("true");
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

    expect(handCard?.draggable).toBe(false);
    expect(interactions.onZoneDrop).toHaveBeenCalledWith({
      owner: "player",
      zone: "void",
    });
    expect(interactions.onCardDragEnd).toHaveBeenCalledTimes(1);
    expect(pointerEventsDuringHitTest).toBe("none");
    expect(handCard?.dataset.battlePointerDragging).toBe("false");
    expect(handCard?.style.transform).toBe("");

    act(() => root.unmount());
  });
});
