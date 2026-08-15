// The pure view-model builder for the Cumulus Avatar-select screen. Every
// mapping rule between journey domain data and `JourneyStartScreen`'s view types
// lives here as plain, unit-testable functions — no React, no state hooks, no
// effects. `JourneyStartScreenAdapter` acquires live state and calls
// `buildAvatarOfferViews`; this module never acquires anything itself.

import { selectedTides4Decks } from "../../data/tides4-preview";
import { selectAvatarOfferForReroll } from "../../data/avatar-selection";
import type { RunPoolContext } from "../../data/journey-content";
import type { AvatarContent } from "../../types/content";
import type { JourneySeed } from "../../types/journey-seed";
import type { Tides4DeckJson } from "../../draft/pool/tides4-io";
import type {
  TutorialJourneyPool,
  TutorialJourneyTide,
} from "../../data/tutorial-journey-pool";
import type { TutorialJourneyStartConfiguration } from "../../types/tutorial";
import type {
  AvatarOfferView,
  AvatarTideView,
  JourneyStartGuideDialogueView,
} from "../../cumulus/screens/JourneyStartScreen";
import { tutorialSpeechBubbleDelaySeconds } from "../../data/tutorial-speech-bubble";
import { localizedSourceText } from "../../runtime/localization/runtime";
import { tx } from "@trox/runtime";
import type { AvatarId } from "../../types/identifiers";
import { parsePresentationId } from "../../types/identifiers";

/** The select screen shows at most this many tides per Avatar. */
const MAX_TIDES_SHOWN = 4;

/**
 * Resolve the shared journey-start offer. Tutorial selection persists one exact
 * UUID in journey state; ordinary runs derive their three choices from the room
 * seed and shared reroll count.
 */
export function resolveAvatarOffer(
  avatars: readonly AvatarContent[],
  journeySeed: JourneySeed,
  rerollCount: number,
  tutorialAvatarId?: AvatarId,
): AvatarContent[] {
  if (tutorialAvatarId !== undefined) {
    const tutorialAvatar = avatars.find(
      (candidate) => candidate.id === tutorialAvatarId,
    );
    return tutorialAvatar === undefined ? [] : [tutorialAvatar];
  }
  return selectAvatarOfferForReroll(
    avatars,
    journeySeed,
    rerollCount,
  );
}

/** Build Mira's fixed guidance for the tutorial-only Avatar offer. */
export function buildJourneyStartGuideDialogue(
  tutorialAvatarId?: AvatarId,
  speechBubble?: TutorialJourneyStartConfiguration["speechBubble"],
): JourneyStartGuideDialogueView | undefined {
  if (tutorialAvatarId === undefined || speechBubble === undefined) {
    return undefined;
  }
  return {
    id: parsePresentationId(
      `journey-start-guidance:${tutorialAvatarId}`,
    ),
    model: {
      portrait: { kind: "character-portrait", characterId: "mira" },
      portraitAlt: tx("Mira", "[tutorial] Name of the tutorial guide."),
      speakerName: tx("Mira", "[tutorial] Name of the tutorial guide."),
      text: localizedSourceText(speechBubble.text),
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
 * Cap the tides shown for an Avatar at {@link MAX_TIDES_SHOWN}, keeping the
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
function toTideView(tide: Tides4DeckJson): AvatarTideView {
  return {
    id: tide.id,
    label: localizedSourceText(
      tide.displayName !== "" ? tide.displayName : tide.id,
    ),
    description: localizedSourceText(tide.displayDescription),
    tide: tide.resonance,
  };
}

function toTutorialTideView(tide: TutorialJourneyTide): AvatarTideView {
  return {
    id: tide.id,
    label: localizedSourceText(tide.name),
    description: localizedSourceText(tide.description),
    tide: tide.type,
  };
}

/**
 * Resolve the exact tides selected for one Avatar under a run seed to the
 * shared player-facing tide view. The largest-four cap matches the selection
 * screen, so later references show the same tide set the player chose.
 */
export function buildAvatarTideViews(
  poolContext: RunPoolContext | undefined,
  avatar: AvatarContent,
  journeySeed: JourneySeed,
): AvatarTideView[] {
  return largestTides(
    selectedTides4Decks(poolContext, avatar, journeySeed),
  ).map(toTideView);
}

/**
 * Map one offered Avatar (with the tide decks its pool would be dealt
 * from) to the screen's view type, capped by {@link largestTides}.
 *
 * A `tides4` run shows its dealt tides in place of the signature cards, so the
 * signature list is suppressed whenever tides exist. Each signature name is
 * paired with its index-aligned stable UUID so keys stay unique when two
 * signature cards share a display name.
 */
export function toAvatarOfferView(
  avatar: AvatarContent,
  tides: Tides4DeckJson[],
): AvatarOfferView {
  const signatureCardIds = avatar.signatureCardIds ?? [];
  const signatureCards =
    tides.length > 0
      ? []
      : (avatar.signatureCards ?? []).map((name, index) => ({
          id: signatureCardIds[index] ?? null,
          name: localizedSourceText(name),
        }));
  return {
    id: avatar.id,
    name: localizedSourceText(avatar.name),
    title: localizedSourceText(avatar.title),
    imageNumber: avatar.imageNumber,
    portraitFocus: avatar.portraitFocus,
    renderedText: localizedSourceText(avatar.renderedText),
    startingEssence: avatar.startingEssence,
    signatureCards,
    tides: largestTides(tides).map(toTideView),
  };
}

/**
 * The full view-model for the Avatar-select screen: each offered
 * Avatar with the (capped) tide preview its pool would be dealt from
 * under `journeySeed`. Deterministic in its arguments — the caller owns minting
 * the offer and the seed.
 */
export function buildAvatarOfferViews(
  offered: AvatarContent[],
  poolContext: RunPoolContext | undefined,
  journeySeed: JourneySeed,
  tutorialJourneyPool?: TutorialJourneyPool,
  tutorialAvatarId?: AvatarId,
): AvatarOfferView[] {
  return offered.map((avatar) => {
    const tutorialTides =
      tutorialAvatarId === avatar.id &&
      tutorialJourneyPool?.avatarId === avatar.id
        ? tutorialJourneyPool.tides
        : undefined;
    if (tutorialTides !== undefined) {
      return {
        ...toAvatarOfferView(avatar, []),
        signatureCards: [],
        tides: tutorialTides.map(toTutorialTideView),
      };
    }
    return toAvatarOfferView(
      avatar,
      selectedTides4Decks(poolContext, avatar, journeySeed),
    );
  });
}
