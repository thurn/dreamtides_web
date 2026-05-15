// Manifest contract test.
//
// Three tests:
//   1. Compile-time guarantee that `JourneyOption.locked` is a required
//      `boolean`. The lone variable assignment intentionally omits `locked`
//      and is annotated with `@ts-expect-error`; if a future refactor makes
//      the field optional, TypeScript no longer flags the omission, the
//      directive emits its "unused" error, and the test fails to compile.
//   2. Same compile-time guarantee for `JourneyTreeBranch.locked`.
//   3. Runtime guarantee that `makeUnlockedOption` and `makeUnlockedBranch`
//      default `locked` to `false` when omitted from the input. These are
//      the canonical construction points the CLI's option/branch assembly
//      uses; cost-rendering paths in later tasks pass `locked: true`
//      instead.
//
// Bug class guarded against: a future regression that drops the structural
// flag in favour of inferring locked-ness from the text prefix.

import { describe, expect, it } from "vitest";

import {
  type JourneyOption,
  type JourneyTreeBranch,
  makeUnlockedBranch,
  makeUnlockedOption,
} from "./manifest";

function baseOptionFields(): Omit<JourneyOption, "locked"> {
  return {
    number: 1,
    symbols: ["reward"],
    text: "Gain 1 essence.",
    operations: [],
    costs: [],
    effects: [],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: 0,
    effectConvertedEssence: 1,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: 1,
    pickBehavior: "record_and_generate_next",
  };
}

function baseBranchFields(): Omit<JourneyTreeBranch, "locked"> {
  return {
    id: "branch-1",
    label: "1",
    kind: "player_choice",
    text: "Take the offered reward.",
    operations: [],
    costs: [],
    effects: [],
    burdens: [],
    targets: [],
    triggers: [],
    routeEffects: [],
    costConvertedEssence: 0,
    effectConvertedEssence: 1,
    burdenConvertedEssence: 0,
    uncertaintyConvertedEssence: 0,
    netConvertedEssence: 1,
  };
}

describe("JourneyOption.locked", () => {
  it("is a required boolean field (compile-time check)", () => {
    // The assignment below intentionally omits `locked`. Because the field is
    // required, TypeScript flags it; the `@ts-expect-error` directive turns
    // that into a passing assertion. If a future refactor makes `locked`
    // optional, the directive emits its "unused" error and this test fails
    // to compile.
    // @ts-expect-error - JourneyOption.locked is required.
    const _missingLocked: JourneyOption = baseOptionFields();
    void _missingLocked;

    // Sanity: providing `locked` makes the same shape compile.
    const _withLocked: JourneyOption = { ...baseOptionFields(), locked: false };
    expect(_withLocked.locked).toBe(false);
  });

  it("defaults to false via makeUnlockedOption", () => {
    const option = makeUnlockedOption(baseOptionFields());
    expect(option.locked).toBe(false);
  });

  it("preserves an explicit true via makeUnlockedOption", () => {
    const option = makeUnlockedOption({ ...baseOptionFields(), locked: true });
    expect(option.locked).toBe(true);
  });
});

describe("JourneyTreeBranch.locked", () => {
  it("is a required boolean field (compile-time check)", () => {
    // @ts-expect-error - JourneyTreeBranch.locked is required.
    const _missingLocked: JourneyTreeBranch = baseBranchFields();
    void _missingLocked;

    const _withLocked: JourneyTreeBranch = { ...baseBranchFields(), locked: false };
    expect(_withLocked.locked).toBe(false);
  });

  it("defaults to false via makeUnlockedBranch", () => {
    const branch = makeUnlockedBranch(baseBranchFields());
    expect(branch.locked).toBe(false);
  });

  it("preserves an explicit true via makeUnlockedBranch", () => {
    const branch = makeUnlockedBranch({ ...baseBranchFields(), locked: true });
    expect(branch.locked).toBe(true);
  });
});
