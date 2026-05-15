// Journey context.
//
// The minimal contract every journey-internal module reads from. The adapter
// in `src/journeys/adapter/` is responsible for producing an instance from
// quest-prototype state; nothing under `src/journeys/journey/` constructs one
// directly.
//
// Future tasks expand the projection (route, dreamwell-specific fields, etc.)
// as templates and shapes consume them. The shape here is the subset Task 3's
// shared/content helpers and predicate resolvers require.

import type { ContentBundle } from "../content/types";

export type QuestStateProjection = {
  readonly seed: string;
  readonly resources: {
    readonly essence: number;
    readonly maxEssence: number;
    readonly omens: number;
    readonly dreamscape: number;
  };
  readonly selectedTides: readonly string[];
  readonly deck: {
    readonly entries: readonly { readonly cardId: string; readonly copies: number }[];
    readonly summary: {
      readonly totalCards: number;
      readonly starterCards: number;
      readonly uniqueCards: number;
    };
  };
  readonly draftPool: readonly { readonly cardId: string; readonly copies: number }[];
  readonly activeDreamsigns: readonly { readonly dreamsignId: string }[];
  readonly dreamsignPoolIds: readonly string[];
  readonly banes: readonly { readonly baneName: string }[];
  readonly dreamcaller: { readonly id: string };
};

export type JourneyContext = {
  readonly state: { readonly quest: QuestStateProjection };
  readonly content: ContentBundle;
  readonly contentVersion: string;
};
