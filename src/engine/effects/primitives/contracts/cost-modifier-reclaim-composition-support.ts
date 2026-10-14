/** Selected-route payment rows use the public static producer, never a fabricated floating Reclaim change. */
import type { Ability } from "../../../dsl/types";
import { additionalCost, alternativeCost, choiceCost, energy, energyX, event, everyIn, giveOpponentPointsCost, keyword, optionalCost, pointsCost, reclaim, staticAbility } from "../../../dsl/builders";
import { SIDES, opponent } from "../../../state/ids";
import type { ContinuousChange } from "../../../state/types";
import { playRoutes, type PlayRoute } from "../../../rules/timing";
import type { AnswerSource } from "../../../steps/types";
import { SYNTHETIC as v } from "../../../testing/synthetic-cards";
import { invariantViolations } from "../../../testing/invariants";
import { costModifierReclaim } from "../cost-modifier-reclaim";
import { costModifier } from "../cost-modifier";
import { grantReclaim } from "../grant-reclaim";
import { gainPoints } from "../gain-points";
import { playFromZone } from "../play-from-zone";
import { ruleModifier } from "../rule-modifier";
import { reclaimCard, reclaimFixture, reclaimPlay } from "./cost-modifier-reclaim-support";

type RouteCase<Route extends PlayRoute> = { name: string; route: Route; from: "hand" | "void"; base: number };
const ROUTES = {
  hand: [{ name: "hand", route: "hand", from: "hand", base: 3 }],
  permission: [
    { name: "permission", route: "permission", from: "void", base: 3 },
    { name: "permission over Reclaim", route: "permission", from: "void", base: 3 },
  ],
  reclaim: [
    { name: "plain Reclaim", route: "reclaim", from: "void", base: 3 },
    { name: "printed Reclaim", route: "reclaim", from: "void", base: 5 },
    { name: "granted Reclaim", route: "reclaim", from: "void", base: 4 },
  ],
  offering: [{ name: "Offering", route: "offering", from: "hand", base: 0 }],
  eventAlternative: [{ name: "event alternative", route: "eventAlternative", from: "hand", base: 1 }],
  alternativeCost: [{ name: "card-defined alternative", route: "alternativeCost", from: "hand", base: 0 }],
} as const satisfies { readonly [Route in PlayRoute]: readonly [RouteCase<Route>, ...RouteCase<Route>[]] };
const MODES = { set: "set", reduce: "reduce", both: "both" } as const satisfies {
  readonly [Mode in Extract<ContinuousChange, { kind: "reclaimCost" }>["mode"] | "both"]: Mode
};
const EXTRAS = [
  { name: "fixed", energy: 0 }, { name: "mandatory", energy: 1 },
  { name: "optional paid", energy: 1 }, { name: "optional declined", energy: 0 },
  { name: "choice", energy: 3 }, { name: "X", energy: 0 },
] as const;
export const RECLAIM_COST_ROWS = SIDES.flatMap(side => Object.values(ROUTES).flat().flatMap(route => EXTRAS.flatMap(extra =>
  Object.values(MODES).map(mode => {
    const x = extra.name === "X" ? route.route === "offering" || route.route === "eventAlternative" || route.route === "alternativeCost" ? 0 : 2 : null;
    const selected = route.route === "reclaim";
    const base = selected && mode !== "reduce" ? 0 : route.base;
    return { side, route, extra, mode, label: `${side} Reclaim ${mode} by ${route.name}, ${extra.name}`,
      expected: { energy: Math.max(0, base + (x ?? 0) + extra.energy + 2 - 1 - (selected && mode !== "set" ? 1 : 0)),
        points: 1, otherEnergy: 30, opponentPoints: route.route === "alternativeCost" ? 5 : 0, reclaimed: selected, offering: route.route === "offering", x, violations: [] } };
  }))));

