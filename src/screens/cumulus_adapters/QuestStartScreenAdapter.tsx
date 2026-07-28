// Adapter bridging live quest state to the pure Cumulus DreamAvatar-select screen
// (`src/cumulus/screens/QuestStartScreen`). Adapters are wiring only: this one
// owns `useQuest()`, derives the shared offer from the room seed, and wires the
// pick→`startQuest` callback. All mapping
// from domain data to the screen's view types lives in the pure builder
// (`quest-start-view-model.ts`); the Cumulus screen itself stays pure and
// data-driven, per the isolation boundary.

import { useCallback, useEffect, useMemo } from "react";
import { useQuest } from "../../state/quest-context";
import { logEventOnce } from "../../logging";
import {
  buildDreamAvatarOfferViews,
  resolveDreamAvatarOffer,
} from "./quest-start-view-model";
import { QuestStartScreen } from "../../cumulus/screens/QuestStartScreen";

/**
 * Live DreamAvatar-select screen: derives the offer and preview from the room's
 * immutable seed, then hands the chosen DreamAvatar to `startQuest`.
 */
export function QuestStartScreenAdapter() {
  const { state, mutations, questContent } = useQuest();
  const questSeed = state.seed;
  const rerollCount =
    state.screen.type === "questStart" ? (state.screen.rerollCount ?? 0) : 0;
  const tutorialDreamAvatarId =
    state.screen.type === "questStart"
      ? state.screen.tutorialDreamAvatarId
      : undefined;
  const offered = useMemo(
    () =>
      resolveDreamAvatarOffer(
        questContent.dreamAvatars,
        questSeed,
        rerollCount,
        tutorialDreamAvatarId,
      ),
    [
      questContent.dreamAvatars,
      questSeed,
      rerollCount,
      tutorialDreamAvatarId,
    ],
  );

  useEffect(() => {
    const dreamAvatarIds = offered.map((dreamAvatar) => dreamAvatar.id);
    logEventOnce(
      `dream-avatar-offer:${questSeed}:${String(rerollCount)}:${dreamAvatarIds.join(",")}`,
      "dream_avatar_offer_shown",
      { dreamAvatarIds, questSeed, rerollCount },
    );
  }, [offered, questSeed, rerollCount]);

  const dreamAvatars = useMemo(
    () =>
      buildDreamAvatarOfferViews(
        offered,
        questContent.poolContext,
        questSeed,
        questContent.tutorialQuestPool,
        tutorialDreamAvatarId,
      ),
    [
      offered,
      questContent.poolContext,
      questContent.tutorialQuestPool,
      questSeed,
      tutorialDreamAvatarId,
    ],
  );

  const handlePick = useCallback(
    (dreamAvatarId: string) => {
      const dreamAvatar = offered.find(
        (candidate) => candidate.id === dreamAvatarId,
      );
      if (dreamAvatar === undefined) return;
      mutations.startQuest(dreamAvatar, questSeed);
    },
    [mutations, offered, questSeed],
  );

  const handleReroll = useCallback(() => {
    mutations.rerollDreamAvatarOffer();
  }, [mutations]);

  return (
    <QuestStartScreen
      key={rerollCount}
      dreamAvatars={dreamAvatars}
      onPick={handlePick}
      onReroll={
        tutorialDreamAvatarId === undefined ? handleReroll : undefined
      }
    />
  );
}
