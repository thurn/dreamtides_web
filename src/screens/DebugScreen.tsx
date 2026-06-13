import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { CardData } from "../types/cards";
import type {
  DreamsignTemplate,
  ResolvedDreamcallerPackage,
} from "../types/content";
import type { DraftState } from "../types/draft";
import type { QuestState } from "../types/quest";
import { logEvent } from "../logging";
import {
  deleteSavedQuest,
  getSavedQuest,
  listSavedQuests,
  saveQuest,
  type SavedQuestSummary,
} from "../state/saved-quests";
import {
  extractDraftDebugInfo,
  extractPackageDebugInfo,
} from "./debug-helpers";

/** Props for the DebugScreen component. */
interface DebugScreenProps {
  isOpen: boolean;
  onClose: () => void;
  draftState: DraftState | null;
  cardDatabase: Map<number, CardData>;
  resolvedPackage: ResolvedDreamcallerPackage | null;
  remainingDreamsignPool: string[];
  dreamsignTemplates: readonly DreamsignTemplate[];
  /**
   * QA-only debug action: replace the current draft offer with up to four
   * legendary cards drawn from the card database. Wired through `App.tsx`
   * to `mutations.setDraftState`. Used to verify the legendary frame
   * treatment surfaces correctly when an offer is filled with legendaries.
   */
  onForceLegendaryOffer?: (
    draftState: DraftState,
    source: string,
  ) => void;
  /**
   * The live quest state, captured by "Save Quest" into a named file-system
   * save. Null before a quest has started.
   */
  questState: QuestState | null;
  /**
   * Replaces the entire quest state with a saved snapshot loaded by name.
   * Optional because only the live multiplayer provider supplies it.
   */
  onLoadQuestState?: (state: QuestState, source: string) => void;
}

