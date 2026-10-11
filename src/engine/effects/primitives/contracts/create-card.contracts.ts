/**
 * `createCard` (rules § Created Cards; C1): "create 'Contemplation' in your
 * hand" adds new created cards of a named catalog card to a hand, privately
 * to the side holding them, and each ceases to exist when it leaves. With
 * `notSubtype`, "If it was a survivor, create two instead" is two dissolve
 * triggers of which exactly one matches the character as it last was in play
 * (RD-hv-umm2.65-1, RD-hv-umm2.108-1).
 */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition, EngineFigmentDefinition } from "../../../catalog";
import { all, anyCharacter, characterYouControl, energy, event, target } from "../../../dsl/builders";
import { matchingCharacters } from "../../../dsl/selectors";
import { triggered, whenDissolved } from "../../../dsl/triggers";
import { createEngine } from "../../../engine";
import { eventSeenBy, type EngineEvent } from "../../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../../fold/slice";
import type { Answer } from "../../../prompts/types";
import { deserializeState, stateHash } from "../../../state/hash";
import { parseFigmentId, type InstanceId, type Side } from "../../../state/ids";
import type { BattleState } from "../../../state/types";
import { NO_PROMPTS, ScriptedSource } from "../../../steps/sources";
import { boardState, placeFigment, type BoardSetup } from "../../../testing/board";
import { CONTINUOUS, CONTINUOUS_CARDS } from "../../../testing/continuous-cards";
import { invariantViolations } from "../../../testing/invariants";
import { eventRedactionViolations } from "../../../testing/redaction";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../../testing/synthetic-cards";
import { resolveEffect } from "../../interpreter";
import { instanceOrigin } from "../../../rules/activation";
import { instanceOf } from "../../../rules/zones";
import { createCard } from "../create-card";
import { discard } from "../discard";
import { dissolve } from "../dissolve";
import { draw } from "../draw";

/** The created card: a 1● event, "Draw a card." */
const thought: EngineCardDefinition = { ...v.event1, id: syntheticId(7300), status: "authored", abilities: () => [event(draw(1))] };
const THOUGHT = thought.id;
/** A card no catalog here holds. */
const MISSING = syntheticId(7399);

function character(index: number, subtype: EngineCardDefinition["subtype"], abilities: EngineCardDefinition["abilities"] = () => []): EngineCardDefinition {
  return { ...v.vanilla1, id: syntheticId(7300 + index), costs: [energy(2)], spark: 2, subtype, status: "authored", abilities };
}
function spell(index: number, effect: Parameters<typeof event>[0], speed: EngineCardDefinition["speed"] = "standard"): EngineCardDefinition {
  return { ...v.event0, id: syntheticId(7300 + index), speed, status: "authored", abilities: () => [event(effect)] };
}

/** The Seer shape: a Survivor whose amplified variant creates two when the dissolved character was a survivor. */
const seer = character(1, "Survivor", (variant) =>
  variant.amplified
    ? [
        triggered(whenDissolved(characterYouControl({ subtype: "Survivor" }), { figment: false }), createCard(THOUGHT, 2)),
        triggered(whenDissolved(characterYouControl({ notSubtype: "Survivor" }), { figment: false }), createCard(THOUGHT, 1)),
      ]
    : [triggered(whenDissolved(characterYouControl(), { figment: false }), createCard(THOUGHT, 1))]);
const survivor = character(2, "Survivor");
const warrior = character(3, "Warrior");
const S = {
  createTwo: spell(10, createCard(THOUGHT, 2)),
  createForOpponent: spell(11, createCard(THOUGHT, 1, "opponent")),
  createMissing: spell(12, createCard(MISSING, 1)),
  dissolveOne: spell(13, dissolve(target(anyCharacter()))),
  sweep: spell(14, dissolve(all(anyCharacter()))),
  discardOne: spell(15, discard(1)),
  quickDissolve: spell(16, dissolve(target(anyCharacter())), "interrupt"),
  /** Creates a card in its controller's hand, then fails in the same step. */
  createsThenFails: {
    ...v.event0, id: syntheticId(7317), status: "authored", abilities: () => [],
    synthetic: {
      resolve(ctx, item) {
        resolveEffect(ctx, createCard(THOUGHT, 1), {
          source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)),
          ability: 0, controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
        });
        throw new Error("synthetic failure after a card was created");
      },
    },
  } satisfies EngineCardDefinition,
} as const;
/** A 1✦ Survivor figment. */
const SURVIVOR_FIGMENT: EngineFigmentDefinition = { id: parseFigmentId(syntheticId(7320)), subtype: "Survivor", spark: 1, status: "authored", abilities: () => [] };

