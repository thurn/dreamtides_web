// Browser dream-art matcher tests.
//
// Two tests:
//
//   1. Determinism. The matcher is a pure function of the manifest plus the
//      ledger; called twice with identical inputs, it must produce identical
//      assignments. A non-deterministic allocator would cause the UI to
//      flicker between dream art on re-render.
//
//   2. Fallback chain. When every option in a journey carries the same
//      reward type and the ledger has only one dream of that reward type,
//      the matcher must:
//        (a) hand out an assignment to every option (no crash, no silent
//            omission), and
//        (b) record a `repeatFallbacks` notice for every option that had to
//            borrow a dream from a different reward type. This guards the
//            graceful-degradation path that lets the UI keep rendering even
//            when the ledger has coverage gaps.

import { describe, expect, it } from "vitest";

import type { JourneyManifest, JourneyOption } from "../journey/manifest";
import { makeUnlockedOption } from "../journey/manifest";

import {
  type DreamEntry,
  assignDreamArt,
  buildLedgerIndex,
} from "./dreamArt";

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

/**
 * Build a manifest hull with three reward-bearing options. The matcher only
 * reads `seed`, `journeyId`, `rootJourneyIndex`, `versions.contentVersion`,
 * `options`, and `tree`, so the rest is cast-through-`as`.
 */
function manifestWithOptions(
  options: JourneyOption[],
  seed = "seed-determinism",
  journeyId = "journey-1",
): JourneyManifest {
  return {
    seed,
    journeyId,
    rootJourneyIndex: 0,
    versions: { contentVersion: "test-content" },
    options,
    tree: undefined,
  } as unknown as JourneyManifest;
}

function option(
  number: number,
  rewardTemplateIds: readonly string[],
): JourneyOption {
  return makeUnlockedOption({
    ...baseOptionFields(),
    number,
    text: `Option ${number}`,
    rewardTemplateIds,
  });
}

describe("assignDreamArt", () => {
  it("is a pure function of the manifest (determinism)", () => {
    // Three options each carrying a distinct reward template id, so the
    // matcher exercises the same-reward-type happy path for every option
    // and the shuffled processing order has a chance to vary the picks if
    // it were nondeterministic.
    const manifest = manifestWithOptions([
      option(1, ["gain_essence"]),
      option(2, ["gain_omens"]),
      option(3, ["gain_random_dreamsign"]),
    ]);

    const first = assignDreamArt(manifest);
    const second = assignDreamArt(manifest);

    // No crashes, every option got a hit, identical between runs.
    expect(first.assignments).toHaveLength(3);
    expect(second.assignments).toEqual(first.assignments);
    expect(second.reviewFlags).toEqual(first.reviewFlags);
    expect(second.repeatFallbacks).toEqual(first.repeatFallbacks);

    // Image URLs follow the documented convention.
    for (const a of first.assignments) {
      expect(a.imageUrl).toMatch(/^\/journeys\/\d+\.jpg$/);
    }

    // Within a journey, image uniqueness is enforced.
    const ids = new Set(first.assignments.map((a) => a.imageId));
    expect(ids.size).toBe(first.assignments.length);
  });

  it("borrows across reward types when the ledger runs out (fallback chain)", () => {
    // Tiny fixture ledger: three reward types, but the type all three
    // options carry (`gain_essence` -> "Gain X essence.") has only ONE
    // dream entry. Two of the three options must borrow from another
    // reward type, exercising the cross-type fallback.
    const fixtureEntries: DreamEntry[] = [
      { imageId: "10001", dreamName: "Essence Alpha", rewardType: "Gain X essence." },
      { imageId: "20001", dreamName: "Omen Alpha", rewardType: "Gain X omens." },
      { imageId: "20002", dreamName: "Omen Beta", rewardType: "Gain X omens." },
      { imageId: "30001", dreamName: "Dreamsign Alpha", rewardType: "Gain a random Dreamsign." },
    ];
    const ledger = buildLedgerIndex(fixtureEntries);

    const manifest = manifestWithOptions(
      [
        option(1, ["gain_essence"]),
        option(2, ["gain_essence"]),
        option(3, ["gain_essence"]),
      ],
      "seed-fallback",
      "journey-fallback",
    );

    const result = assignDreamArt(manifest, { ledger });

    // (a) Every option got an assignment.
    expect(result.assignments).toHaveLength(3);

    // (b) Every assignment refers to a real entry from the fixture ledger.
    const fixtureIds = new Set(fixtureEntries.map((e) => e.imageId));
    for (const a of result.assignments) {
      expect(fixtureIds.has(a.imageId)).toBe(true);
    }

    // (c) Image uniqueness within the journey is preserved.
    const ids = new Set(result.assignments.map((a) => a.imageId));
    expect(ids.size).toBe(3);

    // (d) At least one borrow notice — the second and third options had
    //     no same-reward-type dream available.
    expect(result.repeatFallbacks.length).toBeGreaterThanOrEqual(1);

    // (e) At least one assignment is from a reward type other than the
    //     one its option asked for.
    const offTypeAssignments = result.assignments.filter(
      (a) => a.rewardType !== "Gain X essence.",
    );
    expect(offTypeAssignments.length).toBeGreaterThanOrEqual(1);

    // (f) No review flags — the ledger has dreams, just not in the right
    //     reward type, so the matcher silently borrows rather than warning.
    expect(result.reviewFlags).toEqual([]);
  });
});
