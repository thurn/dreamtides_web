import { describe, expect, it } from "vitest";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";
import { parseBattleId, parseOpponentId, parseSiteId } from "../../../../types/identifiers";
import type { EngineCardDefinition } from "../../../catalog";
import { abandonCost, activated, all, characterYouControl, energy, enemyCharacter, event, self, staticAbility, supported, target } from "../../../dsl/builders";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { forcedAnswer, isLegalAnswer, legalAnswers, randomLegalAnswer } from "../../../prompts/answers";
import { promptView } from "../../../view/view";
import { promptFingerprint } from "../../../prompts/fingerprint";
import { narrowPrompt } from "../../../prompts/narrow";
import { isWellFormedPrompt } from "../../../prompts/structure";
import type { Answer, ChooseSlotPrompt, Prompt } from "../../../prompts/types";
import { instanceOrigin } from "../../../rules/activation";
import { resolveEffect } from "../../interpreter";
import { effectiveSpark } from "../../../rules/spark";
import { createInPlay, instanceOf, slotOf } from "../../../rules/zones";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { battleSeed, opponent, type Side, type Slot } from "../../../state/ids";
import { BASE_VARIANT } from "../../../dsl/types";
import { NO_PROMPTS } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { unannouncedChanges } from "../../../testing/announced-changes";
import { boardState, type BoardSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { placeFigment } from "../../../testing/board";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { gainControl } from "../gain-control";
import { move } from "../move";
import { returnToHand } from "../return-to-hand";
import { sparkModifier } from "../spark-modifier";

const mover: EngineCardDefinition = {
  ...v.vanilla1, id: syntheticId(0x6900), status: "authored",
  abilities: () => [staticAbility(sparkModifier(supported(), 2)), activated([energy(1)], move(self()), { speed: "fast" })],
};
const paid: EngineCardDefinition = {
  ...mover, id: syntheticId(0x6901),
  abilities: () => [activated([abandonCost()], move(self(), { to: "abandonedCost" }), { speed: "fast" })],
};
const transfer: EngineCardDefinition = {
  ...v.interruptEvent, id: syntheticId(0x6902), status: "authored",
  abilities: () => [event(gainControl(target(enemyCharacter())))],
};
const remove: EngineCardDefinition = {
  ...transfer, id: syntheticId(0x6903), abilities: () => [event(returnToHand(all(enemyCharacter())))],
};
const fill: EngineCardDefinition = {
  ...v.interruptEvent, id: syntheticId(0x6904), status: "authored",
  abilities: () => [], synthetic: { resolve(ctx, item) {
    createInPlay(ctx, { kind: "card", cardId: v.vanilla1.id }, opponent(item.controller), BASE_VARIANT, { rank: "back", index: 0 });
  } },
};
const offPlay: EngineCardDefinition = {
  ...v.event0, id: syntheticId(0x6905), status: "authored", abilities: () => [event(move(self()))],
};
const failing: EngineCardDefinition = {
  ...offPlay, id: syntheticId(0x6906), abilities: () => [],
  synthetic: { resolve(ctx, item) {
    resolveEffect(ctx, move(all(characterYouControl())), {
      source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)), ability: 0,
      controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
    });
    throw new Error("synthetic failure after movement");
  } },
};
const engine = createEngine(testCatalog([mover, paid, transfer, remove, fill, offPlay, failing]));
const deck = Array.from({ length: 6 }, () => v.vanilla1.id);
class Answers implements AnswerSource {
  readonly prompts: Prompt[] = [];
  constructor(private readonly pick: (prompt: Prompt) => Answer) {}
  answer(prompt: Prompt): Answer { this.prompts.push(prompt); return this.pick(prompt); }
}
const choose = (to: Slot) => new Answers((prompt) => {
  if (prompt.kind !== "chooseSlot") throw new Error("Expected a position choice");
  return prompt.slots.findIndex((slot) => slot.rank === to.rank && slot.index === to.index);
});
const applied = (outcome: IntentOutcome): BattleSlice => {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("Expected applied intent");
  return outcome.slice;
};
const setup = (side: Side, extra: NonNullable<BoardSetup["player"]> = {}): BoardSetup => ({
  active: side, phase: "night", [side]: { back: [mover.id, mover.id], energy: 3, deck, ...extra }, [opponent(side)]: { deck },
});
const activate = (start: ReturnType<typeof boardState>, side: Side, source: AnswerSource, ability = 1) => {
  const id = start.ids[side].back.find((id) => id !== null)!;
  const result = engine.apply(start.state, side, { kind: "activate", source: id, ability }, source);
  const rest = passUntil(engine, result.state, (state) => state.stack.length === 0, source);
  return { state: rest.state, events: [...result.events, ...rest.events], id };
};

