// The exhaustive production registry. Each screen entry renders an adapter
// outside `src/cumulus/` that owns journey state and supplies a pure Cumulus
// screen with a view model and callbacks.

import type { ReactNode } from "react";
import type { Screen, SiteState } from "../../types/journey";
import { JourneyStartScreenAdapter } from "./JourneyStartScreenAdapter";
import { DreamscapeScreenAdapter } from "./DreamscapeScreenAdapter";
import { AtlasScreenAdapter } from "./AtlasScreenAdapter";
import { DraftSiteScreenAdapter } from "./DraftSiteScreenAdapter";
import { DreamsignRevelationScreenAdapter } from "./DreamsignRevelationScreenAdapter";
import { PurgeSiteScreenAdapter } from "./PurgeSiteScreenAdapter";
import { CardShopSiteScreenAdapter } from "./CardShopSiteScreenAdapter";
import { DreamsignBazaarSiteScreenAdapter } from "./DreamsignBazaarSiteScreenAdapter";
import { TransfigurationSiteScreenAdapter } from "./TransfigurationSiteScreenAdapter";
import { DuplicationSiteScreenAdapter } from "./DuplicationSiteScreenAdapter";
import { DreamAugurySiteScreenAdapter } from "./DreamAugurySiteScreenAdapter";
import { GambleSiteScreenAdapter } from "./GambleSiteScreenAdapter";
import { WorkInProgressSiteScreenAdapter } from "./WorkInProgressSiteScreenAdapter";
import { ExplorationSiteScreenAdapter } from "./ExplorationSiteScreenAdapter";
import { JourneyCompleteScreenAdapter } from "./JourneyCompleteScreenAdapter";
import { JourneyFailedScreenAdapter } from "./JourneyFailedScreenAdapter";

export type NonSiteScreen = Exclude<Screen, { type: "site" }>;

export type SiteDisposition =
  | { kind: "screen"; screen: ReactNode }
  | { kind: "battle" }
  | { kind: "inline" };

/** Resolves every top-level, non-site gameplay screen to its Cumulus adapter. */
export function screenFor(screen: NonSiteScreen): ReactNode {
  switch (screen.type) {
    case "journeyStart":
      return <JourneyStartScreenAdapter />;
    case "dreamscape":
      return <DreamscapeScreenAdapter />;
    case "atlas":
      return <AtlasScreenAdapter />;
    case "journeyComplete":
      return <JourneyCompleteScreenAdapter />;
    case "journeyFailed":
      return <JourneyFailedScreenAdapter />;
  }
}

/** Resolves every site type to its production rendering disposition. */
export function siteDispositionFor(site: SiteState): SiteDisposition {
  switch (site.type) {
    case "Battle":
      return { kind: "battle" };
    case "Essence":
    case "Reward":
      return { kind: "inline" };
    case "Draft":
      return {
        kind: "screen",
        screen: <DraftSiteScreenAdapter siteId={site.id} />,
      };
    case "DreamsignRevelation":
      return {
        kind: "screen",
        screen: <DreamsignRevelationScreenAdapter siteId={site.id} />,
      };
    case "Purge":
      return {
        kind: "screen",
        screen: <PurgeSiteScreenAdapter siteId={site.id} />,
      };
    case "Shop":
      return {
        kind: "screen",
        screen: <CardShopSiteScreenAdapter siteId={site.id} />,
      };
    case "DreamsignMarket":
      return {
        kind: "screen",
        screen: <DreamsignBazaarSiteScreenAdapter siteId={site.id} />,
      };
    case "Transfiguration":
      return {
        kind: "screen",
        screen: <TransfigurationSiteScreenAdapter siteId={site.id} />,
      };
    case "Duplication":
      return {
        kind: "screen",
        screen: <DuplicationSiteScreenAdapter siteId={site.id} />,
      };
    case "DreamAugury":
      return {
        kind: "screen",
        screen: <DreamAugurySiteScreenAdapter siteId={site.id} />,
      };
    case "TemptingOffer":
      return {
        kind: "screen",
        screen: <WorkInProgressSiteScreenAdapter siteId={site.id} />,
      };
    case "Gamble":
      return {
        kind: "screen",
        screen: <GambleSiteScreenAdapter siteId={site.id} />,
      };
    case "Exploration":
      return {
        kind: "screen",
        screen: <ExplorationSiteScreenAdapter siteId={site.id} />,
      };
  }
}
