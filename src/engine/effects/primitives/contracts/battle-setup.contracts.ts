import { describe, expect, it } from "vitest";
import { createCatalog, type EngineCardDefinition } from "../../../catalog";
import { createEngine } from "../../../engine";
import { createFoldAdapter, type BattleSlice } from "../../../fold/slice";
import { battleSeed, SIDES, type InstanceId, type Side } from "../../../state/ids";
import { deserializeState, serializeState, stateHash } from "../../../state/hash";
import type { BattleInit, BattleSetup, BattleState, VictorySides } from "../../../state/types";
import { NO_PROMPTS } from "../../../steps/sources";
import { SYNTHETIC, syntheticId } from "../../../testing/synthetic-cards";
import { energy, event, noCardsIn, winCondition } from "../../../dsl/builders";
import { atStartOfFirstTurn, onDawn, onMaterialized, triggered } from "../../../dsl/triggers";
import { gainPoints, winTheGame } from "../../primitives";
import { battleDecklists } from "../../../policy/decide";
import { catalogManifest } from "../../../policy/catalog-manifest";
import { parseAvatarId, parseDreamsignId, parseDreamwellCardId } from "../../../../types/identifiers";
import { parseJourneyBattleFoldState } from "../../../../rules/battle/fold";

const character = SYNTHETIC.vanilla1;
const other = { ...character, id: syntheticId(0xba71), costs: [energy(2)] };
const instantWin: EngineCardDefinition = {
  ...character, id: syntheticId(0xba72), cardType: "event", spark: null, costs: [], status: "authored",
  abilities: () => [event(winTheGame())],
};
const staticWin = { ...character, id: syntheticId(0xba73), status: "authored" as const, abilities: () => [winCondition(noCardsIn("deck"))] };
const dawnCard = {
  ...character, id: syntheticId(0xba74), status: "authored" as const,
  abilities: () => [triggered(onDawn(), gainPoints(1)), triggered(onMaterialized(), gainPoints(10)), triggered(atStartOfFirstTurn(), gainPoints(10))],
};
const avatar = { id: parseAvatarId("5e5e5e5e-0000-4000-8000-00000000ba75"), status: "authored" as const, abilities: () => [triggered(onDawn(), gainPoints(1))] };
const sign = { id: parseDreamsignId("5e5e5e5e-0000-4000-8000-00000000ba76"), status: "authored" as const, abilities: () => [triggered(onDawn(), gainPoints(1))] };
const well = { id: parseDreamwellCardId("5e5e5e5e-0000-4000-8000-00000000ba77"), order: 1, energyAdded: 1, status: "vanilla" as const, abilities: () => [] };
const engine = createEngine(createCatalog([character, other, instantWin, staticWin, dawnCard], [well], { avatars: [avatar], dreamsigns: [sign] }));

function setup(): BattleSetup {
  return {
    placements: [
      { side: "player", deckIndex: 0, zone: "hand" },
      { side: "player", deckIndex: 2, zone: "play", slot: { rank: "front", index: 4 } },
      { side: "enemy", deckIndex: 0, zone: "void" },
      { side: "enemy", deckIndex: 1, zone: "play", slot: { rank: "back", index: 5 }, exhausted: true },
    ],
    sides: { player: { currentEnergy: 7, maxEnergy: 5, score: 0 }, enemy: { currentEnergy: 0, maxEnergy: 5, score: 2 } },
    turn: { active: "player", phase: "dawn", round: 4, turnNumber: 7, sideTurns: { player: 4, enemy: 3 }, lastNormal: "player" },
    dreamwell: { deck: [well.id, well.id, well.id], next: 2 },
  };
}

function init(): BattleInit {
  const deck = [character, other, character, other, character, other].map(({ id }) => ({ cardId: id }));
  return { seed: battleSeed("declared-contract"), scoreToWin: 20, startingSide: "player", decks: { player: deck, enemy: deck }, dreamwell: [well.id], setup: setup() };
}

function pass(state: BattleState): BattleState {
  const decision = engine.decision(state);
  if (decision === null) throw new Error("Expected a public decision");
  return engine.apply(state, decision.side, { kind: "pass" }, NO_PROMPTS).state;
}

