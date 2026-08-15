// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assertLocalized } from "@trox/runtime";
import { parseCardName } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import { CumulusRoot } from "../CumulusRoot";
import { BATTLE_HAND_CARD_HOVER_SCALE } from "../components/battle/battle-card-layout";
import { resolveColor } from "../primitives/color";
import { DOUBLE_TAP_WINDOW_MS } from "../primitives/pointer-gesture";
import {
  MobileBattleScreen,
  type MobileBattleCardView,
  type MobileBattleCardPickerCandidateView,
  type MobileBattleDropResolution,
  type MobileBattleInteractions,
  type MobileBattleScreenProps,
  type MobileBattleSideView,
  type MobileBattleView,
} from "./MobileBattleScreen";
import { parseBattleId } from "../../types/identifiers";
import { parsePresentationId } from "../../types/identifiers";
import { parseBattleCardId } from "../../types/identifiers";
import type { BattleCardId } from "../../types/identifiers";
import { parseBattleSlotViewId } from "../../types/identifiers";
import { testCardId, testDreamwellCardId } from "../../types/test-identities";

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

function accessibleDescription(source: HTMLElement | null | undefined): string {
  return (source?.getAttribute("aria-describedby") ?? "")
    .split(/\s+/u)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? "")
    .join(" ");
}

