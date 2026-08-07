const FEATURED_CARD_ROLES = new Set([
  "player",
  "opponent",
  "enemyStarter",
  "loadingEvent",
]);

const BATTLE_PHASES = new Set([
  "dreamwell",
  "draw",
  "dawn",
  "day",
  "dusk",
  "night",
  "challenge",
  "ending",
]);

function defaultError(message) {
  return new Error(message);
}

export function isTutorialFeaturedCardRole(value) {
  return FEATURED_CARD_ROLES.has(value);
}

export function isTutorialBattlePhase(value) {
  return BATTLE_PHASES.has(value);
}

export function isTutorialHandoffSlotLegal(side, zone, slotId) {
  if (typeof slotId !== "string") return false;
  if (zone === "frontRank") return /^F[0-8]$/u.test(slotId);
  if (zone !== "backRank") return false;
  return side === "player"
    ? /^B[0-4]$/u.test(slotId)
    : /^B[0-9]$/u.test(slotId);
}

export function tutorialFeaturedCardId(featuredCards, role) {
  switch (role) {
    case "player":
      return featuredCards.playerCardId;
    case "opponent":
      return featuredCards.opponentCardId;
    case "enemyStarter":
      return featuredCards.enemyStarterCardId;
    case "loadingEvent":
      return featuredCards.loadingEventCardId;
    default:
      throw new Error(`Unknown tutorial featured-card role: ${String(role)}`);
  }
}

export function assertTutorialBattleConfigurationContracts(
  battle,
  makeError = defaultError,
) {
  const starterIds = new Set(battle.starterDeck.map((entry) => entry.cardId));
  for (const placement of battle.handoff.placements) {
    if (placement.source !== "deck") continue;
    const cardId = tutorialFeaturedCardId(
      battle.featuredCards,
      placement.cardRole,
    );
    if (!starterIds.has(cardId)) {
      throw makeError(
        `Tutorial battle handoff deck placement role ${placement.cardRole} references a card absent from starterDeck.`,
      );
    }
  }
  if (!battle.dreamwellDraws.includes(battle.featuredCards.dreamwellCardId)) {
    throw makeError(
      "Tutorial battle featuredCards.dreamwellCardId must appear in dreamwellDraws.",
    );
  }
  if (battle.handoff.dreamwellDeckIndex > battle.dreamwellDraws.length) {
    throw makeError(
      "Tutorial battle handoff dreamwellDeckIndex must fit the configured Dreamwell prefix.",
    );
  }
  for (const side of ["player", "enemy"]) {
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

function consumeDeckCard(counts, cardId, context, makeError) {
  const remaining = counts.get(cardId) ?? 0;
  if (remaining <= 0) {
    throw makeError(
      `Tutorial battle starterDeck has insufficient copies of ${cardId} for ${context}.`,
    );
  }
  counts.set(cardId, remaining - 1);
}

export function assertTutorialDeckSufficiency(
  battle,
  actions,
  makeError = defaultError,
) {
  const decks = {
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
      tutorialFeaturedCardId(battle.featuredCards, placement.cardRole),
      `${placement.side} ${placement.zone} placement`,
      makeError,
    );
  }

  const hands = { player: [], enemy: [] };
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
  for (const side of ["player", "enemy"]) {
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
  for (const cardId of battle.playerDraws) {
    consumeDeckCard(decks.player, cardId, "playerDraws", makeError);
  }
  for (const cardId of battle.enemyDraws) {
    consumeDeckCard(decks.enemy, cardId, "enemyDraws", makeError);
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
