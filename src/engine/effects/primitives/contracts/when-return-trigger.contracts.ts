/**
 * "When you return a character you control to hand" (`whenReturn`; rules §
 * Ability Types → When you return a character to hand; RD-hv-umm2.102-1)
 * and "reduce its cost by N●" (`changeCardCost`, the `cardCost` "reduce"
 * mode; rules § Costs, Requirements, and X → A card's own cost;
 * RD-hv-umm2.102-2), on synthetic cards: a character leaving play for a
 * hand, by any effect or cost, matched as it last was in play.
 */
import { describe, expect, it } from "vitest";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import type { EngineCardDefinition } from "../../../catalog";
import { activated, all, anyCharacter, characterYouControl, energy, event, everyIn, returnCost, self, target } from "../../../dsl/builders";
import { onMaterialized, triggered, triggeringCard, whenReturn } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { Answer, Prompt, PromptId } from "../../../prompts/types";
import type { Action } from "../../../rules/actions";
import { deserializeState, stateHash } from "../../../state/hash";
import type { AbilitySource, InstanceId, Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import type { AnswerSource } from "../../../steps/types";
import { boardState, placeFigment, type SideSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { eventRedactionViolations } from "../../../testing/redaction";
import { SYNTHETIC as v, syntheticId } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { ZONE_FIGMENT, zoneCatalog } from "../../../testing/zone-cards";
import { dissolve } from "../dissolve";
import { draw } from "../draw";
import { gainEnergy } from "../gain-energy";
import { gainAdditionalSpark } from "../gain-spark";
import { gainPoints } from "../gain-points";
import { changeCardCost } from "../modify-card-cost";
import { optional } from "../optional";
import { phasing } from "../phase";
import { returnFromVoid } from "../return-from-void";
import { returnToHand } from "../return-to-hand";
import { sequence } from "../sequence";
import { shuffleInto } from "../shuffle-into";

function card(index: number, cardType: "character" | "event", cost: number, abilities: EngineCardDefinition["abilities"]): EngineCardDefinition {
  return {
    id: syntheticId(0xa500 + index),
    cardType,
    costs: [energy(cost)],
    spark: cardType === "character" ? 2 : null,
    subtype: cardType === "character" ? "Outsider" : "",
    speed: "standard",
    status: "authored",
    abilities,
  };
}

const R = {
  /** "Phasing. When you return a character you control to hand, reduce its cost by 2●." */
  breach: card(0, "character", 2, () => [phasing(), triggered(whenReturn(), changeCardCost(triggeringCard(), { reduce: 2 }))]),
  /** "▸Materialized: Return a character you control to hand. When you return another character to your hand, reduce its cost by 1●." */
  ferryman: card(1, "character", 1, () => [
    triggered(onMaterialized(), returnToHand(target(characterYouControl()))),
    triggered(whenReturn(characterYouControl({ another: true }), { toYourHand: true }), changeCardCost(triggeringCard(), { reduce: 1 })),
  ]),
  /** "Return a character to hand." */
  recall: card(2, "event", 0, () => [event(returnToHand(target(anyCharacter())))]),
  /** "Return each character you control to hand." */
  recallAll: card(3, "event", 0, () => [event(returnToHand(all(characterYouControl())))]),
  /** "Return a character you control to hand, then shuffle your hand into your deck." */
  recallShuffle: card(4, "event", 0, () => [event(sequence(returnToHand(target(characterYouControl())), shuffleInto([everyIn("hand")])))]),
  /** "Return another character you control to hand: Gain 1⍟." */
  returner: card(5, "character", 3, () => [activated([returnCost({ another: true })], gainPoints(1), { speed: "fast" })]),
  /** "Dissolve a character." */
  dissolver: card(6, "event", 0, () => [event(dissolve(target(anyCharacter())))]),
  /** "Return each card in your void to your hand." */
  revive: card(7, "event", 0, () => [event(returnFromVoid(everyIn("void")))]),
  /** "When you return a character you control to hand, you may draw a card." */
  mayDraw: card(8, "character", 3, () => [triggered(whenReturn(), optional(draw(1)))]),
  /** "When you return a character you control to hand, gain 1●, then <a definition error>." */
  thrower: card(9, "character", 3, () => [triggered(whenReturn(), sequence(gainEnergy(1), gainAdditionalSpark(self(), 1)))]),
} as const;

const E = createEngine(zoneCatalog(Object.values(R)));
const filler = Array.from({ length: 6 }, () => v.vanilla1.id);

/** Answers each target or card prompt with its first candidate, or `pick`'s, and each confirm with `true`. */
class Answers implements AnswerSource {
  readonly prompts: Prompt[] = [];
  constructor(private readonly pick: (candidates: readonly InstanceId[]) => InstanceId = (candidates) => candidates[0]) {}
  answer(prompt: Prompt): Answer {
    this.prompts.push(prompt);
    if (prompt.kind === "confirm") return true;
    if (prompt.kind !== "chooseTargets" && prompt.kind !== "chooseCards") throw new Error(`unexpected ${prompt.kind} prompt`);
    return [this.pick(prompt.candidates.filter((id): id is InstanceId => id !== null))];
  }
}

function setup(player: SideSetup, enemy: SideSetup = {}, active: Side = "player") {
  return boardState(E.catalog, { active, phase: "day", player: { deck: filler, ...player }, enemy: { deck: filler, ...enemy } });
}
function act(state: BattleState, side: Side, action: Action, answers: AnswerSource = new Answers()) {
  const result = E.apply(state, side, action, answers);
  expect(invariantViolations(result.state, E.catalog)).toEqual([]);
  return result;
}
/** Plays `card` from hand for `side` and passes until the stack and the trigger queue are empty, with every event. */
function playResolved(state: BattleState, side: Side, card: InstanceId | null | undefined, answers: AnswerSource = new Answers()) {
  const played = act(state, side, { kind: "play", card: card!, from: "hand" }, answers);
  const rest = passUntil(E, played.state, (next) => next.stack.length === 0 && next.triggerQueue.length === 0, answers);
  expect(invariantViolations(rest.state, E.catalog)).toEqual([]);
  return { state: rest.state, events: [...played.events, ...rest.events] };
}
function queued(events: readonly EngineEvent[]): { source: AbilitySource | null; subject: InstanceId | null }[] {
  return events.flatMap((entry) => (entry.kind === "triggerQueued" ? [{ source: entry.source, subject: entry.subject }] : []));
}
const zone = (state: BattleState, id: InstanceId | null | undefined) => state.instances[id!]?.zone;
/** The energy `viewer` reads `card` as costing now, as legality reads it. */
const cost = (state: BattleState, id: InstanceId | null | undefined, viewer: Side = "player") => E.view(state, viewer).instances[id!]?.characteristics.cost;
const reductions = (state: BattleState) =>
  state.floating.flatMap(({ change, expiry }) => (change.kind === "cardCost" ? [{ instance: change.instance, mode: change.mode, amount: change.amount, expiry }] : []));

describe("whenReturn and reduce its cost", () => {
  it("reduces the cost of the character Phasing returns by 2●, permanently, for both sides to see", () => {
    const { state, ids } = setup({ hand: [R.breach.id], back: [v.vanilla3.id], energy: 2 });
    const [breach] = ids.player.hand;
    const [returned] = ids.player.back;
    const { state: after, events } = playResolved(state, "player", breach);
    expect(zone(after, returned)).toBe("hand");
    expect(queued(events).filter((entry) => entry.subject === returned)).toEqual([{ source: breach, subject: returned }]);
    expect(reductions(after)).toEqual([{ instance: returned, mode: "reduce", amount: 2, expiry: { at: "never" } }]);
    for (const viewer of ["player", "enemy"] as const) {
      expect(cost(after, returned, viewer)).toBe(1);
      expect(events.filter((entry) => entry.kind === "effectStarted").every((entry) => eventSeenBy(entry, viewer, after) !== null)).toBe(true);
    }
    expect(eventRedactionViolations(events, state, after)).toEqual([]);
    // It is played for the reduced 1●, and the change travels with it.
    const replayed = playResolved({ ...after, sides: { ...after.sides, player: { ...after.sides.player, currentEnergy: 1 } } }, "player", returned);
    expect(replayed.state.sides.player.currentEnergy).toBe(0);
    expect(zone(replayed.state, returned)).toBe("play");
    expect(reductions(replayed.state)).toHaveLength(1);
  });

  it("sees its own return and a return by the opponent's effect, but not the opponent's characters returned", () => {
    const { state, ids } = setup({ back: [R.breach.id, v.vanilla2.id] }, { hand: [R.recall.id, R.recall.id], back: [v.vanilla3.id] }, "enemy");
    const [breach, vanilla] = ids.player.back;
    const [enemyVanilla] = ids.enemy.back;
    const [first, second] = ids.enemy.hand;
    const own = playResolved(state, "enemy", first, new Answers((candidates) => candidates.find((id) => id === enemyVanilla)!));
    expect(zone(own.state, enemyVanilla)).toBe("hand");
    expect(queued(own.events)).toEqual([]);
    const theirs = playResolved(own.state, "enemy", second, new Answers((candidates) => candidates.find((id) => id === breach)!));
    expect(zone(theirs.state, breach)).toBe("hand");
    expect(queued(theirs.events)).toEqual([{ source: breach, subject: breach }]);
    expect(cost(theirs.state, breach)).toBe(0);
    expect(zone(theirs.state, vanilla)).toBe("play");
  });

  it("sees a character returned to pay a cost, and each of several characters returned at once while it is in play", () => {
    const paid = setup({ back: [R.breach.id, R.returner.id, v.vanilla3.id] });
    const [breach, returner, vanilla] = paid.ids.player.back;
    const activatedReturn = act(paid.state, "player", { kind: "activate", source: returner!, ability: 0 }, new Answers((candidates) => candidates.find((id) => id === vanilla)!));
    expect(queued(activatedReturn.events)).toEqual([{ source: breach, subject: vanilla }]);
    expect(cost(activatedReturn.state, vanilla)).toBe(1);

    const mass = setup({ hand: [R.recallAll.id], back: [v.vanilla2.id, R.breach.id, v.vanilla3.id] });
    const [low, massBreach, high] = mass.ids.player.back;
    const { state: after, events } = playResolved(mass.state, "player", mass.ids.player.hand[0]);
    // Characters leave in order; once its own card has left play, the ability no longer sees later returns.
    expect(queued(events)).toEqual([
      { source: massBreach, subject: low },
      { source: massBreach, subject: massBreach },
    ]);
    expect([cost(after, low), cost(after, massBreach), cost(after, high)]).toEqual([0, 0, 3]);
  });

  it("with another and to your hand, ignores its own return and cards that go to the opponent's hand, and stacks with other reductions", () => {
    const self = setup({ hand: [R.ferryman.id], energy: 1 });
    const [ferryman] = self.ids.player.hand;
    const returnedSelf = playResolved(self.state, "player", ferryman);
    expect(zone(returnedSelf.state, ferryman)).toBe("hand");
    expect(queued(returnedSelf.events).filter((entry) => entry.subject === ferryman && entry.source !== ferryman)).toEqual([]);
    expect(reductions(returnedSelf.state)).toEqual([]);

    const both = setup({ hand: [R.ferryman.id], back: [R.breach.id, v.vanilla3.id, v.vanilla1.id], energy: 1 });
    const [boardBreach, three] = both.ids.player.back;
    const stacked = playResolved(both.state, "player", both.ids.player.hand[0], new Answers((candidates) => candidates.find((id) => id === three)!));
    expect(queued(stacked.events).filter((entry) => entry.subject === three).map((entry) => entry.source)).toEqual([boardBreach, both.ids.player.hand[0]]);
    expect(cost(stacked.state, three)).toBe(0);
    expect(reductions(stacked.state).map((entry) => entry.amount)).toEqual([2, 1]);

    // A character the player controls but the opponent owns goes to the opponent's hand: Breach reduces it there, Ferryman ignores it.
    const borrowed = setup({ hand: [R.recall.id], back: [R.breach.id, R.ferryman.id] }, { back: [v.vanilla3.id] });
    const [stolenBreach, stolenFerryman] = borrowed.ids.player.back;
    const stolen = borrowed.ids.enemy.back[0]!;
    borrowed.state.sides.enemy.backRank[0] = null;
    borrowed.state.sides.player.backRank[2] = stolen;
    borrowed.state.instances[stolen] = { ...borrowed.state.instances[stolen], controller: "player" };
    const sent = playResolved(borrowed.state, "player", borrowed.ids.player.hand[0], new Answers((candidates) => candidates.find((id) => id === stolen)!));
    expect(borrowed.state.sides.enemy.hand).toEqual([]);
    expect(sent.state.sides.enemy.hand).toEqual([stolen]);
    expect(queued(sent.events)).toEqual([{ source: stolenBreach, subject: stolen }]);
    expect(queued(sent.events).some((entry) => entry.source === stolenFerryman)).toBe(false);
    expect(cost(sent.state, stolen, "enemy")).toBe(1);
  });

  it("does not see a dissolve, a return from the void, a figment ceasing to exist, or a reclaimed character banished", () => {
    const { state, ids } = setup(
      { hand: [R.dissolver.id, R.revive.id, R.recall.id, R.recall.id], back: [R.breach.id, v.vanilla2.id, v.vanilla3.id], void: [v.vanilla1.id], energy: 0 },
    );
    const [breach, dissolved, reclaimed] = ids.player.back;
    const [dissolver, revive, recallFigment, recallReclaimed] = ids.player.hand;
    const figment = placeFigment(state, "player", { rank: "back", index: 3 }, { kind: "figment", figment: ZONE_FIGMENT.warrior.id, spark: 1 });
    state.instances[reclaimed!] = { ...state.instances[reclaimed!], status: { ...state.instances[reclaimed!].status, reclaimed: true } };
    const pick = (id: InstanceId | null | undefined) => new Answers((candidates) => candidates.find((candidate) => candidate === id)!);
    const afterDissolve = playResolved(state, "player", dissolver, pick(dissolved));
    const afterRevive = playResolved(afterDissolve.state, "player", revive);
    expect(zone(afterRevive.state, ids.player.void[0])).toBe("hand");
    expect(zone(afterRevive.state, dissolved)).toBe("hand");
    const afterFigment = playResolved(afterRevive.state, "player", recallFigment, pick(figment));
    expect(afterFigment.state.instances[figment]).toBeUndefined();
    const afterReclaimed = playResolved(afterFigment.state, "player", recallReclaimed, pick(reclaimed));
    expect(zone(afterReclaimed.state, reclaimed)).toBe("banished");
    const events = [...afterDissolve.events, ...afterRevive.events, ...afterFigment.events, ...afterReclaimed.events];
    expect(queued(events).filter((entry) => entry.source === breach)).toEqual([]);
    expect(reductions(afterReclaimed.state)).toEqual([]);
  });

  it("reduces the returned card's cost wherever it is as the ability resolves, naming a hidden card to no one", () => {
    const { state, ids } = setup({ hand: [R.recallShuffle.id], back: [R.breach.id, v.vanilla3.id] });
    const [breach, returned] = ids.player.back;
    const { state: after, events } = playResolved(state, "player", ids.player.hand[0], new Answers((candidates) => candidates.find((id) => id === returned)!));
    expect(zone(after, returned)).toBe("deck");
    expect(queued(events)).toEqual([{ source: breach, subject: returned }]);
    expect(reductions(after)).toEqual([{ instance: returned, mode: "reduce", amount: 2, expiry: { at: "never" } }]);
    expect(eventRedactionViolations(events, state, after)).toEqual([]);
    for (const viewer of ["player", "enemy"] as const) expect(E.view(after, viewer).floating).toEqual([]);
  });
});

function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error(`expected an applied intent, got ${JSON.stringify(outcome)}`);
  return outcome.slice;
}
const sliceOf = (state: BattleState): BattleSlice => ({ committed: state, inFlight: null, publishedEvents: 0, attempt: 0 });

/** A saved journey battle around `slice`, as a save file holds it. */
function savedJourney(slice: BattleSlice): Record<string, unknown> {
  return {
    mode: { kind: "journey" },
    init: {
      battleId: "battle-1",
      siteId: "site-1",
      nodeId: null,
      completionLevelAtStart: 0,
      essenceReward: 0,
      opponentAbilityActive: false,
      enemyDescriptor: { id: "opponent-1", name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] },
      avatarSummary: null,
      cardDefinitions: [],
    },
    engine: { init: { seed: "seed", scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: JSON.parse(JSON.stringify(slice)) as unknown },
  };
}

describe("whenReturn recovery", () => {
  it("keeps the queued trigger and its target prompt through a reload, rejects stale answers, and resolves as inline play does", () => {
    const { state, ids } = setup({ hand: [R.ferryman.id], back: [R.mayDraw.id, v.vanilla3.id], energy: 1 });
    const [ferryman] = ids.player.hand;
    const [mayDraw, vanilla] = ids.player.back;
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    // The opponent has no response, so the play resolves at once and its ▸Materialized ability asks for a target.
    const passed = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: { kind: "play", card: ferryman, from: "hand" } }));
    const targetPrompt = fold.pending(passed)!;
    expect(targetPrompt.prompt).toMatchObject({ kind: "chooseTargets", side: "player" });
    const saved = JSON.parse(JSON.stringify(passed)) as BattleSlice;
    const reloaded: BattleSlice = { ...saved, committed: deserializeState(JSON.stringify(passed.committed)) };
    const fresh = createFoldAdapter(E, { checkEventPrefix: true });
    expect(fresh.pending(reloaded)!.prompt.id).toBe(targetPrompt.prompt.id);
    const answer = (slice: BattleSlice, side: Side, promptId: PromptId, value: Answer) => fresh.reduce(slice, { kind: "answer", side, promptId, value });
    expect(answer(reloaded, "enemy", targetPrompt.prompt.id, [vanilla!])).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(answer(reloaded, "player", targetPrompt.prompt.id, [ids.enemy.deck[0]])).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    const chosen = applied(answer(reloaded, "player", targetPrompt.prompt.id, [vanilla!]));
    // Both return triggers wait; the "you may" one asks after a second reload.
    const mayPrompt = fresh.pending(chosen)!;
    expect(mayPrompt.prompt).toMatchObject({ side: "player", purpose: { role: "youMay", source: mayDraw } });
    expect(mayPrompt.display.triggerQueue.map((entry) => entry.source)).toEqual([ferryman]);
    const again: BattleSlice = { ...(JSON.parse(JSON.stringify(chosen)) as BattleSlice), committed: deserializeState(JSON.stringify(chosen.committed)) };
    const done = applied(createFoldAdapter(E, { checkEventPrefix: true }).reduce(again, { kind: "answer", side: "player", promptId: mayPrompt.prompt.id, value: true }));

    const inline = playResolved(state, "player", ferryman, new Answers((candidates) => candidates.find((id) => id === vanilla)!));
    expect(stateHash(done.committed)).toBe(stateHash(inline.state));
    expect(cost(done.committed, vanilla)).toBe(2);
    expect(reductions(done.committed)).toEqual([{ instance: vanilla, mode: "reduce", amount: 1, expiry: { at: "never" } }]);
  });

  it("saves and loads a battle holding a reduction, and rejects a malformed one", () => {
    const { state, ids } = setup({ hand: [R.breach.id], back: [v.vanilla3.id], energy: 2 });
    const after = playResolved(state, "player", ids.player.hand[0]).state;
    const returned = ids.player.back[0];
    const reloaded = deserializeState(JSON.stringify(after));
    expect(stateHash(reloaded)).toBe(stateHash(after));
    expect(cost(reloaded, returned)).toBe(1);
    expect(E.legalActions(reloaded, "player")).toEqual(E.legalActions(after, "player"));
    expect(parseJourneyBattleFoldState(savedJourney(sliceOf(after)))).not.toBeNull();
    const index = after.floating.findIndex((effect) => effect.change.kind === "cardCost");
    const malformed = (change: Record<string, unknown>) =>
      parseJourneyBattleFoldState(savedJourney(sliceOf({ ...after, floating: after.floating.map((effect, at) => (at === index ? { ...effect, change: { ...effect.change, ...change } } : effect)) })));
    expect(malformed({ amount: -2 })).toBeNull();
    expect(malformed({ amount: 0.5 })).toBeNull();
    expect(malformed({ mode: "lower" })).toBeNull();
    expect(malformed({ amount: 0 })).not.toBeNull();
  });

  it("keeps the return committed and its later trigger queued when an earlier trigger fails as it resolves", () => {
    const { state, ids } = setup({ hand: [R.recall.id], back: [R.thrower.id, R.breach.id, v.vanilla3.id] });
    const [thrower, breach, vanilla] = ids.player.back;
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const opened = applied(fold.reduce(sliceOf(state), { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } }));
    const prompt = fold.pending(opened)!;
    const outcome = fold.reduce(opened, { kind: "answer", side: "player", promptId: prompt.prompt.id, value: [vanilla!] });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected the definition error");
    const committed = outcome.slice.committed;
    expect(zone(committed, vanilla)).toBe("hand");
    expect(committed.triggerQueue.map((entry) => entry.source)).toEqual([thrower, breach]);
    expect(reductions(committed)).toEqual([]);
    expect(cost(committed, vanilla)).toBe(3);
  });
});
