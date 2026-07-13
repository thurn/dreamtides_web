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
import type { Screen, SiteState } from "../../types/quest";
import { QuestStartScreenAdapter } from "./QuestStartScreenAdapter";
import { DreamscapeScreenAdapter } from "./DreamscapeScreenAdapter";
import { AtlasScreenAdapter } from "./AtlasScreenAdapter";
import { DraftSiteScreenAdapter } from "./DraftSiteScreenAdapter";
import { DreamsignRevelationScreenAdapter } from "./DreamsignRevelationScreenAdapter";
import { PurgeSiteScreenAdapter } from "./PurgeSiteScreenAdapter";
import { CardShopSiteScreenAdapter } from "./CardShopSiteScreenAdapter";
import { DreamsignBazaarSiteScreenAdapter } from "./DreamsignBazaarSiteScreenAdapter";
import { TransfigurationSiteScreenAdapter } from "./TransfigurationSiteScreenAdapter";

/**
 * The Tango implementation of a top-level `Screen`, or null when none exists yet
 * (the caller then renders the legacy screen). Only screens listed here are
 * served by the Tango UI; every other screen falls back to legacy.
 */
export function tangoScreenFor(
  screen: Screen,
): ReactNode | null {
  switch (screen.type) {
    case "questStart":
      return <QuestStartScreenAdapter />;
    case "dreamscape":
      return <DreamscapeScreenAdapter />;
    case "atlas":
      return <AtlasScreenAdapter />;
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
): ReactNode | null {
  switch (site.type) {
    case "Draft":
      return (
        <DraftSiteScreenAdapter siteId={site.id} />
      );
    case "DreamsignRevelation":
      return (
        <DreamsignRevelationScreenAdapter siteId={site.id} />
      );
    case "Purge":
      return (
        <PurgeSiteScreenAdapter siteId={site.id} />
      );
    case "Shop":
      return (
        <CardShopSiteScreenAdapter siteId={site.id} />
      );
    case "DreamsignMarket":
      return (
        <DreamsignBazaarSiteScreenAdapter siteId={site.id} />
      );
    case "Transfiguration":
      if (site.isEnhanced) return null;
      return (
        <TransfigurationSiteScreenAdapter siteId={site.id} />
      );
    default:
      return null;
  }
}

/** Whether a top-level screen has a registered Tango implementation. */
export function isTangoScreenRegistered(screen: Screen): boolean {
  return tangoScreenFor(screen) !== null;
}

/** Whether a site has a registered Tango implementation. */
export function isTangoSiteRegistered(site: SiteState): boolean {
  return tangoSiteScreenFor(site) !== null;
}
