/**
 * The cost-composition table: every layer-6 cost change mode × every play
 * route × every additional energy shape, on synthetic cards. Expected
 * payments come from the settled rulings (rules.md § Costs, Requirements,
 * and X; § Reclaim; § Offering; RD-hv-umm2.101-1, RD-hv-umm2.419-1,
 * RD-hv-umm2.422-1), never from engine output:
 *
 * - The latest "It costs N●" set, whoever made it, is the normal ● base for
 *   hand plays, play permissions and plain Reclaim; explicit printed or
 *   granted Reclaim and Offering select their own base in its place.
 * - X (0 by Offering) and additional mandatory, optional and alternative
 *   energy add to the selected base.
 * - Every own-card increase and reduction, and every increase and reduction
 *   naming the playing player, then applies, increases before reductions, and the total
 *   floors at 0● once. A change naming the other player does not apply.
 * - A "next card" change naming the player is used up by the play.
 * - A ⍟ cost is never changed.
 *
 * Every new cost change mode or play route joins these tables
 * (phase-5-content.md recipe step 3).
 */
import { describe, expect, it } from "vitest";
import { draw } from "../draw";
import { payTo } from "../pay-to";
import { ScriptedSource } from "../../../steps/sources";
import type { EngineCardDefinition } from "../../../catalog";
import { abandonXCost, additionalCost, choiceCost, energy, energyX, event, discardCostFilter, x, keyword, optionalCost, pointsCost, reclaim } from "../../../dsl/builders";
import type { Ability, CardCost } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import type { Answer, Prompt } from "../../../prompts/types";
import type { PlayRoute, PlayZone } from "../../../rules/timing";
import type { EffectId, InstanceId, Side } from "../../../state/ids";
import { opponent } from "../../../state/ids";
import type { BattleState, CardCostMode, FloatingEffect } from "../../../state/types";
import type { AnswerSource } from "../../../steps/types";
import { boardState, placeFigment } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";

/** The subject's printed ● cost. */
const PRINTED = 3;
/** Its printed "Reclaim 5●" cost. */
const RECLAIM = 5;
/** A granted "gains Reclaim 0●" cost. */
const GRANTED = 0;
/** Its "To play this card, pay 1⍟." */
const POINTS = 1;
/** The X every X prompt chooses. */
const X = 2;
const ENERGY = 30;
const SCORE = 5;
const PLAYER: Side = "player";

/** Every layer-6 cost change shape: each `cardCost` mode, and each sign and scope of a player `cost` change. */
type Mode = `cardCost.${CardCostMode}` | "cost.increase" | "cost.reduction" | "cost.nextIncrease" | "cost.nextReduction";
/** Relative to the playing player. */
type Who = "self" | "opponent";

/**
 * One cost change, in timestamp order. `who` is the controller of a
 * `cardCost` change, and the player a `cost` change names; `by` overrides
 * the controller of a `cost` change. Amounts are positive.
 */
interface Step {
  readonly mode: Mode;
  readonly amount: number;
  readonly who: Who;
  readonly by?: Who;
}
interface ModeCase {
  readonly name: string;
  readonly steps: readonly Step[];
}
const step = (mode: Mode, amount: number, who: Who = "self", by?: Who): Step => ({ mode, amount, who, ...(by === undefined ? {} : { by }) });

/** Two timestamped sets around an own-card increase, with a tax and a reduction (RD-hv-umm2.422-1 evidence). */
const FULL_STACK: ModeCase = {
  name: "set 4, own +2, set 2, +3, -1",
  steps: [step("cardCost.set", 4), step("cardCost.increase", 2), step("cardCost.set", 2), step("cost.increase", 3), step("cost.reduction", 1)],
};

