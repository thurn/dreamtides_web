/**
 * Challenge contracts, ported from the prototype resolver's tests (read from
 * git at the Phase 2.11a porting OID) and driven through engine actions.
 */
import { describe, expect, it } from "vitest";
import { createEngine } from "../engine";
import type { EngineEvent } from "../events";
import type { BattleState } from "../state/types";
import type { InstanceId, Side } from "../state/ids";
import { opponent } from "../state/ids";
import { NO_PROMPTS } from "../steps/sources";
import { boardState, type BoardSetup } from "../testing/board";
import { SYNTHETIC, testCatalog } from "../testing/synthetic-cards";

const engine = createEngine(testCatalog());
const v = SYNTHETIC;
const deck = Array.from({ length: 6 }, () => v.vanilla1.id);

/** Passes through Day, Dusk, and Night so the Challenge phase resolves. */
function challenge(setup: Omit<BoardSetup, "phase">): {
  state: BattleState;
  events: EngineEvent[];
  ids: ReturnType<typeof boardState>["ids"];
} {
  const { state: start, ids } = boardState(engine.catalog, {
    ...setup,
    phase: "day",
    player: { deck, ...setup.player },
    enemy: { deck, ...setup.enemy },
  });
  const active = setup.active;
  const events: EngineEvent[] = [];
  let state = start;
  for (const side of [active, opponent(active), active]) {
    const result = engine.apply(state, side, { kind: "pass" }, NO_PROMPTS);
    state = result.state;
    events.push(...result.events);
  }
  return { state, events, ids };
}

function challengeScore(events: readonly EngineEvent[], side: Side): number {
  return events
    .filter((event) => event.kind === "pointsScored" && event.cause === "challenge" && event.side === side)
    .reduce((total, event) => total + (event.kind === "pointsScored" ? event.amount : 0), 0);
}

function zoneOf(state: BattleState, id: InstanceId | null): string {
  return id === null ? "none" : (state.instances[id]?.zone ?? "missing");
}

describe("challenge resolution", () => {
  it("scores an unpaired challenger's spark for the active side", () => {
    const { events, state, ids } = challenge({ active: "player", player: { front: [v.vanilla3.id] } });
    expect(challengeScore(events, "player")).toBe(3);
    expect(zoneOf(state, ids.player.front[0] ?? null)).toBe("play");
  });

  it("scores nothing for an empty lane or a lane holding only a blocker", () => {
    const { events } = challenge({ active: "player", enemy: { front: [v.vanilla3.id] } });
    expect(challengeScore(events, "player")).toBe(0);
    expect(events.some((event) => event.kind === "laneResolved")).toBe(false);
  });

  it("dissolves a lower-spark blocker and scores the challenger's spark advantage", () => {
    const { events, state, ids } = challenge({
      active: "player",
      player: { front: [v.vanilla8.id] },
      enemy: { front: [v.vanilla2.id] },
    });
    expect(challengeScore(events, "player")).toBe(6);
    expect(zoneOf(state, ids.player.front[0] ?? null)).toBe("play");
    expect(zoneOf(state, ids.enemy.front[0] ?? null)).toBe("void");
  });

  it("dissolves a lower-spark challenger and scores nothing", () => {
    const { events, state, ids } = challenge({
      active: "player",
      player: { front: [v.vanilla1.id] },
      enemy: { front: [v.vanilla3.id] },
    });
    expect(challengeScore(events, "player")).toBe(0);
    expect(challengeScore(events, "enemy")).toBe(0);
    expect(zoneOf(state, ids.player.front[0] ?? null)).toBe("void");
    expect(zoneOf(state, ids.enemy.front[0] ?? null)).toBe("play");
  });

  it("dissolves both characters on a spark tie", () => {
    const { events, state, ids } = challenge({
      active: "player",
      player: { front: [v.vanilla2.id] },
      enemy: { front: [v.vanilla2.id] },
    });
    expect(challengeScore(events, "player")).toBe(0);
    expect(zoneOf(state, ids.player.front[0] ?? null)).toBe("void");
    expect(zoneOf(state, ids.enemy.front[0] ?? null)).toBe("void");
  });

  it("uses gained spark in the comparison and the score", () => {
    const { state: start } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { front: [v.vanilla2.id], deck },
      enemy: { front: [v.vanilla3.id], deck },
    });
    const challenger = start.sides.player.frontRank[0];
    if (challenger === null || challenger === undefined) throw new Error("no challenger");
    start.instances[challenger].status.gainedSpark = 4;
    let state = start;
    const events: EngineEvent[] = [];
    for (const side of ["player", "enemy", "player"] as const) {
      const result = engine.apply(state, side, { kind: "pass" }, NO_PROMPTS);
      state = result.state;
      events.push(...result.events);
    }
    expect(challengeScore(events, "player")).toBe(3);
  });

  it("resolves from the enemy's side when the enemy is active", () => {
    const { events, state, ids } = challenge({
      active: "enemy",
      enemy: { front: [v.vanilla5.id, v.vanilla3.id] },
      player: { front: [v.vanilla2.id] },
    });
    expect(challengeScore(events, "enemy")).toBe(3 + 3);
    expect(challengeScore(events, "player")).toBe(0);
    expect(zoneOf(state, ids.player.front[0] ?? null)).toBe("void");
  });

  it("resolves each lane independently and sums the score", () => {
    const { events, state, ids } = challenge({
      active: "player",
      player: { front: [v.vanilla3.id, v.vanilla1.id, null, v.vanilla5.id] },
      enemy: { front: [v.vanilla1.id, v.vanilla3.id, v.vanilla8.id] },
    });
    // F0: 3 beats 1 (+2); F1: 1 loses to 3; F2: blocker only; F3: unpaired 5.
    expect(challengeScore(events, "player")).toBe(7);
    expect(events.filter((event) => event.kind === "laneResolved").map((event) => event.kind === "laneResolved" && event.lane)).toEqual([0, 1, 3]);
    expect(zoneOf(state, ids.enemy.front[0] ?? null)).toBe("void");
    expect(zoneOf(state, ids.player.front[1] ?? null)).toBe("void");
    expect(zoneOf(state, ids.enemy.front[2] ?? null)).toBe("play");
  });
});

