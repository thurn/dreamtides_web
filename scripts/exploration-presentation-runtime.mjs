const LOW_COST_CARD_PATTERN = /^≤(\d+)● cost (Character|Event)$/u;
const SIMULATED_PLAYER_DECK_SIZE = 30;

function randomIndex(length, random) {
  if (length < 1) throw new Error("Cannot select from an empty card list.");
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error("Exploration editor randomness must return a number in [0, 1).");
  }
  return Math.floor(value * length);
}

function shuffle(cards, random) {
  const shuffled = [...cards];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomIndex(index + 1, random);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

export function buildSimulatedPlayerDeck(cards, random) {
  const starterCards = cards.filter((card) => card.isStarter);
  const selectedStarters = starterCards.length <= SIMULATED_PLAYER_DECK_SIZE
    ? starterCards
    : shuffle(starterCards, random).slice(0, SIMULATED_PLAYER_DECK_SIZE);
  const remainingSlots = SIMULATED_PLAYER_DECK_SIZE - selectedStarters.length;
  if (remainingSlots <= 0) return selectedStarters;
  return [
    ...selectedStarters,
    ...shuffle(cards.filter((card) => card.isOfferable), random).slice(0, remainingSlots),
  ];
}

function matchesPredicate(card, predicate) {
  if (predicate === undefined || predicate === "") return true;
  if (predicate === "character") return card.cardType === "Character";
  if (predicate === "event") return card.cardType === "Event";
  if (predicate === "cheap-character") {
    return card.cardType === "Character" && card.energyCost !== null && card.energyCost <= 2;
  }
  const displayPredicate = predicate
    .split("-")
    .map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`)
    .join(" ");
  const lowCost = LOW_COST_CARD_PATTERN.exec(displayPredicate);
  if (lowCost !== null) {
    return card.cardType === lowCost[2] && card.energyCost !== null &&
      card.energyCost <= Number(lowCost[1]);
  }
  return card.subtype === displayPredicate;
}

function chooseCard(action, slot, cards, playerDeck, random) {
  const candidates = slot === "offered_card"
    ? cards.filter((card) => card.isOfferable && matchesPredicate(card, action.predicate))
    : playerDeck.filter((card) => matchesPredicate(card, action.predicate));
  const fallback = slot === "deck_card"
    ? cards.filter((card) => matchesPredicate(card, action.predicate))
    : candidates;
  const pool = candidates.length === 0 ? fallback : candidates;
  if (pool.length === 0) throw new Error(`No card matches {${slot}}.`);
  const card = pool[randomIndex(pool.length, random)];
  return {
    placeholder: `{${slot}}`,
    predicate: action.predicate ?? null,
    cardId: card.id,
    cardName: card.name,
    source: slot === "offered_card"
      ? "offer_pool"
      : candidates.length === 0 ? "catalog_fallback" : "player_deck",
  };
}

/** Render action-local presentation slots with simulated UUID-backed entities. */
export function renderActionPresentation(action, cards, playerDeck, random) {
  const slots = [...new Set(
    [...action.effectText.matchAll(/\{(offered_card|deck_card)\}/gu)].map((match) => match[1]),
  )];
  const runtimeCardSelections = slots.map((slot) =>
    chooseCard(action, slot, cards, playerDeck, random));
  const selections = new Map(runtimeCardSelections.map((entry) => [entry.placeholder, entry]));
  const renderedEffectParts = [];
  let cursor = 0;
  for (const match of action.effectText.matchAll(/\{(offered_card|deck_card)\}/gu)) {
    if (match.index > cursor) {
      renderedEffectParts.push({ kind: "text", text: action.effectText.slice(cursor, match.index) });
    }
    const selection = selections.get(match[0]);
    renderedEffectParts.push({
      kind: "card",
      placeholder: match[0],
      cardId: selection.cardId,
      cardName: selection.cardName,
    });
    cursor = match.index + match[0].length;
  }
  if (cursor < action.effectText.length) {
    renderedEffectParts.push({ kind: "text", text: action.effectText.slice(cursor) });
  }
  return {
    renderedEffectText: renderedEffectParts.map((part) =>
      part.kind === "card" ? part.cardName : part.text).join(""),
    renderedEffectParts,
    runtimeCardSelections,
  };
}
