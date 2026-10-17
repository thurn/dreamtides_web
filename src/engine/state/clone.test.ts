import { describe, expect, it } from "vitest";
import { cloneState, copyJson } from "./clone";
import {
  canonicalHash,
  deserializeState,
  serializeState,
  stateHash,
} from "./hash";
import { battleSeed, parseFigmentId, type InstanceId } from "./ids";
import type { BattleState, CardInstance, Printing, SideState } from "./types";
import { parseCardId } from "../../types/card-identity";
import { parseAvatarId, parseDreamsignId, parseDreamwellCardId } from "../../types/identifiers";
import type { Variant } from "../dsl/types";
import type { LoopAction, LoopSignature } from "../loops/types";

const CARD = parseCardId("00000000-0000-4000-8000-000000000001");
const OTHER_CARD = parseCardId("00000000-0000-4000-8000-000000000002");
const FIGMENT = parseFigmentId("00000000-0000-4000-8000-000000000003");
const AVATAR = parseAvatarId("00000000-0000-4000-8000-000000000004");
const DREAMSIGN = parseDreamsignId("00000000-0000-4000-8000-000000000005");
const DREAMWELL = parseDreamwellCardId("00000000-0000-4000-8000-000000000006");

function emptySide(): SideState {
  return {
    score: 0, currentEnergy: 0, maxEnergy: 0, fatigueCount: 0,
    deck: [], hand: [], void: [], banished: [], backRank: [null],
    frontRank: [null], avatar: null, dreamsigns: [],
  };
}

/** Plain serialization shapes, independent of catalog data and game policies. */
function minimalState(): BattleState {
  return {
    version: 0,
    seed: battleSeed("structural-clone"),
    rng: {},
    nextInstance: 1,
    clock: 0,
    config: {
      scoreToWin: 9, turnLimit: null, handLimit: 3,
      openingHandSize: { player: 1, enemy: 2 }, startingSide: "player",
      skipFirstDraw: false, resolutionCap: 12, mandatoryLoopCheckFrom: 2,
      mandatoryLoopWindow: 4, loopIterationCap: 5, loopHistoryActions: 6,
      autoAnswerForcedPrompts: false, feasibilitySearchRuns: 7, discoverOptions: 2,
      dreamwell: { recurringOrders: [1, 2], cardsPerRecurringOrder: 1, minimumConstructedLength: 3 },
    },
    turn: {
      round: 1, turnNumber: 0, active: "player", phase: "dreamwell",
      sideTurns: { player: 0, enemy: 0 }, extra: false, lastNormal: "enemy",
      extraTurns: [], challengeLane: null, beginning: false,
    },
    sides: { player: emptySide(), enemy: emptySide() },
    instances: {},
    knownTo: { player: [], enemy: [] },
    stack: [],
    priority: null,
    payable: [],
    triggerQueue: [],
    floating: [],
    turnLog: { played: { player: [], enemy: [] }, drawn: { player: 0, enemy: 0 } },
    nextEffect: 1,
    oncePerTurn: [],
    dreamwell: { deck: [], next: 0, catalog: [] },
    challenge: null,
    automaticSteps: 0,
    automaticChoices: 0,
    loops: { scope: null, checkpoints: [], actions: [], candidate: null, run: null, nextLoop: 1, cycle: null },
    result: null,
  };
}

function instance(id: InstanceId, printing: Printing = { kind: "card", cardId: CARD }): CardInstance {
  return {
    id, printing, owner: "player", controller: "enemy", zone: "play",
    variant: { amplified: false }, enteredZoneAt: 1,
    status: {
      exhausted: false, gainedSpark: 0, counters: 0, created: false,
      reclaimed: false, playedViaReclaim: false, offering: false, ephemeral: false, x: null,
    },
  };
}

const MODIFIED: Variant = {
  amplified: true,
  transfigurations: ["Empowered", "Kindled"],
  deckMods: {
    sparkBonus: 2, costReduction: 1, fast: true, reclaim: 3,
    typeChange: { cardType: "character", subtype: "Mage" },
  },
  typeRemap: "Warrior",
};

