// The exhaustive production registry. Each screen entry renders an adapter
// outside `src/cumulus/` that owns quest state and supplies a pure Cumulus
// screen with a view model and callbacks.

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
import { DuplicationSiteScreenAdapter } from "./DuplicationSiteScreenAdapter";
import { DreamAugurySiteScreenAdapter } from "./DreamAugurySiteScreenAdapter";
import { WorkInProgressSiteScreenAdapter } from "./WorkInProgressSiteScreenAdapter";
import { QuestCompleteScreenAdapter } from "./QuestCompleteScreenAdapter";
import { QuestFailedScreenAdapter } from "./QuestFailedScreenAdapter";

export type NonSiteScreen = Exclude<Screen, { type: "site" }>;

export type SiteDisposition =
  | { kind: "screen"; screen: ReactNode }
  | { kind: "battle" }
  | { kind: "inline" };

/** Resolves every top-level, non-site gameplay screen to its Cumulus adapter. */
export function screenFor(screen: NonSiteScreen): ReactNode {
  switch (screen.type) {
    case "questStart":
      return <QuestStartScreenAdapter />;
    case "dreamscape":
      return <DreamscapeScreenAdapter />;
    case "atlas":
      return <AtlasScreenAdapter />;
    case "questComplete":
      return <QuestCompleteScreenAdapter />;
    case "questFailed":
      return <QuestFailedScreenAdapter />;
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
    case "Gamble":
    case "TemporalFork":
      return {
        kind: "screen",
        screen: <WorkInProgressSiteScreenAdapter siteId={site.id} />,
      };
  }
}
