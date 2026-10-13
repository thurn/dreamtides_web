/** Fast means Fast or Interrupt; played speed is a historical fact, including after concealment. */
import { describe, expect, it } from "vitest";
import { instanceCard, type EngineCardDefinition } from "../../../catalog";
import { cardMatchesFilter, characteristicsOf, matchesEveryCard, matchesFilter, playedMatchesFilter, type FilterSubject } from "../../../continuous/characteristics";
import { countCards, energy, event, everyIn, self, staticAbility, triggerSubjectCost } from "../../../dsl/builders";
import { zoneCount } from "../../../dsl/selectors";
import { triggered, whenDiscard, whenYouPlay } from "../../../dsl/triggers";
import { NO_DECK_MODS, type Speed } from "../../../dsl/types";
import { createEngine, type Engine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { instanceOrigin } from "../../../rules/activation";
import { instanceOf } from "../../../rules/zones";
import { resolveEffect } from "../../interpreter";
import { serializeState, deserializeState, stateHash } from "../../../state/hash";
import { SIDES, opponent, type InstanceId } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import type { Step } from "../../../steps/kinds";
import { runStep } from "../../../steps/runner";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { comparableView } from "../../../testing/determinization-fidelity";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import { parseBattleId, parseOpponentId, parseSiteId } from "../../../../types/identifiers";
import { createCopyInHand } from "../create-copy-in-hand";
import { discard } from "../discard";
import { discover } from "../discover";
import { drawMatching } from "../draw-matching";
import { gainPoints } from "../gain-points";
import { cardsIn, grantCardKeyword } from "../grant-card-keyword";
import { sequence } from "../sequence";
import { shuffleInto } from "../shuffle-into";
import { sparkModifier } from "../spark-modifier";

const fixture = (index: number, speed: Speed = "standard"): EngineCardDefinition => ({ ...v.event0, id: syntheticId(0x581000 + index), speed });
const standard = fixture(1), fast = fixture(2, "fast"), interrupt = fixture(3, "interrupt");
const counter: EngineCardDefinition = { ...v.vanilla0, id: syntheticId(0x581004), abilities: () => [
  triggered(whenYouPlay({ fast: true }), gainPoints(1), { oncePerTurn: true }),
  triggered(whenYouPlay({ fast: true }, 2), gainPoints(4)),
] };
const copyMaker = { ...fixture(5), abilities: () => [event(createCopyInHand(everyIn("void", { fast: true })))] };
const shuffler = { ...fixture(6), abilities: () => [event(shuffleInto([everyIn("void", { fast: true })]))] };
const staticReader: EngineCardDefinition = { ...v.vanilla0, id: syntheticId(0x581007), abilities: () => [
  staticAbility(sparkModifier(self(), countCards("void", { fast: true }))),
  staticAbility(grantCardKeyword(cardsIn("hand", { fast: true }), "vengeful")),
] };
const offer = { ...fixture(8), abilities: () => [event(discover({ fast: true }))] };
const simpleDraw = { ...fixture(9), abilities: () => [event(drawMatching({ fast: true }))] };
const mixedDraw = { ...fixture(10), abilities: () => [event(sequence(drawMatching({ fast: true }), drawMatching({ costAtLeast: 8 })))] };
const failing: EngineCardDefinition = { ...fixture(11, "fast"), synthetic: { resolve(ctx, item) {
  resolveEffect(ctx, drawMatching({ fast: true }), { source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)), ability: 0, controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] } });
  throw new Error("synthetic failure after Fast draw");
} } };
const catalog = testCatalog([failing,standard, fast, interrupt, counter, copyMaker, shuffler, staticReader, offer, simpleDraw, mixedDraw]);
const engine = createEngine(catalog);
const filler = Array.from({ length: 12 }, () => v.vanilla1.id);

