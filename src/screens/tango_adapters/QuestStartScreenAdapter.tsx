// Adapter bridging live quest state to the pure Tango Dreamcaller-select screen
// (`src/tango/screens/QuestStartScreen`). Adapters are wiring only: this one
// owns `useQuest()`, the once-per-mount offer + run seed (both random, so they
// belong on the impure side), and the pick→`startQuest` callback. All mapping
// from domain data to the screen's view types lives in the pure builder
// (`quest-start-view-model.ts`); the Tango screen itself stays pure and
// data-driven, per the isolation boundary.

import { useCallback, useMemo, useRef } from "react";
import { useQuest } from "../../state/quest-context";
import { selectDreamcallerOffer } from "../../data/dreamcaller-selection";
import { generateQuestSeed } from "../../state/quest-state-actions";
import type { DreamcallerContent } from "../../types/content";
import { buildDreamcallerOfferViews } from "./quest-start-view-model";
import { QuestStartScreen } from "../../tango/screens/QuestStartScreen";

/**
 * Live Dreamcaller-select screen: mints the offer + run seed once, builds the
 * view-model (which previews each Dreamcaller's dealt tides), and hands the
 * chosen Dreamcaller (with the previewed seed, so the dealt pool matches the
 * tides shown) to `startQuest`.
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
