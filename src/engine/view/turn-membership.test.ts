/** Observed physical histories survive concealment without revealing hidden identities or positions. */
import { describe, expect, it } from "vitest";
import { SIDES } from "../state/ids";
import { deserializeState, serializeState, stateHash } from "../state/hash";
import { comparableView } from "../testing/determinization-fidelity";
import { invariantViolations } from "../testing/invariants";
import { engine, kinds, members, setup, decks, run, entered, play, hide, leave, producers } from "./turn-membership.fixtures";

describe("anonymous current-turn physical membership", () => {
  it.each(SIDES.flatMap(side => kinds.map(kind => ({ side, kind }))))("binds live $side/$kind records and consumes eligible sampled members", ({ side, kind }) => {
    const { hidden, reader, victim } = setup(side, kind);
    for (const viewer of SIDES) {
      const seen = engine.view(hidden, viewer), before = structuredClone(seen);
      expect(JSON.stringify(seen)).not.toContain(`"${victim}"`);
      expect(seen.hiddenCards?.[side]).toHaveLength(1);
      expect(Object.keys(seen.hiddenCards![side][0]).filter(key => ["instance", "zone", "index"].includes(key))).toEqual([]);
      const sample = engine.determinize(seen, decks(hidden), () => 0);
      expect(seen).toEqual(before);
      const cohort = members(sample, side, kind);
      expect(cohort).toHaveLength(1);
      expect(cohort.every(id => sample.instances[id] !== undefined)).toBe(true);
      const eligible = sample.sides[side].deck.filter(id => cohort.includes(id));
      expect(eligible.length).toBeGreaterThan(0);
      expect(sample.sides[side].deck.filter(id => !cohort.includes(id)).length).toBeGreaterThan(0);
      expect(comparableView(engine.view(sample, viewer))).toEqual(comparableView(seen));
      const action = { kind: "activate", source: reader, ability: 0 } as const;
      const out = run(sample, side, action), replay = run(deserializeState(serializeState(sample)), side, action);
      expect(entered(out)).toEqual(eligible);
      expect(stateHash(out.state)).toBe(stateHash(replay.state));
      expect(out.events).toEqual(replay.events);
      expect(invariantViolations(out.state, engine.catalog)).toEqual([]);
      expect(entered(run(out.state, side, action))).toEqual([]);
    }
  });

  it.each(SIDES.flatMap(side => kinds.map(kind => ({ side, kind }))))("keeps distinct same-printing $side/$kind copies and ignores nonmembers", ({ side, kind }) => {
    const { hidden, reader } = setup(side, kind, 2);
    const view = engine.view(hidden, side), sample = engine.determinize(view, decks(hidden), () => 0.5);
    const cohort = members(sample, side, kind);
    expect(cohort).toHaveLength(2);
    expect(new Set(cohort).size).toBe(2);
    expect(cohort.every(id => sample.sides[side].deck.includes(id))).toBe(true);
    expect(sample.sides[side].deck.filter(id => !cohort.includes(id))).toHaveLength(2);
    expect(comparableView(engine.view(sample, side))).toEqual(comparableView(view));
    expect(new Set(entered(run(sample, side, { kind: "activate", source: reader, ability: 0 })))).toEqual(new Set(cohort));
  });

  it.each(SIDES.flatMap(side => kinds.map(kind => ({ side, kind }))))("re-exposes the same sampled $side/$kind member after erosion", ({ side, kind }) => {
    const { hidden, reader } = setup(side, kind);
    const sample = engine.determinize(engine.view(hidden, side), decks(hidden), () => 0.5);
    const cohort = members(sample, side, kind);
    const eroded = run(sample, side, { kind: "activate", source: reader, ability: 3 });
    expect(eroded.state.sides[side].deck).toEqual([]);
    expect(eroded.state.sides[side].void).toEqual(expect.arrayContaining(cohort));
    expect(engine.view(eroded.state, side).instances[cohort[0]]?.zone).toBe("void");
    expect(members(eroded.state, side, kind)).toEqual(cohort);
    expect(entered(run(eroded.state, side, { kind: "activate", source: reader, ability: 2 }))).toEqual(cohort);
  });

  it.each(SIDES.flatMap(side => kinds.map(kind => ({ side, kind }))))("keeps ceased and unremembered $side/$kind history outside live membership", ({ side, kind }) => {
    const ceased = setup(side, kind, 1, true);
    expect(ceased.hidden.instances[ceased.victim]).toBeUndefined();
    const legacy = setup(side, kind), forgotten = deserializeState(serializeState(legacy.hidden));
    delete forgotten.rememberedCards;
    for (const { state, reader } of [{ state: ceased.hidden, reader: ceased.reader }, { state: forgotten, reader: legacy.reader }]) {
      for (const viewer of SIDES) {
        const view = engine.view(state, viewer), sample = engine.determinize(view, decks(state), () => 0.5);
        expect(members(sample, side, kind)).toHaveLength(1);
        expect(members(sample, side, kind).every(id => sample.instances[id] === undefined)).toBe(true);
        expect(comparableView(engine.view(sample, viewer))).toEqual(comparableView(view));
        expect(entered(run(sample, side, { kind: "activate", source: reader, ability: 0 }))).toEqual([]);
      }
    }
  });

  it.each(SIDES.flatMap(side => kinds.map(kind => ({ side, kind }))))("samples equal $side/$kind views independently of concealed IDs and order", ({ side, kind }) => {
    const { hidden } = setup(side, kind);
    const changed = deserializeState(serializeState(hidden));
    changed.sides[side].deck.reverse();
    const hiddenIds = changed.sides[side].deck;
    const renamed = deserializeState(JSON.stringify(changed, (_key, value: unknown) => {
      if (typeof value !== "string") return value;
      const index = hiddenIds.findIndex(id => id === value);
      return index < 0 ? value : `i${9000 + index}`;
    }).replace(/"(i\d+)":/g, (match, token: string) => {
      const index = hiddenIds.findIndex(item => item === token);
      return index < 0 ? match : `"i${9000 + index}":`;
    }));
    renamed.nextInstance = 10000;
    expect(invariantViolations(renamed, engine.catalog)).toEqual([]);
    for (const viewer of SIDES) {
      const before = engine.view(hidden, viewer), after = engine.view(renamed, viewer);
      expect(after).toEqual(before);
      const first = engine.determinize(before, decks(hidden), () => 0.5), second = engine.determinize(after, decks(hidden), () => 0.5);
      expect(stateHash(first)).toBe(stateHash(second));
    }
  });

  it.each(SIDES.flatMap(side => kinds.map(kind => ({ side, kind }))))("rejects unbound $side/$kind member aliases without changing the view", ({ side, kind }) => {
    const { hidden } = setup(side, kind), view = engine.view(hidden, side);
    for (const member of [-1, Number.NaN, 1000000]) {
      const reference = { member };
      const bad = { ...view, turnLog: { ...view.turnLog,
        ...(kind === "discarded" ? { discardedCards: { ...view.turnLog.discardedCards!, [side]: [reference] } }
          : { [kind]: { ...view.turnLog[kind]!, [side]: view.turnLog[kind]![side].map(card => ({ ...card, instance: reference })) } }),
      } };
      const before = structuredClone(bad);
      expect(() => engine.determinize(bad, decks(hidden), () => 0.5)).toThrow();
      expect(bad).toEqual(before);
    }
  });

  it.each(SIDES.flatMap(side => kinds.map(kind => ({ side, kind }))))("keeps repeated $side/$kind occurrences on one sampled physical member across zones", ({ side, kind }) => {
    const { hidden, initial, reader } = setup(side, kind);
    let state = run(hidden, side, { kind: "activate", source: reader, ability: 0 }).state;
    const leaveId = initial.ids[side].hand.find(id => state.instances[id]?.printing.kind === "card" && state.instances[id].printing.cardId === leave.id)!;
    state = play(state, side, leaveId).state;
    // The publicly known returned member remains eligible in hand.
    const inHand = run(state, side, { kind: "activate", source: reader, ability: 1 });
    expect(entered(inHand)).toEqual([members(state, side, kind)[0]]);
    state = kind === "discarded" ? state : inHand.state;
    const producer = state.sides[side].hand.find(id => state.instances[id].printing.kind === "card" && state.instances[id].printing.cardId === producers[kind].id)!;
    state = play(state, side, producer).state;
    expect(members(state, side, kind)).toHaveLength(2);
    expect(new Set(members(state, side, kind)).size).toBe(1);
    const hideId = state.sides[side].hand.find(id => state.instances[id].printing.kind === "card" && state.instances[id].printing.cardId === hide.id)!;
    state = play(state, side, hideId).state;
    const view = engine.view(state, side), sample = engine.determinize(view, decks(state), () => 0.5);
    expect(members(sample, side, kind)).toHaveLength(2);
    expect(new Set(members(sample, side, kind)).size).toBe(1);
    expect(comparableView(engine.view(sample, side))).toEqual(comparableView(view));
    expect(entered(run(sample, side, { kind: "activate", source: reader, ability: 0 }))).toEqual([members(sample, side, kind)[0]]);
  });
});
