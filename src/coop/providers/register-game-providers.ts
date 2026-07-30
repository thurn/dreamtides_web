// The single entry point that wires the REAL content generators behind the five
// reducer content seams. Until this runs, every provider-backed event
// (`START_JOURNEY`, `SELECT_DREAM_AVATAR`, `ADD_CARD`, `ADD_DREAMSIGN`,
// content-coupled `OPEN_SITE`, `REROLL_SHOP`, `BEGIN_BATTLE`) BOUNCES.
//
// The five adapters live OUTSIDE `src/rules/**` because they import impure
// modules (async-loaded TOML content, the atlas / shop / battle generators). The
// content is loaded once at app init (`loadJourneyContent`) and captured in the
// adapter closures here, so the providers are synchronous and deterministic at
// fold time.
//
// DETERMINISM / REGISTRATION INVARIANT (design spec §Randomness and time):
// `registerGameProviders` MUST run BEFORE any event is folded, and every client
// on the same build MUST register the SAME content, or one client APPLIES a
// provider-backed event while another BOUNCES (or they compute different
// content from the same rng) and their folds diverge. Registration is a global
// fact of the deployed build, not per-client state.
//
// SEAM (Task 26/27): the call site is the app / coop bootstrap — it awaits
// `loadJourneyContent` and calls `registerGameProviders(content)` before mounting
// the room / folding the log.

import type { JourneyContent } from "../../data/journey-content";
import {
  registerBattleCompletionProvider,
  registerBattleInitProvider,
  registerTutorialBattleInitProvider,
} from "../../rules/battle/battle-events";
import { registerDeckContentProvider } from "../../rules/journey/deck";
import { registerDraftContentProvider } from "../../rules/journey/draft";
import { registerJourneyLifecycleContentProvider } from "../../rules/journey/lifecycle";
import { registerSiteContentProvider } from "../../rules/journey/sites";
import { registerCardTutorialGuidanceContentProvider } from "../../rules/card-tutorial-guidance";
import {
  createBattleCompletionProvider,
  createBattleInitProvider,
  createTutorialBattleInitProvider,
} from "./battle-init-provider";
import { createDeckContentProvider } from "./deck-provider";
import { createDraftContentProvider } from "./draft-provider";
import { createJourneyLifecycleContentProvider } from "./lifecycle-provider";
import { createSiteContentProvider } from "./site-provider";
import { createCardTutorialGuidanceContentProvider } from "./card-tutorial-guidance-provider";

/**
 * Register the real content providers on all five reducer seams from the loaded
 * journey content. Idempotent; the last registration wins. Call once, before
 * folding any event.
 */
export function registerGameProviders(content: JourneyContent): void {
  registerJourneyLifecycleContentProvider(
    createJourneyLifecycleContentProvider(content),
  );
  registerDeckContentProvider(createDeckContentProvider(content));
  registerDraftContentProvider(createDraftContentProvider(content));
  registerSiteContentProvider(createSiteContentProvider(content));
  registerBattleInitProvider(createBattleInitProvider(content));
  registerBattleCompletionProvider(createBattleCompletionProvider(content));
  registerTutorialBattleInitProvider(createTutorialBattleInitProvider(content));
  registerCardTutorialGuidanceContentProvider(
    createCardTutorialGuidanceContentProvider(content),
  );
}

/**
 * Clear every game-provider registration. Primarily for test isolation so a
 * registration never leaks across suites; symmetric with
 * {@link registerGameProviders}.
 */
export function clearGameProviders(): void {
  registerJourneyLifecycleContentProvider(null);
  registerDeckContentProvider(null);
  registerDraftContentProvider(null);
  registerSiteContentProvider(null);
  registerBattleInitProvider(null);
  registerBattleCompletionProvider(null);
  registerTutorialBattleInitProvider(null);
  registerCardTutorialGuidanceContentProvider(null);
}
