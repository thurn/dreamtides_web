import { useCallback, useEffect, useMemo, useRef } from "react";
import { QuestCompleteScreen } from "../../cumulus/screens/QuestCompleteScreen";
import { logEvent } from "../../logging";
import { useQuest } from "../../state/quest-context";
import {
  buildQuestCompleteCardIds,
  buildQuestCompleteView,
} from "./quest-complete-view-model";

export function QuestCompleteScreenAdapter() {
  const { state, mutations, questContent } = useQuest();
  const hasLoggedRef = useRef(false);
  const view = useMemo(() => buildQuestCompleteView(state), [state]);
  const cardIds = useMemo(
    () => buildQuestCompleteCardIds(state.deck, questContent.cardDatabase),
    [state.deck, questContent.cardDatabase],
  );

  useEffect(() => {
    if (hasLoggedRef.current) return;
    hasLoggedRef.current = true;
    logEvent("quest_completed", {
      runId: state.runId,
      dreamcallerId: state.dreamcaller?.id ?? null,
      battlesWon: state.completionLevel,
      completedDreamscapeIds: Object.values(state.atlas.nodes)
        .filter((node) => node.state === "completed")
        .map((node) => node.id),
      deckEntryIds: state.deck.map((entry) => entry.entryId),
      cardIds,
      essenceRemaining: state.essence,
      dreamsignIds: state.dreamsigns.flatMap((dreamsign) =>
        dreamsign.id === undefined ? [] : [dreamsign.id],
      ),
    });
  }, [cardIds, state]);

  const handleNewQuest = useCallback(() => {
    logEvent("quest_complete_new_quest_clicked", {});
    mutations.resetQuest();
  }, [mutations]);
  return <QuestCompleteScreen view={view} onNewQuest={handleNewQuest} />;
}