/** Exhaustive over `Mode`: a new cost change mode fails typecheck until it joins the table. */
const MODES: { readonly [M in Mode]: readonly [ModeCase, ...ModeCase[]] } = {
  "cardCost.set": [
    { name: "own set 2", steps: [step("cardCost.set", 2)] },
    { name: "opponent's set 2", steps: [step("cardCost.set", 2, "opponent")] },
    { name: "set 6 then set 2", steps: [step("cardCost.set", 6), step("cardCost.set", 2, "opponent")] },
    { name: "set 2 then set 6", steps: [step("cardCost.set", 2, "opponent"), step("cardCost.set", 6)] },
  ],
  "cardCost.increase": [
    { name: "own +2", steps: [step("cardCost.increase", 2)] },
    { name: "opponent's +2", steps: [step("cardCost.increase", 2, "opponent")] },
    { name: "+2 then set 0", steps: [step("cardCost.increase", 2, "opponent"), step("cardCost.set", 0)] },
  ],
  "cardCost.reduce": [
    { name: "own -2", steps: [step("cardCost.reduce", 2)] },
    { name: "opponent's -2", steps: [step("cardCost.reduce", 2, "opponent")] },
    { name: "-2 and -1 stack", steps: [step("cardCost.reduce", 2), step("cardCost.reduce", 1, "opponent")] },
    { name: "-9 to the floor", steps: [step("cardCost.reduce", 9)] },
    { name: "-2 then set 4, own +1 and +1", steps: [step("cardCost.reduce", 2), step("cardCost.set", 4), step("cardCost.increase", 1), step("cost.increase", 1)] },
    { name: "-2 with -1 naming the opponent", steps: [step("cardCost.reduce", 2, "opponent"), step("cost.reduction", 1, "opponent")] },
  ],
  "cost.increase": [
    { name: "own +1", steps: [step("cost.increase", 1)] },
    { name: "+1 the opponent places", steps: [step("cost.increase", 1, "self", "opponent")] },
    { name: "+1 naming the opponent", steps: [step("cost.increase", 1, "opponent")] },
    { name: "set 0 then +1", steps: [step("cardCost.set", 0), step("cost.increase", 1)] },
  ],
  "cost.reduction": [
    { name: "own -1", steps: [step("cost.reduction", 1)] },
    { name: "-1 naming the opponent", steps: [step("cost.reduction", 1, "opponent")] },
    { name: "-9 to the floor", steps: [step("cost.reduction", 9)] },
    { name: "set 0, -1 then +1 floors once", steps: [step("cardCost.set", 0), step("cost.reduction", 1), step("cost.increase", 1)] },
    FULL_STACK,
  ],
  "cost.nextIncrease": [
    { name: "own next +1", steps: [step("cost.nextIncrease", 1)] },
    { name: "next +1 naming the opponent", steps: [step("cost.nextIncrease", 1, "opponent")] },
  ],
  "cost.nextReduction": [
    { name: "own next -2", steps: [step("cost.nextReduction", 2)] },
    { name: "next -2 naming the opponent", steps: [step("cost.nextReduction", 2, "opponent")] },
    { name: "set 0 then next -2, used up at 0", steps: [step("cardCost.set", 0), step("cost.nextReduction", 2)] },
  ],
};

/** The subject's own play abilities. */
type Shape = "plain" | "offering" | "keywordReclaim" | "printedReclaim";

/** One way to play the subject by a route. */
interface RouteVariant {
  readonly name: string;
  readonly shape: Shape;
  readonly from: PlayZone;
  /** A play permission naming the subject. */
  readonly permission: boolean;
  /** A granted "Reclaim 0●" with costs. */
  readonly granted: boolean;
  /** The route prompt's answer when the subject offers two routes. */
  readonly choose: number | null;
  /** A replacement route's ● base; `null` uses the normal base. */
  readonly replacement: number | null;
  /** Whether the route's costs include the subject's X (Offering's X is 0). */
  readonly x: boolean;
}
const variant = (name: string, shape: Shape, from: PlayZone, options: Partial<RouteVariant> = {}): RouteVariant => ({
  name, shape, from, permission: false, granted: false, choose: null, replacement: null, x: true, ...options,
});

