/** D20: battle-start Foresee shares the completed-opening occasion and its event boundary. */
import { expect } from "vitest";
import { BATTLE } from "../battle";
import { parseEngineBattleFold } from "../../rules/battle/fold";
import { parseDreamsignId, parsePromptId } from "../../types/identifiers";
import type { EngineCardDefinition } from "../../engine/catalog";
import { contentDreamsignDefinitions } from "../../engine/content-catalog";
import { event as eventAbility } from "../../engine/dsl/builders";
import { foresee, takeExtraTurn } from "../../engine/effects/primitives";
import { createEngine } from "../../engine/engine";
import type { EngineEvent } from "../../engine/events";
import { createFoldAdapter, type IntentOutcome } from "../../engine/fold/slice";
import { firstLegalAnswer } from "../../engine/prompts/answers";
import type { Answer, ArrangePrompt } from "../../engine/prompts/types";
import { stateHash } from "../../engine/state/hash";
import { battleSeed, opponent, SIDES, sourceKey, type Side } from "../../engine/state/ids";
import type { BattleInit, NextBattleEffects } from "../../engine/state/types";
import { InlineSource, NO_PROMPTS } from "../../engine/steps/sources";
import type { NamedScenario, ScenarioModule } from "../../engine/testing/scenario";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../engine/testing/synthetic-cards";
import { at, passUntil } from "../../engine/testing/trigger-harness";
import { promptView } from "../../engine/view/view";

const HAIR = parseDreamsignId("4e51f321-9089-4872-a0e2-ab909e242b33");
const TONGUE = parseDreamsignId("d78864da-eb31-4f25-9d51-94fca7ecf810");
const GINGER = parseDreamsignId("39260dd5-cb43-47d5-a007-effbe13d6417");
const wanted = new Set([HAIR, TONGUE, GINGER]);
const signs = contentDreamsignDefinitions().filter(sign => wanted.has(sign.id));
const extra: EngineCardDefinition = { ...v.event0, id: syntheticId(0x241001), status: "authored",
  abilities: () => [eventAbility(takeExtraTurn())] };
const later: EngineCardDefinition = { ...v.event0, id: syntheticId(0x241002), status: "authored",
  abilities: () => [eventAbility(foresee(1))] };
const engine = createEngine(testCatalog([extra, later], { dreamsigns: signs }));
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const effects = (energy: number, count = 2): NextBattleEffects => ({ openingHand: [{ count, filter: null }],
  startingEnergy: energy, smallerHandAndCostDiscount: [{ openingHandDelta: -Number.MAX_SAFE_INTEGER, costReduction: 0 }] });