function makeCard(
  index: number,
  instanceId: BattleCardId,
): MobileBattleCardView {
  const cardId = testCardId(
    `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  );
  const card: CardData = {
    id: cardId,
    name: parseCardName(`Fixture Card ${String(index)}`),
    cardNumber: index,
    cardType: index % 2 === 0 ? "Character" : "Event",
    subtype: "Warrior",
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
    storedTime: 0,
    showPlayableOutline: false,
  };
}

function makeSide(
  owner: "enemy" | "player",
  cardOffset: number,
): MobileBattleSideView {
  return {
    owner,
    position: owner === "player" ? "near" : "far",
    deckCardIds: Array.from(
      { length: 4 },
      (_, index) => `${owner}-deck-${String(index)}`,
    ).map(parseBattleCardId),
    banishedCardCount: 0,
    voidCards: [
      makeCard(cardOffset, parseBattleCardId(`${owner}-void-top`)),
      makeCard(cardOffset + 1, parseBattleCardId(`${owner}-void-under`)),
    ],
    backRank: [
      { id: parseBattleSlotViewId(`${owner}-back-empty`), card: null },
      {
        id: parseBattleSlotViewId(`${owner}-back-filled`),
        card: makeCard(cardOffset + 2, parseBattleCardId(`${owner}-back-card`)),
      },
      { id: parseBattleSlotViewId(`${owner}-back-second-empty`), card: null },
    ],
    frontRank: [
      {
        id: parseBattleSlotViewId(`${owner}-front-filled`),
        card: makeCard(cardOffset + 3, parseBattleCardId(`${owner}-front-card`)),
      },
      { id: parseBattleSlotViewId(`${owner}-front-empty`), card: null },
    ],
    status: {
      avatar: {
        imageNumber: owner === "enemy" ? "0042" : "0007",
        name: assertLocalized(
          owner === "enemy" ? "Enemy Avatar" : "Player Avatar",
        ),
        title: assertLocalized("Fixture"),
      },
      currentEnergy: owner === "enemy" ? 2 : 3,
      maxEnergy: owner === "enemy" ? 4 : 3,
      points: owner === "enemy" ? 5 : 6,
      pointsToWin: 10,
    },
  };
}

function makeView(): MobileBattleView {
  const enemy = makeSide("enemy", 1);
  const player = makeSide("player", 20);
  const enemyHandCardIds = Array.from(
    { length: 8 },
    (_, index) => `enemy-hand-${String(index)}`,
  );
  const enemyHand = Array.from({ length: 8 }, (_, index) =>
    makeCard(60 + index, parseBattleCardId(`enemy-hand-${String(index)}`)),
  );
  const playerHand = Array.from({ length: 4 }, (_, index) =>
    makeCard(40 + index, parseBattleCardId(`player-hand-${String(index)}`)),
  );
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
      cardIds: enemyHandCardIds.map(parseBattleCardId),
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
    enemyHandCardIds: enemyHandCardIds.map(parseBattleCardId),
    enemyHand,
    enemy,
    player,
    playerHand,
    result: null,
    inspector: {
      opponentName: "Enemy Avatar",
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
      sides: {
        player: {
          side: "player",
          heading: "Player",
          points: 6,
          currentEnergy: 3,
          maxEnergy: 3,
          zones: {
            hand: 4,
            deck: 4,
            void: 2,
            banished: 0,
            backRank: 1,
            frontRank: 1,
          },
          canDiscard: true,
          canShuffle: true,
        },
        enemy: {
          side: "enemy",
          heading: "Enemy",
          points: 5,
          currentEnergy: 2,
          maxEnergy: 4,
          zones: {
            hand: 8,
            deck: 4,
            void: 2,
            banished: 0,
            backRank: 1,
            frontRank: 1,
          },
          canDiscard: true,
          canShuffle: true,
        },
      },
      ai: null,
    },
  };
}

function makePickerCandidate(
  card: MobileBattleCardView,
  owner: "enemy" | "player",
  zone: MobileBattleCardPickerCandidateView["zone"],
  highlighted = false,
): MobileBattleCardPickerCandidateView {
  return {
    instanceId: card.id,
    cardUuid: card.model.cardId,
    owner,
    zone,
    card,
    highlighted,
  };
}

function mount(
  view = makeView(),
  interactions?: MobileBattleInteractions,
  props?: Omit<MobileBattleScreenProps, "view" | "interactions">,
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
        <MobileBattleScreen
          {...props}
          view={view}
          interactions={interactions}
        />
      </CumulusRoot>,
    );
  });
  return { container, root };
}

describe("MobileBattleScreen", () => {
  it("reserves whitespace between the two battlefield sides", () => {
    const { container, root } = mount(makeView());

    expect(container.querySelector("[data-battlefield-divider]")).toBeNull();
    expect(
      container.querySelector<HTMLElement>('[data-battle-rank="enemy-front"]')
        ?.style.bottom,
    ).toBe("var(--space-m)");
    expect(
      container.querySelector<HTMLElement>('[data-battle-rank="player-front"]')
        ?.style.top,
    ).toBe("var(--space-m)");

    act(() => root.unmount());
  });

  it("supports a collapsed inspector with hidden phase navigation", () => {
    mockDesktopViewport(true);
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CumulusRoot>
          <MobileBattleScreen
            view={makeView()}
            inspectorDefault="collapsed"
            phaseNavigation="hidden"
          />
        </CumulusRoot>,
      );
    });

    expect(
      container
        .querySelector("[data-battle-inspector-open]")
        ?.getAttribute("data-battle-inspector-open"),
    ).toBe("false");
    expect(
      container.querySelector('[data-battle-inspector="docked"]'),
    ).toBeNull();
    expect(container.querySelector("[data-battle-phase-controls]")).toBeNull();
    expect(
      Array.from(container.querySelectorAll("button")).some((button) => {
        const label = button.getAttribute("aria-label") ?? button.textContent;
        return (
          label?.includes("Back") === true ||
          label?.includes("Next Phase") === true
        );
      }),
    ).toBe(false);

    act(() => root.unmount());
    container.remove();
  });

  it("uses one glass boundary with transparent sections in the docked inspector", () => {
    mockDesktopViewport(true);
    const { container, root } = mount(makeView());
    const inspector = container.querySelector(
      '[data-battle-inspector="docked"]',
    );

    expect(
      inspector?.querySelectorAll("[data-glass-panel-frame]"),
    ).toHaveLength(1);
    expect(
      inspector?.querySelectorAll("[data-battle-inspector-section]").length,
    ).toBeGreaterThan(0);
    expect(
      inspector?.querySelector(
        "[data-glass-panel-frame] [data-glass-panel-frame]",
      ),
    ).toBeNull();

    act(() => root.unmount());
  });

  it("shares stable physical-card identities with a composing layout group", () => {
    const { container, root } = mount(makeView(), undefined, {
      cardLayoutGroup: "inherited",
    });
    const board = container.querySelector<HTMLElement>("[data-battle-mobile]");
    const cardMotion = container
      .querySelector<HTMLElement>('[data-battle-card-id="enemy-back-card"]')
      ?.querySelector<HTMLElement>(":scope > [data-battle-card-motion]");

    expect(board?.dataset.battleCardLayoutGroup).toBe("inherited");
    expect(cardMotion?.dataset.battleCardLayoutId).toBe(
      "battle-card:enemy-back-card",
    );
    expect(
      container.querySelector<HTMLElement>('[data-battle-play-area="enemy"]')
        ?.style.overflow,
    ).toBe("visible");

    act(() => root.unmount());
  });

  it("renders the tutorial End Turn action as the sole purple primary control", () => {
    mockDesktopViewport(true);
    const onNextPhase = vi.fn();
    const interactions: MobileBattleInteractions = {
      canInteract: true,
      nearSide: "player",
      pendingCardId: null,
      pendingCardSource: null,
      pendingCardOwner: null,
      onHandCardActivate: vi.fn(),
      onCardDragStart: vi.fn(),
      onCardDragEnd: vi.fn(),
      onSlotDrop: vi.fn(),
      onZoneDrop: vi.fn(),
      onPreviousPhase: vi.fn(),
      onNextPhase,
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <CumulusRoot>
          <MobileBattleScreen
            view={makeView()}
            interactions={interactions}
            phaseNavigation="end-turn"
          />
        </CumulusRoot>,
      );
    });

    const endTurn = container.querySelector<HTMLButtonElement>(
      '[data-testid="tutorial-end-turn"]',
    );
    expect(endTurn?.textContent?.trim()).not.toBe("");
    expect(endTurn?.dataset.glassVariant).toBe("accent");
    expect(container.querySelector('button[aria-label="Back"]')).toBeNull();
    act(() => endTurn?.click());
    expect(onNextPhase).toHaveBeenCalledOnce();

    act(() => root.unmount());
    container.remove();
  });

  it("labels the opponent's tutorial dusk action Start Challenge", () => {
    const baseView = makeView();
    const view: MobileBattleView = {
      ...baseView,
      activeSide: "enemy",
      phase: "dusk",
    };
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
    };
    const { container, root } = mount(view, interactions, {
      phaseNavigation: "tutorial",
    });

    const startChallengeLabel = container.querySelector<HTMLButtonElement>(
      '[data-testid="tutorial-end-turn"]',
    )?.textContent;
    expect(startChallengeLabel).toBe("Start Challenge");
    expect(
      container.querySelector<HTMLElement>("[data-battle-phase-next]")?.style
        .width,
    ).toBe("max-content");

    act(() => {
      root.render(
        <CumulusRoot>
          <MobileBattleScreen
            view={{ ...baseView, activeSide: "player", phase: "night" }}
            interactions={interactions}
            phaseNavigation="tutorial"
          />
        </CumulusRoot>,
      );
    });
    expect(
      container.querySelector<HTMLButtonElement>(
        '[data-testid="tutorial-end-turn"]',
      )?.textContent,
    ).toBe(startChallengeLabel);

    act(() => root.unmount());
  });

  it("marks only the active side's front-rank characters after Day", () => {
    const baseView = makeView();
    const player = {
      ...baseView.player,
      frontRank: [
        {
          id: parseBattleSlotViewId("player-front-filled"),
          card: makeCard(24, parseBattleCardId("player-front-challenger")),
        },
        { id: parseBattleSlotViewId("player-front-empty"), card: null },
      ],
    };
    const dayView: MobileBattleView = {
      ...baseView,
      near: player,
      player,
      phase: "day",
    };
    const { container, root } = mount(dayView, undefined, {
      phaseNavigation: "tutorial",
      viewport: "contained",
    });

    expect(
      container.querySelector("[data-battle-challenger-chevron]"),
    ).toBeNull();

    act(() => {
      root.render(
        <CumulusRoot>
          <MobileBattleScreen
            view={{ ...dayView, phase: "dusk" }}
            phaseNavigation="tutorial"
            viewport="contained"
          />
        </CumulusRoot>,
      );
    });

    const playerChevron = container.querySelector<HTMLElement>(
      '[data-battle-challenger-chevron="player"]',
    );
    expect(playerChevron?.dataset.battleChallengerChevronDirection).toBe("up");
    expect(playerChevron?.dataset.battleChallengerChevronStyle).toBe(
      "circle-badge",
    );
    expect(playerChevron?.style.width).toBe("22%");
    expect(playerChevron?.style.height).toBe("16%");
    expect(playerChevron?.style.left).toBe("50%");
    expect(playerChevron?.style.top).toBe("-4%");
    expect(playerChevron?.querySelector("circle")?.getAttribute("fill")).toBe(
      "var(--surface-status-badge)",
    );
    expect(playerChevron?.querySelector("svg")?.getAttribute("viewBox")).toBe(
      "0 0 50 50",
    );
    expect(
      playerChevron?.querySelector("svg")?.getAttribute("preserveAspectRatio"),
    ).toBe("xMidYMid meet");
    expect(
      playerChevron?.querySelectorAll("polyline")[1]?.getAttribute("points"),
    ).toBe("13,32 25,19 37,32");
    expect(
      playerChevron?.querySelectorAll("polyline")[0]?.getAttribute("stroke"),
    ).toBe("var(--surface-status-badge)");
    expect(
      playerChevron?.querySelectorAll("polyline")[1]?.getAttribute("stroke"),
    ).toBe("var(--battle-challenger-chevron)");
    expect(
      container.querySelector<HTMLElement>('[data-battle-play-area="player"]')
        ?.style.zIndex,
    ).toBe("6");
    expect(
      container.querySelector('[data-battle-challenger-chevron="enemy"]'),
    ).toBeNull();
    expect(
      container.querySelector(
        '[data-battle-rank="player-back"] [data-battle-challenger-chevron]',
      ),
    ).toBeNull();

    act(() => {
      root.render(
        <CumulusRoot>
          <MobileBattleScreen
            view={{ ...baseView, activeSide: "enemy", phase: "night" }}
          />
        </CumulusRoot>,
      );
    });

    expect(
      container.querySelector('[data-battle-challenger-chevron="player"]'),
    ).toBeNull();
    const enemyChevron = container.querySelector<HTMLElement>(
      '[data-battle-challenger-chevron="enemy"]',
    );
    expect(enemyChevron?.dataset.battleChallengerChevronDirection).toBe("down");
    expect(enemyChevron?.style.top).toBe("");
    expect(enemyChevron?.style.bottom).toBe("-4%");
    expect(enemyChevron?.querySelector("svg")?.style.transform).toBe(
      "rotate(180deg)",
    );
    expect(
      container.querySelector<HTMLElement>('[data-battle-play-area="enemy"]')
        ?.style.zIndex,
    ).toBe("6");

    const enemyPerspectivePlayer = {
      ...player,
      position: "far" as const,
    };
    const enemyPerspectiveEnemy = {
      ...baseView.enemy,
      position: "near" as const,
    };
    act(() => {
      root.render(
        <CumulusRoot>
          <MobileBattleScreen
            view={{
              ...baseView,
              perspective: "enemy",
              near: enemyPerspectiveEnemy,
              far: enemyPerspectivePlayer,
              enemy: enemyPerspectiveEnemy,
              player: enemyPerspectivePlayer,
              activeSide: "player",
              phase: "night",
            }}
          />
        </CumulusRoot>,
      );
    });

    const farPlayerChevron = container.querySelector<HTMLElement>(
      '[data-battle-challenger-chevron="player"]',
    );
    expect(farPlayerChevron?.dataset.battleChallengerChevronDirection).toBe(
      "down",
    );
    expect(farPlayerChevron?.style.top).toBe("");
    expect(farPlayerChevron?.style.bottom).toBe("-4%");
    expect(farPlayerChevron?.querySelector("svg")?.style.transform).toBe(
      "rotate(180deg)",
    );

    act(() => root.unmount());
  });

  it("keeps battle-instance status readable on battlefield and hand cards", () => {
    const view = makeView();
    const battlefieldCard = view.player.frontRank[0]?.card;
    const handCard = view.playerHand[0];
    if (
      battlefieldCard === null ||
      battlefieldCard === undefined ||
      handCard === undefined
    ) {
      throw new Error("fixture cards missing");
    }
    const statusBattlefieldCard: MobileBattleCardView = {
      ...battlefieldCard,
      exhausted: true,
      figment: true,
      storedTime: 4,
    };
    const statusHandCard: MobileBattleCardView = {
      ...handCard,
      exhausted: true,
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
      '[data-battle-card-zone="player-front-rank"] [data-battle-card-id="player-front-card"]',
    );
    const hand = container.querySelector<HTMLElement>(
      '[data-battle-card-zone="near-hand"] [data-battle-card-id="player-hand-0"]',
    );
    expect(battlefield?.dataset.battleCardExhausted).toBe("true");
    expect(battlefield?.dataset.battleCardStoredTime).toBe("4");
    expect(
      battlefield?.querySelector('[data-battle-card-status="exhausted"]'),
    ).not.toBeNull();
    expect(
      battlefield?.querySelector('[data-battle-card-status="stored-time"]'),
    ).not.toBeNull();
    expect(
      battlefield?.querySelector('[data-battle-card-status="figment-count"]'),
    ).toBeNull();
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
    const storedTimeValue = storedTimeBadge?.querySelector<HTMLElement>(
      "[data-battle-memory-counter]",
    );
    expect(storedTimeValue?.style.font).toBe("var(--t-numeral-sm)");
    expect(storedTimeValue?.textContent).toBe("4");
    expect(storedTimeValue?.firstElementChild?.nodeName).toBe("SPAN");
    expect(storedTimeValue?.querySelector("i.bxf.bx-brain")).not.toBeNull();
    expect(storedTimeValue?.querySelector("i.bxf.bx-hourglass")).toBeNull();
    expect(
      storedTimeValue?.querySelector<HTMLElement>("[data-inline-glyph]")?.style
        .color,
    ).toBe("");
    expect(storedTimeBadge?.style.background).toBe(
      "var(--surface-status-badge)",
    );
    expect(storedTimeBadge?.style.border).toContain("var(--text-on-accent)");
    expect(storedTimeBadge?.style.borderRadius).toBe("var(--radius-compact)");
    expect(
      battlefield?.querySelector('[data-battle-card-status="automated"]'),
    ).toBeNull();
    expect(
      battlefield?.querySelector<HTMLElement>("[data-battle-card-motion]")
        ?.style.filter,
    ).toContain("grayscale");
    const battlefieldDescription = accessibleDescription(
      battlefield?.querySelector<HTMLElement>("[data-game-card-source]"),
    );
    expect(battlefieldDescription.trim()).not.toBe("");

    expect(
      hand?.querySelector('[data-battle-card-status="exhausted"]'),
    ).not.toBeNull();
    expect(
      hand?.querySelector('[data-battle-card-status="stored-time"]'),
    ).not.toBeNull();
    expect(
      hand?.querySelector('[data-battle-card-status="figment-count"]'),
    ).toBeNull();
    const handDescription = accessibleDescription(
      hand?.querySelector<HTMLElement>("[data-game-card-source]"),
    );
    expect(handDescription.trim()).not.toBe("");

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
      '[data-battle-card-zone="player-front-rank"] [data-battle-card-id="player-front-card"]',
    );
    expect(updatedBattlefield?.dataset.battleCardExhausted).toBe("false");
    expect(updatedBattlefield?.dataset.battleCardStoredTime).toBe("0");
    expect(
      updatedBattlefield?.querySelector("[data-battle-card-status]"),
    ).toBeNull();
    const updatedDescription = accessibleDescription(
      updatedBattlefield?.querySelector<HTMLElement>("[data-game-card-source]"),
    );
    expect(updatedDescription.trim()).not.toBe("");
    expect(updatedDescription).not.toBe(battlefieldDescription);

    act(() => root.unmount());
  });

  it("keeps an exhausted target's selection ring outside the grayscale filter", () => {
    const view = makeView();
    const exhaustedTarget = view.enemy.backRank[1]?.card;
    if (exhaustedTarget === null || exhaustedTarget === undefined) {
      throw new Error("exhausted target fixture missing");
    }
    expect(exhaustedTarget.exhausted).toBe(true);

    const { container, root } = mount(view, {
      canInteract: true,
      pendingCardId: null,
      targetSelectionCardId: parseBattleCardId("targeting-card"),
      targetSelectionPrompt: "legal-target",
      targetableCardIds: [exhaustedTarget.id],
      onHandCardActivate: vi.fn(),
      onCardDragStart: vi.fn(),
      onCardDragEnd: vi.fn(),
      onSlotDrop: vi.fn(),
      onZoneDrop: vi.fn(),
      onPreviousPhase: vi.fn(),
      onNextPhase: vi.fn(),
    });

    const target = container.querySelector<HTMLElement>(
      `[data-battle-card-id="${exhaustedTarget.id}"]`,
    );
    const filteredBody = target?.querySelector<HTMLElement>(
      "[data-battle-card-motion]",
    );
    const selectionRing = target?.querySelector<HTMLElement>(
      '[data-battle-card-selection-ring="unfiltered"]',
    );

    expect(filteredBody?.style.filter).toContain("grayscale");
    expect(filteredBody?.contains(selectionRing ?? null)).toBe(false);
    expect(selectionRing?.style.boxShadow).toContain(
      resolveColor("accent-bright"),
    );
    expect(selectionRing?.style.boxShadow).toContain("3px");
    expect(selectionRing?.style.boxShadow).toContain("12px");
    expect(
      target?.querySelector<HTMLElement>(".card-view")?.style.boxShadow,
    ).not.toContain(resolveColor("accent-bright"));

    act(() => root.unmount());
  });

  it("stages a card awaiting a target outside the hand and battlefield", () => {
    const view = makeView();
    const targetingCard = view.playerHand[1];
    if (targetingCard === undefined) {
      throw new Error("targeting card fixture missing");
    }
    const interactions: MobileBattleInteractions = {
      canInteract: true,
      pendingCardId: null,
      targetSelectionCardId: targetingCard.id,
      targetSelectionPrompt: "legal-target",
      targetableCardIds: [parseBattleCardId("enemy-back-card")],
      onHandCardActivate: vi.fn(),
      onCardDragStart: vi.fn(),
      onCardDragEnd: vi.fn(),
      onSlotDrop: vi.fn(),
      onZoneDrop: vi.fn(),
      onPreviousPhase: vi.fn(),
      onNextPhase: vi.fn(),
    };
    const { container, root } = mount(view, interactions);

    const stage = container.querySelector<HTMLElement>(
      "[data-battle-targeting-card-stage]",
    );
    const stagedCard = stage?.querySelector<HTMLElement>(
      `[data-battle-card-id="${targetingCard.id}"]`,
    );
    const hand = container.querySelector<HTMLElement>(
      '[data-battle-mobile-row="near-hand"]',
    );

    expect(stage?.style.gridRow).toBe("5");
    expect(stagedCard?.parentElement?.dataset.battleCardZone).toBe(
      "targeting-stage",
    );
    expect(
      hand?.querySelector(`[data-battle-card-id="${targetingCard.id}"]`),
    ).toBeNull();
    expect(hand?.dataset.battleHandCount).toBe("4");
    expect(hand?.dataset.battleHandVisibleCount).toBe("3");
    expect(
      stagedCard?.querySelector<HTMLElement>("[data-battle-card-motion]")
        ?.dataset.battleCardLayoutId,
    ).toBe(`battle-card:${targetingCard.id}`);

    act(() => {
      root.render(
        <CumulusRoot>
          <MobileBattleScreen
            view={view}
            interactions={{
              ...interactions,
              targetSelectionCardId: null,
              targetSelectionPrompt: null,
            }}
          />
        </CumulusRoot>,
      );
    });

    expect(
      container.querySelector("[data-battle-targeting-card-stage]"),
    ).toBeNull();
    expect(
      container.querySelector(
        `[data-battle-mobile-row="near-hand"] [data-battle-card-id="${targetingCard.id}"]`,
      ),
    ).not.toBeNull();

    act(() => root.unmount());
  });

  it("renders a points result only over its scoring battlefield character", () => {
    const { container, root } = mount(makeView(), undefined, {
      cardOverlay: {
        kind: "points-scored",
        presentationId: parsePresentationId("challenge-resolved:player:5:F0"),
        battleCardId: parseBattleCardId("player-front-card"),
        points: 2,
      },
    });
    const scoringCard = container.querySelector<HTMLElement>(
      '[data-battle-card-zone="player-front-rank"] [data-battle-card-id="player-front-card"]',
    );
    const overlay = scoringCard?.querySelector<HTMLElement>(
      '[data-radial-announcement-variant="card-score"]',
    );

    expect(overlay?.getAttribute("aria-label")).toContain("2");
    expect(overlay?.dataset.radialAnnouncement).toBe(
      "challenge-resolved:player:5:F0",
    );
    expect(overlay?.dataset.radialAnnouncementPoints).toBe("2");
    expect(overlay?.querySelector("i.bxf.bx-star-circle")).not.toBeNull();
    expect(overlay?.textContent).not.toContain("⍟");
    expect(
      container
        .querySelector(
          '[data-battle-card-zone="enemy-front-rank"] [data-battle-card-id="enemy-front-card"]',
        )
        ?.querySelector('[data-radial-announcement-variant="card-score"]'),
    ).toBeNull();
    expect(
      container
        .querySelector(
          '[data-battle-card-zone="near-hand"] [data-battle-card-id="player-hand-0"]',
        )
        ?.querySelector('[data-radial-announcement-variant="card-score"]'),
    ).toBeNull();

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
        .querySelector<HTMLButtonElement>(
          '[data-testid="battle-result-inspect"]',
        )
        ?.click();
    });
    expect(onResultAction).toHaveBeenCalledWith("dismiss");

    act(() => root.unmount());
  });

  it("places an opponent Dreamwell card below the opponent status display", () => {
    vi.useFakeTimers();
    mockDesktopViewport(true);
    const cardId = testDreamwellCardId("3a4293da-55a1-4094-898a-df402ffa1c92");
    const initialView = makeView();
    const view: MobileBattleView = {
      ...initialView,
      activeSide: "enemy",
      dreamwell: {
        side: "enemy",
        model: {
          cardId,
          displaySnapshot: {
            id: cardId,
            name: assertLocalized("Fixture Beacon"),
            renderedText: assertLocalized("Draw a card."),
            energyAdded: 2,
            imageNumber: 42,
          },
        },
      },
    };
    const { container, root } = mount(initialView);
    act(() => {
      root.render(
        <CumulusRoot>
          <MobileBattleScreen view={view} />
        </CumulusRoot>,
      );
    });

    const enemyStatus = container.querySelector<HTMLElement>(
      '[data-battle-zone="enemy-status"]',
    );
    expect(
      container.querySelector<HTMLElement>("[data-battle-mobile]")?.dataset
        .battleLayout,
    ).toBe("desktop");
    expect(
      enemyStatus?.querySelector("[data-battle-dreamwell-layer]"),
    ).toBeNull();
    expect(
      container.querySelector('[data-radial-announcement="enemy"]'),
    ).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(2_100);
    });
    const layer = enemyStatus?.querySelector<HTMLElement>(
      "[data-battle-dreamwell-layer]",
    );
    const sideZoneRow = layer?.closest<HTMLElement>(
      '[data-battle-mobile-row="enemy-zones"]',
    );
    expect(layer?.dataset.battleDreamwellSide).toBe("enemy");
    expect(sideZoneRow?.style.zIndex).toBe("5");
    expect(layer?.style.position).toBe("absolute");
    expect(layer?.style.top).toBe("calc(100% + var(--space-xs))");
    expect(layer?.style.bottom).toBe("");
    expect(layer?.style.pointerEvents).toBe("none");
    expect(layer?.style.animation).toBe("none");
    expect(layer?.style.transition).toBe("none");
    expect(
      layer?.querySelector<HTMLElement>("[data-dreamwell-card]")?.dataset
        .dreamwellCard,
    ).toBe(cardId);
    expect(
      container.querySelector(
        '[data-battle-zone="player-status"] [data-battle-dreamwell-layer]',
      ),
    ).toBeNull();

    act(() => root.unmount());
    vi.useRealTimers();
  });

  it("places a player Dreamwell card above the player status display", () => {
    const cardId = testDreamwellCardId("3a4293da-55a1-4094-898a-df402ffa1c92");
    const view: MobileBattleView = {
      ...makeView(),
      dreamwell: {
        side: "player",
        model: {
          cardId,
          displaySnapshot: {
            id: cardId,
            name: assertLocalized("Fixture Beacon"),
            renderedText: assertLocalized("Draw a card."),
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
    expect(
      playerStatus?.querySelector("[data-battle-dreamwell-layer]"),
    ).not.toBeNull();
    const layer = playerStatus?.querySelector<HTMLElement>(
      "[data-battle-dreamwell-layer]",
    );
    const sideZoneRow = layer?.closest<HTMLElement>(
      '[data-battle-mobile-row="player-zones"]',
    );
    expect(layer?.dataset.battleDreamwellSide).toBe("player");
    expect(sideZoneRow?.style.zIndex).toBe("5");
    expect(layer?.style.top).toBe("");
    expect(layer?.style.bottom).toBe(
      "calc(100% + var(--space-xs) + var(--space-6xl) + var(--space-s))",
    );
    expect(
      container.querySelector(
        '[data-battle-zone="enemy-status"] [data-battle-dreamwell-layer]',
      ),
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
    expect(safeAreaBackdrop?.style.height).toBe("var(--safe-area-inset-top)");
    expect(safeAreaBackdrop?.style.background).toBe("var(--bg-app)");
    expect(rowNames).toEqual([
      "far-hand",
      "enemy-zones",
      "enemy-play-area",
      "player-play-area",
      "control-row",
      "player-zones",
      "near-hand",
    ]);

    act(() => root.unmount());
  });

  it("renders the reversed canonical perspective and exposes a stable pressed toggle", () => {
    const base = makeView();
    const near = { ...base.enemy, position: "near" as const };
    const far = { ...base.player, position: "far" as const };
    const onPerspectiveToggle = vi.fn();
    const view: MobileBattleView = {
      ...base,
      perspective: "enemy",
      near,
      far,
      nearHand: {
        owner: "enemy",
        position: "near",
        cardIds: base.enemyHandCardIds,
        cards: base.enemyHand,
      },
      farHand: {
        owner: "player",
        position: "far",
        cardIds: base.playerHand.map((card) => card.id),
        cards: [],
      },
      inspector: { ...base.inspector, perspective: "enemy" },
    };
    const { container, root } = mount(view, {
      canInteract: true,
      nearSide: "enemy",
      pendingCardId: null,
      onHandCardActivate: vi.fn(),
      onCardDragStart: vi.fn(),
      onCardDragEnd: vi.fn(),
      onSlotDrop: vi.fn(),
      onZoneDrop: vi.fn(),
      onPreviousPhase: vi.fn(),
      onNextPhase: vi.fn(),
      onPerspectiveToggle,
    });

    expect(
      container
        .querySelector("[data-battle-mobile]")
        ?.getAttribute("data-battle-perspective"),
    ).toBe("enemy");
    expect(
      container
        .querySelector('[data-battle-mobile-row="enemy-zones"]')
        ?.getAttribute("style"),
    ).toContain("grid-row: 6");
    expect(
      container
        .querySelector('[data-battle-mobile-row="player-zones"]')
        ?.getAttribute("style"),
    ).toContain("grid-row: 2");
    expect(
      container
        .querySelector('[data-battle-play-area="enemy"]')
        ?.getAttribute("style"),
    ).toContain("grid-row: 4");
    expect(
      container
        .querySelector('[data-battle-play-area="player"]')
        ?.getAttribute("style"),
    ).toContain("grid-row: 3");
    expect(
      container
        .querySelector('[data-battle-mobile-row="near-hand"]')
        ?.getAttribute("data-battle-hand-owner"),
    ).toBe("enemy");
    expect(
      container.querySelector('[data-testid="battle-perspective-toggle"]'),
    ).toBeNull();
    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="battle-inspector-trigger"]',
        )
        ?.click();
    });
    const inspector = container.querySelector(
      '[data-battle-inspector="takeover"]',
    );
    expect(inspector).not.toBeNull();
    const toggle = inspector?.querySelector<HTMLButtonElement>(
      '[data-testid="battle-perspective-toggle"]',
    );
    expect(toggle?.textContent).toContain("Return to Your Side");
    expect(toggle?.getAttribute("aria-pressed")).toBe("true");
    act(() => toggle?.click());
    expect(onPerspectiveToggle).toHaveBeenCalledOnce();

    act(() => root.unmount());
  });

  it("closes the developer inspector when the perspective changes", () => {
    mockDesktopViewport(true);
    const view = makeView();
    const { container, root } = mount(view);
    expect(
      container.querySelector('[data-battle-inspector="docked"]'),
    ).not.toBeNull();

    const reversed: MobileBattleView = {
      ...view,
      perspective: "enemy",
      near: { ...view.enemy, position: "near" },
      far: { ...view.player, position: "far" },
      nearHand: {
        owner: "enemy",
        position: "near",
        cardIds: view.enemyHandCardIds,
        cards: view.enemyHand,
      },
      farHand: {
        owner: "player",
        position: "far",
        cardIds: view.playerHand.map((card) => card.id),
        cards: [],
      },
      inspector: { ...view.inspector, perspective: "enemy" },
    };
    act(() => {
      root.render(
        <CumulusRoot>
          <MobileBattleScreen view={reversed} />
        </CumulusRoot>,
      );
    });

    expect(
      container.querySelector('[data-battle-inspector="docked"]'),
    ).toBeNull();
    act(() => root.unmount());
  });

  it("locks ordinary controls and shows recovery copy for a far-side prompt", () => {
    const view: MobileBattleView = {
      ...makeView(),
      promptNotice: {
        promptSide: "enemy",
      },
    };
    const { container, root } = mount(view, {
      canInteract: false,
      nearSide: "player",
      pendingCardId: null,
      pendingCardSource: null,
      pendingCardOwner: null,
      onHandCardActivate: vi.fn(),
      onCardDragStart: vi.fn(),
      onCardDragEnd: vi.fn(),
      onSlotDrop: vi.fn(),
      onZoneDrop: vi.fn(),
      onPreviousPhase: vi.fn(),
      onNextPhase: vi.fn(),
      onPerspectiveToggle: vi.fn(),
    });

    expect(
      container.querySelector('[data-battle-prompt-waiting="enemy"]')
        ?.textContent,
    ).not.toBe("");
    expect(
      container
        .querySelector("[data-battle-phase-next] button")
        ?.getAttribute("aria-disabled"),
    ).toBe("true");
    expect(
      container.querySelectorAll("[data-battle-card-picker-candidate]"),
    ).toHaveLength(0);

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
      '[data-battle-mobile-row="near-hand"]',
    );
    const enemyHand = container.querySelector<HTMLElement>(
      '[data-battle-mobile-row="far-hand"]',
    );
    const firstEnemyCard = enemyHand?.querySelector<HTMLElement>(
      '[data-battle-card-id="enemy-hand-0"]',
    );
    const firstHandCard = playerHand?.querySelector<HTMLElement>(
      '[data-battle-card-id="player-hand-0"]',
    )?.parentElement?.parentElement;
    const lastHandCard = playerHand?.querySelector<HTMLElement>(
      '[data-battle-card-id="player-hand-3"]',
    )?.parentElement?.parentElement;
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
    expect(enemyZones?.style.columnGap).toBe("var(--space-6xl)");
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
    expect(enemyHand?.style.gap).toBe("var(--space-xs)");
    expect(firstEnemyCard?.style.position).toBe("relative");
    expect(firstEnemyCard?.style.left).toBe("");
    expect(firstEnemyCard?.style.transform).not.toContain("translateX");
    expect(playerHand?.style.display).toBe("flex");
    expect(playerHand?.style.justifyContent).toBe("center");
    expect(playerHand?.style.gap).toBe("var(--space-xs)");
    expect(playerHand?.style.paddingTop).toBe("var(--space-2xl)");
    expect(playerHand?.style.paddingLeft).toContain(
      "--battle-hud-start-clearance",
    );
    expect(playerHand?.style.paddingRight).toContain(
      "--battle-hud-end-clearance",
    );
    const playerCards = playerHand?.querySelectorAll<HTMLElement>(
      '[data-battle-card-zone="near-hand"]',
    );
    const playerSlots = playerHand?.querySelectorAll<HTMLElement>(
      "[data-battle-near-hand-slot]",
    );
    expect(playerSlots).toHaveLength(playerCards?.length ?? 0);
    expect(playerSlots?.[0]?.style.flex).toBe("0 1 auto");
    expect(playerSlots?.[0]?.style.minWidth).toBe("0px");
    expect(playerCards?.[0]?.parentElement?.style.left).toBe("0px");
    expect(playerCards?.[1]?.parentElement?.style.left).toBe("50%");
    expect(playerHand?.style.transform).toBe("translateY(var(--space-2xl))");
    expect(playerHand?.style.pointerEvents).toBe("none");
    expect(playerHand?.dataset.battleHandCardHoverScale).toBe(
      String(BATTLE_HAND_CARD_HOVER_SCALE),
    );
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
    const onPerspectiveToggle = vi.fn();
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
      onPerspectiveToggle,
      onInspectorAction,
    };
    const { container, root } = mount(makeView(), interactions);

    expect(
      container.querySelector('[data-battle-inspector="docked"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-battle-debug="player-state-panel"]'),
    ).toBeNull();
    expect(container.textContent).toContain("Battle Snapshot");
    expect(container.textContent).toContain("Player Resources");
    expect(container.textContent).toContain("Back Rank");
    expect(container.textContent).not.toContain("Stack cards");
    const inspector = container.querySelector(
      '[data-battle-inspector="docked"]',
    );
    const perspectiveToggle = inspector?.querySelector<HTMLButtonElement>(
      '[data-testid="battle-perspective-toggle"]',
    );
    expect(perspectiveToggle?.textContent).toContain("Control Opponent");
    expect(perspectiveToggle?.getAttribute("aria-pressed")).toBe("false");
    expect(
      container.querySelector(
        '[data-battle-top-right-controls] [data-testid="battle-perspective-toggle"]',
      ),
    ).toBeNull();

    act(() => {
      perspectiveToggle?.click();
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="battle-inspector-draw-player"]',
        )
        ?.click();
      Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
        .find((button) => button.textContent === "Open Banished")
        ?.click();
      const enemyTab = Array.from(
        container.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
      ).find((button) => button.textContent === "Enemy");
      enemyTab?.click();
    });

    expect(onInspectorAction).toHaveBeenCalledWith({
      kind: "draw",
      side: "player",
    });
    expect(onInspectorAction).toHaveBeenCalledWith({
      kind: "open-zone",
      side: "player",
      zone: "banished",
    });
    expect(onInspectorAction).toHaveBeenCalledWith({
      kind: "side-selected",
      side: "enemy",
    });
    expect(onPerspectiveToggle).toHaveBeenCalledOnce();
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
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="battle-inspector-open-battle-log"]',
        )
        ?.click();
    });
    expect(onInspectorAction).toHaveBeenCalledWith({ kind: "open-battle-log" });
    expect(
      container.querySelector('[data-battle-inspector="docked"]'),
    ).toBeNull();

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="battle-inspector-trigger"]',
        )
        ?.click();
    });
    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="battle-inspector-open-dreamwell-history"]',
        )
        ?.click();
    });
    expect(onInspectorAction).toHaveBeenCalledWith({
      kind: "open-dreamwell-history",
    });
    expect(
      container.querySelector('[data-battle-inspector="docked"]'),
    ).toBeNull();

    act(() => root.unmount());
  });

  it("keeps the inspector closed initially in the takeover layout", () => {
    mockDesktopViewport(false);
    const { container, root } = mount();

    expect(container.querySelector("[data-battle-inspector]")).toBeNull();
    expect(
      container.querySelector('[data-testid="battle-inspector-trigger"]'),
    ).not.toBeNull();

    act(() => root.unmount());
  });

  it("opens a full-screen takeover with collapsed secondary sections and restores trigger focus on Escape", () => {
    mockDesktopViewport(false);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const { container, root } = mount();
    const trigger = container.querySelector<HTMLButtonElement>(
      '[data-testid="battle-inspector-trigger"]',
    );
    trigger?.focus();
    act(() => trigger?.click());

    expect(container.querySelector('[role="dialog"]')).not.toBeNull();
    expect(
      container.querySelector('[data-battle-inspector="takeover"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-disclosure-expanded="true"]'),
    ).toBeNull();

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
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="battle-inspector-trigger"]',
        )
        ?.click();
    });
    expect(
      container.querySelector('[data-battle-inspector="takeover"]'),
    ).not.toBeNull();

    const foresee = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent === "Foresee");
    act(() => foresee?.click());

    expect(onInspectorAction).toHaveBeenCalledWith({
      kind: "foresee",
      side: "player",
    });
    expect(
      container.querySelector('[data-battle-inspector="takeover"]'),
    ).toBeNull();
    act(() => root.unmount());
  });

  it("dismisses the mobile inspector takeover before opening deck ordering", () => {
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
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="battle-inspector-trigger"]',
        )
        ?.click();
    });
    expect(
      container.querySelector('[data-battle-inspector="takeover"]'),
    ).not.toBeNull();

    const reorderDeck = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent === "Reorder Deck");
    act(() => reorderDeck?.click());

    expect(onInspectorAction).toHaveBeenCalledWith({
      kind: "reorder-deck",
      side: "player",
    });
    expect(
      container.querySelector('[data-battle-inspector="takeover"]'),
    ).toBeNull();
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
          player: {
            ...view.inspector.sides.player,
            canDiscard: false,
            canShuffle: false,
          },
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
    const discard = container.querySelector<HTMLButtonElement>(
      '[data-testid="battle-inspector-discard-player"]',
    );
    const shuffle = Array.from(
      container.querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent === "Shuffle");
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
      const status = row?.querySelector<HTMLElement>(
        `[data-testid="${owner}-battle-status"]`,
      );
      expect(status).not.toBeNull();
      expect(
        status?.querySelector('[data-battle-status-resource="points"]')
          ?.textContent,
      ).toBe(`${String(view[owner].status.points)}/10`);
      expect(row?.style.gridTemplateColumns).toBe(
        "minmax(0, 1fr) max-content minmax(0, 1fr)",
      );
      expect(row?.style.columnGap).toBe("var(--space-xl)");
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
      expect(voidZone?.querySelector("[data-game-card-source]")).toBeNull();
    }

    const playerZones = container.querySelector<HTMLElement>(
      '[data-battle-mobile-row="player-zones"]',
    );
    const playerHand = container.querySelector<HTMLElement>(
      '[data-battle-mobile-row="near-hand"]',
    );
    expect(playerZones?.style.gridRow).toBe("6");
    expect(playerZones?.style.gridColumn).toBe("1");
    expect(playerHand?.style.gridRow).toBe("6");
    expect(playerHand?.style.gridColumn).toBe("1");
    expect(playerHand?.style.zIndex).toBe("15");
    expect(playerZones?.style.height).toBe("var(--space-6xl)");
    expect(playerZones?.style.transform).toBe(
      "translateY(calc(-1 * var(--space-xl)))",
    );

    expect(container.textContent).not.toContain("Enemy deck");
    expect(container.textContent).not.toContain("Player deck");
    expect(container.textContent).not.toContain("Enemy void");
    expect(container.textContent).not.toContain("Player void");

    act(() => root.unmount());
  });

  it("keeps an empty void visible as a dotted landscape card outline", () => {
    const baseView = makeView();
    const view: MobileBattleView = {
      ...baseView,
      player: { ...baseView.player, voidCards: [] },
    };
    const { container, root } = mount(view);

    const voidZone = container.querySelector<HTMLElement>(
      '[data-battle-zone="player-void"]',
    );
    const voidPile = voidZone?.querySelector<HTMLElement>("[data-card-pile]");
    const outline = voidZone?.querySelector<HTMLElement>(
      "[data-card-pile-empty]",
    );
    expect(voidPile?.dataset.pileCount).toBe("0");
    expect(voidPile?.dataset.pileEmptyState).toBe("outlined");
    expect(voidPile?.style.aspectRatio).toBe("7 / 5");
    expect(outline?.style.border).toBe("var(--battlefield-slot-border)");

    act(() => root.unmount());
  });

  it("shows void labels only when the presentation requests them", () => {
    const baseView = makeView();
    const view: MobileBattleView = {
      ...baseView,
      enemy: { ...baseView.enemy, voidCards: [] },
      player: { ...baseView.player, voidCards: [] },
    };
    const defaultRender = mount(view);
    expect(
      defaultRender.container.querySelectorAll("[data-card-pile-empty-label]"),
    ).toHaveLength(0);
    act(() => defaultRender.root.unmount());

    const tutorialRender = mount(view, undefined, { zoneLabels: "voids" });
    const labels = Array.from(
      tutorialRender.container.querySelectorAll<HTMLElement>(
        "[data-card-pile-empty-label]",
      ),
    );
    expect(labels).toHaveLength(2);
    expect(labels.map((label) => label.textContent)).toEqual(["Void", "Void"]);
    act(() => tutorialRender.root.unmount());
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
      container
        .querySelector<HTMLButtonElement>('[data-testid="player-battle-deck"]')
        ?.click();
      container
        .querySelector<HTMLButtonElement>('[data-testid="player-battle-void"]')
        ?.click();
    });

    expect(onZoneOpen).toHaveBeenNthCalledWith(1, {
      owner: "player",
      zone: "deck",
    });
    expect(onZoneOpen).toHaveBeenNthCalledWith(2, {
      owner: "player",
      zone: "void",
    });
    expect(container.querySelector('[data-battle-zone="banished"]')).toBeNull();

    act(() => root.unmount());
  });

  it("shows one desktop icon for both non-empty banished zones", () => {
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
    const { container, root } = mount(
      {
        ...view,
        player: { ...view.player, banishedCardCount: 2 },
        enemy: { ...view.enemy, banishedCardCount: 1 },
      },
      interactions,
    );

    const controlFrame = container.querySelector<HTMLElement>(
      '[data-battle-zone="banished"]',
    );
    const button = controlFrame?.querySelector<HTMLButtonElement>(
      '[data-testid="near-battle-banished"]',
    );
    const topLeftControls = container.querySelector<HTMLElement>(
      "[data-battle-top-left-controls]",
    );

    expect(topLeftControls?.style.position).toBe("absolute");
    expect(topLeftControls?.style.left).toBe(
      "calc(var(--safe-area-inset-left) + var(--space-s))",
    );
    expect(controlFrame?.dataset.battleZoneCount).toBe("3");
    expect(controlFrame?.dataset.battleZoneNearCount).toBe("2");
    expect(controlFrame?.dataset.battleZoneFarCount).toBe("1");
    expect(
      container.querySelectorAll('[data-testid="near-battle-banished"]'),
    ).toHaveLength(1);
    expect(button?.textContent).toBe("");
    expect(button?.getAttribute("aria-label")).toContain("3");
    expect(button?.querySelector(".bx-block")).not.toBeNull();

    act(() => button?.click());
    expect(onZoneOpen).toHaveBeenCalledWith({
      owner: "player",
      zone: "banished",
    });

    act(() => root.unmount());
  });

  it("opens the far-side banished zone when the near-side zone is empty", () => {
    mockDesktopViewport(true);
    const view = makeView();
    const onZoneOpen = vi.fn();
    const { container, root } = mount(
      {
        ...view,
        perspective: "enemy",
        player: { ...view.player, banishedCardCount: 2 },
        enemy: { ...view.enemy, banishedCardCount: 0 },
      },
      {
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
      },
    );

    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="near-battle-banished"]',
    );
    expect(button?.getAttribute("aria-label")).toContain("2");

    act(() => button?.click());
    expect(onZoneOpen).toHaveBeenCalledWith({
      owner: "player",
      zone: "banished",
    });

    act(() => root.unmount());
  });

  it("keeps the banished icon button off the mobile battle layout", () => {
    const view = makeView();
    const { container, root } = mount(
      {
        ...view,
        player: { ...view.player, banishedCardCount: 2 },
      },
      {
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
      },
    );

    expect(container.querySelector('[data-battle-zone="banished"]')).toBeNull();

    act(() => root.unmount());
  });

  it("skips the opening turn and announces later turns on a circular surface", () => {
    vi.useFakeTimers();
    const onTurnAnnouncementComplete = vi.fn();
    const view = { ...makeView(), isOpeningTurn: true };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const render = (nextView: MobileBattleView): void => {
      act(() => {
        root.render(
          <CumulusRoot>
            <MobileBattleScreen
              view={nextView}
              onTurnAnnouncementComplete={onTurnAnnouncementComplete}
              playbackSpeed={3}
            />
          </CumulusRoot>,
        );
      });
    };
    render(view);

    expect(container.querySelector("[data-radial-announcement]")).toBeNull();

    render({ ...view, activeSide: "enemy" });
    const opponentAnnouncement = container.querySelector<HTMLElement>(
      '[data-radial-announcement="enemy"]',
    );
    expect(
      opponentAnnouncement?.querySelector("[data-radial-announcement-copy]")
        ?.textContent,
    ).toBe("Opponent Turn");
    expect(opponentAnnouncement?.querySelector("i, svg")).toBeNull();

    render({ ...view, activeSide: "player" });
    const playerAnnouncement = container.querySelector<HTMLElement>(
      '[data-radial-announcement="player"]',
    );
    const playerDisc = playerAnnouncement?.querySelector<HTMLElement>(
      "[data-radial-announcement-disc]",
    );

    expect(
      playerAnnouncement?.querySelector("[data-radial-announcement-copy]")
        ?.textContent,
    ).toBe("Your Turn");
    expect(playerAnnouncement?.querySelector("i, svg")).toBeNull();
    expect(playerDisc?.style.width).toBe("184px");
    expect(playerDisc?.style.height).toBe("184px");
    expect(playerDisc?.style.borderRadius).toBe("var(--radius-pill)");
    expect(playerDisc?.style.animation).toContain("radial-announcement-disc");

    act(() => {
      vi.advanceTimersByTime(699);
    });
    expect(onTurnAnnouncementComplete).not.toHaveBeenCalled();
    expect(
      container.querySelector("[data-radial-announcement]"),
    ).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onTurnAnnouncementComplete).toHaveBeenCalledOnce();
    expect(onTurnAnnouncementComplete).toHaveBeenCalledWith("player");
    expect(container.querySelector("[data-radial-announcement]")).toBeNull();

    act(() => root.unmount());
    vi.useRealTimers();
  });

  it("does not announce the current turn when a battle mounts mid-turn", () => {
    vi.useFakeTimers();
    const { container, root } = mount(makeView());

    expect(container.querySelector("[data-radial-announcement]")).toBeNull();
    act(() => {
      vi.advanceTimersByTime(2_100);
    });
    expect(container.querySelector("[data-radial-announcement]")).toBeNull();

    act(() => root.unmount());
    vi.useRealTimers();
  });

  it("moves one glowing phase light above the active player status", () => {
    const { container, root } = mount();
    const indicator = container.querySelector<HTMLElement>(
      '[data-battle-phase="day"][data-battle-side="near"]',
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

    expect(container.querySelector('[data-battle-side="far"]')).toBeNull();
    expect(indicator?.dataset.battlePhase).toBe("day");
    expect(indicator?.getAttribute("aria-label")?.trim()).not.toBe("");
    expect(indicator?.parentElement?.dataset.battleStatusPhaseAnchor).toBe("");
    expect(indicator?.style.top).toBe("0px");
    expect(indicator?.style.bottom).toBe("");
    expect(light?.style.width).toBe("19px");
    expect(light?.style.height).toBe("19px");
    expect(light?.style.top).toBe("12px");
    expect(light?.style.left).toBe("30%");
    expect(light?.style.transform).toBe("translate(-50%, -100%)");
    expect(light?.style.transition).toContain("var(--motion-object-travel)");
    expect(icon?.classList.contains("bxf")).toBe(true);
    expect(icon?.classList.contains("bx-sun")).toBe(true);
    expect(core?.style.borderRadius).toBe("var(--radius-pill)");
    expect(core?.style.backgroundColor).toBe("var(--bg-sunken)");
    expect(core?.style.fontSize).toBe("15px");
    expect(icon?.style.width).toBe("1em");
    expect(icon?.style.height).toBe("1em");
    expect(icon?.style.color).toBe("var(--accent-bright)");
    expect(icon?.style.filter.match(/drop-shadow/g)).toHaveLength(2);
    expect(halo?.style.backgroundColor).toBe("var(--accent)");
    expect(halo?.style.animation).toBe("");
    expect(streak?.style.width).toBe("28px");
    expect(streak?.style.height).toBe("2px");
    expect(streak?.style.backgroundColor).toBe("var(--accent-bright)");
    expect(streak?.style.animation).toContain("cumulus-battle-phase-comet");
    expect(streak?.style.animation).toContain("var(--dur-slow)");

    act(() => root.unmount());
  });

  it("places the active opponent phase light below its status", () => {
    const view: MobileBattleView = {
      ...makeView(),
      activeSide: "enemy",
      phase: "challenge",
    };
    const { container, root } = mount(view);
    const indicator = container.querySelector<HTMLElement>(
      '[data-battle-phase="challenge"][data-battle-side="far"]',
    );
    const light = indicator?.querySelector<HTMLElement>(
      "[data-battle-phase-light]",
    );
    const halo = light?.querySelector<HTMLElement>(
      "[data-battle-phase-light-halo]",
    );

    expect(container.querySelector('[data-battle-side="near"]')).toBeNull();
    expect(indicator?.dataset.battlePhase).toBe("challenge");
    expect(indicator?.parentElement?.dataset.battleStatusPhaseAnchor).toBe("");
    expect(indicator?.style.top).toBe("100%");
    expect(indicator?.style.bottom).toBe("");
    expect(light?.style.top).toBe("-12px");
    expect(light?.style.left).toBe("90%");
    expect(light?.style.transform).toBe("translate(-50%, 0%)");
    expect(halo?.style.animation).toContain("cumulus-battle-phase-pulse");
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

  it("renders the opening 6/5 staggered ranks in side-specific depth order", () => {
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
      11,
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
      expect(backRank?.style.height).toContain("100cqh");
      const backTrack = backRank?.querySelector<HTMLElement>(
        "[data-battle-rank-track]",
      );
      const frontTrack = frontRank?.querySelector<HTMLElement>(
        "[data-battle-rank-track]",
      );
      expect(backTrack?.style.columnGap).toBe("var(--space-xs)");
      expect(frontTrack?.style.columnGap).toBe("var(--space-xs)");
      expect(backTrack?.style.gridTemplateColumns).toContain("repeat(6,");
      expect(frontTrack?.style.gridTemplateColumns).toContain("repeat(5,");
      expect(backTrack?.style.width).toContain("6 * min(");
      expect(frontTrack?.style.width).toContain("5 * min(");
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

  it("centers the canonical live-battle window across the tutorial handoff", () => {
    const view = makeView();
    const enemyBackCard = makeCard(
      230,
      parseBattleCardId("tutorial-enemy-back-card"),
    );
    const playerFrontCard = makeCard(
      231,
      parseBattleCardId("tutorial-player-front-card"),
    );
    const canonicalRank = (
      rank: "back" | "front",
      count: number,
      filledIndex: number | null,
      card: MobileBattleCardView | null,
    ) =>
      Array.from({ length: count }, (_unused, index) => ({
        id: parseBattleSlotViewId(
          `${rank === "back" ? "B" : "F"}${String(index)}`,
        ),
        card: index === filledIndex ? card : null,
      }));
    const enemy = {
      ...view.enemy,
      backRank: canonicalRank("back", 10, 5, enemyBackCard),
      frontRank: canonicalRank("front", 9, null, null),
    };
    const player = {
      ...view.player,
      // The live tutorial handoff currently materializes only B0-B4 here.
      // Presentation still normalizes it to the centered canonical window.
      backRank: canonicalRank("back", 5, null, null),
      frontRank: canonicalRank("front", 9, 4, playerFrontCard),
    };
    const { container, root } = mount({
      ...view,
      enemy,
      player,
      near: player,
      far: enemy,
    });
    const slotIds = (owner: "enemy" | "player", rank: "back" | "front") =>
      Array.from(
        container.querySelectorAll<HTMLElement>(
          `[data-battle-rank="${owner}-${rank}"] [data-battle-slot-id]`,
        ),
        (slot) => slot.dataset.battleSlotId,
      );

    expect(slotIds("enemy", "back")).toEqual([
      "B2",
      "B3",
      "B4",
      "B5",
      "B6",
      "B7",
    ]);
    expect(slotIds("enemy", "front")).toEqual(["F2", "F3", "F4", "F5", "F6"]);
    expect(slotIds("player", "back")).toEqual([
      "B2",
      "B3",
      "B4",
      "B5",
      "B6",
      "B7",
    ]);
    expect(slotIds("player", "front")).toEqual(["F2", "F3", "F4", "F5", "F6"]);
    expect(
      container.querySelector(
        '[data-battle-rank="enemy-back"] [data-battle-slot-id="B5"] [data-battle-card-id="tutorial-enemy-back-card"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-battle-rank="player-front"] [data-battle-slot-id="F4"] [data-battle-card-id="tutorial-player-front-card"]',
      ),
    ).not.toBeNull();

    act(() => root.unmount());
  });

  it("moves the shared mobile window to keep an occupied edge lane visible", () => {
    const view = makeView();
    const edgeCard = makeCard(232, parseBattleCardId("edge-back-card"));
    const canonicalRank = (rank: "back" | "front", count: number) =>
      Array.from({ length: count }, (_unused, index) => ({
        id: parseBattleSlotViewId(
          `${rank === "back" ? "B" : "F"}${String(index)}`,
        ),
        card: rank === "back" && index === 0 ? edgeCard : null,
      }));
    const player = {
      ...view.player,
      backRank: canonicalRank("back", 10),
      frontRank: canonicalRank("front", 9),
    };
    const enemy = {
      ...view.enemy,
      backRank: canonicalRank("back", 10).map((slot) => ({
        ...slot,
        card: null,
      })),
      frontRank: canonicalRank("front", 9),
    };
    const { container, root } = mount({
      ...view,
      enemy,
      player,
      near: player,
      far: enemy,
    });
    const slotIds = (owner: "enemy" | "player", rank: "back" | "front") =>
      Array.from(
        container.querySelectorAll<HTMLElement>(
          `[data-battle-rank="${owner}-${rank}"] [data-battle-slot-id]`,
        ),
        (slot) => slot.dataset.battleSlotId,
      );

    expect(slotIds("player", "back")).toEqual([
      "B0",
      "B1",
      "B2",
      "B3",
      "B4",
      "B5",
    ]);
    expect(slotIds("player", "front")).toEqual(["F0", "F1", "F2", "F3", "F4"]);
    expect(slotIds("enemy", "back")).toEqual([
      "B0",
      "B1",
      "B2",
      "B3",
      "B4",
      "B5",
    ]);

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
        '[data-battle-card-zone="near-hand"] [data-game-card-source]',
      ),
    );

    expect(battlefieldCards).toHaveLength(4);
    battlefieldCards.forEach((card) => {
      expect(card.dataset.revealCompleteGameCard).toBe("false");
      expect(
        card.querySelector<HTMLElement>(".card-view")?.dataset.cardPresentation,
      ).toBe("battlefield");
      expect(card.querySelector("[data-card-energy-anchor]")).toBeNull();
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
      expect(card.querySelector("[data-card-energy-anchor]")).not.toBeNull();
      expect(
        card.querySelector('[data-testid="card-type-line"]'),
      ).not.toBeNull();
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
        '[data-battle-card-zone="near-hand"] [data-game-card-source]',
      ),
    );

    expect(handCards).toHaveLength(view.playerHand.length);
    expect(
      handCards[0]?.querySelector<HTMLElement>(".card-view")?.style.boxShadow,
    ).not.toContain("var(--positive)");
    expect(
      handCards[1]?.querySelector<HTMLElement>(".card-view")?.style.boxShadow,
    ).toContain("var(--positive)");
    expect(
      handCards[2]?.querySelector<HTMLElement>(".card-view")?.style.boxShadow,
    ).not.toContain("var(--positive)");

    act(() => root.unmount());
  });

  it("uses hand cards and the controls row for an inline card-picker prompt", () => {
    const view = makeView();
    const candidateIds = view.playerHand.slice(0, 2).map((card) => card.id);
    const pickerView: MobileBattleView = {
      ...view,
      cardPicker: {
        key: 42,
        label: assertLocalized("Choose an option"),
        side: "player",
        candidates: view.playerHand
          .slice(0, 2)
          .map((card) => makePickerCandidate(card, "player", "hand")),
        candidateIds,
        count: 2,
        optional: false,
        canResolve: true,
        presentation: "board",
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

    const handCards = () =>
      Array.from(
        container.querySelectorAll<HTMLElement>(
          '[data-battle-card-zone="near-hand"] > [data-battlefield-card]',
        ),
      );
    const cardShadow = (index: number): string =>
      handCards()[index]?.querySelector<HTMLElement>(".card-view")?.style
        .boxShadow ?? "";
    const submit = () =>
      container.querySelector<HTMLButtonElement>(
        '[data-testid="battle-card-picker-submit"]',
      );

    expect(container.querySelector("[data-battle-phase-controls]")).toBeNull();
    expect(
      container.querySelector("[data-battle-card-picker-controls]"),
    ).not.toBeNull();
    const progress = container.querySelector<HTMLElement>(
      "[data-battle-card-picker-progress]",
    );
    expect(progress?.textContent).toContain("0");
    expect(progress?.textContent).toContain("2");
    expect(submit()?.getAttribute("aria-disabled")).toBe("true");
    handCards().forEach((_card, index) => {
      expect(cardShadow(index)).not.toContain("var(--positive)");
      expect(cardShadow(index)).not.toContain("var(--selected)");
    });

    act(() => handCards()[0]?.click());

    expect(cardShadow(0)).toContain("var(--selected)");
    expect(cardShadow(1)).not.toContain("var(--selected)");
    expect(submit()?.getAttribute("aria-disabled")).toBe("true");
    expect(onCardPickerSelectionChange).toHaveBeenLastCalledWith([
      candidateIds[0],
    ]);

    act(() => handCards()[2]?.click());
    expect(onCardPickerSelectionChange).toHaveBeenCalledTimes(1);
    expect(onHandCardActivate).not.toHaveBeenCalled();

    act(() => handCards()[1]?.click());

    expect(cardShadow(0)).toContain("var(--selected)");
    expect(cardShadow(1)).toContain("var(--selected)");
    expect(submit()?.getAttribute("aria-disabled")).toBeNull();
    expect(progress?.textContent).toContain("2");

    act(() => submit()?.click());
    expect(onCardPickerSubmit).toHaveBeenCalledWith(candidateIds);
    expect(onHandCardActivate).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  it("keeps an optional inline card-picker skippable", () => {
    const view = makeView();
    const onCardPickerSkip = vi.fn();
    const { container, root } = mount(
      {
        ...view,
        cardPicker: {
          key: 42,
          label: assertLocalized("Choose an option"),
          side: "player",
          candidates: [
            makePickerCandidate(view.playerHand[0], "player", "hand"),
          ],
          candidateIds: [view.playerHand[0]?.id ?? parseBattleCardId("missing")],
          count: 1,
          optional: true,
          canResolve: true,
          presentation: "board",
        },
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
        onCardPickerSkip,
      },
    );

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="battle-card-picker-skip"]',
        )
        ?.click();
    });
    expect(onCardPickerSkip).toHaveBeenCalledOnce();

    act(() => root.unmount());
  });

  it("replaces Next Phase with inline choice-prompt buttons", () => {
    const onChoicePromptChoose = vi.fn();
    const { container, root } = mount(
      {
        ...makeView(),
        choicePrompt: {
          key: 42,
          label: assertLocalized("Choose an option"),
          options: [
            { label: assertLocalized("Yes") },
            { label: assertLocalized("Skip") },
          ],
          canResolve: true,
        },
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
        onChoicePromptChoose,
      },
    );
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
    expect(choiceControls?.getAttribute("aria-label")).toBeTruthy();
    expect(choiceControls?.style.width).toBe("");
    expect(choiceControls?.style.display).toBe("flex");
    expect(optionButtons).toHaveLength(2);
    expect(nextSlot?.textContent).not.toContain("Next Phase");
    expect(promptMessage?.textContent).toBeTruthy();

    act(() => {
      optionButtons[1]?.click();
    });
    expect(onChoicePromptChoose).toHaveBeenCalledWith(1);

    act(() => root.unmount());
  });

  it("reveals the full enemy hand when that side owns the inline picker", () => {
    const view = makeView();
    const candidateId = view.enemyHandCardIds[7];
    if (candidateId === undefined)
      throw new Error("expected an enemy hand card");
    const onCardPickerSubmit = vi.fn();
    const onHandCardActivate = vi.fn();
    const { container, root } = mount(
      {
        ...view,
        cardPicker: {
          key: 42,
          label: assertLocalized("Choose an option"),
          side: "enemy",
          candidates: view.enemyHand.map((card) =>
            makePickerCandidate(card, "enemy", "hand"),
          ),
          candidateIds: view.enemyHandCardIds,
          count: 1,
          optional: false,
          canResolve: true,
          presentation: "board",
        },
      },
      {
        canInteract: false,
        pendingCardId: null,
        onHandCardActivate,
        onCardDragStart: vi.fn(),
        onCardDragEnd: vi.fn(),
        onSlotDrop: vi.fn(),
        onZoneDrop: vi.fn(),
        onPreviousPhase: vi.fn(),
        onNextPhase: vi.fn(),
        onCardPickerSubmit,
      },
    );
    const enemyHand = container.querySelector<HTMLElement>(
      '[data-battle-mobile-row="far-hand"]',
    );
    const enemyCards = enemyHand?.querySelectorAll<HTMLElement>(
      ':scope > [data-battle-card-zone="far-hand"]',
    );
    const candidate = enemyHand?.querySelector<HTMLElement>(
      `[data-battle-card-id="${candidateId}"]`,
    );

    expect(enemyHand?.dataset.battleHandVisibleCount).toBe("8");
    expect(enemyCards).toHaveLength(8);
    expect(candidate?.dataset.battleCardFace).toBe("up");
    const progress = container.querySelector<HTMLElement>(
      "[data-battle-card-picker-progress]",
    );
    expect(progress?.textContent).toContain("0");
    expect(progress?.textContent).toContain("1");

    act(() => {
      container
        .querySelector<HTMLElement>('[data-battle-card-zone="near-hand"]')
        ?.click();
    });
    expect(onHandCardActivate).not.toHaveBeenCalled();

    act(() => {
      candidate?.querySelector<HTMLElement>("[data-battlefield-card]")?.click();
    });

    expect(
      enemyHand
        ?.querySelector<HTMLElement>(`[data-battle-card-id="${candidateId}"]`)
        ?.querySelector<HTMLElement>(".card-view")?.style.boxShadow,
    ).toContain("var(--selected)");
    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="battle-card-picker-submit"]',
        )
        ?.click();
    });
    expect(onCardPickerSubmit).toHaveBeenCalledWith([candidateId]);

    act(() => root.unmount());
  });

  it("selects battlefield candidates from both sides without developer tools", () => {
    const view = makeView();
    const playerCard = view.player.frontRank[0]?.card;
    const enemyCard = view.enemy.frontRank[0]?.card;
    if (
      playerCard === null ||
      playerCard === undefined ||
      enemyCard === null ||
      enemyCard === undefined
    ) {
      throw new Error("expected battlefield fixture cards");
    }
    const candidateIds = [enemyCard.id, playerCard.id];
    const onCardPickerSubmit = vi.fn();
    const { container, root } = mount(
      {
        ...view,
        cardPicker: {
          key: 42,
          label: assertLocalized("Choose an option"),
          side: "player",
          candidates: [
            makePickerCandidate(enemyCard, "enemy", "frontRank"),
            makePickerCandidate(playerCard, "player", "frontRank"),
          ],
          candidateIds,
          count: 2,
          optional: false,
          canResolve: true,
          presentation: "board",
        },
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
        onCardPickerSubmit,
      },
    );

    const candidates = Array.from(
      container.querySelectorAll<HTMLElement>(
        '[data-battle-card-picker-candidate="true"]',
      ),
    );
    expect(candidates).toHaveLength(2);
    act(() =>
      candidates[0]
        ?.querySelector<HTMLElement>("[data-game-card-source]")
        ?.click(),
    );
    act(() =>
      candidates[1]
        ?.querySelector<HTMLElement>("[data-game-card-source]")
        ?.click(),
    );
    expect(
      candidates.map((candidate) => candidate.dataset.battleCardPickerSelected),
    ).toEqual(["true", "true"]);

    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="battle-card-picker-submit"]',
        )
        ?.click(),
    );
    expect(onCardPickerSubmit).toHaveBeenCalledWith(candidateIds);

    act(() => root.unmount());
  });

  it("uses a Cumulus gallery for deck and void candidates from both sides", () => {
    const view = makeView();
    const candidates = [
      makePickerCandidate(view.player.voidCards[0], "player", "void"),
      makePickerCandidate(view.enemy.voidCards[0], "enemy", "void"),
      makePickerCandidate(
        makeCard(90, parseBattleCardId("player-deck-top")),
        "player",
        "deck",
      ),
      makePickerCandidate(
        makeCard(91, parseBattleCardId("enemy-deck-top")),
        "enemy",
        "deck",
      ),
    ];
    const onCardPickerSubmit = vi.fn();
    const { container, root } = mount(
      {
        ...view,
        cardPicker: {
          key: 42,
          label: assertLocalized("Choose an option"),
          subtitle: assertLocalized("Choose an available option to continue."),
          side: "player",
          candidates,
          candidateIds: candidates.map((candidate) => candidate.instanceId),
          count: 2,
          optional: false,
          canResolve: true,
          presentation: "gallery",
        },
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
        onCardPickerSubmit,
      },
    );

    expect(
      container.querySelector('[role="dialog"]')?.getAttribute("aria-label"),
    ).toBeTruthy();
    expect(container.textContent).toBeTruthy();
    expect(container.querySelectorAll("[data-gallery-entry-id]")).toHaveLength(
      4,
    );
    const captions = container.querySelectorAll<HTMLElement>(
      '[data-gallery-caption="text"]',
    );
    expect(captions).toHaveLength(4);
    captions.forEach((caption) =>
      expect(caption.textContent?.trim()).not.toBe(""),
    );

    act(() =>
      container
        .querySelector<HTMLElement>(
          `[data-testid="battle-card-picker-candidate-${candidates[0].instanceId}"]`,
        )
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLElement>(
          `[data-testid="battle-card-picker-candidate-${candidates[2].instanceId}"]`,
        )
        ?.click(),
    );
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="battle-card-picker-submit"]',
        )
        ?.click(),
    );
    expect(onCardPickerSubmit).toHaveBeenCalledWith([
      candidates[0].instanceId,
      candidates[2].instanceId,
    ]);

    act(() => root.unmount());
  });

  it("keeps a mobile gallery prompt above the inspector takeover", () => {
    mockDesktopViewport(false);
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    const view = makeView();
    const candidate = makePickerCandidate(
      view.player.voidCards[0],
      "player",
      "void",
    );
    const { container, root } = mount({
      ...view,
      cardPicker: {
        key: 42,
        label: assertLocalized("Choose an option"),
        side: "player",
        candidates: [candidate],
        candidateIds: [candidate.instanceId],
        count: 1,
        optional: false,
        canResolve: true,
        presentation: "gallery",
      },
    });

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="battle-inspector-trigger"]',
        )
        ?.click();
    });

    expect(
      container.querySelector("[data-battle-card-picker-gallery]"),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-battle-inspector="takeover"]'),
    ).toBeNull();

    act(() => root.unmount());
  });

  it("distinguishes a highlighted just-drawn candidate from its selected state", () => {
    const view = makeView();
    const highlighted = view.playerHand[0];
    const { container, root } = mount({
      ...view,
      cardPicker: {
        key: 42,
        label: assertLocalized("Choose an option"),
        side: "player",
        candidates: [makePickerCandidate(highlighted, "player", "hand", true)],
        candidateIds: [highlighted.id],
        count: 1,
        optional: false,
        canResolve: true,
        presentation: "board",
      },
    });

    const candidate = container.querySelector<HTMLElement>(
      '[data-battle-card-picker-highlighted="true"]',
    );
    expect(candidate).not.toBeNull();
    expect(
      candidate?.querySelector<HTMLElement>(".card-view")?.style.boxShadow,
    ).toContain(resolveColor("accent-bright"));
    expect(
      candidate?.querySelector<HTMLElement>(".card-view")?.style.boxShadow,
    ).not.toContain(resolveColor("selected"));

    act(() => {
      candidate?.querySelector<HTMLElement>("[data-battlefield-card]")?.click();
    });

    expect(
      candidate?.querySelector<HTMLElement>(".card-view")?.style.boxShadow,
    ).toContain(resolveColor("selected"));
    expect(
      candidate?.querySelector<HTMLElement>(".card-view")?.style.boxShadow,
    ).not.toContain(resolveColor("accent-bright"));

    act(() => root.unmount());
  });

  it("offers Continue when an authoritative required picker has no candidates", () => {
    const view = makeView();
    const onCardPickerSubmit = vi.fn();
    const { container, root } = mount(
      {
        ...view,
        cardPicker: {
          key: 42,
          label: assertLocalized("Choose an option"),
          side: "player",
          candidates: [],
          candidateIds: [],
          count: 1,
          optional: false,
          canResolve: true,
          presentation: "board",
        },
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
        onCardPickerSubmit,
      },
    );

    const submit = container.querySelector<HTMLButtonElement>(
      '[data-testid="battle-card-picker-submit"]',
    );
    expect(submit?.textContent).toContain("Continue");
    expect(submit?.getAttribute("aria-disabled")).toBeNull();
    act(() => submit?.click());
    expect(onCardPickerSubmit).toHaveBeenCalledWith([]);

    act(() => root.unmount());
  });

  it("centers opening mobile ranks on one shared responsive card scale", () => {
    const view = makeView();
    const expandedBackRank = Array.from({ length: 6 }, (_, index) => ({
      id: parseBattleSlotViewId(`expanded-back-${String(index)}`),
      card:
        index < 5
          ? makeCard(
              60 + index,
              parseBattleCardId(`expanded-back-card-${String(index)}`),
            )
          : null,
    }));
    const expandedFrontRank = Array.from({ length: 5 }, (_, index) => ({
      id: parseBattleSlotViewId(`expanded-front-${String(index)}`),
      card:
        index < 4
          ? makeCard(
              70 + index,
              parseBattleCardId(`expanded-front-card-${String(index)}`),
            )
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
          "88cqw - 5 * var(--space-xs)",
        );
        expect(rankElement?.style.height).toContain("100cqh");
        expect(track?.style.gridTemplateColumns).toContain(
          rank === "back" ? "repeat(6," : "repeat(5,",
        );
        expect(track?.style.width).toContain(
          rank === "back" ? "6 * min(" : "5 * min(",
        );
        expect(track?.style.columnGap).toBe("var(--space-xs)");
        expect(slots[0]?.style.width).toContain("var(--space-xs)");
        expect(slots[0]?.style.width).toContain("100cqh");
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
    expect(enemyFront?.style.bottom).toBe("var(--space-m)");
    expect(playerFront?.style.top).toBe("var(--space-m)");
    expect(enemyBack?.style.bottom).toContain("var(--space-xs)");
    expect(playerBack?.style.top).toContain("var(--space-xs)");

    act(() => root.unmount());
  });

  it("expands one shared staggered pair when a mobile formation fills its visible ranks", () => {
    const view = makeView();
    const playerBackRank = Array.from({ length: 10 }, (_, index) => ({
      id: parseBattleSlotViewId(`B${String(index)}`),
      card:
        index < 6
          ? makeCard(
              80 + index,
              parseBattleCardId(`player-expanded-back-card-${String(index)}`),
            )
          : null,
    }));
    const playerFrontRank = Array.from({ length: 9 }, (_, index) => ({
      id: parseBattleSlotViewId(`F${String(index)}`),
      card:
        index < 5
          ? makeCard(
              90 + index,
              parseBattleCardId(`player-expanded-front-card-${String(index)}`),
            )
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

    expect(trackColumns("enemy", "back")).toContain("repeat(7,");
    expect(trackColumns("enemy", "front")).toContain("repeat(6,");
    expect(trackColumns("player", "back")).toContain("repeat(7,");
    expect(trackColumns("player", "front")).toContain("repeat(6,");
    expect(
      container.querySelector(
        '[data-battle-rank="player-back"] [data-battle-slot-id="B6"][data-battle-slot-filled="false"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector(
        '[data-battle-rank="player-front"] [data-battle-slot-id="F5"][data-battle-slot-filled="false"]',
      ),
    ).not.toBeNull();

    act(() => root.unmount());
  });

  it("reclaims mobile insets and spacing above eight back-rank columns", () => {
    const view = makeView();
    const denseBackRank = Array.from({ length: 10 }, (_, index) => ({
      id: parseBattleSlotViewId(`B${String(index)}`),
      card:
        index < 9
          ? makeCard(100 + index, parseBattleCardId(`dense-back-${String(index)}`))
          : null,
    }));
    const denseFrontRank = Array.from({ length: 9 }, (_, index) => ({
      id: parseBattleSlotViewId(`F${String(index)}`),
      card:
        index < 8
          ? makeCard(
              120 + index,
              parseBattleCardId(`dense-front-${String(index)}`),
            )
          : null,
    }));
    const { container, root } = mount({
      ...view,
      player: {
        ...view.player,
        backRank: denseBackRank,
        frontRank: denseFrontRank,
      },
    });
    const rank = container.querySelector<HTMLElement>(
      '[data-battle-rank="player-back"]',
    );
    const track = rank?.querySelector<HTMLElement>("[data-battle-rank-track]");

    expect(rank?.style.left).toBe("3%");
    expect(rank?.style.right).toBe("3%");
    expect(track?.style.columnGap).toBe("var(--space-xxs)");
    expect(rank?.style.height).toContain("94cqw - 9 * var(--space-xxs)");

    act(() => root.unmount());
  });

  it("fills the mobile viewport with ten square back-rank slots and caps both ranks", () => {
    const view = makeView();
    const overflowingBackRank = Array.from({ length: 12 }, (_, index) => ({
      id: parseBattleSlotViewId(`B${String(index)}`),
      card: makeCard(
        160 + index,
        parseBattleCardId(`overflow-back-${String(index)}`),
      ),
    }));
    const overflowingFrontRank = Array.from({ length: 11 }, (_, index) => ({
      id: parseBattleSlotViewId(`F${String(index)}`),
      card: makeCard(
        180 + index,
        parseBattleCardId(`overflow-front-${String(index)}`),
      ),
    }));
    const { container, root } = mount({
      ...view,
      player: {
        ...view.player,
        backRank: overflowingBackRank,
        frontRank: overflowingFrontRank,
      },
    });
    const backRank = container.querySelector<HTMLElement>(
      '[data-battle-rank="player-back"]',
    );
    const enemyBackRank = container.querySelector<HTMLElement>(
      '[data-battle-rank="enemy-back"]',
    );
    const backTrack = backRank?.querySelector<HTMLElement>(
      "[data-battle-rank-track]",
    );
    const frontTrack = container.querySelector<HTMLElement>(
      '[data-battle-rank="player-front"] [data-battle-rank-track]',
    );
    const backSlots = backTrack?.querySelectorAll("[data-battle-slot-id]");
    const frontSlots = frontTrack?.querySelectorAll("[data-battle-slot-id]");

    expect(backSlots).toHaveLength(10);
    expect(frontSlots).toHaveLength(9);
    expect(backRank?.style.left).toBe("1%");
    expect(backRank?.style.right).toBe("1%");
    expect(backTrack?.style.columnGap).toBe("0px");
    expect(backRank?.style.height).toBe(
      "min(22cqw, calc((98cqw - 0 * var(--space-xxs)) / 10), calc((100cqh - var(--space-m) - var(--space-m)) / 2))",
    );
    expect(backRank?.style.top).toContain("+ 0px + var(--space-m)");
    expect(enemyBackRank?.style.bottom).toContain("+ 0px + var(--space-m)");
    expect(backTrack?.style.width).toBe("98cqw");

    act(() => root.unmount());
  });

  it("centers the smaller formation when one desktop side fills the opening window", () => {
    mockDesktopViewport(true);
    const view = makeView();
    const playerBackRank = Array.from({ length: 10 }, (_, index) => ({
      id: parseBattleSlotViewId(`B${String(index)}`),
      card: makeCard(
        100 + index,
        parseBattleCardId(`player-full-back-${String(index)}`),
      ),
    }));
    const playerFrontRank = Array.from({ length: 9 }, (_, index) => ({
      id: parseBattleSlotViewId(`F${String(index)}`),
      card: makeCard(
        120 + index,
        parseBattleCardId(`player-full-front-${String(index)}`),
      ),
    }));
    const enemyBackRank = Array.from({ length: 5 }, (_, index) => ({
      id: parseBattleSlotViewId(`B${String(index)}`),
      card: makeCard(
        140 + index,
        parseBattleCardId(`enemy-small-back-${String(index)}`),
      ),
    }));
    const enemyFrontRank = Array.from({ length: 4 }, (_, index) => ({
      id: parseBattleSlotViewId(`F${String(index)}`),
      card: makeCard(
        150 + index,
        parseBattleCardId(`enemy-small-front-${String(index)}`),
      ),
    }));
    const { container, root } = mount({
      ...view,
      enemy: {
        ...view.enemy,
        backRank: enemyBackRank,
        frontRank: enemyFrontRank,
      },
      player: {
        ...view.player,
        backRank: playerBackRank,
        frontRank: playerFrontRank,
      },
    });

    const track = (owner: "enemy" | "player", rank: "back" | "front") =>
      container.querySelector<HTMLElement>(
        `[data-battle-rank="${owner}-${rank}"] [data-battle-rank-track]`,
      );
    expect(track("player", "back")?.style.gridTemplateColumns).toContain(
      "repeat(10,",
    );
    expect(track("player", "front")?.style.gridTemplateColumns).toContain(
      "repeat(9,",
    );
    expect(track("enemy", "back")?.style.gridTemplateColumns).toContain(
      "repeat(5,",
    );
    expect(track("enemy", "front")?.style.gridTemplateColumns).toContain(
      "repeat(4,",
    );
    expect(
      container.querySelectorAll(
        '[data-battle-rank="enemy-back"] [data-battle-slot-id]',
      ),
    ).toHaveLength(5);

    act(() => root.unmount());
  });

  it("caps the generic face-down enemy fan and keeps every face-up player hand card", () => {
    const view = makeView();
    const { container, root } = mount(view);
    const enemyHand = container.querySelector<HTMLElement>(
      '[data-battle-mobile-row="far-hand"]',
    );
    const playerHand = container.querySelector<HTMLElement>(
      '[data-battle-mobile-row="near-hand"]',
    );
    const enemyCards = enemyHand?.querySelectorAll<HTMLElement>(
      '[data-battle-card-zone="far-hand"]',
    );
    const playerCards = playerHand?.querySelectorAll<HTMLElement>(
      '[data-battle-card-zone="near-hand"]',
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
    ).toEqual(Array.from({ length: 6 }, () => "Opponent card"));
    expect(playerHand?.dataset.battleHandCount).toBe("4");
    expect(playerCards).toHaveLength(view.playerHand.length);
    expect(playerCards?.[0]?.parentElement?.style.top).toBe(
      "calc(var(--space-6xl) - var(--space-xl) + var(--space-xs))",
    );
    expect(playerCards?.[0]?.parentElement?.style.bottom).toBe("");

    const rulesRevealedCard = view.enemyHand[7];
    if (rulesRevealedCard === undefined)
      throw new Error("fixture missing revealed far-hand card");
    const revealedView: MobileBattleView = {
      ...view,
      farHand: { ...view.farHand, cards: [rulesRevealedCard] },
    };
    act(() => root.unmount());
    const revealed = mount(revealedView);
    expect(
      revealed.container
        .querySelector('[data-battle-mobile-row="far-hand"]')
        ?.querySelectorAll(':scope > [data-battle-card-zone="far-hand"]'),
    ).toHaveLength(7);
    expect(
      revealed.container
        .querySelector(
          `[data-battle-mobile-row="far-hand"] [data-battle-card-id="${rulesRevealedCard.id}"]`,
        )
        ?.getAttribute("data-battle-card-face"),
    ).toBe("up");

    act(() => revealed.root.unmount());
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
    const buttons =
      phaseControls?.querySelectorAll<HTMLButtonElement>("button");
    const previous = buttons?.[0];
    const next = buttons?.[1];

    expect(controlRow?.style.gridRow).toBe("5");
    expect(controlRow?.style.display).toBe("flex");
    expect(controlRow?.style.justifyContent).toBe("flex-end");
    expect(controlRow?.style.paddingInline).toBe("var(--space-s)");
    expect(controlRow?.style.paddingTop).toBe("var(--space-s)");
    expect(controlRow?.style.boxSizing).toBe("border-box");
    expect(controlRow?.style.zIndex).toBe("10");
    expect(phaseControls?.style.display).toBe("flex");
    expect(phaseControls?.style.gap).toBe("var(--space-s)");
    expect(backSlot?.style.position).toBe("");
    expect(nextSlot?.style.width).toBe("max-content");
    expect(nextSlot?.style.minWidth).toBe("120px");
    expect(buttons).toHaveLength(2);
    expect(previous?.getAttribute("aria-label")?.trim()).not.toBe("");
    expect(previous?.querySelector(".bx-arrow-left")).not.toBeNull();
    expect(previous?.textContent).toBe("");
    expect(next?.textContent?.trim()).not.toBe("");
    expect(previous?.dataset.glassPlacement).toBe("onMedia");
    expect(next?.dataset.glassPlacement).toBe("onMedia");
    expect(next?.dataset.glassVariant).toBe("accent");

    act(() => {
      previous?.click();
      next?.click();
    });

    expect(interactions.onPreviousPhase).toHaveBeenCalledTimes(1);
    expect(interactions.onNextPhase).toHaveBeenCalledTimes(1);
    expect(
      container.querySelector(
        "[data-journey-status-bar], [data-journey-menu], [data-debug-rail]",
      ),
    ).toBeNull();
    expect(container.querySelector("[data-connected-count]")).toBeNull();

    act(() => root.unmount());
  });

  it("labels the phase advance Continue while a Dreamwell card is visible", () => {
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
    const cardId = testDreamwellCardId("3a4293da-55a1-4094-898a-df402ffa1c92");
    const view: MobileBattleView = {
      ...makeView(),
      dreamwell: {
        side: "player",
        model: {
          cardId,
          displaySnapshot: {
            id: cardId,
            name: assertLocalized("Fixture Beacon"),
            renderedText: assertLocalized("Draw a card."),
            energyAdded: 2,
            imageNumber: 42,
          },
        },
      },
    };
    const { container, root } = mount(view, interactions);
    const next = container.querySelector<HTMLButtonElement>(
      "[data-battle-phase-next] button",
    );

    expect(next?.textContent?.trim()).not.toBe("");
    act(() => next?.click());
    expect(interactions.onNextPhase).toHaveBeenCalledOnce();

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
        description: assertLocalized("Play a fixture card to B2."),
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
    expect(nextSlot?.style.gap).toBe("var(--space-s)");
    expect(phaseControls?.style.gap).toBe("var(--space-s)");
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
        description: assertLocalized("Pass from Day to Dusk."),
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
    const onFillAsymmetricBattlefieldPreview = vi.fn();
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
      onFillAsymmetricBattlefieldPreview,
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
      container.querySelector('[data-testid="battle-debug-fill-asymmetric"]')
        ?.textContent,
    ).toContain("Fill 19 vs 9 + Voids");
    expect(
      container.querySelector(
        '[data-testid="battle-debug-challenger-chevron-tweaks"]',
      ),
    ).toBeNull();

    act(() => fill?.click());

    expect(onFillBattlefieldPreview).toHaveBeenCalledTimes(1);
    expect(onFillAsymmetricBattlefieldPreview).not.toHaveBeenCalled();
    expect(trigger?.getAttribute("aria-expanded")).toBe("false");
    expect(
      container.querySelector('[data-testid="battle-debug-fill-grid"]'),
    ).toBeNull();

    act(() => root.unmount());
  });

  it("requests the asymmetric stress layout from the debug menu", () => {
    const onFillAsymmetricBattlefieldPreview = vi.fn();
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
      onFillAsymmetricBattlefieldPreview,
    };
    const { container, root } = mount(makeView(), interactions);

    act(() => {
      container
        .querySelector<HTMLButtonElement>(
          '[data-testid="battle-debug-menu-trigger"]',
        )
        ?.click();
    });

    const fillAsymmetric = container.querySelector<HTMLButtonElement>(
      '[data-testid="battle-debug-fill-asymmetric"]',
    );
    expect(fillAsymmetric?.textContent).toContain("Fill 19 vs 9 + Voids");

    act(() => fillAsymmetric?.click());

    expect(onFillAsymmetricBattlefieldPreview).toHaveBeenCalledTimes(1);
    expect(interactions.onFillBattlefieldPreview).not.toHaveBeenCalled();
    expect(
      container.querySelector('[data-testid="battle-debug-fill-asymmetric"]'),
    ).toBeNull();

    act(() => root.unmount());
  });

  it("routes a hand-card drop anywhere on the table through the semantic play intent", () => {
    const interactions = {
      canInteract: true,
      pendingCardId: parseBattleCardId("player-hand-0"),
      pendingCardSource: "near-hand" as const,
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
      '[data-battle-mobile-row="near-hand"]',
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
      pendingCardId: parseBattleCardId("player-hand-0"),
      pendingCardSource: "near-hand" as const,
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
    vi.spyOn(rightSlot as HTMLElement, "getBoundingClientRect").mockReturnValue(
      {
        x: 250,
        y: 200,
        left: 250,
        top: 200,
        right: 350,
        bottom: 340,
        width: 100,
        height: 140,
        toJSON: () => ({}),
      },
    );

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
      pendingCardId: parseBattleCardId("player-front-card"),
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
      enemySlot?.dispatchEvent(
        new Event("drop", { bubbles: true, cancelable: true }),
      );
      playerSlot?.dispatchEvent(
        new Event("drop", { bubbles: true, cancelable: true }),
      );
    });
    expect(interactions.onSlotDrop).toHaveBeenCalledTimes(1);
    expect(interactions.onSlotDrop).toHaveBeenCalledWith({
      owner: "player",
      rank: "back",
      slotId: "player-back-empty",
    });

    act(() => root.unmount());
  });

  it("animates an occupied twin as a merge target and plays a merge effect on release", () => {
    const view = makeView();
    const sourceCard = view.player.frontRank[0]?.card;
    const destinationCard = view.player.backRank[1]?.card;
    if (
      sourceCard === null ||
      sourceCard === undefined ||
      destinationCard === null ||
      destinationCard === undefined
    ) {
      throw new Error("fixture requires occupied player ranks");
    }
    const onFigmentMerge = vi.fn();
    const interactions: MobileBattleInteractions = {
      canInteract: true,
      pendingCardId: sourceCard.id,
      pendingCardSource: "battlefield",
      pendingCardOwner: "player",
      figmentMergeTargets: [
        {
          sourceBattleCardId: sourceCard.id,
          destinationBattleCardId: destinationCard.id,
          target: {
            owner: "player",
            rank: "back",
            slotId: parseBattleSlotViewId("player-back-filled"),
          },
          figmentLabel: assertLocalized("Shadow"),
          status: "eligible",
          addedSpark: 2,
          requiresConfirmation: false,
        },
      ],
      onHandCardActivate: vi.fn(),
      onCardDragStart: vi.fn(),
      onCardDragEnd: vi.fn(),
      onSlotDrop: vi.fn(),
      onFigmentMerge,
      onZoneDrop: vi.fn(),
      onPreviousPhase: vi.fn(),
      onNextPhase: vi.fn(),
    };
    const { container, root } = mount(view, interactions);
    const target = container.querySelector<HTMLElement>(
      '[data-battle-rank="player-back"] [data-battle-slot-id="player-back-filled"]',
    );

    act(() => {
      target?.dispatchEvent(
        new MouseEvent("dragover", { bubbles: true, cancelable: true }),
      );
    });

    expect(target?.dataset.battleFigmentMergeTarget).toBe("hovered");
    const mergeIndicator = container.querySelector(
      '[data-radial-announcement-variant="merge-target"]',
    );
    expect(mergeIndicator?.textContent).toContain("2");
    expect(mergeIndicator?.textContent).not.toContain("✦");
    expect(mergeIndicator?.querySelector(".bx-sparkle")).not.toBeNull();

    act(() => {
      target?.dispatchEvent(
        new MouseEvent("drop", { bubbles: true, cancelable: true }),
      );
    });

    expect(onFigmentMerge).toHaveBeenCalledWith(sourceCard.id, {
      owner: "player",
      rank: "back",
      slotId: "player-back-filled",
    });
    expect(
      document.querySelector("[data-battle-figment-merge-animation]"),
    ).not.toBeNull();
    expect(interactions.onSlotDrop).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  it("explains an exhaustion-mismatched merge instead of swapping", () => {
    const view = makeView();
    const sourceCard = view.player.frontRank[0]?.card;
    const destinationCard = view.player.backRank[1]?.card;
    if (
      sourceCard === null ||
      sourceCard === undefined ||
      destinationCard === null ||
      destinationCard === undefined
    ) {
      throw new Error("fixture requires occupied player ranks");
    }
    const interactions: MobileBattleInteractions = {
      canInteract: true,
      pendingCardId: sourceCard.id,
      pendingCardSource: "battlefield",
      pendingCardOwner: "player",
      figmentMergeTargets: [
        {
          sourceBattleCardId: sourceCard.id,
          destinationBattleCardId: destinationCard.id,
          target: {
            owner: "player",
            rank: "back",
            slotId: parseBattleSlotViewId("player-back-filled"),
          },
          figmentLabel: assertLocalized("Shadow"),
          status: "blocked-exhaustion",
          addedSpark: 0,
          requiresConfirmation: false,
        },
      ],
      onHandCardActivate: vi.fn(),
      onCardDragStart: vi.fn(),
      onCardDragEnd: vi.fn(),
      onSlotDrop: vi.fn(),
      onFigmentMerge: vi.fn(),
      onZoneDrop: vi.fn(),
      onPreviousPhase: vi.fn(),
      onNextPhase: vi.fn(),
    };
    const { container, root } = mount(view, interactions);
    const target = container.querySelector<HTMLElement>(
      '[data-battle-rank="player-back"] [data-battle-slot-id="player-back-filled"]',
    );

    act(() => {
      target?.dispatchEvent(
        new MouseEvent("drop", { bubbles: true, cancelable: true }),
      );
    });

    expect(
      document
        .querySelector("[data-transient-status-toast]")
        ?.textContent?.trim(),
    ).not.toBe("");
    expect(interactions.onFigmentMerge).not.toHaveBeenCalled();
    expect(interactions.onSlotDrop).not.toHaveBeenCalled();

    act(() => root.unmount());
  });

  it("confirms the Legionnaire base-spark consequence before merging", () => {
    const view = makeView();
    const sourceCard = view.player.frontRank[0]?.card;
    const destinationCard = view.player.backRank[1]?.card;
    if (
      sourceCard === null ||
      sourceCard === undefined ||
      destinationCard === null ||
      destinationCard === undefined
    ) {
      throw new Error("fixture requires occupied player ranks");
    }
    const onFigmentMerge = vi.fn();
    const interactions: MobileBattleInteractions = {
      canInteract: true,
      pendingCardId: sourceCard.id,
      pendingCardSource: "battlefield",
      pendingCardOwner: "player",
      figmentMergeTargets: [
        {
          sourceBattleCardId: sourceCard.id,
          destinationBattleCardId: destinationCard.id,
          target: {
            owner: "player",
            rank: "back",
            slotId: parseBattleSlotViewId("player-back-filled"),
          },
          figmentLabel: assertLocalized("Legionnaire"),
          status: "eligible",
          addedSpark: 1,
          requiresConfirmation: true,
        },
      ],
      onHandCardActivate: vi.fn(),
      onCardDragStart: vi.fn(),
      onCardDragEnd: vi.fn(),
      onSlotDrop: vi.fn(),
      onFigmentMerge,
      onZoneDrop: vi.fn(),
      onPreviousPhase: vi.fn(),
      onNextPhase: vi.fn(),
    };
    const { container, root } = mount(view, interactions);
    const target = container.querySelector<HTMLElement>(
      '[data-battle-rank="player-back"] [data-battle-slot-id="player-back-filled"]',
    );

    act(() => {
      target?.dispatchEvent(
        new MouseEvent("drop", { bubbles: true, cancelable: true }),
      );
    });

    const mergeConfirmationDialog = document.querySelector(
      "[data-battle-figment-merge-confirmation]",
    );
    expect(mergeConfirmationDialog?.textContent).toContain("1");
    expect(mergeConfirmationDialog?.textContent).not.toContain("✦");
    expect(
      mergeConfirmationDialog?.querySelector(".bx-sparkle"),
    ).not.toBeNull();
    expect(onFigmentMerge).not.toHaveBeenCalled();

    act(() => {
      document
        .querySelector<HTMLButtonElement>(
          '[data-testid="battle-figment-merge-confirm"]',
        )
        ?.click();
    });

    expect(onFigmentMerge).toHaveBeenCalledTimes(1);
    expect(
      document.querySelector("[data-battle-figment-merge-confirmation]"),
    ).toBeNull();

    act(() => root.unmount());
  });

  it("rejects the physical cell under a card instead of retargeting to an eligible cell", () => {
    const cardUuid = testCardId("5a980eff-6ec7-44d8-9977-b98e66bbc2c8");
    const baseView = makeView();
    const baseSourceCard = baseView.player.backRank[1]?.card;
    if (baseSourceCard === null || baseSourceCard === undefined) {
      throw new Error("fixture requires a player back-rank character");
    }
    const sourceCard: MobileBattleCardView = {
      ...baseSourceCard,
      id: parseBattleCardId("bc_0018"),
      model: {
        ...baseSourceCard.model,
        cardId: cardUuid,
        displaySnapshot: {
          ...baseSourceCard.model.displaySnapshot,
          id: cardUuid,
        },
      },
    };
    const player = {
      ...baseView.player,
      backRank: baseView.player.backRank.map((slot, index) =>
        index === 1 ? { ...slot, card: sourceCard } : slot,
      ),
    };
    const view = { ...baseView, player, near: player };
    const interactions: MobileBattleInteractions = {
      canInteract: true,
      pendingCardId: sourceCard.id,
      pendingCardSource: "battlefield",
      pendingCardOwner: "player",
      eligibleSlotTargets: [
        {
          owner: "player",
          rank: "back",
          slotId: parseBattleSlotViewId("player-back-empty"),
        },
      ],
      onHandCardActivate: vi.fn(),
      onCardDragStart: vi.fn(),
      onCardDragEnd: vi.fn(),
      onSlotDrop: vi.fn(),
      onBattlefieldDropRejected: vi.fn(),
      onBattlefieldDropResolved: vi.fn(),
      onZoneDrop: vi.fn(),
      onPreviousPhase: vi.fn(),
      onNextPhase: vi.fn(),
    };
    const { container, root } = mount(view, interactions);
    const screen = container.querySelector<HTMLElement>("[data-battle-mobile]");
    const battlefieldCard = container.querySelector<HTMLElement>(
      `[data-battle-card-id="${sourceCard.id}"]`,
    );
    const revealSource = battlefieldCard?.querySelector<HTMLElement>(
      "[data-game-card-source]",
    );
    const playArea = battlefieldCard?.closest<HTMLElement>(
      "[data-battle-play-area]",
    );
    const leftSlot = container.querySelector<HTMLElement>(
      '[data-battle-slot-id="player-back-empty"]',
    );
    const rightSlot = container.querySelector<HTMLElement>(
      '[data-battle-slot-id="player-back-second-empty"]',
    );
    vi.spyOn(playArea as HTMLElement, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 800,
      bottom: 400,
      width: 800,
      height: 400,
      toJSON: () => ({}),
    });
    vi.spyOn(
      battlefieldCard as HTMLElement,
      "getBoundingClientRect",
    ).mockReturnValue({
      x: 160,
      y: 200,
      left: 160,
      top: 200,
      right: 240,
      bottom: 312,
      width: 80,
      height: 112,
      toJSON: () => ({}),
    });
    vi.spyOn(leftSlot as HTMLElement, "getBoundingClientRect").mockReturnValue({
      x: 40,
      y: 200,
      left: 40,
      top: 200,
      right: 120,
      bottom: 312,
      width: 80,
      height: 112,
      toJSON: () => ({}),
    });
    vi.spyOn(rightSlot as HTMLElement, "getBoundingClientRect").mockReturnValue(
      {
        x: 280,
        y: 200,
        left: 280,
        top: 200,
        right: 360,
        bottom: 312,
        width: 80,
        height: 112,
        toJSON: () => ({}),
      },
    );
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => screen),
    });

    act(() => {
      revealSource?.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 200,
          clientY: 256,
          pointerId: 31,
          pointerType: "mouse",
        }),
      );
      battlefieldCard?.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 320,
          clientY: 256,
          pointerId: 31,
          pointerType: "mouse",
        }),
      );
      battlefieldCard?.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 320,
          clientY: 256,
          pointerId: 31,
          pointerType: "mouse",
        }),
      );
    });

    expect(interactions.onSlotDrop).not.toHaveBeenCalled();
    expect(interactions.onBattlefieldDropRejected).toHaveBeenCalledWith({
      reason: "ineligible-slot",
      clientX: 320,
      clientY: 256,
    });
    expect(interactions.onBattlefieldDropResolved).toHaveBeenCalledWith(
      expect.objectContaining({
        releasePoint: { clientX: 320, clientY: 256 },
        placementPoint: { clientX: 320, clientY: 256 },
        chosenTarget: {
          owner: "player",
          rank: "back",
          slotId: "player-back-second-empty",
        },
        strategy: "direct-hit",
      }),
    );
    expect(interactions.onCardDragEnd).toHaveBeenCalledOnce();

    act(() => root.unmount());
  });

  it("keeps a long horizontal tutorial drag on the visible destination cell", () => {
    mockDesktopViewport(true);
    const definitionUuid = testCardId("e83014d3-9d35-4e80-a1b3-9b25360ad2af");
    const baseView = makeView();
    const baseSourceCard = baseView.player.frontRank[0]?.card;
    if (baseSourceCard === null || baseSourceCard === undefined) {
      throw new Error("fixture requires a player front-rank character");
    }
    const sourceCard: MobileBattleCardView = {
      ...baseSourceCard,
      id: parseBattleCardId("bc_0007"),
      exhausted: false,
      model: {
        ...baseSourceCard.model,
        cardId: definitionUuid,
        displaySnapshot: {
          ...baseSourceCard.model.displaySnapshot,
          id: definitionUuid,
        },
      },
    };
    const player: MobileBattleSideView = {
      ...baseView.player,
      frontRank: [
        { id: parseBattleSlotViewId("F0"), card: null },
        { id: parseBattleSlotViewId("F1"), card: null },
        { id: parseBattleSlotViewId("F2"), card: sourceCard },
        { id: parseBattleSlotViewId("F3"), card: null },
      ],
      backRank: Array.from({ length: 5 }, (_unused, index) => ({
        id: parseBattleSlotViewId(`B${String(index)}`),
        card: null,
      })),
    };
    const view: MobileBattleView = {
      ...baseView,
      player,
      near: player,
    };
    const onBattlefieldDropResolved =
      vi.fn<(resolution: MobileBattleDropResolution) => void>();
    const interactions: MobileBattleInteractions = {
      canInteract: true,
      nearSide: "player",
      pendingCardId: sourceCard.id,
      pendingCardSource: "battlefield",
      pendingCardOwner: "player",
      eligibleSlotRanks: ["back", "front"],
      sourceSlotTarget: {
        owner: "player",
        rank: "front",
        slotId: parseBattleSlotViewId("F2"),
      },
      onHandCardActivate: vi.fn(),
      onCardDragStart: vi.fn(),
      onCardDragEnd: vi.fn(),
      onSlotDrop: vi.fn(),
      onBattlefieldDropRejected: vi.fn(),
      onBattlefieldDropResolved,
      onZoneDrop: vi.fn(),
      onPreviousPhase: vi.fn(),
      onNextPhase: vi.fn(),
    };
    const { container, root } = mount(view, interactions);
    const battlefieldCard = container.querySelector<HTMLElement>(
      `[data-battle-card-id="${sourceCard.id}"]`,
    );
    const revealSource = battlefieldCard?.querySelector<HTMLElement>(
      "[data-game-card-source]",
    );
    const playArea = battlefieldCard?.closest<HTMLElement>(
      "[data-battle-play-area]",
    );
    const intendedSlot = container.querySelector<HTMLElement>(
      '[data-battle-rank="player-front"] [data-battle-slot-id="F6"]',
    );
    vi.spyOn(playArea as HTMLElement, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 300,
      left: 0,
      top: 300,
      right: 1728,
      bottom: 700,
      width: 1728,
      height: 400,
      toJSON: () => ({}),
    });
    vi.spyOn(
      battlefieldCard as HTMLElement,
      "getBoundingClientRect",
    ).mockReturnValue({
      x: 599.28125,
      y: 387.96875,
      left: 599.28125,
      top: 387.96875,
      right: 701.96875,
      bottom: 490.65625,
      width: 102.6875,
      height: 102.6875,
      toJSON: () => ({}),
    });
    container
      .querySelectorAll<HTMLElement>(
        '[data-battle-mobile-drop-kind="slot"][data-battle-mobile-drop-owner="player"]',
      )
      .forEach((slot) => {
        const rank = slot.dataset.battleMobileDropRank;
        const slotId = slot.dataset.battleMobileDropSlotId;
        const index = Number.parseInt(slotId?.slice(1) ?? "", 10);
        const centerX =
          rank === "front"
            ? 437.25 + index * 106.6875
            : 383.90625 + index * 106.6875;
        const centerY = rank === "front" ? 439.3125 : 546;
        vi.spyOn(slot, "getBoundingClientRect").mockReturnValue({
          x: centerX - 51.34375,
          y: centerY - 51.34375,
          left: centerX - 51.34375,
          top: centerY - 51.34375,
          right: centerX + 51.34375,
          bottom: centerY + 51.34375,
          width: 102.6875,
          height: 102.6875,
          toJSON: () => ({}),
        });
      });
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => intendedSlot),
    });

    act(() => {
      revealSource?.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 650.625,
          clientY: 439.3125,
          pointerId: 43,
          pointerType: "mouse",
        }),
      );
      battlefieldCard?.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 1077.375,
          clientY: 439.3125,
          pointerId: 43,
          pointerType: "mouse",
        }),
      );
      battlefieldCard?.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 1077.375,
          clientY: 439.3125,
          pointerId: 43,
          pointerType: "mouse",
        }),
      );
    });

    expect(interactions.onSlotDrop).toHaveBeenCalledWith({
      owner: "player",
      rank: "front",
      slotId: "F6",
    });
    expect(interactions.onBattlefieldDropRejected).not.toHaveBeenCalled();
    expect(onBattlefieldDropResolved).toHaveBeenCalledOnce();
    const resolution = onBattlefieldDropResolved.mock.calls[0]?.[0];
    expect(resolution).toMatchObject({
      releasePoint: { clientX: 1077.375, clientY: 439.3125 },
      chosenTarget: {
        owner: "player",
        rank: "front",
        slotId: "F6",
      },
      strategy: "direct-hit",
    });
    expect(
      resolution?.candidates.find(
        (candidate) => candidate.target.slotId === "F6",
      ),
    ).toMatchObject({
      distanceSquared: 0,
      containsRelease: true,
    });
    expect(
      resolution?.candidates.find(
        (candidate) => candidate.target.slotId === "B4",
      ),
    ).toMatchObject({
      containsRelease: false,
    });
    expect(interactions.onCardDragEnd).toHaveBeenCalledOnce();

    act(() => root.unmount());
  });

  it("reports a completed battlefield drag when there is no legal cell", () => {
    const interactions: MobileBattleInteractions = {
      canInteract: true,
      pendingCardId: parseBattleCardId("player-front-card"),
      pendingCardSource: "battlefield",
      pendingCardOwner: "player",
      eligibleSlotTargets: [],
      onHandCardActivate: vi.fn(),
      onCardDragStart: vi.fn(),
      onCardDragEnd: vi.fn(),
      onSlotDrop: vi.fn(),
      onBattlefieldDropRejected: vi.fn(),
      onZoneDrop: vi.fn(),
      onPreviousPhase: vi.fn(),
      onNextPhase: vi.fn(),
    };
    const { container, root } = mount(makeView(), interactions);
    const screen = container.querySelector<HTMLElement>("[data-battle-mobile]");
    const battlefieldCard = container.querySelector<HTMLElement>(
      '[data-battle-card-id="player-front-card"]',
    );
    const revealSource = battlefieldCard?.querySelector<HTMLElement>(
      "[data-game-card-source]",
    );
    const playArea = battlefieldCard?.closest<HTMLElement>(
      "[data-battle-play-area]",
    );
    vi.spyOn(playArea as HTMLElement, "getBoundingClientRect").mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 800,
      bottom: 500,
      width: 800,
      height: 500,
      toJSON: () => ({}),
    });
    vi.spyOn(
      battlefieldCard as HTMLElement,
      "getBoundingClientRect",
    ).mockReturnValue({
      x: 160,
      y: 200,
      left: 160,
      top: 200,
      right: 240,
      bottom: 312,
      width: 80,
      height: 112,
      toJSON: () => ({}),
    });
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => screen),
    });

    act(() => {
      revealSource?.dispatchEvent(
        new PointerEvent("pointerdown", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 200,
          clientY: 256,
          pointerId: 32,
          pointerType: "mouse",
        }),
      );
      battlefieldCard?.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 720,
          clientY: 410,
          pointerId: 32,
          pointerType: "mouse",
        }),
      );
      battlefieldCard?.dispatchEvent(
        new PointerEvent("pointerup", {
          bubbles: true,
          cancelable: true,
          button: 0,
          clientX: 720,
          clientY: 410,
          pointerId: 32,
          pointerType: "mouse",
        }),
      );
    });

    expect(interactions.onSlotDrop).not.toHaveBeenCalled();
    expect(interactions.onBattlefieldDropRejected).toHaveBeenCalledWith({
      reason: "no-eligible-slot",
      clientX: 720,
      clientY: 410,
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
    const { container, root } = mount(makeView(), interactions, {
      guidedSlotHighlight: {
        owner: "player",
        rank: "front",
        slotId: parseBattleSlotViewId("player-front-empty"),
        label: assertLocalized("Move this character here."),
      },
    });
    const playArea = container.querySelector<HTMLElement>(
      '[data-battle-play-area="player"]',
    );
    const battlefieldCard = container.querySelector<HTMLElement>(
      '[data-battle-card-id="player-back-card"]',
    );
    const sourceRank = container.querySelector<HTMLElement>(
      '[data-battle-rank="player-back"]',
    );
    const overlappingRank = container.querySelector<HTMLElement>(
      '[data-battle-rank="player-front"]',
    );
    const guidedHighlight = container.querySelector<HTMLElement>(
      "[data-battle-guided-slot-highlight]",
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
    vi.spyOn(
      battlefieldCard as HTMLElement,
      "getBoundingClientRect",
    ).mockReturnValue({
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
    expect(sourceRank?.style.zIndex).toBe("1");
    expect(overlappingRank?.style.zIndex).toBe("2");
    expect(guidedHighlight?.getAttribute("aria-label")).toBe(
      "Move this character here.",
    );
    expect(guidedHighlight?.dataset.battleGuidedSlotId).toBe(
      "player-front-empty",
    );
    expect(guidedHighlight?.parentElement?.dataset.battleSlotId).toBe(
      "player-front-empty",
    );
    expect(guidedHighlight?.style.zIndex).toBe("4");
    expect(guidedHighlight?.style.outline).toContain("var(--positive)");

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
    expect(sourceRank?.style.zIndex).toBe("4");
    expect(overlappingRank?.style.zIndex).toBe("2");

    act(() => {
      battlefieldCard?.dispatchEvent(
        new PointerEvent("pointercancel", {
          bubbles: true,
          cancelable: true,
          pointerId: 21,
          pointerType: "mouse",
        }),
      );
    });
    expect(sourceRank?.style.zIndex).toBe("1");
    expect(overlappingRank?.style.zIndex).toBe("2");

    act(() => root.unmount());
  });

  it("ignores a pointer drop from an in-play card onto the opponent battlefield", () => {
    const interactions = {
      canInteract: true,
      pendingCardId: parseBattleCardId("player-front-card"),
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
    const emptySlotCount = container.querySelectorAll(
      '[data-battle-slot-filled="false"]',
    ).length;
    const battlefieldCard = container.querySelector<HTMLElement>(
      '.card-view[data-card-presentation="battlefield"]',
    );
    const battlefieldCardRadius =
      battlefieldCard?.style.getPropertyValue("--cv-radius");

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

  it("keeps an occupied slot shell mounted beneath a temporarily hidden occupant", () => {
    const { container, root } = mount(makeView(), undefined, {
      preserveOccupiedSlotOutlines: true,
    });
    const occupiedSlot = container.querySelector<HTMLElement>(
      '[data-battle-slot-id="player-front-filled"]',
    );
    const outline = occupiedSlot?.querySelector<HTMLElement>(
      "[data-battle-slot-outline]",
    );

    expect(occupiedSlot?.dataset.battleSlotFilled).toBe("true");
    expect(outline).not.toBeNull();
    expect(outline?.style.border).toBe("var(--battlefield-slot-border)");
    expect(outline?.style.zIndex).toBe("0");

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

  it("honors view-authored snap layout for a card whose travel is already rendered", () => {
    const view = makeView();
    const card = view.enemy.backRank[1]?.card;
    expect(card).not.toBeNull();
    expect(card).not.toBeUndefined();
    const snapView: MobileBattleView = {
      ...view,
      enemy: {
        ...view.enemy,
        backRank: view.enemy.backRank.map((slot, index) =>
          index === 1 && card !== null && card !== undefined
            ? { ...slot, card: { ...card, layoutMotion: "snap" } }
            : slot,
        ),
      },
    };
    const { container, root } = mount(snapView);

    expect(
      container
        .querySelector<HTMLElement>('[data-battle-card-id="enemy-back-card"]')
        ?.querySelector<HTMLElement>(":scope > [data-battle-card-motion]")
        ?.dataset.battleCardLayoutMotion,
    ).toBe("snap");

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
      handCard?.querySelector<HTMLElement>(":scope > [data-battle-card-motion]")
        ?.dataset.battleCardLayoutMotion,
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
      handCard?.querySelector<HTMLElement>(":scope > [data-battle-card-motion]")
        ?.dataset.battleCardLayoutMotion,
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
    const dataTransfer = {
      setDragImage: vi.fn(),
      effectAllowed: "uninitialized",
    };
    const dragStart = new Event("dragstart", {
      bubbles: true,
      cancelable: true,
    });
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
    vi.useFakeTimers();
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
    if (
      handCard?.parentElement !== null &&
      handCard?.parentElement !== undefined
    ) {
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
      "near-hand",
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
    expect(handCard?.dataset.battlePointerDragging).toBe("false");
    expect(handCard?.dataset.battlePointerDrop).toBe("committing");
    expect(handCard?.style.transform).toContain("translate3d(24px, 40px, 0)");
    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(handCard?.style.transform).toBe("");
    expect(handCard?.dataset.battlePointerDrop).toBeUndefined();

    act(() => root.unmount());
    vi.useRealTimers();
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
      "near-hand",
      { presentation: "sheet" },
    );

    interactions.onCardDebugActivate.mockClear();
    act(() => {
      battlefieldCard?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
      battlefieldCard?.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
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
      "near-hand",
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

  it("presents a shared hand card at reading size over the battlefield with normal context actions", () => {
    mockDesktopViewport(true);
    const card = makeCard(88, parseBattleCardId("shared-hand-card"));
    const interactions = {
      canInteract: true,
      pendingCardId: null,
      onHandCardActivate: vi.fn(),
      onRevealedHandCardDebugActivate: vi.fn(),
      onCardDragStart: vi.fn(),
      onCardDragEnd: vi.fn(),
      onSlotDrop: vi.fn(),
      onZoneDrop: vi.fn(),
      onPreviousPhase: vi.fn(),
      onNextPhase: vi.fn(),
    };
    const { container, root } = mount(
      { ...makeView(), revealedHandCard: card },
      interactions,
    );
    const reveal = container.querySelector<HTMLElement>(
      '[data-battle-revealed-hand-card][data-battle-card-id="shared-hand-card"]',
    );
    const revealLayer = container.querySelector<HTMLElement>(
      "[data-battle-card-reveal-layer]",
    );
    const face = reveal?.querySelector<HTMLElement>(
      '[data-testid="battle-card-face:shared-hand-card"]',
    );

    expect(reveal).not.toBeNull();
    expect(revealLayer?.style.position).toBe("absolute");
    expect(revealLayer?.style.pointerEvents).toBe("none");
    expect(container.querySelectorAll("[data-battle-rank]")).toHaveLength(4);
    expect(revealLayer?.querySelector("[data-battle-rank]")).toBeNull();
    expect(reveal?.style.gridRow).toBe("3 / 5");
    expect(face?.dataset.gameCardPresentation).toBe("full");

    act(() => {
      reveal
        ?.querySelector<HTMLElement>('[data-battle-card-zone="shared-reveal"]')
        ?.dispatchEvent(
          new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            clientX: 1020,
            clientY: 440,
          }),
        );
    });
    expect(interactions.onRevealedHandCardDebugActivate).toHaveBeenCalledWith(
      "shared-hand-card",
      { presentation: "context-menu", x: 1020, y: 440 },
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
    const dispatchTouch = (
      type: "pointerdown" | "pointerout" | "pointerup",
      pointerId: number,
    ) => {
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
    expect(
      document.querySelector("[data-cumulus-reveal-portal]"),
    ).not.toBeNull();
    act(() => {
      dispatchTouch("pointerout", 42);
      vi.advanceTimersByTime(270);
    });
    expect(
      document.querySelector("[data-cumulus-reveal-portal]"),
    ).not.toBeNull();
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
    vi.useFakeTimers();
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
    if (
      handCard?.parentElement !== null &&
      handCard?.parentElement !== undefined
    ) {
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
    expect(transformDuringPointerMove).toContain("translate3d(40px, -24px, 0)");
    expect(interactions.onCardDragStart).toHaveBeenCalledWith(
      "player-hand-0",
      "near-hand",
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
    expect(handCard?.dataset.battlePointerDrop).toBe("committing");
    expect(handCard?.style.transform).toContain("translate3d(40px, -24px, 0)");
    act(() => {
      vi.runOnlyPendingTimers();
    });
    expect(handCard?.style.transform).toBe("");
    expect(handCard?.dataset.battlePointerDrop).toBeUndefined();

    act(() => root.unmount());
    vi.useRealTimers();
  });
});
