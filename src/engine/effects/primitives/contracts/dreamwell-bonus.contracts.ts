/** Authored Dreamwell bonuses resolve through the public engine and fold contracts. */
import { describe, expect, it } from "vitest";
import { dreamwellCard } from "../../../../content/define";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import { parseBattleId, parseDreamwellCardId, parseOpponentId, parsePromptId, parseSiteId } from "../../../../types/identifiers";
import { createCatalog, type EngineCardDefinition, type EngineDreamwellDefinition } from "../../../catalog";
import { engineDreamwellFromContent } from "../../../content-catalog";
import { energy, event, everyIn, self } from "../../../dsl/builders";
import { onDissolved, triggered, whenDraw, whenGainsSpark, whenScores } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { eventSeenBy } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { drawDreamwell } from "../../../rules/dreamwell";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { opponent, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import type { Step } from "../../../steps/kinds";
import { runStep } from "../../../steps/runner";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC_CARDS, SYNTHETIC as v, syntheticId } from "../../../testing/synthetic-cards";
import { chooseOne } from "../choose-one";
import { draw } from "../draw";
import { floating, delayed } from "../floating-trigger";
import { materialize } from "../materialize";
import { withMaterialized } from "../with-materialized";
import { foresee } from "../foresee";
import { gainEnergy } from "../gain-energy";
import { gainPoints } from "../gain-points";
import { gainAdditionalSpark } from "../gain-spark";
import { sequence } from "../sequence";

const deck = [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id, v.vanilla5.id];
function well(index: number, effect: Parameters<typeof event>[0]): EngineDreamwellDefinition {
  return { id: parseDreamwellCardId(`00000000-0000-4000-8000-${(0x54100 + index).toString(16).padStart(12, "0")}`),
    order: 1, energyAdded: 1, status: "authored", abilities: () => [event(effect)] };
}
const scoredWell = well(0, gainPoints(3));
const modalWell = well(1, chooseOne(gainPoints(2), gainEnergy(4)));
const forecastWell = well(2, sequence(gainEnergy(2), foresee(2), gainPoints(3)));
const badWell = well(3, sequence(gainEnergy(2), gainAdditionalSpark(self(), 1)));
const energyWell = well(4, gainEnergy(2));
const flowWell = well(5, sequence(draw(1), gainPoints({ value: "handSize", player: "you" })));
const hook: EngineCardDefinition = { ...v.event0, id: syntheticId(0x541ff), status: "authored", costs: [energy(0)],
  abilities: () => [event(gainPoints(7))], synthetic: { resolve(ctx, item) { drawDreamwell(ctx, item.controller); } } };
const floatingWell = well(7, withMaterialized(materialize(everyIn("void")), floating(whenDraw(), gainPoints(1))));
const delayedWell = well(8, withMaterialized(materialize(everyIn("void")), delayed(whenDraw(), gainPoints(1))));
const contextWatcher: EngineCardDefinition = { ...v.vanilla1, id: syntheticId(0x54700), status: "authored",
  abilities: () => [triggered(whenGainsSpark(), gainPoints(1)), triggered(whenScores(), gainPoints(1)),
    triggered(whenDraw(), gainPoints(1)), triggered(onDissolved(), gainPoints(1))] };
