// Journey-internal content types.
//
// These mirror the CLI's `src/content/model.ts` and are the shape consumed by
// every journey-internal module. The adapter is responsible for translating
// quest prototype content into instances of these types; nothing under
// `src/journeys/journey/`, `src/journeys/content/`, `src/journeys/ui/`, or
// `src/journeys/util/` reaches back into prototype-wide types.

export type CardContent = {
  id: string;
  name: string;
  rarity: string;
  cardType: string;
  energyCost: number | "*";
  spark: number | "" | "*";
  cardNumber: number;
  raw: Record<string, unknown>;
};

export type DreamcallerContent = {
  id: string;
  name: string;
  title: string;
  awakening: string;
  raw: Record<string, unknown>;
};

export type DreamsignContent = {
  id: string;
  name: string;
  kind: "tidal" | "neutral";
  orientation?: "quest" | "battle";
  renderedText: string;
  raw: Record<string, unknown>;
};

export type ContentBundle = {
  cards: CardContent[];
  dreamcallers: DreamcallerContent[];
  dreamsigns: DreamsignContent[];
};
