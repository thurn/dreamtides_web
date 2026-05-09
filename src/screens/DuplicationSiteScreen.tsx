import { useCallback, useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { SiteState, DeckEntry } from "../types/quest";
import type { CardData } from "../types/cards";
import { CardDisplay } from "../components/CardDisplay";
import { useQuest } from "../state/quest-context";

/** Props for the DuplicationSiteScreen component. */
interface DuplicationSiteScreenProps {
  site: SiteState;
}

/** A deck entry paired with a random copy count for duplication. */
interface DuplicationCandidate {
  entry: DeckEntry;
  card: CardData;
  copyCount: number;
}

export function duplicationCopyCount(siteId: string, entryId: string): number {
  let hash = 0;
  for (const char of `${siteId}:${entryId}`) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return (hash % 4) + 1;
}

/** Builds duplication candidates from shared runtime entry ids. */
function buildCandidates(
  deck: DeckEntry[],
  cardDatabase: Map<number, CardData>,
  siteId: string,
  entryIds: readonly string[],
): DuplicationCandidate[] {
  const deckByEntryId = new Map(deck.map((entry) => [entry.entryId, entry]));
  const candidates: DuplicationCandidate[] = [];
  for (const entryId of entryIds) {
    const entry = deckByEntryId.get(entryId);
    if (entry === undefined) continue;
    const card = cardDatabase.get(entry.cardNumber);
    if (!card) continue;
    const copyCount = duplicationCopyCount(siteId, entryId);
    candidates.push({ entry, card, copyCount });
  }
  return candidates;
}

/** Renders the Duplication site screen. */
export function DuplicationSiteScreen({ site }: DuplicationSiteScreenProps) {
  const { state, mutations, cardDatabase } = useQuest();
  const { deck } = state;
  const runtime = state.siteRuntime[site.id];
  const cardChoiceRuntime =
    runtime !== undefined &&
      runtime.kind === "cardChoice" &&
      runtime.choiceKind === "duplication"
      ? runtime
      : null;

  useEffect(() => {
    if (runtime === undefined) {
      mutations.ensureCardChoiceRuntime(site.id, "duplication");
    }
  }, [mutations, runtime, site.id]);

  const candidates = useMemo(
    () =>
      cardChoiceRuntime === null
        ? []
        : buildCandidates(
          deck,
          cardDatabase,
          site.id,
          cardChoiceRuntime.entryIds,
        ),
    [cardChoiceRuntime, cardDatabase, deck, site.id],
  );
  const duplicated = (cardChoiceRuntime?.acceptedEntryIds.length ?? 0) > 0;

  // Enhanced mode state
  const [enhancedPickedEntry, setEnhancedPickedEntry] =
    useState<DeckEntry | null>(null);
  const [enhancedCopyCount, setEnhancedCopyCount] = useState<number>(0);

  const handleDuplicate = useCallback(
    (candidate: DuplicationCandidate) => {
      if (duplicated) return;
      mutations.acceptDuplicationChoice(
        site.id,
        candidate.entry.entryId,
        candidate.copyCount,
      );
    },
    [duplicated, mutations, site.id],
  );

  const handleEnhancedPick = useCallback(
    (entry: DeckEntry) => {
      const card = cardDatabase.get(entry.cardNumber);
      if (!card) return;
      setEnhancedPickedEntry(entry);
      setEnhancedCopyCount(duplicationCopyCount(site.id, entry.entryId));
    },
    [cardDatabase, site.id],
  );

  const handleEnhancedDuplicate = useCallback(() => {
    if (duplicated || !enhancedPickedEntry) return;
    const card = cardDatabase.get(enhancedPickedEntry.cardNumber);
    if (!card) return;

    mutations.acceptDuplicationChoice(
      site.id,
      enhancedPickedEntry.entryId,
      enhancedCopyCount,
    );
  }, [
    duplicated,
    enhancedPickedEntry,
    enhancedCopyCount,
    cardDatabase,
    mutations,
    site.id,
  ]);

  const handleClose = useCallback(() => {
    mutations.completeSite(site.id, "duplication_skipped");
  }, [mutations, site.id]);

  if (cardChoiceRuntime === null) {
    return (
      <div className="flex min-h-full items-center justify-center px-4 py-6">
        <p className="text-lg opacity-60">Preparing choices...</p>
      </div>
    );
  }

  // Enhanced mode: full deck browser
  if (site.isEnhanced) {
    return (
      <motion.div
        className="flex min-h-full flex-col items-center px-4 py-6 md:px-8 md:py-8"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.4 }}
      >
        <div className="mb-6 text-center">
          <h2
            className="text-2xl font-bold tracking-wide md:text-3xl"
            style={{ color: "#3b82f6" }}
          >
            Duplication
          </h2>
          <span
            className="mt-2 inline-block rounded-full px-3 py-1 text-sm font-bold"
            style={{
              background: "rgba(168, 85, 247, 0.15)",
              color: "#c084fc",
              border: "1px solid rgba(168, 85, 247, 0.3)",
            }}
          >
            Enhanced -- Choose any card
          </span>
          <p className="mt-2 text-sm opacity-60">
            {enhancedPickedEntry
              ? "Review the duplication offer below."
              : "Pick any card from your deck to duplicate."}
          </p>
        </div>

        {!enhancedPickedEntry && !duplicated && (
          <div className="grid w-full max-w-5xl grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
            {candidates.map((candidate, index) => {
              return (
                <motion.div
                  key={candidate.entry.entryId}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: index * 0.03 }}
                >
                  <CardDisplay
                    card={candidate.card}
                    onClick={() => handleEnhancedPick(candidate.entry)}
                  />
                </motion.div>
              );
            })}
          </div>
        )}

        {enhancedPickedEntry && !duplicated && (
          <EnhancedDuplicationPreview
            entry={enhancedPickedEntry}
            copyCount={enhancedCopyCount}
            cardDatabase={cardDatabase}
            onDuplicate={handleEnhancedDuplicate}
          />
        )}

        {duplicated && (
          <motion.div
            className="mt-4 text-center"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
          >
            <p className="text-lg font-bold" style={{ color: "#3b82f6" }}>
              Cards duplicated!
            </p>
          </motion.div>
        )}

        <button
          className="mt-8 rounded-lg px-6 py-2.5 text-base font-medium transition-colors"
          style={{
            background: "rgba(107, 114, 128, 0.2)",
            border: "1px solid rgba(107, 114, 128, 0.4)",
            color: "#9ca3af",
          }}
          onClick={handleClose}
        >
          Close
        </button>

      </motion.div>
    );
  }

  // Normal mode: 3 random candidates
  return (
    <motion.div
      className="flex min-h-full flex-col items-center px-4 py-6 md:px-8 md:py-8"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
    >
      <div className="mb-6 text-center">
        <h2
          className="text-2xl font-bold tracking-wide md:text-3xl"
          style={{ color: "#3b82f6" }}
        >
          Duplication
        </h2>
        <p className="mt-2 text-sm opacity-60">
          Choose a card to add copies to your deck.
        </p>
      </div>

      {candidates.length === 0 ? (
        <p className="mt-8 text-lg opacity-50">No cards available.</p>
      ) : (
        <div className="flex w-full max-w-4xl flex-col gap-6 md:flex-row md:justify-center">
          {candidates.map((candidate, index) => (
            <motion.div
              key={candidate.entry.entryId}
              className="flex flex-col items-center gap-3 rounded-xl p-4"
              style={{
                background: "rgba(15, 10, 24, 0.8)",
                border: "1px solid rgba(59, 130, 246, 0.3)",
                boxShadow: "0 0 12px rgba(59, 130, 246, 0.1)",
                flex: "1 1 0",
                maxWidth: "260px",
              }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: index * 0.15 }}
            >
              <div style={{ width: "100%" }}>
                <CardDisplay
                  card={candidate.card}
                />
              </div>

              {/* Copy count indicator */}
              <div
                className="flex items-center gap-2 rounded-lg px-3 py-1.5"
                style={{
                  background: "rgba(59, 130, 246, 0.1)",
                  border: "1px solid rgba(59, 130, 246, 0.3)",
                }}
              >
                <span
                  className="text-sm font-bold"
                  style={{ color: "#3b82f6" }}
                >
                  x{String(candidate.copyCount)}
                </span>
                <span className="text-xs opacity-60">
                  {candidate.copyCount === 1 ? "copy" : "copies"}
                </span>
              </div>

              {/* Duplicate button */}
              <button
                className="w-full rounded-lg px-4 py-2 text-sm font-bold transition-opacity hover:opacity-90"
                style={{
                  background: duplicated
                    ? "#4b5563"
                    : "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
                  color: duplicated ? "#9ca3af" : "#ffffff",
                  opacity: duplicated ? 0.6 : 1,
                  cursor: duplicated ? "not-allowed" : "pointer",
                }}
                disabled={duplicated}
                onClick={() => handleDuplicate(candidate)}
              >
                Duplicate x{String(candidate.copyCount)}
              </button>
            </motion.div>
          ))}
        </div>
      )}

      <button
        className="mt-8 rounded-lg px-6 py-2.5 text-base font-medium transition-colors"
        style={{
          background: "rgba(107, 114, 128, 0.2)",
          border: "1px solid rgba(107, 114, 128, 0.4)",
          color: "#9ca3af",
        }}
        onClick={handleClose}
      >
        Close
      </button>

    </motion.div>
  );
}

