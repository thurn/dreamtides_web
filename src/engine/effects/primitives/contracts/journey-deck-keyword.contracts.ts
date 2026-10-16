import type { ResolvingEffect } from "../../registry";
/** Original physical journey-deck Awakened, through public engine/fold/persistence APIs. */
import { afterEach, describe, expect, it } from "vitest";
import { createEngine, type Engine } from "../../../engine";
import type { EngineCardDefinition, EngineDreamsignDefinition } from "../../../catalog";
import { activated, anyCharacter, characterYouControl, energy, event, self, staticAbility, target } from "../../../dsl/builders";
import { onMaterialized, triggered, whenMaterialize } from "../../../dsl/triggers";
import { NO_DECK_MODS, type AbilityList, type PlayerRef } from "../../../dsl/types";
import { createFoldAdapter, type BattleIntent, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { applyDebugOp, withHistory } from "../../../debug/debug-actions";
import { characteristicsOf } from "../../../continuous/characteristics";
import { hasKeyword } from "../../../rules/keywords";
import { isFigment } from "../../../rules/zones";
import { cloneState } from "../../../state/clone";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { battleSeed, opponent, SIDES, type InstanceId, type Side } from "../../../state/ids";
import type { BattleInit, BattleState, DeckEntry } from "../../../state/types";
import { InlineSource, NO_PROMPTS } from "../../../steps/sources";
import { randomLegalAnswer } from "../../../prompts/answers";
import { invariantViolations } from "../../../testing/invariants";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { parseClientId, parseDreamsignId, parseGameId, parsePromptId } from "../../../../types/identifiers";
import { parseEngineBattleFold } from "../../../../rules/battle/fold";
import { GAME_ENGINE_CONFIG } from "../../../../rules/replay/replay";
import { registerReplayFixtureProviders, clearReplayFixtureProviders } from "../../../../rules/replay/fixture-providers";
import { getBattleInitProvider, registerBattleInitProvider } from "../../../../rules/battle/journey-battle";
import type { FoldState } from "../../../../rules/fold-state";
import { createMemoryKeyValueStore } from "../../../../session/key-value-store";
import { createGameRepository, type StoredCheckpoint } from "../../../../session/game-repository";
import { createLocalGame, openLocalGame } from "../../../../session/local-game";
import { decodeEvent, decodeGenesis, isFoldableGenesis } from "../../../../eventlog/wire";
import { hashState } from "../../../../eventlog/hash";
import battleFixture from "../../../../rules/replay/fixtures/battle.json";
import { journeyDeckKeyword } from "../journey-deck-keyword";
import { createCopyInHand } from "../create-copy-in-hand";
import { createCard } from "../create-card";
import { materializeFigmentCopy } from "../materialize-figment-copy";
import { gainControl } from "../gain-control";
import { takeFromAmong, opponentHand } from "../take-from-among";
import { banish } from "../banish";
import { dissolve } from "../dissolve";
import { sequence } from "../sequence";
import { gainPoints } from "../gain-points";

const SIGN = parseDreamsignId("5e5e5e5e-0000-4000-8000-000000000610");
const fixture = (n: number, cost: number, abilities: AbilityList = () => [], cardType: "character" | "event" = "character"): EngineCardDefinition => ({
  id: syntheticId(0x61000 + n), cardType, costs: [energy(cost)], spark: cardType === "character" ? 2 : null,
  subtype: cardType === "character" ? "Warrior" : "", speed: "standard", status: "authored", abilities,
});
const high = fixture(1, 4, () => [triggered(onMaterialized(), gainPoints(1))]);
const low = fixture(2, 3);
const costly = fixture(3, 5);
const spell = fixture(4, 4, () => [], "event");
const copier = fixture(5, 4, () => [activated([], createCopyInHand(self())), activated([], createCard(high.id)), activated([], materializeFigmentCopy(self()))]);
const thief = fixture(6, 4, () => [activated([], gainControl(target(anyCharacter()))), activated([], takeFromAmong(opponentHand()))]);
const banisher = fixture(7, 0, () => [event(banish(target(anyCharacter())))], "event");
const killer = fixture(8, 0, () => [activated([], dissolve(target(anyCharacter())))], "character");
const response = { ...fixture(9, 0, () => [event(gainPoints(0))], "event"), speed: "interrupt" as const };
// Deliberately malformed runtime ingress: resolution must fail after the play commits.
const broken = fixture(10, 0, () => [event(sequence(createCard(high.id), journeyDeckKeyword("you", {}, "awakened") as unknown as ResolvingEffect))], "event");
const watcher = fixture(11, 0, () => [triggered(whenMaterialize(characterYouControl({ exhausted: false })), gainPoints(10)),
  triggered(whenMaterialize(characterYouControl({ exhausted: true })), gainPoints(100))]);
const cards = [high, low, costly, spell, copier, thief, banisher, killer, response, broken, watcher];
const entry = (card: EngineCardDefinition): DeckEntry => ({ cardId: card.id });
const sign = (player: PlayerRef = "you"): EngineDreamsignDefinition => ({ id: SIGN, status: "authored",
  abilities: () => [staticAbility(journeyDeckKeyword(player, { cardType: "character", costAtLeast: 4 }, "awakened"))] });
type Options = { readonly own?: readonly DeckEntry[]; readonly other?: readonly DeckEntry[]; readonly placements?: NonNullable<BattleInit["setup"]>["placements"]; readonly copies?: number; readonly player?: PlayerRef };
function world(side: Side, options: Options = {}) {
  const engine = createEngine(testCatalog(cards, { dreamsigns: [sign(options.player)] }));
  const own = options.own ?? [entry(high), entry(high), entry(high), entry(high), entry(low), entry(spell)];
  const other = options.other ?? [entry(high)];
  const init: BattleInit = { seed: battleSeed(`keyword-${side}`), startingSide: side, scoreToWin: 1000,
    decks: { [side]: own, [opponent(side)]: other } as BattleInit["decks"], dreamwell: [],
    dreamsigns: { [side]: Array.from({ length: options.copies ?? 1 }, () => SIGN) },
    setup: { placements: options.placements ?? [{ side, deckIndex: 0, zone: "play", slot: { rank: "back", index: 0 } }, { side, deckIndex: 1, zone: "hand" }, { side, deckIndex: 2, zone: "void" }],
      sides: { player: { currentEnergy: 20, maxEnergy: 20, score: 0 }, enemy: { currentEnergy: 20, maxEnergy: 20, score: 0 } },
      turn: { active: side, phase: "day", round: 1, turnNumber: 1, sideTurns: { player: side === "player" ? 1 : 0, enemy: side === "enemy" ? 1 : 0 }, lastNormal: side }, dreamwell: { deck: [], next: 0 } } };
  return { engine, init, state: engine.createBattle(init, NO_PROMPTS).state };
}
type World = ReturnType<typeof world>;
const has = (w: World, state: BattleState, id: InstanceId) => hasKeyword(state, w.engine.catalog, id, "awakened");
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
const applied = (result: IntentOutcome) => { if (result.kind !== "applied" || result.error !== null) throw Error("Public intent rejected"); return result; };
function act(w: World, state: BattleState, side: Side, action: Parameters<Engine["apply"]>[2], chosen?: InstanceId) {
  const before = serializeState(state);
  const source = new InlineSource({ player: p => (p.kind === "chooseCards" || p.kind === "chooseTargets") && chosen !== undefined && p.candidates.includes(chosen) ? [chosen] : randomLegalAnswer(p, () => 0),
    enemy: p => (p.kind === "chooseCards" || p.kind === "chooseTargets") && chosen !== undefined && p.candidates.includes(chosen) ? [chosen] : randomLegalAnswer(p, () => 0) });
  const started = w.engine.apply(state, side, action, source);
  const settled = passUntil(w.engine, started.state, next => next.stack.length === 0 && next.triggerQueue.length === 0, source);
  expect(serializeState(state)).toBe(before); expect(invariantViolations(settled.state, w.engine.catalog)).toEqual([]);
  return { state: settled.state, events: [...started.events, ...settled.events] };
}
function legacy(state: BattleState): BattleState {
  const saved = deserializeState(serializeState(state));
  for (const card of Object.values(saved.instances)) delete (card as { journeyDeck?: boolean }).journeyDeck;
  return saved;
}
afterEach(clearReplayFixtureProviders);

describe("journey-deck keyword", () => {
  it.each(SIDES)("covers original physical cards in every zone without changing spark for %s", side => {
    const w = world(side), owned = Object.values(w.state.instances).filter(c => c.owner === side);
    expect(owned.map(c => [c.zone, has(w, w.state, c.id)])).toEqual([["play", true], ["hand", true], ["void", true], ["deck", true], ["deck", false], ["deck", false]]);
    expect(owned.every(c => c.status.gainedSpark === 0)).toBe(true);
    for (const card of owned) expect(characteristicsOf(w.state, w.engine.catalog, card.id).spark).toBe(card.printing.kind === "card" && card.printing.cardId === spell.id ? null : 2);
    expect(has(w, w.state, w.state.sides[opponent(side)].deck[0])).toBe(false);
    const saved = serializeState(w.state); expect(cloneState(w.state)).toEqual(w.state);
    expect(stateHash(deserializeState(saved))).toBe(stateHash(w.state)); expect(serializeState(w.state)).toBe(saved);
  });

  it.each(SIDES)("uses variant and D39 copiable boundary and effective character type for %s", side => {
    const mods = (costReduction: number, cardType?: "character" | "event") => ({ ...NO_DECK_MODS, costReduction, ...(cardType === undefined ? {} : { typeChange: { cardType, subtype: "Mage" as const } }) });
    const w = world(side, { own: [entry(high), { ...entry(costly), amplified: true, deckMods: mods(1) }, { ...entry(high), deckMods: mods(1) },
      { ...entry(spell), deckMods: mods(0, "character") }, { ...entry(high), deckMods: mods(0, "event") }, entry(low)] });
    const own = Object.values(w.state.instances).filter(c => c.owner === side);
    expect(own.map(c => has(w, w.state, c.id))).toEqual([true, true, false, true, false, false]);
    expect(own[1].variant).toMatchObject({ amplified: true, deckMods: mods(1) });
  });

  it.each(SIDES)("excludes created same-printing cards and figment copies for %s", side => {
    const w = world(side, { own: [entry(copier), entry(high), entry(high)] });
    const original = new Set(Object.keys(w.state.instances)), source = w.state.sides[side].backRank[0]!;
    let state = w.state;
    for (const ability of [0, 1, 2]) state = act(w, state, side, { kind: "activate", source, ability }).state;
    const made = Object.values(state.instances).filter(c => !original.has(c.id)); expect(made).toHaveLength(3);
    expect(made.every(c => c.status.created && c.journeyDeck === false && !has(w, state, c.id))).toBe(true);
    expect(made.some(c => c.printing.kind === "card" && c.printing.cardId === copier.id)).toBe(true);
    const figment = made.find(isFigment); expect(figment).toBeDefined(); expect(figment!.status.exhausted).toBe(true);
    for (const viewer of SIDES) { const seen = w.engine.view(state, viewer), sampled = w.engine.determinize(seen, w.init.decks, () => 0.37); expect(w.engine.view(sampled, viewer)).toEqual(seen); }
    const added = applyDebugOp(w.engine, withHistory(slice(state)), { kind: "addCard", side, card: high.id, zone: "hand" });
    if (added.kind !== "applied") throw Error("Synthetic debug addition rejected");
    const id = added.slice.committed.sides[side].hand[added.slice.committed.sides[side].hand.length - 1];
    expect(added.slice.committed.instances[id].journeyDeck).toBe(false); expect(has(w, added.slice.committed, id)).toBe(false);
  });

  it.each(SIDES)("keeps original-owner membership under control and holder changes for %s", side => {
    const owner = opponent(side);
    const w = world(side, { player: "opponent", own: [entry(thief), entry(high), entry(high)], other: [entry(high), entry(high)],
      placements: [{ side, deckIndex: 0, zone: "play", slot: { rank: "back", index: 0 } }, { side: owner, deckIndex: 0, zone: "play", slot: { rank: "back", index: 0 } }, { side: owner, deckIndex: 1, zone: "hand" }] });
    const source = w.state.sides[side].backRank[0]!, victim = w.state.sides[owner].backRank[0]!, held = w.state.sides[owner].hand[0];
    let state = act(w, w.state, side, { kind: "activate", source, ability: 0 }, victim).state;
    state = act(w, state, side, { kind: "activate", source, ability: 1 }, held).state;
    for (const id of [victim, held]) { expect(state.instances[id]).toMatchObject({ owner, controller: side, journeyDeck: true }); expect(has(w, state, id)).toBe(true); }
    expect(state.sides[side].hand).toContain(held); expect(has(w, state, source)).toBe(false);
  });

  it.each(SIDES)("is present on the real stack and ready at materialization before watcher resolution for %s", side => {
    const other = opponent(side);
    const w = world(side, { own: [entry(watcher), entry(high), entry(banisher)], other: [entry(response)],
      placements: [{ side, deckIndex: 0, zone: "play", slot: { rank: "back", index: 0 } }, { side, deckIndex: 1, zone: "hand" }, { side, deckIndex: 2, zone: "hand" }, { side: other, deckIndex: 0, zone: "hand" }] });
    const adapter = createFoldAdapter(w.engine), card = w.state.sides[side].hand[0];
    const played = applied(adapter.reduce(slice(w.state), { kind: "battleAction", side, action: { kind: "play", card, from: "hand" } }));
    expect(played.slice.committed.instances[card].zone).toBe("stack"); expect(has(w, played.slice.committed, card)).toBe(true);
    const resolved = applied(adapter.reduce(played.slice, { kind: "battleAction", side: other, action: { kind: "pass" } }, { presented: e => e.kind === "materialized", limit: 1 }));
    const event = resolved.published.find(e => e.kind === "materialized" && e.instance === card); if (event === undefined) throw Error("Missing entry event");
    const atEntry = adapter.observed(event); if (atEntry === undefined) throw Error("Missing public event snapshot");
    expect(has(w, atEntry, card)).toBe(true); expect(atEntry.instances[card].status.exhausted).toBe(false);
    expect(atEntry.sides[side].score).toBe(0);
    const settled = passUntil(w.engine, resolved.slice.committed, s => s.stack.length === 0 && s.triggerQueue.length === 0).state;
    expect(settled.sides[side].score).toBe(11);
    const banished = act(w, settled, side, { kind: "play", card: w.state.sides[side].hand[1], from: "hand" }, card).state;
    expect(banished.instances[card].zone).toBe("banished"); expect(has(w, banished, card)).toBe(true);
  });

  it.each(SIDES)("deduplicates held sources and preserves hidden reconstructed knowledge for %s", side => {
    for (const copies of [1, 2]) {
      const w = world(side, { copies }); const before = serializeState(w.state);
      for (const viewer of SIDES) {
        const seen = w.engine.view(w.state, viewer), sampled = w.engine.determinize(seen, w.init.decks, () => 0.37);
        expect(w.engine.view(sampled, viewer)).toEqual(seen);
        expect(Object.values(sampled.instances).filter(c => c.owner === side && c.journeyDeck === true)).toHaveLength(w.init.decks[side].length);
        const hand = w.state.sides[side].hand[0];
        if (viewer === side) expect(seen.instances[hand].characteristics.keywords.filter(k => k === "awakened")).toEqual(["awakened"]);
        else expect(seen.instances[hand]).toBeUndefined();
        expect(seen.floating).toEqual([]);
      }
      expect(serializeState(w.state)).toBe(before);
    }
  });

  it.each(SIDES)("preserves membership through public refusal, pending reload, stale inputs and cancel for %s", side => {
    const w = world(side, { own: [entry(killer), entry(high), entry(high)], other: [entry(high), entry(high)],
      placements: [{ side, deckIndex: 0, zone: "play", slot: { rank: "back", index: 0 } }, { side, deckIndex: 1, zone: "hand" }, { side: opponent(side), deckIndex: 0, zone: "play", slot: { rank: "back", index: 0 } }, { side: opponent(side), deckIndex: 1, zone: "play", slot: { rank: "back", index: 1 } }] });
    const adapter = createFoldAdapter(w.engine), original = slice(w.state), before = serializeState(w.state);
    const caller = w.state.sides[side].backRank[0]!;
    const intent: BattleIntent = { kind: "battleAction", side, action: { kind: "activate", source: caller, ability: 0 } };
    const pending = applied(adapter.reduce(original, intent)), prompt = adapter.pending(pending.slice); if (prompt === null) throw Error("Missing choice");
    const cold = JSON.parse(JSON.stringify(pending.slice)) as BattleSlice;
    expect(adapter.pending(cold)?.prompt).toEqual(prompt.prompt); expect(serializeState(cold.committed)).toBe(before);
    expect(adapter.reduce(cold, { kind: "battleAction", side: opponent(side), action: { kind: "pass" } }).kind).toBe("bounced");
    expect(adapter.reduce(cold, { kind: "answer", side: opponent(side), promptId: prompt.prompt.id, value: [] }).kind).toBe("bounced");
    expect(adapter.reduce(cold, { kind: "cancel", side, promptId: parsePromptId("999:999:999") }).kind).toBe("bounced");
    const cancelled = applied(adapter.reduce(cold, { kind: "cancel", side, promptId: prompt.prompt.id }));
    expect(serializeState(cancelled.slice.committed)).toBe(before); expect(has(w, cancelled.slice.committed, w.state.sides[side].hand[0])).toBe(true);
    const victim = w.state.sides[opponent(side)].backRank[0]!;
    const answer: BattleIntent = { kind: "answer", side, promptId: prompt.prompt.id, value: [victim] };
    const completed = applied(adapter.reduce(cold, answer));
    const replay = applied(createFoldAdapter(w.engine).reduce(applied(createFoldAdapter(w.engine).reduce(original, intent)).slice, answer));
    expect(serializeState(replay.slice.committed)).toBe(serializeState(completed.slice.committed));
    expect(replay.published).toEqual(completed.published);
  });

  it.each(SIDES)("rolls back a resolution prefix when a malformed event resolves the static-only node for %s", side => {
    const other = opponent(side), w = world(side, { own: [entry(low), entry(broken), entry(high)], other: [entry(response)],
      placements: [{ side, deckIndex: 0, zone: "play", slot: { rank: "back", index: 0 } }, { side, deckIndex: 1, zone: "hand" }, { side: other, deckIndex: 0, zone: "hand" }] });
    const adapter = createFoldAdapter(w.engine), card = w.state.sides[side].hand[0];
    const played = applied(adapter.reduce(slice(w.state), { kind: "battleAction", side, action: { kind: "play", card, from: "hand" } }));
    expect(played.slice.committed.instances[card].zone).toBe("stack");
    const failed = adapter.reduce(played.slice, { kind: "battleAction", side: other, action: { kind: "pass" } });
    if (failed.kind !== "applied") throw Error("Expected contained resolution error");
    expect(failed.error).not.toBeNull(); expect(failed.slice.committed.instances).toEqual(played.slice.committed.instances);
    expect(failed.slice.committed.nextInstance).toBe(played.slice.committed.nextInstance); expect(failed.slice.committed.floating).toEqual([]);
  });

  it.each(SIDES)("rejects missing and inconsistent required provenance while accepting an unrelated legacy control for %s", side => {
    const w = world(side), base = { init: w.init, slice: withHistory(slice(w.state)) };
    expect(parseEngineBattleFold(base, w.engine.catalog)).not.toBeNull();
    expect(parseEngineBattleFold({ init: w.init, slice: slice(legacy(w.state)) }, w.engine.catalog)).toBeNull();
    for (const boundary of ["current", "history"] as const) {
      const saved = JSON.parse(JSON.stringify(base)) as typeof base;
      const state = boundary === "current" ? saved.slice.committed : saved.slice.history!.base.committed;
      const original = Object.values(state.instances).find(c => c.owner === side)!;
      (original as { journeyDeck: boolean }).journeyDeck = false;
      expect(parseEngineBattleFold(saved, w.engine.catalog)).toBeNull();
    }
    const plain = world(side, { copies: 0 });
    expect(parseEngineBattleFold({ init: plain.init, slice: slice(legacy(plain.state)) }, plain.engine.catalog)).not.toBeNull();
  });

  it.each(SIDES)("uses persisted genesis and event replay to recover a new-op checkpoint with missing origins for %s", async side => {
    registerReplayFixtureProviders(); const provider = getBattleInitProvider(); if (provider === null) throw Error("Missing synthetic provider");
    const engine = createEngine({ ...provider.engine.catalog, dreamsign: id => id === SIGN ? sign() : provider.engine.catalog.dreamsign(id) });
    registerBattleInitProvider({ ...provider, engine, beginBattle(input) { const declared = provider.beginBattle(input); return declared === null ? null : { ...declared, engineInit: { ...declared.engineInit, dreamsigns: { [side]: [SIGN] } } }; } });
    const genesis = decodeGenesis(JSON.stringify(battleFixture.genesis)); if (genesis === null || !isFoldableGenesis(genesis)) throw Error("Missing synthetic genesis");
    const store = createMemoryKeyValueStore(), repository = createGameRepository(store), gameId = parseGameId(`keyword-origin-${side}`);
    const game = await createLocalGame(repository, GAME_ENGINE_CONFIG, { gameId, genesis, localPlayerId: parseClientId("keyword-actor") }, { checkpointInterval: 1, now: () => 0, eventClock: () => "2026-01-01T00:00:00.000Z" });
    try {
      for (const record of battleFixture.events) { const e = decodeEvent(JSON.stringify(record.event)); game.log.append({ type: e.type, payload: e.payload }); if (e.type === "BEGIN_BATTLE") break; }
      await game.flush(); const expected = GAME_ENGINE_CONFIG.encode(game.log.state());
      const checkpoint = await store.get(`game/${gameId}/checkpoint`) as StoredCheckpoint;
      const saved = JSON.parse(checkpoint.state) as FoldState; if (saved.battle === null) throw Error("Missing battle");
      const slice = saved.battle.engine.slice;
      const altered = { ...saved, battle: { ...saved.battle, engine: { ...saved.battle.engine, slice: { ...slice, committed: legacy(slice.committed) } } } };
      await store.putAll([[`game/${gameId}/checkpoint`, { ...checkpoint, state: JSON.stringify(altered), stateHash: hashState(altered) }]]);
      const reopened = await openLocalGame(repository, GAME_ENGINE_CONFIG, gameId, { now: () => 0 }); if (reopened === null) throw Error("Missing reopened game");
      try { expect(reopened.opened).toMatchObject({ checkpointSeq: 0, checkpointRejected: true, replayedEvents: checkpoint.seq, replayFoldErrors: 0 }); expect(GAME_ENGINE_CONFIG.encode(reopened.log.state())).toBe(expected); }
      finally { await reopened.close(); }
    } finally { await game.close(); }
  });
});
