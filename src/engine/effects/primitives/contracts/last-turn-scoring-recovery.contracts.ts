/** Strict public persistence, truthful legacy uncertainty, and transactional recovery for scoring history. */
import { afterEach, describe, expect, it } from "vitest";
import { createEngine } from "../../../engine";
import { createCatalog } from "../../../catalog";
import { event, scoredWithCharacterLastTurn } from "../../../dsl/builders";
import { createFoldAdapter } from "../../../fold/slice";
import { cycleHash, loopSignature } from "../../../loops/signature";
import { stateHash, serializeState } from "../../../state/hash";
import { BASE_VARIANT } from "../../../dsl/types";
import { opponent, SIDES, type InstanceId } from "../../../state/ids";
import type { BattleInit, BattleState } from "../../../state/types";
import { boardState } from "../../../testing/board";
import { SYNTHETIC_CARDS, testCatalog } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import { parseEngineBattleFold } from "../../../../rules/battle/fold";
import { getBattleInitProvider, registerBattleInitProvider } from "../../../../rules/battle/journey-battle";
import { GAME_ENGINE_CONFIG } from "../../../../rules/replay/replay";
import { registerReplayFixtureProviders, clearReplayFixtureProviders } from "../../../../rules/replay/fixture-providers";
import { createMemoryKeyValueStore } from "../../../../session/key-value-store";
import { createGameRepository, type StoredCheckpoint } from "../../../../session/game-repository";
import { createLocalGame, openLocalGame } from "../../../../session/local-game";
import { decodeGenesis, decodeEvent, isFoldableGenesis } from "../../../../eventlog/wire";
import { hashState } from "../../../../eventlog/hash";
import type { FoldState } from "../../../../rules/fold-state";
import { parseClientId, parseDreamwellCardId, parseGameId, parsePromptId } from "../../../../types/identifiers";
import { ifThen } from "../if-then";
import { gainEnergy } from "../gain-energy";
import battleFixture from "../../../../rules/replay/fixtures/battle.json";
import { scoringApplied, scoringBoard, scoringCards as c, scoringCopy as copy, scoringDeck, scoringEngine as engine, scoringHolds, scoringLists, scoringNext, scoringPlay, scoringSlice, v } from "./last-turn-scoring-support";

const originalProvider = getBattleInitProvider();
afterEach(() => { clearReplayFixtureProviders(); registerBattleInitProvider(originalProvider); });
const foldOf = (state: BattleState, decks = scoringLists(state)) => ({ init: { seed: state.seed, scoreToWin: 1000, decks, dreamwell: [] }, slice: scoringSlice(state) });

