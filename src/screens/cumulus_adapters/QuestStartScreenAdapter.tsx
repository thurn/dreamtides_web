// Adapter bridging live quest state to the pure Cumulus Dreamcaller-select screen
// (`src/cumulus/screens/QuestStartScreen`). Adapters are wiring only: this one
// owns `useQuest()`, derives the shared offer from the room seed, and wires the
// pick→`startQuest` callback. All mapping
// from domain data to the screen's view types lives in the pure builder
// (`quest-start-view-model.ts`); the Cumulus screen itself stays pure and
// data-driven, per the isolation boundary.

import { useCallback, useEffect, useMemo } from "react";
import { useQuest } from "../../state/quest-context";
import { selectDreamcallerOfferForReroll } from "../../data/dreamcaller-selection";
import { logEventOnce } from "../../logging";
import { buildDreamcallerOfferViews } from "./quest-start-view-model";
import { QuestStartScreen } from "../../cumulus/screens/QuestStartScreen";

/**
 * Live Dreamcaller-select screen: derives the offer and preview from the room's
 * immutable seed, then hands the chosen Dreamcaller to `startQuest`.
 */
export function QuestStartScreenAdapter() {
  const { state, mutations, questContent } = useQuest();
  const questSeed = state.seed;
  const rerollCount =
    state.screen.type === "questStart" ? (state.screen.rerollCount ?? 0) : 0;
  const offered = useMemo(
    () =>
      selectDreamcallerOfferForReroll(
        questContent.dreamcallers,
        questSeed,
        rerollCount,
      ),
    [questContent.dreamcallers, questSeed, rerollCount],
  );

  useEffect(() => {
    const dreamcallerIds = offered.map((dreamcaller) => dreamcaller.id);
    logEventOnce(
      `dreamcaller-offer:${questSeed}:${String(rerollCount)}:${dreamcallerIds.join(",")}`,
      "dreamcaller_offer_shown",
      { dreamcallerIds, questSeed, rerollCount },
    );
  }, [offered, questSeed, rerollCount]);

  const dreamcallers = useMemo(
    () =>
      buildDreamcallerOfferViews(offered, questContent.poolContext, questSeed),
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

  const handleReroll = useCallback(() => {
    mutations.rerollDreamcallerOffer();
  }, [mutations]);

  return (
    <QuestStartScreen
      key={rerollCount}
      dreamcallers={dreamcallers}
      onPick={handlePick}
      onReroll={handleReroll}
    />
  );
}
