import { useCallback, useEffect, useMemo, useState } from "react";
import type { CardData } from "../types/cards";
import type { DreamsignTemplate, ResolvedDreamcallerPackage } from "../types/content";
import type { DraftState } from "../types/draft";
import type { QuestState } from "../types/quest";
import { logEvent } from "../logging";
import { deleteSavedQuest, getSavedQuest, listSavedQuests, saveQuest, type SavedQuestSummary } from "../state/saved-quests";
import { PackageDebugDialog, type SavedQuestView } from "../cumulus/screens/PackageDebugDialog";
import { buildPackageDebugView } from "./cumulus_adapters/package-debug-view-model";

/** Outer diagnostic controller: owns save I/O, mutation dispatch, and logging. */
export function DebugScreen({ isOpen, onClose, draftState, cardDatabase, resolvedPackage, remainingDreamsignPool, dreamsignTemplates, onForceLegendaryOffer, questState, onLoadQuestState }: {
  isOpen: boolean; onClose: () => void; draftState: DraftState | null; cardDatabase: ReadonlyMap<number, CardData>; resolvedPackage: ResolvedDreamcallerPackage | null; remainingDreamsignPool: readonly string[]; dreamsignTemplates: readonly DreamsignTemplate[]; onForceLegendaryOffer?: (draftState: DraftState, source: string) => void; questState: QuestState | null; onLoadQuestState?: (state: QuestState, source: string) => void;
}) {
  const [saves, setSaves] = useState<readonly SavedQuestSummary[]>([]);
  const [saveName, setSaveName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const view = useMemo(() => buildPackageDebugView(draftState, cardDatabase, resolvedPackage, remainingDreamsignPool, dreamsignTemplates), [cardDatabase, draftState, dreamsignTemplates, remainingDreamsignPool, resolvedPackage]);
  const refresh = useCallback(async () => { try { setSaves(await listSavedQuests()); } catch (caught) { setError(caught instanceof Error ? caught.message : "Failed to list saved quests."); } }, []);
  useEffect(() => { if (isOpen) void refresh(); }, [isOpen, refresh]);
  const save = useCallback(async () => { if (questState === null) { setError("No quest is active to save."); return; } if (saveName.trim() === "") { setError("Enter a name for the save."); return; } setBusy(true); setError(null); try { const saved = await saveQuest(saveName, questState); logEvent("debug_quest_saved", { source: "debug_save_quest", name: saved.name, screen: saved.screenType }); setStatus(`Saved "${saved.name}".`); setSaveName(""); await refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Failed to save quest."); } finally { setBusy(false); } }, [questState, refresh, saveName]);
  const load = useCallback(async (name: string) => { if (onLoadQuestState === undefined) { setError("Loading is unavailable in this context."); return; } setBusy(true); setError(null); try { const loaded = await getSavedQuest(name); if (loaded === null) { setError(`Saved quest "${name}" could not be found.`); return; } logEvent("debug_quest_loaded", { source: "debug_load_quest", name, screen: loaded.screen?.type ?? "unknown" }); onLoadQuestState(loaded, "debug_load_quest"); onClose(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Failed to load quest."); } finally { setBusy(false); } }, [onClose, onLoadQuestState]);
  const remove = useCallback(async (name: string) => { setBusy(true); setError(null); try { await deleteSavedQuest(name); logEvent("debug_quest_save_deleted", { source: "debug_delete_quest", name }); setStatus(`Deleted "${name}".`); await refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Failed to delete quest."); } finally { setBusy(false); } }, [refresh]);
  const forceLegendary = useCallback(() => { if (draftState === null || onForceLegendaryOffer === undefined) return; const offer = [...cardDatabase.values()].filter((card) => card.rarity === "Legendary").slice(0, 4).map((card) => card.cardNumber); if (offer.length === 0) return; onForceLegendaryOffer({ ...draftState, currentOffer: offer }, "debug_force_legendary_offer"); logEvent("debug_legendary_offer_forced", { source: "debug_force_legendary_offer", cardNumbers: offer }); onClose(); }, [cardDatabase, draftState, onClose, onForceLegendaryOffer]);
  const saveViews: readonly SavedQuestView[] = saves.map((save) => ({ id: save.name, name: save.name, detail: `${save.screenType} · ${formatSavedAt(save.savedAt)}` }));
  return <PackageDebugDialog isOpen={isOpen} view={view} saves={saveViews} saveName={saveName} saveStatus={status} saveError={error} busy={busy} canSave={questState !== null} canLoad={onLoadQuestState !== undefined} canForceLegendaryOffer={draftState !== null && onForceLegendaryOffer !== undefined && [...cardDatabase.values()].some((card) => card.rarity === "Legendary")} onClose={onClose} onSaveNameChange={setSaveName} onSave={() => void save()} onLoad={(name) => void load(name)} onDelete={(name) => void remove(name)} onForceLegendaryOffer={forceLegendary} />;
}

function formatSavedAt(iso: string): string { const value = new Date(iso); return Number.isNaN(value.getTime()) ? iso : value.toLocaleString(); }
