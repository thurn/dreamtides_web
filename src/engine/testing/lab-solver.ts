/**
 * The card-lab setup solver: a minimal legal board on which a card can be
 * played. Specs, the card-lab scene, and the sweep share it.
 */
import { instanceCard, printedCardId, type EngineCardDefinition } from "../catalog";
import { matchesFilter } from "../continuous/characteristics";
import type { Engine } from "../engine";
import { eventTargetSpecs } from "../effects/abilities";
import { mentionsChosenSubtype } from "../effects/primitives/choose-subtype";
import { everyNode, everyTarget } from "../effects/interpreter";
import type { Effect } from "../effects/registry";
import { namedTriggersOf } from "../dsl/abilities";
import { BASE_VARIANT } from "../dsl/types";
import { fixedEnergy, xCost } from "../dsl/energy";
import type { Ability, BoundValue, VoidCostBound, CardCost, CardCountValue, CardFilter, CharacterPredicate, CharacterSelector, Cost, PlayerRef, StackItemSelector, TriggeredAbility, Variant, ZoneTargetSpec } from "../dsl/types";
import { additionalCosts } from "../rules/costs";
import { opponent, type CardId, type InstanceId, type Side } from "../state/ids";
import { variantOf } from "../state/create";
import type { BattleState, DeckEntry } from "../state/types";
import { NO_PROMPTS } from "../steps/sources";
import { boardState, type BoardSetup, type SideSetup } from "./board";
import { DSL } from "./dsl-cards";
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

/**
 * Bounds by "this character's ✦" read as the constant `spark`, the played
 * card's spark (`labSourceSpark`): a ▸Materialized trigger's source is in
 * play with it, and an event, which has none, reads 0.
 */
