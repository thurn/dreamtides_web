// Adapter bridging live journey state to the pure Cumulus Avatar-select screen
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
  buildAvatarOfferViews,
  buildJourneyStartGuideDialogue,
  resolveAvatarOffer,
} from "./journey-start-view-model";
import { JourneyStartScreen } from "../../cumulus/screens/JourneyStartScreen";
import type { AvatarId } from "../../types/identifiers";

/**
 * Live Avatar-select screen: derives the offer and preview from the room's
 * immutable seed, then hands the chosen Avatar to `startJourney`.
 */
export function JourneyStartScreenAdapter() {
  const { state, mutations, journeyContent } = useJourney();
  const journeySeed = state.seed;
  const rerollCount =
    state.screen.type === "journeyStart" ? (state.screen.rerollCount ?? 0) : 0;
  const tutorialAvatarId =
    state.screen.type === "journeyStart"
      ? state.screen.tutorialAvatarId
      : undefined;
  const offered = useMemo(
    () =>
      resolveAvatarOffer(
        journeyContent.avatars,
        journeySeed,
        rerollCount,
        tutorialAvatarId,
      ),
    [
      journeyContent.avatars,
      journeySeed,
      rerollCount,
      tutorialAvatarId,
    ],
  );

  useEffect(() => {
    const avatarIds = offered.map((avatar) => avatar.id);
    logEventOnce(
      `avatar-offer:${journeySeed}:${String(rerollCount)}:${avatarIds.join(",")}`,
      "avatar_offer_shown",
      { avatarIds, journeySeed, rerollCount },
    );
  }, [offered, journeySeed, rerollCount]);

  const avatars = useMemo(
    () =>
      buildAvatarOfferViews(
        offered,
        journeyContent.poolContext,
        journeySeed,
        journeyContent.tutorialJourneyPool,
        tutorialAvatarId,
      ),
    [
      offered,
      journeyContent.poolContext,
      journeyContent.tutorialJourneyPool,
      journeySeed,
      tutorialAvatarId,
    ],
  );
  const guideDialogue = useMemo(
    () =>
      buildJourneyStartGuideDialogue(
        tutorialAvatarId,
        journeyContent.tutorial?.journeyStart.speechBubble,
      ),
    [journeyContent.tutorial?.journeyStart.speechBubble, tutorialAvatarId],
  );

  const handleGuideDialogueShown = useCallback(() => {
    if (tutorialAvatarId === undefined || guideDialogue === undefined) {
      return;
    }
    logEventOnce(
      `tutorial-avatar-guidance:${journeySeed}:${tutorialAvatarId}`,
      "tutorial_avatar_guidance_shown",
      {
        avatarId: tutorialAvatarId,
        speakerName: guideDialogue.model.speakerName,
        delaySeconds: guideDialogue.delaySeconds,
        horizontalOffsetPx: guideDialogue.horizontalOffset,
        verticalOffsetPx: guideDialogue.verticalOffset,
        bubbleWidthPx: guideDialogue.bubbleWidth,
        text: guideDialogue.model.text,
      },
    );
  }, [guideDialogue, journeySeed, tutorialAvatarId]);

  const handlePick = useCallback(
    (avatarId: AvatarId) => {
      const avatar = offered.find(
        (candidate) => candidate.id === avatarId,
      );
      if (avatar === undefined) return;
      mutations.startJourney(avatar, journeySeed);
    },
    [mutations, offered, journeySeed],
  );

  const handleReroll = useCallback(() => {
    mutations.rerollAvatarOffer();
  }, [mutations]);

  return (
    <JourneyStartScreen
      key={rerollCount}
      avatars={avatars}
      guideDialogue={guideDialogue}
      onGuideDialogueShown={handleGuideDialogueShown}
      onPick={handlePick}
      onReroll={tutorialAvatarId === undefined ? handleReroll : undefined}
    />
  );
}