const E = createEngine(testCatalog([thought, seer, survivor, warrior, ...CONTINUOUS_CARDS, ...Object.values(S)], {}, [SURVIVOR_FIGMENT]));
const deck = Array.from({ length: 6 }, () => v.vanilla3.id);

function setup(board: Omit<BoardSetup, "phase" | "active"> & Partial<Pick<BoardSetup, "active">>) {
  return boardState(E.catalog, { active: "player", phase: "day", ...board });
}
function amplify(state: BattleState, id: InstanceId | null | undefined): void {
  if (id === null || id === undefined) throw new Error("no card");
  state.instances[id] = { ...state.instances[id], variant: { amplified: true } };
}
function cast(state: BattleState, side: Side, card: InstanceId | undefined, answers: readonly Answer[] = []) {
  if (card === undefined) throw new Error("no card");
  const source = new ScriptedSource(answers);
  const result = E.apply(state, side, { kind: "play", card, from: "hand" }, answers.length === 0 ? NO_PROMPTS : source);
  if (answers.length > 0) source.assertExhausted();
  expect(invariantViolations(result.state, E.catalog)).toEqual([]);
  return result;
}
function created(events: readonly EngineEvent[]): { instance: InstanceId; side: Side }[] {
  return events.flatMap((entry) => (entry.kind === "cardCreated" ? [{ instance: entry.instance, side: entry.side }] : []));
}
function queued(events: readonly EngineEvent[]) {
  return events.flatMap((entry) => (entry.kind === "triggerQueued" ? [entry.source] : []));
}
function applied(outcome: IntentOutcome) {
  if (outcome.kind !== "applied") throw new Error(`bounced: ${outcome.reason}`);
  return outcome;
}
const start = (committed: BattleState): BattleSlice => ({ committed, inFlight: null, publishedEvents: 0, attempt: 0 });