export function observeReclaimCostRow(row: typeof RECLAIM_COST_ROWS[number]) {
  const { side, route, extra, mode } = row;
  const hasX = extra.name === "X";
  const abilities: Ability[] = [additionalCost(pointsCost(1)), event(gainPoints(0))];
  if (extra.name === "mandatory") abilities.push(additionalCost(energy(1)));
  if (extra.name.startsWith("optional")) abilities.push(additionalCost(optionalCost(energy(1))));
  if (extra.name === "choice") abilities.push(additionalCost(choiceCost([energy(1)], [energy(3)])));
  if (route.name === "plain Reclaim") abilities.push(keyword("reclaim"));
  if (route.name === "printed Reclaim" || route.name === "permission over Reclaim") abilities.push(reclaim(energy(2), energy(3), ...(hasX ? [energyX(0)] : [])));
  if (route.route === "offering") abilities.push(keyword("offering"));
  if (route.route === "alternativeCost") abilities.push(alternativeCost(energy(0), giveOpponentPointsCost(5)));
  const subject = reclaimCard(100, { speed: "fast", costs: [energy(1), energy(2), ...(hasX ? [energyX(0)] : [])], abilities: () => abilities });
  const provider = reclaimCard(101, { ...v.vanilla0, id: reclaimCard(101).id, status: "authored", abilities: () => [
    ...(mode !== "reduce" ? [staticAbility(costModifierReclaim("you", { set: 0 }))] : []),
    ...(mode !== "set" ? [staticAbility(costModifierReclaim("you", { reduce: 1 }))] : []),
    staticAbility(costModifier("you", {}, 2)), staticAbility(costModifier("you", {}, -1)),
    ...(route.route === "permission" ? [staticAbility(playFromZone("void", {}))] : []),
    ...(route.route === "eventAlternative" ? [staticAbility(ruleModifier({ rule: "eventAlternative", energy: 1 }))] : []),
  ] });
  const grant = reclaimCard(102, { costs: [energy(0)], abilities: () => [event(grantReclaim(everyIn("void"), { costs: [energy(1), energy(3), ...(hasX ? [energyX(0)] : [])] }))] });
  const f = reclaimFixture(side, [subject, provider, grant], { back: [provider.id],
    hand: [...(route.from === "hand" ? [subject.id] : []), v.vanilla0.id, ...(route.name === "granted Reclaim" ? [grant.id] : [])],
    void: route.from === "void" ? [subject.id] : [],
  });
  let state = f.state;
  if (route.name === "granted Reclaim") state = reclaimPlay(f.engine, state, side, f.ids[side].hand[1], "hand").state;
  const id = route.from === "hand" ? f.ids[side].hand[0] : f.ids[side].void[0];
  const answers: AnswerSource = { answer(prompt) {
    switch (prompt.purpose.role) {
      case "voidRoute": case "playRoute": return playRoutes(state, f.engine.catalog, id, route.from).indexOf(route.route);
      case "chooseX": return 2;
      case "optionalCost": return extra.name === "optional paid";
      case "chooseCost": return 1;
      case "offeringCost": return [f.ids[side].hand[1]];
    }
    throw new Error(`Unexpected Reclaim composition prompt ${prompt.purpose.role}`);
  } };
  let x: number | null | undefined;
  const result = f.engine.apply(state, side, { kind: "play", card: id, from: route.from }, answers, (committed, step) => {
    if (step.kind === "play") x = committed.stack.find(item => item.kind === "card" && item.instance === id)?.x;
  });
  return { energy: state.sides[side].currentEnergy - result.state.sides[side].currentEnergy,
    points: state.sides[side].score - result.state.sides[side].score,
    otherEnergy: result.state.sides[opponent(side)].currentEnergy,
    opponentPoints: result.state.sides[opponent(side)].score - state.sides[opponent(side)].score,
    reclaimed: result.state.instances[id].status.playedViaReclaim, offering: result.state.instances[id].status.offering,
    x, violations: invariantViolations(result.state, f.engine.catalog) };
}
