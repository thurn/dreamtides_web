/** Card primitives: draw, discard, foresee, erode, discover, grantCardKeyword, reveal. */
import { describe, expect, it } from "vitest";
import type { EngineCardDefinition } from "../../catalog";
import { createEngine } from "../../engine";
import { engineCardFromContent } from "../../content-catalog";
import type { CardDefinition } from "../../../content/define";
import { eventSeenBy } from "../../events";
import { createFoldAdapter, type BattleSlice, type IntentOutcome } from "../../fold/slice";
import type { EngineLogRecord } from "../../log";
import type { Answer, ChooseCardsPrompt, Prompt } from "../../prompts/types";
import { abandonCost, activated, energy, energyX, event, staticAbility, x } from "../../dsl/builders";
import { NO_DECK_MODS } from "../../dsl/types";
import type { Keyword, PlayerRef } from "../../dsl/types";
import type { Action } from "../../rules/actions";
import { instanceOrigin } from "../../rules/activation";
import { hasKeyword } from "../../rules/keywords";
import { playRoutes } from "../../rules/timing";
import { instanceOf } from "../../rules/zones";
import { stateHash } from "../../state/hash";
import type { CardId, InstanceId } from "../../state/ids";
import type { BattleState } from "../../state/types";
import { IllegalAnswer } from "../../steps/errors";
import { ScriptedSource } from "../../steps/sources";
import type { AnswerSource } from "../../steps/types";
import { boardState, cardIdOf, type BoardSetup, type SideSetup } from "../../testing/board";
import { CONTINUOUS } from "../../testing/continuous-cards";
import { DSL, DSL_CARDS } from "../../testing/dsl-cards";
import { invariantViolations } from "../../testing/invariants";
import { playFromHand, runScenario } from "../../testing/scenario";
import { STACK } from "../../testing/stack-cards";
import { SYNTHETIC, syntheticId, testCatalog } from "../../testing/synthetic-cards";
import { at, passUntil } from "../../testing/trigger-harness";
import { ZONE, zoneCatalog } from "../../testing/zone-cards";
import { promptView, view } from "../../view/view";
import { resolveEffect } from "../interpreter";
import { discover } from "./discover";
import { draw } from "./draw";
import { reveal } from "./reveal";
import { sequence } from "./sequence";
import { cardsIn, grantCardKeyword } from "./grant-card-keyword";

const engine = createEngine(testCatalog(DSL_CARDS));
const v = SYNTHETIC;
const deck = [v.vanilla1.id, v.vanilla2.id, v.vanilla3.id, v.vanilla5.id];

