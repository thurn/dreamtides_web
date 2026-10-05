/**
 * The card-lab setup solver: a minimal legal board on which a card can be
 * played. Specs, the card-lab scene, and the sweep share it.
 */
import type { EngineCardDefinition } from "../catalog";
import type { Engine } from "../engine";
import { eventTargetSpecs } from "../effects/abilities";
import type { CharacterSelector } from "../dsl/types";
import type { CardId, Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { boardState, type BoardSetup, type SideSetup } from "./board";
import { LAB_OVERRIDES } from "./lab-overrides";
import { SYNTHETIC } from "./synthetic-cards";

/** Energy the lab gives the player: enough for the card plus any X. */
export const LAB_ENERGY = 10;

/** A character definition that satisfies a selector, from the catalog when it names a subtype. */
function characterFor(
  engine: Engine,
  selector: CharacterSelector,
  pool: readonly EngineCardDefinition[],
): CardId {
  const fits = (card: EngineCardDefinition): boolean => {
    const spark = card.spark ?? 0;
    return (
      card.cardType === "character" &&
      card.status !== "authored" &&
      (selector.subtype === undefined || card.subtype === selector.subtype) &&
      (selector.sparkAtMost === undefined || spark <= selector.sparkAtMost) &&
      (selector.sparkAtLeast === undefined || spark >= selector.sparkAtLeast) &&
      (selector.costAtMost === undefined || (card.cost ?? 0) <= selector.costAtMost)
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
 * Solves a lab board for `cardId`: the player is active in Day with the card
 * in hand and ample energy, and every play-time target spec gets a matching
 * character on the side it selects. Throws if the card is still unplayable.
 */
export function labBoard(
  engine: Engine,
  cardId: CardId,
  pool: readonly EngineCardDefinition[],
): { setup: BoardSetup; state: BattleState } {
  const definition = engine.catalog.card(cardId);
  const back: Record<Side, CardId[]> = { player: [], enemy: [] };
  for (const specs of eventTargetSpecs(definition, { amplified: false })) {
    for (const spec of specs) {
      // A stack target needs an item on the stack, which a Day board never has; lab overrides supply one.
      if (spec.kind !== "target") continue;
      const side: Side = spec.selector.controller === "you" ? "player" : "enemy";
      for (let index = 0; index < (spec.count ?? 1); index++) {
        back[side].push(characterFor(engine, spec.selector, pool));
      }
    }
  }
  const deck = Array.from({ length: 8 }, () => SYNTHETIC.vanilla1.id);
  const player: SideSetup = { hand: [cardId], energy: LAB_ENERGY, back: back.player, deck };
  const enemy: SideSetup = { back: back.enemy, deck };
  const setup: BoardSetup = { active: "player", phase: "day", player, enemy, ...LAB_OVERRIDES[cardId] };
  const { state } = boardState(engine.catalog, setup);
  const playable = engine
    .legalActions(state, "player")
    .some((action) => action.kind === "play" && state.instances[action.card]?.cardId === cardId);
  if (!playable) {
    throw new Error(`The lab board for ${cardId} does not make it playable; add a lab override`);
  }
  return { setup, state };
}
