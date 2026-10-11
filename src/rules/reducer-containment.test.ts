import { describe, expect, it } from "vitest";
import { foldEvents } from "../eventlog/fold";
import { asTutorialResult } from "../battle/test-support";
import { genesisFoldState } from "./fold-state";
import { GAME_ENGINE_CONFIG } from "./replay/replay";
import { registerJourneyLifecycleContentProvider } from "./journey/lifecycle";
import { testJourneyLifecycleContentProvider } from "./journey/test-content-providers";
import { reduceGameEvent } from "./reducer";
import { testAvatarId } from "../types/test-identities";
import { GENESIS, ctx, event, stateWithPoisonedPrompt } from "./reducer-fixtures";



// ---------------------------------------------------------------------------
// Reducer containment (P1-1) — a programmer-error throw from a domain case is
// NOT swallowed by the reducer; it propagates to the engine's fold containment.
// ---------------------------------------------------------------------------

describe("reducer containment at the foldEvents layer", () => {
  it("a throwing domain case propagates in dev fold mode and becomes fold_error in prod fold mode", () => {
    // A lifecycle provider whose START_JOURNEY assembly THROWS — a stand-in for a
    // programmer error deep inside a domain case (the reducer never swallows it).
    registerJourneyLifecycleContentProvider(
      testJourneyLifecycleContentProvider({
        resolveAvatarPackage: () => {
          throw new Error("resolveAvatarPackage exploded");
        },
        startJourney: () => {
          throw new Error("startJourney exploded");
        },
      }),
    );
    try {
      const state = genesisFoldState(GENESIS);
      const batch = [
        {
          seq: 1,
          event: event("START_JOURNEY", {
            avatarId: testAvatarId("dc-x"),
          }),
        },
      ];
      const base = { seq: 0, state };

      // Dev fold mode: the programmer error surfaces at its origin.
      expect(() =>
        foldEvents(GAME_ENGINE_CONFIG, GENESIS, base, batch, { devMode: true }),
      ).toThrow(/startJourney exploded/);

      // Prod fold mode: contained as a bounce plus a loud error report; the
      // pre-event state is untouched (no partial application).
      const result = foldEvents(GAME_ENGINE_CONFIG, GENESIS, base, batch, {
        devMode: false,
      });
      expect(result.outcomes[0].outcome).toBe("bounced");
      expect(result.outcomes[0].error).toBeDefined();
      expect(result.state).toBe(state);
    } finally {
      registerJourneyLifecycleContentProvider(null);
    }
  });
});


describe("RESOLVE_PROMPT throw containment", () => {
  it("a throw while resolving the open prompt clears the prompt instead of wedging", () => {
    const state = stateWithPoisonedPrompt(1);
    const result = reduceGameEvent(
      state,
      event("RESOLVE_PROMPT", { promptId: 1, resolution: { kind: "foresee" } }),
      ctx(),
    );
    // The resolve applied its containment fallback: the prompt is cleared and
    // the queued automation dropped, so the game is never wedged open.
    expect(result.outcome).toBe("applied");
    expect(asTutorialResult(result).state.battle?.pendingPrompt).toBeNull();
    expect(asTutorialResult(result).state.battle?.effectQueue).toEqual([]);
  });

  it("does not swallow an invariant violation after domain-error recovery", () => {
    const state = stateWithPoisonedPrompt(1);
    const invalid = {
      ...state,
      journey: { ...state.journey, essence: -1 },
    };

    expect(() =>
      reduceGameEvent(
        invalid,
        event("RESOLVE_PROMPT", {
          promptId: 1,
          resolution: { kind: "foresee" },
        }),
        ctx(),
      ),
    ).toThrow("essence_out_of_bounds");
  });
});