describe("card primitives", () => {
  it("draw moves cards from the top of the deck to hand", () => {
    const { state, ids } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.drawTwo.id], energy: 1, deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(state.sides.player.hand).toEqual(ids.player.deck.slice(0, 2));
  });

  it("reads the amplified variant", () => {
    const run = (amplified: boolean) =>
      runScenario(engine, {
        board: {
          active: "player",
          phase: "day",
          player: { hand: [{ cardId: DSL.amplifiedDraw.id, amplified }], energy: 1, deck },
          enemy: { deck },
        },
        steps: (ids) => [playFromHand(ids, "player")],
      });
    expect(run(false).state.sides.player.hand).toHaveLength(2);
    expect(run(true).state.sides.player.hand).toHaveLength(3);
  });

  it("discard has the player choose, discarding the whole hand when it is short", () => {
    const chosen = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.discardTwo.id, v.vanilla1.id, v.vanilla2.id, v.vanilla3.id], deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: (ids) => [[ids.player.hand[1], ids.player.hand[3]]],
    });
    expect(chosen.state.sides.player.hand).toEqual([chosen.ids.player.hand[2]]);
    const short = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.discardTwo.id, v.vanilla1.id], deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(short.state.sides.player.hand).toEqual([]);
    expect(short.answers).toEqual([expect.objectContaining({ auto: true })]);
  });

  it("random discard draws from its own random stream without a prompt", () => {
    const { state, answers } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.opponentDiscardsRandom.id], energy: 1, deck }, enemy: { hand: [v.vanilla1.id, v.vanilla2.id], deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(state.sides.enemy.hand).toHaveLength(1);
    expect(state.rng["random:discard"]).toBe(1);
    expect(answers).toEqual([]);
  });

  it("foresee reorders the top cards and sends the chosen ones to the void", () => {
    const { state, ids } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.foreseeTwo.id], deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: (ids) => [[{ card: ids.player.deck[1], to: "top" }, { card: ids.player.deck[0], to: "void" }]],
    });
    expect(state.sides.player.deck.slice(0, 3)).toEqual([ids.player.deck[1], ids.player.deck[2], ids.player.deck[3]]);
    expect(state.sides.player.void).toContain(ids.player.deck[0]);
  });

  it("foresee publishes where each card went, naming the kept cards only to the foreseeing side", () => {
    const { state, ids, events } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.foreseeTwo.id], deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: (ids) => [[{ card: ids.player.deck[1], to: "top" }, { card: ids.player.deck[0], to: "void" }]],
    });
    const foresaw = events.filter((event) => event.kind === "foresaw");
    expect(foresaw).toEqual([{ kind: "foresaw", side: "player", kept: [ids.player.deck[1]], voided: [ids.player.deck[0]] }]);
    expect(eventSeenBy(foresaw[0], "player", state)).toEqual(foresaw[0]);
    expect(eventSeenBy(foresaw[0], "enemy", state)).toEqual({ kind: "foresaw", side: "player", kept: [null], voided: [ids.player.deck[0]] });
    // Once the deck is shuffled, nobody can identify the kept card any longer.
    const shuffled: BattleState = { ...state, knownTo: { player: [], enemy: [] } };
    expect(eventSeenBy(foresaw[0], "player", shuffled)).toEqual({ ...foresaw[0], kept: [null] });
  });

  it("foresee publishes nothing from an empty deck", () => {
    const { events, answers } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.foreseeTwo.id], deck: [] }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(answers).toEqual([]);
    expect(events.some((event) => event.kind === "foresaw")).toBe(false);
  });

  it("erode moves the top cards to the void and causes Fatigue from an empty deck", () => {
    const { state } = runScenario(engine, {
      board: { active: "player", phase: "day", player: { hand: [DSL.erodeThree.id], deck }, enemy: { deck: [v.vanilla1.id] } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(state.sides.enemy.void).toHaveLength(1);
    expect(state.sides.enemy.fatigueCount).toBe(2);
    expect(state.sides.player.score).toBe(1 + 2);
  });
});

/** Answers every prompt with `pick` of its candidates, keeping each prompt it was asked. */
class PickingSource implements AnswerSource {
  readonly prompts: Prompt[] = [];
  constructor(private readonly pick: (candidates: readonly InstanceId[]) => readonly InstanceId[]) {}
  answer(prompt: Prompt): Answer {
    this.prompts.push(prompt);
    if (prompt.kind !== "chooseCards") throw new Error(`unexpected ${prompt.kind} prompt`);
    return this.pick(prompt.candidates);
  }
}

describe("discover", () => {
  // Four characters and three events.
  const mixed = [v.event0.id, v.vanilla1.id, v.event1.id, v.vanilla2.id, v.vanilla3.id, v.event0.id, v.vanilla5.id];
  const board = (card: CardId, playerDeck: readonly CardId[]): BoardSetup => ({
    active: "player",
    phase: "day",
    player: { hand: [card], deck: playerDeck },
    enemy: { deck },
  });
  const play = (setup: BoardSetup, source: AnswerSource) => {
    const { state, ids } = boardState(engine.catalog, setup);
    return { start: state, ids, result: engine.apply(state, "player", playFromHand(ids, "player").action, source) };
  };
  const cardType = (state: BattleState, id: InstanceId) => engine.catalog.card(cardIdOf(state, id)).cardType;

  it("privately offers up to three matching cards of its controller's deck, puts the chosen one into hand, and shuffles the deck", () => {
    const source = new PickingSource((candidates) => [candidates[1]]);
    const { start, ids, result } = play(board(DSL.discoverCharacter.id, mixed), source);
    const [prompt] = source.prompts as ChooseCardsPrompt[];
    expect(prompt).toMatchObject({ kind: "chooseCards", side: "player", privateTo: "player", min: 1, max: 1 });
    expect(prompt.purpose.role).toBe("discover");
    expect(new Set(prompt.candidates).size).toBe(3);
    for (const card of prompt.candidates) {
      expect(ids.player.deck).toContain(card);
      expect(cardType(start, card)).toBe("character");
    }
    const chosen = prompt.candidates[1];
    const { state } = result;
    expect(state.sides.player.hand).toEqual([chosen]);
    expect(state.instances[chosen]?.zone).toBe("hand");
    expect([...state.sides.player.deck].sort()).toEqual(ids.player.deck.filter((card) => card !== chosen).sort());
    expect(state.rng["random:discover"]).toBe(3);
    expect(state.rng["shuffle:player"] ?? 0).toBeGreaterThan(start.rng["shuffle:player"] ?? 0);
    // Nobody can place a card of the shuffled deck, the offered ones included.
    for (const side of ["player", "enemy"] as const) {
      expect(state.knownTo[side].filter((card) => state.sides.player.deck.includes(card))).toEqual([]);
    }
    expect(result.events.some((event) => event.kind === "cardDrawn")).toBe(false);
    // Both sides see the discovery; only the discoverer sees which card it was.
    const discovered = result.events.filter((event) => event.kind === "cardDiscovered");
    expect(discovered).toEqual([{ kind: "cardDiscovered", side: "player", instance: chosen }]);
    expect(eventSeenBy(discovered[0], "player", state)).toEqual(discovered[0]);
    expect(eventSeenBy(discovered[0], "enemy", state)).toEqual({ kind: "cardDiscovered", side: "player", instance: null });
  });

  it("offers every matching card when fewer match, answers a lone match itself, and does nothing with none", () => {
    const events = new PickingSource((candidates) => [candidates[0]]);
    const twoEvents = play(board(DSL.discoverEvent.id, [v.vanilla1.id, v.event0.id, v.vanilla2.id, v.event1.id]), events);
    expect([...(events.prompts[0] as ChooseCardsPrompt).candidates].sort()).toEqual([twoEvents.ids.player.deck[1], twoEvents.ids.player.deck[3]].sort());

    const lone = play(board(DSL.discoverCharacter.id, [v.event0.id, v.vanilla1.id, v.event1.id]), new ScriptedSource([]));
    expect(lone.result.state.sides.player.hand).toEqual([lone.ids.player.deck[1]]);
    expect(lone.result.answers).toEqual([expect.objectContaining({ auto: true })]);

    const none = play(board(DSL.discoverCharacter.id, [v.event0.id, v.event1.id]), new ScriptedSource([]));
    expect(none.result.answers).toEqual([]);
    expect(none.result.events.some((event) => event.kind === "cardDiscovered")).toBe(false);
    expect(none.result.state.sides.player.hand).toEqual([]);
    expect(none.result.state.sides.player.deck).toEqual(none.ids.player.deck);
    expect(none.result.state.rng["random:discover"]).toBeUndefined();
    expect(none.result.state.rng["shuffle:player"]).toEqual(none.start.rng["shuffle:player"]);
  });

  it("hides the offer from the opponent and rejects an answer it did not offer without touching the state", () => {
    const { state: start, ids } = boardState(engine.catalog, board(DSL.discoverCharacter.id, mixed));
    const action = playFromHand(ids, "player").action;
    const before = stateHash(start);
    const offered = new PickingSource((candidates) => [candidates[0]]);
    engine.apply(start, "player", action, offered);
    const prompt = offered.prompts[0] as ChooseCardsPrompt;
    const characters = ids.player.deck.filter((card) => cardType(start, card) === "character");
    const unoffered = characters.find((card) => !prompt.candidates.includes(card))!;
    for (const answer of [[unoffered], [], prompt.candidates.slice(0, 2), [ids.player.deck[0]]]) {
      expect(() => engine.apply(start, "player", action, new ScriptedSource([answer]))).toThrow(IllegalAnswer);
    }
    expect(stateHash(start)).toBe(before);
  });

  it("offers as many cards as the saved battle's config says", () => {
    for (const discoverOptions of [2, 4]) {
      const { state, ids } = boardState(engine.catalog, board(DSL.discoverCharacter.id, mixed));
      const saved = JSON.parse(JSON.stringify({ ...state, config: { ...state.config, discoverOptions } })) as BattleState;
      const source = new PickingSource((candidates) => [candidates[0]]);
      engine.apply(saved, "player", playFromHand(ids, "player").action, source);
      expect((source.prompts[0] as ChooseCardsPrompt).candidates).toHaveLength(discoverOptions);
    }
  });
});

/** Discovers a character, then throws: a step that fails after its Discover's answer was accepted. */
const discoverThenFail: EngineCardDefinition = {
  id: syntheticId(920),
  cardType: "event",
  costs: [],
  spark: null,
  subtype: "",
  speed: "standard",
  status: "authored",
  abilities: () => [],
  synthetic: {
    resolve(ctx, item) {
      resolveEffect(ctx, discover({ cardType: "character" }), {
        source: item.instance,
        origin: instanceOrigin(instanceOf(ctx.state, item.instance)),
        ability: 0,
        controller: item.controller,
        x: null,
        optionalPaid: [],
        choices: { modes: [], targets: [] },
      });
      throw new Error("the step fails after its discovery");
    },
  },
};

describe("discover across suspension", () => {
  const fold = createFoldAdapter(engine, { checkEventPrefix: true });
  const applied = (outcome: IntentOutcome): BattleSlice => {
    if (outcome.kind !== "applied") throw new Error(`bounced: ${outcome.reason}`);
    if (outcome.error !== null) throw new Error(outcome.error.message);
    return outcome.slice;
  };

  it("commits nothing while suspended, reloads to the same offer, bounces foreign and illegal answers, and resolves once answered", () => {
    const { state, ids } = boardState(engine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [DSL.discoverCharacter.id], deck: [v.vanilla1.id, v.event0.id, v.vanilla2.id, v.vanilla3.id, v.vanilla5.id] },
      enemy: { deck },
    });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const suspended = applied(fold.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action }));
    const pending = fold.pending(suspended)!;
    expect(pending.prompt.purpose.role).toBe("discover");
    // Only the answer commits the step: the deck, hand, and random streams are untouched until then.
    expect(suspended.committed.sides.player.deck).toEqual(ids.player.deck);
    expect(suspended.committed.sides.player.hand).toEqual([]);
    expect(suspended.committed.rng["random:discover"]).toBeUndefined();
    expect(suspended.committed.knownTo.player).toEqual([]);
    // The opponent learns that a choice is pending, never which cards it offers.
    expect((promptView(pending.prompt, "enemy", pending.display) as ChooseCardsPrompt).candidates).toEqual([]);

    const reloaded = JSON.parse(JSON.stringify(suspended)) as BattleSlice;
    const fresh = createFoldAdapter(engine, { checkEventPrefix: true });
    const again = fresh.pending(reloaded)!;
    expect(again.prompt.id).toBe(pending.prompt.id);
    const offered = (pending.prompt as ChooseCardsPrompt).candidates;
    expect((again.prompt as ChooseCardsPrompt).candidates).toEqual(offered);

    const unoffered = [ids.player.deck[0], ids.player.deck[2], ids.player.deck[3], ids.player.deck[4]].find((card) => !offered.includes(card))!;
    const answer = (side: "player" | "enemy", value: readonly InstanceId[]) =>
      fresh.reduce(reloaded, { kind: "answer", side, promptId: pending.prompt.id, value });
    expect(answer("enemy", [offered[0]])).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(answer("player", [unoffered])).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(answer("player", [])).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(answer("player", offered.slice(0, 2))).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fresh.reduce(reloaded, { kind: "battleAction", side: "enemy", action: { kind: "pass" } })).toMatchObject({ kind: "bounced" });

    const done = applied(answer("player", [offered[2]]));
    expect(done.inFlight).toBeNull();
    expect(done.committed.sides.player.hand).toEqual([offered[2]]);
    expect(fresh.reduce(done, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [offered[2]] })).toMatchObject({ kind: "bounced" });
  });

  it("leaves the committed state and published events untouched when the step fails after the answer is accepted", () => {
    const failingEngine = createEngine(testCatalog([...DSL_CARDS, discoverThenFail]));
    const records: EngineLogRecord[] = [];
    const failing = createFoldAdapter(failingEngine, { checkEventPrefix: true, log: (record) => records.push(record) });
    const { state, ids } = boardState(failingEngine.catalog, {
      active: "player",
      phase: "day",
      player: { hand: [discoverThenFail.id], deck: [v.vanilla1.id, v.event0.id, v.vanilla2.id, v.vanilla3.id, v.vanilla5.id] },
      enemy: { deck },
    });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const suspended = applied(failing.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action }));
    const pending = failing.pending(suspended)!;
    expect(pending.prompt.purpose.role).toBe("discover");
    const [chosen] = (pending.prompt as ChooseCardsPrompt).candidates;
    const committed = JSON.parse(JSON.stringify(suspended.committed)) as BattleState;
    const hash = stateHash(suspended.committed);
    records.length = 0;

    const outcome = failing.reduce(suspended, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [chosen] });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected an engine error");
    expect(outcome.error.message).toMatch(/after its discovery/);
    // Nothing the accepted answer did (the card into hand, cardDiscovered, the shuffle, the knowledge reset) commits or publishes.
    expect(outcome.published).toEqual([]);
    expect(outcome.slice).toEqual({ committed: suspended.committed, inFlight: null, publishedEvents: 0, attempt: suspended.attempt });
    expect(stateHash(outcome.slice.committed)).toBe(hash);
    expect(outcome.slice.committed).toEqual(committed);
    const after = outcome.slice.committed;
    expect(after.sides.player.hand).not.toContain(chosen);
    expect(after.sides.player.deck).toEqual(ids.player.deck);
    expect(after.rng).toEqual(committed.rng);
    expect(after.rng["random:discover"]).toBeUndefined();
    expect(after.knownTo).toEqual(committed.knownTo);
    expect(records.map((record) => record.event)).toEqual(["engine.promptAnswered", "engine.error"]);
    expect(failing.pending(outcome.slice)).toBeNull();
  });
});

