/**
 * The card-lab setup solver: a minimal legal board on which a card can be
 * played. Specs, the card-lab scene, and the sweep share it.
 */
import { printedCardId, type EngineCardDefinition } from "../catalog";
import { matchesFilter } from "../continuous/characteristics";
import type { Engine } from "../engine";
import { eventTargetSpecs } from "../effects/abilities";
import { everyNode, everyTarget } from "../effects/interpreter";
import type { Effect } from "../effects/registry";
import { fixedEnergy } from "../dsl/energy";
import type { Ability, AdditionalCost, BoundValue, CardCountValue, CardFilter, CharacterSelector, PaymentCost, TriggeredAbility } from "../dsl/types";
import { additionalCosts } from "../rules/costs";
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

function constantBound(bound: BoundValue | undefined): number | undefined {
  return typeof bound === "number" ? bound : undefined;
}

/** A selector bound that counts the cards in a void, or null. */
function voidCount(bound: BoundValue | undefined): Extract<CardCountValue, { zone: "void" }> | null {
  return typeof bound === "object" && bound.value === "countCards" && bound.zone === "void" ? bound : null;
}

/**
 * The void cards an upper ✦ or cost bound by a void count needs so that the
 * staged character meets it: as many cards matching the count's filter as
 * the character's ✦ or copiable cost, in the void the count reads.
 */
function voidCountNeeds(engine: Engine, selector: CharacterSelector, character: CardId): { readonly count: Extract<CardCountValue, { zone: "void" }>; readonly cards: number }[] {
  const card = engine.catalog.card(character);
  const spark = typeof card.spark === "number" ? card.spark : 0;
  return [
    { count: voidCount(selector.sparkAtMost), cards: spark },
    { count: voidCount(selector.costAtMost), cards: fixedEnergy(card.costs) },
  ].flatMap(({ count, cards }) => (count === null ? [] : [{ count, cards }]));
}