/** A bounded snapshot of data shapes; it does not assert a legal game transition. */
function populatedState(): BattleState {
  const state = minimalState();
  const first: CardInstance = {
    ...instance("i1"), journeyDeck: true, variant: MODIFIED,
    poolCandidates: [CARD, OTHER_CARD, CARD],
    status: {
      exhausted: true, gainedSpark: 2, counters: 3, created: false,
      reclaimed: true, playedViaReclaim: true, playedViaAlternativeCost: true,
      offering: true, ephemeral: true, x: 4,
      gainedAbilities: [{ cardId: OTHER_CARD, variant: { amplified: true } }, { figment: FIGMENT }],
      lostAbilities: 1,
    },
  };
  const second: CardInstance = {
    ...instance("i2"), owner: "enemy", controller: "player", journeyDeck: false,
    variant: { amplified: true, transfigurationApplications: [{ form: "Kindled" }, { form: "Perfected", constituents: ["Kindled", "Empowered"] }] },
    status: { ...instance("i2").status, playedViaAlternativeCost: false },
  };
  state.instances = {
    i1: first, i2: second,
    i3: instance("i3", { kind: "figment", figment: FIGMENT, spark: 2 }),
    i4: instance("i4", { kind: "figmentCopy", cardId: CARD, spark: null }),
    i5: instance("i5", { kind: "figmentCopy", cardId: OTHER_CARD, spark: 0 }),
  };
  state.version = 3;
  state.rng = { draw: 2, choices: 1 };
  state.nextInstance = 6;
  state.clock = 8;
  state.turn = { ...state.turn, sideTurns: { player: 2, enemy: 1 }, extra: true, extraTurns: ["enemy", "player"], challengeLane: 0, beginning: true, endingCleanup: true };
  state.sides.player = {
    score: 3, currentEnergy: 2, maxEnergy: 4, fatigueCount: 1,
    deck: ["i1"], hand: ["i2"], void: ["i3"], banished: ["i4"],
    backRank: ["i2", null], frontRank: ["i5", null],
    avatar: { id: AVATAR, exhausted: true }, dreamsigns: [{ id: DREAMSIGN }],
  };
  state.sides.enemy = {
    score: 1, currentEnergy: 3, maxEnergy: 5, fatigueCount: 2,
    deck: ["i2"], hand: ["i1"], void: ["i4"], banished: ["i3"],
    backRank: [null, "i1"], frontRank: [null, "i3"],
    avatar: { id: AVATAR, exhausted: false }, dreamsigns: [{ id: DREAMSIGN }],
  };
  state.knownTo = { player: ["i1", "i2"], enemy: ["i3"] };
  state.rememberedCards = {
    player: [{ instance: "i1", owner: "player", journeyDeck: true, printing: first.printing, variant: MODIFIED, status: first.status,
      effects: [{ id: "e1", controller: "enemy", source: "i2", timestamp: 2, expiry: { at: "never" }, change: { kind: "spark", instance: "i1", amount: 1 } }] }],
    enemy: [{ instance: "i2", owner: "enemy", printing: second.printing, variant: second.variant, status: second.status, effects: [] }],
  };
  state.linkedBanished = [{ source: "i1", enteredPlayAt: 1, ability: 0, gainedFrom: "e1", cards: [{ instance: "i4", enteredBanishedAt: 2 }] }];
  state.stack = [
    { kind: "card", controller: "player", instance: "i1", x: 2, optionalPaid: [true, false], choices: [{ modes: [0], targets: [["i2"]] }], slot: { rank: "back", index: 0 }, playedFromVoid: true, materializesAwakened: true },
    { kind: "ability", controller: "enemy", source: { kind: "avatar", side: "enemy" }, ability: 1, origin: { kind: "avatar", id: AVATAR }, x: null, optionalPaid: [false], choices: { modes: [1], targets: [["i1", "i2"]], abandonedPosition: { side: "player", slot: { rank: "front", index: 0 } } }, paymentSourceCounters: 2, lastKnownSourceSpark: 3 },
  ];
  state.priority = "enemy";
  state.payable = [{ id: "e2", payer: "player", cost: 2, source: "i1", affects: ["i2"] }];
  state.triggerQueue = [{ source: "i2", controller: "player", origin: { kind: "card", cardId: CARD, variant: MODIFIED }, ability: 1, node: null, subject: "i1", subjectHiddenFrom: ["enemy"], gain: { amount: 2, expiry: { at: "endOfTurn" } }, captured: ["i3"] }];
  state.floating = [{ id: "e3", controller: "enemy", source: { kind: "dreamsign", side: "enemy", index: 0 }, timestamp: 4, expiry: { at: "paid", effect: "e2" }, change: { kind: "abilities", instance: "i2", cardId: OTHER_CARD, variant: MODIFIED }, sourceObservedBy: ["player"] }];
  state.turnLog = {
    played: { player: [{ instance: "i1", cardType: "character", subtype: "Mage", allTypes: false, speed: "fast", cost: 2, spark: 3, playedFromVoid: true, namedTriggers: ["dawn"], copiable: { printing: first.printing, variant: MODIFIED } }], enemy: [{ instance: "i2", cardType: "event", subtype: "", allTypes: false }] },
    drawn: { player: 2, enemy: 1 },
    discarded: { player: 1, enemy: 2 }, discardedCards: { player: ["i2"], enemy: ["i1", "i1"] },
    leftPlay: { player: [{ instance: "i1", cardType: "character" }], enemy: [] },
    dissolved: { player: [], enemy: [{ instance: "i2", cardType: "character" }] },
    abandoned: { player: [{ instance: "i3", cardType: "character" }], enemy: [] },
    dawnProgress: { total: 2, known: { player: 2, enemy: 1 } },
    firstOccurrences: { handEmptied: { player: true, enemy: false }, named: { player: ["dawn"], enemy: [] }, known: { player: { player: ["dawn"], enemy: [] }, enemy: { player: [], enemy: [] } } },
    materialized: { player: [{ instance: "i3", cardType: "character", subtype: "Ethereal", allTypes: false, figment: true }], enemy: [] },
  };
  state.firstEventHistory = { current: { player: { instance: "i1", printing: { kind: "card", cardId: CARD }, variant: MODIFIED }, enemy: null }, previous: null };
  state.characterScoring = { current: [{ instance: "i2", controller: "enemy" }], previous: null };
  state.nextEffect = 4;
  state.oncePerTurn = ["i1#0", "i2#1@3"];
  state.dreamwell = { deck: [DREAMWELL, DREAMWELL], next: 1, catalog: [DREAMWELL] };
  state.challenge = { challengers: ["i1"], blockers: { i1: "i2" }, unpairedBlockers: ["i3"], scoring: { scorers: [{ instance: "i1", controller: "player" }], settled: false } };
  state.automaticSteps = 2;
  state.automaticChoices = 1;
  const signature = canonicalHash<LoopSignature>({ checkpoint: 1 });
  const actions: LoopAction[] = [{ steps: [{ step: { kind: "advancePhase" }, answers: [], promptsVisibleToActor: [] }] }];
  state.loops = {
    scope: { turn: 1, phase: "day", side: "player" },
    checkpoints: [{ signature, resources: { player: { score: 1, currentEnergy: 2, maxEnergy: 3, deck: 4, counters: 5, gainedSpark: 6 }, enemy: { score: 6, currentEnergy: 5, maxEnergy: 4, deck: 3, counters: 2, gainedSpark: 1 } }, action: 1 }],
    actions, candidate: { id: "l1", side: "player", signature, actions },
    run: { loop: "l1", remaining: 2, iterations: 1 }, nextLoop: 2,
    cycle: { hash: stateHash(minimalState()), at: 1, window: 2 },
  };
  state.result = { kind: "victory", winner: "enemy", reason: "score" };
  return { ...state, draftPools: { player: [CARD, CARD], enemy: [OTHER_CARD] } };
}

