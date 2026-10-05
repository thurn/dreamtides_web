// Cross-field invariants of the tutorial battle configuration that its types
// cannot express: handoff placements, Dreamwell prefix bounds, and starter-deck
// copy counts across the authored draws.

import type { CardId } from "../types/card-identity";
import type {
  TutorialAction,
  TutorialBattleConfiguration,
  TutorialCardConstantRole,
  TutorialCardConstants,
} from "../types/tutorial";

type TutorialValidationErrorFactory = (message: string) => Error;
type TutorialSide = "player" | "enemy";
type BattlePhase = TutorialBattleConfiguration["handoff"]["phase"];

const TUTORIAL_CARD_CONSTANT_ROLES: ReadonlySet<unknown> = new Set<TutorialCardConstantRole>([
  "tutorialPlayerCharacter",
  "tutorialOpponentCharacter",
  "handoffEnemyCharacter",
  "loadingScreenEvent",
]);

const BATTLE_PHASES: ReadonlySet<unknown> = new Set<BattlePhase>([
  "dreamwell",
  "draw",
  "dawn",
  "day",
  "dusk",
  "night",
  "challenge",
  "ending",
]);

const TUTORIAL_SIDES: readonly TutorialSide[] = ["player", "enemy"];

function defaultError(message: string): Error {
  return new Error(message);
}

export function isTutorialCardConstantRole(
  value: unknown,
): value is TutorialCardConstantRole {
  return TUTORIAL_CARD_CONSTANT_ROLES.has(value);
}

export function isTutorialBattlePhase(value: unknown): value is BattlePhase {
  return BATTLE_PHASES.has(value);
}

export function isTutorialHandoffSlotLegal(
  side: TutorialSide,
  zone: "frontRank" | "backRank",
  slotId: unknown,
): boolean {
  if (typeof slotId !== "string") return false;
  if (zone === "frontRank") return /^F[0-8]$/u.test(slotId);
  return side === "player"
    ? /^B[0-4]$/u.test(slotId)
    : /^B[0-9]$/u.test(slotId);
}

export function tutorialCardConstantId(
  tutorialCardConstants: TutorialCardConstants,
  role: TutorialCardConstantRole,
): CardId {
  switch (role) {
    case "tutorialPlayerCharacter":
      return tutorialCardConstants.tutorialPlayerCharacterCardId;
    case "tutorialOpponentCharacter":
      return tutorialCardConstants.tutorialOpponentCharacterCardId;
    case "handoffEnemyCharacter":
      return tutorialCardConstants.handoffEnemyCharacterCardId;
    case "loadingScreenEvent":
      return tutorialCardConstants.loadingScreenEventCardId;
  }
}

export function assertTutorialBattleConfigurationContracts(
  battle: TutorialBattleConfiguration,
  makeError: TutorialValidationErrorFactory = defaultError,
): void {
  if (
    battle.tutorialCardConstants.loadingScreenCharacterCardId ===
    battle.tutorialCardConstants.handoffEnemyCharacterCardId
  ) {
    throw makeError(
      "Tutorial loading-screen and handoff enemy characters must use different card UUIDs.",
    );
  }
  const starterIds = new Set(battle.starterDeck.map((entry) => entry.cardId));
  for (const placement of battle.handoff.placements) {
    if (placement.source !== "deck") continue;
    const cardId = tutorialCardConstantId(
      battle.tutorialCardConstants,
      placement.cardRole,
    );
    if (!starterIds.has(cardId)) {
      throw makeError(
        `Tutorial battle handoff deck placement role ${placement.cardRole} references a card absent from starterDeck.`,
      );
    }
  }
  if (
    !battle.dreamwellDraws.includes(
      battle.tutorialCardConstants.tutorialDreamwellCardId,
    )
  ) {
    throw makeError(
      "Tutorial battle tutorialCardConstants.tutorialDreamwellCardId must appear in dreamwellDraws.",
    );
  }
  if (battle.handoff.dreamwellDeckIndex > battle.dreamwellDraws.length) {
    throw makeError(
      "Tutorial battle handoff dreamwellDeckIndex must fit the configured Dreamwell prefix.",
    );
  }
  for (const side of TUTORIAL_SIDES) {
    const state = battle.handoff[side];
    if (state.dreamwellCardIndex >= battle.handoff.dreamwellDeckIndex) {
      throw makeError(
        `Tutorial battle handoff.${side}.dreamwellCardIndex must precede dreamwellDeckIndex.`,
      );
    }
    if (state.dreamwellDrawnTurn > battle.handoff.turnNumber) {
      throw makeError(
        `Tutorial battle handoff.${side}.dreamwellDrawnTurn must not exceed turnNumber.`,
      );
    }
    if (state.score >= battle.scoreToWin) {
      throw makeError(
        `Tutorial battle handoff.${side}.score must be below scoreToWin.`,
      );
    }
  }
}

function consumeDeckCard(
  counts: Map<CardId, number>,
  cardId: CardId,
  context: string,
  makeError: TutorialValidationErrorFactory,
): void {
  const remaining = counts.get(cardId) ?? 0;
  if (remaining <= 0) {
    throw makeError(
      `Tutorial battle starterDeck has insufficient copies of ${cardId} for ${context}.`,
    );
  }
  counts.set(cardId, remaining - 1);
}

export function assertTutorialDeckSufficiency(
  battle: TutorialBattleConfiguration,
  actions: readonly TutorialAction[],
  makeError: TutorialValidationErrorFactory = defaultError,
): void {
  const decks: Record<TutorialSide, Map<CardId, number>> = {
    player: new Map(
      battle.starterDeck.map((entry) => [entry.cardId, entry.copies]),
    ),
    enemy: new Map(
      battle.starterDeck.map((entry) => [entry.cardId, entry.copies]),
    ),
  };
  for (const placement of battle.handoff.placements) {
    if (placement.source !== "deck") continue;
    consumeDeckCard(
      decks[placement.side],
      tutorialCardConstantId(battle.tutorialCardConstants, placement.cardRole),
      `${placement.side} ${placement.zone} placement`,
      makeError,
    );
  }

  const hands: Record<TutorialSide, CardId[]> = { player: [], enemy: [] };
  for (const action of actions) {
    if (action.action === "draw-opponent-card") {
      hands.enemy.push(action.cardId);
    } else if (action.action === "draw-card") {
      hands[action.owner].push(action.cardId);
    } else if (action.action === "reveal-and-play-opponent-card") {
      const index = hands.enemy.indexOf(action.cardId);
      if (index < 0) {
        throw makeError(
          `Tutorial action ${JSON.stringify(action.id)} plays ${action.cardId} before it is drawn.`,
        );
      }
      hands.enemy.splice(index, 1);
    }
  }
  for (const side of TUTORIAL_SIDES) {
    for (const cardId of hands[side]) {
      if ((decks[side].get(cardId) ?? 0) > 0) {
        consumeDeckCard(
          decks[side],
          cardId,
          `${side} authored hand`,
          makeError,
        );
      }
    }
  }
  for (const cardId of battle.forcedPlayerDraws) {
    consumeDeckCard(decks.player, cardId, "forcedPlayerDraws", makeError);
  }
  for (const cardId of battle.forcedEnemyDraws) {
    consumeDeckCard(decks.enemy, cardId, "forcedEnemyDraws", makeError);
  }
  const enemyCardsRemaining = [...decks.enemy.values()].reduce(
    (total, count) => total + count,
    0,
  );
  if (enemyCardsRemaining < 3) {
    throw makeError(
      "Tutorial battle starterDeck must leave three enemy cards available for the authored Erode state.",
    );
  }
}