function saved(input: BattleInit, slice: BattleSlice): Record<string, unknown> {
  return {
    mode: { kind: "journey" },
    init: {
      battleId: "battle-1", siteId: "site-1", nodeId: null, completionLevelAtStart: 0, essenceReward: 0, opponentAbilityActive: false,
      enemyDescriptor: { id: "opponent-1", name: "", subtitle: "", portraitSeed: 0, abilityText: "", dreamsigns: [], signatureCards: [] },
      avatarSummary: null, cardDefinitions: [],
    },
    engine: { init: input, slice },
  };
}

function slice(state: BattleState): BattleSlice {
  return { committed: state, inFlight: null, publishedEvents: 0, attempt: 0 };
}

function expectDeclarationRefused(input: BattleInit, state: BattleState): void {
  const before = structuredClone(input);
  let observations = 0;
  expect(() => engine.createBattle(input, NO_PROMPTS, () => { observations++; })).toThrow();
  expect(observations).toBe(0);
  expect(input).toStrictEqual(before);
  const save = saved(input, slice(state));
  const savedBefore = structuredClone(save);
  expect(parseJourneyBattleFoldState(save)).toBeNull();
  expect(save).toStrictEqual(savedBefore);
}

describe("declared public battle setup", () => {
  it("enters Draw with a real ordered draw and preserves the first-turn skip", () => {
    const input = init();
    const declared = { ...setup(), turn: { ...setup().turn, phase: "draw" as const } };
    const observed: { phase: string; hand: readonly InstanceId[] }[] = [];
    const drawn = engine.createBattle({ ...input, setup: declared }, NO_PROMPTS, (state) => {
      observed.push({ phase: state.turn.phase, hand: [...state.sides.player.hand] });
    });
    expect(drawn.events.filter(({ kind }) => kind === "cardDrawn")).toMatchObject([{ side: "player", instance: "i2" }]);
    expect(observed[0]).toEqual({ phase: "draw", hand: ["i1", "i2"] });
    expect(drawn.state.sides.player.deck).toEqual(["i4", "i5", "i6"]);
    const first = { ...declared, turn: { ...declared.turn, round: 1, turnNumber: 1, sideTurns: { player: 1, enemy: 0 } } };
    const skipped = engine.createBattle({ ...input, setup: first }, NO_PROMPTS);
    expect(skipped.events.some(({ kind }) => kind === "cardDrawn")).toBe(!skipped.state.config.skipFirstDraw);
    expect(skipped.state.sides.player.hand).toEqual(skipped.state.config.skipFirstDraw ? ["i1"] : ["i1", "i2"]);
  });

  it("allocates distinct physical copies, rank holes/readiness, full recipes and ordered remaining decks", () => {
    const input = init();
    const { state, events } = engine.createBattle(input, NO_PROMPTS);
    const player = state.sides.player;
    expect(player.hand).toEqual(["i1"]);
    expect(player.deck).toEqual(["i2", "i4", "i5", "i6"]);
    expect(player.frontRank).toEqual([null, null, null, null, "i3", null, null, null, null]);
    expect(state.sides.enemy.void).toEqual(["i7"]);
    expect(state.sides.enemy.backRank[5]).toBe("i8");
    expect(state.instances.i3?.status).toMatchObject({ exhausted: false, created: false });
    expect(state.instances.i8?.status).toMatchObject({ exhausted: true, created: false });
    expect(state.instances.i1?.printing).toEqual(state.instances.i3?.printing);
    expect(state.turn).toMatchObject({ ...input.setup!.turn, phase: "day" });
    expect(player).toMatchObject(input.setup!.sides.player);
    expect(state.dreamwell).toEqual({ ...input.setup!.dreamwell, catalog: [well.id] });
    expect(state.rng).toEqual({});
    expect(events.map(({ kind }) => kind)).toEqual(["phaseChanged", "phaseChanged"]);
    expect(engine.view(state, "player").sides.player.hand.count).toBe(1);
    expect(battleDecklists(input).player).toEqual(input.decks.player);
    expect(catalogManifest(engine.catalog, input).cards.map(({ id }) => id)).toEqual([character.id, other.id]);
  });

  it("plays and repositions declared copies through normal actions, then draws in declared order", () => {
    let state = engine.createBattle(init(), NO_PROMPTS).state;
    state = engine.apply(state, "player", { kind: "reposition", card: "i3", to: { rank: "back", index: 4 } }, NO_PROMPTS).state;
    expect(state.sides.player.backRank[4]).toBe("i3");
    state = engine.apply(state, "player", { kind: "play", card: "i1", from: "hand", slot: { rank: "back", index: 0 } }, NO_PROMPTS).state;
    expect(state.sides.player.backRank[0]).toBe("i1");
    expect(state.sides.player.currentEnergy).toBe(6);
    for (let count = 0; count < 3; count++) state = pass(state);
    expect(state.turn.active).toBe("enemy");
    expect(state.sides.enemy.hand).toEqual(["i9"]);
    expect(state.dreamwell.next).toBe(3);
  });

  it("enters Dawn with ordinary card/emblem triggers and without fabricated arrival or first-turn triggers", () => {
    const input = init();
    const created = engine.createBattle({ ...input, avatars: { player: avatar.id }, dreamsigns: { player: [sign.id] },
      decks: { ...input.decks, player: [{ cardId: dawnCard.id }] }, setup: { ...setup(), placements: [{ side: "player", deckIndex: 0, zone: "play", slot: { rank: "back", index: 0 } }] } }, NO_PROMPTS);
    expect(created.state.sides.player.score).toBe(3);
    expect(created.events.filter(({ kind }) => kind === "triggerResolved")).toHaveLength(3);
    const day = engine.createBattle({ ...input, avatars: { player: avatar.id }, setup: { ...setup(), turn: { ...setup().turn, phase: "day" } } }, NO_PROMPTS);
    expect(day.state.sides.player.score).toBe(0);
    expect(day.events.map(({ kind }) => kind)).toEqual(["phaseChanged"]);
  });

  it("keeps cost discounts and accepts undefined per-side next-battle effects", () => {
    const effects = { openingHand: [], startingEnergy: 0, smallerHandAndCostDiscount: [{ openingHandDelta: 0, costReduction: 1 }] };
    const input = { ...init(), nextBattle: { player: effects } };
    const state = engine.createBattle(input, NO_PROMPTS).state;
    expect(engine.view(state, "player").instances.i1?.characteristics.cost).toBe(0);
    expect(battleDecklists(input).player).toHaveLength(input.decks.player.length);
    expect(battleDecklists(input).player.every((entry) => entry.deckMods?.costReduction === 1)).toBe(true);
    const declarations: readonly (readonly [NonNullable<BattleInit["nextBattle"]>, NonNullable<BattleInit["nextBattle"]>])[] = [
      [{ player: undefined }, {}],
      [{ enemy: undefined }, {}],
      [{ player: undefined, enemy: undefined }, {}],
      [{ player: undefined, enemy: effects }, { enemy: effects }],
      [{ player: effects, enemy: undefined }, { player: effects }],
    ];
    for (const [nextBattle, equivalent] of declarations) {
      const declared = { ...init(), nextBattle };
      const before = structuredClone(declared);
      const actual = engine.createBattle(declared, NO_PROMPTS).state;
      const expected = engine.createBattle({ ...init(), nextBattle: equivalent }, NO_PROMPTS).state;
      expect(serializeState(actual)).toBe(serializeState(expected));
      expect(stateHash(actual)).toBe(stateHash(expected));
      expect(declared).toStrictEqual(before);
      expect(parseJourneyBattleFoldState(saved(declared, slice(actual)))).not.toBeNull();
    }
  });

  it("rejects malformed declarations atomically before any observer sees state", () => {
    const changes: ((value: BattleInit) => void)[] = [
      (value) => Reflect.set(value.setup!, "placements", [setup().placements[0], setup().placements[0]]),
      (value) => Reflect.set(value.setup!, "placements", [{ side: "player", deckIndex: 99, zone: "hand" }]),
      (value) => Reflect.set(value.setup!, "placements", [{ side: "player", deckIndex: -1, zone: "hand" }]),
      (value) => Reflect.set(value.setup!, "placements", [{ side: "neutral", deckIndex: 0, zone: "hand" }]),
      (value) => Reflect.set(value.setup!, "placements", [{ side: "player", deckIndex: 0, zone: "stack" }]),
      (value) => Reflect.set(value.setup!, "placements", [{ side: "player", deckIndex: 0, zone: "hand", exhausted: true }]),
      (value) => Reflect.set(value.setup!, "placements", [{ side: "player", deckIndex: 0, zone: "play", slot: { rank: "front", index: 9 } }]),
      (value) => Reflect.set(value.setup!, "placements", [0, 1].map((deckIndex) => ({ side: "player", deckIndex, zone: "play", slot: { rank: "back", index: 0 } }))),
      (value) => Reflect.set(value.setup!.turn, "phase", "night"),
      (value) => Reflect.set(value.setup!.turn, "sideTurns", { player: 3, enemy: 3 }),
      (value) => Reflect.set(value.setup!.turn, "active", "enemy"),
      (value) => Reflect.set(value, "turnLimit", 3),
      (value) => Reflect.set(value.setup!.sides.player, "currentEnergy", -1),
      (value) => Reflect.set(value.setup!.sides.enemy, "maxEnergy", Number.NaN),
      (value) => Reflect.set(value.setup!.sides.player, "extra", 1),
      (value) => Reflect.set(value.setup!.dreamwell, "next", 4),
      (value) => Reflect.set(value.setup!.dreamwell, "deck", [parseDreamwellCardId("5e5e5e5e-0000-4000-8000-00000000ffff")]),
      (value) => Reflect.set(value.decks.player[0], "amplified", "yes"),
      (value) => Reflect.set(value.decks.player[0], "transfigurations", ["unknown"]),
      (value) => Reflect.set(value.decks.player[0], "transfigurations", [["Amplified"]]),
      (value) => Reflect.set(value.decks.player[0], "deckMods", { costReduction: 1 }),
      (value) => Reflect.set(value, "dreamwell", [well.id, well.id]),
      (value) => Reflect.set(value.setup!, "placements", Array(1)),
      (value) => Reflect.set(value.setup!, "placements", [null]),
      (value) => Reflect.set(value.setup!.turn, "sideTurns", { player: 4, enemy: 3, extra: 0 }),
      (value) => Reflect.set(value.setup!.turn, "lastNormal", "enemy"),
      (value) => Reflect.set(value.setup!.turn, "round", 3),
      (value) => Reflect.set(value.setup!.turn, "turnNumber", 0),
      (value) => Reflect.set(value.setup!.sides.player, "score", Number.POSITIVE_INFINITY),
      ...[
        { openingHand: [], startingEnergy: 1, smallerHandAndCostDiscount: [] },
        { openingHand: [{ count: 1, filter: null }], startingEnergy: 0, smallerHandAndCostDiscount: [] },
        { openingHand: [], startingEnergy: 0, smallerHandAndCostDiscount: [{ openingHandDelta: -1, costReduction: 1 }] },
        { openingHand: [], startingEnergy: 0, smallerHandAndCostDiscount: [{ openingHandDelta: 0, costReduction: Number.NaN }] },
      ].map((effects) => (value: BattleInit) => Reflect.set(value, "nextBattle", { player: effects })),
    ];
    const state = engine.createBattle(init(), NO_PROMPTS).state;
    for (const change of changes) {
      const input = structuredClone(init());
      change(input);
      expectDeclarationRefused(input, state);
    }
  });

  it("resolves catalog availability and effective types only during atomic initialization", () => {
    const missingWell = parseDreamwellCardId("5e5e5e5e-0000-4000-8000-00000000ffff");
    for (const input of [
      { ...init(), avatars: { player: parseAvatarId("5e5e5e5e-0000-4000-8000-00000000ffff") } },
      { ...init(), dreamsigns: { player: [parseDreamsignId("5e5e5e5e-0000-4000-8000-00000000ffff")] } },
      { ...init(), dreamwell: [missingWell], setup: { ...setup(), dreamwell: { deck: [missingWell], next: 0 } } },
      { ...init(), decks: { ...init().decks, player: [{ cardId: syntheticId(0xffff) }, { cardId: other.id }, { cardId: character.id }] } },
      { ...init(), decks: { ...init().decks, player: [{ cardId: instantWin.id }, { cardId: other.id }, { cardId: instantWin.id }] } },
    ]) {
      const before = structuredClone(input);
      let observations = 0;
      expect(() => engine.createBattle(input, NO_PROMPTS, () => { observations++; })).toThrow();
      expect(observations).toBe(0);
      expect(input).toStrictEqual(before);
      const state = engine.createBattle(init(), NO_PROMPTS).state;
      expect(parseJourneyBattleFoldState(saved(input, slice(state)))).not.toBeNull();
    }
  });

  it("validates play against the effective deck-entry type", () => {
    const input = init();
    const mods = { sparkBonus: 0, costReduction: 0, fast: false, reclaim: null, typeChange: { cardType: "character" as const, subtype: character.subtype } };
    const prepared = { ...input, decks: { ...input.decks, player: [{ cardId: instantWin.id, deckMods: mods }] },
      setup: { ...setup(), placements: [{ side: "player" as const, deckIndex: 0, zone: "play" as const, slot: { rank: "back" as const, index: 0 } }] } };
    expect(engine.createBattle(prepared, NO_PROMPTS).state.instances.i1?.zone).toBe("play");
    const converted = { ...prepared, decks: { ...prepared.decks, player: [{ cardId: character.id, deckMods: { ...mods, typeChange: { ...mods.typeChange, cardType: "event" as const } } }] } };
    expect(() => engine.createBattle(converted, NO_PROMPTS)).toThrow();
  });
});

