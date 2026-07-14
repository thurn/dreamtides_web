import { useCallback, useEffect, useMemo, useRef } from "react";
import { QuestCompleteScreen } from "../../cumulus/screens/QuestCompleteScreen";
import { downloadLog, logEvent } from "../../logging";
import { useQuest } from "../../state/quest-context";
import { buildQuestCompleteView } from "./quest-complete-view-model";

export function QuestCompleteScreenAdapter() {
  const { state, mutations, questContent } = useQuest();
  const hasLoggedRef = useRef(false);
  const view = useMemo(
    () => buildQuestCompleteView(state, questContent.cardDatabase),
    [state, questContent.cardDatabase],
  );

  useEffect(() => {
    if (hasLoggedRef.current) return;
    hasLoggedRef.current = true;
    logEvent("quest_completed", {
      runId: state.runId,
      dreamcallerId: view.dreamcaller?.id ?? null,
      battlesWon: state.completionLevel,
      completedDreamscapeIds: Object.values(state.atlas.nodes)
        .filter((node) => node.state === "completed")
        .map((node) => node.id),
      deckEntryIds: state.deck.map((entry) => entry.entryId),
      cardIds: view.finalDeck.map((entry) => entry.model.cardId),
      essenceRemaining: state.essence,
      dreamsignIds: state.dreamsigns.flatMap((dreamsign) =>
        dreamsign.id === undefined ? [] : [dreamsign.id],
      ),
      uiVariant: "cumulus",
    });
  }, [state, view]);

  const handleNewQuest = useCallback(() => {
    logEvent("quest_complete_new_quest_clicked", { uiVariant: "cumulus" });
    mutations.resetQuest();
  }, [mutations]);
  const handleDownloadLog = useCallback(() => {
    logEvent("quest_complete_log_downloaded", { uiVariant: "cumulus" });
    downloadLog();
  }, []);
  const handleOpenFinalDeck = useCallback(() => {
    logEvent("quest_complete_final_deck_opened", {
      cardIds: view.finalDeck.map((entry) => entry.model.cardId),
      uiVariant: "cumulus",
    });
  }, [view.finalDeck]);
  const handleCloseFinalDeck = useCallback(() => {
    logEvent("quest_complete_final_deck_closed", { uiVariant: "cumulus" });
  }, []);

  return (
    <QuestCompleteScreen
      view={view}
      onNewQuest={handleNewQuest}
      onDownloadLog={handleDownloadLog}
      onOpenFinalDeck={handleOpenFinalDeck}
      onCloseFinalDeck={handleCloseFinalDeck}
    />
  );
}