function sourceSparkAs<T extends Partial<Record<"sparkAtLeast" | "sparkAtMost" | "costAtLeast" | "costAtMost" | "costLessThan", VoidCostBound>> & { readonly anyOf?: readonly CharacterPredicate[] }>(bounds: T, spark: number): T {
  const keys = ["sparkAtLeast", "sparkAtMost", "costAtLeast", "costAtMost", "costLessThan"] as const;
  const rewritten = keys.reduce((result, key) => {
    const bound = result[key];
    return typeof bound === "object" && bound.value === "sourceSpark" ? { ...result, [key]: spark } : result;
  }, bounds);
  return bounds.anyOf === undefined ? rewritten : { ...rewritten, anyOf: bounds.anyOf.map(branch => sourceSparkAs(branch, spark)) };
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
 * The ✦ the played card enters play with: its variant's printed card's
 * (`instanceCard`, with its deck-entry spark bonus and type change), a
 * variable ✦ at the least X the play can choose, which the lab's first legal
 * answer picks, and 0 for an event.
 */
function labSourceSpark(engine: Engine, cardId: CardId, variant: Variant, xRange: XRange | null): number {
  const { spark } = instanceCard(engine.catalog, { printing: { kind: "card", cardId }, variant });
  return spark === null ? 0 : spark === "x" ? (xRange?.min ?? 0) : spark;
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

/** The ✦ and cost bounds of a character selector or a void reference. */
type ValueBounds = Pick<CharacterSelector, "sparkAtLeast" | "sparkAtMost" | "costAtLeast" | "costAtMost">;

/**
 * Whether some X in `range` meets every X-valued bound for a card with this
 * ✦ and copiable cost. A card whose X is not an energy choice (`range` null)
 * has its X bounds unchecked.
 */
function admitsX(bounds: ValueBounds | readonly ValueBounds[], spark: number, cost: number, range: XRange | null): boolean {
  if (range === null) return true;
  let least = range.min;
  let most = range.max;
  const predicates: readonly ValueBounds[] = Array.isArray(bounds) ? bounds : [bounds as ValueBounds];
  for (const predicate of predicates) for (const [value, atLeast, atMost] of [[spark, predicate.sparkAtLeast, predicate.sparkAtMost], [cost, predicate.costAtLeast, predicate.costAtMost]] as const) {
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
function countNeeds(engine: Engine, predicates: readonly Omit<CharacterSelector, "controller" | "anyOf">[], character: CardId): CountNeed[] {
  const card = engine.catalog.card(character);
  return predicates.flatMap(selector => [
    { count: countBound(selector.sparkAtMost), cards: sparkOf(card) },
    { count: countBound(selector.costAtMost), cards: fixedEnergy(card.costs) },
  ].flatMap(({ count, cards }) => (count === null ? [] : [{ count, cards }])));
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
  automaticFixture = true,
): { readonly card: CardId; readonly predicates: readonly Omit<CharacterSelector, "controller" | "anyOf">[] } {
  const fitting = (card: EngineCardDefinition): readonly Omit<CharacterSelector, "controller" | "anyOf">[] | null => {
    const spark = sparkOf(card);
    const cost = fixedEnergy(card.costs);
    if (card.cardType !== "character") return null;
    const branches = selector.anyOf === undefined ? [{}] : selector.anyOf;
    for (const branch of branches) {
      // Automatic catalog fixtures are ready back-rank characters without challenge roles.
      if (automaticFixture && (branch.exhausted === true || branch.rank === "front" || branch.challenging === true || branch.blocking === true)) continue;
      const predicates = [selector, branch];
      if (predicates.every(predicate =>
        // The solver places catalog cards, never figments.
        predicate.figment !== true &&
        (predicate.hasAbility === undefined || namedTriggersOf(card.abilities(BASE_VARIANT)).includes(predicate.hasAbility)) &&
        (predicate.subtype === undefined || card.subtype === predicate.subtype) &&
        (predicate.notSubtype === undefined || card.subtype !== predicate.notSubtype) &&
        meetsBounds(spark, predicate.sparkAtLeast, predicate.sparkAtMost) &&
        meetsBounds(cost, predicate.costAtLeast, predicate.costAtMost)
      ) && admitsX(predicates, spark, cost, xRange)) return predicates;
    }
    return null;
  };
  const found = firstFitting(pool, card => fitting(card) !== null);
  if (found === undefined) throw new Error(`The lab solver has no character for selector ${JSON.stringify(selector)}`);
  const predicates = fitting(found);
  if (predicates === null) throw new Error("The lab solver's selected character must satisfy its predicates");
  engine.catalog.card(found.id);
  return { card: found.id, predicates };

}

/**
 * A matching printing for a void target, an opponent hand choice, or a
 * discovery on the lab's neutral setup board, whose copiable cost `admits`
 * accepts.
 */
function cardFor(engine: Engine, filter: CardFilter, pool: readonly EngineCardDefinition[], admits: (cost: number) => boolean = () => true): CardId {
  const found = firstFitting(pool, (card) => {
    const cost = fixedEnergy(card.costs);
    return matchesFilter({ ...card, allTypes: false, namedTriggers: namedTriggersOf(card.abilities(BASE_VARIANT)), cost, spark: card.spark === null ? null : sparkOf(card) }, filter) && admits(cost);
  });
  if (found === undefined) throw new Error(`The lab solver has no card for filter ${JSON.stringify(filter)}`);
  engine.catalog.card(found.id);
  return found.id;
}

/** Matching staged base printings that a play requirement still needs in its void. */
function playConditionVoidDeficit(engine: Engine, cards: readonly CardId[], filter: CardFilter, atLeast: number): number {
  const matching = cards.filter((id) => {
    const card = engine.catalog.card(id);
    return matchesFilter({ ...card, allTypes: false, namedTriggers: namedTriggersOf(card.abilities(BASE_VARIANT)),
      cost: fixedEnergy(card.costs), spark: card.spark === null ? null : sparkOf(card) }, filter);
  }).length;
  return Math.max(0, atLeast - matching);
}

/** Whether an ability is a ▸Materialized trigger, which fires as the lab's play of a character enters play. */
function isMaterializedTrigger(ability: Ability): ability is TriggeredAbility {
  return ability.kind === "triggered" && "on" in ability.trigger && ability.trigger.on === "materialized";
}

/**
 * The filters of the opponent hand cards an effect chooses as it resolves
 * ("Discard a chosen card from the opponent's hand", "Banish a chosen
 * character from the opponent's hand", "Choose a card in the opponent's
 * hand. That card cannot be played"): each needs one matching card there.
 */
function opponentHandChoices(effect: Effect): CardFilter[] {
  return everyNode(effect).flatMap((node) => {
    const chosen = node as Effect;
    if (chosen.op === "discardChosen") return [chosen.filter];
    if (chosen.op === "banishCards" && chosen.from === "opponentHand") return [chosen.filter];
    if (chosen.op === "playRestriction" && chosen.restriction.kind === "chosen") return [{}];
    return [];
  });
}

/**
 * The filters of the cards an effect discovers by its filter alone
 * ("Discover a ≤2✦ character"): each needs one matching card in its
 * controller's deck. A cost criterion settled as Discover resolves, or a
 * subtype chosen then, stages nothing.
 */
function discoveries(effect: Effect): CardFilter[] {
  return everyNode(effect).flatMap((node) => {
    const discovered = node as Effect;
    if (discovered.op !== "discover" || mentionsChosenSubtype(discovered)) return [];
    const plain = discovered.costExactly === undefined && discovered.costGreaterThan === undefined && discovered.chooseCost === undefined;
    return plain ? [discovered.filter] : [];
  });
}

/** Own-hand materialization stages fixed maxima and the source's initial zero stored-counter bound. */
function chosenHandMaterializations(effect: Effect): CardFilter[] {
  return everyNode(effect).flatMap((node) => {
    const chosen = node as Effect;
    if (chosen.op !== "materializeChosen") return [];
    const bound = chosen.costAtMost;
    if (typeof bound === "number") return bound < 0 ? [] : [{ cardType: "character", costAtMost: bound }];
    return bound.value === "storedCounters" ? [{ cardType: "character", costAtMost: 0 }] : [];
  });
}

/** A void reference's filter narrowed by a constant cost bound. */
function boundedFilter(filter: CardFilter, atMost: number | undefined): CardFilter {
  return atMost === undefined ? filter : { ...filter, costAtMost: Math.min(atMost, filter.costAtMost ?? atMost) };
}

/** X read on a card whose X is not an energy choice. */
const NO_X: XRange = { min: 0, max: 0 };

/**
 * A printing for a void target ("≤X● cost events in your void"): its filter
 * narrowed by a constant cost bound, and under a bound by X a copiable cost
 * that some X the play can choose admits (`admitsX`), as for a character
 * target. X is picked before the targets and a play-time prompt offers only
 * answers that lead to a legal play, so a required target leaves the play
 * only the Xs at least its cost.
 */
function voidTargetFor(engine: Engine, spec: ZoneTargetSpec, pool: readonly EngineCardDefinition[], xRange: XRange | null, subjectCost: number | null = null): CardId {
  const fits = (cost: number, bound: VoidCostBound | undefined, strict: boolean): boolean => {
    if (bound === undefined) return true;
    const limit = typeof bound === "number" ? bound : bound.value === "subjectCost" ? subjectCost ?? 0
      : bound.value === "x" ? (xRange ?? NO_X).max : undefined;
    return limit === undefined || (strict ? cost < limit : cost <= limit);
  };
  return cardFor(engine, spec.filter, pool, cost => fits(cost, spec.costAtMost, false) && fits(cost, spec.costLessThan, true));
}

/**
 * The void cards an effect materializes by "each … in your void"
 * (`materialize(everyIn("void", …))`): each needs one matching card in that
 * void, whose copiable cost meets the reference's cost bound, a constant or
 * the least X the play can choose ("each ≤X● cost character in your void"),
 * since nothing it reads narrows the X the play picks.
 */
function voidMaterializations(effect: Effect, xRange: XRange | null): { player: PlayerRef; filter: CardFilter }[] {
  return everyNode(effect).flatMap((node) => {
    const materialized = node as Effect;
    if (materialized.op !== "materialize" || "op" in materialized.from) return [];
    const { from } = materialized;
    if (from.kind !== "inZone" || from.pick !== "every" || from.zone !== "void") return [];
    const atMost = typeof from.costAtMost === "object" ? (xRange ?? NO_X).min : from.costAtMost;
    return [{ player: from.player, filter: boundedFilter(from.filter, atMost) }];
  });
}

/**
 * The characters an effect's `abandon` nodes choose as it resolves ("Each
 * player abandons a non-figment character"): each needs a matching character
 * its chooser controls, relative to the effect's controller, so that the
 * lab's first choice is not the played card itself. Inside "each player",
 * every player chooses. A Prevent's "unless the opponent abandons" cost
 * gets a matching character on the opponent's side, so the choice is
 * offered. The solver places no figments, so a figment-only choice stages
 * nothing.
 */
function abandonChoices(effect: Effect): { readonly choosers: readonly PlayerRef[]; readonly selector: CharacterSelector }[] {
  const nodes = everyNode(effect) as Effect[];
  const each = new Set(nodes.flatMap((node) => (node.op === "eachPlayer" ? everyNode(node.effect) : [])));
  return nodes.flatMap((node) => {
    if (node.op === "prevent") {
      const predicate = node.unlessAbandons;
      return predicate === null || predicate.figment === true ? [] : [{ choosers: ["opponent"], selector: { ...predicate, controller: "you" } }];
    }
    if (node.op !== "abandon" || node.predicate.figment === true) return [];
    const choosers: readonly PlayerRef[] = each.has(node) ? ["you", "opponent"] : [node.chooser];
    return [{ choosers, selector: { ...node.predicate, controller: "you" } }];
  });
}

/**
 * The card the opposing side plays first so that a card with a stack target
 * has an item to target: a vanilla character for a character selector, else
 * a plain event. A player responds only to the opponent's items, so a
 * selector of the player's own items stages nothing.
 */
function stackOpener(selector: StackItemSelector): CardId | null {
  if (selector.controller === "you") return null;
  return selector.cardType === "character" ? SYNTHETIC.vanilla1.id : DSL.drawTwo.id;
}

/** What the lab stages for additional costs: matching cards and characters, and the ⍟ paid. */
interface CostNeeds {
  readonly voidCards: readonly { readonly player: PlayerRef | "any"; readonly filter: CardFilter }[];
  readonly handCards: readonly CardFilter[];
  readonly characters: readonly CharacterSelector[];
  readonly points: number;
}

/**
 * The needs of costs paid together (top-level costs, one alternative, or an
 * optional cost's), through nested alternatives and optional costs: matching
 * cards and characters for every payment any branch could pay, so each branch is
 * payable and an optional one is offered, and the most ⍟ one set of
 * branches pays, since only one alternative of a choice is paid.
 */
function costNeeds(costs: readonly Cost[]): CostNeeds {
  const empty: CostNeeds = { voidCards: [], handCards: [], characters: [], points: 0 };
  const parts = costs.map((cost): CostNeeds => {
    switch (cost.cost) {
      case "choice": {
        const options = cost.options.map(costNeeds);
        return {
          voidCards: options.flatMap((option) => option.voidCards),
          handCards: options.flatMap((option) => option.handCards),
          characters: options.flatMap((option) => option.characters),
          points: Math.max(0, ...options.map((option) => option.points)),
        };
      }
      case "optional":
        return costNeeds(cost.costs);
      case "points":
        return { ...empty, points: cost.amount };
      case "banishFromVoid":
        return { ...empty, voidCards: Array.from({ length: cost.count === "x" ? cost.min : cost.count }, () => ({ player: "you" as const, filter: cost.filter })) };
      case "banishFromAnyVoid":
        return { ...empty, voidCards: Array.from({ length: cost.count }, () => ({ player: cost.player, filter: cost.filter })) };
      case "banishFromHand":
        return { ...empty, handCards: Array.from({ length: cost.count }, () => ({})) };
      case "return":
        return { ...empty, characters: Array.from({ length: cost.count }, () => cost.selector) };
      case "abandon": {
        const selector = cost.selector;
        // The source is in hand as a card is played; another staged instance cannot pay a self-only cost.
        return "kind" in selector ? empty : { ...empty, characters: Array.from({ length: cost.count === "x" ? Math.max(1, cost.min) : cost.count }, () => selector) };
      }
      case "discard":
      case "reveal":
        // A whole-hand discard is payable with an empty hand, so it stages no card.
        if (cost.count === "hand") return empty;
        return { ...empty, handCards: Array.from({ length: cost.count === "x" ? Math.max(1, cost.min ?? 0) : cost.count }, () => cost.filter) };
      default:
        return empty;
    }
  });
  return {
    voidCards: parts.flatMap((part) => part.voidCards),
    handCards: parts.flatMap((part) => part.handCards),
    characters: parts.flatMap((part) => part.characters),
    points: parts.reduce((total, part) => total + part.points, 0),
  };
}

/**
 * Solves a lab board for `card` (a deck entry plays its variant): `side` is
 * active in its Day with the card in hand and ample energy, and every
 * play-time target spec gets a matching character in play, or for a void
 * target a matching card in the void, on the side it selects, relative to
 * `side`, whose ✦ and cost admit an X the play can choose (a void target's
 * cost bound by X admitting one, `voidTargetFor`, and a bound by "this
 * character's ✦" read as the spark the played variant enters play with, `sourceSparkAs`), with as many
 * cards in the counted zone as an upper ✦ or cost bound by a zone count
 * needs (`countNeeds`): matching void cards, or cards in a hand beside the
 * played card, or in a deck beside its 8; a ▸Materialized trigger's void targets get their void cards too,
 * and its targets among `side`'s own characters a matching character of `side`'s,
 * and a choice from the opponent's hand gets a matching card in that hand
 * (`opponentHandChoices`); a card discovered by its filter alone gets a
 * matching card in `side`'s deck beside its 8 (`discoveries`); a character abandoned as the effect resolves gets
 * a matching character on each chooser's side (`abandonChoices`); "each …
 * in your void" a materialize takes gets one matching void card
 * (`voidMaterializations`). A void banish additional cost gets matching void cards
 * (`costNeeds`): a payer-void banish its fixed count, or its least X, in
 * `side`'s void; a banish from a selected void its fixed count in the
 * opponent's void when it names the opponent, else in `side`'s void; discard and reveal costs get matching cards
 * beside the source in hand, and abandon costs get matching own characters. Figment-only costs get
 * figment copies carried in the setup, so rebuilding the fixture retains
 * them. Abandon-X activated abilities get their matching cost resources and
 * targets as well, bounded by the staged count.
 * A ⍟ additional cost gets that many
 * points in `side`'s score, wherever it sits among alternatives and
 * optional costs (`costNeeds`). An event or ▸Materialized trigger with a stack target answers an
 * item of the opponent's: unless a board is declared, the opponent is active
 * in its Day holding a matching opener (`stackOpener`) as its first hand
 * card, and `opener` names that side; the lab plays the opener before the
 * card, and the card is checked for playability once it is on the stack.
 * Throws if the card is still unplayable.
 */
export function labBoard(
  engine: Engine,
  card: CardId | DeckEntry,
  pool: readonly EngineCardDefinition[],
  side: Side = "player",
  staged?: Partial<Record<Side, SideSetup>>,
): { setup: BoardSetup; state: BattleState; opener: Side | null } {
  const entry: DeckEntry = typeof card === "string" ? { cardId: card } : card;
  const cardId = entry.cardId;
  const definition = engine.catalog.card(cardId);
  const back: Record<Side, (CardId | null)[]> = { player: [], enemy: [] };
  const figments: Record<Side, NonNullable<SideSetup["figments"]>[number][]> = { player: [], enemy: [] };
  const voids: Record<Side, CardId[]> = { player: [], enemy: [] };
  const hands: Record<Side, CardId[]> = { player: [], enemy: [] };
  const decks: Record<Side, CardId[]> = { player: [], enemy: [] };
  const zones = { void: voids, hand: hands, deck: decks };
  let opener: CardId | null = null;
  const xRange = labXRange(definition.costs);
  const variant = variantOf(entry);
  const abilities = definition.abilities(variant);
  const countActivations = abilities.filter((ability) => ability.kind === "activated" && ability.costs.some((cost) => cost.cost === "abandon" && cost.count === "x"));
  const activationCosts = countActivations.flatMap((ability) => ability.kind === "activated" ? ability.costs : []);
  const countRange: XRange | null = activationCosts.reduce<XRange | null>((range, cost) => cost.cost === "abandon" && cost.count === "x" ? { min: Math.max(range?.min ?? 0, cost.min), max: Math.max(range?.max ?? 0, 1, cost.min) } : range, null);
  const materialized = abilities.filter(isMaterializedTrigger).map((ability) => ability.effect);
  const sourceSpark = labSourceSpark(engine, cardId, variant, xRange);
  const subjectCost = fixedEnergy(instanceCard(engine.catalog, { printing: { kind: "card", cardId }, variant }).costs);
  const stageVoid = (spec: ZoneTargetSpec, captured: number | null) => {
    const targetSide = spec.player === "you" ? side : opponent(side);
    const staged = sourceSparkAs(spec, sourceSpark);
    for (let index = 0; index < spec.count; index++) {
      const card = voidTargetFor(engine, staged, pool, xRange, captured);
      voids[targetSide].push(card);
      for (const [bound, strict] of [[staged.costAtMost, false], [staged.costLessThan, true]] as const) {
        if (typeof bound !== "object" || bound.value !== "countCards") continue;
        const countSide = bound.player === "you" ? side : opponent(side);
        const needed = fixedEnergy(engine.catalog.card(card).costs) + (strict ? 1 : 0);
        for (let count = 0; count < needed; count++) zones[bound.zone][countSide].push(bound.zone === "void" ? cardFor(engine, bound.filter, pool) : SYNTHETIC.vanilla1.id);
      }
    }
  };
  for (const spec of materialized.flatMap(everyTarget)) {
    if (spec.kind === "stackTarget") {
      opener ??= stackOpener(spec.selector);
      continue;
    }
    // A ▸Materialized character target of your own gets a character of yours ahead of the card, so the card is not its only choice.
    if (spec.kind === "target" && spec.selector.controller === "you") {
      const selector = sourceSparkAs(spec.selector, sourceSpark);
      for (let index = 0; index < (spec.count ?? 1); index++) back[side].push(characterFor(engine, selector, pool, xRange, staged === undefined).card);
      continue;
    }
    if (spec.kind !== "inZone") continue;
    stageVoid(spec, subjectCost);
  }
  const played = [...abilities.flatMap((ability) => (ability.kind === "event" ? [ability.effect] : [])), ...materialized];
  const chosenHandEffects = [...played, ...abilities.flatMap((ability) => ability.kind === "activated" ? [ability.effect] : [])];
  for (const filter of chosenHandEffects.flatMap(chosenHandMaterializations)) hands[side].push(cardFor(engine, filter, pool));
  for (const filter of played.flatMap(opponentHandChoices)) hands[opponent(side)].push(cardFor(engine, filter, pool));
  for (const filter of played.flatMap(discoveries)) decks[side].push(cardFor(engine, filter, pool));
  for (const { player, filter } of played.flatMap((effect) => voidMaterializations(effect, xRange))) {
    voids[player === "you" ? side : opponent(side)].push(cardFor(engine, filter, pool));
  }
  for (const { choosers, selector } of played.flatMap(abandonChoices)) {
    for (const chooser of choosers) back[chooser === "you" ? side : opponent(side)].push(characterFor(engine, selector, pool, xRange, staged === undefined).card);
  }
  for (const specs of [...eventTargetSpecs(definition, variant), ...countActivations.map((ability) => ability.kind === "activated" ? everyTarget(ability.effect) : [])]) {
    for (const spec of specs) {
      // A stack target needs an item on the stack, which a Day board never has: the opponent plays an opener first.
      if (spec.kind === "stackTarget") {
        opener ??= stackOpener(spec.selector);
        continue;
      }
      if (spec.kind === "inZone") {
        stageVoid(spec, null);
        continue;
      }
      const selectors = spec.when?.condition.cond === "costPaid" ? [spec.selector, spec.when.otherwise] : [spec.selector];
      for (const predicate of selectors) {
        const targetSide = predicate.controller === "you" ? side : opponent(side);
        const selector = sourceSparkAs(predicate, sourceSpark);
        for (let index = 0; index < (spec.count ?? 1); index++) {
          const character = characterFor(engine, selector, pool, xRange ?? countRange, staged === undefined);
          back[targetSide].push(character.card);
          for (const { count, cards } of countNeeds(engine, character.predicates, character.card)) {
            const countSide = count.player === "you" ? side : opponent(side);
            for (let card = 0; card < cards; card++) {
              zones[count.zone][countSide].push(count.zone === "void" ? cardFor(engine, count.filter, pool) : SYNTHETIC.vanilla1.id);
            }
          }
        }
      }
    }
  }
  const { voidCards, handCards, characters, points: score } = costNeeds([...additionalCosts(definition, variant), ...activationCosts]);
  for (const need of voidCards) {
    const of = need.player === "opponent" ? opponent(side) : side;
    voids[of].push(cardFor(engine, need.filter, pool));
  }
  for (const filter of handCards) hands[side].push(cardFor(engine, filter, pool));
  for (const selector of characters) {
    const character = characterFor(engine, selector.figment === true ? { ...selector, figment: undefined } : selector, pool, xRange ?? countRange, staged === undefined);
    if (selector.figment === true) {
      figments[side].push({ slot: { rank: "back", index: back[side].length }, printing: { kind: "figmentCopy", cardId: character.card, spark: null } });
      back[side].push(null);
    } else back[side].push(character.card);
    for (const { count, cards } of countNeeds(engine, character.predicates, character.card)) {
      const countSide = count.player === "you" ? side : opponent(side);
      for (let index = 0; index < cards; index++) {
        zones[count.zone][countSide].push(count.zone === "void" ? cardFor(engine, count.filter, pool) : SYNTHETIC.vanilla1.id);
      }
    }
  }
  for (const ability of abilities) {
    if (ability.kind !== "playCondition" || ability.condition.cond !== "cardsIn") continue;
    const condition = ability.condition;
    if (condition.zone !== "void" || condition.atLeast === undefined) continue;
    const of = condition.player === "you" ? side : opponent(side);
    const filter = condition.filter ?? {};
    const missing = playConditionVoidDeficit(engine, voids[of], filter, condition.atLeast);
    for (let index = 0; index < missing; index++) voids[of].push(cardFor(engine, filter, pool));
  }
  const deck = (of: Side): CardId[] => [...Array.from({ length: 8 }, () => SYNTHETIC.vanilla1.id), ...decks[of]];
  const sides: Record<Side, SideSetup> = {
    player: { figments: figments.player, back: back.player, void: voids.player, deck: deck("player"), ...(hands.player.length > 0 ? { hand: hands.player } : {}) },
    enemy: { figments: figments.enemy, back: back.enemy, void: voids.enemy, deck: deck("enemy"), ...(hands.enemy.length > 0 ? { hand: hands.enemy } : {}) },
  };
  sides[side] = { ...sides[side], hand: [entry, ...hands[side]], energy: LAB_ENERGY, ...(score > 0 ? { score } : {}) };
  const opening = staged === undefined && opener !== null ? opponent(side) : null;
  if (opening !== null && opener !== null) {
    const energy = Math.max(sides[opening].energy ?? 0, fixedEnergy(engine.catalog.card(opener).costs));
    sides[opening] = { ...sides[opening], hand: [opener, ...(sides[opening].hand ?? [])], energy };
  }
  const base: BoardSetup = { active: opening ?? side, phase: "day", ...sides, ...LAB_OVERRIDES[cardId] };
  // An explicitly declared rank replaces its solver occupants, including
  // figments; separately declared figments are authoritative.
  const declaredSide = (original: SideSetup | undefined, declared: SideSetup | undefined): SideSetup => ({
    ...original, ...declared,
    figments: declared?.figments ?? (original?.figments ?? []).filter(({ slot }) => declared?.[slot.rank] === undefined),
  });
  const setup: BoardSetup = staged === undefined ? base : {
    ...base,
    player: declaredSide(base.player, staged.player),
    enemy: declaredSide(base.enemy, staged.enemy),
  };
  const { state, ids } = boardState(engine.catalog, setup);
  let answering = state;
  if (opening !== null) {
    const card = ids[opening].hand[0];
    const play = engine.legalActions(state, opening).find((action) => action.kind === "play" && action.card === card && action.from === "hand");
    if (play === undefined) throw new Error(`The lab board for ${cardId} cannot play its stack opener`);
    answering = engine.apply(state, opening, play, NO_PROMPTS).state;
  }
  const playable = engine
    .legalActions(answering, side)
    .some((action) => action.kind === "play" && printedCardIdOf(state, action.card) === cardId);
  if (staged === undefined && !playable) {
    throw new Error(`The lab board for ${cardId} does not make it playable; add a lab override`);
  }
  return { setup, state, opener: opening };
}
