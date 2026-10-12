import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { EventContext, GameEvent } from "../../eventlog/types";
import { eventRng } from "../../eventlog/rng";
import { type Engine } from "../../engine";
import { stateHash } from "../../engine/state/hash";
import { TEST_CONTENT_CONFIG } from "../../testing/journey-genesis";
import { testEventActor } from "../../types/test-identities";
import type { FoldState } from "../fold-state";
import { reduceGameEvent, type ReduceResult } from "../reducer";
import { GAME_ENGINE_CONFIG } from "../replay/replay";
import { AVATAR_ID, BATTLE_SITE_ID, FIXTURE_ENGINE, FIXTURE_POINTS_MODE, clearReplayFixtureProviders, registerReplayFixtureProviders } from "../replay/fixture-providers";
import { validateLoadedState } from "../journey/lifecycle";
import { pendingEnginePrompt } from "./engine-battle";
import type { PromptId } from "../../types/identifiers";
import { journeyBattleOf } from "./fold";



const GENESIS = {
  seed: "fixture-battle",
  reducerVersion: "test",
  createdAt: 0,
  contentConfig: TEST_CONTENT_CONFIG,
} as const;




let seq = 0;


function ctx(intervening: EventContext["intervening"] = []): EventContext {
  return {
    contentConfig: TEST_CONTENT_CONFIG,
    seq,
    rng: eventRng(GENESIS.seed as never, seq),
    intervening,
    timestamp: "1970-01-01T00:00:00.000Z",
  };
}


function reduce(
  state: FoldState,
  type: string,
  payload: Record<string, unknown>,
  options: { actor?: string; intervening?: EventContext["intervening"] } = {},
): ReduceResult {
  seq += 1;
  const event: GameEvent = {
    type: type as GameEvent["type"],
    payload,
    actor: testEventActor(options.actor ?? "p1"),
    clientTimestamp: "1970-01-01T00:00:00.000Z",
    basedOnSeq: seq - 1,
  };
  return reduceGameEvent(state, event, ctx(options.intervening));
}


function applied(result: ReduceResult): FoldState {
  if (result.outcome !== "applied") {
    throw new Error(`bounced: ${String(result.bounceReason)}`);
  }
  return result.state;
}


/** A journey standing on the fixture Battle site. */
function atBattleSite(): FoldState {
  seq = 0;
  let state = GAME_ENGINE_CONFIG.genesisState(GENESIS as never);
  state = applied(reduce(state, "START_JOURNEY", { avatarId: AVATAR_ID }));
  return applied(reduce(state, "ENTER_SITE", { siteId: BATTLE_SITE_ID }));
}


function begun(): FoldState {
  return applied(reduce(atBattleSite(), "BEGIN_BATTLE", { siteId: BATTLE_SITE_ID }));
}


function engineOf(state: FoldState) {
  const fold = journeyBattleOf(state.battle)?.engine;
  if (fold === undefined) throw new Error("no engine battle");
  return fold;
}


function firstCard(state: FoldState) {
  const card = engineOf(state).slice.committed.sides.player.hand[0];
  if (card === undefined) throw new Error("empty hand");
  return card;
}


function play(state: FoldState, side = "player"): ReduceResult {
  return reduce(state, "BATTLE_ACTION", {
    side,
    action: { kind: "play", card: firstCard(state), from: "hand" },
  });
}


function promptId(state: FoldState, engine: Engine = FIXTURE_ENGINE) {
  const pending = pendingEnginePrompt(state.battle, engine);
  if (pending === null) throw new Error("no pending prompt");
  return pending.prompt.id;
}


function answer(
  state: FoldState,
  value: unknown,
  options: { side?: string; actor?: string; intervening?: EventContext["intervening"]; id?: PromptId } = {},
): ReduceResult {
  return reduce(
    state,
    "BATTLE_ANSWER",
    { side: options.side ?? "player", promptId: options.id ?? promptId(state), value },
    options,
  );
}


/** A journey battle whose points card has been played and won. */
function won(): FoldState {
  const prompted = applied(play(begun()));
  return applied(answer(prompted, FIXTURE_POINTS_MODE));
}


