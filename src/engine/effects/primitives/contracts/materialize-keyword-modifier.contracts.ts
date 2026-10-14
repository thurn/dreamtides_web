/** Public entry, historical cohort, lifetime and privacy contracts; synthetic definitions only. */
import { describe, expect, it } from "vitest";
import { parseDreamsignId } from "../../../../types/identifiers";
import { parseEngineBattleFold } from "../../../../rules/battle/fold";
import { enginePrintedKeywords, engineStatuses } from "../../../../screens/cumulus_adapters/engine-battle-view-model";
import { withHistory } from "../../../debug/debug-actions";
import type { EngineCardDefinition } from "../../../catalog";
import { abandonCost, additionalCost, all, characterYouControl, energy, event, everyIn, randomIn, self, staticAbility } from "../../../dsl/builders";
import { triggered, whenAbandon, whenMaterialize } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { Answer, Prompt } from "../../../prompts/types";
import { hasKeyword } from "../../../rules/keywords";
import { SIDES, opponent, type CardId, type InstanceId, type Side } from "../../../state/ids";
import { stateHash, serializeState, deserializeState } from "../../../state/hash";
import { cloneState } from "../../../state/clone";
import type { BattleState, DeckEntry, Expiry } from "../../../state/types";
import { InlineSource } from "../../../steps/sources";
import { boardState, type SideSetup } from "../../../testing/board";
import { invariantViolations } from "../../../testing/invariants";
import { syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { ZONE_FIGMENT, ZONE_FIGMENTS } from "../../../testing/zone-cards";
import * as p from "../index";
import { H, v, deck } from "./turn-history.fixtures";

const sign = { id: parseDreamsignId("5e5e5e5e-0000-4000-8000-000000058400"), status: "authored" as const,
  abilities: () => [triggered(whenAbandon(), p.materializeKeywordModifier())] };
const make = (i: number, effect: Parameters<typeof event>[0]): EngineCardDefinition => ({ ...v.event0,
  id: syntheticId(0x58401 + i), costs: [energy(0)], status: "authored", abilities: () => [event(effect)] });
const enable = make(0, p.materializeKeywordModifier());
const sleep = make(1, p.exhaust(all(characterYouControl())));
const loss = make(2, p.loseAllAbilities(all(characterYouControl())));
const hand = make(3, p.materialize(everyIn("hand", { cardType: "character" })));
const fromDeck = make(4, p.materialize(randomIn("deck", 1, { cardType: "character" })));
const fromVoid = make(5, p.materialize(everyIn("void", { cardType: "character" })));
const created = make(6, p.sequence(p.createCard(v.vanilla0.id), p.materialize(everyIn("hand", { cardType: "character" }))));
const failure = make(7, p.sequence(p.materializeKeywordModifier(), p.gainAdditionalSpark(self(), 1)));
const loseThenRepeat = make(8, p.sequence(p.loseAllAbilities(all(characterYouControl())), p.rematerialize(all(characterYouControl()))));
const repeatThenLose = make(9, p.sequence(p.rematerialize(all(characterYouControl())), p.loseAllAbilities(all(characterYouControl()))));
const otherReturn = make(10, p.materialize(everyIn("void", { cardType: "character" }, { player: "opponent" })));
const conceal = make(11, p.shuffleInto([everyIn("hand", { cardType: "character" })]));
const gainFast: EngineCardDefinition = { ...H.gain, id: syntheticId(0x58432), speed: "fast" };
const killFast: EngineCardDefinition = { ...H.kill, id: syntheticId(0x58433), speed: "fast" };
const returnFast: EngineCardDefinition = { ...otherReturn, id: syntheticId(0x58434), speed: "fast" };
const payAbandon: EngineCardDefinition = { ...v.event0, id: syntheticId(0x58435), status: "authored",
  abilities: () => [additionalCost(abandonCost()), event(p.gainPoints(0))] };
const manyFigments = make(12, p.materializeFigments(ZONE_FIGMENT.warrior.id, 5));
const hideSource = make(13, p.shuffleInto([everyIn("void")]));
const otherDeck: EngineCardDefinition = { ...make(14, p.materialize(randomIn("deck", 1, { cardType: "character" }, { player: "opponent", costExactly: 0 }))), speed: "fast" };
const enableFast: EngineCardDefinition = { ...enable, id: syntheticId(0x70001), speed: "fast" };
const legacyGrant = make(0x70002, p.grant(all(characterYouControl()), "vengeful", "permanent"));
const staticReady: EngineCardDefinition = { ...v.vanilla0, id: syntheticId(0x58430), status: "authored",
  abilities: () => [staticAbility(p.grant(self(), "awakened"))] };
const watcher: EngineCardDefinition = { ...v.vanilla0, id: syntheticId(0x58431), status: "authored", abilities: () => [
  triggered(whenMaterialize(characterYouControl({ exhausted: true })), p.gainPoints(1)),
  triggered(whenMaterialize(characterYouControl({ exhausted: false })), p.gainPoints(10)),
] };
const engine = createEngine(testCatalog([...Object.values(H), enable, sleep, loss, hand, fromDeck, fromVoid, created, failure,
  loseThenRepeat, repeatThenLose, otherReturn, conceal, gainFast, killFast, returnFast, payAbandon, manyFigments, hideSource, otherDeck, enableFast, legacyGrant, staticReady, watcher], { dreamsigns: [sign] }, ZONE_FIGMENTS));
const chooser = (pick: (prompt: Prompt) => Answer = prompt => {
  if (prompt.kind === "chooseCards" || prompt.kind === "chooseTargets") return prompt.candidates.slice(0, prompt.min);
  if (prompt.kind === "confirm") return true;
  throw new Error(`Unexpected ${prompt.kind}`);
}) => new InlineSource({ player: pick, enemy: pick });
const setup = (side: Side, handCards: readonly CardId[], mine: SideSetup = {}, theirs: SideSetup = {}) => boardState(engine.catalog, {
  active: side, phase: "day", scoreToWin: 10000, [side]: { deck, energy: 50, hand: handCards, dreamsigns: [sign.id], ...mine },
  [opponent(side)]: { deck, energy: 50, ...theirs },
});

describe.each(SIDES)("materialization boundary repairs for %s", side => {
  const badges = (state: BattleState, viewer: Side) => engineStatuses(engine.view(state, viewer), viewer, enginePrintedKeywords(engine.catalog));
  const kinds = (state: BattleState, viewer: Side, id: InstanceId) => badges(state, viewer).cards.get(id)?.map(badge => badge.kind) ?? [];

  it("excludes a fresh opponent entry earlier in the same turn from the historical cohort", () => {
    const other = opponent(side), b = setup(side, [enableFast.id, v.fastCharacter.id], {}, { hand: [v.fastCharacter.id] });
    const turn = b.state.turn.turnNumber;
    let state = passUntil(engine, b.state, next => next.turn.active === side && next.turn.phase === "dusk").state;
    const earlier = play(state, other, b.ids[other].hand[0]);
    expect(earlier.events).toContainEqual(expect.objectContaining({ kind: "materialized", instance: b.ids[other].hand[0], side: other }));
    state = passUntil(engine, earlier.state, next => next.turn.active === side && next.turn.phase === "night").state;
    state = play(state, side, b.ids[side].hand[0]).state;
    expect(state.turn.turnNumber).toBe(turn);
    expect(keyword(state, b.ids[other].hand[0])).toBe(false);
    expect(state.instances[b.ids[other].hand[0]].status.exhausted).toBe(true);
    expect(kinds(state, side, b.ids[other].hand[0])).toEqual([]);
    const own = play(state, side, b.ids[side].hand[1]).state;
    expect(keyword(own, b.ids[side].hand[1])).toBe(true);
    expect(own.instances[b.ids[side].hand[1]].status.exhausted).toBe(false);
  });

  it("excludes a fresh opponent entry made under the active controller's window", () => {
    const other = opponent(side), b = setup(side, [enable.id], {}, { hand: [v.fastCharacter.id] });
    let state = play(b.state, side, b.ids[side].hand[0]).state;
    const turn = state.turn.turnNumber;
    state = passUntil(engine, state, next => next.turn.active === side && next.turn.phase === "dusk").state;
    const entered = play(state, other, b.ids[other].hand[0]);
    expect(entered.events).toContainEqual(expect.objectContaining({ kind: "materialized", instance: b.ids[other].hand[0], side: other }));
    expect(entered.state.turn.turnNumber).toBe(turn);
    expect(keyword(entered.state, b.ids[other].hand[0])).toBe(false);
    expect(entered.state.instances[b.ids[other].hand[0]].status.exhausted).toBe(true);
    expect(kinds(entered.state, side, b.ids[other].hand[0])).toEqual([]);
  });

  it("shows one physical and side badge across historical, later and repeated same-turn grants", () => {
    const b = setup(side, [v.vanilla0.id, enable.id, v.vanilla0.id, enable.id, v.vanilla0.id]);
    let state = play(b.state, side, b.ids[side].hand[0]).state;
    for (const index of [1, 2, 3, 4]) {
      state = play(state, side, b.ids[side].hand[index]).state;
      for (const viewer of SIDES) {
        const shown = badges(state, viewer);
        expect(shown.sides[side].map(badge => badge.kind)).toEqual(["duration"]);
        expect(shown.sides[opponent(side)]).toEqual([]);
        for (const id of b.ids[side].hand.filter(id => state.instances[id].zone === "play")) expect(kinds(state, viewer, id)).toEqual(["keyword"]);
      }
    }
  });

  it("preserves printed, static and legacy keyword indicators when own grants overlap", () => {
    const b = setup(side, [v.awakened2.id, staticReady.id, v.vanilla0.id, legacyGrant.id, enable.id, enable.id]);
    let state = b.state;
    for (const index of [0, 1, 2]) state = play(state, side, b.ids[side].hand[index]).state;
    for (const viewer of SIDES) {
      expect(kinds(state, viewer, b.ids[side].hand[0])).toEqual([]);
      expect(kinds(state, viewer, b.ids[side].hand[1])).toEqual(["keyword"]);
      expect(kinds(state, viewer, b.ids[side].hand[2])).toEqual([]);
    }
    state = play(state, side, b.ids[side].hand[3]).state;
    for (const viewer of SIDES) {
      expect(kinds(state, viewer, b.ids[side].hand[0])).toEqual(["keyword"]);
      expect(kinds(state, viewer, b.ids[side].hand[1])).toEqual(["keyword", "keyword"]);
      expect(kinds(state, viewer, b.ids[side].hand[2])).toEqual(["keyword"]);
    }
    for (const index of [4, 5]) {
      state = play(state, side, b.ids[side].hand[index]).state;
      for (const viewer of SIDES) for (const id of b.ids[side].hand.slice(0, 3)) expect(kinds(state, viewer, id)).toEqual(["keyword", "keyword"]);
    }
  });

  it("keeps concealed repeated members anonymous in the status builder", () => {
    const b = setup(side, [enable.id, v.vanilla0.id, enable.id, H.leave.id, conceal.id]);
    let state = b.state;
    for (const id of b.ids[side].hand) state = play(state, side, id).state;
    const hidden = b.ids[side].hand[1], viewer = opponent(side), view = engine.view(state, viewer);
    expect(JSON.stringify(view)).not.toContain(`"${hidden}"`);
    expect(badges(state, viewer).cards.has(hidden)).toBe(false);
    expect(badges(state, viewer).sides[side].map(badge => badge.kind)).toEqual(["duration"]);
  });

  it("restricts own window and member expiries in settled, pending and history-base saves", () => {
    const b = setup(side, [enable.id, v.vanilla0.id, payAbandon.id, legacyGrant.id], { back: [v.vanilla0.id] });
    let state = play(b.state, side, b.ids[side].hand[0]).state;
    state = play(state, side, b.ids[side].hand[1]).state;
    state = play(state, side, b.ids[side].hand[3]).state;
    const settled = slice(state), history = withHistory(settled), fold = createFoldAdapter(engine);
    const pending = applied(fold.reduce(history, { kind: "battleAction", side, action: { kind: "play", card: b.ids[side].hand[2], from: "hand" } }));
    expect(fold.pending(pending)?.prompt.cancellable).toBe(true);
    const lifetimes: readonly Expiry[] = [{ at: "never" }, { at: "turnStart", side }, { at: "sourceLeavesPlay", source: b.ids[side].hand[1] }, { at: "nextDay" }, { at: "paid", effect: state.floating[0].id }];
    for (const current of [settled, pending, history]) {
      expect(parseEngineBattleFold(saved(current))).not.toBeNull();
      const locations = current.history === undefined ? ["committed" as const] : ["committed", "base"] as const;
      for (const location of locations) for (const member of [false, true]) for (const expiry of lifetimes) {
        const bad = structuredClone(saved(current));
        const target = location === "committed" ? bad.slice.committed : bad.slice.history!.base.committed;
        const record = target.floating.find(e => e.change.kind === "materializeKeyword" && (e.change.instance !== null) === member)!;
        Object.assign(record, { expiry });
        expect(parseEngineBattleFold(bad)).toBeNull();
      }
      for (const expiry of lifetimes) {
        const old = structuredClone(saved(current));
        Object.assign(old.slice.committed.floating.find(e => e.change.kind === "keyword")!, { expiry });
        expect(parseEngineBattleFold(old)).not.toBeNull();
      }
    }
  });
});
function play(state: BattleState, side: Side, card: InstanceId, source = chooser()) {
  const first = engine.apply(state, side, { kind: "play", card, from: "hand" }, source);
  const last = passUntil(engine, first.state, next => next.stack.length === 0 && next.triggerQueue.length === 0, source);
  return { state: last.state, events: [...first.events, ...last.events] };
}
const keyword = (state: BattleState, id: InstanceId) => hasKeyword(state, engine.catalog, id, "awakened");
const applied = (out: IntentOutcome) => {
  if (out.kind !== "applied" || out.error !== null) throw new Error(`Unexpected ${JSON.stringify(out)}`);
  return out.slice;
};
const slice = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });
const saved = (s: BattleSlice) => ({ init: { seed: s.committed.seed, scoreToWin: 10000, decks: { player: [], enemy: [] }, dreamwell: [] }, slice: s });
const lists = (state: BattleState) => Object.fromEntries(SIDES.map(side => [side, Object.values(state.instances)
  .flatMap(instance => instance.owner === side && instance.printing.kind === "card" && !instance.status.created
    ? [{ cardId: instance.printing.cardId, amplified: instance.variant.amplified }] : [])])) as Record<Side, DeckEntry[]>;

