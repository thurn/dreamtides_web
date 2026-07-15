// Adapter bridging live quest state to the pure Cumulus Dreamcaller-select screen
// (`src/cumulus/screens/QuestStartScreen`). Adapters are wiring only: this one
// owns `useQuest()`, derives the shared offer from the room seed, and wires the
// pick→`startQuest` callback. All mapping
// from domain data to the screen's view types lives in the pure builder
// (`quest-start-view-model.ts`); the Cumulus screen itself stays pure and
// data-driven, per the isolation boundary.

import { useCallback, useMemo } from "react";
import { useQuest } from "../../state/quest-context";
import { selectDreamcallerOfferForSeed } from "../../data/dreamcaller-selection";
import { buildDreamcallerOfferViews } from "./quest-start-view-model";
import { QuestStartScreen } from "../../cumulus/screens/QuestStartScreen";

/**
 * Live Dreamcaller-select screen: derives the offer and preview from the room's
 * immutable seed, then hands the chosen Dreamcaller to `startQuest`.
 */
export function QuestStartScreenAdapter() {
  const { state, mutations, questContent } = useQuest();
  const questSeed = state.seed;
  const offered = useMemo(
    () => selectDreamcallerOfferForSeed(questContent.dreamcallers, questSeed),
    [questContent.dreamcallers, questSeed],
  );

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

  return <QuestStartScreen dreamcallers={dreamcallers} onPick={handlePick} />;
}
