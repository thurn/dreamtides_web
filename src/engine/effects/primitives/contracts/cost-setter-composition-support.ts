/** Real public static setters across the chosen-route payment boundaries (RD-hv-umm2.696-1). */
import type { EngineCardDefinition } from "../../../catalog";
import { additionalCost, choiceCost, energy, energyX, event, everyIn, keyword, optionalCost, pointsCost, reclaim, staticAbility } from "../../../dsl/builders";
import type { Ability } from "../../../dsl/types";
import type { Answer } from "../../../prompts/types";
import { playRoutes, type PlayRoute, type PlayZone } from "../../../rules/timing";
import { SIDES, opponent } from "../../../state/ids";
import type { AnswerSource } from "../../../steps/types";
import { SYNTHETIC as v, syntheticId } from "../../../testing/synthetic-cards";
import { invariantViolations } from "../../../testing/invariants";
import { costSetter } from "../cost-setter";
import { costModifier } from "../cost-modifier";
import { gainPoints } from "../gain-points";
import { grantReclaim } from "../grant-reclaim";
import { playFromZone } from "../play-from-zone";
import { ruleModifier } from "../rule-modifier";
import { nthFixture, nthPlay } from "./cost-modifier-nth-support";

interface Route {
  readonly name: string;
  readonly from: PlayZone;
  readonly replacement: number | null;
  readonly explicit?: "printed" | "granted";
}
/** Each public route joins this bounded table when it is introduced. */
const ROUTES: { readonly [R in PlayRoute]: readonly Route[] } = {
  hand: [{ name: "hand", from: "hand", replacement: null }],
  permission: [{ name: "normal void permission", from: "void", replacement: null }],
  reclaim: [
    { name: "plain Reclaim", from: "void", replacement: null },
    { name: "printed Reclaim", from: "void", replacement: 5, explicit: "printed" },
    { name: "granted Reclaim", from: "void", replacement: 4, explicit: "granted" },
  ],
  offering: [{ name: "Offering", from: "hand", replacement: 0 }],
  eventAlternative: [{ name: "event alternative", from: "hand", replacement: 1 }],
};
const EXTRAS = [
  { name: "fixed", energy: 0 }, { name: "mandatory", energy: 1 },
  { name: "optional paid", energy: 1 }, { name: "optional declined", energy: 0 },
  { name: "alternative additional", energy: 3 }, { name: "X", energy: 0 },
] as const;
export const SETTER_COST_ROWS = SIDES.flatMap(side =>
  (Object.entries(ROUTES) as [PlayRoute, readonly Route[]][]).flatMap(([kind, routes]) => routes.flatMap(route => EXTRAS.map(extra => ({
    side, kind, route, extra, label: `${side} continuous set by ${route.name}, ${extra.name}`,
    // Normal set0 or replacement base, then the chosen extra/X, tax3 and reduction1.
    expected: (route.replacement ?? 0) + extra.energy + (extra.name === "X" && kind !== "offering" && kind !== "eventAlternative" ? 2 : 0) + 2,
  })))));

export function observeSetterCostRow(row: typeof SETTER_COST_ROWS[number]) {
  const { side, kind, route, extra } = row;
  const hasX = extra.name === "X";
  const extras: Ability[] = [additionalCost(pointsCost(1)), event(gainPoints(0))];
  if (extra.name === "mandatory") extras.push(additionalCost(energy(1)));
  if (extra.name.startsWith("optional")) extras.push(additionalCost(optionalCost(energy(1))));
  if (extra.name === "alternative additional") extras.push(additionalCost(choiceCost([energy(1)], [energy(3)])));
  if (kind === "reclaim" && route.explicit !== "granted") extras.push(route.explicit === "printed" ? reclaim(energy(5), ...(hasX ? [energyX(0)] : [])) : keyword("reclaim"));
  if (kind === "offering") extras.push(keyword("offering"));
  const subject: EngineCardDefinition = { ...v.event0, id: syntheticId(0x696100), costs: [energy(2), ...(hasX ? [energyX(0)] : [])], speed: "fast", status: "authored", abilities: () => extras };
  const provider: EngineCardDefinition = { ...v.vanilla0, id: syntheticId(0x696101), status: "authored", abilities: () => [
    staticAbility(costSetter("you", { cardType: "event", costAtMost: 2 }, 0)),
    staticAbility(costModifier("you", { cardType: "event" }, 3)), staticAbility(costModifier("you", { cardType: "event" }, -1)),
    ...(kind === "permission" ? [staticAbility(playFromZone("void", { cardType: "event" }))] : []),
    ...(kind === "eventAlternative" ? [staticAbility(ruleModifier({ rule: "eventAlternative", energy: 1 }))] : []),
  ] };
  const grant: EngineCardDefinition = { ...v.event0, id: syntheticId(0x696102), status: "authored", abilities: () => [event(grantReclaim(everyIn("void", { cardType: "event" }), { costs: [energy(4), ...(hasX ? [energyX(0)] : [])] }))] };
  const f = nthFixture(side, [subject, provider, grant], { back: [provider.id],
    hand: [...(route.from === "hand" ? [subject.id] : []), v.vanilla0.id, ...(route.explicit === "granted" ? [grant.id] : [])],
    void: route.from === "void" ? [subject.id] : [], score: 5,
  });
  let state = f.state;
  if (route.explicit === "granted") state = nthPlay(f.engine, state, side, f.ids[side].hand[1]).state;
  const id = route.from === "hand" ? f.ids[side].hand[0] : f.ids[side].void[0];
  const selected = playRoutes(state, f.engine.catalog, id, route.from).indexOf(kind);
  const source: AnswerSource = { answer(prompt): Answer {
    switch (prompt.purpose.role) {
      case "voidRoute": case "playRoute": return selected;
      case "chooseX": return 2;
      case "optionalCost": return extra.name === "optional paid";
      case "chooseCost": return 1;
      case "offeringCost": return [f.ids[side].hand[1]];
    }
    throw new Error(`Unexpected setter composition prompt ${prompt.purpose.role}`);
  } };
  let x: number | null | undefined;
  const result = f.engine.apply(state, side, { kind: "play", card: id, from: route.from }, source, (committed, step) => {
    if (step.kind === "play") x = committed.stack.find(item => item.kind === "card" && item.instance === id)?.x;
  });
  return { energy: state.sides[side].currentEnergy - result.state.sides[side].currentEnergy,
    points: state.sides[side].score - result.state.sides[side].score,
    otherEnergy: result.state.sides[opponent(side)].currentEnergy,
    played: result.state.turnLog.played[side].filter(record => record.instance === id).length,
    reclaimed: result.state.instances[id].status.playedViaReclaim, offering: result.state.instances[id].status.offering,
    x, violations: invariantViolations(result.state, f.engine.catalog),
  };
}