describe.each(SIDES)("last-turn scoring recovery for %s", side => {
  const other = opponent(side);
  it("rejects malformed physical windows independently and preserves allocated ceased identities", () => {
    const b = scoringBoard(side), scored = scoringNext(b.state).state;
    const fold = foldOf(scored, scoringLists(b.state));
    expect(parseEngineBattleFold(fold, engine.catalog)).toEqual(fold);
    const entry = { instance: b.ids[side].front[0]!, controller: side };
    const malformed = [null, true, [], {}, { current: [], previous: [], extra: true }, { current: [] },
      { current: "yes", previous: [] }, { current: [], previous: false },
      { current: [{ ...entry, controller: "neither" }], previous: [] }, { current: [], previous: [{ ...entry, instance: "bad" }] },
      { current: [], previous: [{ ...entry, instance: "i999999" }] }, { current: [], previous: [entry, entry] },
      { current: [], previous: [{ ...entry, extra: true }] }];
    for (const characterScoring of malformed) {
      const invalid = { ...fold, slice: { ...fold.slice, committed: { ...scored, characterScoring } } };
      expect(parseEngineBattleFold(invalid, engine.catalog), JSON.stringify(characterScoring)).toBeNull();
    }
    const ceased: InstanceId = `i${scored.nextInstance}`;
    const retained = copy(fold);
    retained.slice.committed.nextInstance += 1;
    retained.slice.committed.characterScoring!.previous = [{ instance: ceased, controller: side }];
    expect(parseEngineBattleFold(retained, engine.catalog)).not.toBeNull();
    expect(scoringHolds(retained.slice.committed, side)).toBe(false);
  });

  it("keeps absent and null legacy history unknown, refuses required consumers, and recovers only complete later windows", () => {
    const b = scoringBoard(side);
    const fold = foldOf(b.state);
    for (const characterScoring of [undefined, { current: null, previous: [] }, { current: [], previous: null }]) {
      const legacy = copy(fold);
      if (characterScoring === undefined) delete legacy.slice.committed.characterScoring;
      else legacy.slice.committed.characterScoring = characterScoring;
      expect(parseEngineBattleFold(legacy, engine.catalog)).toBeNull();
      if (characterScoring === undefined || characterScoring.previous === null) expect(() => scoringHolds(legacy.slice.committed, side)).toThrow();
    }
    const unrelated = createEngine(testCatalog(Object.values(c).map(card => ({ ...card, abilities: () => [] }))));
    const legacy = copy(fold); delete legacy.slice.committed.characterScoring;
    const original = serializeState(legacy.slice.committed);
    expect(parseEngineBattleFold(legacy, unrelated.catalog)).toEqual(legacy);
    expect(serializeState(legacy.slice.committed)).toBe(original);
    const next = passUntil(unrelated, legacy.slice.committed, at(unrelated, other, "day"));
    const positive = next.steps.find(step => step.events.some(e => e.kind === "laneResolved" && e.scored > 0));
    expect(positive).toBeDefined();
    expect(positive!.state.characterScoring).toBeUndefined();
    expect(next.state.characterScoring).toEqual({ current: [], previous: null });
    expect(() => scoringHolds(next.state, side)).toThrow();
    const known = passUntil(unrelated, next.state, at(unrelated, side, "day")).state;
    expect(known.characterScoring).toEqual({ current: [], previous: [] });
    expect(scoringHolds(known, side)).toBe(false);
  });

  it("checks retained history bases and ceased stack, queue, gained, and delayed origins without requiring unrelated legacy data", () => {
    const b = boardState(engine.catalog, { active: side, phase: "day", [side]: { front: [v.vanilla3.id], deck: scoringDeck }, [other]: { deck: scoringDeck } });
    const clean = foldOf(b.state);
    const origin = { kind: "card" as const, cardId: c.reader.id, variant: BASE_VARIANT };
    const ceased: InstanceId = `i${b.state.nextInstance}`;
    for (const location of ["stack", "queue", "delayed", "gained"] as const) {
      const retained = copy(clean);
      const state = retained.slice.committed;
      state.nextInstance += 1;
      if (location === "stack" || location === "gained") {
        state.stack.push({ kind: "ability", source: ceased, controller: side, ability: 0, choices: { modes: [], targets: [] }, x: null, optionalPaid: [],
          origin: location === "gained" ? { kind: "card", cardId: v.vanilla1.id, variant: BASE_VARIANT, gained: [{ cardId: c.reader.id, variant: BASE_VARIANT }] } : origin });
      } else if (location === "queue") {
        state.triggerQueue.push({ source: ceased, controller: side, origin, ability: 0, node: null, subject: null });
      } else {
        state.floating.push({ id: "e1", source: ceased, controller: side, timestamp: 0, expiry: { at: "never" }, change: { kind: "trigger", ref: { origin, ability: 0, node: 0 }, once: true } });
        state.nextEffect = 2;
      }
      expect(parseEngineBattleFold(retained, engine.catalog), location).not.toBeNull();
      const legacy = copy(retained); delete legacy.slice.committed.characterScoring;
      expect(parseEngineBattleFold(legacy, engine.catalog), location).toBeNull();
      const withHistory = { ...retained, slice: { ...retained.slice, history: { base: legacy.slice, entries: [] } } };
      expect(parseEngineBattleFold(withHistory, engine.catalog), location).toBeNull();
      expect(parseEngineBattleFold(clean, engine.catalog)).not.toBeNull();
    }
  });

  it("hashes its own semantic history, preserving absent legacy clone and JSON shapes", () => {
    const b = scoringBoard(side), state = scoringNext(b.state).state;
    const empty = copy(state); empty.characterScoring!.previous = [];
    expect(stateHash(empty)).not.toBe(stateHash(state));
    expect(cycleHash(empty)).not.toBe(cycleHash(state));
    expect(loopSignature(empty)).not.toBe(loopSignature(state));
    const legacy = copy(state); delete legacy.characterScoring;
    expect(stateHash(copy(legacy))).toBe(stateHash(legacy));
    expect(Object.prototype.hasOwnProperty.call(copy(legacy), "characterScoring")).toBe(false);
  });

  it("requires known windows for declared, retained, and queued Dreamwell condition sources", () => {
    const id = parseDreamwellCardId("5e5e5e5e-0000-4000-8000-000000623201");
    const catalog = createCatalog(SYNTHETIC_CARDS, [{ id, order: 1, energyAdded: 0, status: "authored", abilities: () => [event(ifThen(scoredWithCharacterLastTurn(), gainEnergy(1)))] }]);
    const b = boardState(catalog, { active: side, phase: "day", [side]: { deck: scoringDeck }, [other]: { deck: scoringDeck } });
    const fold = { ...foldOf(b.state), init: { ...foldOf(b.state).init, dreamwell: [id] } };
    expect(parseEngineBattleFold(fold, catalog)).not.toBeNull();
    delete fold.slice.committed.characterScoring;
    expect(parseEngineBattleFold(fold, catalog)).toBeNull();
    fold.init.dreamwell = [];
    fold.slice.committed.dreamwell.catalog = [id];
    expect(parseEngineBattleFold(fold, catalog)).toBeNull();
    fold.slice.committed.dreamwell.catalog = [];
    fold.slice.committed.triggerQueue = [{ kind: "dreamwellBonus", source: { kind: "dreamwell", id, side }, controller: side,
      origin: { kind: "dreamwell", id }, ability: 0, node: null, subject: null }];
    expect(parseEngineBattleFold(fold, catalog)).toBeNull();
    fold.slice.committed.characterScoring = { current: [], previous: [] };
    expect(parseEngineBattleFold(fold, catalog)).not.toBeNull();
  });

  it("replays cold pending decisions, refuses invalid and competing answers, and cancels without changing history", () => {
    const b = scoringBoard(side, { hand: [c.extra.id, c.modal.id] }, { hand: [] });
    const granted = scoringPlay(b.state, side, b.ids[side].hand[0]);
    const ready = scoringNext(granted.state, side).state;
    const adapter = createFoldAdapter(engine, { checkEventPrefix: true });
    const intent = { kind: "battleAction" as const, side, action: { kind: "play" as const, card: b.ids[side].hand[1], from: "hand" as const } };
    const opened = scoringApplied(adapter.reduce(scoringSlice(ready), intent));
    const pending = adapter.pending(opened);
    expect(pending).not.toBeNull();
    const cold = copy(opened), before = stateHash(cold.committed);
    const answer = { kind: "answer" as const, side, promptId: pending!.prompt.id, value: 0 };
    expect(adapter.reduce(cold, { ...answer, side: other })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(adapter.reduce(cold, { ...answer, promptId: parsePromptId("999:999:999") })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(adapter.reduce(cold, { ...answer, value: 999 })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(adapter.reduce(cold, { kind: "battleAction", side: other, action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(stateHash(cold.committed)).toBe(before);
    const cancelled = scoringApplied(adapter.reduce(cold, { kind: "cancel", side, promptId: pending!.prompt.id }));
    expect(stateHash(cancelled.committed)).toBe(stateHash(ready));
    const repeated = scoringApplied(adapter.reduce(cancelled, intent));
    expect(adapter.reduce(repeated, answer)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    const direct = scoringApplied(adapter.reduce(cold, answer));
    const restored = scoringApplied(createFoldAdapter(engine, { checkEventPrefix: true }).reduce(copy(cold), answer));
    expect(stateHash(restored.committed)).toBe(stateHash(direct.committed));
    expect(restored.committed.characterScoring).toEqual(ready.characterScoring);
    expect(restored.committed.sides[side].currentEnergy - ready.sides[side].currentEnergy).toBe(3);
    expect(adapter.reduce(direct, answer)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    expect(stateHash(cold.committed)).toBe(before);
  });

  it("rejects a required unknown hashed checkpoint and recovers preserved genesis and events without accepting raw imports", async () => {
    registerReplayFixtureProviders();
    const baseProvider = getBattleInitProvider()!;
    const ownDeck = [c.scorer.id, c.watcher.id, c.extra.id, c.paused.id, ...scoringDeck].map(cardId => ({ cardId }));
    const init: BattleInit = { seed: scoringBoard(side).state.seed, scoreToWin: 1000, startingSide: side,
      decks: { player: side === "player" ? ownDeck : scoringDeck.map(cardId => ({ cardId })), enemy: side === "enemy" ? ownDeck : scoringDeck.map(cardId => ({ cardId })) }, dreamwell: [], setup: {
        placements: [
          { side, deckIndex: 0, zone: "play", slot: { rank: "front", index: 0 } },
          { side, deckIndex: 1, zone: "play", slot: { rank: "back", index: 0 } },
          { side, deckIndex: 2, zone: "hand" }, { side, deckIndex: 3, zone: "hand" },
        ], sides: { player: { currentEnergy: 0, maxEnergy: 0, score: 0 }, enemy: { currentEnergy: 0, maxEnergy: 0, score: 0 } },
        turn: { active: side, phase: "day", round: 1, turnNumber: 1, sideTurns: { player: Number(side === "player"), enemy: Number(side === "enemy") }, lastNormal: side }, dreamwell: { deck: [], next: 0 },
      } };
    registerBattleInitProvider({ engine, beginBattle(input) { const declared = baseProvider.beginBattle(input); return declared === null ? null : { ...declared, engineInit: init }; } });
    const genesis = decodeGenesis(JSON.stringify(battleFixture.genesis));
    if (genesis === null || !isFoldableGenesis(genesis)) throw new Error("Missing fixture genesis");
    const store = createMemoryKeyValueStore(), repository = createGameRepository(store), gameId = parseGameId(`last-turn-reload-${side}`);
    const game = await createLocalGame(repository, GAME_ENGINE_CONFIG, { gameId, genesis, localPlayerId: parseClientId(`last-turn-${side}`) }, { checkpointInterval: 1, now: () => 0, eventClock: () => "2026-01-01T00:00:00.000Z" });
    try {
      for (const record of battleFixture.events) { const event = decodeEvent(JSON.stringify(record.event)); game.log.append({ type: event.type, payload: event.payload }); if (event.type === "BEGIN_BATTLE") break; }
      const action = (cardId: typeof c.extra.id) => {
        const state = game.log.state().battle!.engine.slice.committed;
        const id = state.sides[side].hand.find(id => state.instances[id].printing.kind === "card" && state.instances[id].printing.cardId === cardId)!;
        game.log.append({ type: "BATTLE_ACTION", payload: { side, action: { kind: "play", card: id, from: "hand" } } });
      };
      action(c.extra.id);
      for (let n = 0; ; n++) {
        const state = game.log.state().battle!.engine.slice.committed;
        if (state.turn.turnNumber > 1 && at(engine, side, "day")(state)) break;
        if (n > 30) throw new Error("Missing scoring extra turn");
        game.log.append({ type: "BATTLE_ACTION", payload: { side: engine.decision(state)!.side, action: { kind: "pass" } } });
      }
      expect(scoringHolds(game.log.state().battle!.engine.slice.committed, side)).toBe(true);
      action(c.paused.id);
      expect(createFoldAdapter(engine).pending(game.log.state().battle!.engine.slice)).not.toBeNull();
      await game.flush();
      const current = GAME_ENGINE_CONFIG.encode(game.log.state());
      const checkpoint = await store.get(`game/${gameId}/checkpoint`) as StoredCheckpoint;
      const exact = await openLocalGame(repository, GAME_ENGINE_CONFIG, gameId, { now: () => 0 });
      if (exact === null) throw new Error("Missing exact reload");
      try { expect(exact.opened).toMatchObject({ checkpointRejected: false, replayedEvents: 0 }); } finally { await exact.close(); }
      for (const boundary of ["absent", "current", "previous", "history"] as const) {
        const saved = JSON.parse(checkpoint.state) as FoldState;
        const fold = saved.battle!.engine;
        if (boundary === "absent") delete fold.slice.committed.characterScoring;
        else if (boundary === "history") { const base = copy(fold.slice); delete base.committed.characterScoring; Object.assign(fold, { slice: { ...fold.slice, history: { base, entries: [] } } }); }
        else fold.slice.committed.characterScoring![boundary] = null;
        await store.putAll([[`game/${gameId}/checkpoint`, { ...checkpoint, state: JSON.stringify(saved), stateHash: hashState(saved) }]]);
        const recovered = await openLocalGame(repository, GAME_ENGINE_CONFIG, gameId, { now: () => 0 });
        if (recovered === null) throw new Error("Missing recovery");
        try { expect(recovered.opened).toMatchObject({ checkpointSeq: 0, checkpointRejected: true, replayFoldErrors: 0 }); expect(GAME_ENGINE_CONFIG.encode(recovered.log.state())).toBe(current); } finally { await recovered.close(); }
        const count = (await repository.readEvents(gameId, 0)).length;
        game.log.append({ type: "LOAD_STATE", payload: { snapshot: saved.journey, battle: saved.battle } });
        await game.flush();
        expect(GAME_ENGINE_CONFIG.encode(game.log.state())).toBe(current);
        expect((await repository.readEvents(gameId, 0)).length).toBe(count + 1);
      }
    } finally { await game.close(); }
  });
});
