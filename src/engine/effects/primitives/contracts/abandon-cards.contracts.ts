/** Captured materializations are abandoned by their delayed controller, atomically through save/replay. */
import { describe, expect, it } from "vitest";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import { createEngine } from "../../../engine";
import type { EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { battleSeed, SIDES, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { runStep } from "../../../steps/runner";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { unannouncedChanges } from "../../../testing/announced-changes";
import { boardState, placeFigment, type SideSetup } from "../../../testing/board";
import { CAPTURE, CAPTURE_CARDS, CAPTURE_FIGMENT } from "../../../testing/captured-figment-cards";
import { determinizationDivergences } from "../../../testing/determinization-fidelity";
import { invariantViolations } from "../../../testing/invariants";
import { eventRedactionViolations } from "../../../testing/redaction";
import { SYNTHETIC, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { abandonCards } from "../abandon-cards";

const engine = createEngine(testCatalog(CAPTURE_CARDS, {}, [CAPTURE_FIGMENT]));
const deck = Array.from({ length: 8 }, () => SYNTHETIC.vanilla1.id);
function setup(player: SideSetup, enemy: SideSetup = {}, active: Side = "player") {
  return boardState(engine.catalog, { active, phase: "day", player: { deck, ...player }, enemy: { deck, ...enemy } });
}
const abandoned = (events: readonly EngineEvent[]) => events.flatMap((event) => event.kind === "abandoned" ? [event.instance] : []);
const zone = (state: BattleState, id: InstanceId) => state.instances[id]?.zone ?? null;
const cohort = (state: BattleState) => {
  const effect = state.floating.find((entry) => entry.change.kind === "trigger");
  if (effect?.change.kind !== "trigger" || effect.change.captured === undefined) throw new Error("no captured delayed trigger");
  return effect.change.captured;
};
function checked(start: BattleState, end: BattleState, events: readonly EngineEvent[]) {
  expect(invariantViolations(end, engine.catalog)).toEqual([]);
  expect(unannouncedChanges(events, start, end)).toEqual([]);
  expect(eventRedactionViolations(events, start, end)).toEqual([]);
}
function play(state: BattleState, card: InstanceId, side: Side = "player", answers: AnswerSource = NO_PROMPTS) {
  const played = engine.apply(state, side, { kind: "play", card, from: "hand" }, answers);
  const rest = passUntil(engine, played.state, (next) => next.stack.length === 0 && next.triggerQueue.length === 0, answers);
  const events = [...played.events, ...rest.events];
  checked(state, rest.state, events);
  return { state: rest.state, events };
}
function end(state: BattleState, answers: AnswerSource = NO_PROMPTS) {
  const result = passUntil(engine, state, (next) => next.turn.turnNumber > state.turn.turnNumber && next.turn.phase === "day", answers, 100);
  checked(state, result.state, result.events);
  return result;
}
const sliceOf = (state: BattleState): BattleSlice => ({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 });
function applied(result: IntentOutcome): BattleSlice {
  if (result.kind !== "applied" || result.error !== null) throw new Error(`unexpected intent outcome ${JSON.stringify(result)}`);
  return result.slice;
}

describe("abandonCards", () => {
  it.each(SIDES)("abandons only its two materializations in entry order and fires each departure trigger for %s", (side) => {
    const { state, ids } = setup(side === "player" ? { hand: [CAPTURE.outside.id], back: [CAPTURE.watcher.id] } : {},
      side === "enemy" ? { hand: [CAPTURE.outside.id], back: [CAPTURE.watcher.id] } : {}, side);
    const resident = placeFigment(state, side, { rank: "back", index: 1 }, { kind: "figment", figment: CAPTURE_FIGMENT.id, spark: 1 });
    const raised = play(state, ids[side].hand[0], side);
    const captured = cohort(raised.state);
    expect(captured).toHaveLength(2);
    const born = raised.events.flatMap((event) => event.kind === "cardCreated" ? [event.instance] : []);
    expect(captured).toEqual(born.slice(0, 2));
    expect(born).toHaveLength(3);
    expect(captured.map((id) => raised.state.instances[id].status.exhausted)).toEqual([false, false]);
    const ended = end(raised.state);
    expect(abandoned(ended.events)).toEqual(captured);
    expect(captured.map((id) => zone(ended.state, id))).toEqual([null, null]);
    expect([zone(ended.state, resident), zone(ended.state, born[2])]).toEqual(["play", "play"]);
    expect(ended.state.sides[side].score).toBe(4);
    expect(ended.events.filter((event) => event.kind === "triggerResolved" && captured.some((id) => id === event.source))).toHaveLength(2);
  });

  it("abandons one fitting combined-spark figment, and an empty full-capacity cohort affects no resident", () => {
    for (const open of [1, 0]) {
      const { state, ids } = setup({ hand: [CAPTURE.raise.id], back: Array.from({ length: 10 - open }, () => SYNTHETIC.vanilla1.id) });
      // Entering-play event effects cannot be played at a full rank; a delayed resolution may fill it before materializing.
      const raised = open === 0
        ? (() => {
          const start = setup({ back: [CAPTURE.caller.id, ...Array.from({ length: 8 }, () => SYNTHETIC.vanilla1.id)] }, { hand: [CAPTURE.fill.id] });
          const activating = engine.apply(start.state, "player", { kind: "activate", source: start.ids.player.back[0]!, ability: 0 }, NO_PROMPTS);
          // The action has committed to the stack; a response creates the final resident before it resolves.
          const settled = play(activating.state, start.ids.enemy.hand[0], "enemy");
          return { state: settled.state, residents: settled.state.sides.player.backRank };
        })()
        : { state: play(state, ids.player.hand[0]).state, residents: ids.player.back };
      const captured = cohort(raised.state);
      expect(captured).toHaveLength(open);
      if (open === 1) expect(raised.state.instances[captured[0]].printing).toEqual({ kind: "figment", figment: CAPTURE_FIGMENT.id, spark: 2 });
      const ended = end(raised.state);
      expect(abandoned(ended.events)).toEqual(captured);
      expect(raised.residents.every((id) => id !== null && zone(ended.state, id) === "play")).toBe(true);
    }
  });

  it("skips a member that ceased to exist, and never abandons a duplicated reference twice", () => {
    const { state, ids } = setup({ hand: [CAPTURE.duplicates.id, CAPTURE.kill.id], back: [CAPTURE.watcher.id] });
    const raised = play(state, ids.player.hand[0]).state;
    const captured = cohort(raised);
    const departed = play(raised, ids.player.hand[1], "player", new ScriptedSource([[captured[0]]])).state;
    expect(zone(departed, captured[0])).toBe(null);
    const ended = end(departed);
    expect(abandoned(ended.events)).toEqual([captured[1]]);
    expect(ended.state.sides.player.score).toBe(3);
  });

  it("spares a captured figment whose control changed, while the delayed controller keeps its other member", () => {
    const { state, ids } = setup({ hand: [CAPTURE.raise.id], back: [CAPTURE.watcher.id] }, { hand: [CAPTURE.seize.id] });
    const raised = play(state, ids.player.hand[0]).state;
    const captured = cohort(raised);
    const priority = engine.apply(raised, "player", { kind: "pass" }, NO_PROMPTS).state;
    const stolen = play(priority, ids.enemy.hand[0], "enemy", new ScriptedSource([[captured[0]]]));
    expect(stolen.state.instances[captured[0]].controller).toBe("enemy");
    const ended = end(stolen.state);
    expect(abandoned(ended.events)).toEqual([captured[1]]);
    expect(zone(ended.state, captured[0])).toBe("play");
    expect(ended.state.sides.player.score).toBe(2);
  });

  it("keeps the delayed controller when the activating source changes control", () => {
    const { state, ids } = setup({ back: [CAPTURE.caller.id, CAPTURE.watcher.id] }, { hand: [CAPTURE.seize.id] });
    const source = ids.player.back[0]!;
    const activated = engine.apply(state, "player", { kind: "activate", source, ability: 0 }, NO_PROMPTS);
    const raised = passUntil(engine, activated.state, (next) => next.stack.length === 0).state;
    const captured = cohort(raised);
    const priority = engine.apply(raised, "player", { kind: "pass" }, NO_PROMPTS).state;
    const stolen = play(priority, ids.enemy.hand[0], "enemy", new ScriptedSource([[source]])).state;
    expect(stolen.instances[source].controller).toBe("enemy");
    expect(stolen.floating.find((effect) => effect.change.kind === "trigger")?.controller).toBe("player");
    const ended = end(stolen);
    expect(abandoned(ended.events)).toEqual(captured);
    expect(ended.state.sides.player.score).toBe(4);
  });

  it("keeps an ordinary captured card's identity after it returns to play", () => {
    const { state, ids } = setup({ hand: [CAPTURE.ordinary.id, CAPTURE.bounce.id], void: [SYNTHETIC.vanilla0.id] });
    const member = ids.player.void[0];
    let current = play(state, ids.player.hand[0]).state;
    current = play(current, ids.player.hand[1], "player", new ScriptedSource([[member]])).state;
    expect(zone(current, member)).toBe("hand");
    current = play(current, member).state;
    expect(abandoned(end(current).events)).toEqual([member]);
  });

  it("abandons both captured figments after the delayed controller regains its stolen member", () => {
    const { state, ids } = setup({ hand: [CAPTURE.raise.id, CAPTURE.seize.id] }, { hand: [CAPTURE.seize.id] });
    const raised = play(state, ids.player.hand[0]).state;
    const captured = cohort(raised);
    expect(captured).toHaveLength(2);
    expect(captured.map((id) => raised.instances[id].controller)).toEqual(["player", "player"]);
    const delayed = raised.floating.find((effect) => effect.change.kind === "trigger")!;
    expect(delayed.controller).toBe("player");
    const priority = engine.apply(raised, "player", { kind: "pass" }, NO_PROMPTS).state;
    const stolen = play(priority, ids.enemy.hand[0], "enemy", new ScriptedSource([[captured[0]]])).state;
    expect(stolen.instances[captured[0]].controller).toBe("enemy");
    expect(stolen.floating.find((effect) => effect.id === delayed.id)).toEqual(delayed);
    const returnedPriority = engine.apply(stolen, "enemy", { kind: "pass" }, NO_PROMPTS).state;
    const restored = play(returnedPriority, ids.player.hand[1], "player", new ScriptedSource([[captured[0]]])).state;
    expect(captured.map((id) => restored.instances[id].controller)).toEqual(["player", "player"]);
    expect(restored.floating.find((effect) => effect.id === delayed.id)).toEqual(delayed);
    expect(cohort(restored)).toEqual(captured);
    const ended = end(restored);
    expect(abandoned(ended.events)).toEqual(captured);
    expect(captured.map((id) => zone(ended.state, id))).toEqual([null, null]);
  });

  it("abandons ordinary captured members in original order after reentry reverses their entry order", () => {
    const { state, ids } = setup({ hand: [CAPTURE.ordinary.id, CAPTURE.bounce.id], void: [SYNTHETIC.vanilla0.id, SYNTHETIC.vanilla1.id] });
    const captured = ids.player.void;
    const raised = play(state, ids.player.hand[0]).state;
    expect(cohort(raised)).toEqual(captured);
    expect(raised.instances[captured[0]].enteredZoneAt).toBeLessThan(raised.instances[captured[1]].enteredZoneAt);
    const returned = play(raised, ids.player.hand[1], "player", new ScriptedSource([[captured[0]]])).state;
    expect(zone(returned, captured[0])).toBe("hand");
    expect(zone(returned, captured[1])).toBe("play");
    const replayed = play(returned, captured[0]).state;
    expect(captured.map((id) => zone(replayed, id))).toEqual(["play", "play"]);
    expect(replayed.instances[captured[0]].enteredZoneAt).toBeGreaterThan(replayed.instances[captured[1]].enteredZoneAt);
    expect(cohort(replayed)).toEqual(captured);
    const ended = end(replayed);
    expect(abandoned(ended.events)).toEqual(captured);
    expect(captured.map((id) => zone(ended.state, id))).toEqual(["void", "void"]);
  });

  it("preserves public cohort views and legal actions through serialization and determinization", () => {
    const { state, ids } = setup({ hand: [CAPTURE.raise.id] });
    const raised = play(state, ids.player.hand[0]).state;
    const loaded = deserializeState(serializeState(raised));
    expect(stateHash(loaded)).toBe(stateHash(raised));
    const cards = (side: Side) => Object.values(raised.instances).flatMap((instance) =>
      instance.owner === side && instance.printing.kind === "card" ? [{ cardId: instance.printing.cardId, ...instance.variant }] : []);
    expect(determinizationDivergences(engine, loaded, { player: cards("player"), enemy: cards("enemy") }, battleSeed("capture-533"), 0)).toEqual([]);
    expect(stateHash(end(loaded).state)).toBe(stateHash(end(raised).state));
  });

  it("commits no partial abandons on failure, and reloads a suspended trigger to abandon its exact cohort once", () => {
    const { state, ids } = setup({ hand: [CAPTURE.chooseAfter.id], back: [SYNTHETIC.vanilla1.id, CAPTURE.watcher.id] });
    const raised = play(state, ids.player.hand[0]).state;
    const captured = cohort(raised);
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    let slice = sliceOf(raised);
    while (fold.pending(slice) === null) {
      const decision = engine.decision(slice.committed);
      if (decision === null) throw new Error("no decision before deferred prompt");
      slice = applied(fold.reduce(slice, { kind: "battleAction", side: decision.side, action: { kind: "pass" } }));
    }
    expect(slice.committed.turn.endingCleanup).toBe(true);
    expect(captured.map((id) => zone(slice.committed, id))).toEqual(["play", "play"]);
    const before = stateHash(slice.committed);
    expect(() => runStep(slice.committed, { kind: "resolveTrigger" }, { answer() { throw new Error("interrupted after abandon"); } }, engine.catalog)).toThrow("interrupted after abandon");
    expect(stateHash(slice.committed)).toBe(before);
    const serialized = JSON.stringify(slice);
    const savedData: unknown = JSON.parse(serialized);
    const loaded = parseJourneyBattleFoldState({
      mode: { kind: "journey" },
      init: {
        battleId: "battle-1", siteId: "site-1", nodeId: null, completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false,
        enemyDescriptor: { id: "opponent-1", name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] },
        avatarSummary: null, cardDefinitions: [],
      },
      engine: { init: { seed: "seed", scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: savedData },
    });
    if (loaded === null) throw new Error("saved captured trigger failed the public journey loader");
    const saved = loaded.engine.slice;
    expect(saved).toEqual(slice);
    const cold = createFoldAdapter(createEngine(engine.catalog), { checkEventPrefix: true });
    const pending = cold.pending(saved)!;
    expect(pending).toEqual(fold.pending(slice));
    const answer = { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.back[0]!] } as const;
    expect(cold.reduce(saved, { ...answer, side: "enemy" })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(cold.reduce(saved, { kind: "battleAction", side: "player", action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    const newer = { ...saved, attempt: saved.attempt + 1 };
    expect(cold.reduce(newer, answer)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    const result = cold.reduce(saved, answer);
    const won = applied(result);
    expect(JSON.stringify(saved)).toBe(serialized);
    expect(fold.reduce(slice, answer)).toEqual(result);
    for (const actor of [fold, cold]) expect(actor.reduce(won, answer)).toEqual({ kind: "bounced", reason: "noPendingPrompt" });
    expect(captured.map((id) => zone(won.committed, id))).toEqual([null, null]);
    const direct = end(raised, new ScriptedSource([[ids.player.back[0]!]]));
    expect(abandoned(direct.events)).toEqual(captured);
    expect(stateHash(won.committed)).toBe(stateHash(direct.state));
    expect(won.committed.sides.player.score).toBe(4);
  });

  it("rejects an empty reference list", () => expect(() => abandonCards([])).toThrow());
});