function step(e: Engine, state: BattleState, action: Step, answers: ConstructorParameters<typeof ScriptedSource>[0] = []) {
  const source = answers.length === 0 ? NO_PROMPTS : new ScriptedSource(answers);
  const result = runStep(state, action, source, e.catalog);
  if (result.kind !== "done") throw new Error(`Unexpected ${result.prompt.kind}`);
  if (source instanceof ScriptedSource) source.assertExhausted();
  return result;
}
function settleTriggers(e: Engine, state: BattleState): BattleState {
  while (state.triggerQueue.length > 0) state = step(e, state, { kind: "resolveTrigger" }).state;
  return state;
}
function play(e: Engine, state: BattleState, card: InstanceId): BattleState {
  return settleTriggers(e, step(e, state, { kind: "play", card, from: "hand" }).state);
}
const sliceOf = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(result: IntentOutcome): BattleSlice {
  if (result.kind !== "applied" || result.error !== null) throw new Error(JSON.stringify(result));
  return result.slice;
}
function saved(slice: BattleSlice) {
  return { mode: { kind: "journey" }, init: { battleId: parseBattleId("battle-fast-filter"), siteId: parseSiteId("site-fast-filter"), nodeId: null,
    completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false,
    enemyDescriptor: { id: parseOpponentId("opponent-fast-filter"), name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] }, avatarSummary: null, cardDefinitions: [],
  }, engine: { init: { seed: "seed", scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: JSON.parse(JSON.stringify(slice)) as BattleSlice } };
}

