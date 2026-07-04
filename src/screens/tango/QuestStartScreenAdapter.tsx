// Adapter bridging live quest state to the pure Tango Dreamcaller-select screen
// (`src/tango/screens/QuestStartScreen`). The Tango isolation boundary forbids a
// screen under `src/tango/` from importing app state, so this adapter — which
// lives OUTSIDE Tango — owns `useQuest()`, the once-per-mount offer + run seed,
// and the tides4 preview, shapes them into the screen's view-model, and wires
// the pick back to `startQuest`. The Tango screen stays pure and data-driven.

import { useCallback, useMemo, useRef } from "react";
import { useQuest } from "../../state/quest-context";
import { selectDreamcallerOffer } from "../../data/dreamcaller-selection";
import { selectedTides4Decks } from "../../data/tides4-preview";
import { generateQuestSeed } from "../../state/quest-state-actions";
import type { DreamcallerContent } from "../../types/content";
import type { Tides4Color, Tides4DeckJson } from "../../draft/pool/tides4-io";
import type { Tide } from "../../tango/components/hud/TidePill";
import {
  QuestStartScreen,
  type DreamcallerOfferView,
  type DreamcallerTideView,
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
 * Live Dreamcaller-select screen: builds the offer + run seed once, previews
 * each Dreamcaller's dealt tides, and hands the chosen Dreamcaller (with the
 * previewed seed, so the dealt pool matches the tides shown) to `startQuest`.
 */
export function QuestStartScreenAdapter() {
  const { mutations, questContent } = useQuest();

  // The offer and the run seed are minted once per mount. The tides4 preview is
  // generated from this seed, and the same seed is handed to `startQuest` so the
  // dealt pool matches the tides shown.
  const offeredRef = useRef<DreamcallerContent[] | null>(null);
  if (offeredRef.current === null) {
    offeredRef.current = selectDreamcallerOffer(questContent.dreamcallers);
  }
  const offered = offeredRef.current;

  const seedRef = useRef<string | null>(null);
  if (seedRef.current === null) {
    seedRef.current = generateQuestSeed();
  }
  const questSeed = seedRef.current;

  const dreamcallers = useMemo<DreamcallerOfferView[]>(
    () =>
      offered.map((dreamcaller) => {
        const tides = largestTides(
          selectedTides4Decks(questContent.poolContext, dreamcaller, questSeed),
        );
        // A `tides4` run shows its dealt tides in place of the signature cards,
        // so suppress the signature list whenever tides exist. Pair each name
        // with its index-aligned stable UUID so keys stay unique when two
        // signature cards share a display name.
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
      }),
    [offered, questContent.poolContext, questSeed],
  );

  const handlePick = useCallback(
    (dreamcallerId: string) => {
      const dreamcaller = offered.find(
        (candidate) => candidate.id === dreamcallerId,
      );
      if (dreamcaller === undefined) return;
      mutations.startQuest(dreamcaller, questSeed);
    },
    [mutations, offered, questSeed],
  );

  return <QuestStartScreen dreamcallers={dreamcallers} onPick={handlePick} />;
}