describe("move", () => {
  it.each(["player", "enemy"] as const)("%s moves only the chosen physical source at Fast timing, including exhausted front movement, with status preserved", (side) => {
    const start = boardState(engine.catalog, setup(side));
    const id = start.ids[side].back[0]!;
    start.state.instances[id].status = { ...start.state.instances[id].status, exhausted: true, counters: 4, gainedSpark: 3, reclaimed: true };
    const before = structuredClone(start.state.instances[id]);
    const hash = stateHash(start.state);
    const source = choose({ rank: "front", index: 2 });
    const done = activate(start, side, source);
    expect(source.prompts).toHaveLength(1);
    expect(source.prompts[0]).toMatchObject({ kind: "chooseSlot", side, purpose: { role: "move", source: id, cardId: mover.id, ability: 1 }, cancellable: false });
    expect(done.state.instances[id]).toEqual(before);
    expect(slotOf(done.state, id)).toEqual({ rank: "front", index: 2 });
    expect(slotOf(done.state, start.ids[side].back[1]!)).toEqual({ rank: "back", index: 1 });
    expect(done.state.sides[side].currentEnergy).toBe(2);
    expect(done.events.filter((event) => event.kind === "repositioned")).toEqual([{ kind: "repositioned", instance: id, side, from: { rank: "back", index: 0 }, to: { rank: "front", index: 2 }, swappedWith: null }]);
    expect(stateHash(start.state)).toBe(hash);
    expect(invariantViolations(done.state, engine.catalog)).toEqual([]);
  });

  it("offers exactly empty positions, recalculates Support, and announces the position change", () => {
    const start = boardState(engine.catalog, setup("player", { back: [null, mover.id], front: [v.vanilla1.id, v.vanilla1.id, v.vanilla1.id] }));
    const ally = start.ids.player.front[0]!;
    expect(effectiveSpark(start.state, engine.catalog, ally)).toBe(3);
    const source = choose({ rank: "back", index: 4 });
    const done = activate(start, "player", source);
    const prompt = source.prompts[0];
    if (prompt?.kind !== "chooseSlot") throw new Error("Expected move choice");
    expect(new Set(prompt.slots.map((slot) => `${slot.rank}:${String(slot.index)}`))).toEqual(new Set([
      ...Array.from({ length: 10 }, (_, index) => ({ rank: "back", index })).filter((slot) => slot.index !== 1),
      ...Array.from({ length: 6 }, (_, index) => ({ rank: "front", index: index + 3 })),
    ].map((slot) => `${slot.rank}:${String(slot.index)}`)));
    expect(effectiveSpark(done.state, engine.catalog, ally)).toBe(1);
    expect(effectiveSpark(done.state, engine.catalog, start.ids.player.front[2]!)).toBe(1);
    expect(unannouncedChanges(done.events, start.state, done.state)).toEqual([]);
  });

  it("does nothing without an empty position or an in-play subject, while paying an activated cost", () => {
    const start = boardState(engine.catalog, setup("player", {
      back: [mover.id, ...Array.from({ length: 9 }, () => v.vanilla1.id)],
      front: Array.from({ length: 9 }, () => v.vanilla1.id),
    }));
    const done = activate(start, "player", NO_PROMPTS);
    expect(done.state.sides.player.backRank).toEqual(start.state.sides.player.backRank);
    expect(done.state.sides.player.frontRank).toEqual(start.state.sides.player.frontRank);
    expect(done.state.sides.player.currentEnergy).toBe(2);
    expect(done.events.some((event) => event.kind === "repositioned")).toBe(false);
    const eventStart = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [offPlay.id], deck }, enemy: { deck } });
    const played = engine.apply(eventStart.state, "player", { kind: "play", card: eventStart.ids.player.hand[0], from: "hand" }, NO_PROMPTS);
    expect(played.events.some((event) => event.kind === "repositioned")).toBe(false);
  });

  it("auto-answers a sole destination, and keeps numeric position answers legal, narrowed and fingerprinted", () => {
    const start = boardState(engine.catalog, setup("player", { back: [mover.id, ...Array.from({ length: 9 }, () => v.vanilla1.id)], front: [...Array.from({ length: 8 }, () => v.vanilla1.id), null] }));
    const done = activate(start, "player", NO_PROMPTS);
    expect(slotOf(done.state, done.id)).toEqual({ rank: "front", index: 8 });
    const prompt: ChooseSlotPrompt = { kind: "chooseSlot", side: "player", purpose: { source: done.id, cardId: mover.id, ability: 1, role: "move" }, cancellable: false, slots: [{ rank: "back", index: 3 }, { rank: "front", index: 2 }] };
    expect(isWellFormedPrompt(prompt)).toBe(true);
    expect([...legalAnswers(prompt)]).toEqual([0, 1]);
    for (const invalid of [-1, 2, 0.5, true, []]) expect(isLegalAnswer(prompt, invalid)).toBe(false);
    expect(isLegalAnswer(prompt, randomLegalAnswer(prompt, () => 0.99))).toBe(true);
    expect(forcedAnswer(prompt, { autoAnswerForcedPrompts: true })).toBeUndefined();
    const narrow = narrowPrompt(prompt, [1]);
    expect([...legalAnswers(narrow)]).toEqual([1]);
    const projected = promptView(narrow, "enemy", start.state);
    expect(isLegalAnswer(projected, 0)).toBe(false);
    expect(isLegalAnswer(projected, 1)).toBe(true);
    expect([...legalAnswers(projected)]).toEqual([1]);
    expect(forcedAnswer(narrow, { autoAnswerForcedPrompts: true })).toBe(1);
    expect(promptFingerprint(narrow)).not.toBe(promptFingerprint(prompt));
    expect(promptFingerprint({ ...prompt, slots: [...prompt.slots].reverse() })).not.toBe(promptFingerprint(prompt));
    expect(isWellFormedPrompt({ ...prompt, slots: [prompt.slots[0], prompt.slots[0]] })).toBe(false);
    for (const slot of [{ rank: "front", index: -1 }, { rank: "front", index: 0.5 }, { rank: "front", index: 9 }, { rank: "back", index: 10 }] as const) {
      expect(isWellFormedPrompt({ ...prompt, slots: [slot] })).toBe(false);
    }
    expect(isWellFormedPrompt({ ...prompt, slots: [{ rank: "back", index: 3 }, { index: 3, rank: "back" }] })).toBe(false);
    expect(isWellFormedPrompt({ ...prompt, allowed: [2] })).toBe(false);
  });

  it("replays a suspended resolution after serialization, rejects a bad position, and publishes a single movement", () => {
    const start = boardState(engine.catalog, setup("player"));
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const initial: BattleSlice = { committed: start.state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const slice = applied(fold.reduce(initial, { kind: "battleAction", side: "player", action: { kind: "activate", source: start.ids.player.back[0]!, ability: 1 } }));
    const pending = fold.pending(slice);
    if (pending?.prompt.kind !== "chooseSlot") throw new Error("Expected suspended movement");
    expect(slotOf(slice.committed, start.ids.player.back[0]!)).toEqual({ rank: "back", index: 0 });
    expect(slice.committed.sides.player.currentEnergy).toBe(2);
    const replay = structuredClone(slice);
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    const prompt = fresh.pending(replay)!.prompt;
    expect(promptFingerprint(prompt)).toBe(promptFingerprint(pending.prompt));
    expect(fresh.reduce(replay, { kind: "answer", side: "player", promptId: prompt.id, value: -1 }).kind).toBe("bounced");
    if (prompt.kind !== "chooseSlot") throw new Error("Expected reloaded position prompt");
    const destination: Slot = { rank: "back", index: 2 };
    const selected = prompt.slots.findIndex((slot) => slot.rank === destination.rank && slot.index === destination.index);
    expect(selected).toBeGreaterThanOrEqual(0);
    const result = fresh.reduce(replay, { kind: "answer", side: "player", promptId: prompt.id, value: selected });
    const done = applied(result);
    expect(done.inFlight).toBeNull();
    expect(slotOf(done.committed, start.ids.player.back[0]!)).toEqual(destination);
    if (result.kind !== "applied") throw new Error("Expected applied answer");
    expect(result.published.filter((event) => event.kind === "repositioned")).toHaveLength(1);
    expect(invariantViolations(done.committed, engine.catalog)).toEqual([]);
  });

  it("rolls back a resolution that fails after movement, without a partial position or publication", () => {
    const start = boardState(engine.catalog, { active: "player", phase: "day", player: { hand: [failing.id], back: [v.vanilla1.id], deck }, enemy: { deck } });
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const initial: BattleSlice = { committed: start.state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const opening = applied(fold.reduce(initial, { kind: "battleAction", side: "player", action: { kind: "play", card: start.ids.player.hand[0], from: "hand" } }));
    const pending = fold.pending(opening)!;
    const result = fold.reduce(opening, { kind: "answer", side: "player", promptId: pending.prompt.id, value: 0 });
    if (result.kind !== "applied" || result.error === null) throw new Error("Expected synthetic resolution error");
    expect(result.published).toEqual([]);
    expect(result.slice.committed).toEqual(opening.committed);
    expect(slotOf(result.slice.committed, start.ids.player.back[0]!)).toEqual({ rank: "back", index: 0 });
    expect(result.slice.inFlight).toBeNull();
  });

  it.each(["player", "enemy"] as const)("%s retains the abandoned character's original position across a response and serialization", (side) => {
    const board: BoardSetup = { active: side, phase: "day", [side]: { back: [v.vanilla1.id, paid.id], deck }, [opponent(side)]: { hand: [v.interruptEvent.id], energy: 1, deck } };
    const start = boardState(engine.catalog, board);
    const [sacrifice, source] = start.ids[side].back;
    const answer = new Answers((prompt) => { if (prompt.kind !== "chooseCards") throw new Error("Expected abandonment"); return [sacrifice!]; });
    const activated = engine.apply(start.state, side, { kind: "activate", source: source!, ability: 0 }, answer);
    expect(activated.state.stack).toHaveLength(1);
    expect(activated.state.stack[0]).toMatchObject({ choices: { abandonedPosition: { side, slot: { rank: "back", index: 0 } } } });
    expect(engine.view(activated.state, opponent(side)).stack[0]).toMatchObject({ choices: { abandonedPosition: { side, slot: { rank: "back", index: 0 } } } });
    expect(activated.state.instances[sacrifice!].zone).toBe("void");
    const copy = deserializeState(serializeState(activated.state));
    const responded = engine.apply(copy, opponent(side), { kind: "play", card: start.ids[opponent(side)].hand[0], from: "hand" }, NO_PROMPTS);
    const done = passUntil(engine, responded.state, (state) => state.stack.length === 0);
    expect(slotOf(done.state, source!)).toEqual({ rank: "back", index: 0 });
    expect(done.state.instances[source!]).toEqual(activated.state.instances[source!]);
    expect([...responded.events, ...done.events].filter((event) => event.kind === "repositioned")).toEqual([{ kind: "repositioned", instance: source, side, from: { rank: "back", index: 1 }, to: { rank: "back", index: 0 }, swappedWith: null }]);
  });

  it("accepts a serialized paid position at the public journey intake and rejects malformed position metadata", () => {
    const start = boardState(engine.catalog, { active: "player", phase: "day", player: { back: [v.vanilla1.id, paid.id], deck }, enemy: { hand: [v.interruptEvent.id], energy: 1, deck } });
    const activated = engine.apply(start.state, "player", { kind: "activate", source: start.ids.player.back[1]!, ability: 0 }, new Answers(() => [start.ids.player.back[0]!]));
    const record = {
      mode: { kind: "journey" },
      init: { battleId: parseBattleId("move-intake"), siteId: parseSiteId("move-site"), nodeId: null, completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false, avatarSummary: null, cardDefinitions: [],
        enemyDescriptor: { id: parseOpponentId("move-enemy"), name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] } },
      engine: { init: { seed: battleSeed("move-intake"), scoreToWin: 25, decks: { player: [], enemy: [] }, dreamwell: [] },
        slice: { committed: activated.state, inFlight: null, publishedEvents: 0, attempt: 0 } },
    };
    expect(parseJourneyBattleFoldState(record)?.engine.slice.committed.stack[0]).toMatchObject({ choices: { abandonedPosition: { side: "player", slot: { rank: "back", index: 0 } } } });
    for (const position of [null, { side: "other", slot: { rank: "back", index: 0 } }, { side: "player", slot: { rank: "front", index: 9 } }, { side: "player", slot: { rank: "back", index: 10 } }, { side: "player", slot: { rank: "back", index: -1 } }, { side: "player", slot: { rank: "back", index: 0.5 } }, { side: "player" }]) {
      const copy = structuredClone(record);
      const [item] = copy.engine.slice.committed.stack;
      if (item?.kind !== "ability") throw new Error("Expected activation");
      const malformed = { ...copy, engine: { ...copy.engine, slice: { ...copy.engine.slice, committed: { ...copy.engine.slice.committed, stack: [{ ...item, choices: { ...item.choices, abandonedPosition: position } }] } } } };
      expect(parseJourneyBattleFoldState(malformed)).toBeNull();
    }
  });

  it("uses a ceased created character's paid position, and permits self-abandonment without a move", () => {
    const start = boardState(engine.catalog, { active: "player", phase: "day", player: { back: [paid.id], deck }, enemy: { deck } });
    const figment = placeFigment(start.state, "player", { rank: "front", index: 4 }, { kind: "figmentCopy", cardId: v.vanilla1.id, spark: null });
    const done = activate(start, "player", new Answers(() => [figment]), 0);
    expect(done.state.instances[figment]).toBeUndefined();
    expect(slotOf(done.state, done.id)).toEqual({ rank: "front", index: 4 });
    const single = boardState(engine.catalog, { active: "player", phase: "day", player: { back: [paid.id], deck }, enemy: { deck } });
    const abandoned = activate(single, "player", NO_PROMPTS, 0);
    expect(abandoned.state.instances[abandoned.id].zone).toBe("void");
    expect(abandoned.events.some((event) => event.kind === "repositioned")).toBe(false);
  });

  it.each([fill, transfer, remove])("keeps the paid destination from swapping, transferring control or moving an absent source after response %s", (response) => {
    const start = boardState(engine.catalog, { active: "player", phase: "day", player: { back: [v.vanilla1.id, paid.id], deck }, enemy: { hand: [response.id], energy: 1, deck } });
    const [sacrifice, source] = start.ids.player.back;
    const activated = engine.apply(start.state, "player", { kind: "activate", source: source!, ability: 0 }, new Answers(() => [sacrifice!]));
    const answered = new Answers(() => [source!]);
    const responded = engine.apply(activated.state, "enemy", { kind: "play", card: start.ids.enemy.hand[0], from: "hand" }, answered);
    const done = passUntil(engine, responded.state, (state) => state.stack.length === 0);
    expect([...responded.events, ...done.events].filter((event) => event.kind === "repositioned")).toEqual([]);
    if (response === fill) {
      expect(slotOf(done.state, source!)).toEqual({ rank: "back", index: 1 });
      expect(done.state.sides.player.backRank[0]).not.toBe(source);
      expect(done.state.instances[source!].controller).toBe("player");
    } else if (response === transfer) {
      expect(done.state.instances[source!].controller).toBe("enemy");
      expect(slotOf(done.state, source!)).toEqual({ rank: "back", index: 0 });
      expect(done.state.sides.player.backRank[0]).toBeNull();
    } else expect(done.state.instances[source!].zone).toBe("hand");
    expect(invariantViolations(done.state, engine.catalog)).toEqual([]);
  });
});
