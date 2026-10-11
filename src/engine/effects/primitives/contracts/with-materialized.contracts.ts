/**
 * `withMaterialized` binds exactly the characters its materialize put into
 * play, and a delayed trigger created inside the binding banishes those
 * still in play later (RD-hv-umm2.392-1), through saves and reloads.
 */
import { describe, expect, it } from "vitest";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice } from "../../../fold/slice";
import { stateHash } from "../../../state/hash";
import { SIDES } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { ScriptedSource } from "../../../steps/sources";
import { comparableView } from "../../../testing/determinization-fidelity";
import { passUntil } from "../../../testing/trigger-harness";
import { v } from "./cards-support";
import { applied, banished, capturedOf, decklists, engine, F, handCard, play, setup, sliceOf, triggerOf, zone } from "./with-materialized-support";

describe("withMaterialized", () => {
  it("binds exactly the characters its materialize put into play, and the delayed trigger banishes them", () => {
    const { state, ids } = setup({
      hand: [F.raiseThenOthers.id, F.draw.id],
      back: [v.vanilla1.id, ...Array<null>(7).fill(null), v.vanilla2.id],
      void: [v.vanilla2.id, v.vanilla1.id, v.vanilla0.id, v.vanilla5.id, v.event0.id],
    });
    const [resident, , , , , , , , last] = ids.player.back;
    const [first, second, third, big, spellCard] = ids.player.void;
    // Seven open slots: the three cheap characters enter, then the ≥3● one outside the binding.
    const raised = play(state, handCard(state, F.raiseThenOthers));
    for (const id of [first, second, third, big]) expect(zone(raised.state, id)).toBe("play");
    const effect = triggerOf(raised.state);
    expect(capturedOf(effect)).toEqual([first, second, third]);
    expect(raised.events).toContainEqual({ kind: "effectStarted", effect: effect.id, controller: "player", source: ids.player.hand[0], expiry: effect.expiry, change: effect.change });

    const fired = play(raised.state, handCard(raised.state, F.draw));
    expect(banished(fired.events)).toEqual([first, second, third]);
    for (const id of [first, second, third]) expect(zone(fired.state, id)).toBe("banished");
    for (const id of [resident!, last!, big]) expect(zone(fired.state, id)).toBe("play");
    expect(zone(fired.state, spellCard)).toBe("void");
    expect(fired.state.floating).toEqual([]);
  });

  it("never binds a character that stayed in its zone because the back rank was full", () => {
    const { state, ids } = setup({
      hand: [F.raise.id, F.draw.id],
      back: Array.from({ length: 9 }, () => v.vanilla3.id),
      void: [v.vanilla1.id, v.vanilla2.id],
    });
    const [fits, stays] = ids.player.void;
    const raised = play(state, handCard(state, F.raise));
    expect(zone(raised.state, fits)).toBe("play");
    expect(zone(raised.state, stays)).toBe("void");
    expect(capturedOf(triggerOf(raised.state))).toEqual([fits]);
    const fired = play(raised.state, handCard(raised.state, F.draw));
    expect(banished(fired.events)).toEqual([fits]);
    expect(zone(fired.state, stays)).toBe("void");
    expect(ids.player.back.every((id) => zone(fired.state, id!) === "play")).toBe(true);
  });

  it("keeps the nearest binding: a nested binding's trigger names only the inner cohort", () => {
    const { state, ids } = setup({ hand: [F.nested.id, F.draw.id], void: [v.vanilla0.id, v.vanilla5.id] });
    const [outer, inner] = ids.player.void;
    const raised = play(state, handCard(state, F.nested));
    expect(capturedOf(triggerOf(raised.state))).toEqual([inner]);
    const fired = play(raised.state, handCard(raised.state, F.draw));
    expect(banished(fired.events)).toEqual([inner]);
    expect(zone(fired.state, outer)).toBe("play");
  });

  it("does nothing later with an empty cohort", () => {
    const { state, ids } = setup({ hand: [F.raise.id, F.draw.id], back: [v.vanilla1.id], void: [v.vanilla5.id] });
    const raised = play(state, handCard(state, F.raise));
    const effect = triggerOf(raised.state);
    expect(capturedOf(effect)).toEqual([]);
    const fired = play(raised.state, handCard(raised.state, F.draw));
    expect(fired.events.some((entry) => entry.kind === "triggerResolved" && entry.node !== null)).toBe(true);
    expect(banished(fired.events)).toEqual([]);
    expect(zone(fired.state, ids.player.back[0]!)).toBe("play");
    expect(zone(fired.state, ids.player.void[0])).toBe("void");
    expect(fired.state.floating).toEqual([]);
  });

  it("names a member while it is in play: one that left is spared, one that left and returned is banished", () => {
    const { state, ids } = setup({
      hand: [F.raise.id, F.bounce.id, F.kill.id, F.draw.id],
      void: [v.vanilla1.id, v.vanilla2.id, v.vanilla0.id],
    });
    const [returned, killed, stayed] = ids.player.void;
    let current = play(state, handCard(state, F.raise)).state;
    current = play(current, handCard(current, F.bounce), new ScriptedSource([[returned]])).state;
    expect(zone(current, returned)).toBe("hand");
    current = play(current, returned).state;
    expect(zone(current, returned)).toBe("play");
    current = play(current, handCard(current, F.kill), new ScriptedSource([[killed]])).state;
    expect(zone(current, killed)).toBe("void");
    expect(capturedOf(triggerOf(current))).toEqual([returned, killed, stayed]);
    const fired = play(current, handCard(current, F.draw));
    expect(banished(fired.events)).toEqual([returned, stayed]);
    expect(zone(fired.state, killed)).toBe("void");
  });

  it("keeps the cohort through a JSON save and a saved fold slice holding the queued trigger", () => {
    const { state, ids } = setup({ hand: [F.watch.id, F.raise.id, F.draw.id], back: [v.vanilla3.id], void: [v.vanilla1.id, v.vanilla2.id] });
    const resident = ids.player.back[0]!;
    let raised = play(state, handCard(state, F.watch)).state;
    raised = play(raised, handCard(raised, F.raise)).state;
    const reloaded = JSON.parse(JSON.stringify(raised)) as BattleState;
    expect(stateHash(reloaded)).toBe(stateHash(raised));
    const drawCard = handCard(raised, F.draw);
    const direct = play(raised, drawCard, new ScriptedSource([[resident]]));
    expect(stateHash(play(reloaded, drawCard, new ScriptedSource([[resident]])).state)).toBe(stateHash(direct.state));
    expect(banished(direct.events)).toEqual(ids.player.void);
    expect(zone(direct.state, resident)).toBe("hand");

    // The watcher's trigger resolves first and asks for its target, with the cohort's trigger still queued.
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    let slice = applied(fold.reduce(sliceOf(raised), { kind: "battleAction", side: "player", action: { kind: "play", card: drawCard, from: "hand" } }));
    while (fold.pending(slice) === null) {
      const decision = engine.decision(slice.committed)!;
      slice = applied(fold.reduce(slice, { kind: "battleAction", side: decision.side, action: { kind: "pass" } }));
    }
    expect(slice.committed.triggerQueue.map((trigger) => trigger.captured)).toEqual([undefined, ids.player.void]);
    for (const viewer of SIDES) {
      const seen = engine.view(slice.committed, viewer);
      expect(seen.triggerQueue.map((trigger) => trigger.captured)).toEqual([undefined, ids.player.void]);
      const sampled = engine.determinize(JSON.parse(JSON.stringify(seen)) as typeof seen, decklists(slice.committed), () => 0.5);
      expect(comparableView(engine.view(sampled, viewer))).toEqual(comparableView(seen));
    }
    const saved = JSON.parse(JSON.stringify(slice)) as BattleSlice;
    const cold = createFoldAdapter(createEngine(engine.catalog), { checkEventPrefix: true });
    const pending = cold.pending(saved)!;
    const answered = applied(cold.reduce(saved, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [resident] }));
    const settled = passUntil(engine, answered.committed, (next) => next.stack.length === 0 && next.triggerQueue.length === 0).state;
    expect(stateHash(settled)).toBe(stateHash(direct.state));
  });

  it("throws when a captured reference resolves outside a binding", () => {
    const { state } = setup({ hand: [F.unbound.id] });
    expect(() => play(state, handCard(state, F.unbound))).toThrow(/outside withMaterialized/);
  });
});
