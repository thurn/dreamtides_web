import { useMemo } from "react";
import { useJourney } from "../state/journey-context";
import { JourneyDebugEditorScreen, type JourneyDebugResourceId } from "../cumulus/screens/JourneyDebugEditorScreen";
import { buildJourneyDebugEditorView } from "./cumulus_adapters/journey-debug-view-model";

const SOURCE = "journey_debug_editor";

/** Outer controller for the diagnostic editor's Cumulus presentation. */
export default function JourneyDebugEditor({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { state, mutations, journeyContent } = useJourney();
  const view = useMemo(
    () =>
      buildJourneyDebugEditorView(
        journeyContent.transfigurationData,
        state,
        journeyContent.cardDatabase,
        journeyContent.dreamsignTemplates,
      ),
    [
      journeyContent.cardDatabase,
      journeyContent.dreamsignTemplates,
      journeyContent.transfigurationData,
      state,
    ],
  );
  const dreamsignIndex = (actionId: string): number => Number(actionId.slice(actionId.lastIndexOf(":") + 1));
  const changeResource = (id: JourneyDebugResourceId, delta: number): void => {
    if (id === "essence") mutations.setEssence(state.essence + delta, SOURCE);
    else if (id === "maxDreamsigns") mutations.setMaxDreamsigns?.(state.maxDreamsigns + delta, SOURCE);
    else mutations.regenerateAtlas?.(state.completionLevel + delta);
  };
  return <JourneyDebugEditorScreen isOpen={isOpen} view={view} onClose={onClose} onResourceChange={changeResource} onAddDreamsign={(id) => { const template = journeyContent.dreamsignTemplates.find((candidate) => candidate.id === id); if (template !== undefined) mutations.addDreamsign({ ...template }, SOURCE); }} onRemoveDreamsign={(actionId) => mutations.removeDreamsign(dreamsignIndex(actionId), SOURCE)} onAddCard={(cardId) => mutations.addCardById(cardId, SOURCE)} onRemoveCard={(entryId) => mutations.removeDeckEntry(entryId, SOURCE)} onSetStatOverride={(entryId, statOverride) => mutations.setDeckEntryStatOverride?.(entryId, statOverride, SOURCE)} onSetTransfiguration={(entryId, type) => mutations.transfigureCard(entryId, type, "journey_debug_editor:transfigure", {})} onSetTypeChange={(entryId, typeChange) => mutations.setDeckEntryTypeChange?.(entryId, typeChange, SOURCE)} onSetKeywords={(entryId, keywords) => mutations.setDeckEntryKeywords?.(entryId, keywords, SOURCE)} />;
}