describe("declared result options", () => {
  it("rejects every eligible-side slot at initialization and saved-load boundaries", () => {
    const state = engine.createBattle(init(), NO_PROMPTS).state;
    for (const options of [
      ...[Array<Side>(1), Array<Side>(2), Object.assign(Array<Side>(2), { 0: "player" }), [undefined], [null], [["player"]], [], ["player", "player"], ["neutral"], ["player", "enemy", "player"]].map((victorySides) => ({ victorySides })),
      ...[0, -1, 1.5, Number.NaN, "none"].map((turnLimit) => ({ turnLimit })),
    ]) {
      const input = init();
      Object.assign(input, options);
      expectDeclarationRefused(input, state);
      const malformed = structuredClone(state);
      Object.assign(malformed.config, options);
      expect.soft(parseJourneyBattleFoldState(saved(init(), slice(malformed)))).toBeNull();
    }
  });

  it("uses eligible sides as a set and preserves simultaneous-score draw priority", () => {
    const input = init();
    const scored = { ...setup(), sides: { player: { currentEnergy: 0, maxEnergy: 0, score: 20 }, enemy: { currentEnergy: 0, maxEnergy: 0, score: 20 } } };
    expect(engine.createBattle({ ...input, setup: scored }, NO_PROMPTS).state.result).toEqual({ kind: "draw", reason: "score" });
    expect(engine.createBattle({ ...input, setup: scored, victorySides: ["enemy", "player"] }, NO_PROMPTS).state.result).toEqual({ kind: "draw", reason: "score" });
    expect(engine.createBattle({ ...input, setup: scored, victorySides: ["player"] }, NO_PROMPTS).state.result).toEqual({ kind: "victory", winner: "player", reason: "score" });
    expect(engine.createBattle({ ...input, setup: { ...scored, sides: { ...scored.sides, player: { ...scored.sides.player, score: 0 } } }, victorySides: ["player"] }, NO_PROMPTS).state.result).toBeNull();
  });

  it("applies eligibility to static and resolved win conditions for either active side", () => {
    for (const side of SIDES) {
      const input = init();
      const declared = { ...setup(), placements: [{ side, deckIndex: 0, zone: "play" as const, slot: { rank: "back" as const, index: 0 } }] };
      const staticInit = { ...input, decks: { ...input.decks, [side]: [{ cardId: staticWin.id }] }, setup: declared };
      expect(engine.createBattle({ ...staticInit, victorySides: [side] }, NO_PROMPTS).state.result).toEqual({ kind: "victory", winner: side, reason: "winCondition" });
      const eligible: Side = side === "player" ? "enemy" : "player";
      expect(engine.createBattle({ ...staticInit, victorySides: [eligible] }, NO_PROMPTS).state.result).toBeNull();
      const number = side === "player" ? 7 : 8;
      const hand = { ...declared, placements: [{ side, deckIndex: 0, zone: "hand" as const }],
        turn: { ...setup().turn, active: side, lastNormal: side, turnNumber: number, sideTurns: { player: 4, enemy: side === "enemy" ? 4 : 3 } } };
      for (const victorySides of [[side], [eligible]] satisfies readonly VictorySides[]) {
        const created = engine.createBattle({ ...input, decks: { ...input.decks, [side]: [{ cardId: instantWin.id }] }, setup: hand, victorySides }, NO_PROMPTS).state;
        const card = created.sides[side].hand[0];
        if (card === undefined) throw new Error("Expected declared win card");
        const won = engine.apply(created, side, { kind: "play", card, from: "hand" }, NO_PROMPTS).state;
        expect(won.result).toEqual(victorySides[0] === side ? { kind: "victory", winner: side, reason: "winCondition" } : null);
      }
    }
  });

  it("ends at a configured round boundary and permits the next round when disabled", () => {
    for (const turnLimit of [4, null]) {
      let state = engine.createBattle({ ...init(), setup: { ...setup(), placements: [] }, turnLimit }, NO_PROMPTS).state;
      for (let count = 0; count < 6; count++) state = pass(state);
      expect(state.result).toEqual(turnLimit === null ? null : { kind: "draw", reason: "turnLimit" });
      expect(state.turn.round).toBe(turnLimit === null ? 5 : 4);
    }
  });

});