/** Exhaustive over `PlayRoute`: a new play route fails typecheck until it joins the table. */
const ROUTES: { readonly [R in PlayRoute]: readonly [RouteVariant, ...RouteVariant[]] } = {
  hand: [variant("hand", "plain", "hand"), variant("hand chosen over Offering", "offering", "hand", { choose: 0 })],
  offering: [variant("Offering chosen over hand", "offering", "hand", { choose: 1, replacement: 0, x: false })],
  permission: [
    variant("permission", "plain", "void", { permission: true }),
    variant("permission chosen over Reclaim 5●", "printedReclaim", "void", { permission: true, choose: 0 }),
  ],
  reclaim: [
    variant("plain Reclaim", "keywordReclaim", "void"),
    variant("printed Reclaim 5●", "printedReclaim", "void", { replacement: RECLAIM }),
    variant("Reclaim 5● chosen over permission", "printedReclaim", "void", { permission: true, choose: 1, replacement: RECLAIM }),
    variant("granted Reclaim 0●", "plain", "void", { granted: true, replacement: GRANTED }),
  ],
};

/** The subject's additional energy shapes. */
type Extra = "none" | "mandatory" | "optionalPaid" | "optionalDeclined" | "choice" | "x" | "discardMin" | "abandonCount";
interface ExtraSetup {
  readonly abilities: readonly Ability[];
  /** Energy the extra adds as paid in the row; X's is `X` where the route includes X. */
  readonly paid: number;
  /** The least energy the extra adds, for affordability. */
  readonly least: number;
  readonly accept?: boolean;
}
const EXTRAS: { readonly [E in Extra]: ExtraSetup } = {
  abandonCount: { abilities: [additionalCost(abandonXCost({ min: 1, selector: { figment: true } }))], paid: 0, least: 0 },
  none: { abilities: [], paid: 0, least: 0 },
  /** "To play this card, pay 1●." */
  mandatory: { abilities: [additionalCost(energy(1))], paid: 1, least: 1 },
  /** "You may pay 1● to play this card.", accepted. */
  optionalPaid: { abilities: [additionalCost(optionalCost(energy(1)))], paid: 1, least: 0, accept: true },
  optionalDeclined: { abilities: [additionalCost(optionalCost(energy(1)))], paid: 0, least: 0, accept: false },
  /** "To play this card, pay 1● or 3●.", choosing 3●. */
  choice: { abilities: [additionalCost(choiceCost([energy(1)], [energy(3)]))], paid: 3, least: 1 },
  /** A printed, printed Reclaim or granted Reclaim cost of N● plus X. */
  x: { abilities: [], paid: 0, least: 0 },
  /** Shared X● and a least-2 discard-X cost, followed by drawing that X. */
  discardMin: { abilities: [additionalCost(discardCostFilter({}, { count: "x", min: X })), event(draw(x()))], paid: 0, least: 0 },
};

const withX = (amount: number, extra: Extra): CardCost[] => [energy(amount), ...(extra === "x" || extra === "discardMin" ? [energyX(0)] : [])];
const SHAPE_ABILITIES: { readonly [S in Shape]: (extra: Extra) => readonly Ability[] } = {
  plain: () => [],
  offering: () => [keyword("offering")],
  keywordReclaim: () => [keyword("reclaim")],
  printedReclaim: (extra) => [reclaim(...withX(RECLAIM, extra))],
};

const SHAPES = Object.keys(SHAPE_ABILITIES) as Shape[];
const EXTRA_NAMES = Object.keys(EXTRAS) as Extra[];

/** A 3● event with its shape's play abilities, "To play this card, pay 1⍟." and its extra. */
function subject(shape: Shape, extra: Extra, index: number): EngineCardDefinition {
  return {
    id: syntheticId(0x42900 + index), cardType: "event", costs: withX(PRINTED, extra), spark: null, subtype: "", speed: "standard", status: "authored",
    abilities: () => [...SHAPE_ABILITIES[shape](extra), additionalCost(pointsCost(POINTS)), ...EXTRAS[extra].abilities],
  };
}
const subjectFor = (shape: Shape, extra: Extra) => subject(shape, extra, SHAPES.indexOf(shape) * EXTRA_NAMES.length + EXTRA_NAMES.indexOf(extra));
const engine = createEngine(testCatalog(SHAPES.flatMap((shape) => EXTRA_NAMES.map((extra) => subjectFor(shape, extra)))));
const deck = Array.from({ length: 4 }, () => v.vanilla1.id);

