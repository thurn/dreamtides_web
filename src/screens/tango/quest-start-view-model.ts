// The pure view-model builder for the Tango Dreamcaller-select screen. Every
// mapping rule between quest domain data and `QuestStartScreen`'s view types
// lives here as plain, unit-testable functions — no React, no state hooks, no
// effects. `QuestStartScreenAdapter` acquires live state and calls
// `buildDreamcallerOfferViews`; this module never acquires anything itself.

import { selectedTides4Decks } from "../../data/tides4-preview";
import type { RunPoolContext } from "../../data/quest-content";
import type { DreamcallerContent } from "../../types/content";
import type { Tides4Color, Tides4DeckJson } from "../../draft/pool/tides4-io";
import type { Tide } from "../../tango/components/hud/TidePill";
import type {
  DreamcallerOfferView,
  DreamcallerTideView,
} from "../../tango/screens/QuestStartScreen";

/** The select screen shows at most this many tides per Dreamcaller. */
const MAX_TIDES_SHOWN = 4;

/** Map a tides4 deck color to the Tango {@link Tide} whose icon + palette it uses. */
const TIDE_BY_COLOR: Record<Tides4Color, Tide> = {
  purple: "shadow",
  green: "wild",
  yellow: "valor",
  blue: "vision",
  orange: "ember",
};

/** The total number of cards (counting copies) in a tide's decklist. */
function tideCardCount(tide: Tides4DeckJson): number {
  return tide.cards.reduce((sum, card) => sum + card.copies, 0);
}

/**
 * Cap the tides shown for a Dreamcaller at {@link MAX_TIDES_SHOWN}, keeping the
 * largest by card count while preserving their original (join) order.
 */
export function largestTides(tides: Tides4DeckJson[]): Tides4DeckJson[] {
  if (tides.length <= MAX_TIDES_SHOWN) return tides;
  const kept = new Set(
    [...tides]
      .sort((a, b) => tideCardCount(b) - tideCardCount(a))
      .slice(0, MAX_TIDES_SHOWN),
  );
  return tides.filter((tide) => kept.has(tide));
}

/** Resolve a tide deck to the display copy shown on its pill. */
function toTideView(tide: Tides4DeckJson): DreamcallerTideView {
  return {
    id: tide.id,
    label: tide.displayName ?? tide.shortName ?? tide.name,
    description:
      tide.displayDescription ?? tide.summary ?? tide.description ?? tide.name,
    tide: TIDE_BY_COLOR[tide.color],
  };
}

/**
 * Map one offered Dreamcaller (with the tide decks its pool would be dealt
 * from, already capped by {@link largestTides}) to the screen's view type.
 *
 * A `tides4` run shows its dealt tides in place of the signature cards, so the
 * signature list is suppressed whenever tides exist. Each signature name is
 * paired with its index-aligned stable UUID so keys stay unique when two
 * signature cards share a display name.
 */
export function toDreamcallerOfferView(
  dreamcaller: DreamcallerContent,
  tides: Tides4DeckJson[],
): DreamcallerOfferView {
  const signatureCardIds = dreamcaller.signatureCardIds ?? [];
  const signatureCards =
    tides.length > 0
      ? []
      : (dreamcaller.signatureCards ?? []).map((name, index) => ({
          id: signatureCardIds[index] ?? `${name}-${String(index)}`,
          name,
        }));
  return {
    id: dreamcaller.id,
    name: dreamcaller.name,
    title: dreamcaller.title,
    imageNumber: dreamcaller.imageNumber,
    renderedText: dreamcaller.renderedText,
    startingEssence: dreamcaller.startingEssence,
    signatureCards,
    tides: tides.map(toTideView),
  };
}

/**
 * The full view-model for the Dreamcaller-select screen: each offered
 * Dreamcaller with the (capped) tide preview its pool would be dealt from
 * under `questSeed`. Deterministic in its arguments — the caller owns minting
 * the offer and the seed.
 */
export function buildDreamcallerOfferViews(
  offered: DreamcallerContent[],
  poolContext: RunPoolContext | undefined,
  questSeed: string,
): DreamcallerOfferView[] {
  return offered.map((dreamcaller) =>
    toDreamcallerOfferView(
      dreamcaller,
      largestTides(selectedTides4Decks(poolContext, dreamcaller, questSeed)),
    ),
  );
}