describe("declared setup persistence", () => {
  it("preserves all four eligible-side declarations and omission through load and continuation", () => {
    const variants: readonly (VictorySides | undefined)[] = [undefined, ["player"], ["enemy"], ["player", "enemy"], ["enemy", "player"]];
    const hashes = new Set<string>();
    for (const victorySides of variants) {
      const input = { ...init(), ...(victorySides === undefined ? {} : { victorySides }) };
      const before = structuredClone(input);
      const state = engine.createBattle(input, NO_PROMPTS).state;
      expect(input).toStrictEqual(before);
      expect(state.config.victorySides).toEqual(victorySides);
      if (victorySides === undefined) expect(state.config).not.toHaveProperty("victorySides");
      else expect(state.config.victorySides).not.toBe(victorySides);
      const beforeHash = stateHash(state);
      const bytes = serializeState(state);
      hashes.add(stateHash(state));
      const reloaded = deserializeState(bytes);
      expect(serializeState(reloaded)).toBe(bytes);
      expect(stateHash(reloaded)).toBe(stateHash(state));
      const loaded = parseJourneyBattleFoldState(saved(input, slice(reloaded)));
      expect(loaded).not.toBeNull();
      const continued = createFoldAdapter(engine).reduce(loaded!.engine.slice, { kind: "battleAction", side: "player", action: { kind: "pass" } });
      if (continued.kind !== "applied") throw new Error("Expected applied pass");
      expect(continued.slice.committed.config.victorySides).toEqual(victorySides);
      if (victorySides !== undefined) expect(continued.slice.committed.config.victorySides).not.toBe(state.config.victorySides);
      expect(stateHash(state)).toBe(beforeHash);
      expect(stateHash(continued.slice.committed)).toBe(stateHash(pass(state)));
    }
    expect(hashes.size).toBe(variants.length);
  });

  it("accepts ordinary old save fields and keeps absent result options absent", () => {
    const { setup: _setup, ...ordinary } = init();
    const state = engine.createBattle(ordinary, NO_PROMPTS).state;
    expect(state.config).not.toHaveProperty("victorySides");
    expect(serializeState(state)).toBe(serializeState(engine.createBattle({ ...ordinary, setup: undefined, victorySides: undefined, turnLimit: undefined }, NO_PROMPTS).state));
    expect(stateHash(deserializeState(serializeState(state)))).toBe(stateHash(state));
    expect(parseJourneyBattleFoldState(saved(ordinary, slice(state)))).not.toBeNull();
  });

  it("accepts supported pending prepared steps and refuses unsupported phase entry", () => {
    const input = { ...init(), victorySides: ["player"] as const, turnLimit: null };
    const state = engine.createBattle(input, NO_PROMPTS).state;
    const pending = { ...slice(state), inFlight: { step: { kind: "beginBattle" as const, dreamwell: [well.id], preparedPhase: "dawn" as const }, automatic: true, answers: [] } };
    expect(parseJourneyBattleFoldState(saved(input, pending))).not.toBeNull();
    Reflect.set(pending.inFlight.step, "preparedPhase", "ending");
    expect(parseJourneyBattleFoldState(saved(input, pending))).toBeNull();
  });
});
