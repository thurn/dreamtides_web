/** Resolving top-card conditions read one hidden card without announcing that read. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../../catalog";
import { energy, event, staticAbility, topCardMatches, topOfDeck } from "../../../dsl/builders";
import { BASE_VARIANT, NO_DECK_MODS, type CardFilter, type PlayerRef } from "../../../dsl/types";
import { createEngine } from "../../../engine";
import { eventSeenBy } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import { instanceOrigin } from "../../../rules/activation";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import { opponent, SIDES, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState, cardIdOf } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { conditionHolds, resolveEffect } from "../../interpreter";
import { chooseOne } from "../choose-one";
import { costModifier } from "../cost-modifier";
import { draw } from "../draw";
import { erode } from "../erode";
import { foresee } from "../foresee";
import { gainPoints } from "../gain-points";
import { ifThen } from "../if-then";
import { materialize } from "../materialize";

const small: CardFilter = { cardType: "character", costAtMost: 2 };
const card = (index: number, abilities: EngineCardDefinition["abilities"]): EngineCardDefinition => ({
  ...v.event0, id: syntheticId(0x51400 + index), costs: [energy(0)], status: "authored", abilities,
});
const reading = (filter: CardFilter = small, player: PlayerRef = "you") => ifThen(topCardMatches(filter, player), gainPoints(1), gainPoints(2));
const composition = (player: PlayerRef = "you") => ifThen(topCardMatches(small, player), materialize(topOfDeck(1, small, player)),
  ifThen(topCardMatches({}, player), draw(1, player)));
const own = card(0, () => [event(reading())]);
const other = card(1, () => [event(reading(small, "opponent"))]);
const prism = card(2, () => [event(composition())]);
const opponentPrism = card(3, () => [event(composition("opponent"))]);
const response = { ...card(4, () => [event(erode(1, "opponent"))]), speed: "interrupt" as const };
const modal = card(5, () => [event(chooseOne(reading(), gainPoints(3)))]);
const fault: EngineCardDefinition = { ...card(6, () => []), synthetic: { resolve(ctx, item) {
  const instance = ctx.state.instances[item.instance];
  resolveEffect(ctx, reading(), { source: item.instance, origin: instanceOrigin(instance), ability: 0, controller: item.controller,
    x: null, optionalPaid: [], choices: { modes: [], targets: [] } });
  throw new Error("synthetic failure after top-card branch");
} } };
const look = card(7, () => [event(foresee(2))]);
const two: EngineCardDefinition = { ...v.vanilla2, id: syntheticId(0x51408), costs: [energy(2)], spark: 2, status: "vanilla", subtype: "Warrior" };
const three: EngineCardDefinition = { ...two, id: syntheticId(0x51409), costs: [energy(3)] };
const oneEvent = { ...card(10, () => []), costs: [energy(1)] };
const fast = { ...oneEvent, id: syntheticId(0x5140b), speed: "fast" as const };
const interrupt = { ...oneEvent, id: syntheticId(0x5140c), speed: "interrupt" as const };
const discount: EngineCardDefinition = { ...two, id: syntheticId(0x5140d), abilities: () => [staticAbility(costModifier("you", { cardType: "character" }, -2))] };
const cards = [own, other, prism, opponentPrism, response, modal, fault, look, two, three, oneEvent, fast, interrupt, discount];
const engine = createEngine(testCatalog(cards));
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const applied = (out: IntentOutcome) => {
  if (out.kind !== "applied" || out.error !== null) throw new Error("unexpected top-card fold outcome");
  return out;
};
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
function scene(side: Side, source = own, deck = [two.id, three.id], enemyDeck = [oneEvent.id, three.id]) {
  return boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [source.id], deck, energy: 10 },
    [opponent(side)]: { deck: enemyDeck, energy: 10 } });
}
function holds(b: ReturnType<typeof scene>, side: Side, filter: CardFilter = small, player: PlayerRef = "you") {
  return conditionHolds(b.state, engine.catalog, topCardMatches(filter, player), { controller: side, source: b.ids[side].hand[0], optionalPaid: [] });
}
function play(b: ReturnType<typeof scene>, side: Side) {
  return engine.apply(b.state, side, { kind: "play", card: b.ids[side].hand[0], from: "hand" }, NO_PROMPTS);
}
function lists(state: BattleState) {
  const owned = (side: Side) => Object.values(state.instances).flatMap(i => i.owner === side && i.printing.kind === "card"
    ? [{ cardId: i.printing.cardId, ...i.variant }] : []);
  return { player: owned("player"), enemy: owned("enemy") };
}

describe("top-of-deck condition", () => {
  it.each(SIDES)("%s reads only the current top and resolves relative player bindings", side => {
    for (const [deck, score] of [[[two.id, three.id], 1], [[three.id, two.id], 2], [[oneEvent.id, two.id], 2], [[], 2]] as const) {
      const b = scene(side, own, [...deck]);
      expect(play(b, side).state.sides[side].score).toBe(score);
    }
    const b = scene(side, other, [two.id], [oneEvent.id, two.id]);
    expect(play(b, side).state.sides[side].score).toBe(2);
    expect(play(scene(side, other, [oneEvent.id], [two.id]), side).state.sides[side].score).toBe(1);
  });

  it.each(SIDES)("%s composes materialization, exact top draw and empty-deck silence", side => {
    for (const player of ["you", "opponent"] as const) for (const top of [two.id, three.id, oneEvent.id, null]) {
      const holder = player === "you" ? side : opponent(side);
      const deck = top === null ? [] : [top, two.id];
      const b = scene(side, player === "you" ? prism : opponentPrism, holder === side ? deck : [oneEvent.id], holder === side ? [oneEvent.id] : deck);
      const out = play(b, side);
      expect(out.events.filter(e => e.kind === "fatigue")).toEqual([]);
      expect(out.state.sides[holder].fatigueCount).toBe(0);
      if (top === null) {
        expect(out.events.filter(e => e.kind === "materialized" || e.kind === "cardDrawn")).toEqual([]);
      } else if (top === two.id) {
        expect(out.state.sides[side].backRank).toContain(b.ids[holder].deck[0]);
        expect(out.events.filter(e => e.kind === "cardDrawn")).toEqual([]);
      } else {
        expect(out.state.sides[holder].hand).toEqual([b.ids[holder].deck[0]]);
        expect(out.events.filter(e => e.kind === "materialized")).toEqual([]);
      }
      expect(out.state.sides[holder].deck).toEqual(top === null ? [] : b.ids[holder].deck.slice(1));
      expect(invariantViolations(out.state, engine.catalog)).toEqual([]);
    }
  });

  it.each(SIDES)("%s filters inclusive copiable costs, effective spark, type, subtype and speed", side => {
    const b = scene(side);
    expect(holds(b, side, { cardType: "character", subtype: "Warrior", costAtLeast: 2, costAtMost: 2, sparkAtLeast: 2, sparkAtMost: 2 })).toBe(true);
    for (const filter of [{ costAtMost: 1 }, { costAtLeast: 3 }, { sparkAtMost: 1 }, { sparkAtLeast: 3 }, { subtype: "Mage" as const }, { cardType: "event" as const }, { fast: true as const }]) expect(holds(b, side, filter)).toBe(false);
    for (const printing of [fast, interrupt]) expect(holds(scene(side, own, [printing.id]), side, { fast: true, cardType: "event", costAtMost: 1 })).toBe(true);
    expect(holds(scene(side, own, [oneEvent.id]), side, { sparkAtLeast: 0 })).toBe(false);
    expect(holds(scene(side, own, []), side, {})).toBe(false);
  });

  it.each(SIDES)("%s reads deck-entry characteristics while player discounts leave the copiable cost intact", side => {
    const b = scene(side, own, [three.id]);
    b.state.instances[b.ids[side].deck[0]] = { ...b.state.instances[b.ids[side].deck[0]], variant: { ...BASE_VARIANT, amplified: true,
      deckMods: { ...NO_DECK_MODS, costReduction: 1, sparkBonus: 2, fast: true, typeChange: { cardType: "event", subtype: "" } } } };
    expect(holds(b, side, { cardType: "event", costAtMost: 2, costAtLeast: 2, fast: true })).toBe(true);
    expect(holds(b, side, small)).toBe(false);
    const boosted = scene(side, own, [three.id]);
    boosted.state.instances[boosted.ids[side].deck[0]] = { ...boosted.state.instances[boosted.ids[side].deck[0]], variant: { ...BASE_VARIANT,
      deckMods: { ...NO_DECK_MODS, costReduction: 1, sparkBonus: 2 } } };
    expect(holds(boosted, side, { ...small, sparkAtLeast: 4, sparkAtMost: 4 })).toBe(true);
    const character = scene(side, own, [oneEvent.id]);
    character.state.instances[character.ids[side].deck[0]] = { ...character.state.instances[character.ids[side].deck[0]], variant: { ...BASE_VARIANT,
      deckMods: { ...NO_DECK_MODS, typeChange: { cardType: "character", subtype: "Mage" } } } };
    expect(holds(character, side, { cardType: "character", subtype: "Mage", sparkAtMost: 0 })).toBe(true);
    const reduced = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [own.id, three.id], deck: [three.id], back: [discount.id], energy: 1 } });
    expect(engine.legalActions(reduced.state, side)).toContainEqual({ kind: "play", card: reduced.ids[side].hand[1], from: "hand" });
    expect(holds(reduced, side)).toBe(false);
  });

  it.each(SIDES)("%s reads the top after an actual opposing response and survives a stack-boundary reload", side => {
    const b = boardState(engine.catalog, { active: side, phase: "day", [side]: { hand: [own.id], deck: [three.id, two.id] },
      [opponent(side)]: { hand: [response.id], deck: [two.id] } });
    const started = play(b, side);
    expect(started.state.stack).toHaveLength(1);
    const respond = (state: BattleState) => engine.apply(state, opponent(side), { kind: "play", card: b.ids[opponent(side)].hand[0], from: "hand" }, NO_PROMPTS);
    const resolve = (state: BattleState) => passUntil(engine, respond(state).state, s => s.stack.length === 0);
    const direct = resolve(started.state);
    const loaded = resolve(deserializeState(serializeState(started.state)));
    expect(stateHash(loaded.state)).toBe(stateHash(direct.state));
    expect(loaded.events).toEqual(direct.events);
    expect(direct.state.sides[side].score).toBe(1);
    expect(direct.state.sides[side].void).toContain(b.ids[side].deck[0]);
  });

  it.each(SIDES)("%s checks without events, identities, knowledge or mutation and distinguishes physical duplicates", side => {
    const b = scene(side, own, [two.id, two.id]);
    const before = serializeState(b.state);
    const views = SIDES.map(viewer => engine.view(b.state, viewer));
    expect(holds(b, side)).toBe(true);
    expect(serializeState(b.state)).toBe(before);
    expect(b.events).toEqual([]);
    expect(b.ids[side].deck[0]).not.toBe(b.ids[side].deck[1]);
    for (const [index, viewer] of SIDES.entries()) {
      expect(engine.view(b.state, viewer)).toEqual(views[index]);
      expect(views[index].sides[side].deck).toEqual({ count: 2, known: [] });
      expect(JSON.stringify(views[index])).not.toContain(`"${b.ids[side].deck[0]}"`);
    }
    const out = play(scene(side, prism, [two.id, two.id]), side);
    expect(out.state.sides[side].deck).toHaveLength(1);
    expect(cardIdOf(out.state, out.state.sides[side].deck[0])).toBe(two.id);
  });

  it.each(SIDES)("%s keeps unknown top outcomes out of fair views and evaluates each determinization's own top", side => {
    const board = (deck: typeof two.id[]) => boardState(engine.catalog, { active: side, phase: "day",
      [side]: { hand: [prism.id], deck }, [opponent(side)]: { hand: [response.id], deck: [oneEvent.id, three.id] } });
    const a = board([two.id, three.id]);
    const b = board([three.id, two.id]);
    const started = play(a, side);
    const alternate = play(b, side);
    expect(started.state.stack).toHaveLength(1);
    for (const viewer of SIDES) {
      const seen = engine.view(started.state, viewer);
      expect(engine.view(alternate.state, viewer)).toEqual(seen);
      expect(engine.legalActions(a.state, side)).toEqual(engine.legalActions(b.state, side));
      for (const random of [0, 0.999]) {
        const sample = engine.determinize(copy(seen), lists(started.state), () => random);
        expect(engine.view(sample, viewer).sides[side].deck).toEqual(seen.sides[side].deck);
        const top = sample.sides[side].deck[0];
        const smallTop = cardIdOf(sample, top) === two.id;
        expect(conditionHolds(sample, engine.catalog, topCardMatches(small), { controller: side, source: a.ids[side].hand[0], optionalPaid: [] })).toBe(smallTop);
        if (sample.priority === null) throw new Error("sampled stack has no priority holder");
        const out = engine.apply(sample, sample.priority, { kind: "pass" }, NO_PROMPTS);
        expect(out.state.instances[top].zone).toBe(smallTop ? "play" : "hand");
      }
    }
  });

  it.each(SIDES)("%s retains an actually looked-at top in views and sampled states", side => {
    const b = scene(side, look);
    const answer = b.ids[side].deck.map(card => ({ card, to: "top" as const }));
    const out = engine.apply(b.state, side, { kind: "play", card: b.ids[side].hand[0], from: "hand" }, new ScriptedSource([answer]));
    const seen = engine.view(out.state, side);
    expect(seen.sides[side].deck.known[0].id).toBe(b.ids[side].deck[0]);
    const sampled = engine.determinize(copy(seen), lists(out.state), () => 0.999);
    expect(sampled.sides[side].deck[0]).toBe(b.ids[side].deck[0]);
    expect(conditionHolds(sampled, engine.catalog, topCardMatches(small), { controller: side, source: out.state.sides[side].void[0], optionalPaid: [] })).toBe(true);
    const hidden = out.events.filter(e => e.kind === "foresaw").map(e => eventSeenBy(e, opponent(side), out.state));
    expect(hidden).toHaveLength(1);
    for (const id of b.ids[side].deck) expect(JSON.stringify(hidden)).not.toContain(`"${id}"`);
  });

  it.each(SIDES)("%s rejects foreign, invalid and stale modal inputs and replays a cancelled or reloaded play", side => {
    const b = scene(side, modal);
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const intent = { kind: "battleAction" as const, side, action: { kind: "play" as const, card: b.ids[side].hand[0], from: "hand" as const } };
    const opened = applied(fold.reduce(slice(b.state), intent));
    const pending = fold.pending(opened.slice);
    if (pending === null) throw new Error("modal prompt missing");
    const answer = { kind: "answer" as const, side, promptId: pending.prompt.id, value: 0 };
    expect(fold.reduce(opened.slice, { ...answer, side: opponent(side) })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fold.reduce(opened.slice, { ...answer, value: 999 })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fold.reduce(opened.slice, { kind: "battleAction", side: opponent(side), action: { kind: "pass" } })).toEqual({ kind: "bounced", reason: "stepInFlight" });
    const reloaded = createFoldAdapter(engine, { checkEventPrefix: true });
    const direct = applied(fold.reduce(opened.slice, answer));
    const loaded = applied(reloaded.reduce(copy(opened.slice), answer));
    expect(stateHash(loaded.slice.committed)).toBe(stateHash(direct.slice.committed));
    expect(loaded.published).toEqual(direct.published);
    expect(direct.slice.committed.sides[side].score).toBe(1);
    const cancelled = applied(fold.reduce(opened.slice, { kind: "cancel", side, promptId: pending.prompt.id }));
    expect(stateHash(cancelled.slice.committed)).toBe(stateHash(b.state));
    const restarted = applied(fold.reduce(cancelled.slice, intent));
    expect(fold.reduce(restarted.slice, answer)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    const next = fold.pending(restarted.slice);
    if (next === null) throw new Error("restart prompt missing");
    expect(applied(fold.reduce(restarted.slice, { ...answer, promptId: next.prompt.id })).slice.committed.sides[side].score).toBe(1);
  });

  it.each(SIDES)("%s rolls back a failing resolution's branch while keeping its committed play", side => {
    const b = scene(side, fault);
    const fold = createFoldAdapter(engine);
    const out = fold.reduce(slice(b.state), { kind: "battleAction", side, action: { kind: "play", card: b.ids[side].hand[0], from: "hand" } });
    if (out.kind !== "applied") throw new Error("fault play bounced");
    expect(out.error?.message).toContain("synthetic failure after top-card branch");
    expect(out.slice.committed.sides[side].score).toBe(0);
    expect(out.slice.committed.stack).toHaveLength(1);
    expect(out.slice.committed.instances[b.ids[side].hand[0]].zone).toBe("stack");
    expect(out.slice.committed.sides[side].deck).toEqual(b.ids[side].deck);
    expect(out.published.filter(e => e.kind === "pointsScored" || e.kind === "resolved")).toEqual([]);
    expect(out.slice.inFlight).toBeNull();
    expect(stateHash(copy(out.slice.committed))).toBe(stateHash(out.slice.committed));
  });
});

// Hidden printing reads require a resolving effect, rather than a public continuous condition.
// @ts-expect-error A top-card condition is excluded from StaticCondition.
staticAbility(costModifier("you", {}, -1), { while: topCardMatches(small) });
