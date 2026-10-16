/** Public predeparture subject-spark contracts, independent of source spark and physical lifetime. */
import { describe, expect, it } from "vitest";
import type { Engine, EngineCardDefinition, EngineDreamsignDefinition } from "../../../index";
import { createEngine } from "../../../engine";
import { all, characterYouControl, energy, event, everyIn, plus, randomCharacter, self, staticAbility, supported, times, triggerSubjectCost, triggerSubjectSpark, x } from "../../../dsl/builders";
import { triggered, triggeringCard, whenAbandon, whenDissolved, whenDraw, whenGainsSpark } from "../../../dsl/triggers";
import { thisCharacterSpark } from "../../../dsl/values";
import { NO_DECK_MODS } from "../../../dsl/types";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { eventLogRecord } from "../../../log";
import { effectiveSpark } from "../../../rules/spark";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { SIDES, opponent, parseFigmentId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import type { Step } from "../../../steps/kinds";
import { runStep } from "../../../steps/runner";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { comparableView } from "../../../testing/determinization-fidelity";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import { parseBattleId, parseDreamsignId, parseOpponentId, parseSiteId } from "../../../../types/identifiers";
import type { ResolvingEffect } from "../../registry";
import * as p from "../index";

const WARRIORS = all(characterYouControl({ subtype: "Warrior" }));
const RECIPIENT = randomCharacter(characterYouControl({ subtype: "Mage" }));
const FIGMENT = { id: parseFigmentId("5e5e5e5e-0000-4000-8000-000000587001"), subtype: "Warrior" as const, spark: 6, status: "authored" as const, abilities: () => [] };
const SIGN = parseDreamsignId("5e5e5e5e-0000-4000-8000-000000587002");
const sliceOf = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(result: IntentOutcome): BattleSlice {
  if (result.kind !== "applied" || result.error !== null) throw new Error(JSON.stringify(result));
  return result.slice;
}
function step(engine: Engine, state: BattleState, action: Step, answers: ConstructorParameters<typeof ScriptedSource>[0] = []) {
  const source = answers.length === 0 ? NO_PROMPTS : new ScriptedSource(answers);
  const result = runStep(state, action, source, engine.catalog);
  if (result.kind !== "done") throw new Error(`Unexpected ${result.prompt.kind}`);
  if (source instanceof ScriptedSource) source.assertExhausted();
  expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  return result;
}
interface Options {
  kind?: "ordinary" | "created" | "copy" | "figment";
  mode?: "plain" | "boosted" | "zero" | "base";
  body?: ResolvingEffect;
  cardSource?: boolean;
  after?: ResolvingEffect;
  floating?: boolean;
  dissolved?: boolean;
}
function world(side: Side, options: Options = {}) {
  const { kind = "ordinary", mode = "boosted", cardSource = false } = options;
  const body = options.body ?? p.gainSpark(RECIPIENT, triggerSubjectSpark());
  const trigger = options.dissolved ? whenDissolved(characterYouControl({ subtype: "Warrior" })) : whenAbandon();
  const subject: EngineCardDefinition = { ...v.vanilla2, id: syntheticId(0x587010), subtype: "Warrior", costs: [energy(4)] };
  const source: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x587011), spark: 9, subtype: "Explorer", abilities: () => [triggered(trigger, body)] };
  const recipient: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x587012), subtype: "Mage" };
  const supporter: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x587013), subtype: "Explorer", abilities: () => mode === "boosted" || mode === "base" ? [staticAbility(p.sparkModifier(supported(), 4))] : [] };
  const sign: EngineDreamsignDefinition = { id: SIGN, status: "authored", abilities: () => options.floating ? [] : [triggered(trigger, body)] };
  const departure = p.sequence(
    ...(options.floating ? [p.delayed(trigger, body)] : []),
    ...(mode === "base" ? [p.setBaseSpark(WARRIORS, 7)] : []),
    ...(mode === "boosted" || mode === "base" ? [p.gainSpark(WARRIORS, 3), p.sparkModifier(WARRIORS, 5)] : []),
    ...(mode === "zero" ? [p.sparkModifier(WARRIORS, -20)] : []),
    options.dissolved ? p.dissolve(WARRIORS) : p.abandon("you", { subtype: "Warrior" }),
    ...(options.after === undefined ? [] : [options.after]),
  );
  const abandon: EngineCardDefinition = { ...v.event0, id: syntheticId(0x587014), abilities: () => [event(departure)] };
  const engine = createEngine(testCatalog([subject, source, recipient, supporter, abandon], { dreamsigns: [sign] }, [FIGMENT]));
  const initial = boardState(engine.catalog, { active: side, phase: "day", scoreToWin: 1000, [side]: {
    back: [supporter.id, recipient.id, ...(cardSource ? [source.id] : [])],
    front: kind === "ordinary" || kind === "created" ? [subject.id] : [],
    figments: kind === "copy" ? [{ slot: { rank: "front", index: 0 }, printing: { kind: "figmentCopy", cardId: subject.id, spark: 5 } }]
      : kind === "figment" ? [{ slot: { rank: "front", index: 0 }, printing: { kind: "figment", figment: FIGMENT.id, spark: 6 } }] : [],
    dreamsigns: cardSource ? [] : [SIGN], hand: [abandon.id], deck: [v.vanilla5.id], energy: 10,
  }, [opponent(side)]: { deck: [v.vanilla5.id] } });
  const state = { ...initial.state, config: { ...initial.state.config, autoAnswerForcedPrompts: false } };
  const subjectId = state.sides[side].frontRank[0]!;
  state.instances[subjectId].status.counters = 13;
  // This row starts with a synthetic created character already in play; creation is exercised separately.
  if (kind === "created") state.instances[subjectId].status.created = true;
  if (cardSource) state.instances[initial.ids[side].back[2]!].status.x = 11;
  const base = kind === "copy" ? 5 : kind === "figment" ? 6 : 2;
  const expected = mode === "zero" ? 0 : mode === "base" ? 19 : mode === "boosted" ? base + 12 : base;
  const lists = { [side]: [supporter.id, recipient.id, ...(cardSource ? [source.id] : []), ...(kind === "ordinary" ? [subject.id] : []), abandon.id, v.vanilla5.id].map(cardId => ({ cardId })), [opponent(side)]: [{ cardId: v.vanilla5.id }] };
  return { engine, initial, state, subjectId, dissolved: options.dissolved === true, recipientId: initial.ids[side].back[1]!, sourceId: initial.ids[side].back[2], side, expected, lists: { player: lists.player, enemy: lists.enemy } };
}
function depart(w: ReturnType<typeof world>) {
  const cast = step(w.engine, w.state, { kind: "play", card: w.initial.ids[w.side].hand[0], from: "hand" });
  return step(w.engine, cast.state, { kind: "resolveTop" }, w.dissolved ? [] : [[w.subjectId]]);
}
function queued(events: readonly EngineEvent[]) {
  const result = events.find(event => event.kind === "triggerQueued" && event.lastKnownSubjectSpark !== undefined);
  if (result?.kind !== "triggerQueued") throw new Error("Missing retained subject trigger");
  return result;
}
function saved(slice: BattleSlice) {
  return { mode: { kind: "journey" }, init: { battleId: parseBattleId("battle-subject-spark"), siteId: parseSiteId("site-subject-spark"), nodeId: null,
    completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false,
    enemyDescriptor: { id: parseOpponentId("opponent-subject-spark"), name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] }, avatarSummary: null, cardDefinitions: [],
  }, engine: { init: { seed: "seed", scoreToWin: 1000, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: JSON.parse(JSON.stringify(slice)) as unknown } };
}

