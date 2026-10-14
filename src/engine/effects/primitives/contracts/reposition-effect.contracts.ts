import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { activated, all, characterYouControl, energy, event, self, enemyCharacter, target } from "../../../dsl/builders";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { promptFingerprint } from "../../../prompts/fingerprint";
import type { Answer, Prompt } from "../../../prompts/types";
import { slotOf } from "../../../rules/zones";
import { stateHash } from "../../../state/hash";
import { BACK_RANK_SIZE, FRONT_RANK_SIZE, opponent, type Side, type Slot } from "../../../state/ids";
import { NO_PROMPTS } from "../../../steps/sources";
import type { AnswerSource } from "../../../steps/types";
import { unannouncedChanges } from "../../../testing/announced-changes";
import { boardState, placeFigment, type SideSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { resolveEffect } from "../../interpreter";
import { instanceOrigin } from "../../../rules/activation";
import { gainControl } from "../gain-control";
import { returnToHand } from "../return-to-hand";
import { move } from "../move";

const mover: EngineCardDefinition = {
  ...v.vanilla1, id: syntheticId(0x9710), status: "authored",
  abilities: () => [activated([energy(1)], move(self(), { to: "reposition" }), { speed: "fast" })],
};
const allMover: EngineCardDefinition = { ...mover, id: syntheticId(0x9711), abilities: () => [activated([energy(1)], move(all(characterYouControl()), { to: "reposition" }), { speed: "fast" })] };
const failing: EngineCardDefinition = {
  ...v.event0, id: syntheticId(0x9712), status: "authored", abilities: () => [event(move(all(characterYouControl()), { to: "reposition" }))],
  synthetic: { resolve(ctx, item) {
    resolveEffect(ctx, move(all(characterYouControl()), { to: "reposition" }), {
      source: item.instance, origin: instanceOrigin(ctx.state.instances[item.instance]), ability: 0,
      controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
    });
    throw new Error("synthetic failure after swap");
  } },
};
const transfer: EngineCardDefinition = { ...v.interruptEvent, id: syntheticId(0x9713), status: "authored", abilities: () => [event(gainControl(target(enemyCharacter())))] };
const remove: EngineCardDefinition = { ...transfer, id: syntheticId(0x9714), abilities: () => [event(returnToHand(all(enemyCharacter())))] };
const engine = createEngine(testCatalog([mover, allMover, failing, transfer, remove]));
const deck = [v.vanilla1.id, v.vanilla1.id, v.vanilla1.id];
class Answers implements AnswerSource {
  readonly prompts: Prompt[] = [];
  constructor(private readonly pick: (prompt: Prompt) => Answer) {}
  answer(prompt: Prompt): Answer { this.prompts.push(prompt); return this.pick(prompt); }
}
const choose = (to: Slot) => new Answers((prompt) => {
  if (prompt.kind !== "chooseSlot") throw new Error("Expected position choice");
  return prompt.slots.findIndex((slot) => slot.rank === to.rank && slot.index === to.index);
});
const capture = () => new Answers(() => 0);
const setup = (side: Side, extra: SideSetup = {}) => boardState(engine.catalog, {
  active: side, phase: "night", [side]: { back: [mover.id, v.vanilla2.id], front: [v.vanilla3.id], energy: 3, deck, ...extra }, [opponent(side)]: { deck },
});
function activate(start: ReturnType<typeof boardState>, side: Side, answers: AnswerSource) {
  const id = [...start.ids[side].back, ...start.ids[side].front].find((card) => {
    if (card === null) return false;
    const printing = start.state.instances[card].printing;
    return printing.kind === "card" && (printing.cardId === mover.id || printing.cardId === allMover.id);
  })!;
  const first = engine.apply(start.state, side, { kind: "activate", source: id, ability: 0 }, answers);
  const rest = passUntil(engine, first.state, (state) => state.stack.length === 0, answers);
  return { state: rest.state, events: [...first.events, ...rest.events], id };
}
function applied(outcome: IntentOutcome): BattleSlice {
  if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("Expected applied intent");
  return outcome.slice;
}
function slots(prompt: Prompt | undefined): Slot[] {
  if (prompt?.kind !== "chooseSlot") throw new Error("Expected position choice");
  return [...prompt.slots];
}

describe("reposition effect", () => {
  it.each(["player", "enemy"] as const)("%s swaps occupied positions at Fast Night timing while ordinary repositioning is unavailable", (side) => {
    const start = setup(side);
    const id = start.ids[side].back[0]!;
    const other = start.ids[side].front[0]!;
    start.state.instances[id].status.gainedSpark = 3;
    start.state.instances[other].status.counters = 4;
    const status = [structuredClone(start.state.instances[id]), structuredClone(start.state.instances[other])];
    const hash = stateHash(start.state);
    expect(engine.legalActions(start.state, side).some((action) => action.kind === "reposition")).toBe(false);
    const done = activate(start, side, choose({ rank: "front", index: 0 }));
    expect(slotOf(done.state, id)).toEqual({ rank: "front", index: 0 });
    expect(slotOf(done.state, other)).toEqual({ rank: "back", index: 0 });
    expect([done.state.instances[id], done.state.instances[other]]).toEqual(status);
    expect(done.state.sides[side].currentEnergy).toBe(2);
    expect(done.events.filter((event) => event.kind === "repositioned")).toEqual([{ kind: "repositioned", instance: id, side, from: { rank: "back", index: 0 }, to: { rank: "front", index: 0 }, swappedWith: other }]);
    expect(stateHash(start.state)).toBe(hash);
    expect(invariantViolations(done.state, engine.catalog)).toEqual([]);
    expect(unannouncedChanges(done.events, start.state, done.state)).toEqual([]);
  });

  it.each(["player", "enemy"] as const)("%s offers expected positions with both-half exhaustion restrictions, matching ordinary actions", (side) => {
    const start = setup(side);
    const id = start.ids[side].back[0]!;
    start.state.instances[id].status.exhausted = true;
    const answers = capture();
    activate(start, side, answers);
    const expected = Array.from({ length: BACK_RANK_SIZE - 1 }, (_, index): Slot => ({ rank: "back", index: index + 1 }));
    expect(slots(answers.prompts[0])).toEqual(expected);
    const ordinary = structuredClone(start.state);
    ordinary.turn.phase = side === ordinary.turn.active ? "day" : "dusk";
    expect(engine.legalActions(ordinary, side).filter((action) => action.kind === "reposition" && action.card === id).map((action) => action.kind === "reposition" ? action.to : null)).toEqual(expected);

    const front = setup(side, { back: [null, v.vanilla1.id], front: [mover.id] });
    front.state.instances[front.ids[side].back[1]!].status.exhausted = true;
    const frontAnswers = capture();
    activate(front, side, frontAnswers);
    const expectedFront: Slot[] = [
      ...Array.from({ length: BACK_RANK_SIZE }, (_, index): Slot => ({ rank: "back", index })).filter((slot) => slot.index !== 1),
      ...Array.from({ length: FRONT_RANK_SIZE - 1 }, (_, index): Slot => ({ rank: "front", index: index + 1 })),
    ];
    expect(slots(frontAnswers.prompts[0])).toEqual(expectedFront);
  });

  it("full boards allow swaps, while an exhausted front source blocked on both ranks makes no movement choice", () => {
    const full = setup("player", { back: [mover.id, ...Array.from({ length: BACK_RANK_SIZE - 1 }, () => v.vanilla1.id)], front: Array.from({ length: FRONT_RANK_SIZE }, () => v.vanilla1.id) });
    const answers = capture();
    activate(full, "player", answers);
    expect(slots(answers.prompts[0])).toHaveLength(BACK_RANK_SIZE + FRONT_RANK_SIZE - 1);
    const blocked = setup("player", { back: Array.from({ length: BACK_RANK_SIZE }, () => v.vanilla1.id), front: [mover.id, ...Array.from({ length: FRONT_RANK_SIZE - 1 }, () => v.vanilla1.id)] });
    for (const instance of Object.values(blocked.state.instances)) if (instance.zone === "play") instance.status.exhausted = true;
    // Activate the front source explicitly: its first back card is vanilla.
    const id = blocked.ids.player.front[0]!;
    const first = engine.apply(blocked.state, "player", { kind: "activate", source: id, ability: 0 }, NO_PROMPTS);
    const done = passUntil(engine, first.state, (state) => state.stack.length === 0, NO_PROMPTS);
    expect(done.state.sides.player.backRank).toEqual(blocked.state.sides.player.backRank);
    expect(done.state.sides.player.frontRank).toEqual(blocked.state.sides.player.frontRank);
    expect(done.state.sides.player.currentEnergy).toBe(2);
    expect([...first.events, ...done.events].some((event) => event.kind === "repositioned")).toBe(false);
  });

  it("merges compatible figments with equal exhaustion and excludes mixed exhaustion", () => {
    const start = setup("player", { back: [allMover.id], front: [] });
    const printing = { kind: "figmentCopy", cardId: v.vanilla1.id, spark: 1 } as const;
    const a = placeFigment(start.state, "player", { rank: "back", index: 1 }, printing);
    const b = placeFigment(start.state, "player", { rank: "back", index: 2 }, printing);
    // Move the source first into a distinct free position, then merge a into b.
    let index = 0;
    const answers = new Answers((prompt) => {
      const offered = slots(prompt);
      const step = index++;
      const to = { rank: "back", index: step === 0 ? 3 : step === 1 ? 2 : 4 };
      return offered.findIndex((slot) => slot.rank === to.rank && slot.index === to.index);
    });
    const done = activate(start, "player", answers);
    expect(done.state.instances[a]).toBeUndefined();
    expect(done.state.instances[b].status.gainedSpark).toBe(1);
    expect(done.events).toContainEqual({ kind: "figmentsMerged", side: "player", source: a, destination: b, spark: 1 });
    expect(invariantViolations(done.state, engine.catalog)).toEqual([]);

    start.state.instances[a].status.exhausted = true;
    const mismatch = capture();
    activate(start, "player", mismatch);
    expect(slots(mismatch.prompts[1])).not.toContainEqual({ rank: "back", index: 2 });
  });

  const mergeCases = [
    { label: "exhausted forward merge", fromRank: "back", toRank: "front", sourceExhausted: true, destinationExhausted: true, allowed: false },
    { label: "ready forward merge", fromRank: "back", toRank: "front", sourceExhausted: false, destinationExhausted: false, allowed: true },
    { label: "exhausted backward merge", fromRank: "front", toRank: "back", sourceExhausted: true, destinationExhausted: true, allowed: true },
    { label: "mixed exhaustion merge", fromRank: "front", toRank: "back", sourceExhausted: true, destinationExhausted: false, allowed: false },
  ] as const;
  it.each(mergeCases.flatMap((scenario) => (["player", "enemy"] as const).map((side) => ({ ...scenario, side }))))(
    "$side enforces $label through ordinary actions and a reloaded ability choice",
    ({ side, fromRank, toRank, sourceExhausted, destinationExhausted, allowed }) => {
      const start = boardState(engine.catalog, { active: side, phase: "day", [side]: { energy: 3, deck }, [opponent(side)]: { deck } });
      const from: Slot = { rank: fromRank, index: 0 };
      const to: Slot = { rank: toRank, index: 0 };
      const printing = { kind: "figmentCopy", cardId: mover.id, spark: 1 } as const;
      const source = placeFigment(start.state, side, from, printing);
      const destination = placeFigment(start.state, side, to, printing);
      start.state.instances[source].status.exhausted = sourceExhausted;
      start.state.instances[destination].status.exhausted = destinationExhausted;
      start.state.instances[source].status.gainedSpark = 2;
      start.state.instances[destination].status.gainedSpark = 4;
      const before = stateHash(start.state);
      const action = { kind: "reposition", card: source, to } as const;
      expect(engine.legalActions(start.state, side).some((legal) => legal.kind === "reposition" && legal.card === source && legal.to.rank === to.rank && legal.to.index === to.index)).toBe(allowed);
      const fold = createFoldAdapter(engine, { checkEventPrefix: true });
      const initial: BattleSlice = { committed: start.state, inFlight: null, publishedEvents: 0, attempt: 0 };
      const ordinary = fold.reduce(initial, { kind: "battleAction", side, action });
      if (allowed) {
        const merged = applied(ordinary);
        expect(merged.committed.instances[source]).toBeUndefined();
        expect(merged.committed.instances[destination].status.gainedSpark).toBe(7);
        if (ordinary.kind !== "applied") throw new Error("Expected applied merge");
        expect(ordinary.published).toContainEqual({ kind: "figmentsMerged", side, source, destination, spark: 3 });
      } else {
        expect(ordinary.kind).toBe("bounced");
        if (ordinary.kind !== "bounced") throw new Error("Expected illegal reposition bounce");
        expect(ordinary.reason).toBe("illegalAction");
      }
      expect(stateHash(start.state)).toBe(before);

      const suspended = applied(fold.reduce(initial, { kind: "battleAction", side, action: { kind: "activate", source, ability: 0 } }));
      const reload = JSON.parse(JSON.stringify(suspended)) as BattleSlice;
      const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
      const prompt = fresh.pending(reload)!.prompt;
      const offered = slots(prompt);
      expect(promptFingerprint(prompt)).toBe(promptFingerprint(fold.pending(suspended)!.prompt));
      expect(offered.some((slot) => slot.rank === to.rank && slot.index === to.index)).toBe(allowed);
      if (sourceExhausted) expect(offered.some((slot) => slot.rank === "front")).toBe(false);
      const picked: Slot = allowed ? to : { rank: "back", index: 2 };
      const value = offered.findIndex((slot) => slot.rank === picked.rank && slot.index === picked.index);
      expect(value).toBeGreaterThanOrEqual(0);
      const result = fresh.reduce(reload, { kind: "answer", side, promptId: prompt.id, value });
      const done = applied(result);
      expect(done.committed.sides[side].currentEnergy).toBe(2);
      expect(slotOf(done.committed, destination)).toEqual(to);
      expect(done.committed.instances[destination].status.exhausted).toBe(destinationExhausted);
      if (result.kind !== "applied") throw new Error("Expected applied position choice");
      if (allowed) {
        expect(done.committed.instances[source]).toBeUndefined();
        expect(done.committed.instances[destination].status.gainedSpark).toBe(7);
        expect(result.published).toContainEqual({ kind: "figmentsMerged", side, source, destination, spark: 3 });
      } else {
        expect(slotOf(done.committed, source)).toEqual(picked);
        expect(done.committed.instances[source].status.exhausted).toBe(sourceExhausted);
        expect(done.committed.instances[destination].status.gainedSpark).toBe(4);
        expect(result.published.some((entry) => entry.kind === "figmentsMerged")).toBe(false);
      }
      expect(invariantViolations(done.committed, engine.catalog)).toEqual([]);
    },
  );

  it("reloads an occupied destination choice; invalid, stale and postcommit cancel requests preserve payment and positions", () => {
    const start = setup("player");
    const id = start.ids.player.back[0]!;
    const other = start.ids.player.front[0]!;
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const initial: BattleSlice = { committed: start.state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const suspended = applied(fold.reduce(initial, { kind: "battleAction", side: "player", action: { kind: "activate", source: id, ability: 0 } }));
    const reload = JSON.parse(JSON.stringify(suspended)) as BattleSlice;
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    const prompt = fresh.pending(reload)!.prompt;
    expect(promptFingerprint(prompt)).toBe(promptFingerprint(fold.pending(suspended)!.prompt));
    expect(prompt.cancellable).toBe(false);
    const hash = stateHash(reload.committed);
    expect(fresh.reduce(reload, { kind: "answer", side: "player", promptId: prompt.id, value: -1 }).kind).toBe("bounced");
    expect(fresh.reduce(reload, { kind: "cancel", side: "player", promptId: prompt.id }).kind).toBe("bounced");
    expect(stateHash(reload.committed)).toBe(hash);
    const value = slots(prompt).findIndex((slot) => slot.rank === "front" && slot.index === 0);
    const result = fresh.reduce(reload, { kind: "answer", side: "player", promptId: prompt.id, value });
    const done = applied(result);
    expect(slotOf(done.committed, id)).toEqual({ rank: "front", index: 0 });
    expect(slotOf(done.committed, other)).toEqual({ rank: "back", index: 0 });
    expect(done.committed.sides.player.currentEnergy).toBe(2);
    expect(fresh.reduce(done, { kind: "answer", side: "player", promptId: prompt.id, value }).kind).toBe("bounced");
    if (result.kind !== "applied") throw new Error("Expected applied answer");
    expect(result.published.filter((event) => event.kind === "repositioned")).toHaveLength(1);
  });

  it.each([transfer, remove])("rebuilds candidates after an Interrupt changes the source, without moving an absent source (%s)", (response) => {
    const start = boardState(engine.catalog, { active: "player", phase: "night", player: { back: [mover.id], energy: 3, deck }, enemy: { back: [v.vanilla2.id], hand: [response.id], energy: 1, deck } });
    const id = start.ids.player.back[0]!;
    const first = engine.apply(start.state, "player", { kind: "activate", source: id, ability: 0 }, NO_PROMPTS);
    const answers = new Answers((prompt) => {
      if (prompt.kind === "chooseTargets") return [id];
      if (prompt.kind !== "chooseSlot") throw new Error("Unexpected response prompt");
      expect(prompt.side).toBe("player");
      expect(prompt.fieldSide).toBe("enemy");
      return prompt.slots.findIndex((slot) => slot.rank === "back" && slot.index === 0);
    });
    const second = engine.apply(first.state, "enemy", { kind: "play", card: start.ids.enemy.hand[0], from: "hand" }, answers);
    const done = passUntil(engine, second.state, (state) => state.stack.length === 0, answers);
    if (response === transfer) {
      expect(done.state.instances[id].controller).toBe("enemy");
      expect(slotOf(done.state, id)).toEqual({ rank: "back", index: 0 });
      expect(slotOf(done.state, start.ids.enemy.back[0]!)).toEqual({ rank: "back", index: 1 });
      expect(answers.prompts.some((prompt) => prompt.kind === "chooseSlot")).toBe(true);
    } else {
      expect(done.state.instances[id].zone).toBe("hand");
      expect(answers.prompts.some((prompt) => prompt.kind === "chooseSlot")).toBe(false);
      expect([...second.events, ...done.events].some((event) => event.kind === "repositioned")).toBe(false);
    }
    expect(done.state.sides.player.currentEnergy).toBe(2);
    expect(invariantViolations(done.state, engine.catalog)).toEqual([]);
  });

  it("rolls back every swap if the surrounding step fails after movement", () => {
    const start = setup("player", { back: [v.vanilla1.id], front: [v.vanilla2.id], hand: [failing.id] });
    start.state.turn.phase = "day";
    const before = stateHash(start.state);
    let choices = 0;
    const answers: AnswerSource = { answer(prompt, work) {
      const offered = slots(prompt);
      const first = choices++ === 0;
      if (!first) {
        expect(slotOf(work, start.ids.player.back[0]!)).toEqual({ rank: "front", index: 0 });
        expect(slotOf(work, start.ids.player.front[0]!)).toEqual({ rank: "back", index: 0 });
      }
      const to = first ? { rank: "front", index: 0 } : { rank: "back", index: 1 };
      return offered.findIndex((slot) => slot.rank === to.rank && slot.index === to.index);
    } };
    expect(() => engine.apply(start.state, "player", { kind: "play", card: start.ids.player.hand[0], from: "hand" }, answers)).toThrow("synthetic failure after swap");
    expect(choices).toBe(2);
    expect(stateHash(start.state)).toBe(before);

  });
});
