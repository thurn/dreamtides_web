// Adapter bridging live journey state to the pure Cumulus DreamAvatar-select screen
// (`src/cumulus/screens/JourneyStartScreen`). Adapters are wiring only: this one
// owns `useJourney()`, derives the shared offer from the room seed, and wires the
// pick→`startJourney` callback. All mapping
// from domain data to the screen's view types lives in the pure builder
// (`journey-start-view-model.ts`); the Cumulus screen itself stays pure and
// data-driven, per the isolation boundary.

import { useCallback, useEffect, useMemo } from "react";
import { useJourney } from "../../state/journey-context";
import { logEventOnce } from "../../logging";
import {
  buildDreamAvatarOfferViews,
  buildJourneyStartGuideDialogue,
  resolveDreamAvatarOffer,
} from "./journey-start-view-model";
import { JourneyStartScreen } from "../../cumulus/screens/JourneyStartScreen";

/**
 * Live DreamAvatar-select screen: derives the offer and preview from the room's
 * immutable seed, then hands the chosen DreamAvatar to `startJourney`.
 */
export function JourneyStartScreenAdapter() {
  const { state, mutations, journeyContent } = useJourney();
  const journeySeed = state.seed;
  const rerollCount =
    state.screen.type === "journeyStart" ? (state.screen.rerollCount ?? 0) : 0;
  const tutorialDreamAvatarId =
    state.screen.type === "journeyStart"
      ? state.screen.tutorialDreamAvatarId
      : undefined;
  const offered = useMemo(
    () =>
      resolveDreamAvatarOffer(
        journeyContent.dreamAvatars,
        journeySeed,
        rerollCount,
        tutorialDreamAvatarId,
      ),
    [
      journeyContent.dreamAvatars,
      journeySeed,
      rerollCount,
      tutorialDreamAvatarId,
    ],
  );

  useEffect(() => {
    const dreamAvatarIds = offered.map((dreamAvatar) => dreamAvatar.id);
    logEventOnce(
      `dream-avatar-offer:${journeySeed}:${String(rerollCount)}:${dreamAvatarIds.join(",")}`,
      "dream_avatar_offer_shown",
      { dreamAvatarIds, journeySeed, rerollCount },
    );
  }, [offered, journeySeed, rerollCount]);

  const dreamAvatars = useMemo(
    () =>
      buildDreamAvatarOfferViews(
        offered,
        journeyContent.poolContext,
        journeySeed,
        journeyContent.tutorialJourneyPool,
        tutorialDreamAvatarId,
      ),
    [
      offered,
      journeyContent.poolContext,
      journeyContent.tutorialJourneyPool,
      journeySeed,
      tutorialDreamAvatarId,
    ],
  );
  const guideDialogue = useMemo(
    () =>
      buildJourneyStartGuideDialogue(
        tutorialDreamAvatarId,
        journeyContent.tutorialJourneyStart?.speechBubble,
      ),
    [
      journeyContent.tutorialJourneyStart?.speechBubble,
      tutorialDreamAvatarId,
    ],
  );

  const handleGuideDialogueShown = useCallback(() => {
    if (tutorialDreamAvatarId === undefined || guideDialogue === undefined) {
      return;
    }
    logEventOnce(
      `tutorial-dream-avatar-guidance:${journeySeed}:${tutorialDreamAvatarId}`,
      "tutorial_dream_avatar_guidance_shown",
      {
        dreamAvatarId: tutorialDreamAvatarId,
        speakerName: guideDialogue.model.speakerName,
        delaySeconds: guideDialogue.delaySeconds,
        horizontalOffsetPx: guideDialogue.horizontalOffset,
        verticalOffsetPx: guideDialogue.verticalOffset,
        bubbleWidthPx: guideDialogue.bubbleWidth,
        text: guideDialogue.model.text,
      },
    );
  }, [
    guideDialogue,
    journeySeed,
    tutorialDreamAvatarId,
  ]);

  const handlePick = useCallback(
    (dreamAvatarId: string) => {
      const dreamAvatar = offered.find(
        (candidate) => candidate.id === dreamAvatarId,
      );
      if (dreamAvatar === undefined) return;
      mutations.startJourney(dreamAvatar, journeySeed);
    },
    [mutations, offered, journeySeed],
  );

  const handleReroll = useCallback(() => {
    mutations.rerollDreamAvatarOffer();
  }, [mutations]);

  return (
    <JourneyStartScreen
      key={rerollCount}
      dreamAvatars={dreamAvatars}
      guideDialogue={guideDialogue}
      onGuideDialogueShown={handleGuideDialogueShown}
      onPick={handlePick}
      onReroll={
        tutorialDreamAvatarId === undefined ? handleReroll : undefined
      }
    />
  );
}
