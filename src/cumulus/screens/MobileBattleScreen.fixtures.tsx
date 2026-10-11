// Shared fixtures for the MobileBattleScreen tests: a two-sided battle view
// over fixture cards, and a mount harness whose roots the tests unmount.
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { vi } from "vitest";
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
  type MobileBattleScreenProps,
  type MobileBattleSideView,
  type MobileBattleView,
} from "./MobileBattleScreen";

type Owner = "enemy" | "player";
export const roots: Root[] = [];

export function makeCard(index: number, instanceId: BattleCardId): MobileBattleCardView {
  const id = testCardId(`00000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
  const name = parseCardName(`Fixture Card ${String(index)}`);
  const displaySnapshot = {
    id, name, cardNumber: index, cardType: "Character", subtype: "Warrior", isStarter: false, energyCost: index % 4,
    spark: index % 5, isFast: false, renderedText: "A stable fixture ability.", imageNumber: index, artOwned: true,
  } as const;
  return { id: instanceId, model: { cardId: id, displaySnapshot }, exhausted: false, figment: false, storedTime: 0, showPlayableOutline: false };
}

function makeSide(owner: Owner, offset: number): MobileBattleSideView {
  const slot = (name: string, card: MobileBattleCardView | null) => ({ id: parseBattleSlotViewId(`${owner}-${name}`), card });
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
    frontRank: [slot("front-filled", makeCard(offset + 2, cardId(`${owner}-front-card`))), slot("front-empty", null)],
    status: { avatar: { imageNumber: "0007", name: owner, title: "Fixture" }, currentEnergy: 3, maxEnergy: 3, points: 5, pointsToWin: 10 },
  };
}

function inspectorSide(side: Owner): MobileBattleInspectorSideView {
  const zones = { hand: 4, deck: 2, void: 1, banished: 0, backRank: 1, frontRank: 1 };
  return { side, heading: side === "player" ? "Player" : "Enemy", points: 5, currentEnergy: 3, maxEnergy: 3, zones, canDiscard: true, canShuffle: true };
}

export function makeView(): MobileBattleView {
  const [enemy, player] = [makeSide("enemy", 1), makeSide("player", 20)];
  const hand = (owner: Owner, length: number, offset: number) =>
    Array.from({ length }, (_, index) => makeCard(offset + index, cardId(`${owner}-hand-${String(index)}`)));
  const [enemyHand, playerHand] = [hand("enemy", 8, 60), hand("player", 4, 40)];
  const enemyHandCardIds = enemyHand.map((card) => card.id);
  const nearHand = { owner: "player", position: "near", cardIds: playerHand.map((card) => card.id), cards: playerHand } as const;
  return {
    battleId: parseBattleId("battle-mobile-fixture"),
    perspective: "player",
    near: player,
    far: enemy,
    nearHand,
    farHand: { owner: "enemy", position: "far", cardIds: enemyHandCardIds, cards: [] },
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
      opponentName: "enemy", perspective: "player", turn: "3", phase: "Day", activeSide: "Player", result: "In progress",
      nextDreamwellOrder: "4", isOpponentHandRevealed: false, isPlayerHandHidden: false, isFarHandRevealed: false, isNearHandHidden: false,
      sides: { player: inspectorSide("player"), enemy: inspectorSide("enemy") },
    },
  };
}

const mountedRoots = new WeakMap<HTMLDivElement, Root>();

function screen(view: MobileBattleView, overrides: Partial<MobileBattleInteractions>, props: Partial<MobileBattleScreenProps>) {
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

export function mount(
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

export function rerender(container: HTMLDivElement, view: MobileBattleView, overrides: Partial<MobileBattleInteractions> = {}): void {
  act(() => mountedRoots.get(container)?.render(screen(view, overrides, {})));
}

export function query(parent: ParentNode, selector: string): HTMLElement {
  const element = parent.querySelector<HTMLElement>(selector);
  if (element === null) throw new Error(`missing ${selector}`);
  return element;
}

export function click(element: HTMLElement | undefined): void {
  act(() => element?.click());
}
