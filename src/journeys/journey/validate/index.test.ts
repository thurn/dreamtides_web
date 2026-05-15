// Validator contract tests.
//
// Per the port plan: positive-and-negative tests for the three most
// contract-heavy validators only. One per rule is overkill at this layer;
// the goal is to pin the bug class "a malformed manifest slips past
// validation".
//
//   1. Tree (`decision_tree_invariants`) — `validateTree`
//   2. References (`unresolved_target_selector`) — `validateRequiredTargets`
//   3. Topology (`invalid_option`) — `validateRootOptions`
//
// Each block constructs a minimal valid manifest via `makeUnlockedOption` /
// `makeUnlockedBranch`, exercises the validator with both a well-formed and
// a malformed shape, and asserts the negative case pins the expected
// `ruleId`.

import { describe, expect, it } from "vitest";

import {
  makeUnlockedBranch,
  makeUnlockedOption,
  type JourneyManifest,
  type JourneyOption,
  type JourneyTreeBranch,
} from "../manifest";
import {
  validateRequiredTargets,
  validateRootOptions,
  validateTree,
} from "./index";

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

function baseBranchFields(id: string, label: string): Omit<JourneyTreeBranch, "locked"> {
  return {
    id,
    label,
    kind: "player_choice",
    text: `Take ${label}.`,
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

// Build a manifest hull sufficient for the validators under test. The fields
// these tests don't read (versions block, debug payload, sequence menus,
// etc.) get cast-through-`as` to avoid bringing the entire generation
// pipeline into the test surface.
function manifestWithOptions(options: JourneyOption[]): JourneyManifest {
  return {
    options,
    precommitted: {},
    generatedObjects: [],
  } as unknown as JourneyManifest;
}

function manifestWithTree(tree: JourneyManifest["tree"]): JourneyManifest {
  return {
    options: [],
    precommitted: {},
    generatedObjects: [],
    tree,
  } as unknown as JourneyManifest;
}

describe("validateTree (decision_tree_invariants)", () => {
  it("passes a well-formed tree with two reachable branches", () => {
    const branch = makeUnlockedBranch({
      ...baseBranchFields("b1", "Leave"),
      terminal: {
        text: "Leave with nothing.",
        outcome: "leave",
        operations: [],
        costs: [],
        effects: [],
        burdens: [],
        targets: [],
        routeEffects: [],
      },
    });
    const branchTransition = makeUnlockedBranch({
      ...baseBranchFields("b2", "Attempt"),
      nextNodeId: "n2",
    });
    const tail = makeUnlockedBranch({
      ...baseBranchFields("b3", "Claim"),
      terminal: {
        text: "Claim the reward.",
        outcome: "claim",
        operations: [],
        costs: [],
        effects: [],
        burdens: [],
        targets: [],
        routeEffects: [],
      },
    });

    const manifest = manifestWithTree({
      rootNodeId: "n1",
      nodes: [
        { id: "n1", levelLabel: "Level 1", branches: [branch, branchTransition] },
        { id: "n2", levelLabel: "Level 2", branches: [tail] },
      ],
    });

    expect(validateTree(manifest)).toEqual({ ok: true });
  });

  it("fails with rule decision_tree_invariants when a branch points at a missing node", () => {
    const branch = makeUnlockedBranch({
      ...baseBranchFields("b1", "Attempt"),
      nextNodeId: "ghost",
    });

    const manifest = manifestWithTree({
      rootNodeId: "n1",
      nodes: [{ id: "n1", levelLabel: "Level 1", branches: [branch] }],
    });

    const result = validateTree(manifest);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rule).toBe("decision_tree_invariants");
    expect(result.message).toMatch(/missing node/u);
  });
});

describe("validateRequiredTargets (unresolved_target_selector)", () => {
  it("passes when every required target selector resolved at least one candidate", () => {
    const option: JourneyOption = makeUnlockedOption({
      ...baseOptionFields(),
      operations: [
        {
          operationId: "op:resolved",
          role: "reward",
          operationKind: "reward",
          templateId: "essence-gain",
          rendered: "Gain 1 essence.",
          versionContribution: { effectId: "essence-gain" },
          params: {},
          targetSelector: {
            selectorKind: "card",
            selection: "exact",
            required: true,
            source: "catalog",
          },
          targetResolution: {
            selectorKind: "card",
            selection: "exact",
            sourcePool: "catalog",
            targetOrigin: "catalog_reward",
            candidateCount: 3,
            selected: [],
          },
        // The operation type tree is wider than these tests care about;
        // the validator only inspects `targetSelector.required` and
        // `targetResolution.candidateCount`. Cast through `unknown` so the
        // hand-built operation skirts the operation union's exhaustive
        // discriminator checks.
        } as unknown as JourneyOption["operations"][number],
      ],
    });

    const manifest = manifestWithOptions([option]);
    expect(validateRequiredTargets(manifest)).toEqual({ ok: true });
  });

  it("fails with rule unresolved_target_selector when a required selector resolves zero candidates", () => {
    const option: JourneyOption = makeUnlockedOption({
      ...baseOptionFields(),
      operations: [
        {
          operationId: "op:unresolved",
          role: "reward",
          operationKind: "reward",
          templateId: "card-gain",
          rendered: "Gain a card.",
          versionContribution: { effectId: "card-gain" },
          params: {},
          targetSelector: {
            selectorKind: "card",
            selection: "exact",
            required: true,
            source: "deck",
          },
          targetResolution: {
            selectorKind: "card",
            selection: "exact",
            sourcePool: "deck",
            targetOrigin: "current_object",
            candidateCount: 0,
            selected: [],
            emptyReason: "empty_deck_or_no_matching_targets",
          },
        } as unknown as JourneyOption["operations"][number],
      ],
    });

    const manifest = manifestWithOptions([option]);
    const result = validateRequiredTargets(manifest);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rule).toBe("unresolved_target_selector");
    expect(result.message).toMatch(/card target selector did not resolve/u);
  });
});

describe("validateRootOptions (options_match_shape_topology / invalid_option)", () => {
  it("passes a well-formed option with all structured arrays and a known pick behavior", () => {
    const option: JourneyOption = makeUnlockedOption(baseOptionFields());
    const manifest = manifestWithOptions([option]);

    expect(validateRootOptions(manifest)).toEqual({ ok: true });
  });

  it("fails with rule invalid_option when an option carries an unsupported pick behavior", () => {
    const option: JourneyOption = makeUnlockedOption({
      ...baseOptionFields(),
      // Cast through `unknown`: PickBehavior is a string literal union, and
      // this test deliberately feeds a value outside that union to exercise
      // the runtime guard.
      pickBehavior: "burrow" as unknown as JourneyOption["pickBehavior"],
    });

    const manifest = manifestWithOptions([option]);
    const result = validateRootOptions(manifest);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.rule).toBe("invalid_option");
    expect(result.message).toMatch(/unsupported pick behavior/u);
  });
});