describe("createCard", () => {
  it("adds N created base-variant cards of the named catalog card to the hand, announcing each before it lands", () => {
    const { state, ids } = setup({ player: { hand: [S.createTwo.id], energy: 0, deck }, enemy: { deck } });
    const result = cast(state, "player", ids.player.hand[0]);
    const made = created(result.events);
    expect(made.map((entry) => entry.side)).toEqual(["player", "player"]);
    expect(result.state.sides.player.hand).toEqual(made.map((entry) => entry.instance));
    for (const { instance } of made) {
      expect(result.state.instances[instance]).toMatchObject({ printing: { kind: "card", cardId: THOUGHT }, owner: "player", controller: "player", zone: "hand", variant: { amplified: false }, status: { created: true } });
    }
    expect(eventRedactionViolations(result.events, state, result.state)).toEqual([]);
  });

  it("creates into the opponent's hand when the effect says so, owned and held by the opponent", () => {
    const { state, ids } = setup({ player: { hand: [S.createForOpponent.id], energy: 0, deck }, enemy: { deck } });
    const result = cast(state, "player", ids.player.hand[0]);
    const [made] = created(result.events);
    expect(made?.side).toBe("enemy");
    expect(result.state.sides.enemy.hand).toEqual([made.instance]);
    expect(result.state.instances[made.instance]).toMatchObject({ owner: "enemy", controller: "enemy", status: { created: true } });
  });

  it("rejects a count that is not a positive whole number at build time", () => {
    expect(() => createCard(THOUGHT, 0)).toThrow();
    expect(() => createCard(THOUGHT, 1.5)).toThrow();
  });

  it("hides the created cards from the opponent: no event or view names them, while the hand count is public", () => {
    const { state, ids } = setup({ player: { hand: [S.createTwo.id], energy: 0, deck }, enemy: { deck } });
    const result = cast(state, "player", ids.player.hand[0]);
    const made = created(result.events).map((entry) => entry.instance);
    for (const entry of result.events.filter((item) => item.kind === "cardCreated")) {
      expect(eventSeenBy(entry, "enemy", result.state)).toBeNull();
      expect(eventSeenBy(entry, "player", result.state)).toEqual(entry);
    }
    const enemyView = E.view(result.state, "enemy");
    expect(enemyView.sides.player.hand.count).toBe(2);
    expect(enemyView.sides.player.hand.known).toEqual([]);
    for (const id of made) expect(enemyView.instances[id]).toBeUndefined();
    expect(result.state.knownTo.enemy.filter((id) => made.includes(id))).toEqual([]);
    const playerView = E.view(result.state, "player");
    for (const id of made) expect(playerView.instances[id]?.printing).toEqual({ kind: "card", cardId: THOUGHT });
  });

  it("makes a card that ceases to exist when it resolves or is discarded, entering no void", () => {
    const { state, ids } = setup({ player: { hand: [S.createTwo.id, S.discardOne.id], energy: 5, deck }, enemy: { deck } });
    const [createTwo, discardOne] = ids.player.hand;
    const made = cast(state, "player", createTwo);
    const [first, second] = created(made.events).map((entry) => entry.instance);
    const played = cast(made.state, "player", first);
    expect(played.state.instances[first]).toBeUndefined();
    expect(played.state.sides.player.void).not.toContain(first);
    // Its "Draw a card." resolved before it ceased to exist.
    expect(played.state.sides.player.hand).toContain(ids.player.deck[0]);
    const discarded = cast(played.state, "player", discardOne, [[second]]);
    expect(discarded.state.instances[second]).toBeUndefined();
    expect(discarded.state.sides.player.void).not.toContain(second);
    expect(discarded.events.some((entry) => entry.kind === "ceasedToExist" && entry.instance === second)).toBe(true);
  });

  it("bounces a stale play of a created card that has ceased to exist", () => {
    const { state, ids } = setup({ player: { hand: [S.createTwo.id, S.discardOne.id], energy: 5, deck }, enemy: { deck } });
    const made = cast(state, "player", ids.player.hand[0]);
    const [first] = created(made.events).map((entry) => entry.instance);
    const discarded = cast(made.state, "player", ids.player.hand[1], [[first]]);
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const outcome = fold.reduce(start(discarded.state), { kind: "battleAction", side: "player", action: { kind: "play", card: first, from: "hand" } });
    expect(outcome.kind).toBe("bounced");
  });

  it("keeps a created card in hand across a reload and plays it identically", () => {
    const { state, ids } = setup({ player: { hand: [S.createTwo.id], energy: 5, deck }, enemy: { deck } });
    const made = cast(state, "player", ids.player.hand[0]);
    const [first] = created(made.events).map((entry) => entry.instance);
    const reloaded = deserializeState(JSON.stringify(made.state));
    expect(stateHash(reloaded)).toBe(stateHash(made.state));
    expect(reloaded.instances[first]?.status.created).toBe(true);
    const inline = cast(made.state, "player", first);
    const fold = createFoldAdapter(E, { checkEventPrefix: true });
    const outcome = applied(fold.reduce(start(reloaded), { kind: "battleAction", side: "player", action: { kind: "play", card: first, from: "hand" } }));
    expect(outcome.error).toBeNull();
    expect(stateHash(outcome.slice.committed)).toBe(stateHash(inline.state));
    expect(outcome.slice.committed.instances[first]).toBeUndefined();
  });

  it("commits nothing from a step that names an unknown card or fails after creating one", () => {
    for (const card of [S.createMissing.id, S.createsThenFails.id]) {
      const { state, ids } = setup({ player: { hand: [card], energy: 0, deck }, enemy: { deck } });
      const fold = createFoldAdapter(E, { checkEventPrefix: true });
      const outcome = applied(fold.reduce(start(state), { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } }));
      expect(outcome.error).not.toBeNull();
      expect(outcome.published.some((entry) => entry.kind === "cardCreated")).toBe(false);
      // The play committed; its failed resolution left nothing: no created card, no new instance.
      const { committed } = outcome.slice;
      expect(committed.stack.map((item) => item.kind === "card" && item.instance)).toEqual([ids.player.hand[0]]);
      expect(committed.nextInstance).toBe(state.nextInstance);
      expect(Object.values(committed.instances).filter((instance) => instance.status.created)).toEqual([]);
      expect(committed.sides.player.hand).toEqual([]);
    }
  });
});

