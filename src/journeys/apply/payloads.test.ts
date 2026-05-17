// Payload narrowing tests.
//
// The manifest declares `option.costs[]` and `option.effects[]` as `unknown[]`.
// The narrowing guards convert each raw entry into a typed `SharedCostPayload`
// or `SharedRewardPayload`, or return `null` for malformed envelopes so the
// dispatch loop can log and skip. These tests pin three invariants:
//   1. A well-formed payload narrows successfully.
//   2. An entry whose `kind` does not match returns `null`.
//   3. An entry missing any required field returns `null`.

import { describe, expect, it } from "vitest";

import {
  narrowSharedCostPayload,
  narrowSharedRewardPayload,
  type SharedCostPayload,
  type SharedRewardPayload,
} from "./payloads";

const validCost: SharedCostPayload = {
  kind: "shared_cost_template",
  templateId: "essence_cost",
  params: { amount: 3 },
  text: "Pay 3 essence",
  convertedEssence: 3,
};

const validReward: SharedRewardPayload = {
  kind: "shared_reward_template",
  templateId: "gain_essence",
  params: { amount: 5 },
  text: "Gain 5 essence",
  convertedEssence: 5,
};

describe("narrowSharedCostPayload", () => {
  it("narrows a well-formed cost payload", () => {
    expect(narrowSharedCostPayload(validCost)).toEqual(validCost);
  });

  it("returns null when kind is wrong", () => {
    expect(
      narrowSharedCostPayload({ ...validCost, kind: "shared_reward_template" }),
    ).toBeNull();
  });
});

describe("narrowSharedRewardPayload", () => {
  it("narrows a well-formed reward payload", () => {
    expect(narrowSharedRewardPayload(validReward)).toEqual(validReward);
  });

  it("returns null when kind is wrong", () => {
    expect(
      narrowSharedRewardPayload({ ...validReward, kind: "shared_cost_template" }),
    ).toBeNull();
  });
});

describe("narrow guard — missing or malformed fields return null", () => {
  // Drive a single guard parametrically across every failure mode the spec
  // calls out. Picking the cost guard is arbitrary; the shared internal helper
  // means the reward guard exercises the same code path.
  const cases: Array<[string, unknown]> = [
    ["not an object (null)", null],
    ["not an object (string)", "shared_cost_template"],
    ["not an object (number)", 42],
    ["missing templateId", { ...validCost, templateId: undefined }],
    ["templateId not a string", { ...validCost, templateId: 7 }],
    ["missing params", { ...validCost, params: undefined }],
    ["params not an object", { ...validCost, params: "nope" }],
    ["params: array", { ...validCost, params: [] }],
    ["missing text", { ...validCost, text: undefined }],
    ["text not a string", { ...validCost, text: 9 }],
    ["missing convertedEssence", { ...validCost, convertedEssence: undefined }],
    ["convertedEssence not a number", { ...validCost, convertedEssence: "3" }],
  ];

  it.each(cases)("returns null when %s", (_label, input) => {
    expect(narrowSharedCostPayload(input)).toBeNull();
  });
});
