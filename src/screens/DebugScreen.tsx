import { useCallback, useEffect, useMemo, useState } from "react";
import type { CardData } from "../types/cards";
import type { DreamsignTemplate, ResolvedDreamAvatarPackage } from "../types/content";
import type { DraftState } from "../types/draft";
import type { JourneyState } from "../types/journey";
import { logEvent } from "../logging";
import { deleteSavedJourney, getSavedJourney, listSavedJourneys, saveJourney, type SavedJourneySummary } from "../state/saved-journeys";
import { PackageDebugDialog, type SavedJourneyView } from "../cumulus/screens/PackageDebugDialog";
import { buildPackageDebugView } from "./cumulus_adapters/package-debug-view-model";

/** Outer diagnostic controller: owns save I/O, mutation dispatch, and logging. */
export function DebugScreen({ isOpen, onClose, draftState, cardDatabase, resolvedPackage, remainingDreamsignPool, dreamsignTemplates, onForceLegendaryOffer, journeyState, onLoadJourneyState }: {
  isOpen: boolean; onClose: () => void; draftState: DraftState | null; cardDatabase: ReadonlyMap<number, CardData>; resolvedPackage: ResolvedDreamAvatarPackage | null; remainingDreamsignPool: readonly string[]; dreamsignTemplates: readonly DreamsignTemplate[]; onForceLegendaryOffer?: (draftState: DraftState, source: string) => void; journeyState: JourneyState | null; onLoadJourneyState?: (state: JourneyState, source: string) => void;
}) {
  const [saves, setSaves] = useState<readonly SavedJourneySummary[]>([]);
  const [saveName, setSaveName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const view = useMemo(() => buildPackageDebugView(draftState, cardDatabase, resolvedPackage, remainingDreamsignPool, dreamsignTemplates), [cardDatabase, draftState, dreamsignTemplates, remainingDreamsignPool, resolvedPackage]);
  const refresh = useCallback(async () => { try { setSaves(await listSavedJourneys()); } catch (caught) { setError(caught instanceof Error ? caught.message : "Failed to list saved journeys."); } }, []);
  useEffect(() => { if (isOpen) void refresh(); }, [isOpen, refresh]);
  const save = useCallback(async () => { if (journeyState === null) { setError("No journey is active to save."); return; } if (saveName.trim() === "") { setError("Enter a name for the save."); return; } setBusy(true); setError(null); try { const saved = await saveJourney(saveName, journeyState); logEvent("debug_journey_saved", { source: "debug_save_journey", name: saved.name, screen: saved.screenType }); setStatus(`Saved "${saved.name}".`); setSaveName(""); await refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Failed to save journey."); } finally { setBusy(false); } }, [journeyState, refresh, saveName]);
  const load = useCallback(async (name: string) => { if (onLoadJourneyState === undefined) { setError("Loading is unavailable in this context."); return; } setBusy(true); setError(null); try { const loaded = await getSavedJourney(name); if (loaded === null) { setError(`Saved journey "${name}" could not be found.`); return; } logEvent("debug_journey_loaded", { source: "debug_load_journey", name, screen: loaded.screen?.type ?? "unknown" }); onLoadJourneyState(loaded, "debug_load_journey"); onClose(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Failed to load journey."); } finally { setBusy(false); } }, [onClose, onLoadJourneyState]);
  const remove = useCallback(async (name: string) => { setBusy(true); setError(null); try { await deleteSavedJourney(name); logEvent("debug_journey_save_deleted", { source: "debug_delete_journey", name }); setStatus(`Deleted "${name}".`); await refresh(); } catch (caught) { setError(caught instanceof Error ? caught.message : "Failed to delete journey."); } finally { setBusy(false); } }, [refresh]);
  const forceLegendary = useCallback(() => { if (draftState === null || onForceLegendaryOffer === undefined) return; const offer = [...cardDatabase.values()].filter((card) => card.rarity === "Legendary").slice(0, 4).map((card) => card.cardNumber); if (offer.length === 0) return; onForceLegendaryOffer({ ...draftState, currentOffer: offer }, "debug_force_legendary_offer"); logEvent("debug_legendary_offer_forced", { source: "debug_force_legendary_offer", cardNumbers: offer }); onClose(); }, [cardDatabase, draftState, onClose, onForceLegendaryOffer]);
  const saveViews: readonly SavedJourneyView[] = saves.map((save) => ({ id: save.name, name: save.name, detail: `${save.screenType} · ${formatSavedAt(save.savedAt)}` }));
  return <PackageDebugDialog isOpen={isOpen} view={view} saves={saveViews} saveName={saveName} saveStatus={status} saveError={error} busy={busy} canSave={journeyState !== null} canLoad={onLoadJourneyState !== undefined} canForceLegendaryOffer={draftState !== null && onForceLegendaryOffer !== undefined && [...cardDatabase.values()].some((card) => card.rarity === "Legendary")} onClose={onClose} onSaveNameChange={setSaveName} onSave={() => void save()} onLoad={(name) => void load(name)} onDelete={(name) => void remove(name)} onForceLegendaryOffer={forceLegendary} />;
}

function formatSavedAt(iso: string): string { const value = new Date(iso); return Number.isNaN(value.getTime()) ? iso : value.toLocaleString(); }
