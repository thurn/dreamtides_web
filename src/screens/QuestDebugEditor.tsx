import { useMemo } from "react";
import { useQuest } from "../state/quest-context";
import { QuestDebugEditorScreen, type QuestDebugResourceId } from "../cumulus/screens/QuestDebugEditorScreen";
import { buildQuestDebugEditorView } from "./cumulus_adapters/quest-debug-view-model";

const SOURCE = "quest_debug_editor";

/** Outer controller for the diagnostic editor's Cumulus presentation. */
export default function QuestDebugEditor({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { state, mutations, questContent } = useQuest();
  const view = useMemo(() => buildQuestDebugEditorView(state, questContent.cardDatabase, questContent.dreamsignTemplates), [questContent.cardDatabase, questContent.dreamsignTemplates, state]);
  const dreamsignIndex = (actionId: string): number => Number(actionId.slice(actionId.lastIndexOf(":") + 1));
  const changeResource = (id: QuestDebugResourceId, delta: number): void => {
    if (id === "essence") mutations.setEssence(state.essence + delta, SOURCE);
    else if (id === "essenceCap") mutations.setEssenceCap?.(state.essenceCap + delta, SOURCE);
    else if (id === "maxDreamsigns") mutations.setMaxDreamsigns?.(state.maxDreamsigns + delta, SOURCE);
    else mutations.setCompletionLevel?.(state.completionLevel + delta, SOURCE);
  };
  return <QuestDebugEditorScreen isOpen={isOpen} view={view} onClose={onClose} onResourceChange={changeResource} onAddDreamsign={(id) => { const template = questContent.dreamsignTemplates.find((candidate) => candidate.id === id); if (template !== undefined) mutations.addDreamsign({ ...template, isBane: false }, SOURCE); }} onRemoveDreamsign={(actionId) => mutations.removeDreamsign(dreamsignIndex(actionId), SOURCE)} onToggleDreamsignBane={(actionId) => { const index = dreamsignIndex(actionId); const dreamsign = state.dreamsigns[index]; if (dreamsign !== undefined) mutations.setDreamsignIsBane?.(index, !dreamsign.isBane, SOURCE); }} onAddCard={(cardId, bane) => { if (bane) mutations.addBaneCardById(cardId, SOURCE); else mutations.addCardById(cardId, SOURCE); }} onRemoveCard={(entryId) => mutations.removeDeckEntry(entryId, SOURCE)} onSetStatOverride={(entryId, statOverride) => mutations.setDeckEntryStatOverride?.(entryId, statOverride, SOURCE)} onSetTransfiguration={(entryId, type) => mutations.transfigureCard(entryId, type, "quest_debug_editor:transfigure", {})} onSetTypeChange={(entryId, typeChange) => mutations.setDeckEntryTypeChange?.(entryId, typeChange, SOURCE)} onSetKeywords={(entryId, keywords) => mutations.setDeckEntryKeywords?.(entryId, keywords, SOURCE)} />;
}
