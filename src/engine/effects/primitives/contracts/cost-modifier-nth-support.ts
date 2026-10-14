/** Synthetic public witnesses for static nth cost qualification and chosen-route composition. */
import type { EngineCardDefinition } from "../../../catalog";
import { createEngine, type Engine } from "../../../engine";
import { additionalCost, choiceCost, energy, energyX, event, everyIn, keyword, optionalCost, pointsCost, reclaim, staticAbility } from "../../../dsl/builders";
import type { Ability } from "../../../dsl/types";
import type { Answer } from "../../../prompts/types";
import { playRoutes, type PlayRoute, type PlayZone } from "../../../rules/timing";
import { SIDES, opponent, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { boardState, type SideSetup } from "../../../testing/board";
import { passUntil } from "../../../testing/trigger-harness";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { costModifier, costModifierNth } from "../cost-modifier";
import { gainPoints } from "../gain-points";
import { grantReclaim } from "../grant-reclaim";
import { playFromZone } from "../play-from-zone";
import { ruleModifier } from "../rule-modifier";

export function nthCard(index: number, fields: Partial<EngineCardDefinition> = {}): EngineCardDefinition {
  return { ...v.vanilla2, id: syntheticId(0x104000 + index), status: "authored", abilities: () => [], ...fields };
}
export const nthDeck = Array.from({ length: 20 }, () => v.vanilla1.id);
export function nthFixture(side: Side, definitions: readonly EngineCardDefinition[], mine: SideSetup, theirs: SideSetup = {}) {
  const engine = createEngine(testCatalog(definitions));
  return { engine, ...boardState(engine.catalog, { active: side, phase: "day",
    [side]: { deck: nthDeck, energy: 30, ...mine }, [opponent(side)]: { deck: nthDeck, energy: 30, ...theirs } }) };
}
export function nthSettle(engine: Engine, state: BattleState, source: AnswerSource = NO_PROMPTS): BattleState {
  return passUntil(engine, state, next => next.stack.length === 0 && next.triggerQueue.length === 0, source).state;
}
export function nthPlay(engine: Engine, state: BattleState, side: Side, card: InstanceId, from: PlayZone = "hand", source: AnswerSource = NO_PROMPTS) {
  const result = engine.apply(state, side, { kind: "play", card, from }, source);
  return { ...result, state: nthSettle(engine, result.state, source) };
}

const NTH_ROUTES = [
  { name: "hand", route: "hand", from: "hand", set: 7, reduce: 8 },
  { name: "permission", route: "permission", from: "void", set: 7, reduce: 8 },
  { name: "plain Reclaim", route: "reclaim", from: "void", set: 7, reduce: 8 },
  { name: "printed Reclaim", route: "reclaim", from: "void", set: 12, reduce: 11 },
  { name: "granted Reclaim", route: "reclaim", from: "void", set: 11, reduce: 10 },
  { name: "Offering", route: "offering", from: "hand", set: 5, reduce: 4 },
  { name: "event alternative", route: "eventAlternative", from: "hand", set: 6, reduce: 5 },
] as const satisfies readonly { name: string; route: PlayRoute; from: PlayZone; set: number; reduce: number }[];
export const NTH_COST_ROWS = SIDES.flatMap(side => NTH_ROUTES.flatMap(route => (["set", "reduce"] as const).map(mode => ({
  side, route, mode, label: `${side} nth ${mode} by ${route.name}`, expected: route[mode],
}))));
/** Payments derived from RD-hv-umm2.104-1: base + chosen X + 3 additional energy + tax3 - reduction1. */
export function observeNthCostRow(row: typeof NTH_COST_ROWS[number]) {
  const { side, route, mode } = row;
  const filter = { cardType: "event", costAtLeast: 2, costAtMost: 2 } as const;
  const extras: Ability[] = [additionalCost(energy(1), optionalCost(energy(1)), choiceCost([energy(1)], [pointsCost(2)]), pointsCost(1)), event(gainPoints(0))];
  if (route.name === "plain Reclaim") extras.push(keyword("reclaim"));
  if (route.name === "printed Reclaim") extras.push(reclaim(energy(5), energyX(0)));
  if (route.name === "Offering") extras.push(keyword("offering"));
  const subject = nthCard(100, { cardType: "event", spark: null, subtype: "", speed: "fast", costs: [energy(2), energyX(0)], abilities: () => extras });
  const provider = nthCard(101, { costs: [energy(0)], abilities: () => [
    staticAbility(costModifierNth("you", filter, 1, mode === "set" ? { set: 0 } : { reduce: 1 })),
    staticAbility(costModifier("you", filter, 3)), staticAbility(costModifier("you", filter, -1)),
    ...(route.name === "permission" ? [staticAbility(playFromZone("void", filter))] : []),
    ...(route.name === "event alternative" ? [staticAbility(ruleModifier({ rule: "eventAlternative", energy: 1 }))] : []),
  ] });
  const grant = nthCard(102, { cardType: "event", spark: null, costs: [energy(0)], abilities: () => [event(grantReclaim(everyIn("void", filter), { costs: [energy(4), energyX(0)] }))] });
  const f = nthFixture(side, [subject, provider, grant], {
    back: [provider.id], hand: [...(route.from === "hand" ? [subject.id] : []), v.vanilla0.id, ...(route.name === "granted Reclaim" ? [grant.id] : [])],
    void: route.from === "void" ? [subject.id] : [], score: 5,
  });
  let state = f.state;
  if (route.name === "granted Reclaim") state = nthPlay(f.engine, state, side, f.ids[side].hand[1]).state;
  const id = route.from === "hand" ? f.ids[side].hand[0] : f.ids[side].void[0];
  const selected = playRoutes(state, f.engine.catalog, id, route.from).indexOf(route.route);
  const source: AnswerSource = { answer(prompt): Answer {
    switch (prompt.purpose.role) {
      case "voidRoute": case "playRoute": return selected;
      case "chooseX": return 2;
      case "optionalCost": return true;
      case "chooseCost": return 0;
      case "offeringCost": if (prompt.kind === "chooseCards") return [f.ids[side].hand[1]];
    }
    throw new Error(`Unexpected nth composition prompt ${prompt.purpose.role}`);
  } };
  let boundX: number | null | undefined;
  const result = f.engine.apply(state, side, { kind: "play", card: id, from: route.from }, source, (committed, step) => {
    if (step.kind === "play") boundX = committed.stack.find(item => item.kind === "card" && item.instance === id)?.x;
  });
  return { energy: state.sides[side].currentEnergy - result.state.sides[side].currentEnergy,
    points: state.sides[side].score - result.state.sides[side].score,
    otherEnergy: result.state.sides[opponent(side)].currentEnergy,
    played: result.state.turnLog.played[side].filter(record => record.instance === id).length,
    reclaimed: result.state.instances[id].status.playedViaReclaim,
    offering: result.state.instances[id].status.offering,
    x: boundX,
  };
}
