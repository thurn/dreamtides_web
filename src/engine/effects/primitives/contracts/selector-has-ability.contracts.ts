/** Named ability presence through effective layers and public selection. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition, EngineDreamsignDefinition } from "../../../catalog";
import { cardMatchesFilter, characteristics, matchesEveryCard, playedMatchesFilter } from "../../../continuous/characteristics";
import { all, anyCharacter, characterYouControl, enemyCharacter, event, energy, everyIn, selectorHasAbility, staticAbility, target, triggerSubjectCost } from "../../../dsl/builders";
import { onDawn, onNight, triggered, triggeringCard, untilEndOfTurn, whenCopyTrigger, whenDiscard, whenYouPlay } from "../../../dsl/triggers";
import { isNamedTrigger } from "../../../dsl/abilities";
import { BASE_VARIANT, NO_DECK_MODS } from "../../../dsl/types";
import { createEngine, type Engine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { matchesCharacterWith, matchingCharacters } from "../../../dsl/selectors";
import { addFloating } from "../../../rules/floating";
import { stateHash, serializeState, deserializeState } from "../../../state/hash";
import { opponent } from "../../../state/ids";
import { parseBattleId, parseDreamsignId, parseOpponentId, parseSiteId } from "../../../../types/identifiers";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import { runStep } from "../../../steps/runner";
import type { Step } from "../../../steps/kinds";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState, placeFigment } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { labBoard } from "../../../testing/lab-solver";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { at, passUntil } from "../../../testing/trigger-harness";
import { determinize } from "../../../view/determinize";
import { promptView, view } from "../../../view/view";
import { createRandomFromPool } from "../create-random-from-pool";
import { copyCard } from "../copy-card";
import { createCopyInHand } from "../create-copy-in-hand";
import { discard } from "../discard";
import { sequence } from "../sequence";
import { shuffleInto } from "../shuffle-into";
import { discover } from "../discover";
import { disableTriggers } from "../disable-triggers";
import { dissolve } from "../dissolve";
import { gainPoints } from "../gain-points";
import { loseAllAbilities } from "../lose-all-abilities";
import { sparkModifier } from "../spark-modifier";

const dawn = { ...v.vanilla1, id: syntheticId(0x23201), status: "authored" as const,
  abilities: () => [triggered(onDawn(), gainPoints(0)), triggered(onDawn(), gainPoints(0))] };
const combined = { ...dawn, id: syntheticId(0x23202), abilities: () => [triggered({ on: "either" as const,
  triggers: [onNight(), { on: "either" as const, triggers: [onDawn(), onDawn()] }] }, gainPoints(0))] };
const night = { ...dawn, id: syntheticId(0x23203), abilities: () => [triggered(onNight(), gainPoints(0))] };
const descriptive = { ...dawn, id: syntheticId(0x23204), abilities: () => [triggered(whenYouPlay(), gainPoints(0))] };
const variant = { ...dawn, id: syntheticId(0x23205), abilities: (form: { readonly amplified: boolean }) => form.amplified ? dawn.abilities() : night.abilities() };
const filtered = selectorHasAbility("dawn");
const anthem: EngineDreamsignDefinition = { id: parseDreamsignId(syntheticId(0x23206)), status: "authored",
  abilities: () => [staticAbility(sparkModifier(all(characterYouControl(filtered)), 1))] };
const hunter = { ...v.event0, id: syntheticId(0x23207), speed: "fast" as const,
  abilities: () => [event(dissolve(target(enemyCharacter(filtered))))] };
const silence = { ...v.event0, id: syntheticId(0x23208), speed: "interrupt" as const,
  abilities: () => [event(loseAllAbilities(all(characterYouControl()), { duration: untilEndOfTurn() }))] };
const disable = { ...v.event0, id: syntheticId(0x23209), abilities: () => [event(disableTriggers(all(characterYouControl()), untilEndOfTurn()))] };
const grant: EngineCardDefinition = { ...v.event0, id: syntheticId(0x2320a), synthetic: { resolve(ctx, item) {
  const subject = ctx.state.sides[item.controller].backRank[0];
  if (subject === null) throw new Error("Missing fixture subject");
  addFloating(ctx, { controller: item.controller, source: item.instance, expiry: { at: "endOfTurn" },
    change: { kind: "abilities", instance: subject, cardId: dawn.id, variant: BASE_VARIANT } });
} } };
const offer = { ...v.event0, id: syntheticId(0x2320b), abilities: () => [event(discover(filtered))] };
const cards = [dawn, combined, night, descriptive, variant, hunter, silence, disable, grant, offer];
const engine = createEngine(testCatalog(cards, { dreamsigns: [anthem] }));
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(JSON.stringify(outcome));
  return outcome.slice;
}
function slice(committed: BattleSlice["committed"]): BattleSlice { return { committed, inFlight: null, publishedEvents: 0, attempt: 0 }; }

function step(e: Engine, state: BattleSlice["committed"], action: Step, answers: ConstructorParameters<typeof ScriptedSource>[0] = []) {
  const result = runStep(state, action, answers.length === 0 ? NO_PROMPTS : new ScriptedSource(answers), e.catalog);
  if (result.kind !== "done") throw new Error("Unexpected fixture prompt");
  return result.state;
}
function saved(committed: BattleSlice["committed"]) {
  return { mode: { kind: "journey" }, init: { battleId: parseBattleId("ability-save"), siteId: parseSiteId("ability-save"), nodeId: null,
    completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false,
    enemyDescriptor: { id: parseOpponentId("ability-save"), name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] }, avatarSummary: null, cardDefinitions: [],
  }, engine: { init: { seed: "seed", scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: slice(deserializeState(serializeState(committed))) } };
}

for (const side of ["player", "enemy"] as const) describe(`${side} named ability presence`, () => {
  const other = opponent(side);
  it("matches printed and recursive combined named triggers once, with conjunctions and controller restrictions", () => {
    const { state, ids } = boardState(engine.catalog, { active: side, phase: "day",
      [side]: { back: [dawn.id, combined.id, night.id, descriptive.id, v.vanilla1.id], dreamsigns: [anthem.id],
        hand: [{ cardId: variant.id, amplified: true }, variant.id] }, [other]: { back: [dawn.id] } });
    const copied = placeFigment(state, side, { rank: "back", index: 5 }, { kind: "figmentCopy", cardId: dawn.id, spark: 1 });
    const matching = [ids[side].back[0], ids[side].back[1], copied];
    expect(matchingCharacters(state, engine.catalog, characterYouControl(filtered), side, ids[side].back[0]!)).toEqual(matching);
    expect(matchingCharacters(state, engine.catalog, anyCharacter({ subtype: "Mage", ...filtered }), side, ids[side].back[0]!)).toEqual([]);
    expect(matchingCharacters(state, engine.catalog, enemyCharacter(filtered), side, ids[side].back[0]!)).toEqual(ids[other].back);
    expect(ids[side].back.slice(0, 5).map(id => characteristics(state, engine.catalog).of(id!).spark)).toEqual([2, 2, 1, 1, 1]);
    expect(characteristics(state, engine.catalog).of(copied).spark).toBe(2);
    expect(cardMatchesFilter(state, engine.catalog, ids[side].hand[0], filtered)).toBe(true);
    expect(cardMatchesFilter(state, engine.catalog, ids[side].hand[1], filtered)).toBe(false);
    expect(matchesEveryCard(filtered)).toBe(false);
    expect(matchesEveryCard({})).toBe(true);
  });

  it("reads preceding layers, removes lost abilities, preserves later gains, and recovers after expiry", () => {
    const { state, ids } = boardState(engine.catalog, { active: side, phase: "day",
      [side]: { back: [dawn.id], hand: [silence.id, grant.id], dreamsigns: [anthem.id], energy: 4 }, [other]: {} });
    const subject = ids[side].back[0]!;
    const lostPlay = engine.apply(state, side, { kind: "play", card: ids[side].hand[0], from: "hand" }, new ScriptedSource([]));
    const lost = passUntil(engine, lostPlay.state, next => next.stack.length === 0).state;
    const layers = characteristics(lost, engine.catalog);
    expect(matchesCharacterWith(lost, engine.catalog, layers.reader(1), characterYouControl(filtered), subject, side, subject)).toBe(true);
    expect(matchesCharacterWith(lost, engine.catalog, layers.reader(3), characterYouControl(filtered), subject, side, subject)).toBe(false);
    expect(layers.of(subject).spark).toBe(1);
    const gainPlay = engine.apply(lost, side, { kind: "play", card: ids[side].hand[1], from: "hand" }, new ScriptedSource([]));
    const gained = passUntil(engine, gainPlay.state, next => next.stack.length === 0).state;
    expect(characteristics(gained, engine.catalog).of(subject).spark).toBe(2);
    expect(cardMatchesFilter(gained, engine.catalog, subject, filtered)).toBe(true);
    expect(invariantViolations(gained, engine.catalog)).toEqual([]);
    const recovered = passUntil(engine, gained, at(engine, other, "day")).state;
    expect(characteristics(recovered, engine.catalog).of(subject).spark).toBe(2);
    expect(cardMatchesFilter(recovered, engine.catalog, subject, filtered)).toBe(true);
  });

  it("still has a named ability while triggering is disabled", () => {
    const { state, ids } = boardState(engine.catalog, { active: side, phase: "day",
      [side]: { back: [dawn.id], hand: [disable.id], dreamsigns: [anthem.id] } });
    const played = engine.apply(state, side, { kind: "play", card: ids[side].hand[0], from: "hand" }, new ScriptedSource([]));
    const done = passUntil(engine, played.state, next => next.stack.length === 0).state;
    expect(characteristics(done, engine.catalog).of(ids[side].back[0]!).spark).toBe(2);
    expect(cardMatchesFilter(done, engine.catalog, ids[side].back[0]!, filtered)).toBe(true);
  });

  it("reloads target selection, refuses invalid and concurrent input, and rechecks after an opponent's loss effect", () => {
    const { state: initial, ids } = boardState(engine.catalog, { active: side, phase: "day",
      [side]: { hand: [hunter.id] }, [other]: { back: [dawn.id, combined.id, night.id], hand: [silence.id] } });
    const state = { ...initial, config: { ...initial.config, autoAnswerForcedPrompts: false } };
    const fold = createFoldAdapter(engine);
    const action = { kind: "play" as const, card: ids[side].hand[0], from: "hand" as const };
    const opened = applied(fold.reduce(slice(state), { kind: "battleAction", side, action }));
    const saved = JSON.parse(JSON.stringify(opened)) as BattleSlice;
    const cold = createFoldAdapter(engine);
    const pending = cold.pending(saved)!;
    expect(pending.prompt).toMatchObject({ kind: "chooseTargets", candidates: ids[other].back.slice(0, 2) });
    const before = stateHash(saved.committed);
    const answer = { kind: "answer" as const, side, promptId: pending.prompt.id, value: [ids[other].back[0]!] };
    expect(cold.reduce(saved, { ...answer, value: [ids[other].back[2]!] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(cold.reduce(saved, { ...answer, side: other }).kind).toBe("bounced");
    expect(cold.reduce(saved, { kind: "battleAction", side, action })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(stateHash(saved.committed)).toBe(before);
    const played = applied(cold.reduce(saved, answer));
    expect(cold.reduce(played, answer).kind).toBe("bounced");
    const interrupted = engine.apply(played.committed, other, { kind: "play", card: ids[other].hand[0], from: "hand" }, new ScriptedSource([]));
    const settled = passUntil(engine, interrupted.state, next => next.stack.length === 0);
    expect(settled.state.instances[ids[other].back[0]!].zone).toBe("play");
    expect([...interrupted.events, ...settled.events].some(e => e.kind === "noLegalTarget")).toBe(true);
  });

  it("offers only matching hidden deck cards and preserves the private offer through reload", () => {
    const { state: initial, ids } = boardState(engine.catalog, { active: side, phase: "day",
      [side]: { hand: [offer.id], deck: [dawn.id, combined.id, night.id, descriptive.id] } });
    const state = { ...initial, config: { ...initial.config, discoverOptions: 4, autoAnswerForcedPrompts: false } };
    const fold = createFoldAdapter(engine);
    let current = applied(fold.reduce(slice(state), { kind: "battleAction", side, action: { kind: "play", card: ids[side].hand[0], from: "hand" } }));
    while (fold.pending(current) === null) {
      const decision = engine.decision(current.committed)!;
      current = applied(fold.reduce(current, { kind: "battleAction", side: decision.side, action: { kind: "pass" } }));
    }
    const pending = fold.pending(current)!;
    expect(pending.prompt).toMatchObject({ kind: "chooseCards", candidates: ids[side].deck.slice(0, 2) });
    expect(promptView(pending.prompt, other, pending.display)).toMatchObject({ candidates: [] });
    expect(view(pending.display, other, engine.catalog).instances[ids[side].deck[0]]).toBeUndefined();
    const cold = createFoldAdapter(engine);
    const saved = JSON.parse(JSON.stringify(current)) as BattleSlice;
    expect(cold.pending(saved)).toEqual(pending);
    const answer = { kind: "answer" as const, side, promptId: pending.prompt.id, value: [ids[side].deck[0]] };
    expect(cold.reduce(saved, { ...answer, value: [ids[side].deck[2]] })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(cold.reduce({ ...saved, attempt: saved.attempt + 1 }, answer).kind).toBe("bounced");
    const done = applied(cold.reduce(saved, answer));
    expect(done.committed.sides[side].hand).toEqual([ids[side].deck[0]]);
    expect(invariantViolations(done.committed, engine.catalog)).toEqual([]);
  });

  it("captures named abilities as played and retains them after normal created-copy ceasing, reload and determinization", () => {
    const maker = { ...v.event0, id: syntheticId(0x23218), abilities: () => [event(createCopyInHand(everyIn("hand", filtered)))] };
    const remover = { ...v.event0, id: syntheticId(0x23219), abilities: () => [event(dissolve(all(characterYouControl(filtered))))] };
    const e = createEngine(testCatalog([dawn, maker, remover]));
    const { state, ids } = boardState(e.catalog, { active: side, phase: "day", [side]: { hand: [dawn.id, maker.id, remover.id], energy: 20 } });
    const made = step(e, step(e, state, { kind: "play", card: ids[side].hand[1], from: "hand" }), { kind: "resolveTop" });
    const copied = made.sides[side].hand.find(id => !ids[side].hand.includes(id));
    if (copied === undefined) throw new Error("Missing created fixture copy");
    const played = step(e, made, { kind: "play", card: copied, from: "hand" });
    const record = played.turnLog.played[side][1];
    expect(record.namedTriggers).toEqual(["dawn"]);
    expect(parseJourneyBattleFoldState(saved(played))).not.toBeNull();
    const invalid = saved(played);
    invalid.engine.slice.committed.turnLog.played[side][1] = { ...record, namedTriggers: ["not-a-trigger" as never] };
    expect(parseJourneyBattleFoldState(invalid)).toBeNull();
    const resolved = step(e, played, { kind: "resolveTop" });
    const ceased = step(e, step(e, resolved, { kind: "play", card: ids[side].hand[2], from: "hand" }), { kind: "resolveTop" });
    expect(ceased.instances[copied]).toBeUndefined();
    expect(invariantViolations(ceased, e.catalog)).toEqual([]);
    const reloaded = deserializeState(serializeState(ceased));
    expect(invariantViolations(reloaded, e.catalog)).toEqual([]);
    const shown = view(reloaded, other, e.catalog);
    expect(shown.turnLog.played[side][1].instance).toBeNull();
    const deck = [dawn.id, maker.id, remover.id].map(cardId => ({ cardId }));
    const rebuilt = determinize(shown, { player: side === "player" ? deck : [], enemy: side === "enemy" ? deck : [] }, () => 0.5, e.catalog);
    expect(invariantViolations(rebuilt, e.catalog)).toEqual([]);
    expect(playedMatchesFilter(rebuilt, e.catalog, rebuilt.turnLog.played[side][1], filtered)).toBe(true);
    expect(playedMatchesFilter(rebuilt, e.catalog, { ...record, namedTriggers: [] }, filtered)).toBe(false);
    const { namedTriggers: _unknown, ...legacy } = record;
    expect(playedMatchesFilter(played, e.catalog, legacy, filtered)).toBe(false);
    expect(playedMatchesFilter(rebuilt, e.catalog, { ...legacy, instance: rebuilt.turnLog.played[side][1].instance }, filtered)).toBe(false);
  });

  it("accepts every formal named trigger and rejects inherited or descriptive names at the public guard and save boundary", () => {
    const names = ["materialized", "dawn", "dusk", "night", "challenge", "dissolved"] as const;
    const { state } = boardState(engine.catalog, { active: side, phase: "day" });
    for (const name of names) {
      expect(isNamedTrigger(name)).toBe(true);
      const valid = saved(state);
      valid.engine.slice.committed.turnLog.played[side] = [{ instance: "i900", cardType: "character", subtype: "", allTypes: false, speed: "standard", namedTriggers: [name] }];
      expect(parseJourneyBattleFoldState(valid)).not.toBeNull();
    }
    for (const value of ["play", "either", "constructor", "__proto__", null, 1, {}]) expect(isNamedTrigger(value)).toBe(false);
  });

  it("samples a compatible variant tuple for a hidden ceased discard without leaking its retained cost", () => {
    const subject: EngineCardDefinition = { ...variant, id: syntheticId(0x23210), subtype: "Explorer", costs: [energy(3)] };
    const decoy: EngineCardDefinition = { ...night, id: syntheticId(0x23211), subtype: "Explorer", costs: [energy(9)] };
    const watcher = { ...v.vanilla1, id: syntheticId(0x23212), abilities: () => [triggered(whenDiscard("opponent", { ...filtered, subtype: "Explorer" }), gainPoints(triggerSubjectCost()))] };
    const maker = { ...v.event0, id: syntheticId(0x23213), abilities: () => [event(sequence(shuffleInto([everyIn("hand", {}, { player: "opponent" })]), createCopyInHand(everyIn("deck", {}, { player: "opponent" }))))] };
    const discarder = { ...v.event0, id: syntheticId(0x23214), abilities: () => [event(discard(1))] };
    const e = createEngine(testCatalog([subject, decoy, watcher, maker, discarder]));
    const original = { cardId: subject.id, amplified: true, deckMods: { ...NO_DECK_MODS, costReduction: 2 } };
    const { state, ids } = boardState(e.catalog, { active: other, phase: "day", [side]: { back: [watcher.id], hand: [original] }, [other]: { hand: [maker.id, discarder.id, decoy.id] } });
    const made = step(e, step(e, state, { kind: "play", card: ids[other].hand[0], from: "hand" }), { kind: "resolveTop" });
    const created = made.sides[other].hand.find(id => !ids[other].hand.includes(id));
    if (created === undefined) throw new Error("No fixture copy");
    const discarded = step(e, step(e, made, { kind: "play", card: ids[other].hand[1], from: "hand" }), { kind: "resolveTop" }, [[created]]);
    expect(discarded.instances[created]).toBeUndefined();
    const shown = e.view(discarded, side);
    expect(shown.triggerQueue[0]).toMatchObject({ subject: null, subjectCostHidden: true });
    expect(shown.triggerQueue[0]).not.toHaveProperty("lastKnownSubjectCost");
    const lists = { [side]: [{ cardId: watcher.id }, original], [other]: [maker.id, discarder.id, decoy.id].map(cardId => ({ cardId })) };
    for (const entropy of [0.1, 0.9]) {
      const sample = e.determinize(shown, { player: lists.player, enemy: lists.enemy }, () => entropy);
      const cost = sample.triggerQueue[0].lastKnownSubjectCost;
      expect([1, 3]).toContain(cost);
      expect(step(e, sample, { kind: "resolveTrigger" }).sides[side].score).toBe(cost);
    }
  });

  it("reconstructs a hidden hand-copy tuple only from a printing with the named ability in its actual variant", () => {
    const watcher: EngineDreamsignDefinition = { id: parseDreamsignId(syntheticId(0x23215)), status: "authored",
      abilities: () => [triggered(whenCopyTrigger("opponent", filtered), sequence(copyCard(triggeringCard()), gainPoints(1)))] };
    const maker = { ...v.event0, id: syntheticId(0x23216), abilities: () => [event(createCopyInHand(everyIn("hand", filtered)))] };
    const e = createEngine(testCatalog([variant, night, maker], { dreamsigns: [watcher] }));
    const original = { cardId: variant.id, amplified: true };
    const { state, ids } = boardState(e.catalog, { active: other, phase: "day",
      [side]: { dreamsigns: [watcher.id] }, [other]: { hand: [original, night.id, maker.id] } });
    const copied = step(e, step(e, state, { kind: "play", card: ids[other].hand[2], from: "hand" }), { kind: "resolveTop" });
    const shown = e.view(copied, side);
    expect(shown.triggerQueue[0]).toMatchObject({ subject: null, handCopyHidden: true });
    expect(shown.triggerQueue[0]).not.toHaveProperty("handCopy");
    const lists = { [side]: [], [other]: [original, { cardId: night.id }, { cardId: maker.id }] };
    const sample = () => e.determinize(shown, { player: lists.player, enemy: lists.enemy }, () => 0.5);
    expect(sample).not.toThrow();
    const sampled = sample();
    expect(sampled.triggerQueue[0].handCopy).toMatchObject({ printing: { kind: "card", cardId: variant.id }, variant: { amplified: true } });
    const before = new Set(sampled.sides[other].hand);
    const watcherHand = [...sampled.sides[side].hand];
    const resolved = step(e, sampled, { kind: "resolveTrigger" });
    expect(resolved.sides[side].score).toBe(1);
    expect(resolved.sides[side].hand).toEqual(watcherHand);
    const added = resolved.sides[other].hand.filter(id => !before.has(id));
    expect(added).toHaveLength(1);
    expect(resolved.instances[added[0]]).toMatchObject({ printing: { kind: "card", cardId: variant.id }, variant: { amplified: true } });
    expect(cardMatchesFilter(resolved, e.catalog, added[0], filtered)).toBe(true);
  });

  it("creates a matching base printing from the controller's fixed pool and keeps nonmatching pools unchanged", () => {
    const maker = { ...v.event0, id: syntheticId(0x23217), abilities: () => [event(createRandomFromPool(filtered))] };
    const e = createEngine(testCatalog([dawn, night, variant, maker]));
    for (const pool of [[night.id, dawn.id], [night.id, variant.id]]) {
      const board = boardState(e.catalog, { active: side, phase: "day", [side]: { hand: [maker.id] } });
      const state = { ...board.state, draftPools: { player: side === "player" ? pool : [dawn.id], enemy: side === "enemy" ? pool : [dawn.id] } };
      const done = step(e, step(e, state, { kind: "play", card: board.ids[side].hand[0], from: "hand" }), { kind: "resolveTop" });
      const created = done.sides[side].hand;
      expect(created.length).toBe(pool.includes(dawn.id) ? 1 : 0);
      if (created.length > 0) expect(done.instances[created[0]]).toMatchObject({ printing: { kind: "card", cardId: dawn.id }, variant: { amplified: false }, poolCandidates: [dawn.id] });
      expect(done.sides[other].hand).toEqual([]);
    }
  });

  it("stages a qualifying synthetic printing for public card and character filters", () => {
    const selected = labBoard(engine, offer.id, [night, dawn]).setup.player;
    // The solver's default side is player; ability filtering must pick the supplied matching printing.
    const deck = selected?.deck ?? [];
    expect(deck.includes(dawn.id)).toBe(true);
    const staged = labBoard(engine, hunter.id, [night, dawn]).setup.enemy?.back ?? [];
    expect(staged.includes(dawn.id)).toBe(true);
  });
});