beforeEach(() => {
  registerReplayFixtureProviders();
});


afterEach(() => {
  clearReplayFixtureProviders();
});


describe("stale and invalid intents", () => {
  it("cancels a play at its prompt and bounces an answer to the cancelled prompt", () => {
    const state = begun();
    const prompted = applied(play(state));
    const id = promptId(prompted);
    const cancelled = applied(reduce(prompted, "BATTLE_CANCEL", { side: "player", promptId: id }));
    const fold = engineOf(cancelled);
    expect(fold.slice.inFlight).toBeNull();
    expect(stateHash(fold.slice.committed)).toBe(stateHash(engineOf(state).slice.committed));
    expect(fold.slice.attempt).toBeGreaterThan(engineOf(prompted).slice.attempt);
    expect(answer(cancelled, FIXTURE_POINTS_MODE, { id }).outcome).toBe("bounced");
    const replayed = applied(play(cancelled));
    expect(promptId(replayed)).not.toBe(id);
    expect(answer(replayed, FIXTURE_POINTS_MODE, { id }).outcome).toBe("bounced");
  });

  it("bounces intents that are not the intent's side's, illegal, or malformed", () => {
    const state = begun();
    expect(play(state, "enemy").outcome).toBe("bounced");
    expect(reduce(state, "BATTLE_ACTION", { side: "player", action: { kind: "play", card: "i9999", from: "hand" } }).outcome).toBe("bounced");
    expect(reduce(state, "BATTLE_ACTION", { side: "player", action: { kind: "dance" } }).outcome).toBe("bounced");
    expect(reduce(state, "BATTLE_ACTION", { action: { kind: "pass" } }).outcome).toBe("bounced");
    const prompted = applied(play(state));
    expect(answer(prompted, FIXTURE_POINTS_MODE, { side: "enemy" }).outcome).toBe("bounced");
    expect(answer(prompted, 7).outcome).toBe("bounced");
    expect(answer(prompted, { mode: 1 }).outcome).toBe("bounced");
    expect(reduce(prompted, "BATTLE_CANCEL", { side: "player", promptId: "nope" }).outcome).toBe("bounced");
    expect(reduce(prompted, "BATTLE_ACTION", { side: "player", action: { kind: "pass" } })).toMatchObject({
      outcome: "bounced",
      bounceReason: "prompt_pending",
    });
    expect(engineOf(prompted).slice.inFlight).not.toBeNull();
  });

  it("bounces intents for a finished battle and outside a journey battle", () => {
    const victorious = won();
    expect(reduce(victorious, "BATTLE_ACTION", { side: "player", action: { kind: "pass" } }).outcome).toBe("bounced");
    expect(reduce(atBattleSite(), "BATTLE_ACTION", { side: "player", action: { kind: "pass" } }).outcome).toBe("bounced");
  });

  it("bounces the tutorial sandbox's intents on a journey battle", () => {
    const state = begun();
    const card = firstCard(state);
    for (const [type, payload] of [
      ["BATTLE_COMMAND", { command: { id: "DEBUG_EDIT", edit: { kind: "SET_SCORE", side: "player", value: 9 } } }],
      ["BATTLE_GESTURE", { commands: [{ id: "SKIP_TO_REWARDS" }] }],
      ["BATTLE_PLAY_CARD", { battleCardId: card, targetBattleCardIds: [] }],
      ["BATTLE_REPOSITION_CHARACTER", { battleCardId: card, destination: { side: "player", zone: "backRank", slotId: "B0" } }],
      ["BATTLE_AI_BLOCK", { aiSide: "enemy" }],
      ["RESOLVE_PROMPT", { promptId: 1, resolution: { kind: "foresee" } }],
    ] as const) {
      const result = reduce(state, type, payload);
      expect(result.outcome, type).toBe("bounced");
      expect(result.state, type).toBe(state);
    }
  });
});