/** Answers each play prompt by its role from the row; any other prompt fails the row. */
class RowAnswers implements AnswerSource {
  constructor(private readonly route: RouteVariant, private readonly extra: ExtraSetup) {}
  answer(prompt: Prompt): Answer {
    const { role } = prompt.purpose;
    if ((role === "playRoute" || role === "voidRoute") && this.route.choose !== null) return this.route.choose;
    if (role === "chooseX") return X;
    if (role === "chooseCost") return 1;
    if (role === "optionalCost" && this.extra.accept !== undefined) return this.extra.accept;
    if (role === "abandonCost" && prompt.kind === "chooseCards") return prompt.candidates.slice(0, X);
    if (role === "discardCost" && prompt.kind === "chooseCards") {
      expect(prompt).toMatchObject({ min: X, max: X });
      return prompt.candidates.slice(0, X);
    }
    if (role === "offeringCost" && prompt.kind === "chooseCards") return [prompt.candidates.find((id) => id !== null)!];
    throw new Error(`unexpected ${role} prompt`);
  }
}

const CARD_COST_MODES: { readonly [M in CardCostMode as `cardCost.${M}`]: M } = { "cardCost.set": "set", "cardCost.increase": "increase", "cardCost.reduce": "reduce" };
const NEXT_MODES: readonly Mode[] = ["cost.nextIncrease", "cost.nextReduction"];
const INCREASES: readonly Mode[] = ["cost.increase", "cost.nextIncrease"];

/** The subject placed for `route`, with the route's grants and then the row's changes floating in timestamp order. */
function arranged(route: RouteVariant, extra: Extra, steps: readonly Step[], available = ENERGY) {
  const card = subjectFor(route.shape, extra);
  const hand = extra === "discardMin" ? [v.vanilla1.id, v.vanilla2.id] : [v.vanilla1.id];
  const { state, ids } = boardState(engine.catalog, {
    active: PLAYER, phase: "day",
    [PLAYER]: { hand: route.from === "hand" ? [card.id, ...hand] : hand, void: route.from === "void" ? [card.id] : [], back: [v.vanilla1.id], energy: available, score: SCORE, deck },
    [opponent(PLAYER)]: { back: [v.vanilla1.id], score: SCORE, deck },
  });
  if (extra === "abandonCount") for (const index of [0, 1]) placeFigment(state, PLAYER, { rank: "front", index }, { kind: "figmentCopy", cardId: v.vanilla1.id, spark: null });
  const id = route.from === "hand" ? ids[PLAYER].hand[0] : ids[PLAYER].void[0];
  const sources: Record<Who, InstanceId> = { self: ids[PLAYER].back[0]!, opponent: ids[opponent(PLAYER)].back[0]! };
  const side = (who: Who): Side => (who === "self" ? PLAYER : opponent(PLAYER));
  const changes: { readonly by: Who; readonly change: FloatingEffect["change"] }[] = [
    ...(route.permission ? [{ by: "self" as const, change: { kind: "playFrom", player: PLAYER, zone: "void", instance: id, filter: {}, next: false } as const }] : []),
    ...(route.granted
      ? [{ by: "self" as const, change: { kind: "keyword", instance: id, keyword: "reclaim", gains: true, reclaimCosts: withX(GRANTED, extra) } as const }]
      : []),
    ...steps.map((s) => ({
      by: s.by ?? s.who,
      change: s.mode.startsWith("cardCost.")
        ? ({ kind: "cardCost", instance: id, mode: CARD_COST_MODES[s.mode as `cardCost.${CardCostMode}`], amount: s.amount } as const)
        : ({ kind: "cost", player: side(s.who), filter: {}, amount: INCREASES.includes(s.mode) ? s.amount : -s.amount, next: NEXT_MODES.includes(s.mode) } as const),
    })),
  ];
  const floating = changes.map(({ by, change }, index): FloatingEffect => ({
    id: `e${state.nextEffect + index}`, controller: side(by), source: sources[by], timestamp: index + 1, expiry: { at: "endOfTurn" }, change,
  }));
  const nextIds = floating.slice(floating.length - steps.length).filter((_, index) => NEXT_MODES.includes(steps[index].mode) && steps[index].who === "self").map((effect) => effect.id);
  const prepared: BattleState = { ...state, floating: [...state.floating, ...floating], nextEffect: state.nextEffect + floating.length };
  return { state: prepared, id, nextIds };
}