/** Full-screen overlay showing package and draft pool debug info. */
export function DebugScreen({
  isOpen,
  onClose,
  draftState,
  cardDatabase,
  resolvedPackage,
  remainingDreamsignPool,
  dreamsignTemplates,
  onForceLegendaryOffer,
  questState,
  onLoadQuestState,
}: DebugScreenProps) {
  const debugInfo = useMemo(
    () => extractDraftDebugInfo(draftState, cardDatabase),
    [draftState, cardDatabase],
  );
  const packageDebugInfo = useMemo(
    () =>
      extractPackageDebugInfo(
        resolvedPackage,
        remainingDreamsignPool,
        dreamsignTemplates,
      ),
    [resolvedPackage, remainingDreamsignPool, dreamsignTemplates],
  );

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        handleClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, handleClose]);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="debug-screen-backdrop"
          className="fixed inset-0 z-[60] flex flex-col"
          style={{ backgroundColor: "rgba(5, 2, 10, 0.95)" }}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 40 }}
          transition={{ duration: 0.3 }}
        >
          <div
            className="flex items-center justify-between px-4 py-3 md:px-6"
            style={{
              borderBottom: "1px solid rgba(124, 58, 237, 0.3)",
              background:
                "linear-gradient(180deg, rgba(10, 6, 18, 0.95) 0%, rgba(10, 6, 18, 0.8) 100%)",
            }}
          >
            <h2
              className="text-lg font-bold md:text-xl"
              style={{ color: "#e2e8f0" }}
            >
              Debug: Package State
            </h2>
            <button
              className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-lg transition-colors"
              style={{
                background: "rgba(255, 255, 255, 0.1)",
                color: "#e2e8f0",
              }}
              onClick={handleClose}
              aria-label="Close debug screen"
            >
              {"\u2715"}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 md:px-6">
            <div className="mx-auto mb-4 max-w-4xl">
              <SavedQuestsPanel
                isOpen={isOpen}
                questState={questState}
                onLoadQuestState={onLoadQuestState}
                onClose={handleClose}
              />
            </div>
            {packageDebugInfo === null ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm opacity-40">
                  No package data available yet.
                </p>
              </div>
            ) : (
              <div className="mx-auto max-w-4xl space-y-4">
                <div className="flex flex-wrap gap-3">
                  <StatBadge
                    label="Starting Essence"
                    value={String(packageDebugInfo.startingEssence)}
                  />
                  <StatBadge
                    label="Draft Pool"
                    value={String(packageDebugInfo.draftPoolSize)}
                  />
                  <StatBadge
                    label="Dreamsigns Left"
                    value={String(packageDebugInfo.remainingDreamsigns.length)}
                  />
                  <StatBadge
                    label="Dreamsigns Spent"
                    value={String(packageDebugInfo.spentDreamsigns.length)}
                  />
                  {debugInfo !== null && (
                    <>
                      <StatBadge
                        label="Pick"
                        value={String(debugInfo.pickNumber)}
                      />
                      <StatBadge
                        label="Remaining"
                        value={String(debugInfo.remainingCards)}
                      />
                      <StatBadge
                        label="Unique"
                        value={String(debugInfo.remainingUniqueCards)}
                      />
                    </>
                  )}
                </div>

                <InfoCard title="Dreamcaller">
                  <p className="text-sm font-bold" style={{ color: "#e2e8f0" }}>
                    {packageDebugInfo.dreamcallerName}
                  </p>
                </InfoCard>

                <InfoCard title="Package Validation">
                  <div className="grid gap-2 text-sm opacity-80 md:grid-cols-2">
                    <p>
                      Mandatory-only pool:{" "}
                      {String(packageDebugInfo.mandatoryOnlyPoolSize)}
                    </p>
                    <p>
                      Doubled cards: {String(packageDebugInfo.doubledCardCount)}
                    </p>
                    <p>
                      Legal subsets: {String(packageDebugInfo.legalSubsetCount)}
                    </p>
                    <p>
                      Preferred subsets:{" "}
                      {String(packageDebugInfo.preferredSubsetCount)}
                    </p>
                  </div>
                </InfoCard>

                <InfoCard title="Dreamsign Pool">
                  <p className="mb-2 text-xs opacity-60">
                    Remaining {String(packageDebugInfo.remainingDreamsigns.length)}
                    {" / "}
                    {String(packageDebugInfo.initialDreamsignPoolSize)}
                  </p>
                  <DebugChipList
                    emptyLabel="Dreamsign pool exhausted."
                    items={packageDebugInfo.remainingDreamsigns.map((dreamsign) => ({
                      key: dreamsign.id,
                      label: dreamsign.name,
                    }))}
                  />
                </InfoCard>

                <InfoCard title="Spent Dreamsigns">
                  <DebugChipList
                    emptyLabel="No Dreamsigns have been spent yet."
                    items={packageDebugInfo.spentDreamsigns.map((dreamsign) => ({
                      key: dreamsign.id,
                      label: dreamsign.name,
                    }))}
                  />
                </InfoCard>

                {debugInfo !== null && (
                  <InfoCard title="Current Offer">
                    <DebugChipList
                      emptyLabel="No offer is currently active."
                      items={debugInfo.currentOffer.map((card) => ({
                        key: String(card.cardNumber),
                        label: card.name,
                      }))}
                    />
                    {draftState !== null
                      && onForceLegendaryOffer !== undefined
                      && draftState.currentOffer.length > 0 && (
                        <ForceLegendaryOfferButton
                          draftState={draftState}
                          cardDatabase={cardDatabase}
                          onApply={onForceLegendaryOffer}
                          onClose={handleClose}
                        />
                      )}
                  </InfoCard>
                )}

                {debugInfo !== null && (
                  <InfoCard title="Top Remaining Draft Cards">
                    <DebugChipList
                      emptyLabel="No cards remain in the draft pool."
                      items={debugInfo.topRemainingCards.map((card) => ({
                        key: String(card.cardNumber),
                        label: `${card.name} x${String(card.copiesRemaining)}`,
                      }))}
                    />
                  </InfoCard>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DebugChipList({
  emptyLabel,
  items,
}: {
  emptyLabel: string;
  items: Array<{ key: string; label: string }>;
}) {
  if (items.length === 0) {
    return <p className="text-sm opacity-50">{emptyLabel}</p>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <span
          key={item.key}
          className="rounded-full px-2 py-0.5 text-[10px] font-medium"
          style={{
            background: "rgba(168, 85, 247, 0.12)",
            border: "1px solid rgba(168, 85, 247, 0.24)",
            color: "#c084fc",
          }}
        >
          {item.label}
        </span>
      ))}
    </div>
  );
}

/** Small stat badge. */
function StatBadge({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="rounded-lg px-3 py-1.5"
      style={{
        background: "rgba(124, 58, 237, 0.1)",
        border: "1px solid rgba(124, 58, 237, 0.2)",
      }}
    >
      <span className="text-[10px] uppercase tracking-wider opacity-50">
        {label}
      </span>
      <span className="ml-1.5 text-sm font-bold" style={{ color: "#c084fc" }}>
        {value}
      </span>
    </div>
  );
}

