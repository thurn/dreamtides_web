import { describe, expect, it } from "vitest";
import {
  archetypeKind,
  archetypeSupportSet,
  buildableThemes,
  cardBestAdequacies,
  cardLifts,
  draftableUniverse,
  giniCoefficient,
  normalizedEntropy,
  poolPayoffThemes,
  poolSupportShares,
  scorePool,
  signatureDecks,
  supportSetCompleteness,
  supportSetShare,
  TIER_TARGET,
  trapCards,
} from "./pool-metrics.mjs";

// Minimal hand-built metadata: a Warrior lord (payoff + support), a plain Warrior
// body (support only), inert filler, and an event payoff with one event.
const META = {
  themes: { warriors: { name: "Warriors" }, events: { name: "Play an event" } },
  cards: {
    Lord: { needs: [{ theme: "warriors", tier: 3 }], supports: ["warriors"] },
    Grunt: { needs: [], supports: ["warriors"] },
    EventPayoff: { needs: [{ theme: "events", tier: 1 }], supports: [] },
    AnEvent: { needs: [], supports: ["events"] },
    // A dual-theme payoff: needs both warriors (tier 3) and events (tier 1). Its
    // best theme decides whether it is a trap, even if a secondary theme is thin.
    DualPayoff: {
      needs: [
        { theme: "warriors", tier: 3 },
        { theme: "events", tier: 1 },
      ],
      supports: [],
    },
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

  it("only emits instances for allowed themes when given a filter", () => {
    const counts = withFiller(
      new Map([["Lord", 1], ["Grunt", 1], ["EventPayoff", 1], ["AnEvent", 1]]),
      6,
    );
    const all = scorePool(counts, META);
    expect(all.map((i) => i.theme).sort()).toEqual(["events", "warriors"]);
    const warriorsOnly = scorePool(counts, META, TIER_TARGET, new Set(["warriors"]));
    expect(warriorsOnly.map((i) => i.theme)).toEqual(["warriors"]);
  });
});

describe("cardBestAdequacies", () => {
  it("collapses a multi-theme payoff to the MAX adequacy across its themes", () => {
    // DualPayoff needs warriors (tier 3, target .25) and events (tier 1, .10).
    // Pool of 10: warriors support = Grunt(1) => share .10 => adequacy .4;
    // events support = AnEvent(1) => share .10 => adequacy 1.0. Best is 1.0.
    const counts = withFiller(
      new Map([["DualPayoff", 1], ["Grunt", 1], ["AnEvent", 1]]),
      7,
    );
    const best = cardBestAdequacies(counts, META);
    expect(best.get("DualPayoff")).toBeCloseTo(1, 10);
  });

  it("gives one entry per payoff card", () => {
    const counts = withFiller(
      new Map([["Lord", 1], ["Grunt", 1], ["EventPayoff", 1], ["AnEvent", 1]]),
      6,
    );
    const best = cardBestAdequacies(counts, META);
    expect([...best.keys()].sort()).toEqual(["EventPayoff", "Lord"]);
  });
});

describe("trapCards", () => {
  it("flags a thinly-supported payoff as a trap below tau", () => {
    // Lone Lord: warriors support excludes its own copy => 0 => adequacy 0.
    const counts = withFiller(new Map([["Lord", 1]]), 9);
    expect(cardBestAdequacies(counts, META).get("Lord")).toBe(0);
    expect(trapCards(counts, META, TIER_TARGET, 0.35)).toEqual(["Lord"]);
  });

  it("does not flag a payoff whose best theme is supported, even if a secondary theme is thin", () => {
    // DualPayoff: warriors thin (adequacy .4), events fully supported (1.0).
    // Best theme is events => not a trap, despite the thin warriors theme.
    const counts = withFiller(
      new Map([["DualPayoff", 1], ["Grunt", 1], ["AnEvent", 1]]),
      7,
    );
    expect(trapCards(counts, META, TIER_TARGET, 0.35)).toEqual([]);
  });

  it("does not flag an adequately supported payoff above tau", () => {
    // EventPayoff tier 1 (target .10): 1 event in 10 => share .10 => adequacy 1.0.
    const counts = withFiller(new Map([["EventPayoff", 1], ["AnEvent", 1]]), 8);
    expect(trapCards(counts, META, TIER_TARGET, 0.35)).toEqual([]);
  });

  it("respects the tau boundary (strict <)", () => {
    // Lord with warriors share .10 (target .25) => adequacy 0.4 exactly.
    const counts = withFiller(new Map([["Lord", 1], ["Grunt", 1]]), 8);
    expect(cardBestAdequacies(counts, META).get("Lord")).toBeCloseTo(0.4, 10);
    // tau just above 0.4 => trap; at/below 0.4 => not a trap (strict <).
    expect(trapCards(counts, META, TIER_TARGET, 0.41)).toEqual(["Lord"]);
    expect(trapCards(counts, META, TIER_TARGET, 0.4)).toEqual([]);
    expect(trapCards(counts, META, TIER_TARGET, 0.3)).toEqual([]);
  });
});