/** The energy the rulings require for the row, with `added` energy from its extra and `x` from its X. */
function ruledEnergy(steps: readonly Step[], route: RouteVariant, added: number, x: number): number {
  const sets = steps.filter((s) => s.mode === "cardCost.set");
  const normal = sets.length > 0 ? sets[sets.length - 1].amount : PRINTED;
  const base = route.replacement ?? normal;
  const applies = (s: Step) => s.mode === "cardCost.increase" || s.mode === "cardCost.reduce" || s.who === "self";
  const increases = steps.filter((s) => applies(s) && (s.mode === "cardCost.increase" || INCREASES.includes(s.mode))).reduce((sum, s) => sum + s.amount, 0);
  const reductions = steps.filter((s) => applies(s) && (s.mode === "cardCost.reduce" || s.mode === "cost.reduction" || s.mode === "cost.nextReduction")).reduce((sum, s) => sum + s.amount, 0);
  return Math.max(0, base + (route.x ? x : 0) + added + increases - reductions);
}

interface Outcome {
  readonly extra: Extra;
  readonly energy: number;
  readonly points: number;
  readonly opponentPoints: number;
  readonly reclaimed: boolean;
  readonly offering: boolean;
  readonly nextLeft: readonly EffectId[];
  readonly discarded?: number;
  readonly drawn?: number;
}

function observed(route: RouteVariant, extra: Extra, steps: readonly Step[]): Outcome {
  const { state, id, nextIds } = arranged(route, extra, steps);
  const result = engine.apply(state, PLAYER, { kind: "play", card: id, from: route.from }, new RowAnswers(route, EXTRAS[extra]));
  expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  if (extra === "abandonCount") expect(result.events.filter((event) => event.kind === "abandoned")).toHaveLength(X);
  if (extra === "discardMin") {
    const discarded = result.events.flatMap((event) => event.kind === "discarded" ? [event.instance] : []);
    expect([...discarded].sort()).toEqual(state.sides[PLAYER].hand.filter((card) => card !== id).sort());
    for (const card of discarded) expect(result.state.instances[card].zone).toBe("void");
    expect(result.state.sides[PLAYER].deck).toHaveLength(state.sides[PLAYER].deck.length - X);
  }
  return {
    extra,
    ...(extra === "discardMin" ? {
      discarded: result.events.filter((event) => event.kind === "discarded").length,
      drawn: result.state.turnLog.drawn[PLAYER] - state.turnLog.drawn[PLAYER],
    } : {}),
    energy: ENERGY - result.state.sides[PLAYER].currentEnergy,
    points: SCORE - result.state.sides[PLAYER].score,
    opponentPoints: SCORE - result.state.sides[opponent(PLAYER)].score,
    reclaimed: result.state.instances[id].status.playedViaReclaim,
    offering: result.state.instances[id].status.offering,
    nextLeft: nextIds.filter((effect) => result.state.floating.some((floating) => floating.id === effect)),
  };
}

function ruled(route: RouteVariant, extra: Extra, steps: readonly Step[], routeName: PlayRoute): Outcome {
  return {
    extra,
    ...(extra === "discardMin" ? { discarded: X, drawn: X } : {}),
    energy: ruledEnergy(steps, route, EXTRAS[extra].paid, extra === "x" || extra === "discardMin" ? X : 0),
    points: POINTS,
    opponentPoints: 0,
    reclaimed: routeName === "reclaim",
    offering: routeName === "offering",
    nextLeft: [],
  };
}

/** Whether the subject is offered with exactly `available` energy. */
function offered(route: RouteVariant, extra: Extra, steps: readonly Step[], available: number): boolean {
  const { state, id } = arranged(route, extra, steps, available);
  return engine.legalActions(state, PLAYER).some((action) => action.kind === "play" && action.card === id && action.from === route.from);
}

