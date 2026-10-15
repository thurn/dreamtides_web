/** Current-zone physical membership intersects random selection before its first draw. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { all, anyCharacter, event, everyIn, keyword, randomIn } from "../../../dsl/builders";
import type { PlayerRef, ZoneEverySpec } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import type { Effect } from "../../registry";
import { SIDES, opponent, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { InlineSource } from "../../../steps/sources";
import { boardState, type SideSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import * as p from "../index";

const STREAM = "random:selection";
const make = (n: number, effect: Effect): EngineCardDefinition => ({ ...v.event0, id: syntheticId(0x253000 + n), abilities: () => [event(effect)] });
const subject: EngineCardDefinition = { ...v.vanilla2, id: syntheticId(0x253010), abilities: () => [keyword("cannotBeTargeted")] };
const abandon = make(1, p.abandon());
const dissolve = make(2, p.dissolve(all(anyCharacter())));
const discard = make(3, p.discard(2));
const wake = make(4, p.materialize({ ...everyIn("void", { cardType: "character" }), thisTurn: "abandoned" }));
const gain = make(5, p.gainControl(all({ controller: "opponent" })));
const extra = make(6, p.takeExtraTurn());
const leave = make(7, p.returnFromVoid(everyIn("void", { cardType: "character" })));
const deck = Array.from({ length: 15 }, () => v.vanilla1.id);
const modes = ["abandoned", "dissolved", "discarded"] as const;
type Membership = NonNullable<ZoneEverySpec["thisTurn"]>;
const produce = (kind: Membership) => kind === "abandoned" ? abandon : kind === "dissolved" ? dissolve : discard;

function world(side: Side, kind?: Membership, options: { count?: number; player?: PlayerRef; bounds?: boolean; setup?: SideSetup; other?: SideSetup } = {}) {
  const picker = make(8, p.sequence(p.materialize(randomIn("void", options.count ?? 9, { cardType: "character" }, {
    ...(kind === undefined ? {} : { thisTurn: kind }), ...(options.player === undefined ? {} : { player: options.player }),
    ...(options.bounds ? { costGreaterThan: 1, costExactly: 2, costLessThan: 3 } : {}),
  })), p.gainPoints(1)));
  const engine = createEngine(testCatalog([subject, abandon, dissolve, discard, wake, gain, extra, leave, picker]));
  const b = boardState(engine.catalog, { active: side, phase: "day", scoreToWin: 100,
    [side]: { hand: [produce(kind ?? "abandoned").id, picker.id], back: [subject.id], void: [subject.id], energy: 20, deck, ...options.setup },
    [opponent(side)]: { deck, ...options.other } });
  const answers = new InlineSource({ player: answer, enemy: answer });
  function answer(prompt: Parameters<InlineSource["answer"]>[0]) {
    if (prompt.kind === "chooseCards" || prompt.kind === "chooseTargets") return prompt.candidates.slice(0, prompt.min);
    throw new Error(`Unexpected ${prompt.kind}`);
  }
  const cast = (state: BattleState, card: InstanceId, actor: Side = side) => {
    const first = engine.apply(state, actor, { kind: "play", card, from: "hand" }, answers);
    const done = passUntil(engine, first.state, next => next.stack.length === 0 && next.triggerQueue.length === 0, answers);
    expect(invariantViolations(done.state, engine.catalog)).toEqual([]);
    return { state: done.state, events: [...first.events, ...done.events] };
  };
  return { ...b, engine, picker, cast, answers };
}

describe("random zone current-turn membership", () => {
  for (const side of SIDES) for (const kind of modes) {
    it(`${side} ${kind}: intersects current physical members, permits untargetable cards and excludes duplicate-UUID decoys`, () => {
      const w = world(side, kind, { bounds: true, setup: kind === "discarded" ? {
        hand: [discard.id, subject.id, subject.id, make(8, p.gainPoints(1)).id], back: [],
      } : { back: [subject.id, subject.id] } });
      const state = w.cast(w.state, w.ids[side].hand[0]).state;
      if (kind === "abandoned") {
        // The same physical card can have several successful occurrences.
        const wakeState = world(side, kind, { setup: { hand: [abandon.id, wake.id, abandon.id, w.picker.id] } });
        let repeated = wakeState.cast(wakeState.state, wakeState.ids[side].hand[0]).state;
        repeated = wakeState.cast(repeated, wakeState.ids[side].hand[1]).state;
        repeated = wakeState.cast(repeated, wakeState.ids[side].hand[2]).state;
        const again = wakeState.cast(repeated, wakeState.ids[side].hand[3]);
        expect(again.events.filter(e => e.kind === "materialized").map(e => e.instance)).toEqual([wakeState.ids[side].back[0]]);
        expect(again.state.rng[STREAM]).toBe((repeated.rng[STREAM] ?? 0) + 1);
      }
      const members = kind === "discarded" ? w.ids[side].hand.slice(1, 3) : kind === "dissolved" ? w.ids[side].back : [w.ids[side].back[0]];
      const picker = w.ids[side].hand[kind === "discarded" ? 3 : 1];
      const out = w.cast(state, picker);
      expect(new Set(out.events.filter(e => e.kind === "materialized").map(e => e.instance))).toEqual(new Set(members));
      expect(out.state.instances[w.ids[side].void[0]].zone).toBe("void");
      expect(out.state.rng[STREAM]).toBe((state.rng[STREAM] ?? 0) + members.length);
      expect(out.events.filter(e => e.kind === "noLegalTarget")).toEqual([]);
      expect(out.state.sides[side].score).toBe(1);
      for (const viewer of SIDES) for (const id of members) expect(w.engine.view(out.state, viewer).instances[id!]?.zone).toBe("play");
    });

    it(`${side} ${kind}: an empty eligible pool consumes no RNG and still resolves its trailing effect`, () => {
      const w = world(side, kind, { setup: { back: [] } });
      const out = w.cast(w.state, w.ids[side].hand[1]);
      expect(out.state.rng).toEqual(w.state.rng);
      expect(out.events.filter(e => e.kind === "materialized" || e.kind === "noLegalTarget")).toEqual([]);
      expect(out.state.sides[side].score).toBe(1);
    });

    it(`${side} ${kind}: ordinary and extra turns reset eligibility`, () => {
      for (const extraTurn of [false, true]) {
        const w = world(side, kind, { player: extraTurn ? "you" : "opponent", setup: { hand: [produce(kind).id, ...(kind === "discarded" ? [subject.id, subject.id] : []), make(8, p.gainPoints(1)).id, extra.id],
          back: kind === "discarded" ? [] : [subject.id] }, other: { hand: [make(8, p.gainPoints(1)).id] } });
        let state = w.cast(w.state, w.ids[side].hand[0]).state;
        if (extraTurn) state = w.cast(state, w.ids[side].hand[w.ids[side].hand.length - 1]).state;
        const turn = state.turn.turnNumber;
        state = passUntil(w.engine, state, next => next.turn.turnNumber > turn && at(w.engine, extraTurn ? side : opponent(side), "day")(next), w.answers, 100).state;
        const actor = extraTurn ? side : opponent(side);
        expect(state.turn.active).toBe(actor);
        const card = extraTurn ? w.ids[side].hand[w.ids[side].hand.length - 2] : w.ids[actor].hand[0];
        const out = w.cast(state, card, actor);
        expect(out.events.filter(e => e.kind === "materialized")).toEqual([]);
        expect(out.state.rng[STREAM] ?? 0).toBe(state.rng[STREAM] ?? 0);
        expect(out.state.sides[actor].score).toBe(1);
      }
    });
  }

  it.each(SIDES)("%s requires both the abandoning actor and holder, while dissolution follows physical membership", side => {
    for (const kind of ["abandoned", "dissolved"] as const) {
      const w = world(side, kind, { player: "opponent", setup: { hand: [gain.id, abandon.id, make(8, p.gainPoints(1)).id], back: [], void: [] }, other: { back: [subject.id] } });
      let state = w.cast(w.state, w.ids[side].hand[0]).state;
      state = w.cast(state, w.ids[side].hand[1]).state;
      const out = w.cast(state, w.ids[side].hand[2]);
      const victim = w.ids[opponent(side)].back[0]!;
      expect(out.state.instances[victim].zone).toBe(kind === "abandoned" ? "void" : "play");
      expect(out.state.rng[STREAM] ?? 0).toBe((state.rng[STREAM] ?? 0) + (kind === "abandoned" ? 0 : 1));
    }
  });

  it.each(SIDES)("%s preserves default selection, distinct count limits, type and simultaneous cost bounds", side => {
    const w = world(side, undefined, { count: 2, bounds: true, setup: { back: [], void: [subject.id, subject.id, subject.id, v.vanilla1.id, v.vanilla3.id, v.event0.id] } });
    const out = w.cast(w.state, w.ids[side].hand[1]);
    const entered = out.events.filter(e => e.kind === "materialized").map(e => e.instance);
    expect(entered).toHaveLength(2);
    expect(new Set(entered).size).toBe(2);
    for (const id of entered) expect(w.ids[side].void.slice(0, 3)).toContain(id);
    expect(out.state.rng[STREAM]).toBe((w.state.rng[STREAM] ?? 0) + 2);
    expect(out.state.sides[side].score).toBe(1);
  });

  it.each(SIDES)("%s excludes historical members outside the named zone", side => {
    const w = world(side, "abandoned", { setup: { hand: [abandon.id, leave.id, make(8, p.gainPoints(1)).id] } });
    let state = w.cast(w.state, w.ids[side].hand[0]).state;
    state = w.cast(state, w.ids[side].hand[1]).state;
    const out = w.cast(state, w.ids[side].hand[2]);
    expect(out.events.filter(e => e.kind === "materialized")).toEqual([]);
    expect(out.state.rng[STREAM] ?? 0).toBe(state.rng[STREAM] ?? 0);
  });
});
