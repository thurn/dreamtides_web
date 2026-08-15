import { useCallback, useMemo, useState } from "react";
import type { CardData } from "../types/cards";
import type {
  DreamsignTemplate,
  ResolvedAvatarPackage,
} from "../types/content";
import type { DraftState } from "../types/draft";
import type { JourneyState } from "../types/journey";
import type { JourneyMutationSource } from "../state/journey-context";
import type { DreamsignId } from "../types/identifiers";
import { logEvent } from "../logging";
import {
  chooseJourneySaveFile,
  downloadJourneySaveFile,
  serializedJourneyScreenType,
} from "../state/journey-save-files";
import { PackageDebugDialog } from "../cumulus/screens/PackageDebugDialog";
import { buildPackageDebugView } from "./cumulus_adapters/package-debug-view-model";
import { assertLocalized } from "@trox/runtime";

/** Outer diagnostic controller: owns save I/O, mutation dispatch, and logging. */
export function DebugScreen({
  isOpen,
  onClose,
  draftState,
  cardDatabase,
  resolvedPackage,
  remainingDreamsignPool,
  dreamsignTemplates,
  onForceLegendaryOffer,
  journeyState,
  onLoadJourneyState,
}: {
  isOpen: boolean;
  onClose: () => void;
  draftState: DraftState | null;
  cardDatabase: ReadonlyMap<number, CardData>;
  resolvedPackage: ResolvedAvatarPackage | null;
  remainingDreamsignPool: readonly DreamsignId[];
  dreamsignTemplates: readonly DreamsignTemplate[];
  onForceLegendaryOffer?: (
    draftState: DraftState,
    source: JourneyMutationSource,
  ) => void;
  journeyState: JourneyState | null;
  onLoadJourneyState?: (
    state: unknown,
    source: JourneyMutationSource,
  ) => void;
}) {
  const [saveName, setSaveName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const view = useMemo(
    () =>
      buildPackageDebugView(
        draftState,
        cardDatabase,
        resolvedPackage,
        remainingDreamsignPool,
        dreamsignTemplates,
      ),
    [
      cardDatabase,
      draftState,
      dreamsignTemplates,
      remainingDreamsignPool,
      resolvedPackage,
    ],
  );
  const save = useCallback(() => {
    if (journeyState === null) {
      setError("No journey is active to save.");
      return;
    }
    if (saveName.trim() === "") {
      setError("Enter a name for the save.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { fileName, save: saved } = downloadJourneySaveFile(
        saveName,
        journeyState,
      );
      logEvent("debug_journey_saved", {
        source: "debug_save_journey",
        name: saved.name,
        screen: saved.journeyState.screen.type,
        fileName,
        formatVersion: saved.version,
      });
      setStatus(`Downloaded "${fileName}".`);
      setSaveName("");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Failed to save journey.",
      );
    } finally {
      setBusy(false);
    }
  }, [journeyState, saveName]);
  const load = useCallback(async () => {
    if (onLoadJourneyState === undefined) {
      setError("Loading is unavailable in this context.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const loaded = await chooseJourneySaveFile();
      if (loaded === null) return;
      logEvent("debug_journey_loaded", {
        source: "debug_load_journey",
        name: loaded.name,
        screen: serializedJourneyScreenType(loaded.journeyState),
        fileName: loaded.fileName,
        buildGitSha: loaded.buildGitSha,
      });
      onLoadJourneyState(loaded.journeyState, "debug_load_journey");
      onClose();
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Failed to load journey.",
      );
    } finally {
      setBusy(false);
    }
  }, [onClose, onLoadJourneyState]);
  const forceLegendary = useCallback(() => {
    if (draftState === null || onForceLegendaryOffer === undefined) return;
    const offer = [...cardDatabase.values()]
      .filter((card) => card.rarity === "Legendary")
      .slice(0, 4)
      .map((card) => card.cardNumber);
    if (offer.length === 0) return;
    onForceLegendaryOffer(
      { ...draftState, currentOffer: offer },
      "debug_force_legendary_offer",
    );
    logEvent("debug_legendary_offer_forced", {
      source: "debug_force_legendary_offer",
      cardNumbers: offer,
    });
    onClose();
  }, [cardDatabase, draftState, onClose, onForceLegendaryOffer]);
  return (
    <PackageDebugDialog
      isOpen={isOpen}
      view={view}
      saveName={saveName}
      saveStatus={status === null ? null : assertLocalized(status)}
      saveError={error === null ? null : assertLocalized(error)}
      busy={busy}
      canSave={journeyState !== null}
      canLoad={onLoadJourneyState !== undefined}
      canForceLegendaryOffer={
        draftState !== null &&
        onForceLegendaryOffer !== undefined &&
        [...cardDatabase.values()].some((card) => card.rarity === "Legendary")
      }
      onClose={onClose}
      onSaveNameChange={setSaveName}
      onSave={save}
      onLoad={() => void load()}
      onForceLegendaryOffer={forceLegendary}
    />
  );
}
