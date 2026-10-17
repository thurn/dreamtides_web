/** Public play permissions outlive their source without identifying hidden cards. */
import { describe, expect, it } from "vitest";
import { createEngine } from "../../../engine";
import { characterYouControl, energy, event, target } from "../../../dsl/builders";
import { GREEDY_POLICY } from "../../../policy/greedy";
import { PolicyRandom } from "../../../policy/random";
import type { Action } from "../../../rules/actions";
import type { BattleView } from "../../../view/view";
import { battleSeed, opponent, SIDES, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { boardState, placeFigment } from "../../../testing/board";
import { passUntil, at } from "../../../testing/trigger-harness";
import { invariantViolations } from "../../../testing/invariants";
import { syntheticId } from "../../../testing/synthetic-cards";
import { zoneCatalog } from "../../../testing/zone-cards";
import { returnToHand } from "../return-to-hand";
import { sequence } from "../sequence";
import { shuffleInto } from "../shuffle-into";
import { Answering, PERMIT, filler } from "./play-from-zone-support";
import { v } from "./cards-support";

const hideSource = {
  id: syntheticId(0x7c30), cardType: "event" as const, costs: [energy(0)], spark: null,
  subtype: "" as const, speed: "standard" as const, status: "authored" as const,
  abilities: () => [event(sequence(returnToHand(target(characterYouControl())), shuffleInto([], { chooseFromHand: 1 })))],
};
const engine = createEngine(zoneCatalog([...Object.values(PERMIT), hideSource]));
const play = (card: InstanceId, from: "hand" | "void" = "hand"): Action => ({ kind: "play", card, from });
const settle = (state: BattleState) => passUntil(engine, state, (next) => next.stack.length === 0).state;
function apply(state: BattleState, side: Side, action: Action, picks?: readonly InstanceId[]) {
  const after = engine.apply(state, side, action, new Answering(() => picks ?? [])).state;
  expect(invariantViolations(after, engine.catalog)).toEqual([]);
  return settle(after);
}

/** Check the view, a JSON reload, legal actions in a sample, and the policy's legal action. */
function playable(state: BattleState, side: Side, card: InstanceId, source: InstanceId, hidden: boolean) {
  const action = play(card, "void");
  expect(engine.legalActions(state, side)).toContainEqual(action);
  const seen = engine.view(state, side);
  const decklists = {
    player: Object.values(state.instances).filter((i) => i.owner === "player" && i.printing.kind === "card").map((i) => ({ cardId: i.printing.kind === "card" ? i.printing.cardId : v.vanilla1.id })),
    enemy: Object.values(state.instances).filter((i) => i.owner === "enemy" && i.printing.kind === "card").map((i) => ({ cardId: i.printing.kind === "card" ? i.printing.cardId : v.vanilla1.id })),
  };
  // A ceased source's owner may have only the filler deck; both lists remain populated.
  for (const viewer of SIDES) {
    const visible = engine.view(state, viewer);
    expect(visible.floating).toHaveLength(1);
    expect(visible.floating[0].source).toBe(hidden ? null : source);
    if (hidden) {
      expect(JSON.stringify(visible)).not.toContain(`"${source}"`);
      const printing = state.floating[0].change.kind === "playFrom" && state.floating[0].change.next ? PERMIT.technician.id : PERMIT.salvager.id;
      const { hiddenCards, ...identified } = visible;
      expect(JSON.stringify(identified)).not.toContain(printing);
      if (state.instances[source] === undefined) expect(JSON.stringify(hiddenCards ?? {})).not.toContain(printing);
      else expect(hiddenCards?.[side].map((record) => record.printing)).toContainEqual(state.instances[source].printing);
    }
  }
  const sample = engine.determinize(JSON.parse(JSON.stringify(seen)) as BattleView, decklists, () => 0.5);
  expect(engine.legalActions(sample, side)).toContainEqual(action);
  expect(engine.view(sample, side).floating[0].change).toEqual(seen.floating[0].change);
  const decision = engine.decision(state)!;
  const result = GREEDY_POLICY.decide(seen, { kind: "topLevel", decision, legal: engine.legalActions(state, side) }, {
    engine, side, decklists, random: new PolicyRandom(battleSeed("permission-view")), budget: { iterations: 100 }, now: () => 0,
  });
  if (result.choice.kind !== "action") throw new Error("expected a top-level action");
  expect(engine.legalActions(state, side)).toContainEqual(result.choice.action);
  expect(invariantViolations(sample, engine.catalog)).toEqual([]);
  return sample;
}

for (const side of SIDES) {
  for (const created of [false, true]) {
    const departure = created ? "ceases on departure" : "shuffles into a hidden deck";
    describe(`playFromZone view for ${side}, source ${departure}`, () => {
      it("keeps a granted next-event permission through departure, then consumes it on play", () => {
        const { state, ids } = boardState(engine.catalog, {
          active: side, phase: "day",
          [side]: { back: created ? [] : [PERMIT.technician.id], hand: [hideSource.id], void: [v.event0.id, v.vanilla1.id], deck: filler, energy: 8 },
          [opponent(side)]: { deck: filler },
        });
        const source = created ? placeFigment(state, side, { rank: "back", index: 0 }, { kind: "figmentCopy", cardId: PERMIT.technician.id, spark: 1 }) : ids[side].back[0]!;
        const granted = apply(state, side, { kind: "activate", source, ability: 0 });
        const permission = granted.floating[0];
        expect(engine.view(granted, side).floating[0].source).toBe(source);
        const departed = apply(granted, side, play(ids[side].hand[0]), [source]);
        expect(departed.floating).toEqual([permission]);
        expect(departed.instances[source]?.zone ?? null).toBe(created ? null : "deck");
        const sample = playable(departed, side, ids[side].void[0], source, true);
        expect(engine.legalActions(sample, side)).not.toContainEqual(play(ids[side].void[1], "void"));
        const used = apply(sample, side, play(ids[side].void[0], "void"));
        expect(used.floating).toEqual([]);
      });

      it("keeps the granted named-card permission until end of turn through departure", () => {
        const { state, ids } = boardState(engine.catalog, {
          active: side, phase: "day",
          [side]: { back: created ? [] : [PERMIT.salvager.id], hand: [PERMIT.discarder.id, v.vanilla2.id, hideSource.id], void: [v.vanilla1.id], deck: filler, energy: 8 },
          [opponent(side)]: { deck: filler },
        });
        const source = created ? placeFigment(state, side, { rank: "back", index: 0 }, { kind: "figmentCopy", cardId: PERMIT.salvager.id, spark: 1 }) : ids[side].back[0]!;
        const discarded = ids[side].hand[1];
        const granted = apply(state, side, play(ids[side].hand[0]), [discarded]);
        expect(engine.view(granted, side).floating[0].source).toBe(source);
        const departed = apply(granted, side, play(ids[side].hand[2]), [source]);
        const sample = playable(departed, side, discarded, source, true);
        expect(engine.legalActions(sample, side)).not.toContainEqual(play(ids[side].void[0], "void"));
        expect(apply(sample, side, play(discarded, "void")).floating).toEqual(sample.floating);
        const ended = passUntil(engine, sample, at(engine, opponent(side), "day")).state;
        expect(ended.floating).toEqual([]);
      });
    });
  }
}