/** Each entry differs from the ordinary legacy instance by one field only. */
function instanceBranches(): readonly { label: string; state: BattleState }[] {
  const base = instance("i1");
  const variants: readonly [string, CardInstance][] = [
    ["ordinary", base],
    ["figment", { ...base, printing: { kind: "figment", figment: FIGMENT, spark: 2 } }],
    ["figmentCopy null", { ...base, printing: { kind: "figmentCopy", cardId: CARD, spark: null } }],
    ["figmentCopy numeric", { ...base, printing: { kind: "figmentCopy", cardId: CARD, spark: 0 } }],
    ["journeyDeck false", { ...base, journeyDeck: false }],
    ["journeyDeck true", { ...base, journeyDeck: true }],
    ["poolCandidates empty", { ...base, poolCandidates: [] }],
    ["alternative cost false", { ...base, status: { ...base.status, playedViaAlternativeCost: false } }],
    ["alternative cost true", { ...base, status: { ...base.status, playedViaAlternativeCost: true } }],
    ["gained abilities empty", { ...base, status: { ...base.status, gainedAbilities: [] } }],
    ["lost abilities zero", { ...base, status: { ...base.status, lostAbilities: 0 } }],
    ["amplified", { ...base, variant: { amplified: true } }],
    ["transfigurations empty", { ...base, variant: { ...base.variant, transfigurations: [] } }],
    ["applications empty", { ...base, variant: { ...base.variant, transfigurationApplications: [] } }],
    ["deckMods", { ...base, variant: { ...base.variant, deckMods: { sparkBonus: 0, costReduction: 0, fast: false, reclaim: null, typeChange: null } } }],
    ["typeRemap", { ...base, variant: { ...base.variant, typeRemap: "Mage" } }],
  ];
  return variants.map(([label, card]) => ({ label, state: { ...minimalState(), instances: { i1: card } } }));
}