describe("notSubtype", () => {
  it("matches characters not of the type, never one with all character types", () => {
    const { state, ids } = setup({ player: { back: [survivor.id, warrior.id], deck }, enemy: { deck } });
    const notSurvivor = characterYouControl({ notSubtype: "Survivor" });
    expect(matchingCharacters(state, E.catalog, notSurvivor, "player", ids.player.back[0]!)).toEqual([ids.player.back[1]]);
    const everyType = setup({ player: { back: [survivor.id, warrior.id, CONTINUOUS.everyType.id], deck }, enemy: { deck } });
    expect(matchingCharacters(everyType.state, E.catalog, notSurvivor, "player", everyType.ids.player.back[0]!)).toEqual([]);
  });
});

describe("Seer: when a non-figment character you control is dissolved, create one; if it was a survivor, two", () => {
  /** The cards created and the triggers queued as the player dissolves the character at B`victim`, with Seer at B0. */
  function dissolveWithSeer(amplified: boolean, back: readonly (typeof survivor.id)[], victim: number) {
    const board = setup({ player: { back: [seer.id, ...back], hand: [S.dissolveOne.id], energy: 0, deck }, enemy: { deck } });
    if (amplified) amplify(board.state, board.ids.player.back[0]);
    // A lone character is chosen automatically.
    const result = cast(board.state, "player", board.ids.player.hand[0], back.length === 0 ? [] : [[board.ids.player.back[victim]!]]);
    return { count: created(result.events).length, triggers: queued(result.events), seer: board.ids.player.back[0], result };
  }

  it("base: one card for any non-figment character, survivor or not", () => {
    expect(dissolveWithSeer(false, [survivor.id], 1).count).toBe(1);
    expect(dissolveWithSeer(false, [warrior.id], 1).count).toBe(1);
  });

  it("amplified: exactly one trigger per dissolve, two cards for a printed survivor and one otherwise", () => {
    const printed = dissolveWithSeer(true, [survivor.id], 1);
    expect([printed.count, printed.triggers]).toEqual([2, [printed.seer]]);
    const other = dissolveWithSeer(true, [warrior.id], 1);
    expect([other.count, other.triggers]).toEqual([1, [other.seer]]);
    // Its own dissolve: Seer is a survivor.
    const own = dissolveWithSeer(true, [], 0);
    expect([own.count, own.triggers]).toEqual([2, [own.seer]]);
  });

  it("amplified: reads types as the character last was in play, from a static or a floating effect, though it is a Warrior in the void", () => {
    const fromStatic = dissolveWithSeer(true, [warrior.id, CONTINUOUS.everyType.id], 1);
    expect([fromStatic.count, fromStatic.triggers]).toEqual([2, [fromStatic.seer]]);
    const board = setup({ player: { back: [seer.id, warrior.id], hand: [CONTINUOUS.shapeshift.id, S.dissolveOne.id], energy: 0, deck }, enemy: { deck } });
    amplify(board.state, board.ids.player.back[0]);
    const [seerId, warriorId] = board.ids.player.back;
    const shifted = cast(board.state, "player", board.ids.player.hand[0], [[warriorId!]]);
    const dissolved = cast(shifted.state, "player", board.ids.player.hand[1], [[warriorId!]]);
    expect(dissolved.state.instances[warriorId!]?.zone).toBe("void");
    expect([created(dissolved.events).length, queued(dissolved.events)]).toEqual([2, [seerId]]);
  });

  it("ignores figments, even survivor figments, and the opponent's characters", () => {
    const board = setup({ player: { back: [seer.id], hand: [S.dissolveOne.id, S.dissolveOne.id], energy: 0, deck }, enemy: { back: [survivor.id], deck } });
    amplify(board.state, board.ids.player.back[0]);
    const figment = placeFigment(board.state, "player", { rank: "back", index: 1 }, { kind: "figment", figment: SURVIVOR_FIGMENT.id, spark: 1 });
    const first = cast(board.state, "player", board.ids.player.hand[0], [[figment]]);
    const second = cast(first.state, "player", board.ids.player.hand[1], [[board.ids.enemy.back[0]!]]);
    expect([...created(first.events), ...created(second.events)]).toEqual([]);
  });

  it("handles several dissolves at once, for both sides' Seers, each creating in its own controller's hand in trigger order", () => {
    // The sweep dissolves each side's characters one at a time, B0 first, so each Seer sits last to see them all.
    const board = setup({ player: { back: [survivor.id, warrior.id, seer.id], hand: [S.sweep.id], energy: 0, deck }, enemy: { back: [warrior.id, seer.id], deck } });
    amplify(board.state, board.ids.player.back[2]);
    amplify(board.state, board.ids.enemy.back[1]);
    const result = cast(board.state, "player", board.ids.player.hand[0]);
    const made = created(result.events);
    // Player: survivor (2), warrior (1), its Seer (2). Enemy: warrior (1), its Seer (2).
    expect(made.filter((entry) => entry.side === "player")).toHaveLength(5);
    expect(made.filter((entry) => entry.side === "enemy")).toHaveLength(3);
    expect(result.state.sides.player.hand).toEqual(made.filter((entry) => entry.side === "player").map((entry) => entry.instance));
    expect(result.state.sides.enemy.hand).toEqual(made.filter((entry) => entry.side === "enemy").map((entry) => entry.instance));
    expect(eventRedactionViolations(result.events, board.state, result.state)).toEqual([]);
    for (const viewer of ["player", "enemy"] as const) {
      const seen = result.events.flatMap((entry) => (entry.kind === "cardCreated" ? [eventSeenBy(entry, viewer, result.state)] : []));
      expect(seen.filter((entry) => entry !== null).every((entry) => entry?.kind === "cardCreated" && entry.side === viewer)).toBe(true);
    }
  });

  it("creates in its controller's hand when the opponent dissolves in response, before either player gets priority again", () => {
    const board = setup({ player: { back: [seer.id, survivor.id], hand: [S.createTwo.id], energy: 0, deck }, enemy: { hand: [S.quickDissolve.id], energy: 0, deck } });
    amplify(board.state, board.ids.player.back[0]);
    const played = E.apply(board.state, "player", { kind: "play", card: board.ids.player.hand[0], from: "hand" }, NO_PROMPTS);
    expect(played.state.stack).toHaveLength(1);
    const response = cast(played.state, "enemy", board.ids.enemy.hand[0], [[board.ids.player.back[1]!]]);
    // The trigger resolves before the player's event on the stack below it does.
    const below = response.events.findIndex((entry) => entry.kind === "resolved" && entry.instance === board.ids.player.hand[0]);
    expect(below).toBeGreaterThan(0);
    expect(created(response.events.slice(0, below)).map((entry) => entry.side)).toEqual(["player", "player"]);
    expect(response.state.sides.player.hand).toHaveLength(4);
    for (const entry of response.events.filter((item) => item.kind === "cardCreated")) expect(eventSeenBy(entry, "enemy", response.state)).toBeNull();
    expect(response.events.filter((entry) => entry.kind === "triggerQueued").every((entry) => eventSeenBy(entry, "enemy", response.state) !== null)).toBe(true);
  });
});