describe.each(SIDES)("current-turn materialization keywords for %s", side => {
  it("real abandonment includes earlier successful entries without awakening, excludes old cohort, and precedes observers", () => {
    const b = setup(side, [v.vanilla0.id, H.abandon.id, v.vanilla0.id], { front: [watcher.id], back: [v.vanilla0.id, v.vanilla0.id] });
    const [sacrifice, baseline] = b.ids[side].back as InstanceId[];
    const earlier = play(b.state, side, b.ids[side].hand[0]);
    expect(earlier.state.instances[b.ids[side].hand[0]].status.exhausted).toBe(true);
    const abandoned = play(earlier.state, side, b.ids[side].hand[1], chooser(prompt => {
      if (prompt.kind !== "chooseCards") throw new Error("Expected abandon"); return [sacrifice];
    }));
    expect(abandoned.events.some(e => e.kind === "abandoned" && e.instance === sacrifice)).toBe(true);
    expect(keyword(abandoned.state, baseline)).toBe(false);
    expect(keyword(abandoned.state, b.ids[side].hand[0])).toBe(true);
    expect(abandoned.state.instances[b.ids[side].hand[0]].status.exhausted).toBe(true);
    const later = play(abandoned.state, side, b.ids[side].hand[2]);
    expect(keyword(later.state, b.ids[side].hand[2])).toBe(true);
    expect(later.state.instances[b.ids[side].hand[2]].status.exhausted).toBe(false);
    expect(later.state.sides[side].score).toBe(11);
    expect(invariantViolations(later.state, engine.catalog)).toEqual([]);
  });

  it.each([H.kill, H.leave, H.banish])("%s departure is not abandonment", departure => {
    const b = setup(side, [departure.id, v.vanilla0.id], { back: [v.vanilla0.id] });
    const gone = play(b.state, side, b.ids[side].hand[0]).state;
    const entered = play(gone, side, b.ids[side].hand[1]).state;
    expect(keyword(entered, b.ids[side].hand[1])).toBe(false);
    expect(entered.instances[b.ids[side].hand[1]].status.exhausted).toBe(true);
  });

  it.each([hand, fromDeck, fromVoid, created, H.figment, H.copy])("%s arrivals share pre-entry readiness and preserve printed keywords", route => {
    const b = setup(side, [enable.id, route.id, v.vanilla0.id], { back: [v.vengeful1.id], void: [v.awakened2.id], front: [watcher.id] });
    const enabled = play(b.state, side, b.ids[side].hand[0]).state;
    const result = play(enabled, side, b.ids[side].hand[1]);
    const entries = result.events.flatMap(e => e.kind === "materialized" ? [e.instance] : []);
    expect(entries.length).toBeGreaterThan(0);
    for (const id of entries) {
      expect(result.state.instances[id]).toMatchObject({ zone: "play", controller: side, status: { exhausted: false } });
      expect(keyword(result.state, id)).toBe(true);
    }
    expect(hasKeyword(result.state, engine.catalog, b.ids[side].back[0]!, "vengeful")).toBe(true);
    expect(keyword(result.state, b.ids[side].back[0]!)).toBe(false);
  });

  it("preserves intrinsic/static Awakened without any enabling window", () => {
    const b = setup(side, [v.awakened2.id, staticReady.id]);
    let state = b.state;
    for (const id of b.ids[side].hand) state = play(state, side, id).state;
    for (const id of b.ids[side].hand) expect(state.instances[id].status.exhausted).toBe(false);
  });

  it("rematerialization grants keyword while retaining actual exhaustion", () => {
    const b = setup(side, [sleep.id, enable.id, H.again.id], { back: [v.vanilla0.id] });
    let state = play(b.state, side, b.ids[side].hand[0]).state;
    state = play(state, side, b.ids[side].hand[1]).state;
    const result = play(state, side, b.ids[side].hand[2]);
    const id = b.ids[side].back[0]!;
    expect(keyword(result.state, id)).toBe(true);
    expect(result.state.instances[id].status.exhausted).toBe(true);
    expect(result.events.some(e => e.kind === "exhaustionChanged")).toBe(false);
  });

  it("loss ordering is observed through keywords, overlapping windows, and repeated physical arrivals", () => {
    const b = setup(side, [v.vanilla0.id, enable.id, loss.id, loseThenRepeat.id, repeatThenLose.id, enable.id, H.leave.id]);
    let state = play(b.state, side, b.ids[side].hand[0]).state;
    const id = b.ids[side].hand[0];
    state = play(state, side, b.ids[side].hand[1]).state; expect(keyword(state, id)).toBe(true);
    state = play(state, side, b.ids[side].hand[2]).state; expect(keyword(state, id)).toBe(false);
    state = play(state, side, b.ids[side].hand[3]).state; expect(keyword(state, id)).toBe(true);
    expect(state.instances[id].status.exhausted).toBe(true);
    state = play(state, side, b.ids[side].hand[4]).state; expect(keyword(state, id)).toBe(false);
    state = play(state, side, b.ids[side].hand[5]).state; expect(keyword(state, id)).toBe(true);
    state = play(state, side, b.ids[side].hand[6]).state;
    expect(keyword(state, id)).toBe(true);
    state = play(state, side, id).state;
    expect(keyword(state, id)).toBe(true); expect(state.instances[id].status.exhausted).toBe(false);
  });

  it("retains physical provenance through control, dissolution and opposite-controller re-entry", () => {
    const other = opponent(side);
    const b = setup(side, [enable.id, v.vanilla0.id], {}, { hand: [gainFast.id, killFast.id, returnFast.id] });
    let state = play(b.state, side, b.ids[side].hand[0]).state;
    state = play(state, side, b.ids[side].hand[1]).state;
    const turn = state.turn.turnNumber;
    state = passUntil(engine, state, next => next.turn.active === side && next.turn.phase === "dusk").state;
    state = play(state, other, b.ids[other].hand[0]).state;
    expect(state.instances[b.ids[side].hand[1]].controller).toBe(other);
    expect(keyword(state, b.ids[side].hand[1])).toBe(true);
    state = play(state, other, b.ids[other].hand[1]).state;
    expect(state.instances[b.ids[side].hand[1]].zone).toBe("void");
    state = play(state, other, b.ids[other].hand[2]).state;
    expect(state.turn.turnNumber).toBe(turn);
    expect(state.instances[b.ids[side].hand[1]]).toMatchObject({ owner: side, controller: other, zone: "play", status: { exhausted: false } });
  });

  it("concealed physical grants have anonymous coherent sampled bindings and no hidden ID publication", () => {
    const b = setup(side, [enable.id, v.vanilla0.id, H.again.id, H.leave.id, conceal.id], {}, { hand: [otherDeck.id] });
    let state = play(b.state, side, b.ids[side].hand[0]).state;
    state = play(state, side, b.ids[side].hand[1]).state;
    state = play(state, side, b.ids[side].hand[2]).state;
    state = play(state, side, b.ids[side].hand[3]).state;
    state = play(state, side, b.ids[side].hand[4]).state;
    const id = b.ids[side].hand[1]; const view = engine.view(state, opponent(side));
    expect(JSON.stringify(view)).not.toContain(`"${id}"`);
    const grants = view.floating.filter(e => e.change.kind === "materializeKeyword" && e.change.instance !== null);
    expect(grants).toHaveLength(2);
    const sampled = engine.determinize(view, lists(state), () => 0.37);
    const member = sampled.floating.find(e => e.change.kind === "materializeKeyword" && e.change.instance !== null)!.change;
    if (member.kind !== "materializeKeyword" || member.instance === null) throw new Error("Missing member");
    expect(keyword(sampled, member.instance)).toBe(true);
    expect(sampled.instances[member.instance].zone).toBe("deck");
    expect(engine.view(sampled, opponent(side))).toEqual(view);
    const dusk = passUntil(engine, sampled, next => next.turn.active === side && next.turn.phase === "dusk").state;
    const taken = play(dusk, opponent(side), b.ids[opponent(side)].hand[0]).state;
    expect(taken.instances[member.instance]).toMatchObject({ zone: "play", controller: opponent(side), status: { exhausted: false } });

    const broken = structuredClone(view); const record = broken.floating.find(e => e.change.kind === "materializeKeyword" && e.change.instance !== null)!;
    if (record.change.kind !== "materializeKeyword" || typeof record.change.instance !== "object" || record.change.instance === null) throw new Error("Missing anonymous member");
    Object.assign(record.change.instance, { member: -1 });
    expect(() => engine.determinize(broken, lists(state), () => 0.37)).toThrow();
  });

  it("save/clone/hash retain valid own fields, reject malformed fields, and expire before the next turn's entries", () => {
    const b = setup(side, [enable.id, v.vanilla0.id, v.vanilla0.id]);
    let state = play(b.state, side, b.ids[side].hand[0]).state;
    state = play(state, side, b.ids[side].hand[1]).state;
    const json = deserializeState(serializeState(state));
    expect(stateHash(json)).toBe(stateHash(state)); expect(stateHash(cloneState(state))).toBe(stateHash(state));
    expect(parseEngineBattleFold(saved(slice(json)))).not.toBeNull();
    for (const field of [{ keyword: "vengeful" }, { player: "invalid" }, { instance: "invalid" }]) {
      const bad = structuredClone(saved(slice(json))); Object.assign(bad.slice.committed.floating[0].change, field);
      expect(parseEngineBattleFold(bad)).toBeNull();
    }
    const turn = state.turn.turnNumber;
    state = passUntil(engine, state, next => next.turn.turnNumber > turn && next.turn.active === side && next.turn.phase === "day").state;
    expect(keyword(state, b.ids[side].hand[1])).toBe(false);
    expect(state.floating.some(e => e.change.kind === "materializeKeyword")).toBe(false);
    const next = play(state, side, b.ids[side].hand[2]).state;
    expect(next.instances[b.ids[side].hand[2]].status.exhausted).toBe(true);
  });

  it("cancel/retry/restored prompt answers reject stale, foreign and duplicate intents without granting early", () => {
    const b = setup(side, [payAbandon.id], { back: [v.vanilla0.id, v.vanilla1.id] });
    const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const held = applied(fold.reduce(slice(b.state), { kind: "battleAction", side, action: { kind: "play", card: b.ids[side].hand[0], from: "hand" } }));
    const prompt = fold.pending(held)!.prompt;
    expect(held.committed.floating).toEqual([]);
    const restored = parseEngineBattleFold(JSON.parse(JSON.stringify(saved(held))))!; expect(restored).not.toBeNull();
    const answer = { kind: "answer" as const, side, promptId: prompt.id, value: [b.ids[side].back[0]!] };
    expect(fold.reduce(restored.slice, { ...answer, side: opponent(side) })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    const cancelled = applied(fold.reduce(restored.slice, { kind: "cancel", side, promptId: prompt.id }));
    expect(cancelled.committed.floating).toEqual([]);
    const retry = applied(fold.reduce(cancelled, { kind: "battleAction", side, action: { kind: "play", card: b.ids[side].hand[0], from: "hand" } }));
    expect(fold.reduce(retry, answer)).toEqual({ kind: "bounced", reason: "stalePrompt" });
    const complete = applied(fold.reduce(restored.slice, answer));
    const replay = applied(createFoldAdapter(engine).reduce(JSON.parse(JSON.stringify(held)) as BattleSlice, answer));
    expect(stateHash(complete.committed)).toBe(stateHash(replay.committed));
    expect(complete.committed.floating.some(e => e.change.kind === "materializeKeyword")).toBe(true);
    expect(fold.reduce(complete, answer).kind).toBe("bounced");
  });

  it("partial capacity grants only actual entrants; full-capacity rejection changes nothing", () => {
    for (const route of [fromVoid, manyFigments]) {
      const b = setup(side, [enable.id, route.id], { back: Array.from({ length: 9 }, () => v.vanilla1.id), void: [v.vanilla0.id, v.vanilla0.id] });
      const state = play(b.state, side, b.ids[side].hand[0]).state;
      const result = play(state, side, b.ids[side].hand[1]);
      const entries = result.events.flatMap(e => e.kind === "materialized" ? [e.instance] : []);
      expect(entries).toHaveLength(1);
      expect(keyword(result.state, entries[0])).toBe(true);
      expect(result.state.instances[entries[0]].status.exhausted).toBe(false);
      for (const id of b.ids[side].void.filter(id => !entries.includes(id))) expect(keyword(result.state, id)).toBe(false);
    }
    const b = setup(side, [enable.id, v.vanilla0.id], { back: Array.from({ length: 10 }, () => v.vanilla1.id) });
    const state = play(b.state, side, b.ids[side].hand[0]).state; const hash = stateHash(state);
    expect(() => engine.apply(state, side, { kind: "play", card: b.ids[side].hand[1], from: "hand" }, chooser())).toThrow();
    expect(stateHash(state)).toBe(hash); expect(keyword(state, b.ids[side].hand[1])).toBe(false);
  });

  it("resolved source concealment or copied-source cessation retains later eligibility", () => {
    const b = setup(side, [enable.id, hideSource.id, v.vanilla0.id]);
    let state = play(b.state, side, b.ids[side].hand[0]).state;
    state = play(state, side, b.ids[side].hand[1]).state;
    const seen = engine.view(state, opponent(side));
    expect(seen.floating.find(e => e.change.kind === "materializeKeyword")!.source).toBeNull();
    expect(play(state, side, b.ids[side].hand[2]).state.instances[b.ids[side].hand[2]].status.exhausted).toBe(false);
    const c = setup(side, [enable.id, v.vanilla0.id], { front: [H.mirror.id] });
    const copied = play(c.state, side, c.ids[side].hand[0]).state;
    expect(copied.floating.some(e => e.change.kind === "materializeKeyword" && typeof e.source === "string" && copied.instances[e.source] === undefined)).toBe(true);
    const result = play(copied, side, c.ids[side].hand[1]);
    for (const e of result.events) if (e.kind === "materialized") expect(result.state.instances[e.instance].status.exhausted).toBe(false);
  });

  it("failed resolving steps roll back window and entry changes atomically", () => {
    const b = setup(side, [failure.id]); const fold = createFoldAdapter(engine, { checkEventPrefix: true });
    const result = fold.reduce(slice(b.state), { kind: "battleAction", side, action: { kind: "play", card: b.ids[side].hand[0], from: "hand" } });
    expect(result.kind).toBe("applied"); if (result.kind !== "applied") throw new Error("Unexpected bounce");
    expect(result.error).not.toBeNull(); expect(result.slice.committed.floating).toEqual([]);
    expect(result.published.some(e => e.kind === "effectStarted")).toBe(false);
  });
});