describe("LOAD_STATE", () => {
  /** A stable saved Ending snapshot at the pending-cleanup boundary. */
  function endingSnapshot(state: FoldState, marker: unknown, present = true) {
    const battle = journeyBattleOf(state.battle);
    if (battle === null) throw new Error("no journey battle");
    const committed = battle.engine.slice.committed;
    return { snapshot: state.journey, battle: {
      ...battle, engine: { ...battle.engine, slice: { ...battle.engine.slice, committed: {
        ...committed, turn: { ...committed.turn, phase: "ending", ...(present ? { endingCleanup: marker } : {}) },
      } } },
    } };
  }

  it.each([
    { label: "absent", marker: undefined, present: false },
    { label: "undefined", marker: undefined, present: true },
    { label: "literal true", marker: true, present: true },
  ])("keeps a valid $label endingCleanup marker through public load and JSON roundtrip", ({ marker, present }) => {
    const state = begun(), payload = endingSnapshot(state, marker, present);
    expect(validateLoadedState(state, payload)?.battle).toEqual(payload.battle);
    const roundtrip = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
    const loaded = validateLoadedState(state, roundtrip);
    expect(loaded?.battle).toEqual(roundtrip.battle);
    const turn = journeyBattleOf(loaded?.battle ?? null)?.engine.slice.committed.turn;
    expect(turn?.phase).toBe("ending");
    expect(turn?.endingCleanup).toBe(marker);
  });

  it.each([
    { label: "false", marker: false }, { label: "null", marker: null },
    { label: "string", marker: "true" }, { label: "zero", marker: 0 },
    { label: "one", marker: 1 }, { label: "object", marker: {} }, { label: "array", marker: [] },
  ])("rejects malformed $label endingCleanup marker through public load and JSON roundtrip", ({ marker }) => {
    const state = begun(), payload = endingSnapshot(state, marker);
    const direct = validateLoadedState(state, payload);
    const roundtrip = validateLoadedState(state, JSON.parse(JSON.stringify(payload)) as Record<string, unknown>);
    expect({ directAccepted: direct !== null, roundtripAccepted: roundtrip !== null })
      .toEqual({ directAccepted: false, roundtripAccepted: false });
  });

  it("roundtrips the bounded hand-return record and rejects malformed physical identity or zone entry", () => {
    const state = begun();
    const battle = journeyBattleOf(state.battle);
    if (battle === null) throw new Error("no journey battle");
    const instance = firstCard(state);
    const change = { kind: "banishedToHandUntil", instance, banishedAt: 1 };
    const payload = (record: unknown) => ({ ...battle, engine: { ...battle.engine,
      slice: { ...battle.engine.slice, committed: { ...battle.engine.slice.committed,
        floating: [{ id: "e1", controller: "player", source: instance, timestamp: 1,
          expiry: { at: "sourceLeavesPlay", source: instance }, change: record }],
      } } } });
    const load = (record: unknown) => validateLoadedState(state, { snapshot: state.journey, battle: payload(record) });
    const valid = payload(change);
    expect(load(change)?.battle).toEqual(valid);
    expect(validateLoadedState(state, JSON.parse(JSON.stringify({ snapshot: state.journey, battle: valid })) as Record<string, unknown>)?.battle).toEqual(valid);
    for (const banishedAt of [undefined, null, "1", 0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, {}, []]) {
      expect(load({ ...change, banishedAt }), JSON.stringify(banishedAt)).toBeNull();
    }
    for (const instance of [undefined, null, 1, "e1", "not-a-physical-card", {}, []]) {
      expect(load({ ...change, instance }), JSON.stringify(instance)).toBeNull();
    }
  });

  it("keeps a journey battle's init, engine battle and valid score snapshots, and refuses malformed metadata or mode", () => {
    const state = begun();
    const battle = journeyBattleOf(state.battle);
    if (battle === null) throw new Error("no journey battle");
    const load = (payload: unknown) => validateLoadedState(state, { snapshot: state.journey, battle: payload });

    expect(load({ ...battle, board: {}, effectQueue: [] })?.battle).toEqual(battle);
    // A battle folded before the engine (reducer protocol v28 and earlier):
    // a prototype board and no mode.
    expect(load({ init: battle.init, board: {}, effectQueue: [], pendingPrompt: null, dawnFired: {} })).toBeNull();
    expect(load({ mode: { kind: "journey" }, init: battle.init })).toBeNull();
    const instance = battle.engine.slice.committed.instances[firstCard(state)];
    if (instance.printing.kind !== "card") throw new Error("no fixture card printing");
    const trigger = {
      source: instance.id, controller: instance.controller,
      origin: { kind: "card", cardId: instance.printing.cardId, variant: instance.variant },
      ability: 0, node: null, subject: null,
    };
    const withScore = (scored: unknown) => ({
      ...battle, engine: { ...battle.engine, slice: { ...battle.engine.slice, committed: {
        ...battle.engine.slice.committed, triggerQueue: [{ ...trigger, ...(scored === undefined ? {} : { scored }) }],
      } } },
    });
    for (const scored of [undefined, 0, 1, 1.5, 3, Number.MAX_VALUE]) {
      const payload = withScore(scored);
      expect(load(payload)?.battle, String(scored)).toEqual(payload);
    }
    const malformed = ["not-a-number", "3", -2, NaN, Infinity, -Infinity, null, {}, [], true];
    expect(malformed.filter((scored) => load(withScore(scored)) !== null)).toEqual([]);
  });

  it("loads loop prompt visibility conservatively and rejects malformed or partial metadata", () => {
    const state = begun();
    const battle = journeyBattleOf(state.battle);
    if (battle === null) throw new Error("no journey battle");
    const committed = battle.engine.slice.committed;
    const load = (flags: unknown, where: "history" | "candidate", answered: boolean) => {
      const action = { steps: [{
        step: { kind: "resolveTop" },
        answers: answered ? [{ fingerprint: "fixture", value: 0 }] : [],
        ...(flags === undefined ? {} : { promptsVisibleToActor: flags }),
      }] };
      return validateLoadedState(state, { snapshot: state.journey, battle: {
        ...battle, engine: { ...battle.engine, slice: { ...battle.engine.slice, committed: {
          ...committed, loops: { ...committed.loops,
            actions: where === "history" ? [action] : [],
            candidate: where === "candidate" ? { id: "l1", side: "player", signature: "fixture", actions: [action] } : null,
          },
        } } },
      } });
    };
    for (const where of ["history", "candidate"] as const) {
      for (const flags of [undefined, [true], [false]]) expect(load(flags, where, true)).not.toBeNull();
      for (const flags of [undefined, []]) expect(load(flags, where, false)).not.toBeNull();
      for (const flags of [null, true, "true", {}, [], [true, false], [1], ["true"]]) expect(load(flags, where, true)).toBeNull();
      expect(load([true], where, false)).toBeNull();
    }
  });

  it("keeps the captured cards of a saved delayed trigger and queued trigger, and refuses malformed ones", () => {
    const state = begun();
    const battle = journeyBattleOf(state.battle);
    if (battle === null) throw new Error("no journey battle");
    const load = (payload: unknown) => validateLoadedState(state, { snapshot: state.journey, battle: payload });
    const instance = battle.engine.slice.committed.instances[firstCard(state)];
    if (instance.printing.kind !== "card") throw new Error("no fixture card printing");
    const origin = { kind: "card", cardId: instance.printing.cardId, variant: instance.variant };
    const withCaptured = (captured: unknown, where: "floating" | "queue" | "both" = "both") => {
      const extra = captured === undefined ? {} : { captured };
      const floatingExtra = where === "queue" ? {} : extra;
      const queueExtra = where === "floating" ? {} : extra;
      const committed = battle.engine.slice.committed;
      return {
        ...battle, engine: { ...battle.engine, slice: { ...battle.engine.slice, committed: {
          ...committed,
          floating: [{
            id: "e900", controller: instance.controller, source: instance.id, timestamp: 0, expiry: { at: "never" },
            change: { kind: "trigger", ref: { origin, ability: 0, node: 1 }, once: true, ...floatingExtra },
          }],
          triggerQueue: [{ source: instance.id, controller: instance.controller, origin, ability: 0, node: 1, subject: null, ...queueExtra }],
        } } },
      };
    };
    for (const captured of [undefined, [], [instance.id]]) {
      const payload = withCaptured(captured);
      expect(load(payload)?.battle, JSON.stringify(captured)).toEqual(payload);
    }
    const malformed = [null, instance.id, 3, {}, [null], [3], ["not-an-instance"], [instance.id, "e1"]];
    for (const where of ["floating", "queue"] as const) {
      expect(malformed.filter((captured) => load(withCaptured(captured, where)) !== null), where).toEqual([]);
    }
  });
});


