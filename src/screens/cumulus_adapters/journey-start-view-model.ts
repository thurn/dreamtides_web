// The pure view-model builder for the Cumulus DreamAvatar-select screen. Every
// mapping rule between journey domain data and `JourneyStartScreen`'s view types
// lives here as plain, unit-testable functions — no React, no state hooks, no
// effects. `JourneyStartScreenAdapter` acquires live state and calls
// `buildDreamAvatarOfferViews`; this module never acquires anything itself.

import { selectedTides4Decks } from "../../data/tides4-preview";
import { selectDreamAvatarOfferForReroll } from "../../data/dream-avatar-selection";
import type { RunPoolContext } from "../../data/journey-content";
import type { DreamAvatarContent } from "../../types/content";
import type { Tides4Color, Tides4DeckJson } from "../../draft/pool/tides4-io";
import type { Tide } from "../../cumulus/components/hud/tide-spec";
import type {
  TutorialJourneyPool,
  TutorialJourneyTide,
} from "../../data/tutorial-journey-pool";
import type { TutorialJourneyStartConfiguration } from "../../types/tutorial";
import type {
  DreamAvatarOfferView,
  DreamAvatarTideView,
  JourneyStartGuideDialogueView,
} from "../../cumulus/screens/JourneyStartScreen";
import { tutorialSpeechBubbleDelaySeconds } from "../../data/tutorial-speech-bubble";

/** The select screen shows at most this many tides per DreamAvatar. */
const MAX_TIDES_SHOWN = 4;

/** Map a tides4 deck color to the Cumulus {@link Tide} whose icon + palette it uses. */
const TIDE_BY_COLOR: Record<Tides4Color, Tide> = {
  purple: "shadow",
  green: "wild",
  yellow: "valor",
  blue: "vision",
  orange: "ember",
};

/**
 * Resolve the shared journey-start offer. Tutorial selection persists one exact
 * UUID in journey state; ordinary runs derive their three choices from the room
 * seed and shared reroll count.
 */
export function resolveDreamAvatarOffer(
  dreamAvatars: readonly DreamAvatarContent[],
  journeySeed: string,
  rerollCount: number,
  tutorialDreamAvatarId?: string,
): DreamAvatarContent[] {
  if (tutorialDreamAvatarId !== undefined) {
    const tutorialDreamAvatar = dreamAvatars.find(
      (candidate) => candidate.id === tutorialDreamAvatarId,
    );
    return tutorialDreamAvatar === undefined ? [] : [tutorialDreamAvatar];
  }
  return selectDreamAvatarOfferForReroll(
    dreamAvatars,
    journeySeed,
    rerollCount,
  );
}

/** Build Mira's fixed guidance for the tutorial-only DreamAvatar offer. */
export function buildJourneyStartGuideDialogue(
  tutorialDreamAvatarId?: string,
  speechBubble?: TutorialJourneyStartConfiguration["speechBubble"],
): JourneyStartGuideDialogueView | undefined {
  if (tutorialDreamAvatarId === undefined || speechBubble === undefined) {
    return undefined;
  }
  return {
    id: `journey-start-guidance:${tutorialDreamAvatarId}`,
    model: {
      portrait: { kind: "character-portrait", characterId: "mira" },
      portraitAlt: "Mira",
      speakerName: "Mira",
      text: speechBubble.text,
    },
    delaySeconds: tutorialSpeechBubbleDelaySeconds(speechBubble),
    horizontalOffset: speechBubble.horizontalOffset,
    verticalOffset: speechBubble.verticalOffset,
    bubbleWidth: speechBubble.bubbleWidth,
  };
}

/** The total number of cards (counting copies) in a tide's decklist. */
function tideCardCount(tide: Tides4DeckJson): number {
  return tide.cards.reduce((sum, card) => sum + card.copies, 0);
}

/**
 * Cap the tides shown for a DreamAvatar at {@link MAX_TIDES_SHOWN}, keeping the
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
function toTideView(tide: Tides4DeckJson): DreamAvatarTideView {
  return {
    id: tide.id,
    label: tide.displayName ?? tide.shortName ?? tide.name,
    description:
      tide.displayDescription ?? tide.summary ?? tide.description ?? tide.name,
    tide: TIDE_BY_COLOR[tide.color],
  };
}

function toTutorialTideView(tide: TutorialJourneyTide): DreamAvatarTideView {
  return {
    id: tide.id,
    label: tide.name,
    description: tide.description,
    tide: tide.type,
  };
}

/**
 * Resolve the exact tides selected for one DreamAvatar under a run seed to the
 * shared player-facing tide view. The largest-four cap matches the selection
 * screen, so later references show the same tide set the player chose.
 */
export function buildDreamAvatarTideViews(
  poolContext: RunPoolContext | undefined,
  dreamAvatar: DreamAvatarContent,
  journeySeed: string,
): DreamAvatarTideView[] {
  return largestTides(
    selectedTides4Decks(poolContext, dreamAvatar, journeySeed),
  ).map(toTideView);
}

/**
 * Map one offered DreamAvatar (with the tide decks its pool would be dealt
 * from) to the screen's view type, capped by {@link largestTides}.
 *
 * A `tides4` run shows its dealt tides in place of the signature cards, so the
 * signature list is suppressed whenever tides exist. Each signature name is
 * paired with its index-aligned stable UUID so keys stay unique when two
 * signature cards share a display name.
 */
export function toDreamAvatarOfferView(
  dreamAvatar: DreamAvatarContent,
  tides: Tides4DeckJson[],
): DreamAvatarOfferView {
  const signatureCardIds = dreamAvatar.signatureCardIds ?? [];
  const signatureCards =
    tides.length > 0
      ? []
      : (dreamAvatar.signatureCards ?? []).map((name, index) => ({
          id: signatureCardIds[index] ?? `${name}-${String(index)}`,
          name,
        }));
  return {
    id: dreamAvatar.id,
    name: dreamAvatar.name,
    title: dreamAvatar.title,
    imageNumber: dreamAvatar.imageNumber,
    portraitFocus: dreamAvatar.portraitFocus,
    renderedText: dreamAvatar.renderedText,
    startingEssence: dreamAvatar.startingEssence,
    signatureCards,
    tides: largestTides(tides).map(toTideView),
  };
}

/**
 * The full view-model for the DreamAvatar-select screen: each offered
 * DreamAvatar with the (capped) tide preview its pool would be dealt from
 * under `journeySeed`. Deterministic in its arguments — the caller owns minting
 * the offer and the seed.
 */
export function buildDreamAvatarOfferViews(
  offered: DreamAvatarContent[],
  poolContext: RunPoolContext | undefined,
  journeySeed: string,
  tutorialJourneyPool?: TutorialJourneyPool,
  tutorialDreamAvatarId?: string,
): DreamAvatarOfferView[] {
  return offered.map((dreamAvatar) => {
    const tutorialTides =
      tutorialDreamAvatarId === dreamAvatar.id &&
      tutorialJourneyPool?.dreamAvatarId === dreamAvatar.id
        ? tutorialJourneyPool.tides
        : undefined;
    if (tutorialTides !== undefined) {
      return {
        ...toDreamAvatarOfferView(dreamAvatar, []),
        signatureCards: [],
        tides: tutorialTides.map(toTutorialTideView),
      };
    }
    return toDreamAvatarOfferView(
      dreamAvatar,
      selectedTides4Decks(poolContext, dreamAvatar, journeySeed),
    );
  });
}