/** Isolated absent/present comparisons, including explicit empty legacy containers. */
function stateBranches(): readonly { label: string; state: BattleState }[] {
  const base = minimalState();
  return [
    { label: "draftPools empty", state: { ...base, draftPools: { player: [], enemy: [] } } },
    { label: "rememberedCards empty", state: { ...base, rememberedCards: { player: [], enemy: [] } } },
    { label: "linkedBanished empty", state: { ...base, linkedBanished: [] } },
    { label: "firstEventHistory unknown", state: { ...base, firstEventHistory: { current: null, previous: null } } },
    { label: "characterScoring unknown", state: { ...base, characterScoring: { current: null, previous: null } } },
    { label: "ending cleanup", state: { ...base, turn: { ...base.turn, endingCleanup: true } } },
    { label: "draw result", state: { ...base, result: { kind: "draw", reason: "turnLimit" } } },
  ];
}

function roundTrip<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** A deep copy whose objects list their keys in reverse insertion order. */
function reversedKeys<T>(value: T): T {
  if (Array.isArray(value)) return value.map(reversedKeys) as T;
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value)
      .reverse()
      .map(([key, entry]) => [key, reversedKeys(entry)]),
  ) as T;
}

/** Every object and array reachable from `value`. */
function containers(value: unknown, found = new Set<object>()): Set<object> {
  if (typeof value === "object" && value !== null) {
    found.add(value);
    for (const entry of Object.values(value)) containers(entry, found);
  }
  return found;
}

/** The path of every leaf (non-container value) in `value`. */
function leafPaths(
  value: unknown,
  path: readonly string[] = [],
  paths: string[][] = [],
): string[][] {
  if (typeof value === "object" && value !== null) {
    for (const [key, entry] of Object.entries(value))
      leafPaths(entry, [...path, key], paths);
  } else {
    paths.push([...path]);
  }
  return paths;
}

/** A copy of `state` with the leaf at `path` changed to a different value of its type. */
function withLeafChanged(
  state: BattleState,
  path: readonly string[],
): BattleState {
  const copy = roundTrip(state);
  let parent = copy as unknown as Record<string, unknown>;
  for (const key of path.slice(0, -1))
    parent = parent[key] as Record<string, unknown>;
  const last = path[path.length - 1] ?? "";
  const leaf = parent[last];
  parent[last] =
    typeof leaf === "number"
      ? leaf + 1
      : typeof leaf === "boolean"
        ? !leaf
        : typeof leaf === "string"
          ? `${leaf}x`
          : 0;
  return copy;
}

const INSTANCE_BRANCHES = instanceBranches();
const STATE_BRANCHES = stateBranches();
const POPULATED = populatedState();
const WITNESSES = [minimalState(), POPULATED, ...INSTANCE_BRANCHES.map(({ state }) => state), ...STATE_BRANCHES.map(({ state }) => state)];