/** A character definition that satisfies a selector, from the catalog when it names a subtype. */
function characterFor(
  engine: Engine,
  selector: CharacterSelector,
  pool: readonly EngineCardDefinition[],
): CardId {
  // An X-valued cost bound depends on the X paid as the card is played, and a zone count on the board
  // (`voidCountNeeds` stages it), so the solver checks constant bounds only.
  const costAtMost = constantBound(selector.costAtMost);
  const costAtLeast = constantBound(selector.costAtLeast);
  const sparkAtMost = constantBound(selector.sparkAtMost);
  const sparkAtLeast = constantBound(selector.sparkAtLeast);
  // A ✦ bound by a void count gets a character with ✦, so the void cards staged for it are ones the count reads.
  const sparkCounted = voidCount(selector.sparkAtMost) !== null;
  const fits = (card: EngineCardDefinition): boolean => {
    const spark = typeof card.spark === "number" ? card.spark : 0;
    return (
      card.cardType === "character" &&
      card.status !== "authored" &&
      // The solver places catalog cards, never figments.
      selector.figment !== true &&
      (selector.subtype === undefined || card.subtype === selector.subtype) &&
      (sparkAtMost === undefined || spark <= sparkAtMost) &&
      (sparkAtLeast === undefined || spark >= sparkAtLeast) &&
      (!sparkCounted || spark >= 1) &&
      (costAtMost === undefined || fixedEnergy(card.costs) <= costAtMost) &&
      (costAtLeast === undefined || fixedEnergy(card.costs) >= costAtLeast)
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

/** A matching printing for a void target or an opponent hand choice on the lab's neutral setup board. */
function cardFor(engine: Engine, filter: CardFilter, pool: readonly EngineCardDefinition[]): CardId {
  const fits = (card: EngineCardDefinition): boolean =>
    card.status !== "authored" && matchesFilter({ ...card, allTypes: false, cost: fixedEnergy(card.costs) }, filter);
  const found = Object.values(SYNTHETIC).find(fits) ?? pool.find(fits);
  if (found === undefined) throw new Error(`The lab solver has no card for filter ${JSON.stringify(filter)}`);
  engine.catalog.card(found.id);
  return found.id;
}

/** Whether an ability is a ▸Materialized trigger, which fires as the lab's play of a character enters play. */
function isMaterializedTrigger(ability: Ability): ability is TriggeredAbility {
  return ability.kind === "triggered" && "on" in ability.trigger && ability.trigger.on === "materialized";
}

/**
 * The filters of the opponent hand cards an effect chooses as it resolves
 * ("Discard a chosen card from the opponent's hand", "Banish a chosen
 * character from the opponent's hand"): each needs one matching card there.
 */
function opponentHandChoices(effect: Effect): CardFilter[] {
  return everyNode(effect).flatMap((node) => {
    const chosen = node as Effect;
    if (chosen.op === "discardChosen") return [chosen.filter];
    if (chosen.op === "banishCards" && chosen.from === "opponentHand") return [chosen.filter];
    return [];
  });
}

/** What the lab stages for additional costs: the void cards each void banish takes, and the ⍟ paid. */
interface CostNeeds {
  readonly voidCards: readonly CardFilter[];
  readonly points: number;
}

/**
 * The needs of costs paid together (top-level costs, one alternative, or an
 * optional cost's), through nested alternatives and optional costs: void
 * cards for every void banish any branch could pay, so each branch is
 * payable and an optional one is offered, and the most ⍟ one set of
 * branches pays, since only one alternative of a choice is paid.
 */
function costNeeds(costs: readonly (AdditionalCost | PaymentCost)[]): CostNeeds {
  const parts = costs.map((cost): CostNeeds => {
    switch (cost.cost) {
      case "choice": {
        const options = cost.options.map(costNeeds);
        return { voidCards: options.flatMap((option) => option.voidCards), points: Math.max(0, ...options.map((option) => option.points)) };
      }
      case "optional":
        return costNeeds(cost.costs);
      case "points":
        return { voidCards: [], points: cost.amount };
      case "banishFromVoid":
        return { voidCards: Array.from({ length: cost.count === "x" ? cost.min : cost.count }, () => cost.filter), points: 0 };
      default:
        return { voidCards: [], points: 0 };
    }
  });
  return { voidCards: parts.flatMap((part) => part.voidCards), points: parts.reduce((total, part) => total + part.points, 0) };
}

/**
 * Solves a lab board for `card` (a deck entry plays its variant): `side` is
 * active in its Day with the card in hand and ample energy, and every
 * play-time target spec gets a matching character in play, or for a void
 * target a matching card in the void, on the side it selects, relative to
 * `side`, with matching void cards for an upper ✦ or cost bound by a void
 * count (`voidCountNeeds`); a ▸Materialized trigger's void targets get their void cards too,
 * and a choice from the opponent's hand gets a matching card in that hand
 * (`opponentHandChoices`). A void banish additional cost gets its count of matching cards, or
 * its least X, in `side`'s void, and a ⍟ additional cost gets that many
 * points in `side`'s score, wherever it sits among alternatives and
 * optional costs (`costNeeds`). Throws if the card is still unplayable.
 */
export function labBoard(
  engine: Engine,
  card: CardId | DeckEntry,
  pool: readonly EngineCardDefinition[],
  side: Side = "player",
  staged?: Partial<Record<Side, SideSetup>>,
): { setup: BoardSetup; state: BattleState } {
  const entry: DeckEntry = typeof card === "string" ? { cardId: card } : card;
  const cardId = entry.cardId;
  const definition = engine.catalog.card(cardId);
  const back: Record<Side, CardId[]> = { player: [], enemy: [] };
  const voids: Record<Side, CardId[]> = { player: [], enemy: [] };
  const hands: Record<Side, CardId[]> = { player: [], enemy: [] };
  const variant = variantOf(entry);
  const abilities = definition.abilities(variant);
  const materialized = abilities.filter(isMaterializedTrigger).map((ability) => ability.effect);
  for (const spec of materialized.flatMap(everyTarget)) {
    if (spec.kind !== "inZone") continue;
    const voidSide = spec.player === "you" ? side : opponent(side);
    for (let index = 0; index < spec.count; index++) voids[voidSide].push(cardFor(engine, spec.filter, pool));
  }
  const played = [...abilities.flatMap((ability) => (ability.kind === "event" ? [ability.effect] : [])), ...materialized];
  for (const filter of played.flatMap(opponentHandChoices)) hands[opponent(side)].push(cardFor(engine, filter, pool));
  for (const specs of eventTargetSpecs(definition, variant)) {
    for (const spec of specs) {
      // A stack target needs an item on the stack, which a Day board never has; lab overrides supply one.
      if (spec.kind === "stackTarget") continue;
      if (spec.kind === "inZone") {
        const voidSide = spec.player === "you" ? side : opponent(side);
        for (let index = 0; index < spec.count; index++) voids[voidSide].push(cardFor(engine, spec.filter, pool));
        continue;
      }
      const targetSide = spec.selector.controller === "you" ? side : opponent(side);
      for (let index = 0; index < (spec.count ?? 1); index++) {
        const character = characterFor(engine, spec.selector, pool);
        back[targetSide].push(character);
        for (const { count, cards } of voidCountNeeds(engine, spec.selector, character)) {
          const voidSide = count.player === "you" ? side : opponent(side);
          for (let card = 0; card < cards; card++) voids[voidSide].push(cardFor(engine, count.filter, pool));
        }
      }
    }
  }
  const { voidCards, points: score } = costNeeds(additionalCosts(definition, variant));
  for (const filter of voidCards) voids[side].push(cardFor(engine, filter, pool));
  const deck = Array.from({ length: 8 }, () => SYNTHETIC.vanilla1.id);
  const sides: Record<Side, SideSetup> = {
    player: { back: back.player, void: voids.player, deck, ...(hands.player.length > 0 ? { hand: hands.player } : {}) },
    enemy: { back: back.enemy, void: voids.enemy, deck, ...(hands.enemy.length > 0 ? { hand: hands.enemy } : {}) },
  };
  sides[side] = { ...sides[side], hand: [entry], energy: LAB_ENERGY, ...(score > 0 ? { score } : {}) };
  const base: BoardSetup = { active: side, phase: "day", ...sides, ...LAB_OVERRIDES[cardId] };
  const setup: BoardSetup = staged === undefined ? base : {
    ...base,
    player: { ...base.player, ...staged.player },
    enemy: { ...base.enemy, ...staged.enemy },
  };
  const { state } = boardState(engine.catalog, setup);
  const playable = engine
    .legalActions(state, side)
    .some((action) => action.kind === "play" && printedCardIdOf(state, action.card) === cardId);
  if (staged === undefined && !playable) {
    throw new Error(`The lab board for ${cardId} does not make it playable; add a lab override`);
  }
  return { setup, state };
}
