import type { GambleGameId } from "./gamble";
import type { ExplorationActionId, SiteId } from "./identifiers";

declare const authoredJourneyMutationSourceBrand: unique symbol;

export const KNOWN_JOURNEY_MUTATION_SOURCES = [
  "journey_debug_editor",
  "purge_skipped",
  "purge",
  "duplication_skipped",
  "exploration_completed",
  "draft_site_completed",
  "shop_left",
  "reward_site",
  "transfiguration_skipped",
  "gamble",
  "load_journey_url",
  "debug_load_journey",
  "debug_force_legendary_offer",
  "debug_save_journey",
  "dreamscape_menu_load_journey",
  "dreamscape_menu_save_journey",
  "shop_cards_shown",
  "shop_cards_hidden",
  "augury_grant_cards_shown",
  "augury_grant_cards_hidden",
  "augury",
  "historical-log",
  "ban_site_type",
  "boost_site_appearance",
] as const;

export type KnownJourneyMutationSource =
  (typeof KNOWN_JOURNEY_MUTATION_SOURCES)[number];
type AuthoredJourneyMutationSource = string & {
  readonly [authoredJourneyMutationSourceBrand]: "JourneyMutationSource";
};
export type JourneyMutationSource =
  | KnownJourneyMutationSource
  | GambleGameId
  | `exploration:${SiteId}:${ExplorationActionId}`
  | AuthoredJourneyMutationSource;

/** Decode persisted or authored provenance at its input boundary. */
export function parseJourneyMutationSource(
  value: unknown,
): JourneyMutationSource {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error("Journey mutation source must be non-empty.");
  }
  return value as JourneyMutationSource;
}

export function journeyMutationSourceFromUnknown(
  value: unknown,
): JourneyMutationSource | null {
  try {
    return parseJourneyMutationSource(value);
  } catch {
    return null;
  }
}