describe("Fast card filters", () => {
  it("includes Interrupt, excludes Standard and unknown, and conjoins all existing predicates", () => {
    const subject: FilterSubject = { cardType: "character", subtype: "Warrior", allTypes: false, cost: 2, spark: 3 };
    for (const speed of [undefined, "standard", "fast", "interrupt"] as const) {
      const card = { ...subject, speed };
      expect(matchesFilter(card, {})).toBe(true);
      expect(matchesFilter(card, { fast: true })).toBe(speed === "fast" || speed === "interrupt");
      expect(matchesFilter(card, { fast: true, cardType: "character", subtype: "Warrior", costAtLeast: 2, costAtMost: 2, sparkAtLeast: 3, sparkAtMost: 3 })).toBe(speed === "fast" || speed === "interrupt");
    }
    for (const filter of [{ cardType: "event" }, { subtype: "Mage" }, { costAtMost: 1 }, { costAtLeast: 3 }, { sparkAtMost: 2 }, { sparkAtLeast: 4 }] as const) {
      expect(matchesFilter({ ...subject, speed: "fast" }, { fast: true, ...filter })).toBe(false);
    }
    expect(matchesEveryCard({})).toBe(true);
    expect(matchesEveryCard({ fast: true })).toBe(false);
  });

  it.each(SIDES)("shares effective speed across current filters, void counts and static grants for %s", side => {
    const { state, ids } = boardState(catalog, { active: side, phase: "day", [side]: { back: [staticReader.id], hand: [standard.id, fast.id, interrupt.id], void: [standard.id, fast.id, interrupt.id, standard.id] } });
    state.instances[ids[side].hand[0]] = { ...state.instances[ids[side].hand[0]], variant: { amplified: false, deckMods: { ...NO_DECK_MODS, fast: true } } };
    state.instances[ids[side].void[3]] = { ...state.instances[ids[side].void[3]], variant: { amplified: false, deckMods: { ...NO_DECK_MODS, fast: true } } };
    expect(ids[side].void.map(id => cardMatchesFilter(state, catalog, id, { fast: true }))).toEqual([false, true, true, true]);
    expect(zoneCount(state, catalog, countCards("void", { fast: true }), side)).toBe(3);
    expect(characteristicsOf(state, catalog, ids[side].back[0]!).spark).toBe(3);
    expect(ids[side].hand.map(id => characteristicsOf(state, catalog, id).keywords.includes("vengeful"))).toEqual([true, true, true]);
    expect(instanceCard(catalog, state.instances[ids[side].hand[2]]).speed).toBe("interrupt");
  });

  it.each(SIDES)("counts only matching plays, ignores the other side and resets once-per-turn for %s", side => {
    const other = opponent(side);
    const { state, ids } = boardState(catalog, { active: side, phase: "day", [side]: { back: [counter.id], hand: [standard.id, fast.id, interrupt.id, fast.id], deck: filler }, [other]: { hand: [interrupt.id], deck: filler } });
    let after = play(engine, state, ids[side].hand[0]);
    expect(after.sides[side].score).toBe(0);
    after = play(engine, after, ids[other].hand[0]);
    expect(after.sides[side].score).toBe(0);
    after = step(engine, after, { kind: "resolveTop" }).state;
    after = step(engine, after, { kind: "resolveTop" }).state;
    after = play(engine, after, ids[side].hand[1]);
    expect(after.sides[side].score).toBe(1);
    after = step(engine, after, { kind: "resolveTop" }).state;
    after = play(engine, after, ids[side].hand[2]);
    expect(after.sides[side].score).toBe(5);
    expect(after.turnLog.played[side].map(record => record.speed)).toEqual(["standard", "fast", "interrupt"]);
    after = step(engine, after, { kind: "resolveTop" }).state;
    const currentTurn = after.turn.turnNumber;
    after = passUntil(engine, after, next => next.turn.turnNumber > currentTurn && at(engine, side, "day")(next), NO_PROMPTS, 100).state;
    expect(after.turnLog.played[side]).toEqual([]);
    after = engine.apply(after, side, { kind: "play", card: ids[side].hand[3], from: "hand" }, NO_PROMPTS).state;
    expect(after.sides[side].score).toBe(6);
  });

  it.each(SIDES)("captures modified copied speed before matching and retains it after the copy ceases for %s", side => {
    const { state, ids } = boardState(catalog, { active: side, phase: "day", [side]: { hand: [copyMaker.id, fast.id], void: [standard.id] } });
    state.instances[ids[side].void[0]] = { ...state.instances[ids[side].void[0]], variant: { amplified: false, deckMods: { ...NO_DECK_MODS, fast: true } } };
    const made = step(engine, play(engine, state, ids[side].hand[0]), { kind: "resolveTop" });
    const created = made.events.find(item => item.kind === "cardCreated");
    if (created?.kind !== "cardCreated") throw new Error("No copy created");
    const cast = play(engine, made.state, created.instance);
    expect(cast.turnLog.played[side][cast.turnLog.played[side].length - 1]).toMatchObject({ instance: created.instance, speed: "fast" });
    const changed = structuredClone(cast);
    changed.instances[created.instance] = { ...changed.instances[created.instance], variant: { amplified: false } };
    const historical = changed.turnLog.played[side][changed.turnLog.played[side].length - 1];
    expect(cardMatchesFilter(changed, catalog, created.instance, { fast: true })).toBe(false);
    expect(playedMatchesFilter(changed, catalog, historical, { fast: true })).toBe(true);
    const ceased = step(engine, cast, { kind: "resolveTop" }).state;
    expect(ceased.instances[created.instance]).toBeUndefined();
    expect(playedMatchesFilter(ceased, catalog, ceased.turnLog.played[side][ceased.turnLog.played[side].length - 1], { fast: true })).toBe(true);
    expect(deserializeState(serializeState(ceased)).turnLog.played).toEqual(ceased.turnLog.played);
  });

  it.each(SIDES)("keeps hidden played speed through anonymous projection and determinization for %s", side => {
    const { state, ids } = boardState(catalog, { active: side, phase: "day", [side]: { back: [counter.id], hand: [fast.id, shuffler.id, interrupt.id] } });
    const first = step(engine, play(engine, state, ids[side].hand[0]), { kind: "resolveTop" }).state;
    const shuffled = step(engine, play(engine, first, ids[side].hand[1]), { kind: "resolveTop" }).state;
    const finalCard = ids[side].hand[2];
    shuffled.knownTo[opponent(side)].push(finalCard);
    const lists = { [side]: [counter.id, fast.id, shuffler.id, interrupt.id].map(cardId => ({ cardId })), [opponent(side)]: [] };
    for (const viewer of SIDES) {
      const shown = engine.view(shuffled, viewer);
      expect(shown.turnLog.played[side][0]).toMatchObject({ instance: null, speed: "fast" });
      const sample = engine.determinize(shown, { player: lists.player, enemy: lists.enemy }, () => 0.4);
      expect(comparableView(engine.view(sample, viewer))).toEqual(comparableView(shown));
      expect(play(engine, sample, finalCard).sides[side].score).toBe(5);
    }
  });

  it("accepts known saved speeds, preserves unknown legacy records and rejects malformed scalars atomically", () => {
    const { state, ids } = boardState(catalog, { active: "player", phase: "day", player: { hand: [fast.id], back: [staticReader.id] } });
    const cast = play(engine, state, ids.player.hand[0]);
    for (const speed of [undefined, "standard", "fast", "interrupt"] as const) {
      const raw = saved(sliceOf(cast));
      const record = raw.engine.slice.committed.turnLog.played.player[0];
      if (speed === undefined) delete (record as { speed?: Speed }).speed;
      else Object.assign(record, { speed });
      const loaded = parseJourneyBattleFoldState(raw);
      expect(loaded).not.toBeNull();
      expect(playedMatchesFilter(loaded!.engine.slice.committed, catalog, record, { fast: true })).toBe(speed === "fast" || speed === "interrupt");
      expect(playedMatchesFilter(loaded!.engine.slice.committed, catalog, record, {})).toBe(true);
    }
    for (const speed of [null, false, 0, "swift", {}, []]) {
      const raw = saved(sliceOf(cast));
      Object.assign(raw.engine.slice.committed.turnLog.played.player[0], { speed });
      const before = structuredClone(raw);
      expect(parseJourneyBattleFoldState(raw)).toBeNull();
      expect(raw).toEqual(before);
    }
    for (const fastValue of [true, undefined, false, "fast", null, 1]) {
      const raw = saved(sliceOf(cast));
      raw.engine.slice.committed.floating.push({ id: "e1", source: ids.player.back[0]!, controller: "player", timestamp: 0, expiry: { at: "endOfTurn" }, change: { kind: "cost", player: "player", filter: { fast: fastValue } as { fast: true }, amount: 1, next: false } });
      const before = structuredClone(raw);
      expect(parseJourneyBattleFoldState(raw) !== null).toBe(fastValue === true || fastValue === undefined);
      expect(raw).toEqual(before);
    }
  });

  it("restarts a Fast-filtered offer and refuses nonmatching, foreign, stale and duplicate answers", () => {
    const { state, ids } = boardState(catalog, { active: "player", phase: "day", player: { hand: [offer.id], deck: [standard.id, fast.id, interrupt.id] } });
    const start = { ...state, config: { ...state.config, autoAnswerForcedPrompts: false, discoverOptions: 10 } };
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const cast = applied(fold.reduce(sliceOf(start), { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } }));
    let pendingSlice = cast;
    for (let attempts = 0; fold.pending(pendingSlice) === null; attempts++) {
      const decision = engine.decision(pendingSlice.committed);
      if (decision === null || attempts > 8) throw new Error("Offer did not open");
      pendingSlice = applied(fold.reduce(pendingSlice, { kind: "battleAction", side: decision.side, action: { kind: "pass" } }));
    }
    const pending = fold.pending(pendingSlice)!;
    expect(pending.prompt).toMatchObject({ candidates: ids.player.deck.slice(1) });
    const loaded = parseJourneyBattleFoldState(saved(pendingSlice))!.engine.slice;
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    expect(fresh.pending(loaded)).toEqual(pending);
    const before = stateHash(loaded.committed);
    const answer = { kind: "answer" as const, side: "player" as const, promptId: pending.prompt.id, value: [ids.player.deck[1]] };
    expect(fresh.reduce(loaded, { ...answer, value: [ids.player.deck[0]] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fresh.reduce(loaded, { ...answer, side: "enemy" })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fresh.reduce({ ...loaded, attempt: loaded.attempt + 1 }, answer)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    const accepted = applied(fresh.reduce(loaded, answer));
    expect(accepted.committed.sides.player.hand).toEqual([ids.player.deck[1]]);
    expect(fresh.reduce(accepted, answer)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    expect(stateHash(loaded.committed)).toBe(before);
    expect(applied(fold.reduce(pendingSlice, answer)).committed).toEqual(accepted.committed);
  });

  it("distinguishes public identical Fast draw criteria from an ability containing different filters", () => {
    for (const card of [simpleDraw, mixedDraw]) {
      const { state, ids } = boardState(catalog, { active: "player", phase: "day", player: { hand: [card.id], deck: [fast.id, standard.id, interrupt.id, standard.id] } });
      state.knownTo.enemy = [ids.player.deck[1], ids.player.deck[2]];
      const after = step(engine, play(engine, state, ids.player.hand[0]), { kind: "resolveTop" }).state;
      expect(after.sides.player.hand).toEqual([ids.player.deck[0]]);
      expect(engine.view(after, "enemy").sides.player.deck.known).toEqual(card === simpleDraw ? [{ id: ids.player.deck[1], index: 0 }, { id: ids.player.deck[2], index: 1 }] : []);
    }
  });

  it("rolls back a failing Fast draw without partially publishing gameplay or altering its captured play", () => {
    const { state, ids } = boardState(catalog, { active: "player", phase: "day", player: { hand: [failing.id], deck: [standard.id, fast.id] } });
    const before = stateHash(state);
    const fold = createFoldAdapter(engine);
    const outcome = fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("Expected synthetic failure");
    expect(outcome.slice.committed.sides.player.deck).toEqual(ids.player.deck);
    expect(outcome.slice.committed.turnLog.drawn.player).toBe(0);
    expect(outcome.slice.committed.turnLog.played.player).toEqual([expect.objectContaining({ instance: ids.player.hand[0], speed: "fast" })]);
    expect(outcome.published.some(item => item.kind === "cardDrawn")).toBe(false);
    expect(stateHash(state)).toBe(before);
  });

  it.each(SIDES.flatMap(viewer => [false, true].map(live => ({ viewer, live }))))("samples compatible speed after a ceased modified copy for $viewer/live=$live", ({ viewer, live }) => {
    const holder = opponent(viewer);
    const subject: EngineCardDefinition = { ...v.vanilla3, id: syntheticId(0x581020), subtype: "Explorer", costs: [energy(3)] };
    const liveFast: EngineCardDefinition = { ...fixture(21, "interrupt"), subtype: "Explorer", costs: [energy(7)] };
    const decoy: EngineCardDefinition = { ...fixture(25), subtype: "Explorer", costs: [energy(9)] };
    const watcher: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x581022), abilities: () => [triggered(whenDiscard("opponent", { fast: true, subtype: "Explorer" }), gainPoints(triggerSubjectCost()))] };
    const maker = { ...fixture(23), abilities: () => [event(sequence(shuffleInto([everyIn("hand", {}, { player: "opponent" })]), createCopyInHand(everyIn("deck", {}, { player: "opponent" }))))] };
    const discarder = { ...fixture(24), abilities: () => [event(discard(1))] };
    const e = createEngine(testCatalog([subject, ...(live ? [liveFast] : []), decoy, watcher, maker, discarder]));
    const original = { cardId: subject.id, deckMods: { ...NO_DECK_MODS, fast: true } };
    const { state, ids } = boardState(e.catalog, { active: holder, phase: "day", [viewer]: { back: [watcher.id], hand: [original] }, [holder]: { hand: [maker.id, discarder.id, decoy.id, ...(live ? [liveFast.id] : [])] } });
    const made = step(e, play(e, state, ids[holder].hand[0]), { kind: "resolveTop" });
    const created = made.events.find(item => item.kind === "cardCreated");
    if (created?.kind !== "cardCreated") throw new Error("No copied subject");
    const discarded = step(e, play(e, made.state, ids[holder].hand[1]), { kind: "resolveTop" }, [[created.instance]]).state;
    expect(discarded.instances[created.instance]).toBeUndefined();
    expect(step(e, discarded, { kind: "resolveTrigger" }).state.sides[viewer].score).toBe(3);
    const shown = e.view(discarded, viewer), before = structuredClone(shown);
    expect(shown.instances[ids[viewer].hand[0]]).toBeUndefined();
    expect(shown.triggerQueue[0]).toMatchObject({ subject: null, subjectCostHidden: true });
    expect(shown.triggerQueue[0]).not.toHaveProperty("lastKnownSubjectCost");
    const lists = { [viewer]: [{ cardId: watcher.id }, original], [holder]: [maker.id, discarder.id, decoy.id, ...(live ? [liveFast.id] : [])].map(cardId => ({ cardId })) };
    for (const entropy of [0.1, 0.9]) {
      const sample = e.determinize(shown, { player: lists.player, enemy: lists.enemy }, () => entropy);
      expect(sample.triggerQueue[0].lastKnownSubjectCost).toBe(live ? 7 : 3);
      expect(comparableView(e.view(sample, viewer))).toEqual(comparableView(shown));
      expect(step(e, sample, { kind: "resolveTrigger" }).state.sides[viewer].score).toBe(live ? 7 : 3);
    }
    expect(shown).toEqual(before);
  });
});