/** "Cards in the opponent's hand have Offering." */
const opponentHandOffering: EngineCardDefinition = {
  id: syntheticId(921),
  cardType: "character",
  costs: [energy(2)],
  spark: 1,
  subtype: "Mage",
  speed: "standard",
  status: "authored",
  abilities: () => [staticAbility(grantCardKeyword(cardsIn("hand", {}, "opponent"), "offering"))],
};

/** A malformed event that resolves the static-only primitive. */
const resolvesCardKeyword: EngineCardDefinition = {
  id: syntheticId(922),
  cardType: "event",
  costs: [energy(0)],
  spark: null,
  subtype: "",
  speed: "standard",
  status: "authored",
  abilities: () => [event(grantCardKeyword(cardsIn("hand"), "offering"))],
};

describe("grantCardKeyword", () => {
  const zones = createEngine(zoneCatalog([opponentHandOffering, resolvesCardKeyword]));
  const filler = Array.from({ length: 6 }, () => v.vanilla1.id);
  const setup = (player: SideSetup, enemy: SideSetup = {}): BoardSetup => ({
    active: "player",
    phase: "day",
    player: { deck: filler, ...player },
    enemy: { deck: filler, ...enemy },
  });
  const placed = (spec: BoardSetup) => boardState(zones.catalog, spec);
  const has = (state: BattleState, id: InstanceId | null | undefined, keyword: Keyword) => hasKeyword(state, zones.catalog, id!, keyword);
  const act = (state: BattleState, side: "player" | "enemy", action: Action, answers: readonly Answer[] = []) => {
    const source = new ScriptedSource(answers);
    const result = zones.apply(state, side, action, source);
    source.assertExhausted();
    expect(invariantViolations(result.state, zones.catalog)).toEqual([]);
    return result;
  };
  const zoneOf = (state: BattleState, id: InstanceId | null | undefined) => state.instances[id!]?.zone ?? null;

  it("gives the keyword to every card in its controller's named zone that matches, and to no other card", () => {
    const { state, ids } = placed(
      setup(
        { back: [DSL.handOffering.id], hand: [v.vanilla3.id, v.event1.id], deck: [v.vanilla2.id], void: [v.vanilla5.id] },
        { hand: [v.vanilla2.id], deck: [v.vanilla2.id] },
      ),
    );
    for (const card of ids.player.hand) {
      expect(has(state, card, "offering")).toBe(true);
      expect(playRoutes(state, zones.catalog, card, "hand")).toEqual(["hand", "offering"]);
    }
    for (const card of [ids.player.back[0], ids.player.deck[0], ids.player.void[0], ids.enemy.hand[0], ids.enemy.deck[0]]) {
      expect(has(state, card, "offering")).toBe(false);
    }
    expect(has(state, ids.player.hand[0], "awakened")).toBe(false);
  });

  it("plays a card through the granted Offering for 0●, and the Offering status outlasts the keyword", () => {
    const { state, ids } = placed(setup({ back: [DSL.handOffering.id], hand: [v.vanilla3.id, v.vanilla1.id], energy: 0 }));
    const [brute, fodder] = ids.player.hand;
    const after = act(state, "player", { kind: "play", card: brute, from: "hand" }).state;
    expect(zoneOf(after, brute)).toBe("play");
    expect(zoneOf(after, fodder)).toBe("banished");
    expect(after.sides.player.currentEnergy).toBe(0);
    expect(after.instances[brute]?.status.offering).toBe(true);
    // Out of the hand the static no longer applies, but the status still banishes it during Ending.
    expect(has(after, brute, "offering")).toBe(false);
    expect(zoneOf(passUntil(zones, after, at(zones, "enemy", "day")).state, brute)).toBe("banished");
  });

  it("ends as its source leaves play, and each card loses the keyword as it leaves the zone", () => {
    const { state, ids } = placed(setup({ back: [DSL.handOffering.id], hand: [DSL.returnAnyToHand.id, v.vanilla1.id], energy: 1 }));
    const [bounce, kept] = ids.player.hand;
    const nomad = ids.player.back[0];
    // The card's own costs, then the only character in play, the source, returns to hand.
    const after = act(state, "player", { kind: "play", card: bounce, from: "hand" }, [0]).state;
    expect(zoneOf(after, nomad)).toBe("hand");
    expect(zoneOf(after, bounce)).toBe("void");
    expect(after.instances[bounce]?.status.offering).toBe(false);
    for (const card of [kept, nomad, bounce]) expect(has(after, card, "offering")).toBe(false);
    expect(playRoutes(after, zones.catalog, kept, "hand")).toEqual(["hand"]);
  });

  it("matches its filter by the type changes of layer 2, so a card that has all character types matches every subtype", () => {
    const { state, ids } = placed(
      setup({
        back: [v.vanilla1.id, ZONE.sacrifice.id, DSL.voidMagesReclaim.id],
        hand: [CONTINUOUS.shapeshift.id],
        void: [ZONE.sacrifice.id, v.vanilla2.id, v.event1.id],
        energy: 5,
      }),
    );
    const [warrior, sacrifice] = ids.player.back;
    const [mage, plainWarrior, spell] = ids.player.void;
    expect(has(state, mage, "reclaim")).toBe(true);
    for (const card of [plainWarrior, spell]) expect(has(state, card, "reclaim")).toBe(false);
    // The Warrior gains all character types until end of turn, then is abandoned into the void.
    const shifted = act(state, "player", { kind: "play", card: ids.player.hand[0], from: "hand" }, [[warrior!]]).state;
    expect(has(shifted, warrior, "reclaim")).toBe(false);
    const settled = act(shifted, "player", { kind: "activate", source: sacrifice!, ability: 0 }, [[warrior!]]).state;
    expect(zoneOf(settled, warrior)).toBe("void");
    expect(has(settled, warrior, "reclaim")).toBe(true);
    const legal = zones.legalActions(settled, "player");
    expect(legal).toContainEqual({ kind: "play", card: warrior, from: "void" });
    expect(legal.some((action) => action.kind === "play" && action.card === plainWarrior)).toBe(false);
  });

  it("applies each side's static to its own controller's zone, and resolves a player reference from that controller", () => {
    const { state, ids } = placed(
      setup({ back: [DSL.handOffering.id], hand: [v.vanilla1.id] }, { back: [opponentHandOffering.id], hand: [v.vanilla2.id] }),
    );
    expect(has(state, ids.player.hand[0], "offering")).toBe(true);
    // The enemy's "the opponent's hand" is the player's hand, which already has it; the enemy's own hand has none.
    expect(has(state, ids.enemy.hand[0], "offering")).toBe(false);
    const both = placed(setup({ back: [DSL.handOffering.id], hand: [v.vanilla1.id] }, { back: [DSL.handOffering.id], hand: [v.vanilla2.id] }));
    expect(has(both.state, both.ids.enemy.hand[0], "offering")).toBe(true);
    // Neither side's view names the other's hand cards or their keywords.
    const seen = zones.view(both.state, "enemy");
    expect(seen.instances[both.ids.player.hand[0]]).toBeUndefined();
    expect(seen.instances[both.ids.enemy.hand[0]]?.characteristics.keywords).toContain("offering");
  });

  it("keeps the route chosen when paying its costs removes the source", () => {
    const { state, ids } = placed(setup({ back: [DSL.handOffering.id], hand: [STACK.abandonOrDiscardToDraw.id, v.vanilla1.id], energy: 0 }));
    const [card, fodder] = ids.player.hand;
    const nomad = ids.player.back[0];
    // Offering is the only payable route, its banish takes the only other hand card, so the additional cost abandons the source (RD-hv-umm2.52-2).
    const after = act(state, "player", { kind: "play", card: card, from: "hand" }).state;
    expect(zoneOf(after, nomad)).toBe("void");
    expect(zoneOf(after, fodder)).toBe("banished");
    expect(zoneOf(after, card)).toBe("void");
    expect(after.instances[card]?.status.offering).toBe(true);
    expect(after.sides.player.hand).toHaveLength(2);
    expect(zoneOf(passUntil(zones, after, at(zones, "enemy", "day")).state, card)).toBe("banished");
  });

  it("stores nothing: a reloaded state reads the same keywords and legal actions, and the route prompt survives suspension", () => {
    const { state, ids } = placed(setup({ back: [DSL.handOffering.id], hand: [v.vanilla3.id, v.vanilla1.id], energy: 3 }));
    const reloaded = JSON.parse(JSON.stringify(state)) as BattleState;
    expect(stateHash(reloaded)).toBe(stateHash(state));
    for (const card of ids.player.hand) expect(has(reloaded, card, "offering")).toBe(true);
    expect(zones.legalActions(reloaded, "player")).toEqual(zones.legalActions(state, "player"));

    const fold = createFoldAdapter(zones, { checkEventPrefix: true });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const outcome = fold.reduce(start, { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } });
    if (outcome.kind !== "applied") throw new Error("bounced");
    const pending = fold.pending(outcome.slice)!;
    expect(pending.prompt.purpose.role).toBe("playRoute");
    expect(outcome.slice.committed.sides.player.hand).toEqual(ids.player.hand);
    const saved = JSON.parse(JSON.stringify(outcome.slice)) as BattleSlice;
    const fresh = createFoldAdapter(zones, { checkEventPrefix: true });
    expect(fresh.pending(saved)!.prompt.id).toBe(pending.prompt.id);
    const answer = (side: "player" | "enemy", value: Answer) => fresh.reduce(saved, { kind: "answer", side, promptId: pending.prompt.id, value });
    expect(answer("enemy", 1)).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(answer("player", 2)).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    const offered = answer("player", 1);
    if (offered.kind !== "applied" || offered.error !== null) throw new Error("the Offering route did not apply");
    expect(offered.slice.committed.sides.player.currentEnergy).toBe(3);
    expect(zoneOf(offered.slice.committed, ids.player.hand[1])).toBe("banished");
    expect(offered.slice.committed.instances[ids.player.hand[0]]?.status.offering).toBe(true);
  });

  it("never resolves: an effect holding it fails its resolution step, which commits nothing", () => {
    const { state, ids } = placed(setup({ back: [DSL.handOffering.id], hand: [resolvesCardKeyword.id, v.vanilla1.id] }));
    const fold = createFoldAdapter(zones, { checkEventPrefix: true });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const played = fold.reduce(start, { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } });
    if (played.kind !== "applied") throw new Error("bounced");
    const route = fold.pending(played.slice)!;
    expect(route.prompt.purpose.role).toBe("playRoute");
    const outcome = fold.reduce(played.slice, { kind: "answer", side: "player", promptId: route.prompt.id, value: 0 });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected an engine error");
    expect(outcome.error.message).toMatch(/grantCardKeyword/);
    // The play commits; its resolution, which fails, commits and publishes nothing, so the card waits on the stack.
    expect(outcome.published.map((event) => event.kind)).toEqual(["cardPlayed"]);
    const after = outcome.slice.committed;
    expect(after.stack).toEqual([expect.objectContaining({ kind: "card", instance: ids.player.hand[0] })]);
    expect(after.sides.player.hand).toEqual([ids.player.hand[1]]);
    expect(after.floating).toEqual([]);
    expect(fold.pending(outcome.slice)).toBeNull();
  });
});