/** Renders the enhanced mode preview for a picked card. */
function EnhancedDuplicationPreview({
  entry,
  copyCount,
  cardDatabase,
  onDuplicate,
}: {
  entry: DeckEntry;
  copyCount: number;
  cardDatabase: Map<number, CardData>;
  onDuplicate: () => void;
}) {
  const card = cardDatabase.get(entry.cardNumber);
  if (!card) return null;

  return (
    <motion.div
      className="flex flex-col items-center gap-4 rounded-xl p-6"
      style={{
        background: "rgba(15, 10, 24, 0.8)",
        border: "1px solid rgba(59, 130, 246, 0.3)",
        boxShadow: "0 0 16px rgba(59, 130, 246, 0.15)",
        maxWidth: "280px",
      }}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div style={{ width: "100%" }}>
        <CardDisplay card={card} />
      </div>

      <div
        className="flex items-center gap-2 rounded-lg px-3 py-1.5"
        style={{
          background: "rgba(59, 130, 246, 0.1)",
          border: "1px solid rgba(59, 130, 246, 0.3)",
        }}
      >
        <span className="text-sm font-bold" style={{ color: "#3b82f6" }}>
          x{String(copyCount)}
        </span>
        <span className="text-xs opacity-60">
          {copyCount === 1 ? "copy" : "copies"}
        </span>
      </div>

      <button
        className="w-full rounded-lg px-4 py-2 text-sm font-bold transition-opacity hover:opacity-90"
        style={{
          background: "linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)",
          color: "#ffffff",
        }}
        onClick={onDuplicate}
      >
        Duplicate x{String(copyCount)}
      </button>
    </motion.div>
  );
}
