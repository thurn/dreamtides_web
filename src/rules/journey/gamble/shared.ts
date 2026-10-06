// Helpers shared by the Gamble site reducer cases: the configured game
// lookup, the open-site runtime guard, and the runtime write-back.

import { gambleGameByRulesKind } from "../../../data/gamble-data";
import type { GambleRulesKind } from "../../../types/gamble-data";
import type { GambleSiteRuntime, JourneyState } from "../../../types/journey";
import type { SiteId } from "../../../types/identifiers";
import { findSite, getSiteContentProvider } from "../sites";

export function configuredGame<Kind extends GambleRulesKind>(kind: Kind) {
  const provider = getSiteContentProvider();
  return provider === null
    ? null
    : gambleGameByRulesKind(provider.gambleData, kind);
}

export function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function runtimeFor(
  journey: JourneyState,
  siteId: SiteId,
): GambleSiteRuntime | null {
  const site = findSite(journey, siteId);
  const runtime = journey.siteRuntime[siteId];
  if (
    site?.type !== "Gamble" ||
    site.isVisited ||
    journey.screen.type !== "site" ||
    journey.screen.siteId !== siteId ||
    runtime?.kind !== "gamble"
  ) {
    return null;
  }
  return runtime;
}

export function withRuntime(
  journey: JourneyState,
  siteId: SiteId,
  runtime: GambleSiteRuntime,
): JourneyState {
  return {
    ...journey,
    siteRuntime: { ...journey.siteRuntime, [siteId]: runtime },
  };
}
