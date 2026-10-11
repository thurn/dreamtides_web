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
import { fixedEnergy, xCost } from "../dsl/energy";
import type { Ability, AdditionalCost, BoundValue, CardCost, CardCountValue, CardFilter, CharacterSelector, PaymentCost, TriggeredAbility } from "../dsl/types";
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

/** A selector bound that counts the cards in a zone, or null. */
function countBound(bound: BoundValue | undefined): CardCountValue | null {
  return typeof bound === "object" && bound.value === "countCards" ? bound : null;
}

function isXBound(bound: BoundValue | undefined): boolean {
  return typeof bound === "object" && bound.value === "x";
}

function sparkOf(card: EngineCardDefinition): number {
  return typeof card.spark === "number" ? card.spark : 0;
}

/** The X a lab play may choose: an energy X cost's least X up to the lab's energy left after the fixed cost. */
interface XRange {
  readonly min: number;
  readonly max: number;
}

function labXRange(costs: readonly CardCost[]): XRange | null {
  const variable = xCost(costs);
  return variable === null ? null : { min: variable.min, max: LAB_ENERGY - fixedEnergy(costs) };
}

/**
 * Whether a ✦ or cost meets a selector's constant bounds, and is at least 1
 * under an upper bound by a count, so that the cards `countNeeds` stages
 * for it are ones the count reads. A lower bound by a count is not staged.
 */
function meetsBounds(value: number, atLeast: BoundValue | undefined, atMost: BoundValue | undefined): boolean {
  const least = constantBound(atLeast);
  const most = constantBound(atMost);
  return (least === undefined || value >= least) && (most === undefined || value <= most) && (countBound(atMost) === null || value >= 1);
}

/**
 * Whether some X in `range` meets every X-valued bound of the selector for a
 * character with this ✦ and copiable cost. A card whose X is not an energy
 * choice (`range` null) has its X bounds unchecked.
 */
function admitsX(selector: CharacterSelector, spark: number, cost: number, range: XRange | null): boolean {
  if (range === null) return true;
  let least = range.min;
  let most = range.max;
  for (const [value, atLeast, atMost] of [[spark, selector.sparkAtLeast, selector.sparkAtMost], [cost, selector.costAtLeast, selector.costAtMost]] as const) {
    if (isXBound(atLeast)) most = Math.min(most, value);
    if (isXBound(atMost)) least = Math.max(least, value);
  }
  return least <= most;
}

/** Cards a zone count must read for a staged character to meet an upper bound by that count. */
interface CountNeed {
  readonly count: CardCountValue;
  readonly cards: number;
}

/**
 * The cards an upper ✦ or cost bound by a zone count needs so that the
 * staged character meets it: as many as the character's ✦ or copiable cost,
 * in the zone the count reads, matching a void count's filter.
 */
function countNeeds(engine: Engine, selector: CharacterSelector, character: CardId): CountNeed[] {
  const card = engine.catalog.card(character);
  return [
    { count: countBound(selector.sparkAtMost), cards: sparkOf(card) },
    { count: countBound(selector.costAtMost), cards: fixedEnergy(card.costs) },
  ].flatMap(({ count, cards }) => (count === null ? [] : [{ count, cards }]));
}

/**
 * The first printing that fits: a synthetic vanilla card, then a pool card
 * with no authored abilities (vanilla, or pending, which plays text-less),
 * and only when authored content alone fits, such as a subtype no other card
 * carries, an authored card, so that the board does not depend on which
 * content is authored yet.
 */
function firstFitting(pool: readonly EngineCardDefinition[], fits: (card: EngineCardDefinition) => boolean): EngineCardDefinition | undefined {
  return Object.values(SYNTHETIC).find(fits) ?? pool.find((card) => card.status !== "authored" && fits(card)) ?? pool.find(fits);
}

/**
 * A character definition that satisfies a selector's subtype, constant
 * bounds, and upper bounds by a count (`meetsBounds`), and whose ✦ and cost
 * admit an X the play can choose (`admitsX`).
 */
function characterFor(
  engine: Engine,
  selector: CharacterSelector,
  pool: readonly EngineCardDefinition[],
  xRange: XRange | null,
): CardId {
  const fits = (card: EngineCardDefinition): boolean => {
    const spark = sparkOf(card);
    const cost = fixedEnergy(card.costs);
    return (
      card.cardType === "character" &&
      // The solver places catalog cards, never figments.
      selector.figment !== true &&
      (selector.subtype === undefined || card.subtype === selector.subtype) &&
      meetsBounds(spark, selector.sparkAtLeast, selector.sparkAtMost) &&
      meetsBounds(cost, selector.costAtLeast, selector.costAtMost) &&
      admitsX(selector, spark, cost, xRange)
    );
  };
  const found = firstFitting(pool, fits);
  if (found === undefined) {
    throw new Error(`The lab solver has no character for selector ${JSON.stringify(selector)}`);
  }
  engine.catalog.card(found.id);
  return found.id;
}

/** A matching printing for a void target or an opponent hand choice on the lab's neutral setup board. */
function cardFor(engine: Engine, filter: CardFilter, pool: readonly EngineCardDefinition[]): CardId {
  const found = firstFitting(pool, (card) => matchesFilter({ ...card, allTypes: false, cost: fixedEnergy(card.costs) }, filter));
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
 * `side`, whose ✦ and cost admit an X the play can choose, with as many
 * cards in the counted zone as an upper ✦ or cost bound by a zone count
 * needs (`countNeeds`): matching void cards, or cards in a hand beside the
 * played card, or in a deck beside its 8; a ▸Materialized trigger's void targets get their void cards too,
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
  const decks: Record<Side, CardId[]> = { player: [], enemy: [] };
  const zones = { void: voids, hand: hands, deck: decks };
  const xRange = labXRange(definition.costs);
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
        const character = characterFor(engine, spec.selector, pool, xRange);
        back[targetSide].push(character);
        for (const { count, cards } of countNeeds(engine, spec.selector, character)) {
          const countSide = count.player === "you" ? side : opponent(side);
          for (let card = 0; card < cards; card++) {
            zones[count.zone][countSide].push(count.zone === "void" ? cardFor(engine, count.filter, pool) : SYNTHETIC.vanilla1.id);
          }
        }
      }
    }
  }
  const { voidCards, points: score } = costNeeds(additionalCosts(definition, variant));
  for (const filter of voidCards) voids[side].push(cardFor(engine, filter, pool));
  const deck = (of: Side): CardId[] => [...Array.from({ length: 8 }, () => SYNTHETIC.vanilla1.id), ...decks[of]];
  const sides: Record<Side, SideSetup> = {
    player: { back: back.player, void: voids.player, deck: deck("player"), ...(hands.player.length > 0 ? { hand: hands.player } : {}) },
    enemy: { back: back.enemy, void: voids.enemy, deck: deck("enemy"), ...(hands.enemy.length > 0 ? { hand: hands.enemy } : {}) },
  };
  sides[side] = { ...sides[side], hand: [entry, ...hands[side]], energy: LAB_ENERGY, ...(score > 0 ? { score } : {}) };
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