function InfoCard({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      className="space-y-1 rounded-lg p-3"
      style={{
        background: "rgba(0, 0, 0, 0.3)",
        border: "1px solid rgba(124, 58, 237, 0.15)",
      }}
    >
      <p
        className="text-[10px] font-bold uppercase tracking-wider"
        style={{ color: "#a855f7" }}
      >
        {title}
      </p>
      {children}
    </div>
  );
}

/**
 * Save / load named quest snapshots to the developer's file system. A save
 * captures the live quest state into a JSON file (via the dev-server
 * `/api/saved-quests` endpoints); loading writes a saved snapshot back into the
 * current room so a run can be resumed after the emulator restarts.
 */
function SavedQuestsPanel({
  isOpen,
  questState,
  onLoadQuestState,
  onClose,
}: {
  isOpen: boolean;
  questState: QuestState | null;
  onLoadQuestState?: (state: QuestState, source: string) => void;
  onClose: () => void;
}) {
  const [saves, setSaves] = useState<SavedQuestSummary[]>([]);
  const [name, setName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setSaves(await listSavedQuests());
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Failed to list saved quests.",
      );
    }
  }, []);

  // Load the list whenever the overlay opens so it reflects on-disk state.
  useEffect(() => {
    if (!isOpen) {
      return;
    }
    void refresh();
  }, [isOpen, refresh]);

  const handleSave = useCallback(async () => {
    if (questState === null) {
      setError("No quest is active to save.");
      return;
    }
    const trimmed = name.trim();
    if (trimmed === "") {
      setError("Enter a name for the save.");
      return;
    }
    setBusy(true);
    setError(null);
    setStatus(null);
    try {
      const summary = await saveQuest(trimmed, questState);
      logEvent("debug_quest_saved", {
        source: "debug_save_quest",
        name: summary.name,
        screen: summary.screenType,
      });
      setStatus(`Saved "${summary.name}".`);
      setName("");
      await refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Failed to save quest.",
      );
    } finally {
      setBusy(false);
    }
  }, [name, questState, refresh]);

  const handleLoad = useCallback(
    async (summary: SavedQuestSummary) => {
      if (onLoadQuestState === undefined) {
        setError("Loading is unavailable in this context.");
        return;
      }
      setBusy(true);
      setError(null);
      setStatus(null);
      try {
        const loaded = await getSavedQuest(summary.name);
        if (loaded === null) {
          setError(`Saved quest "${summary.name}" could not be found.`);
          return;
        }
        logEvent("debug_quest_loaded", {
          source: "debug_load_quest",
          name: summary.name,
          screen: loaded.screen?.type ?? "unknown",
        });
        onLoadQuestState(loaded, "debug_load_quest");
        onClose();
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : "Failed to load quest.",
        );
      } finally {
        setBusy(false);
      }
    },
    [onLoadQuestState, onClose],
  );

  const handleDelete = useCallback(
    async (summary: SavedQuestSummary) => {
      setBusy(true);
      setError(null);
      setStatus(null);
      try {
        await deleteSavedQuest(summary.name);
        logEvent("debug_quest_save_deleted", {
          source: "debug_delete_quest",
          name: summary.name,
        });
        setStatus(`Deleted "${summary.name}".`);
        await refresh();
      } catch (deleteError) {
        setError(
          deleteError instanceof Error
            ? deleteError.message
            : "Failed to delete quest.",
        );
      } finally {
        setBusy(false);
      }
    },
    [refresh],
  );

  return (
    <InfoCard title="Saved Quests">
      <p className="mb-2 text-[11px] opacity-60">
        Save the current run to disk and reload it later, even after the
        emulator restarts.
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          data-testid="debug-save-quest-name"
          type="text"
          value={name}
          onChange={(event) => {
            setName(event.target.value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void handleSave();
            }
          }}
          placeholder="e.g. warriors draft"
          disabled={busy || questState === null}
          className="flex-1 rounded-md px-2 py-1 text-sm"
          style={{
            minWidth: "160px",
            background: "rgba(0, 0, 0, 0.4)",
            border: "1px solid rgba(124, 58, 237, 0.3)",
            color: "#e2e8f0",
          }}
        />
        <button
          data-testid="debug-save-quest"
          type="button"
          onClick={() => {
            void handleSave();
          }}
          disabled={busy || questState === null}
          className="cursor-pointer rounded-md px-3 py-1 text-[11px] font-bold uppercase tracking-wider"
          style={{
            background: "linear-gradient(135deg, #7c3aed 0%, #a855f7 100%)",
            color: "#f5f3ff",
            border: "1px solid rgba(168, 85, 247, 0.6)",
            opacity: busy || questState === null ? 0.5 : 1,
          }}
        >
          Save Quest
        </button>
      </div>

      {error !== null && (
        <p className="mb-2 text-xs" style={{ color: "#fca5a5" }}>
          {error}
        </p>
      )}
      {error === null && status !== null && (
        <p className="mb-2 text-xs" style={{ color: "#86efac" }}>
          {status}
        </p>
      )}

      {saves.length === 0 ? (
        <p className="text-sm opacity-50">No saved quests yet.</p>
      ) : (
        <div className="space-y-1">
          {saves.map((summary) => (
            <div
              key={summary.name}
              className="flex items-center justify-between gap-2 rounded-md px-2 py-1"
              style={{
                background: "rgba(168, 85, 247, 0.08)",
                border: "1px solid rgba(168, 85, 247, 0.18)",
              }}
            >
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-sm font-medium"
                  style={{ color: "#e2e8f0" }}
                >
                  {summary.name}
                </p>
                <p className="text-[10px] opacity-50">
                  {summary.screenType}
                  {" · "}
                  {formatSavedAt(summary.savedAt)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  data-testid="debug-load-quest"
                  type="button"
                  onClick={() => {
                    void handleLoad(summary);
                  }}
                  disabled={busy || onLoadQuestState === undefined}
                  className="cursor-pointer rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider"
                  style={{
                    background: "rgba(124, 58, 237, 0.3)",
                    color: "#e9d5ff",
                    border: "1px solid rgba(168, 85, 247, 0.4)",
                    opacity: busy || onLoadQuestState === undefined ? 0.5 : 1,
                  }}
                >
                  Load
                </button>
                <button
                  data-testid="debug-delete-quest"
                  type="button"
                  onClick={() => {
                    void handleDelete(summary);
                  }}
                  disabled={busy}
                  aria-label={`Delete saved quest ${summary.name}`}
                  className="cursor-pointer rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider"
                  style={{
                    background: "rgba(127, 29, 29, 0.4)",
                    color: "#fecaca",
                    border: "1px solid rgba(239, 68, 68, 0.4)",
                    opacity: busy ? 0.5 : 1,
                  }}
                >
                  {"✕"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </InfoCard>
  );
}

/** Formats an ISO timestamp for the saved-quest list; falls back to raw text. */
function formatSavedAt(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) {
    return iso;
  }
  return parsed.toLocaleString();
}

/**
 * QA-only button that overrides the current draft offer with up to four
 * legendary cards drawn from the live card database. Useful for verifying
 * the legendary frame treatment without rerolling a draft until a
 * legendary surfaces naturally.
 */
function ForceLegendaryOfferButton({
  draftState,
  cardDatabase,
  onApply,
  onClose,
}: {
  draftState: DraftState;
  cardDatabase: Map<number, CardData>;
  onApply: (draftState: DraftState, source: string) => void;
  onClose: () => void;
}) {
  const legendaryCards = useMemo(
    () =>
      Array.from(cardDatabase.values()).filter(
        (card) => card.rarity === "Legendary",
      ),
    [cardDatabase],
  );
  const canForce = legendaryCards.length >= 1;

  const handleClick = useCallback(() => {
    if (!canForce) return;
    const offerCount = Math.min(4, legendaryCards.length);
    const offer = legendaryCards
      .slice(0, offerCount)
      .map((card) => card.cardNumber);
    const nextDraftState: DraftState = {
      ...draftState,
      currentOffer: offer,
    };
    onApply(nextDraftState, "debug_force_legendary_offer");
    onClose();
  }, [canForce, legendaryCards, draftState, onApply, onClose]);

  if (!canForce) return null;

  return (
    <button
      data-testid="debug-force-legendary-offer"
      type="button"
      onClick={handleClick}
      className="mt-2 cursor-pointer rounded-md px-3 py-1 text-[11px] font-bold uppercase tracking-wider"
      style={{
        background: "linear-gradient(135deg, #d4a017 0%, #fbbf24 100%)",
        color: "#1a1025",
        border: "1px solid rgba(255, 232, 150, 0.6)",
      }}
    >
      Force Legendary Offer (QA)
    </button>
  );
}