describe("structural clone and hash contracts", () => {
  it("clones every distinct shape with JSON equality and no shared container", () => {
    for (const state of WITNESSES) {
      const copy = cloneState(state);
      expect(copy).toStrictEqual(roundTrip(state));
      const source = containers(state);
      for (const copied of containers(copy)) expect(source.has(copied)).toBe(false);
      expect(stateHash(copy)).toBe(stateHash(state));
    }
  });

  it("keeps source data unchanged after nested clone mutations", () => {
    for (const state of WITNESSES) {
      const before = serializeState(state);
      const copy = cloneState(state);
      copy.turn.sideTurns.player += 1;
      copy.sides.player.frontRank.push("i99");
      if (copy.instances.i1 !== undefined) copy.instances.i1.status.gainedSpark += 1;
      expect(serializeState(copy)).not.toBe(before);
      expect(serializeState(state)).toBe(before);
    }
  });

  it("preserves data and hashes through serialization and reversed object keys", () => {
    for (const state of WITNESSES) {
      const restored = deserializeState(serializeState(state));
      expect(restored).toStrictEqual(state);
      expect(stateHash(restored)).toBe(stateHash(state));
      const reordered = reversedKeys(state);
      expect(Object.keys(reordered)).toEqual(Object.keys(state).reverse());
      if (Object.keys(state.instances).length > 1)
        expect(Object.keys(reordered.instances)).toEqual(Object.keys(state.instances).reverse());
      expect(stateHash(reordered)).toBe(stateHash(state));
    }
  });

  it("changes for every leaf of the populated snapshot and each instance branch", () => {
    const cases = [
      { label: "populated", state: POPULATED, paths: leafPaths(POPULATED) },
      ...INSTANCE_BRANCHES.map(({ label, state }) => ({ label, state, paths: leafPaths(state.instances.i1, ["instances", "i1"]) })),
    ];
    for (const { label, state, paths } of cases) {
      const hash = stateHash(state);
      expect(paths.length).toBeGreaterThan(0);
      for (const path of paths)
        expect(stateHash(withLeafChanged(state, path)), `${label}: ${path.join(".")}`).not.toBe(hash);
    }
  });

  it("distinguishes the explicit printing and optional-presence witnesses", () => {
    // The ordinary instance and each branch differ by just one field.
    // This includes absent versus false, zero, or an empty array.
    const instanceHashes = INSTANCE_BRANCHES.map(({ state }) => stateHash(state));
    expect(new Set(instanceHashes).size).toBe(INSTANCE_BRANCHES.length);
    const stateHashes = [stateHash(minimalState()), ...STATE_BRANCHES.map(({ state }) => stateHash(state))];
    expect(new Set(stateHashes).size).toBe(STATE_BRANCHES.length + 1);
  });
});

describe("copyJson", () => {
  it("copies with JSON semantics", () => {
    const value = {
      a: 1,
      skipped: undefined,
      run: () => 1,
      list: [undefined, Number.NaN, Infinity, -0, "s", null],
      nested: { b: [true] },
    };
    const copy = copyJson(value);
    expect(copy).toStrictEqual(roundTrip(value));
    expect(Object.is(copy.list[3], 0)).toBe(true);
    expect(copy.nested).not.toBe(value.nested);
    expect(copy.nested.b).not.toBe(value.nested.b);
  });
});

describe("canonicalHash", () => {
  it("hashes values equal as data equally, with JSON semantics", () => {
    expect(canonicalHash({ a: 1, b: [2, 3] })).toBe(
      canonicalHash({ b: [2, 3], a: 1 }),
    );
    expect(canonicalHash({ a: 1, b: undefined, c: () => 1 })).toBe(
      canonicalHash({ a: 1 }),
    );
    expect(canonicalHash([undefined, Number.NaN, Infinity])).toBe(
      canonicalHash([null, null, null]),
    );
    expect(canonicalHash(-0)).toBe(canonicalHash(0));
    expect(canonicalHash(0.5)).toBe(canonicalHash(roundTrip(0.5)));
  });

  it("tells apart values that differ as data", () => {
    const values: unknown[] = [
      "1",
      1,
      1.5,
      true,
      false,
      null,
      [],
      {},
      [1, 2],
      [2, 1],
      { a: 1, b: 2 },
      { a: 2, b: 1 },
      { a: [] },
      { b: [] },
      [[]],
      [{}],
    ];
    expect(new Set(values.map((value) => canonicalHash(value))).size).toBe(
      values.length,
    );
  });
});