/** Synthetic reveal-and-draw composition; repeated UUIDs in a hand are distinct instances. */
const revealingCard = (player: PlayerRef): EngineCardDefinition => ({
  id: syntheticId(player === "you" ? 930 : 931),
  cardType: "event",
  costs: [],
  spark: null,
  subtype: "",
  speed: "standard",
  status: "authored",
  abilities: () => [event(sequence(reveal(player), draw(1, player, { ephemeral: true })))],
});

const revealThenDiscover: EngineCardDefinition = {
  ...revealingCard("opponent"),
  id: syntheticId(932),
  abilities: () => [event(sequence(reveal("opponent"), discover({ cardType: "character" })))],
};
const revealThenFail: EngineCardDefinition = {
  ...discoverThenFail,
  id: syntheticId(933),
  synthetic: {
    resolve(ctx, item) {
      resolveEffect(ctx, reveal("opponent"), {
        source: item.instance,
        origin: instanceOrigin(instanceOf(ctx.state, item.instance)),
        ability: 0,
        controller: item.controller,
        x: null,
        optionalPaid: [],
        choices: { modes: [], targets: [] },
      });
      throw new Error("the step fails after its reveal");
    },
  },
};

describe("reveal", () => {
  const cards = [revealingCard("you"), revealingCard("opponent"), revealThenDiscover, revealThenFail];
  const revealing = createEngine(testCatalog(cards));
  const applied = (outcome: IntentOutcome): BattleSlice => {
    if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("expected an applied intent");
    return outcome.slice;
  };

  it("reveals either player's entire hand in position order, without moving cards or exposing later draws", () => {
    for (const player of ["you", "opponent"] as const) {
      const side = player === "you" ? "player" : "enemy";
      const observer = player === "you" ? "enemy" : "player";
      const card = revealingCard(player);
      const result = runScenario(revealing, {
        board: {
          active: "player", phase: "day",
          player: { hand: [card.id, v.vanilla1.id, v.vanilla1.id], deck },
          enemy: { hand: [v.vanilla1.id, v.vanilla1.id], deck },
        },
        steps: (ids) => [playFromHand(ids, "player")],
      });
      const hand = side === "player" ? result.ids.player.hand.slice(1) : result.ids.enemy.hand;
      expect(view(result.start, observer, revealing.catalog).sides[side].hand.known).toEqual([]);
      expect(result.state.sides[side].hand).toEqual([...hand, result.ids[side].deck[0]]);
      const seen = view(result.state, observer, revealing.catalog);
      expect(seen.sides[side].hand.known).toEqual(hand.map((id, index) => ({ id, index })));
      for (const id of hand) expect(seen.instances[id]).toMatchObject({ zone: "hand", printing: { cardId: v.vanilla1.id } });
      expect(seen.instances[result.ids[side].deck[0]]).toBeUndefined();
      const published = { kind: "revealed", side, instances: hand } as const;
      expect(result.events.filter((item) => item.kind === "revealed")).toEqual([published]);
      for (const viewer of ["player", "enemy"] as const) expect(eventSeenBy(published, viewer, result.state)).toEqual(published);
      expect(result.answers).toEqual([]);
    }
  });

  it("reveals an empty hand without a prompt and continues the sequence", () => {
    const result = runScenario(revealing, {
      board: { active: "player", phase: "day", player: { hand: [cards[1].id], deck }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
    });
    expect(result.events.some((item) => item.kind === "revealed")).toBe(false);
    expect(result.state.sides.enemy.hand).toEqual([result.ids.enemy.deck[0]]);
    expect(result.answers).toEqual([]);
  });

  it("reads the hand at resolution after an opponent response draws a card", () => {
    const response: EngineCardDefinition = { ...DSL.drawTwo, id: syntheticId(934), speed: "interrupt" };
    const combined = createEngine(testCatalog([...cards, response]));
    const result = runScenario(combined, {
      board: {
        active: "player", phase: "day",
        player: { hand: [cards[1].id], deck },
        enemy: { hand: [response.id], energy: 1, deck },
      },
      steps: (ids) => [playFromHand(ids, "player"), playFromHand(ids, "enemy"), { side: "player", action: { kind: "pass" } }, { side: "enemy", action: { kind: "pass" } }],
    });
    expect(result.events.filter((item) => item.kind === "revealed")).toEqual([{ kind: "revealed", side: "enemy", instances: result.ids.enemy.deck.slice(0, 2) }]);
  });

  it("replays a reveal before a suspended choice after reload, rejects foreign/stale input, and publishes one reveal", () => {
    const records: EngineLogRecord[] = [];
    const fold = createFoldAdapter(revealing, { checkEventPrefix: true, log: (record) => records.push(record) });
    const { state, ids } = boardState(revealing.catalog, {
      active: "player", phase: "day",
      player: { hand: [revealThenDiscover.id], deck }, enemy: { hand: [v.vanilla1.id], deck },
    });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const opening = fold.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action });
    const suspended = applied(opening);
    if (opening.kind !== "applied") throw new Error("expected activation to apply");
    expect(suspended.committed.knownTo.player).toEqual([]);
    const reloaded = JSON.parse(JSON.stringify(suspended)) as BattleSlice;
    const fresh = createFoldAdapter(revealing, { checkEventPrefix: true, log: (record) => records.push(record) });
    const pending = fresh.pending(reloaded)!;
    expect(pending.prompt.id).toBe(fold.pending(suspended)!.prompt.id);
    expect(view(pending.display, "player", revealing.catalog).sides.enemy.hand.known).toEqual([{ id: ids.enemy.hand[0], index: 0 }]);
    const chosen = (pending.prompt as ChooseCardsPrompt).candidates[0];
    const answer = { kind: "answer", side: "player", promptId: pending.prompt.id, value: [chosen] } as const;
    expect(fresh.reduce(reloaded, { ...answer, side: "enemy" })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    expect(fresh.reduce(reloaded, { ...answer, value: ids.enemy.hand })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    expect(fresh.reduce(reloaded, { kind: "battleAction", side: "enemy", action: { kind: "pass" } })).toMatchObject({ kind: "bounced" });
    const outcome = fresh.reduce(reloaded, answer);
    const done = applied(outcome);
    if (outcome.kind !== "applied") throw new Error("expected answer to apply");
    expect([...opening.published, ...outcome.published].filter((item) => item.kind === "revealed")).toHaveLength(1);
    expect(done.committed.knownTo.player).toContain(ids.enemy.hand[0]);
    expect(fresh.reduce(done, answer)).toMatchObject({ kind: "bounced" });
    expect(records.some((record) => record.event === "engine.action")).toBe(true);
  });

  it("commits no knowledge or reveal event when the resolving step throws after the reveal", () => {
    const records: EngineLogRecord[] = [];
    const fold = createFoldAdapter(revealing, { log: (record) => records.push(record) });
    const { state, ids } = boardState(revealing.catalog, {
      active: "player", phase: "day",
      player: { hand: [revealThenFail.id], deck }, enemy: { hand: [v.vanilla1.id], deck },
    });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const beforeHash = stateHash(state);
    const outcome = fold.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected a resolution error");
    expect(outcome.slice.committed.knownTo).toEqual(state.knownTo);
    expect(outcome.published.some((item) => item.kind === "revealed")).toBe(false);
    expect(records.some((record) => record.event === "engine.error")).toBe(true);
    expect(outcome.slice.inFlight).toBeNull();
    expect(stateHash(state)).toBe(beforeHash);
  });
});

/** Synthetic cost-bound fixtures; contracts never depend on live card data. */
const paidCostDiscover: EngineCardDefinition = {
  ...DSL.discoverEvent, id: syntheticId(950), costs: [energyX(0)],
  abilities: () => [event(discover({}, { costExactly: x() }))],
};
const freeCostDiscover: EngineCardDefinition = {
  ...DSL.discoverEvent, id: syntheticId(951), costs: [energy(1)],
  abilities: () => [event(discover({ cardType: "character" }, { chooseCost: true }))],
};
const exactSparkSacrifice: EngineCardDefinition = {
  ...v.vanilla1, id: syntheticId(952), status: "authored",
  abilities: () => [activated([energy(2), abandonCost({ sparkAtLeast: 1, sparkAtMost: 1 })], draw(2))],
};
const freeCostThenFail: EngineCardDefinition = {
  ...discoverThenFail, id: syntheticId(953), costs: [energy(1)],
  synthetic: { resolve(ctx, item) {
    resolveEffect(ctx, discover({ cardType: "character" }, { chooseCost: true }), {
      source: item.instance, origin: instanceOrigin(instanceOf(ctx.state, item.instance)),
      ability: 0, controller: item.controller, x: null, optionalPaid: [], choices: { modes: [], targets: [] },
    });
    throw new Error("synthetic resolution failure");
  } },
};

describe("selector cost and spark bounds", () => {
  const bounded = createEngine(testCatalog([paidCostDiscover, freeCostDiscover, exactSparkSacrifice, freeCostThenFail, DSL.variableSpark]));
  const applied = (outcome: IntentOutcome): BattleSlice => {
    if (outcome.kind !== "applied" || outcome.error !== null) throw new Error("expected an applied intent");
    return outcome.slice;
  };

  it("discovers exactly the paid X cost, retaining distinct instances of the same UUID", () => {
    const result = runScenario(bounded, {
      board: { active: "player", phase: "day", player: { hand: [paidCostDiscover.id], energy: 4, deck: [v.vanilla1.id, v.vanilla2.id, v.vanilla2.id, v.vanilla3.id] }, enemy: { deck } },
      steps: (ids) => [playFromHand(ids, "player")],
      answers: (ids) => [2, [ids.player.deck[2]]],
    });
    expect(result.state.sides.player.currentEnergy).toBe(2);
    expect(result.state.sides.player.hand).toEqual([result.ids.player.deck[2]]);
    expect(result.state.sides.player.deck).toContain(result.ids.player.deck[1]);
    expect(result.events.filter((item) => item.kind === "cardDiscovered")).toEqual([{ kind: "cardDiscovered", side: "player", instance: result.ids.player.deck[2] }]);
  });

  it("counts candidate X as zero and reads copiable cost reductions", () => {
    const { state, ids } = boardState(bounded.catalog, {
      active: "player", phase: "day", player: { hand: [paidCostDiscover.id], energy: 1, deck: [DSL.variableSpark.id, v.vanilla2.id, v.vanilla3.id] }, enemy: { deck },
    });
    state.instances[ids.player.deck[1]] = { ...state.instances[ids.player.deck[1]], variant: { amplified: false, deckMods: { ...NO_DECK_MODS, costReduction: 2 } } };
    const source = new ScriptedSource([0, [ids.player.deck[1]]]);
    const after = bounded.apply(state, "player", playFromHand(ids, "player").action, source);
    source.assertExhausted();
    expect(after.state.sides.player.currentEnergy).toBe(1);
    expect(after.state.sides.player.hand).toEqual([ids.player.deck[1]]);
    expect(after.state.sides.player.deck).toContain(ids.player.deck[0]);
  });

  it("freely chooses zero, a cost above available energy, and a public no-match value without paying X", () => {
    for (const cost of [0, 5, bounded.catalog.maximumFixedCost + 1]) {
      const result = runScenario(bounded, {
        board: { active: "player", phase: "day", player: { hand: [freeCostDiscover.id], energy: 1, deck: [v.vanilla0.id, v.vanilla5.id, v.event1.id] }, enemy: { deck } },
        steps: (ids) => [playFromHand(ids, "player")], answers: () => [cost],
      });
      expect(result.state.sides.player.currentEnergy).toBe(0);
      expect(result.state.sides.player.hand).toEqual(cost === 0 ? [result.ids.player.deck[0]] : cost === 5 ? [result.ids.player.deck[1]] : []);
      if (cost > bounded.catalog.maximumFixedCost) {
        expect(result.state.sides.player.deck).toEqual(result.ids.player.deck);
        expect(result.state.rng["random:discover"]).toBeUndefined();
        expect(result.state.rng["shuffle:player"]).toEqual(result.start.rng["shuffle:player"]);
      }
    }
  });

  it("replays both resolving choices after reload, rejects invalid/stale/foreign input, and commits Discover atomically", () => {
    const records: EngineLogRecord[] = [];
    const fold = createFoldAdapter(bounded, { checkEventPrefix: true, log: (record) => records.push(record) });
    const { state, ids } = boardState(bounded.catalog, {
      active: "player", phase: "day", player: { hand: [freeCostDiscover.id], energy: 1, deck: [v.vanilla1.id, v.vanilla1.id] }, enemy: { deck },
    });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const waitingX = applied(fold.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action }));
    const fresh = createFoldAdapter(bounded, { checkEventPrefix: true, log: (record) => records.push(record) });
    const saved = JSON.parse(JSON.stringify(waitingX)) as BattleSlice;
    const xPrompt = fresh.pending(saved)!.prompt;
    expect(xPrompt).toMatchObject({ kind: "chooseNumber", min: 0, max: bounded.catalog.maximumFixedCost + 1, cancellable: false, purpose: { role: "chooseX" } });
    expect(xPrompt.id).toBe(fold.pending(waitingX)!.prompt.id);
    const answerX = { kind: "answer", side: "player", promptId: xPrompt.id, value: 1 } as const;
    expect(fresh.reduce(saved, { ...answerX, side: "enemy" })).toEqual({ kind: "bounced", reason: "notYourPrompt" });
    for (const value of [-1, bounded.catalog.maximumFixedCost + 2]) expect(fresh.reduce(saved, { ...answerX, value })).toEqual({ kind: "bounced", reason: "illegalAnswer" });
    const waitingCard = applied(fresh.reduce(saved, answerX));
    expect(waitingCard.committed.sides.player.deck).toEqual(ids.player.deck);
    expect(waitingCard.committed.sides.player.hand).toEqual([]);
    expect(waitingCard.committed.rng["random:discover"]).toBeUndefined();
    const savedCard = JSON.parse(JSON.stringify(waitingCard)) as BattleSlice;
    const prompt = fresh.pending(savedCard)!.prompt as ChooseCardsPrompt & { id: typeof xPrompt.id };
    expect(prompt.candidates).toEqual(expect.arrayContaining(ids.player.deck));
    expect(fresh.pending(savedCard)!.prompt.id).toBe(fold.pending(waitingCard)!.prompt.id);
    expect(fresh.reduce(savedCard, answerX)).toMatchObject({ kind: "bounced" });
    expect(fresh.reduce(savedCard, { kind: "battleAction", side: "enemy", action: { kind: "pass" } })).toMatchObject({ kind: "bounced" });
    const answerCard = { kind: "answer", side: "player", promptId: prompt.id, value: [prompt.candidates[0]] } as const;
    const outcome = fresh.reduce(savedCard, answerCard);
    const done = applied(outcome);
    expect(done.committed.sides.player.hand).toEqual(answerCard.value);
    expect(done.committed.sides.player.currentEnergy).toBe(0);
    if (outcome.kind !== "applied") throw new Error("bounced");
    expect(outcome.published.filter((item) => item.kind === "cardDiscovered")).toHaveLength(1);
    expect(fresh.reduce(done, answerCard)).toMatchObject({ kind: "bounced" });
    expect(records.some((record) => record.event === "engine.promptAnswered")).toBe(true);
  });

  it("commits no discovery, shuffle, or draw when resolution fails after both cost choices", () => {
    const fold = createFoldAdapter(bounded, { checkEventPrefix: true });
    const { state, ids } = boardState(bounded.catalog, { active: "player", phase: "day", player: { hand: [freeCostThenFail.id], energy: 1, deck: [v.vanilla1.id, v.vanilla1.id] }, enemy: { deck } });
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const waitingX = applied(fold.reduce(start, { kind: "battleAction", side: "player", action: playFromHand(ids, "player").action }));
    const waitingCard = applied(fold.reduce(waitingX, { kind: "answer", side: "player", promptId: fold.pending(waitingX)!.prompt.id, value: 1 }));
    const prompt = fold.pending(waitingCard)!.prompt as ChooseCardsPrompt;
    const pending = fold.pending(waitingCard)!;
    const outcome = fold.reduce(waitingCard, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [prompt.candidates[0]] });
    if (outcome.kind !== "applied" || outcome.error === null) throw new Error("expected a resolution failure");
    expect(outcome.published).toEqual([]);
    expect(stateHash(outcome.slice.committed)).toBe(stateHash(waitingCard.committed));
    expect(outcome.slice.committed.sides.player.deck).toEqual(ids.player.deck);
    expect(outcome.slice.committed.sides.player.hand).toEqual([]);
  });

  it("pays an exact effective-spark sacrifice, allows the source, and draws exactly two", () => {
    const fold = createFoldAdapter(bounded);
    const { state, ids } = boardState(bounded.catalog, { active: "player", phase: "day", player: { back: [exactSparkSacrifice.id, v.vanilla0.id, v.vanilla1.id, v.vanilla2.id], energy: 2, deck }, enemy: { back: [v.vanilla1.id], deck } });
    state.instances[ids.player.back[1]!].status.gainedSpark = 1;
    state.instances[ids.player.back[2]!].status.gainedSpark = 1;
    state.instances[ids.player.back[3]!].status.gainedSpark = -1;
    const start: BattleSlice = { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
    const waiting = applied(fold.reduce(start, { kind: "battleAction", side: "player", action: { kind: "activate", source: ids.player.back[0]!, ability: 0 } }));
    const pending = fold.pending(waiting)!;
    expect((pending.prompt as ChooseCardsPrompt).candidates).toEqual([ids.player.back[0], ids.player.back[1], ids.player.back[3]]);
    const done = applied(fold.reduce(waiting, { kind: "answer", side: "player", promptId: pending.prompt.id, value: [ids.player.back[0]!] }));
    expect(done.committed.instances[ids.player.back[0]!].zone).toBe("void");
    expect(done.committed.sides.player.currentEnergy).toBe(0);
    expect(done.committed.sides.player.hand).toEqual(ids.player.deck.slice(0, 2));
  });

  it("maps contextual zero-X authored metadata while retaining the default minimum", () => {
    const content: CardDefinition = {
      id: "5e5e5e5e-0000-4000-8000-0000000003ba", name: "Synthetic", mtgName: "", renderedText: "",
      energyCost: null, cardType: "Event", subtype: "", rarity: "Common", isFast: false, isInterrupt: false,
      spark: null, tags: [], imageNumber: 0, artOwned: false, cardNumber: 1, isStarter: false, pending: true,
    };
    expect(engineCardFromContent(content).costs).toEqual([energyX(1)]);
    expect(engineCardFromContent({ ...content, xMinimum: 0 }).costs).toEqual([energyX(0)]);
  });
});
