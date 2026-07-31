import { artRef, type ArtRef } from "../../cumulus/primitives/art";
import type {
  GamblePlayingCardView,
  GambleSiteView,
} from "../../cumulus/screens/GambleSiteScreen";
import type {
  PlayingCardRank,
  PlayingCardSuit,
} from "../../cumulus/components/card/PlayingCard";
import { guideForSiteType } from "../../data/dreamscapes";
import { hashStringToSeed } from "../../data/journey-content";
import { makeRng, shuffle } from "../../draft/pool/rng";
import type { DreamGuideContent } from "../../types/content";
import type { DreamscapeNode, SiteState } from "../../types/journey";
import { dreamscapeSceneRef } from "./dreamscape-view-model";

const PLAYING_CARD_RANKS: readonly PlayingCardRank[] = [
  "A",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
];

const PLAYING_CARD_SUITS: readonly PlayingCardSuit[] = [
  "clubs",
  "diamonds",
  "hearts",
  "spades",
];

/** Build the complete 52-card standard deck in stable rank-major order. */
export function buildStandardPlayingCardDeck(): GamblePlayingCardView[] {
  return PLAYING_CARD_RANKS.flatMap((rank) =>
    PLAYING_CARD_SUITS.map((suit) => ({
      id: `${rank}-${suit}`,
      rank,
      suit,
    })),
  );
}

/** Deterministically deal six unique cards for a logged deal seed. */
export function dealGamblePlayingCards(
  seed: string,
): readonly GamblePlayingCardView[] {
  const rng = makeRng(hashStringToSeed(`gamble-playing-cards:${seed}`));
  return shuffle(rng, buildStandardPlayingCardDeck()).slice(0, 6);
}

/** Resolve the resident Dream Guide for Gamble. */
export function resolveGambleGuide(
  guides: readonly DreamGuideContent[],
): DreamGuideContent | null {
  return guideForSiteType(guides, "Gamble");
}

/** Build the complete view for the visual Gamble playing-card prototype. */
export function buildGambleSiteView(params: {
  sceneNode: DreamscapeNode | null;
  site: SiteState & { type: "Gamble" };
  guide: DreamGuideContent | null;
  guideLine: string | null;
  dealSeed: string;
}): GambleSiteView {
  const guideId = params.guide?.id ?? "gravok";
  const scene: ArtRef | null =
    params.sceneNode === null ? null : dreamscapeSceneRef(params.sceneNode);
  return {
    siteId: params.site.id,
    scene,
    isEnhanced: params.site.isEnhanced,
    dealId: params.dealSeed,
    cards: dealGamblePlayingCards(params.dealSeed),
    guide: {
      id: guideId,
      name: params.guide?.name ?? "Gravok",
      line:
        params.guideLine ??
        params.guide?.dialog[0] ??
        "Fortune favors the bold, traveler.",
      art: artRef.dreamGuide(guideId),
    },
  };
}
