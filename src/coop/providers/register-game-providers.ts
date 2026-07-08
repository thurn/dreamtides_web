// The single entry point that wires the REAL content generators behind the five
// reducer content seams. Until this runs, every provider-backed event
// (`START_QUEST`, `SELECT_DREAMCALLER`, `ADD_CARD`, `ADD_DREAMSIGN`,
// content-coupled `OPEN_SITE`, `REROLL_SHOP`, `BEGIN_BATTLE`) BOUNCES.
//
// The five adapters live OUTSIDE `src/rules/**` because they import impure
// modules (async-loaded TOML content, the atlas / shop / battle generators). The
// content is loaded once at app init (`loadQuestContent`) and captured in the
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
// `loadQuestContent` and calls `registerGameProviders(content)` before mounting
// the room / folding the log.

import type { QuestContent } from "../../data/quest-content";
import { registerBattleInitProvider } from "../../rules/battle/battle-events";
import { registerDeckContentProvider } from "../../rules/quest/deck";
import { registerDraftContentProvider } from "../../rules/quest/draft";
import { registerQuestLifecycleContentProvider } from "../../rules/quest/lifecycle";
import { registerSiteContentProvider } from "../../rules/quest/sites";
import { createBattleInitProvider } from "./battle-init-provider";
import { createDeckContentProvider } from "./deck-provider";
import { createDraftContentProvider } from "./draft-provider";
import { createQuestLifecycleContentProvider } from "./lifecycle-provider";
import { createSiteContentProvider } from "./site-provider";

/**
 * Register the real content providers on all five reducer seams from the loaded
 * quest content. Idempotent; the last registration wins. Call once, before
 * folding any event.
 */
export function registerGameProviders(content: QuestContent): void {
  registerQuestLifecycleContentProvider(
    createQuestLifecycleContentProvider(content),
  );
  registerDeckContentProvider(createDeckContentProvider(content));
  registerDraftContentProvider(createDraftContentProvider(content));
  registerSiteContentProvider(createSiteContentProvider(content));
  registerBattleInitProvider(createBattleInitProvider(content));
}

/**
 * Clear every game-provider registration. Primarily for test isolation so a
 * registration never leaks across suites; symmetric with
 * {@link registerGameProviders}.
 */
export function clearGameProviders(): void {
  registerQuestLifecycleContentProvider(null);
  registerDeckContentProvider(null);
  registerDraftContentProvider(null);
  registerSiteContentProvider(null);
  registerBattleInitProvider(null);
}
