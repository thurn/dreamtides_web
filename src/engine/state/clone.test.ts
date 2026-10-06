import { describe, expect, it } from "vitest";
import { createEngine } from "../engine";
import {
  fuzzEngineCatalog,
  fuzzInit,
  playRandomGame,
  SYNTHETIC_FUZZ_POOL,
} from "../testing/fuzz";
import { cloneState, copyJson } from "./clone";
import {
  canonicalHash,
  deserializeState,
  serializeState,
  stateHash,
} from "./hash";
import { battleSeed } from "./ids";
import type { BattleState } from "./types";

const engine = createEngine(fuzzEngineCatalog(SYNTHETIC_FUZZ_POOL));

/** Every committed state of a seeded Random-policy game. */
function committedStates(seed: string): BattleState[] {
  const states: BattleState[] = [];
  const game = playRandomGame(
    engine,
    fuzzInit(battleSeed(seed), SYNTHETIC_FUZZ_POOL),
    {
      observe: (state) => {
        states.push(state);
      },
    },
  );
  if (game.end !== "result")
    throw new Error(`${seed}: the game ended without a result`);
  return states;
}

const STATES = [...committedStates("clone-a"), ...committedStates("clone-b")];

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

describe("cloneState", () => {
  it("equals the JSON round trip of every committed state", () => {
    for (const state of STATES)
      expect(cloneState(state)).toStrictEqual(roundTrip(state));
  });

  it("shares no object or array with the source", () => {
    for (const state of STATES.filter((_, index) => index % 25 === 0)) {
      const source = containers(state);
      for (const copied of containers(cloneState(state)))
        expect(source.has(copied)).toBe(false);
    }
  });

  it("leaves the hashes of a state unchanged", () => {
    for (const state of STATES) {
      expect(stateHash(cloneState(state))).toBe(stateHash(state));
    }
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

describe("stateHash", () => {
  it("round-trips every committed state through serialization with an identical hash", () => {
    for (const state of STATES) {
      const copy = deserializeState(serializeState(state));
      expect(copy).toEqual(state);
      expect(stateHash(copy)).toBe(stateHash(state));
    }
  });

  it("hashes committed states equally whatever their key order", () => {
    for (const state of STATES.filter((_, index) => index % 25 === 0)) {
      const reordered = reversedKeys(state);
      expect(Object.keys(reordered.instances)).not.toEqual(
        Object.keys(state.instances),
      );
      expect(stateHash(reordered)).toBe(stateHash(state));
    }
  });

  it("changes when any leaf of a state changes", () => {
    const state =
      STATES.find((candidate) => candidate.stack.length > 0) ??
      STATES[STATES.length >> 1];
    if (state === undefined) throw new Error("no state");
    const hash = stateHash(state);
    const paths = leafPaths(state);
    expect(
      paths.some((path) => path[0] === "instances" && path.includes("status")),
    ).toBe(true);
    for (const path of paths)
      expect(stateHash(withLeafChanged(state, path)), path.join(".")).not.toBe(
        hash,
      );
  });

  it("gives distinct committed states distinct hashes", () => {
    const byHash = new Map<string, string>();
    for (const state of STATES) {
      const text = JSON.stringify(state);
      const hash = stateHash(state);
      expect(byHash.get(hash) ?? text).toBe(text);
      byHash.set(hash, text);
    }
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