describe("Vengeful and Awakened in challenges", () => {
  it("dissolves the winner too when the loser is Vengeful", () => {
    const { events, state, ids } = challenge({
      active: "player",
      player: { front: [v.vanilla5.id] },
      enemy: { front: [v.vengeful1.id] },
    });
    expect(zoneOf(state, ids.player.front[0] ?? null)).toBe("void");
    expect(zoneOf(state, ids.enemy.front[0] ?? null)).toBe("void");
    expect(challengeScore(events, "player")).toBe(0);
  });

  it("does nothing extra when the Vengeful character survives", () => {
    const { state, ids } = challenge({
      active: "player",
      player: { front: [v.vengeful1.id] },
      enemy: { front: [v.vanilla0.id] },
    });
    expect(zoneOf(state, ids.player.front[0] ?? null)).toBe("play");
    expect(zoneOf(state, ids.enemy.front[0] ?? null)).toBe("void");
  });

  it("gives Awakened no effect on scoring or dissolution", () => {
    const { events, state, ids } = challenge({
      active: "player",
      player: { front: [v.awakened2.id] },
      enemy: { front: [v.vanilla1.id] },
    });
    expect(challengeScore(events, "player")).toBe(1);
    expect(zoneOf(state, ids.enemy.front[0] ?? null)).toBe("void");
  });
});

describe("challenger and blocker designation", () => {
  it("never designates an exhausted front-rank character", () => {
    const { state: start } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { front: [v.vanilla3.id], deck },
      enemy: { front: [null, v.vanilla8.id], deck },
    });
    const challenger = start.sides.player.frontRank[0];
    if (challenger === null || challenger === undefined) throw new Error("no challenger");
    start.instances[challenger].status.exhausted = true;
    let state = start;
    const events: EngineEvent[] = [];
    for (const side of ["player", "enemy", "player"] as const) {
      const result = engine.apply(state, side, { kind: "pass" }, NO_PROMPTS);
      state = result.state;
      events.push(...result.events);
    }
    expect(challengeScore(events, "player")).toBe(0);
  });

  it("lets the defender move a blocker opposite a challenger during Dusk", () => {
    const { state: start, ids } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { front: [v.vanilla3.id], deck },
      enemy: { back: [v.vanilla5.id], deck },
    });
    let state = engine.apply(start, "player", { kind: "pass" }, NO_PROMPTS).state;
    const blocker = ids.enemy.back[0];
    if (blocker === null || blocker === undefined) throw new Error("no blocker");
    state = engine.apply(state, "enemy", { kind: "reposition", card: blocker, to: { rank: "front", index: 0 } }, NO_PROMPTS).state;
    const events: EngineEvent[] = [];
    for (const side of ["enemy", "player"] as const) {
      const result = engine.apply(state, side, { kind: "pass" }, NO_PROMPTS);
      state = result.state;
      events.push(...result.events);
    }
    expect(challengeScore(events, "player")).toBe(0);
    expect(zoneOf(state, ids.player.front[0] ?? null)).toBe("void");
  });
});
