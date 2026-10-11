import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { foldEvents } from "../../eventlog/fold";
import { hashState } from "../../eventlog/hash";
import { genesisFoldState, type FoldState } from "../fold-state";
import { registerDeckContentProvider } from "./deck";
import { registerDraftContentProvider } from "./draft";
import { registerJourneyLifecycleContentProvider } from "./lifecycle";
import { registerSiteContentProvider } from "./sites";
import { registerBattleInitProvider } from "../battle/journey-battle";
import { fixtureBattleInitProvider } from "../replay/fixture-providers";
import { GENESIS, ENGINE_CONFIG, lifecycleProvider, draftProvider, siteProvider, deckProvider } from "./journey-properties-fixtures";
import { allSequences } from "./journey-properties-generators";



beforeAll(() => {
  registerJourneyLifecycleContentProvider(lifecycleProvider());
  registerDeckContentProvider(deckProvider());
  registerDraftContentProvider(draftProvider());
  registerSiteContentProvider(siteProvider());
  // Register the deterministic fixture battle-init provider so BEGIN_BATTLE
  // applies and the battle slice (the most `undefined`-prone part of FoldState)
  // participates in the determinism / JSON-purity / hash properties below —
  // closing the audit's G2 coverage gap where the battle slice was never
  // round-trip- or hash-checked.
  registerBattleInitProvider(fixtureBattleInitProvider());
});


afterAll(() => {
  // Clear ALL our registrations so no other suite sees a populated provider.
  registerJourneyLifecycleContentProvider(null);
  registerDeckContentProvider(null);
  registerDraftContentProvider(null);
  registerSiteContentProvider(null);
  registerBattleInitProvider(null);
});


// ---------------------------------------------------------------------------
// (b) Total fold safety
// ---------------------------------------------------------------------------

describe("(b) total fold safety", () => {
  it("folds never throw and every outcome is applied | bounced", () => {
    for (const { events } of allSequences()) {
      const result = foldEvents(
        ENGINE_CONFIG,
        GENESIS,
        { seq: 0, state: genesisFoldState(GENESIS) },
        events,
        { devMode: false },
      );
      for (const outcome of result.outcomes) {
        expect(["applied", "bounced"]).toContain(outcome.outcome);
      }
    }
  });
});


// ---------------------------------------------------------------------------
// (c) Determinism
// ---------------------------------------------------------------------------

describe("(c) determinism", () => {
  it("folding a sequence twice yields an identical final hash", () => {
    for (const { events } of allSequences()) {
      const foldOnce = () =>
        foldEvents(
          ENGINE_CONFIG,
          GENESIS,
          { seq: 0, state: genesisFoldState(GENESIS) },
          events,
          { devMode: false },
        ).state;
      expect(hashState(foldOnce())).toBe(hashState(foldOnce()));
    }
  });
});


// ---------------------------------------------------------------------------
// (d) JSON purity
// ---------------------------------------------------------------------------

describe("(d) JSON purity", () => {
  it("final state survives a JSON round-trip with hash equality", () => {
    for (const { events } of allSequences()) {
      const state = foldEvents(
        ENGINE_CONFIG,
        GENESIS,
        { seq: 0, state: genesisFoldState(GENESIS) },
        events,
        { devMode: false },
      ).state;
      const roundTripped = JSON.parse(JSON.stringify(state)) as FoldState;
      expect(hashState(state)).toBe(hashState(roundTripped));
    }
  });
});
