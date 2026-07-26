import { describe, expect, it, vi } from "vitest";
import type { Fresh20DraftState } from "../../types/draft";
import type { FitModel } from "../replay/fit-model";
import {
  computeFresh20Offer,
  eligibleFresh20Cards,
  FRESH20_COOLDOWN_PICKS,
  FRESH20_MAX_SHOWS,
  generateFresh20Pack,
  isFresh20CardEligible,
  recordFresh20Shown,
  type Fresh20Deps,
} from "./fresh20-offer";

// The real ranker is never invoked here — a fake `computeOffer` is injected — so
// the model only needs to be a value of the right type.
const fakeFitModel = {} as unknown as FitModel;

function makeState(overrides: Partial<Fresh20DraftState> = {}): Fresh20DraftState {
  return {
    mode: "fresh20",
    packSize: 20,
    shownPicksByCard: {},
    currentOffer: [],
    activeSiteId: null,
    pickNumber: 1,
    sitePicksCompleted: 0,
    ...overrides,
  };
}

// A deterministic RNG that walks a fixed list of values in [0, 1).
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe("isFresh20CardEligible", () => {
  it("treats a never-shown card as eligible", () => {
    expect(isFresh20CardEligible(undefined, 5)).toBe(true);
    expect(isFresh20CardEligible([], 5)).toBe(true);
  });

  it("blocks a card during its cooldown window then frees it", () => {
    // Shown at pick 5. Ineligible while the gap is < FRESH20_COOLDOWN_PICKS.
    const shown = [5];
    expect(isFresh20CardEligible(shown, 5 + FRESH20_COOLDOWN_PICKS - 1)).toBe(false);
    // Eligible again exactly FRESH20_COOLDOWN_PICKS picks later.
    expect(isFresh20CardEligible(shown, 5 + FRESH20_COOLDOWN_PICKS)).toBe(true);
  });

  it("retires a card permanently once shown the maximum number of times", () => {
    const shown = [1, 2];
    expect(FRESH20_MAX_SHOWS).toBe(2);
    // Far beyond any cooldown, but already shown twice → never eligible again.
    expect(isFresh20CardEligible(shown, 1000)).toBe(false);
  });

  it("ignores shows at or after the queried pick (re-reveal safety)", () => {
    // A stray record at the current pick must not make the card ineligible for
    // that same pick's pack.
    expect(isFresh20CardEligible([7], 7)).toBe(true);
    expect(isFresh20CardEligible([7, 8], 7)).toBe(true);
  });
});

describe("eligibleFresh20Cards", () => {
  it("keeps only currently-eligible cards, preserving order", () => {
    const all = [10, 20, 30, 40];
    const history = {
      "20": [1, 2], // shown twice → retired
      "30": [9], // shown recently → on cooldown at pick 10
    };
    expect(eligibleFresh20Cards(all, history, 10)).toEqual([10, 40]);
  });
});

describe("generateFresh20Pack", () => {
  it("samples packSize distinct cards without replacement", () => {
    const eligible = [1, 2, 3, 4, 5, 6, 7, 8];
    const pack = generateFresh20Pack(eligible, 4, seqRng([0, 0, 0, 0]));
    expect(pack).toHaveLength(4);
    expect(new Set(pack).size).toBe(4);
    for (const card of pack) {
      expect(eligible).toContain(card);
    }
  });

  it("never mutates the eligible input", () => {
    const eligible = [1, 2, 3, 4, 5];
    const copy = [...eligible];
    generateFresh20Pack(eligible, 3, seqRng([0.5, 0.5, 0.5]));
    expect(eligible).toEqual(copy);
  });

  it("returns the whole eligible pool when it is smaller than packSize", () => {
    const pack = generateFresh20Pack([1, 2], 20, seqRng([0, 0]));
    expect(new Set(pack)).toEqual(new Set([1, 2]));
  });
});

describe("computeFresh20Offer", () => {
  function makeEchoOffer(): NonNullable<Fresh20Deps["computeOffer"]> {
    // Returns the first `offerSize` of the pack, asserting it received an empty
    // signature list (fresh20 ignores DreamAvatar signatures).
    return vi.fn(
      (
        pack: readonly number[],
        _deck: readonly number[],
        signatures: readonly number[],
        _model: FitModel,
        offerSize: number,
      ): number[] => {
        expect(signatures).toEqual([]);
        return pack.slice(0, offerSize);
      },
    );
  }

  it("rolls a pack of eligible cards and returns the ranker's slice", () => {
    const state = makeState({ packSize: 5 });
    const computeOffer = makeEchoOffer();
    // rng = 0 each draw → partial Fisher–Yates keeps the array order, so the
    // pack is the first five card numbers and the echo ranker returns four.
    const offer = computeFresh20Offer(state, {
      deckCardNumbers: [],
      fitModel: fakeFitModel,
      offerSize: 4,
      allCardNumbers: [100, 101, 102, 103, 104, 105, 106],
      rng: seqRng([0, 0, 0, 0, 0]),
      computeOffer,
    });
    expect(offer).toEqual([100, 101, 102, 103]);
    expect(computeOffer).toHaveBeenCalledTimes(1);
  });

  it("excludes ineligible cards from the pack it ranks", () => {
    const state = makeState({
      packSize: 3,
      pickNumber: 5,
      shownPicksByCard: { "100": [4], "101": [1, 2] },
    });
    const seenPacks: number[][] = [];
    const offer = computeFresh20Offer(state, {
      deckCardNumbers: [],
      fitModel: fakeFitModel,
      offerSize: 2,
      allCardNumbers: [100, 101, 102, 103, 104],
      rng: seqRng([0, 0, 0]),
      computeOffer: vi.fn((pack: readonly number[]) => {
        seenPacks.push([...pack]);
        return pack.slice(0, 2);
      }),
    });
    // 100 is on cooldown (shown at pick 4), 101 is retired (shown twice).
    expect(seenPacks[0]).not.toContain(100);
    expect(seenPacks[0]).not.toContain(101);
    expect(offer.every((c) => [102, 103, 104].includes(c))).toBe(true);
  });
});

describe("recordFresh20Shown", () => {
  it("appends the current pick to each shown card, kept sorted and deduped", () => {
    const state = makeState({ pickNumber: 3, shownPicksByCard: { "7": [1] } });
    recordFresh20Shown(state, [7, 9]);
    expect(state.shownPicksByCard["7"]).toEqual([1, 3]);
    expect(state.shownPicksByCard["9"]).toEqual([3]);
  });

  it("is idempotent for a given pick (re-reveal replaces, never accumulates)", () => {
    const state = makeState({ pickNumber: 3 });
    recordFresh20Shown(state, [7, 8]);
    // A second reveal of the same pick with a different offer must not leave the
    // first offer's cards recorded at pick 3.
    recordFresh20Shown(state, [9, 10]);
    expect(state.shownPicksByCard["7"]).toBeUndefined();
    expect(state.shownPicksByCard["8"]).toBeUndefined();
    expect(state.shownPicksByCard["9"]).toEqual([3]);
    expect(state.shownPicksByCard["10"]).toEqual([3]);
  });

  it("preserves earlier-pick records when re-revealing a later pick", () => {
    const state = makeState({ pickNumber: 12, shownPicksByCard: { "7": [1] } });
    recordFresh20Shown(state, [7]);
    expect(state.shownPicksByCard["7"]).toEqual([1, 12]);
  });
});