describe("poolSupportShares", () => {
  it("reports gross support copies per theme as a fraction of pool size", () => {
    // size 10; warriors support = Lord(1)+Grunt(1)=2 (no self exclusion);
    // events support = AnEvent(1)=1.
    const counts = withFiller(
      new Map([["Lord", 1], ["Grunt", 1], ["AnEvent", 1]]),
      7,
    );
    const shares = poolSupportShares(counts, META);
    expect(shares.get("warriors")).toBeCloseTo(0.2, 10);
    expect(shares.get("events")).toBeCloseTo(0.1, 10);
  });

  it("returns an empty map for an empty pool", () => {
    expect([...poolSupportShares(new Map(), META).entries()]).toEqual([]);
  });
});

describe("poolPayoffThemes", () => {
  it("collects every theme any present payoff needs", () => {
    const counts = withFiller(
      new Map([["Lord", 1], ["EventPayoff", 1], ["Grunt", 1]]),
      7,
    );
    expect([...poolPayoffThemes(counts, META)].sort()).toEqual([
      "events",
      "warriors",
    ]);
  });

  it("is empty when only support/filler cards are present", () => {
    const counts = withFiller(new Map([["Grunt", 2], ["AnEvent", 2]]), 6);
    expect([...poolPayoffThemes(counts, META)]).toEqual([]);
  });
});

describe("buildableThemes", () => {
  const standalone = ["warriors", "events"];

  it("flags a theme buildable when a payoff is present and support clears the bar", () => {
    // size 10; warriors support = Lord(1)+Grunt(1) => share .2; Lord is a payoff.
    const counts = withFiller(
      new Map([["Lord", 1], ["Grunt", 1]]),
      8,
    );
    expect([...buildableThemes(counts, META, standalone, 0.18)]).toEqual([
      "warriors",
    ]);
  });

  it("excludes a theme whose support is below the buildable share", () => {
    // Only 1 warrior support copy in a pool of 10 => share .1 < .18.
    const counts = withFiller(new Map([["Lord", 1], ["Grunt", 1]]), 8);
    expect([...buildableThemes(counts, META, standalone, 0.25)]).toEqual([]);
  });

  it("excludes a well-supported theme with no payoff present", () => {
    // 2 warrior support copies (share .2) but no warrior payoff card => not buildable.
    const counts = withFiller(new Map([["Grunt", 2]]), 8);
    expect([...buildableThemes(counts, META, standalone, 0.1)]).toEqual([]);
  });

  it("can flag multiple archetypes at once", () => {
    // Warriors: Lord+Grunt => .2; events: EventPayoff present + 2 events => .2.
    const counts = withFiller(
      new Map([
        ["Lord", 1],
        ["Grunt", 1],
        ["EventPayoff", 1],
        ["AnEvent", 2],
      ]),
      5,
    );
    expect([...buildableThemes(counts, META, standalone, 0.18)].sort()).toEqual([
      "events",
      "warriors",
    ]);
  });
});

describe("normalizedEntropy", () => {
  it("is 1 for a perfectly even distribution", () => {
    expect(normalizedEntropy([5, 5, 5, 5])).toBeCloseTo(1, 10);
  });

  it("is 0 when all mass is on one category", () => {
    expect(normalizedEntropy([10, 0, 0, 0])).toBe(0);
  });

  it("folds absent categories into the normalizer", () => {
    // Two equal nonzero buckets across a universe of 4 categories => log2/log4 = .5.
    expect(normalizedEntropy([5, 5], 4)).toBeCloseTo(0.5, 10);
  });

  it("returns 0 for an all-zero distribution or a single category", () => {
    expect(normalizedEntropy([0, 0, 0])).toBe(0);
    expect(normalizedEntropy([7], 1)).toBe(0);
  });
});

describe("giniCoefficient", () => {
  it("is 0 for a perfectly even distribution", () => {
    expect(giniCoefficient([3, 3, 3, 3])).toBeCloseTo(0, 10);
  });

  it("approaches 1 as one category hoards everything", () => {
    const g = giniCoefficient([0, 0, 0, 100]);
    expect(g).toBeGreaterThan(0.7);
  });

  it("is 0 for an empty or all-zero distribution", () => {
    expect(giniCoefficient([])).toBe(0);
    expect(giniCoefficient([0, 0])).toBe(0);
  });
});

