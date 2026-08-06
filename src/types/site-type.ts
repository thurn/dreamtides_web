/** Site implementations supported by journey routing and persisted state. */
export const SITE_TYPES = [
  "Battle",
  "Draft",
  "Shop",
  "Purge",
  "Essence",
  "Transfiguration",
  "Duplication",
  "Reward",
  "Augury",
  "DreamsignMarket",
  "DreamsignRevelation",
  "RandomSite",
  "Gamble",
  "Exploration",
] as const;

/** All site types available in dreamscapes. */
export type SiteType = (typeof SITE_TYPES)[number];

/** Site implementations that can safely be materialized by Random Site. */
export const RANDOM_SITE_DESTINATION_TYPES = [
  "Shop",
  "Purge",
  "Transfiguration",
  "Duplication",
  "Augury",
  "DreamsignMarket",
  "DreamsignRevelation",
  "Gamble",
  "Exploration",
] as const satisfies readonly SiteType[];

export type RandomSiteDestinationType =
  (typeof RANDOM_SITE_DESTINATION_TYPES)[number];

/** Whether an unknown value names a routed journey site implementation. */
export function isSiteType(value: unknown): value is SiteType {
  return (
    typeof value === "string" &&
    (SITE_TYPES as readonly string[]).includes(value)
  );
}