const ROUTE_ROWS = (Object.entries(ROUTES) as [PlayRoute, readonly RouteVariant[]][]).flatMap(([name, variants]) => variants.map((route) => ({ name, route })));
const ROWS = (Object.entries(MODES) as [Mode, readonly ModeCase[]][]).flatMap(([mode, cases]) =>
  cases.flatMap((modeCase) => ROUTE_ROWS.map(({ name, route }) => ({ label: `${mode}: ${modeCase.name} by ${route.name}`, steps: modeCase.steps, name, route }))),
);
const BASELINE = ROUTE_ROWS.map(({ name, route }) => ({ label: `no cost change by ${route.name}`, steps: [] as readonly Step[], name, route }));

describe("cost composition table", () => {
  it.each([...BASELINE, ...ROWS])("$label pays the ruled energy and ⍟ for every extra", ({ steps, name, route }) => {
    const extras = EXTRA_NAMES.filter((extra) => extra !== "discardMin" || route.x);
    const actual = extras.map((extra) => observed(route, extra, steps));
    expect(actual).toEqual(extras.map((extra) => ruled(route, extra, steps, name)));
  });

  it.each([...BASELINE, ...ROWS].filter(({ route }) => route.choose === null))("$label is offered from its least ruled energy", ({ steps, route }) => {
    const affordable = EXTRA_NAMES.map((extra) => {
      const least = ruledEnergy(steps, route, EXTRAS[extra].least, extra === "discardMin" ? X : 0);
      return { extra, atLeast: offered(route, extra, steps, least), belowLeast: least > 0 && offered(route, extra, steps, least - 1) };
    });
    expect(affordable).toEqual(EXTRA_NAMES.map((extra) => ({ extra, atLeast: true, belowLeast: false })));
  });
  it.each([...BASELINE, ...ROWS].filter(({ name }) => name === "offering"))("$label withholds Offering X=0 but permits normal discard-min play", ({ steps, route }) => {
    const { state, id } = arranged(route, "discardMin", steps);
    const answers = new RowAnswers({ ...route, choose: 0 }, EXTRAS.discardMin);
    let routeObserved = false;
    const prepared = { ...state, config: { ...state.config, autoAnswerForcedPrompts: false } };
    const result = engine.apply(prepared, PLAYER, { kind: "play", card: id, from: "hand" }, {
      answer(prompt) {
        if (prompt.purpose.role === "playRoute" && prompt.kind === "chooseMode") {
          routeObserved = true;
          expect(prompt.options.find((option) => option.mode === 0)?.legal).toBe(true);
          expect(prompt.options.find((option) => option.mode === 1)?.legal).toBe(false);
        }
        return answers.answer(prompt);
      },
    });
    expect(routeObserved).toBe(true);
    expect(result.state.instances[id].status.offering).toBe(false);
    expect(ENERGY - result.state.sides[PLAYER].currentEnergy).toBe(ruledEnergy(steps, { ...route, replacement: null, x: true }, 0, X));
    expect(result.events.filter((event) => event.kind === "discarded")).toHaveLength(X);
    expect(result.state.turnLog.drawn[PLAYER] - state.turnLog.drawn[PLAYER]).toBe(X);
    expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  });
});