const definitions = [floatingWell, delayedWell, scoredWell, modalWell, forecastWell, badWell, energyWell, flowWell];
const engine = createEngine(createCatalog([...SYNTHETIC_CARDS, hook], definitions));
const sliceOf = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(outcome: IntentOutcome) {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`unexpected fold outcome ${JSON.stringify(outcome)}`);
  return outcome;
}
function step(state: BattleState, next: Step, answers: ConstructorParameters<typeof ScriptedSource>[0] = []) {
  const source = answers.length === 0 ? NO_PROMPTS : new ScriptedSource(answers);
  const result = runStep(state, next, source, engine.catalog);
  if (result.kind !== "done") throw new Error("unexpected suspended step");
  if (source instanceof ScriptedSource) source.assertExhausted();
  expect(invariantViolations(result.state, engine.catalog)).toEqual([]);
  return result;
}
function beforeDraw(card: EngineDreamwellDefinition, side: Side = "player", phase: "night" | "ending" = "ending") {
  const board = boardState(engine.catalog, { active: opponent(side), phase, round: 2, scoreToWin: 100,
    player: { deck, energy: 2 }, enemy: { deck, energy: 2 } });
  board.state.dreamwell = { deck: [card.id], next: 0, catalog: definitions.map((d) => d.id) };
  return board;
}
function queued(card: EngineDreamwellDefinition, side: Side = "player") {
  return step(beforeDraw(card, side).state, { kind: "advancePhase" });
}
function saved(state: BattleState) {
  return { mode: { kind: "journey" }, init: {
    battleId: parseBattleId("battle-dreamwell"), siteId: parseSiteId("site-dreamwell"), nodeId: null,
    completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false,
    enemyDescriptor: { id: parseOpponentId("opponent-dreamwell"), name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] },
    avatarSummary: null, cardDefinitions: [],
  }, engine: { init: { seed: state.seed, scoreToWin: 100, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: sliceOf(state) } };
}
function opening(card: EngineDreamwellDefinition, side: Side = "player") {
  const fold = createFoldAdapter(engine, { checkEventPrefix: true });
  const board = beforeDraw(card, side, "night");
  const outcome = applied(fold.reduce(sliceOf(board.state), { kind: "battleAction", side: opponent(side), action: { kind: "pass" } }));
  const pending = fold.pending(outcome.slice);
  if (pending === null) throw new Error("expected Dreamwell choice");
  return { fold, board, outcome, pending };
}

