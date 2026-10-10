/**
 * The card-lab setup solver: a minimal legal board on which a card can be
 * played. Specs, the card-lab scene, and the sweep share it.
 */
import { printedCardId, type EngineCardDefinition } from "../catalog";
import type { Engine } from "../engine";
import { eventTargetSpecs } from "../effects/abilities";
import { fixedEnergy } from "../dsl/energy";
import type { CharacterSelector } from "../dsl/types";
import { opponent, type CardId, type InstanceId, type Side } from "../state/ids";
import { variantOf } from "../state/create";
import type { BattleState, DeckEntry } from "../state/types";
import { boardState, type BoardSetup, type SideSetup } from "./board";
import { LAB_OVERRIDES } from "./lab-overrides";
import { SYNTHETIC } from "./synthetic-cards";

function printedCardIdOf(state: BattleState, id: InstanceId): CardId | null {
  const instance = state.instances[id];
  return instance === undefined ? null : printedCardId(instance.printing);
}

/** Energy the lab gives the side playing the card: enough for the card plus any X. */
export const LAB_ENERGY = 10;

/** A character definition that satisfies a selector, from the catalog when it names a subtype. */
function characterFor(
  engine: Engine,
  selector: CharacterSelector,
  pool: readonly EngineCardDefinition[],
): CardId {
  const fits = (card: EngineCardDefinition): boolean => {
    const spark = typeof card.spark === "number" ? card.spark : 0;
    return (
      card.cardType === "character" &&
      card.status !== "authored" &&
      (selector.subtype === undefined || card.subtype === selector.subtype) &&
      (selector.sparkAtMost === undefined || spark <= selector.sparkAtMost) &&
      (selector.sparkAtLeast === undefined || spark >= selector.sparkAtLeast) &&
      (selector.costAtMost === undefined || fixedEnergy(card.costs) <= selector.costAtMost)
    );
  };
  const vanilla = Object.values(SYNTHETIC).find(fits);
  const found = vanilla ?? pool.find(fits);
  if (found === undefined) {
    throw new Error(`The lab solver has no character for selector ${JSON.stringify(selector)}`);
  }
  engine.catalog.card(found.id);
  return found.id;
}

/**
 * Solves a lab board for `card` (a deck entry plays its variant): `side` is
 * active in its Day with the card in hand and ample energy, and every
 * play-time target spec gets a matching character on the side it selects,
 * relative to `side`. Throws if the card is still unplayable.
 */
export function labBoard(
  engine: Engine,
  card: CardId | DeckEntry,
  pool: readonly EngineCardDefinition[],
  side: Side = "player",
): { setup: BoardSetup; state: BattleState } {
  const entry: DeckEntry = typeof card === "string" ? { cardId: card } : card;
  const cardId = entry.cardId;
  const definition = engine.catalog.card(cardId);
  const back: Record<Side, CardId[]> = { player: [], enemy: [] };
  for (const specs of eventTargetSpecs(definition, variantOf(entry))) {
    for (const spec of specs) {
      // A stack target needs an item on the stack, which a Day board never has; lab overrides supply one.
      if (spec.kind !== "target") continue;
      const targetSide = spec.selector.controller === "you" ? side : opponent(side);
      for (let index = 0; index < (spec.count ?? 1); index++) {
        back[targetSide].push(characterFor(engine, spec.selector, pool));
      }
    }
  }
  const deck = Array.from({ length: 8 }, () => SYNTHETIC.vanilla1.id);
  const sides: Record<Side, SideSetup> = {
    player: { back: back.player, deck },
    enemy: { back: back.enemy, deck },
  };
  sides[side] = { ...sides[side], hand: [entry], energy: LAB_ENERGY };
  const setup: BoardSetup = { active: side, phase: "day", ...sides, ...LAB_OVERRIDES[cardId] };
  const { state } = boardState(engine.catalog, setup);
  const playable = engine
    .legalActions(state, side)
    .some((action) => action.kind === "play" && printedCardIdOf(state, action.card) === cardId);
  if (!playable) {
    throw new Error(`The lab board for ${cardId} does not make it playable; add a lab override`);
  }
  return { setup, state };
}