describe("draftableUniverse", () => {
  it("unions every card-name source the generator can pull from", () => {
    const poolData = {
      core: new Set(["CoreA"]),
      archLists: new Map([["arch", new Set(["ArchB"])]]),
      draftLists: new Map([["wu", new Set(["DraftC"])]]),
      decklists: [["DeckD", "CoreA"]],
    };
    expect([...draftableUniverse(poolData)].sort()).toEqual([
      "ArchB",
      "CoreA",
      "DeckD",
      "DraftC",
    ]);
  });

  it("tolerates missing optional sources", () => {
    const poolData = { core: new Set(["Only"]), archLists: new Map(), draftLists: new Map() };
    expect([...draftableUniverse(poolData)]).toEqual(["Only"]);
  });
});

// --- DreamAvatar-support metric (label-free, learned from decklists) --------

// A toy corpus: "Spirit" decks pair the signature with Wolf/Eagle; an off-theme
// deck and a goodstuff card (in every deck) exercise the lift math.
const SIG = ["SpiritLord"];
const CORPUS = [
  ["SpiritLord", "Wolf", "Eagle", "Goodstuff"],
  ["SpiritLord", "Wolf", "Eagle", "Goodstuff"],
  ["SpiritLord", "Wolf", "Goodstuff"],
  ["Warrior", "Axe", "Goodstuff"],
  ["Warrior", "Axe", "Goodstuff"],
];

describe("signatureDecks", () => {
  it("keeps decks with at least k signature cards", () => {
    expect(signatureDecks(CORPUS, SIG, 1).length).toBe(3);
    expect(signatureDecks(CORPUS, ["SpiritLord", "Wolf"], 2).length).toBe(3);
    expect(signatureDecks(CORPUS, [], 1).length).toBe(0);
  });
});

describe("cardLifts", () => {
  it("ranks signature-only cards high and ubiquitous goodstuff at ~1", () => {
    const sigDecks = signatureDecks(CORPUS, SIG, 1);
    const lifts = cardLifts(CORPUS, sigDecks);
    // Goodstuff is in all 5 decks and all 3 signature decks => lift 1.
    expect(lifts.get("Goodstuff").lift).toBeCloseTo(1, 10);
    // Wolf: 3/3 in signature decks, 3/5 in corpus => lift 5/3.
    expect(lifts.get("Wolf").lift).toBeCloseTo(5 / 3, 10);
    expect(lifts.get("Wolf").presence).toBeCloseTo(1, 10);
    // Off-theme cards never appear in signature decks.
    expect(lifts.has("Axe")).toBe(false);
  });
});

describe("archetypeSupportSet", () => {
  it("includes high-lift on-theme cards and excludes goodstuff", () => {
    const { cards, sigDeckCount } = archetypeSupportSet(CORPUS, SIG, {
      k: 1,
      lift: 1.3,
      presence: 0.2,
    });
    expect(sigDeckCount).toBe(3);
    expect(cards.has("Wolf")).toBe(true);
    expect(cards.has("Eagle")).toBe(true);
    expect(cards.has("Goodstuff")).toBe(false); // lift ~1, below threshold
    expect(cards.has("Axe")).toBe(false); // off-theme
  });
});

describe("supportSetShare", () => {
  it("is copy-weighted support over pool size", () => {
    const support = new Set(["Wolf", "Eagle"]);
    // size 10: Wolf x2 + Eagle x1 = 3 on-theme copies => share 0.3.
    const counts = withFiller(new Map([["Wolf", 2], ["Eagle", 1]]), 7);
    expect(supportSetShare(counts, support)).toBeCloseTo(0.3, 10);
    expect(supportSetShare(new Map(), support)).toBe(0);
  });
});

describe("supportSetCompleteness", () => {
  it("is the fraction of the support set present as a full 2-of playset", () => {
    const support = new Set(["Wolf", "Eagle", "Bear"]);
    // Wolf is a 2-of, Eagle a 1-of (not full), Bear absent => 1/3 complete.
    const counts = new Map([["Wolf", 2], ["Eagle", 1]]);
    expect(supportSetCompleteness(counts, support)).toBeCloseTo(1 / 3, 10);
    // Empty support set is vacuously complete.
    expect(supportSetCompleteness(new Map(), new Set())).toBe(1);
  });
});

describe("archetypeKind", () => {
  it("is big5 only when a 2-of playset could fill at least the target share", () => {
    // 50 cards x2 = 100 copies = 50% of a 200 pool => exactly reaches target.
    expect(archetypeKind(50, 200, 0.5)).toBe("big5");
    expect(archetypeKind(49, 200, 0.5)).toBe("small");
    // A small support set cannot be a backbone at any reasonable pool size.
    expect(archetypeKind(13, 200, 0.5)).toBe("small");
  });
});