function init(side: Side, dreamsigns: BattleInit["dreamsigns"] = { player: [HAIR], enemy: [HAIR] }, card = extra.id): BattleInit {
  const deck = Array.from({ length: 18 }, () => ({ cardId: card }));
  return { seed: battleSeed("dreamsign-battle-04"), startingSide: side, scoreToWin: 1000,
    decks: { player: deck, enemy: deck }, dreamwell: [], dreamsigns,
    nextBattle: { player: effects(3), enemy: effects(4) } };
}
function applied(out: IntentOutcome) {
  if (out.kind !== "applied" || out.error !== null) throw new Error("Expected a successful opening intent");
  return out;
}
function world(input: BattleInit) {
  const fold = createFoldAdapter(engine, { checkEventPrefix: true });
  return { input, fold, opened: applied(fold.start(input)) };
}
function pending(w: ReturnType<typeof world>, slice = w.opened.slice) {
  const p = w.fold.pending(slice);
  if (p === null) throw new Error("Expected actual catalog opening Foresee");
  return p;
}
function arrangement(prompt: ArrangePrompt): Answer {
  return [...prompt.cards.slice(0, -1).reverse().map(card => ({ card, to: "top" as const })),
    { card: prompt.cards[prompt.cards.length - 1], to: "void" as const }];
}
function answer(w: ReturnType<typeof world>, value: Answer, slice = w.opened.slice) {
  const { prompt } = pending(w, slice);
  return applied(w.fold.reduce(slice, { kind: "answer", side: prompt.side, promptId: prompt.id, value }));
}
const completed = (events: readonly EngineEvent[]) => events.filter(e => e.kind === "openingHandCompleted");
const resolutions = (events: readonly EngineEvent[]) => events.filter(e => e.kind === "triggerResolved");
const hairResolved = (events: readonly EngineEvent[], index = 0) => resolutions(events).filter(e => typeof e.source === "object" && e.source?.kind === "dreamsign" && e.source.index === index);
const prepared = (side: Side): NamedScenario["spec"] => ({
  board: { active: side, phase: "day", [side]: { dreamsigns: [HAIR], deck: [v.vanilla1.id] } }, steps: () => [],
});
const scenarios: NamedScenario[] = [];
for (const side of SIDES) {
  const other = opponent(side);
  scenarios.push({
    name: `${HAIR} ${side} completes both openings before choices and occurs once across extra and later turns`,
    spec: prepared(side),
    check: ({ events: preparedEvents }) => {
      expect(hairResolved(preparedEvents)).toEqual([]);
      const input = init(side);
      // Include two distinct extra groups without forging opening state or queue.
      const w = world({ ...input, nextBattle: { player: { ...effects(3), openingHand: [{ count: 2, filter: null }, { count: 1, filter: null }] },
        enemy: { ...effects(4), openingHand: [{ count: 2, filter: null }, { count: 1, filter: null }] } } });
      const p = pending(w);
      expect(p.prompt).toMatchObject({ kind: "arrange", side, privateTo: side, cancellable: false,
        purpose: { role: "foresee", source: { kind: "dreamsign", id: HAIR, side, index: 0 } } });
      if (p.prompt.kind !== "arrange") throw new Error("Missing arrange");
      expect(p.prompt.cards).toEqual(p.display.sides[side].deck.slice(0, 3));
      expect(p.prompt.cards).toHaveLength(3);
      expect(completed(w.opened.published)).toEqual([side, other].map(holder => ({ kind: "openingHandCompleted", side: holder })));
      expect(w.opened.published.filter(e => e.kind === "cardDrawn")).toHaveLength(6);
      for (const holder of SIDES) {
        expect(p.display.sides[holder].hand).toHaveLength(3);
        expect(p.display.sides[holder].currentEnergy).toBe(BATTLE.startingEnergy + (holder === "player" ? 3 : 4));
      }
      expect(p.display.turn.turnNumber).toBe(0);
      expect(engine.decision(w.opened.slice.committed)).toBeNull();
      expect(w.opened.published.some(e => e.kind === "turnStarted")).toBe(false);
      const one = answer(w, arrangement(p.prompt));
      const q = pending(w, one.slice);
      expect(q.prompt.side).toBe(other);
      if (q.prompt.kind !== "arrange") throw new Error("Missing nonstarter arrange");
      expect(q.prompt.cards).toEqual(q.display.sides[other].deck.slice(0, 3));
      expect(one.published.some(e => e.kind === "turnStarted")).toBe(false);
      const done = answer(w, arrangement(q.prompt), one.slice);
      const openingEvents = [...w.opened.published, ...one.published, ...done.published];
      expect(hairResolved(openingEvents).map(e => e.controller)).toEqual([side, other]);
      expect(openingEvents.filter(e => e.kind === "foresaw").map(e => e.side)).toEqual([side, other]);
      for (const [holder, prompt] of [[side, p.prompt], [other, q.prompt]] as const) {
        expect(done.slice.committed.sides[holder].deck.slice(0, 2)).toEqual(prompt.cards.slice(0, 2).reverse());
        expect(done.slice.committed.sides[holder].void).toContain(prompt.cards[2]);
      }
      expect(engine.decision(done.slice.committed)?.side).toBe(side);
      const play = engine.apply(done.slice.committed, side,
        { kind: "play", card: done.slice.committed.sides[side].hand[0], from: "hand" }, NO_PROMPTS);
      const through = passUntil(engine, play.state, state => state.turn.sideTurns[side] >= 3 && at(engine, side, "day")(state));
      const tail = [...play.events, ...through.events];
      expect(tail.filter(e => e.kind === "turnStarted" && e.extra)).toHaveLength(1);
      expect(completed(tail)).toEqual([]);
      expect(hairResolved(tail)).toEqual([]);
      expect(tail.filter(e => e.kind === "foresaw")).toEqual([]);
    },
  });
  scenarios.push({
    name: `${HAIR} ${side} nonstarter private pending choice refuses invalid intents and cold replays`,
    spec: prepared(side),
    check: () => {
      const input = init(side, { [other]: [HAIR] });
      const w = world(input), p = pending(w), before = copy(w.opened.slice);
      if (p.prompt.kind !== "arrange") throw new Error("Missing nonstarter arrange");
      expect(p.prompt.side).toBe(other);
      expect(p.display.turn.turnNumber).toBe(0);
      expect(promptView(p.prompt, side, p.display)).toMatchObject({ cards: [] });
      const intent = { kind: "answer" as const, side: other, promptId: p.prompt.id, value: arrangement(p.prompt) };
      for (const [bad, reason] of [
        [{ ...intent, side }, "notYourPrompt"],
        [{ ...intent, promptId: parsePromptId("0:0:0") }, "stalePrompt"],
        [{ ...intent, value: [] }, "illegalAnswer"],
        [{ ...intent, value: [{ card: p.display.sides[side].hand[0], to: "top" }] }, "illegalAnswer"],
        [{ kind: "cancel" as const, side: other, promptId: p.prompt.id }, "notCancellable"],
        [{ kind: "battleAction" as const, side: other, action: { kind: "pass" as const } }, "stepInFlight"],
      ] as const) expect(w.fold.reduce(w.opened.slice, bad)).toEqual({ kind: "bounced", reason });
      expect(w.opened.slice).toEqual(before);
      const saved = parseEngineBattleFold(copy({ init: input, slice: before }), engine.catalog);
      if (saved === null) throw new Error("Valid pending save rejected");
      const cold = createFoldAdapter(engine, { checkEventPrefix: true });
      expect(cold.pending(saved.slice)).toEqual(p);
      const warm = applied(w.fold.reduce(before, intent)), restored = applied(cold.reduce(saved.slice, intent));
      expect(restored).toEqual(warm);
      expect(stateHash(restored.slice.committed)).toBe(stateHash(warm.slice.committed));
      expect(completed(warm.published)).toEqual([]);
      expect(warm.published.filter(e => e.kind === "foresaw")).toHaveLength(1);
      expect(hairResolved([...w.opened.published, ...warm.published])).toHaveLength(1);
      expect(w.fold.reduce(warm.slice, intent)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
      const frozen = copy(input);
      expect(() => engine.createBattle(input, { answer() { throw new Error("refused catalog choice"); } })).toThrow("refused catalog choice");
      expect(input).toEqual(frozen);
    },
  });
  scenarios.push({
    name: `${HAIR} ${side} empty deck completes without extra Fatigue and Tongue source order suppresses preturn listeners`,
    spec: prepared(side),
    check: () => {
      const input = init(side, { [side]: [HAIR] });
      const empty = engine.createBattle({ ...input, decks: { ...input.decks, [side]: [] } }, NO_PROMPTS);
      expect(empty.events.filter(e => e.kind === "foresaw")).toEqual([{ kind: "foresaw", side, kept: [], voided: [] }]);
      expect(empty.events.filter(e => e.kind === "fatigue" && e.side === side)).toHaveLength(2);
      expect(completed(empty.events)).toHaveLength(2);
      expect(hairResolved(empty.events)).toHaveLength(1);
      for (const held of [[TONGUE, HAIR, GINGER], [HAIR, TONGUE, GINGER]]) {
        const source = new InlineSource({ player: choose, enemy: choose });
        function choose(prompt: Parameters<typeof firstLegalAnswer>[0]): Answer {
          if (prompt.kind === "confirm") return true;
          if (prompt.kind === "chooseCards") return prompt.candidates.slice(0, 1);
          return prompt.kind === "arrange" ? arrangement(prompt) : firstLegalAnswer(prompt);
        }
        const opened = engine.createBattle(init(side, { [side]: held }, later.id), source);
        const resolved = resolutions(opened.events);
        expect(resolved.map(e => e.source === null ? null : sourceKey(e.source))).toEqual([0, 1].map(index => `dreamsign:${side}:${index}`));
        expect(opened.events.filter(e => e.kind === "cardDrawn" && e.side === side)).toHaveLength(3);
        expect(opened.events.filter(e => e.kind === "foresaw")).toHaveLength(1);
        expect(completed(opened.events)).toHaveLength(2);
        const played = engine.apply(opened.state, side,
          { kind: "play", card: opened.state.sides[side].hand[0], from: "hand" }, source);
        const done = passUntil(engine, played.state, state => state.stack.length === 0 && at(engine, side, "day")(state), source);
        const laterEvents = [...played.events, ...done.events];
        expect(laterEvents.filter(e => e.kind === "foresaw")).toHaveLength(1);
        expect(resolutions(laterEvents)).toMatchObject([{ controller: side, source: { kind: "dreamsign", side, index: 2 } }]);
        expect(laterEvents.filter(e => e.kind === "cardDrawn" && e.side === side)).toHaveLength(1);
        expect(completed(laterEvents)).toEqual([]);
        expect(hairResolved(laterEvents, held.indexOf(HAIR))).toEqual([]);
      }
    },
  });
}
export default { slug: "dreamsigns-battle-04", scenarios } satisfies ScenarioModule;