describe("observed anonymous saved-state records", () => {
  it("reloads conservative observations and refuses malformed, partial and inconsistent records", () => {
    const state = begun();
    const battle = journeyBattleOf(state.battle);
    if (battle === null) throw new Error("no journey battle");
    const committed = battle.engine.slice.committed;
    const instance = committed.instances[firstCard(state)];
    const record = { instance: instance.id, owner: instance.owner, printing: instance.printing, variant: instance.variant,
      status: { ...instance.status, gainedSpark: 7 }, effects: [{ id: "e900", controller: instance.controller,
        source: "i0", timestamp: 0, expiry: { at: "never" }, change: { kind: "keyword", instance: instance.id, keyword: "veil", gains: false } }] };
    const load = (rememberedCards: unknown) => {
      const payload = { ...battle, engine: { ...battle.engine, slice: { ...battle.engine.slice, committed: {
        ...committed, ...(rememberedCards === undefined ? {} : { rememberedCards }),
      } } } };
      if (rememberedCards === undefined) delete payload.engine.slice.committed.rememberedCards;
      return validateLoadedState(state, JSON.parse(JSON.stringify({ snapshot: state.journey, battle: payload })) as Record<string, unknown>);
    };
    expect(load(undefined)).not.toBeNull();
    expect(load({ player: [], enemy: [] })).not.toBeNull();
    const valid = { player: [record], enemy: [] };
    const restored = load(valid);
    expect(restored).not.toBeNull();
    const loaded = journeyBattleOf(restored?.battle ?? null)?.engine.slice.committed.rememberedCards;
    expect(loaded).toEqual(valid);
    expect(loaded).not.toBe(valid);
    const malformed = [null, {}, [], { player: [] }, { player: [record], enemy: null },
      { player: [{ ...record, instance: "i999" }], enemy: [] }, { player: [record, record], enemy: [] },
      { player: [{ ...record, owner: "invalid" }], enemy: [] },
      { player: [{ ...record, effects: [{ ...record.effects[0], source: `i${committed.nextInstance}` }] }], enemy: [] },
      { player: [{ ...record, status: { ...record.status, gainedSpark: "7" } }], enemy: [] },
      { player: [{ ...record, effects: [{ ...record.effects[0], expiry: { at: "endOfTurn" } }] }], enemy: [] },
      { player: [{ ...record, effects: [{ ...record.effects[0], change: { ...record.effects[0].change, instance: "i999" } }] }], enemy: [] },
      { player: [{ ...record, effects: [record.effects[0], record.effects[0]] }], enemy: [] }];
    for (const invalid of malformed) expect(load(invalid), JSON.stringify(invalid)).toBeNull();
  });
});

describe("concurrent actors", () => {
  it("bounces an action based before a partner's event and applies a matching answer through it", () => {
    const state = begun();
    const partner = [{ seq, actor: testEventActor("ai:enemy"), type: "BATTLE_ACTION" as GameEvent["type"] }];
    expect(
      reduce(state, "BATTLE_ACTION", { side: "player", action: { kind: "pass" } }, { intervening: partner }),
    ).toMatchObject({ outcome: "bounced", bounceReason: "partner_conflict" });
    const prompted = applied(play(state));
    const window = [{ seq, actor: testEventActor("ai:enemy"), type: "BATTLE_ACTION" as GameEvent["type"] }];
    const answered = applied(answer(prompted, FIXTURE_POINTS_MODE, { intervening: window }));
    expect(engineOf(answered).slice.committed.result).not.toBeNull();
    expect(answer(prompted, FIXTURE_POINTS_MODE, { actor: "p2", intervening: window }).outcome).toBe("applied");
    expect(
      reduce(answered, "BATTLE_ANSWER", { side: "player", promptId: promptId(prompted), value: 1 }, { actor: "p2", intervening: window }).outcome,
    ).toBe("bounced");
  });
});