describe("Dreamwell bonus execution", () => {
  it.each(["player", "enemy"] as const)("applies an authored bonus after its energy refill before the turn draw for %s", (side) => {
    const board = beforeDraw(scoredWell, side, "night");
    const result = engine.apply(board.state, opponent(side), { kind: "pass" }, NO_PROMPTS);
    expect(result.state.sides[side].score).toBe(3);
    expect(result.state.sides[side].maxEnergy).toBe(3);
    const score = result.events.findIndex((e) => e.kind === "pointsScored" && e.side === side);
    const refresh = result.events.findIndex((e) => e.kind === "energyChanged" && e.side === side && e.max === 3);
    const normalDraw = result.events.findIndex((e) => e.kind === "cardDrawn" && e.side === side);
    expect(refresh).toBeGreaterThanOrEqual(0);
    expect(score).toBeGreaterThan(refresh);
    expect(normalDraw).toBeGreaterThan(score);
    expect(result.events.filter((e) => e.kind === "triggerResolved")).toEqual([
      { kind: "triggerResolved", source: { kind: "dreamwell", side, id: scoredWell.id }, controller: side, ability: 0, node: null, applied: true },
    ]);
  });

  it("transports an authored content definition into a bonus-capable engine catalog", () => {
    const content = dreamwellCard({ name: "Synthetic source", id: "00000000-0000-4000-8000-000000054100", renderedText: "Synthetic effect", verifiedText: "fixture",
      abilities: scoredWell.abilities, order: 1, energyAdded: 1, cardType: "Dreamwell", imageNumber: 0, artOwned: false, cardNumber: 0, tags: [] });
    const adapted = engineDreamwellFromContent(content);
    const local = createEngine(createCatalog(SYNTHETIC_CARDS, [adapted]));
    const board = beforeDraw(scoredWell, "player", "night");
    expect(local.apply(board.state, "enemy", { kind: "pass" }, NO_PROMPTS).state.sides.player.score).toBe(3);
  });

  it.each(["pending", "vanilla"] as const)("keeps %s Dreamwell draws energy-only even if a synthetic definition carries abilities", (status) => {
    const local = createEngine(createCatalog(SYNTHETIC_CARDS, [{ ...scoredWell, status }]));
    const board = beforeDraw(scoredWell, "player", "night");
    const result = local.apply(board.state, "enemy", { kind: "pass" }, NO_PROMPTS);
    expect(result.state.sides.player.score).toBe(0);
    expect(result.state.sides.player.maxEnergy).toBe(3);
    expect(result.events.filter((e) => e.kind === "triggerResolved")).toEqual([]);
    expect(result.events.filter((e) => e.kind === "pendingAbility")).toHaveLength(status === "pending" ? 1 : 0);
  });

  it("adds current bonus energy above the refreshed maximum", () => {
    const drawn = queued(energyWell);
    expect(drawn.state.sides.player.currentEnergy).toBe(3);
    const result = step(drawn.state, { kind: "resolveTrigger" });
    expect(result.state.sides.player.currentEnergy).toBe(5);
    expect(result.state.sides.player.maxEnergy).toBe(3);
  });

  it("lets card-flow bonuses observe their own draw before the normal turn draw", () => {
    const result = engine.apply(beforeDraw(flowWell, "enemy", "night").state, "player", { kind: "pass" }, NO_PROMPTS);
    expect(result.state.sides.enemy.score).toBe(1);
    expect(result.state.sides.enemy.hand).toHaveLength(2);
    expect(result.events.filter((e) => e.kind === "cardDrawn")).toHaveLength(2);
  });

  it("appends an extra draw bonus after the resolving card's remaining effect", () => {
    const board = boardState(engine.catalog, { active: "player", phase: "day", scoreToWin: 100,
      player: { hand: [hook.id], deck, energy: 2 }, enemy: { deck } });
    board.state.dreamwell = { deck: [scoredWell.id], next: 0, catalog: [scoredWell.id] };
    const result = engine.apply(board.state, "player", { kind: "play", card: board.ids.player.hand[0], from: "hand" }, NO_PROMPTS);
    const effects = result.events.filter((e) => e.kind === "pointsScored");
    expect(effects.map((e) => e.amount)).toEqual([7, 3]);
    const refill = result.events.findIndex((e) => e.kind === "energyChanged" && e.maxChange === 1);
    expect(result.events.findIndex((e) => e.kind === "pointsScored")).toBeGreaterThan(refill);
    expect(result.state.sides.player.score).toBe(10);
  });

  it("keeps a queued prompt's original UUID and controller after another Dreamwell draw", () => {
    const board = boardState(engine.catalog, { active: "enemy", phase: "day", scoreToWin: 100,
      enemy: { hand: [hook.id], deck, energy: 2 }, player: { deck } });
    board.state.dreamwell = { deck: [modalWell.id, scoredWell.id], next: 0, catalog: [modalWell.id, scoredWell.id] };
    const twice: EngineCardDefinition = { ...hook, synthetic: { resolve(ctx, item) {
      drawDreamwell(ctx, item.controller); drawDreamwell(ctx, opponent(item.controller));
    } } };
    const local = createEngine(createCatalog([...SYNTHETIC_CARDS, twice], definitions));
    const fold = createFoldAdapter(local);
    const out = applied(fold.reduce(sliceOf(board.state), { kind: "battleAction", side: "enemy", action: { kind: "play", card: board.ids.enemy.hand[0], from: "hand" } }));
    const pending = fold.pending(out.slice);
    expect(pending?.prompt.side).toBe("enemy");
    expect(pending?.prompt.purpose.source).toEqual({ kind: "dreamwell", side: "enemy", id: modalWell.id });
    if (pending === null) throw new Error("missing modal bonus");
    const answered = applied(fold.reduce(out.slice, { kind: "answer", side: "enemy", promptId: pending.prompt.id, value: 0 }));
    expect(answered.slice.committed.sides.enemy.score).toBe(9);
    expect(answered.slice.committed.sides.player.score).toBe(3);
  });

  it("preserves a bonus queue's hash, JSON replay, public source and deterministic view reconstruction", () => {
    const drawn = queued(modalWell, "enemy").state;
    expect(stateHash(deserializeState(serializeState(drawn)))).toBe(stateHash(drawn));
    for (const viewer of ["player", "enemy"] as const) {
      const seen = engine.view(drawn, viewer);
      expect(seen.triggerQueue[0]).toMatchObject({ kind: "dreamwellBonus", source: { kind: "dreamwell", side: "enemy", id: modalWell.id } });
      const sampled = engine.determinize(seen, { player: deck.map((cardId) => ({ cardId })), enemy: deck.map((cardId) => ({ cardId })) }, () => 0.37);
      expect(sampled.triggerQueue).toEqual(drawn.triggerQueue);
      expect(step(sampled, { kind: "resolveTrigger" }, [0]).state.sides.enemy.score).toBe(2);
    }
  });

  it("replays a private multi-effect prompt after reload and publishes the bonus once", () => {
    const { fold, outcome, pending } = opening(forecastWell);
    const before = stateHash(outcome.slice.committed);
    expect(pending.prompt.kind).toBe("arrange");
    expect(pending.prompt.purpose.source).toEqual({ kind: "dreamwell", side: "player", id: forecastWell.id });
    const hidden = engine.view(pending.display, "enemy");
    expect(hidden.sides.player.deck.known).toEqual([]);
    expect(outcome.slice.committed.sides.player.currentEnergy).toBe(3);
    expect(pending.display.sides.player.currentEnergy).toBe(5);
    if (pending.prompt.kind !== "arrange") throw new Error("missing arrangement");
    const answer = { kind: "answer", side: "player", promptId: pending.prompt.id,
      value: pending.prompt.cards.map((card) => ({ card, to: "top" as const })) } as const;
    const reloaded = JSON.parse(JSON.stringify(outcome.slice)) as BattleSlice;
    const direct = applied(fold.reduce(outcome.slice, answer));
    const replayed = applied(createFoldAdapter(engine, { checkEventPrefix: true }).reduce(reloaded, answer));
    expect(stateHash(replayed.slice.committed)).toBe(stateHash(direct.slice.committed));
    expect(stateHash(outcome.slice.committed)).toBe(before);
    expect(replayed.slice.committed.sides.player.score).toBe(3);
    expect([...outcome.published, ...replayed.published].filter((e) => e.kind === "triggerResolved")).toHaveLength(1);
    expect(replayed.published.filter((e) => e.kind === "foresaw")).toHaveLength(1);
    const sourceEvent = outcome.published.find((e) => e.kind === "triggerResolved");
    if (sourceEvent === undefined) throw new Error("missing published source marker");
    for (const viewer of ["player", "enemy"] as const) expect(eventSeenBy(sourceEvent, viewer, pending.display)).toEqual(sourceEvent);
  });

  it("rolls back a failed bonus step after a preceding effect while retaining the committed draw", () => {
    const drawn = queued(badWell).state;
    const hash = stateHash(drawn);
    expect(() => runStep(drawn, { kind: "resolveTrigger" }, NO_PROMPTS, engine.catalog)).toThrow();
    expect(stateHash(drawn)).toBe(hash);
    expect(drawn.sides.player.currentEnergy).toBe(3);
    expect(drawn.triggerQueue).toHaveLength(1);
    const board = beforeDraw(badWell, "player", "night");
    const out = createFoldAdapter(engine).reduce(sliceOf(board.state), { kind: "battleAction", side: "enemy", action: { kind: "pass" } });
    expect(out.kind).toBe("applied");
    if (out.kind !== "applied") throw new Error("missing failed fold");
    expect(out.error).not.toBeNull();
    expect(out.slice.committed.sides.player.currentEnergy).toBe(3);
    expect(out.slice.committed.triggerQueue).toHaveLength(1);
  });

  it("rejects malformed or partially written queued Dreamwell records at the public load boundary", () => {
    const original = queued(modalWell).state;
    expect(parseJourneyBattleFoldState(saved(original))).not.toBeNull();
    const mutations = [
      (r: Record<string, unknown>) => { delete r.kind; },
      (r: Record<string, unknown>) => { r.source = { kind: "dreamwell", side: "player" }; },
      (r: Record<string, unknown>) => { r.origin = { kind: "dreamwell", id: "invalid" }; },
      (r: Record<string, unknown>) => { r.origin = { kind: "dreamwell", id: scoredWell.id }; },
      (r: Record<string, unknown>) => { r.controller = "enemy"; },
      (r: Record<string, unknown>) => { r.node = 0; },
      (r: Record<string, unknown>) => { r.kind = "other"; },
    ];
    for (const mutate of mutations) {
      const state = deserializeState(serializeState(original));
      mutate(state.triggerQueue[0] as unknown as Record<string, unknown>);
      expect(parseJourneyBattleFoldState(saved(state))).toBeNull();
    }
  });

  it.each([
    ["captured cards", { captured: ["i0"] }], ["empty captured cards", { captured: [] }],
    ["spark gain", { gain: { amount: 2, expiry: { at: "never" } } }],
    ["zero spark gain", { gain: { amount: 0, expiry: { at: "never" } } }],
    ["scored points", { scored: 5 }], ["zero scored points", { scored: 0 }],
    ["retained spark", { lastKnownSourceSpark: 3 }], ["zero retained spark", { lastKnownSourceSpark: 0 }],
    ["hidden subject", { subjectHiddenFrom: ["enemy"] }], ["empty hidden subject", { subjectHiddenFrom: [] }],
  ])("rejects saved bonus trigger context: %s", (_label, context) => {
    const original = queued(modalWell).state;
    const hash = stateHash(original);
    const state = deserializeState(serializeState(original));
    Object.assign(state.triggerQueue[0], context);
    expect(parseJourneyBattleFoldState(saved(state))).toBeNull();
    expect(stateHash(original)).toBe(hash);
  });

  it("preserves ordinary triggered causes through the public saved-state loader", () => {
    const local = createEngine(createCatalog([...SYNTHETIC_CARDS, contextWatcher], []));
    const board = boardState(local.catalog, { active: "player", phase: "day", player: { back: [contextWatcher.id], deck } });
    const source = board.ids.player.back[0];
    if (source === null) throw new Error("missing watcher");
    const base = { source, controller: "player" as const, origin: { kind: "card" as const, cardId: contextWatcher.id,
      variant: board.state.instances[source].variant }, node: null };
    // Each supplied schema fixture carries only its matching trigger's cause.
    board.state.triggerQueue = [
      { ...base, ability: 0, subject: source, gain: { amount: 2, expiry: { at: "never" } } },
      { ...base, ability: 1, subject: source, scored: 5 },
      { ...base, ability: 2, subject: board.ids.player.deck[0], subjectHiddenFrom: ["enemy"] },
      { ...base, ability: 3, subject: source, lastKnownSourceSpark: 3 },
    ];
    const loaded = parseJourneyBattleFoldState(JSON.parse(JSON.stringify(saved(board.state))) as Record<string, unknown>);
    expect(loaded).not.toBeNull();
    expect(loaded?.engine.slice.committed.triggerQueue).toEqual(board.state.triggerQueue);
  });

  it.each([floatingWell, delayedWell])("preserves generated Dreamwell-origin node contexts for $id", (definition) => {
    const board = beforeDraw(definition);
    const drawn = step(board.state, { kind: "advancePhase" });
    const armed = step(drawn.state, { kind: "resolveTrigger" });
    const triggered = step(armed.state, { kind: "advancePhase" }).state;
    expect(triggered.triggerQueue).toHaveLength(1);
    expect(triggered.triggerQueue[0]).toMatchObject({ source: { kind: "dreamwell", id: definition.id },
      origin: { kind: "dreamwell", id: definition.id }, captured: [], subjectHiddenFrom: ["enemy"] });
    expect(triggered.triggerQueue[0].node).not.toBeNull();
    const loaded = parseJourneyBattleFoldState(JSON.parse(JSON.stringify(saved(triggered))) as Record<string, unknown>);
    expect(loaded).not.toBeNull();
    expect(loaded?.engine.slice.committed.triggerQueue).toEqual(triggered.triggerQueue);
    expect(step(triggered, { kind: "resolveTrigger" }).state.sides.player.score).toBe(1);
  });

  it("bounces invalid, foreign and stale answers without consuming the bonus", () => {
    const { fold, outcome, pending } = opening(modalWell);
    const hash = stateHash(outcome.slice.committed);
    const answer = { kind: "answer", side: "player", promptId: pending.prompt.id, value: 0 } as const;
    expect(fold.reduce(outcome.slice, { ...answer, value: 99 })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fold.reduce(outcome.slice, { ...answer, side: "enemy" })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fold.reduce(outcome.slice, { ...answer, promptId: parsePromptId("0:0:0") })).toEqual({ kind: "bounced", reason: "stalePrompt" });
    expect(stateHash(outcome.slice.committed)).toBe(hash);
    expect(applied(fold.reduce(outcome.slice, answer)).slice.committed.sides.player.score).toBe(2);
  });

  it("commits one of concurrent duplicate answers and replays independent replicas identically", () => {
    const { fold, outcome, pending } = opening(modalWell);
    const answer = { kind: "answer", side: "player", promptId: pending.prompt.id, value: 0 } as const;
    const first = applied(fold.reduce(outcome.slice, answer));
    expect(fold.reduce(first.slice, answer)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    const replica = applied(createFoldAdapter(engine).reduce(JSON.parse(JSON.stringify(outcome.slice)) as BattleSlice, answer));
    expect(stateHash(replica.slice.committed)).toBe(stateHash(first.slice.committed));
    expect(first.slice.committed.sides.player.score).toBe(2);
    expect([...outcome.published, ...first.published].filter((e) => e.kind === "triggerResolved")).toHaveLength(1);
  });
});
