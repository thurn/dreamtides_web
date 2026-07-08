// The Tango screen registry — the fallback resolver that `ScreenRouter` consults
// when `runtimeConfig.uiVariant === "tango"`. It maps a quest screen (or site)
// to its Tango adapter, or returns null when no Tango implementation exists yet,
// which makes `ScreenRouter` fall back to the legacy screen for that route. This
// is what lets the migration proceed one screen at a time while the app stays
// fully navigable.
//
// Each entry renders an ADAPTER (a wiring-only component outside `src/tango/`
// that owns `useQuest()` and calls the screen's pure `*-view-model` builder),
// never a Tango screen directly — the Tango screens are pure and hold no state.

import type { ReactNode } from "react";
import type { JourneyExplanation } from "../../journeys";
import type { RuntimeConfig } from "../../runtime/runtime-config";
import type { Screen, SiteState } from "../../types/quest";
import { QuestStartScreenAdapter } from "./QuestStartScreenAdapter";
import { DreamscapeScreenAdapter } from "./DreamscapeScreenAdapter";
import { AtlasScreenAdapter } from "./AtlasScreenAdapter";
import { DraftSiteScreenAdapter } from "./DraftSiteScreenAdapter";

/**
 * App-level actions a Tango screen may trigger that live outside quest state —
 * currently opening the deck-viewer overlay, which `QuestApp` owns. Threaded
 * from `ScreenRouter` so an in-screen HUD control (the dreamscape deck sprite)
 * can raise the same overlay the quest menu does.
 */
export interface TangoScreenHandlers {
  /** Open the deck-viewer overlay. */
  onViewDeck?: () => void;
  /**
   * Runtime flags parsed at app boot. Site migrations that replace legacy route
   * implementations receive the same configuration the legacy route receives.
   */
  runtimeConfig?: RuntimeConfig;
  /** Update the journey-debug explanation panel owned by App. */
  onJourneyExplanationChange?: (explanation: JourneyExplanation | null) => void;
}

/**
 * The Tango implementation of a top-level `Screen`, or null when none exists yet
 * (the caller then renders the legacy screen). Only screens listed here are
 * served by the Tango UI; every other screen falls back to legacy.
 */
export function tangoScreenFor(
  screen: Screen,
  handlers: TangoScreenHandlers = {},
): ReactNode | null {
  switch (screen.type) {
    case "questStart":
      return <QuestStartScreenAdapter />;
    case "dreamscape":
      return <DreamscapeScreenAdapter onViewDeck={handlers.onViewDeck} />;
    case "atlas":
      return <AtlasScreenAdapter onViewDeck={handlers.onViewDeck} />;
    default:
      return null;
  }
}

/**
 * The Tango implementation of a site screen, or null when none exists yet (the
 * caller then renders the legacy site screen). The migrated site owns its
 * responsive Tango idioms internally.
 */
export function tangoSiteScreenFor(
  site: SiteState,
  handlers: TangoScreenHandlers = {},
): ReactNode | null {
  switch (site.type) {
    case "Draft":
      return (
        <DraftSiteScreenAdapter
          siteId={site.id}
          onViewDeck={handlers.onViewDeck}
        />
      );
    default:
      return null;
  }
}
