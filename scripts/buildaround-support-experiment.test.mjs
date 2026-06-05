import { describe, expect, it } from "vitest";
import { scorePool, TIER_TARGET } from "./buildaround-support-experiment.mjs";

// Minimal hand-built metadata: a Warrior lord (payoff + support), a plain Warrior
// body (support only), inert filler, and an event payoff with one event.
const META = {
  themes: { warriors: { name: "Warriors" }, events: { name: "Play an event" } },
  cards: {
    Lord: { needs: [{ theme: "warriors", tier: 3 }], supports: ["warriors"] },
    Grunt: { needs: [], supports: ["warriors"] },
    EventPayoff: { needs: [{ theme: "events", tier: 1 }], supports: [] },
    AnEvent: { needs: [], supports: ["events"] },
  },
};

const only = (instances, theme) => instances.find((i) => i.theme === theme);

// Draft pools cap each card at 2 copies, so a size-N pool needs distinct names.
// Add `n` inert filler copies (Filler0=2, Filler1=2, …) to a counts map.
function withFiller(counts, n) {
  let i = 0;
  while (n > 0) {
    counts.set(`Filler${i}`, Math.min(2, n));
    n -= 2;
    i += 1;
  }
  return counts;
}

describe("scorePool", () => {
  it("penalizes under-support proportionally and reports share", () => {
    // size 10; warriors support = Lord(1)+Grunt(1)=2, minus Lord's own 1 => 1.
    const counts = withFiller(new Map([["Lord", 1], ["Grunt", 1]]), 8);
    const inst = only(scorePool(counts, META), "warriors");
    expect(inst.poolSize).toBe(10);
    expect(inst.supportCopies).toBe(1);
    expect(inst.share).toBeCloseTo(0.1, 10);
    // tier 3 target 0.25 => 0.1 / 0.25 = 0.4
    expect(inst.adequacy).toBeCloseTo(0.1 / TIER_TARGET[3], 10);
  });

  it("caps adequacy at 1 when over-supported", () => {
    const counts = new Map([["Lord", 1], ["Grunt", 2]]); // size 3, sc=2, share .667
    const inst = only(scorePool(counts, META), "warriors");
    expect(inst.share).toBeGreaterThan(TIER_TARGET[3]);
    expect(inst.adequacy).toBe(1);
  });

  it("uses the payoff's own tier to pick the target", () => {
    // EventPayoff is tier 1 (target 0.10). 1 event in a pool of 10 => share .10 => 1.0.
    const counts = withFiller(new Map([["EventPayoff", 1], ["AnEvent", 1]]), 8);
    const inst = only(scorePool(counts, META), "events");
    expect(inst.tier).toBe(1);
    expect(inst.adequacy).toBeCloseTo(1, 10);
  });

  it("excludes the payoff's own copies from its support tally", () => {
    // A lone lord supports warriors but must not count as its own support.
    const counts = withFiller(new Map([["Lord", 1]]), 9);
    const inst = only(scorePool(counts, META), "warriors");
    expect(inst.supportCopies).toBe(0);
    expect(inst.adequacy).toBe(0);
  });

  it("emits no instances when no build-around is present", () => {
    const counts = withFiller(new Map([["Grunt", 2]]), 5);
    expect(scorePool(counts, META)).toEqual([]);
  });
});