describe("cost composition anchors from the rulings", () => {
  const route = (name: PlayRoute, index = 0) => ROUTES[name][index];
  const anchors: readonly { readonly ruling: string; readonly route: RouteVariant; readonly extra: Extra; readonly steps: readonly Step[]; readonly energy: number }[] = [
    { ruling: "rules.md: a normal play set to 0● pays 1● under a 1● tax", route: route("hand"), extra: "none", steps: [step("cardCost.set", 0), step("cost.increase", 1)], energy: 1 },
    { ruling: "RD-hv-umm2.422-1: set 2● / Reclaim 5● pays 5●", route: route("reclaim", 1), extra: "none", steps: [step("cardCost.set", 2)], energy: 5 },
    { ruling: "RD-hv-umm2.422-1: Offering / set 2● / optional 1● pays 1●", route: route("offering"), extra: "optionalPaid", steps: [step("cardCost.set", 2)], energy: 1 },
    { ruling: "RD-hv-umm2.422-1: Reclaim 0● / set 0● / optional 1● pays 1●", route: route("reclaim", 3), extra: "optionalPaid", steps: [step("cardCost.set", 0)], energy: 1 },
    {
      ruling: "RD-hv-umm2.422-1: latest set 2● with own +2●, +3● and -1● pays 6● by permission",
      route: route("permission"), extra: "none", steps: FULL_STACK.steps, energy: 6,
    },
    {
      ruling: "RD-hv-umm2.422-1: the same changes pay 9● by Reclaim 5●",
      route: route("reclaim", 1), extra: "none", steps: FULL_STACK.steps, energy: 9,
    },
    { ruling: "RD-hv-umm2.102-2: an own -2● reduces printed Reclaim 5● to 3●", route: route("reclaim", 1), extra: "none", steps: [step("cardCost.reduce", 2)], energy: 3 },
    { ruling: "RD-hv-umm2.102-2: own -2● after a 1● tax on a 3● hand play pays 2●", route: route("hand"), extra: "none", steps: [step("cardCost.reduce", 2), step("cost.increase", 1)], energy: 2 },
  ];
  it.each(anchors)("$ruling", ({ route: anchor, extra, steps, energy }) => {
    expect(ruledEnergy(steps, anchor, EXTRAS[extra].paid, 0)).toBe(energy);
    expect(observed(anchor, extra, steps).energy).toBe(energy);
  });
});


describe("fixed resolving-payment cost composition", () => {
  const subject: EngineCardDefinition = {
    ...v.event0, id: syntheticId(0x43890), status: "authored", costs: [energy(3)],
    abilities: () => [event(payTo({ energy: 2, discard: 1 }, draw(1)))],
  };
  const paymentEngine = createEngine(testCatalog([subject]));
  it.each([
    { change: { kind: "cardCost", mode: "increase", amount: 2 } as const, outer: 5 },
    { change: { kind: "cost", amount: -2, next: false, filter: {} } as const, outer: 1 },
  ])("changes the parent cost to $outer and leaves the resolving payment at 2", ({ change, outer }) => {
    const { state, ids } = boardState(paymentEngine.catalog, { active: PLAYER, phase: "day", player: { hand: [subject.id, v.vanilla1.id, v.vanilla2.id], back: [v.vanilla1.id], energy: 10, deck }, enemy: { deck } });
    const target = ids.player.hand[0];
    const prepared: BattleState = { ...state, nextEffect: state.nextEffect + 1, floating: [{ id: `e${state.nextEffect}`, controller: PLAYER, source: ids.player.back[0]!, timestamp: 1, expiry: { at: "endOfTurn" }, change: change.kind === "cardCost" ? { ...change, instance: target } : { ...change, player: PLAYER } }] };
    const result = paymentEngine.apply(prepared, PLAYER, { kind: "play", card: target, from: "hand" }, new ScriptedSource([true, [ids.player.hand[1]]]));
    expect(result.state.sides.player.currentEnergy).toBe(10 - outer - 2);
    expect(result.events.filter((e) => e.kind === "energyChanged" && e.cause === "payment").map((e) => e.kind === "energyChanged" ? e.change : 0)).toEqual([-outer, -2]);
    expect(result.state.sides.player.deck).toHaveLength(3);
  });
  it("resolves an affordable parent without offering an unaffordable inner payment", () => {
    const { state, ids } = boardState(paymentEngine.catalog, { active: PLAYER, phase: "day", player: { hand: [subject.id, v.vanilla1.id], energy: 3, deck }, enemy: { deck } });
    const result = paymentEngine.apply(state, PLAYER, { kind: "play", card: ids.player.hand[0], from: "hand" }, new ScriptedSource([]));
    expect(result.state.sides.player.currentEnergy).toBe(0);
    expect(result.state.sides.player.hand).toEqual(ids.player.hand.slice(1));
    expect(result.state.sides.player.deck).toEqual(ids.player.deck);
  });
});
