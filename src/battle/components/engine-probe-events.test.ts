import { describe, expect, it } from "vitest";
import type { EngineEvent } from "../../engine";
import { boardState } from "../../engine/testing/board";
import { SYNTHETIC, testCatalog } from "../../engine/testing/synthetic-cards";
import type { CommittedEvent } from "../../eventlog/local-log";
import { parseClientId } from "../../types/identifiers";
import { EngineProbeHistory, rememberInitialProbeEvents } from "./engine-probe-events";

const { ids } = boardState(testCatalog(), { active: "enemy", phase: "day", enemy: { hand: [SYNTHETIC.vanilla1.id], deck: [SYNTHETIC.vanilla1.id] } });
const firstId = ids.enemy.hand[0];
const drawnId = ids.enemy.deck[0];
if (firstId === undefined || drawnId === undefined) throw new Error("synthetic physical fixtures missing");
const first: EngineEvent = { kind: "cardPlayed", side: "enemy", instance: firstId };
const draw: EngineEvent = { kind: "cardDrawn", side: "enemy", instance: drawnId };
const load = (seq: number, init: object): CommittedEvent => ({
  seq,
  event: { type: "LOAD_STATE", payload: { battle: { init } }, actor: parseClientId("synthetic"), clientTimestamp: "2026-01-01T00:00:00Z"},
});

describe("development battle observations", () => {
  it("retains real constructor events at the matching load and live sibling events for a late reader", () => {
    const init = {};
    const shadow = {};
    rememberInitialProbeEvents(init, [first, draw]);
    const history = new EngineProbeHistory(init, [load(4, init), load(6, shadow)]);
    history.append({ seq: 8, events: [draw, draw] });
    history.append({ seq: 8, events: [draw, draw] });
    history.append({ seq: 7, events: [first] });
    // A consumer mounting after publication reads the same complete history.
    const late = history.events;
    expect(late.map(({ seq, index, instance }) => [seq, index, instance])).toEqual([
      [4, 0, firstId], [4, 1, drawnId], [7, 0, firstId], [8, 0, drawnId], [8, 1, drawnId],
    ]);
    expect(late.map(({ event }) => event)).toEqual([first, draw, first, draw, draw]);
    expect(late.every(({ kind, event }) => kind === event.kind)).toBe(true);
  });

  it("isolates a new battle and a reloaded init without inventing historical events", () => {
    const init = {};
    rememberInitialProbeEvents(init, [first]);
    const history = new EngineProbeHistory(init, [load(2, init)]);
    history.append({ seq: 3, events: [draw] });
    const next = new EngineProbeHistory({}, [load(2, init)]);
    const replayed = new EngineProbeHistory(structuredClone(init), [load(2, structuredClone(init))]);
    expect(next.events).toEqual([]);
    expect(replayed.events).toEqual([]);
    next.append({ seq: 5, events: [first] });
    expect(history.events.map(({ seq }) => seq)).toEqual([2, 3]);
    expect(next.events.map(({ seq }) => seq)).toEqual([5]);
  });

  it("requires the exact seeded init at a load and assigns repeated setup siblings unique indices", () => {
    const init = {};
    rememberInitialProbeEvents(init, [draw, draw]);
    expect(new EngineProbeHistory(init, [load(1, {})]).events).toEqual([]);
    const history = new EngineProbeHistory(init, [load(1, init), load(3, init)]);
    expect(history.events.map(({ seq, index }) => [seq, index])).toEqual([[3, 0], [3, 1]]);
  });
});
