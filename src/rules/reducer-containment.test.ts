import { describe, expect, it } from "vitest";
import { foldEvents } from "../eventlog/fold";
import { genesisFoldState } from "./fold-state";
import { GAME_ENGINE_CONFIG } from "./replay/replay";
import { registerJourneyLifecycleContentProvider } from "./journey/lifecycle";
import { testJourneyLifecycleContentProvider } from "./journey/test-content-providers";
import { testAvatarId } from "../types/test-identities";
import { GENESIS, event } from "./reducer-fixtures";



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