describe("triggering subject predeparture spark", () => {
  it.each(SIDES.flatMap(side => (["ordinary", "created", "copy", "figment"] as const).flatMap(kind => (["plain", "boosted", "zero"] as const).map(mode => ({ side, kind, mode })))))("retains $kind/$mode effective spark for $side", ({ side, kind, mode }) => {
    const w = world(side, { kind, mode }), departed = depart(w), trigger = queued(departed.events);
    expect(trigger.lastKnownSubjectSpark).toBe(w.expected);
    expect(trigger.subject).toBe(w.subjectId);
    expect(trigger.source).not.toBe(w.subjectId);
    expect(departed.events).toContainEqual(expect.objectContaining({ kind: "leftPlay", instance: w.subjectId, spark: w.expected }));
    if (kind === "ordinary") {
      expect(departed.state.instances[w.subjectId].status.counters).toBe(0);
      if (mode === "boosted") expect(effectiveSpark(departed.state, w.engine.catalog, w.subjectId)).not.toBe(w.expected);
    } else expect(departed.state.instances[w.subjectId]).toBeUndefined();
    const resolved = step(w.engine, departed.state, { kind: "resolveTrigger" });
    expect(effectiveSpark(resolved.state, w.engine.catalog, w.recipientId)).toBe(1 + w.expected);
    expect(eventLogRecord(trigger, departed.state.version)).toMatchObject({ event: "engine.trigger", detail: { lastKnownSubjectSpark: w.expected } });
  });

  it.each(SIDES.flatMap(side => ["handCopy", "figmentCopy", "figment"].map(kind => ({ side, kind }))))("captures actual $kind creation and abandonment for $side", ({ side, kind }) => {
    const subject: EngineCardDefinition = { ...v.vanilla2, id: syntheticId(0x587030), subtype: "Warrior" };
    const creation = kind === "handCopy" ? p.sequence(p.createCopyInHand(everyIn("void")), p.materialize(everyIn("hand", { subtype: "Warrior" })))
      : kind === "figmentCopy" ? p.materializeFigmentCopy(everyIn("void")) : p.materializeFigments(FIGMENT.id);
    const make: EngineCardDefinition = { ...v.event0, id: syntheticId(0x587031), abilities: () => [event(p.sequence(creation, p.gainSpark(WARRIORS, 3), p.abandon("you", { subtype: "Warrior" })))] };
    const sign: EngineDreamsignDefinition = { id: SIGN, status: "authored", abilities: () => [triggered(whenAbandon(), p.gainPoints(triggerSubjectSpark()))] };
    const engine = createEngine(testCatalog([subject, make], { dreamsigns: [sign] }, [FIGMENT]));
    const board = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [make.id], void: [subject.id], dreamsigns: [SIGN] } });
    const original = board.ids[side].void[0];
    board.state.instances[original] = { ...board.state.instances[original], variant: { amplified: true, deckMods: { ...NO_DECK_MODS, sparkBonus: 4 } } };
    const cast = step(engine, board.state, { kind: "play", card: board.ids[side].hand[0], from: "hand" });
    const made = step(engine, cast.state, { kind: "resolveTop" });
    const trigger = queued(made.events), expected = 9;
    expect(made.events).toContainEqual(expect.objectContaining({ kind: "cardCreated", instance: trigger.subject }));
    expect(made.events).toContainEqual(expect.objectContaining({ kind: "materialized", instance: trigger.subject }));
    expect(made.state.instances[trigger.subject!]).toBeUndefined();
    expect(trigger.lastKnownSubjectSpark).toBe(expected);
    expect(step(engine, made.state, { kind: "resolveTrigger" }).state.sides[side].score).toBe(expected);
  });

  it.each(SIDES)("captures a dissolved lookback subject for %s", side => {
    const w = world(side, { kind: "copy", dissolved: true }), departed = depart(w);
    expect(departed.events).toContainEqual(expect.objectContaining({ kind: "dissolved", instance: w.subjectId }));
    expect(queued(departed.events).lastKnownSubjectSpark).toBe(w.expected);
    expect(departed.state.instances[w.subjectId]).toBeUndefined();
    expect(step(w.engine, departed.state, { kind: "resolveTrigger" }).state.instances[w.recipientId].status.gainedSpark).toBe(w.expected);
  });

  it.each(SIDES)("keeps base setting and source/X/cost independent for %s", side => {
    const w = world(side, { cardSource: true, mode: "base", body: p.sequence(p.gainPoints(triggerSubjectSpark()), p.gainEnergy(thisCharacterSpark()), p.gainMaxEnergy(x()), p.losePoints(triggerSubjectCost())) });
    const departed = depart(w), trigger = queued(departed.events);
    expect(trigger.lastKnownSubjectSpark).toBe(19);
    expect(trigger.lastKnownSubjectCost).toBe(4);
    const done = step(w.engine, departed.state, { kind: "resolveTrigger" }).state;
    expect(done.sides[side].score).toBe(15);
    expect(done.sides[side].currentEnergy).toBe(19);
    expect(done.sides[side].maxEnergy).toBe(21);
  });

  it.each(SIDES)("keeps captured zero despite a live nonzero source for %s", side => {
    const w = world(side, { mode: "zero", cardSource: true }), departed = depart(w);
    expect(effectiveSpark(departed.state, w.engine.catalog, w.sourceId!)).toBe(9);
    expect(queued(departed.events).lastKnownSubjectSpark).toBe(0);
    expect(step(w.engine, departed.state, { kind: "resolveTrigger" }).state.instances[w.recipientId].status.gainedSpark).toBe(0);
  });

  it.each(SIDES.flatMap(side => ["plain", "zero"].map(mode => ({ side, mode: mode as "plain" | "zero" }))))("retains a ceased figment public $mode scalar through views, clone, saves and samples for $side", ({ side, mode }) => {
    const w = world(side, { kind: "figment", mode }), departed = depart(w), trigger = queued(departed.events);
    for (const viewer of SIDES) {
      const view = structuredClone(w.engine.view(departed.state, viewer));
      expect(view.triggerQueue[0]).toMatchObject({ subject: null, lastKnownSubjectSpark: w.expected });
      expect(eventSeenBy(trigger, viewer, departed.state)).toMatchObject({ subject: null, lastKnownSubjectSpark: w.expected });
      const sample = w.engine.determinize(view, w.lists, () => 0.4);
      expect(comparableView(w.engine.view(sample, viewer))).toEqual(comparableView(view));
      const loaded = parseJourneyBattleFoldState(saved(sliceOf(sample)))!.engine.slice.committed;
      expect(loaded.triggerQueue[0]).toMatchObject({ subject: null, lastKnownSubjectSpark: w.expected });
      const resolved = step(w.engine, deserializeState(serializeState(loaded)), { kind: "resolveTrigger" }).state;
      expect(effectiveSpark(resolved, w.engine.catalog, w.recipientId)).toBe(1 + w.expected);
    }
  });

  it.each(SIDES)("strips the scalar with its subsequently concealed source for %s", side => {
    const after = p.sequence(p.returnToHand(all(characterYouControl({ subtype: "Explorer" }))), p.shuffleInto([everyIn("hand", { subtype: "Explorer" })]));
    const w = world(side, { cardSource: true, after }), departed = depart(w), trigger = queued(departed.events);
    const view = w.engine.view(departed.state, side), before = structuredClone(view);
    expect(view.triggerQueue[0].source).toBeNull();
    expect(view.triggerQueue[0]).not.toHaveProperty("lastKnownSubjectSpark");
    expect(eventSeenBy(trigger, side, departed.state)).not.toHaveProperty("lastKnownSubjectSpark");
    expect(w.engine.determinize(view, w.lists, () => 0.4).triggerQueue).toEqual([]);
    expect(view).toEqual(before);
  });

  it.each(SIDES)("retains the snapshot across reentry and nested deferred choices for %s", side => {
    const after = p.materialize(everyIn("void", { subtype: "Warrior" }));
    const body = p.optional(p.chooseOne(p.gainPoints(0), p.ifThen({ cond: "energyAtLeast", amount: 1 }, p.gainSpark(RECIPIENT, plus(times(triggerSubjectSpark(), 2), 1)))));
    const w = world(side, { after, body }), departed = depart(w);
    expect(departed.state.instances[w.subjectId].zone).toBe("play");
    expect(effectiveSpark(departed.state, w.engine.catalog, w.subjectId)).not.toBe(w.expected);
    const done = step(w.engine, departed.state, { kind: "resolveTrigger" }, [1, true]);
    expect(effectiveSpark(done.state, w.engine.catalog, w.recipientId)).toBe(2 + 2 * w.expected);
  });

  it.each(SIDES)("binds the later lookback subject of a delayed trigger for %s", side => {
    const w = world(side, { floating: true, kind: "copy" }), departed = depart(w);
    expect(queued(departed.events).lastKnownSubjectSpark).toBe(w.expected);
    expect(step(w.engine, departed.state, { kind: "resolveTrigger" }).state.instances[w.recipientId].status.gainedSpark).toBe(w.expected);
  });

  it.each(SIDES)("keeps positive and zero gains within the additional-spark ruling for %s", side => {
    for (const mode of ["plain", "zero"] as const) {
      const body = p.sequence(p.delayed(whenGainsSpark(), p.gainAdditionalSpark(triggeringCard(), 1)), p.gainSpark(RECIPIENT, triggerSubjectSpark()));
      const w = world(side, { mode, body });
      const departed = depart(w), first = step(w.engine, departed.state, { kind: "resolveTrigger" });
      expect(first.state.triggerQueue.length).toBe(mode === "zero" ? 0 : 1);
      const final = mode === "zero" ? first : step(w.engine, first.state, { kind: "resolveTrigger" });
      expect(final.state.instances[w.recipientId].status.gainedSpark).toBe(w.expected + (mode === "zero" ? 0 : 1));
      expect(final.events.some(event => event.kind === "triggerQueued")).toBe(false);
    }
  });

  it("uses safe zero for nonlookback subjects and absent bindings, and rejects static evaluation", () => {
    const draw: EngineCardDefinition = { ...v.event0, id: syntheticId(0x587020), abilities: () => [event(p.sequence(p.gainPoints(triggerSubjectSpark()), p.draw(1)))] };
    const watcher: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x587021), abilities: () => [triggered(whenDraw(), p.gainPoints(triggerSubjectSpark()))] };
    const engine = createEngine(testCatalog([draw, watcher]));
    const board = boardState(engine.catalog, { active: "player", phase: "day", player: { back: [watcher.id], hand: [draw.id], deck: [v.vanilla5.id] } });
    const cast = step(engine, board.state, { kind: "play", card: board.ids.player.hand[0], from: "hand" });
    const drawn = step(engine, cast.state, { kind: "resolveTop" });
    expect(drawn.state.triggerQueue[0]).not.toHaveProperty("lastKnownSubjectSpark");
    expect(step(engine, drawn.state, { kind: "resolveTrigger" }).state.sides.player.score).toBe(0);
    const staticReader: EngineCardDefinition = { ...watcher, abilities: () => [staticAbility(p.sparkModifier(self(), triggerSubjectSpark()))] };
    const invalid = createEngine(testCatalog([staticReader]));
    expect(() => invalid.view(boardState(invalid.catalog, { active: "player", phase: "day", player: { back: [watcher.id] } }).state, "player")).toThrow(/static ability/);
  });

  it.each(SIDES)("reloads suspended prefixes and rejects stale or competing intents for %s", side => {
    const w = world(side, { body: p.optional(p.chooseOne(p.gainPoints(0), p.gainPoints(triggerSubjectSpark()))) });
    const fold = createFoldAdapter(w.engine, { checkEventPrefix: true });
    const start = applied(fold.reduce(sliceOf(w.state), { kind: "battleAction", side, action: { kind: "play", card: w.initial.ids[side].hand[0], from: "hand" } }));
    const abandon = fold.pending(start)!.prompt;
    const pending = applied(fold.reduce(start, { kind: "answer", side, promptId: abandon.id, value: [w.subjectId] }));
    const loaded = parseJourneyBattleFoldState(saved(pending))!.engine.slice;
    const prompt = fold.pending(loaded)!.prompt;
    expect(prompt).toEqual(fold.pending(pending)!.prompt);
    expect(fold.reduce(loaded, { kind: "battleAction", side, action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    expect(fold.reduce(loaded, { kind: "answer", side: opponent(side), promptId: prompt.id, value: true })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fold.reduce(loaded, { kind: "answer", side, promptId: prompt.id, value: "invalid" as never })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    const selected = applied(fold.reduce(loaded, { kind: "answer", side, promptId: prompt.id, value: 1 }));
    expect(fold.reduce(selected, { kind: "answer", side, promptId: prompt.id, value: 1 })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    const mode = fold.pending(selected)!.prompt;
    const restarted = parseJourneyBattleFoldState(saved(selected))!.engine.slice;
    const intent = { kind: "answer", side, promptId: mode.id, value: true } as const;
    const direct = applied(fold.reduce(selected, intent)), done = applied(fold.reduce(restarted, intent));
    expect(stateHash(done.committed)).toBe(stateHash(direct.committed));
    expect(done.committed.sides[side].score).toBe(w.expected);
    expect(fold.reduce(done, intent)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
  });

  it.each(SIDES)("contains a failed partial resolution and preserves its committed capture for %s", side => {
    const missing = parseFigmentId("5e5e5e5e-0000-4000-8000-000000587099");
    const w = world(side, { body: p.optional(p.sequence(p.gainPoints(triggerSubjectSpark()), p.materializeFigments(missing))) });
    const fold = createFoldAdapter(w.engine, { checkEventPrefix: true });
    const start = applied(fold.reduce(sliceOf(w.state), { kind: "battleAction", side, action: { kind: "play", card: w.initial.ids[side].hand[0], from: "hand" } }));
    const abandon = fold.pending(start)!.prompt;
    const pending = applied(fold.reduce(start, { kind: "answer", side, promptId: abandon.id, value: [w.subjectId] }));
    const loaded = parseJourneyBattleFoldState(saved(pending))!.engine.slice, before = stateHash(loaded.committed);
    const prompt = fold.pending(loaded)!.prompt;
    const result = fold.reduce(loaded, { kind: "answer", side, promptId: prompt.id, value: true });
    expect(result.kind).toBe("applied");
    if (result.kind !== "applied") throw new Error("Missing contained failure");
    expect(result.error).not.toBeNull();
    expect(result.slice.committed.sides[side].score).toBe(0);
    expect(result.slice.committed.triggerQueue[0].lastKnownSubjectSpark).toBe(w.expected);
    expect(stateHash(result.slice.committed)).toBe(before);
    expect(stateHash(loaded.committed)).toBe(before);
  });
});
