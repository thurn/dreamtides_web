import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eventRng } from "../../eventlog/rng";
import { foldEvents } from "../../eventlog/fold";
import type { EventContext } from "../../eventlog/types";
import { genesisFoldState, type FoldState } from "../fold-state";
import { reduceGameEvent } from "../reducer";
import { registerDeckContentProvider } from "./deck";
import { registerDraftContentProvider } from "./draft";
import { registerJourneyLifecycleContentProvider } from "./lifecycle";
import { registerSiteContentProvider } from "./sites";
import { registerBattleInitProvider } from "../battle/journey-battle";
import { fixtureBattleInitProvider } from "../replay/fixture-providers";
import { TEST_CONTENT_CONFIG } from "../../testing/journey-genesis";
import { GENESIS, TIMESTAMP, ENGINE_CONFIG, makePrng, lifecycleProvider, draftProvider, siteProvider, deckProvider } from "./journey-properties-fixtures";
import { generateEvent, START_JOURNEY_ENTRY, SEQUENCE_COUNT, allSequences } from "./journey-properties-generators";



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
// Event classification
// ---------------------------------------------------------------------------

/**
 * Debug / QA / carve-out event types EXCLUDED from the random generator for
 * suite (a). The two carve-out events (`RESET_JOURNEY`, `SET_DRAFT_STATE`) may
 * legitimately null a run field; the remaining debug edits (`SET_*` overrides,
 * atlas/augury/source debug) are QA escape hatches with no bearing on the
 * normal-gameplay invariant. Excluding them makes (a) crisp: with the generator
 * drawing only from the remaining events, the run fields must NEVER go non-null
 * → null. `LOAD_STATE` is IN the generator: `validateLoadedState` bounces any
 * snapshot that would null a currently non-null run field (or carries a foreign
 * seed / malformed shape), so the invariant holds for it in-reducer and the
 * property sweep asserts it rather than carving it out.
 */
const DEBUG_EVENT_TYPES: ReadonlySet<string> = new Set<string>([
  "SET_DRAFT_STATE",
  "SET_ESSENCE",
  "SET_MAX_DREAMSIGNS",
  "SET_DREAMSIGN_POOL",
  "SET_DECK_ENTRY_STAT_OVERRIDE",
  "SET_DECK_ENTRY_KEYWORDS",
  "SET_CARD_SOURCE_DEBUG",
  "REROLL_AUGURY",
  "REROLL_AVATAR_OFFER",
  "FORCE_AUGURY_ARCHETYPE",
  "RESET_JOURNEY",
]);


/** The three run fields the nullability invariant protects. */
const RUN_FIELDS = ["draftState", "resolvedPackage", "avatar"] as const;


/**
 * The nullability checker: returns the name of the first run field that
 * transitioned non-null → null between `before` and `after`, or `null` when the
 * step preserved every run field. Shared by the property sweep and the negative
 * control so the control proves the very checker the sweep relies on can fire.
 */
function firstNulledRunField(
  before: FoldState,
  after: FoldState,
): (typeof RUN_FIELDS)[number] | null {
  for (const field of RUN_FIELDS) {
    if (before.journey[field] != null && after.journey[field] == null) {
      return field;
    }
  }
  return null;
}


// ---------------------------------------------------------------------------
// Sanity check: the populated start really has non-null run fields
// ---------------------------------------------------------------------------

describe("populated start fixture", () => {
  it("START_JOURNEY yields non-null avatar / resolvedPackage / draftState", () => {
    const result = foldEvents(
      ENGINE_CONFIG,
      GENESIS,
      { seq: 0, state: genesisFoldState(GENESIS) },
      [START_JOURNEY_ENTRY],
      { devMode: false },
    );
    expect(result.outcomes[0]?.outcome).toBe("applied");
    for (const field of RUN_FIELDS) {
      expect(result.state.journey[field]).not.toBeNull();
    }
  });
});


// ---------------------------------------------------------------------------
// (a) Run-field nullability
// ---------------------------------------------------------------------------

describe("(a) run-field nullability", () => {
  it("the generator emits no debug / carve-out event types", () => {
    // Guards the crispness of the invariant below: if a debug event (which MAY
    // legitimately null a run field) ever leaks into the generator, this fails
    // rather than the nullability assertion silently becoming unsound.
    const emitted = new Set<string>();
    const rng = makePrng(424242);
    for (let index = 0; index < 20_000; index += 1) {
      emitted.add(generateEvent(rng).type);
    }
    for (const type of emitted) {
      expect(DEBUG_EVENT_TYPES.has(type)).toBe(false);
    }
  });

  it("no non-debug event transitions a run field non-null → null", () => {
    let appliedCount = 0;
    let draftStateWrites = 0;
    for (const { events } of allSequences()) {
      // Fold step by step so every intermediate state is inspectable. This is
      // a faithful fold: rng is keyed by (seed, seq) exactly as `foldEvents`
      // keys it.
      let state = genesisFoldState(GENESIS);
      for (const { seq, event } of events) {
        const ctx: EventContext = {
          contentConfig: TEST_CONTENT_CONFIG,
          seq,
          rng: eventRng(GENESIS.seed, seq),
          timestamp: TIMESTAMP,
        };
        const before = state;
        const result = reduceGameEvent(before, event, ctx);
        state = result.state;
        if (result.outcome === "applied") {
          appliedCount += 1;
          // Reference inequality is a sound "wrote draftState" signal: every
          // reducer case that touches draftState returns a fresh object.
          if (before.journey.draftState !== state.journey.draftState) {
            draftStateWrites += 1;
          }
        }
        const nulled = firstNulledRunField(before, state);
        if (nulled !== null) {
          throw new Error(
            `event ${event.type} (seq ${seq}) nulled run field "${nulled}" ` +
              `— forbidden for non-debug events`,
          );
        }
      }
    }

    // Vacuity guard: if the sweep never exercised an applied draftState write,
    // the property proved nothing about the at-risk PICK_DRAFT_CARD /
    // REROLL_SHOP paths. Fail loudly rather than pass vacuously.
    expect(appliedCount).toBeGreaterThan(SEQUENCE_COUNT); // events broadly apply
    expect(draftStateWrites).toBeGreaterThan(0); // draftState is actually rewritten
  });
});
