import { useCallback, useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { SiteState } from "../types/quest";
import { CardDisplay } from "../components/CardDisplay";
import { EssenceValue } from "../components/EssenceValue";
import { useQuest } from "../state/quest-context";
import { logEvent } from "../logging";
import {
  MAX_PURGE_PER_VISIT,
  maxAffordablePurgeCount,
  purgeCardPrice,
  purgeDiscountPercent,
  purgeVisitCost,
  type PurgePriceModifiers,
} from "../purge/purge-pricing";

/** Props for the PurgeSiteScreen component. */
interface PurgeSiteScreenProps {
  site: SiteState;
}

const ESSENCE_COLOR = "var(--color-essence)";

/**
 * Renders the Purge site screen. The player pays escalating essence to remove
 * cards from their deck. The Nth card removed this visit costs more than the
 * previous one (see src/purge/purge-pricing.ts), so thinning one or two cards
 * is cheap while emptying a large part of the deck is a major commitment.
 */
export function PurgeSiteScreen({ site }: PurgeSiteScreenProps) {
  const { state, mutations, cardDatabase } = useQuest();
  const { deck, essence } = state;

  const modifiers: PurgePriceModifiers = useMemo(
    () => ({
      isEnhanced: site.isEnhanced,
      essenceDiscountPercent: state.shopModifiers.essenceDiscountPercent,
    }),
    [site.isEnhanced, state.shopModifiers.essenceDiscountPercent],
  );

  const discountPercent = purgeDiscountPercent(modifiers);

  // Selection is ordered so the price of each selected card reflects the order
  // it was chosen: the first card chosen is the cheapest.
  const [selectedEntryIds, setSelectedEntryIds] = useState<string[]>([]);

  // How many cards the player can afford this visit, capped by the per-visit
  // soft cap and the deck size.
  const affordableCount = useMemo(
    () =>
      Math.min(
        maxAffordablePurgeCount(essence, MAX_PURGE_PER_VISIT, modifiers),
        deck.length,
      ),
    [essence, modifiers, deck.length],
  );

  const selectedCount = selectedEntryIds.length;
  const totalCost = useMemo(
    () => purgeVisitCost(selectedCount, modifiers),
    [selectedCount, modifiers],
  );
  const nextCardPrice = purgeCardPrice(selectedCount + 1, modifiers);
  const canSelectMore = selectedCount < affordableCount;

  const toggleSelection = useCallback(
    (entryId: string) => {
      setSelectedEntryIds((prev) => {
        const index = prev.indexOf(entryId);
        if (index !== -1) {
          return prev.filter((id) => id !== entryId);
        }
        if (prev.length >= affordableCount) {
          return prev;
        }
        return [...prev, entryId];
      });
    },
    [affordableCount],
  );

  const handlePurge = useCallback(() => {
    if (selectedEntryIds.length === 0) return;

    const purgedEntries = selectedEntryIds
      .map((entryId) => deck.find((e) => e.entryId === entryId))
      .filter((entry): entry is (typeof deck)[number] => entry !== undefined);
    const purgedCardNumbers = purgedEntries.map((entry) => entry.cardNumber);
    const perCardPrices = purgedEntries.map((_, order) =>
      purgeCardPrice(order + 1, modifiers),
    );
    const cost = purgeVisitCost(purgedEntries.length, modifiers);

    logEvent("purge_completed", {
      purgedCardNumbers,
      count: purgedCardNumbers.length,
      perCardPrices,
      totalCost: cost,
      isEnhanced: site.isEnhanced,
      discountPercent,
      essenceBefore: essence,
      essenceAfter: Math.max(0, essence - cost),
      completionLevel: state.completionLevel,
      currentDreamscape: state.currentDreamscape,
    });

    mutations.purgeDeckCards(
      site.id,
      purgedEntries.map((entry) => entry.entryId),
      cost,
      "purge",
    );
  }, [
    selectedEntryIds,
    deck,
    modifiers,
    mutations,
    site.id,
    site.isEnhanced,
    discountPercent,
    essence,
    state.completionLevel,
    state.currentDreamscape,
  ]);

  const handleClose = useCallback(() => {
    logEvent("site_completed", {
      siteType: "Purge",
      outcome: "skipped",
    });
    mutations.markSiteVisited(site.id);
    mutations.setScreen({ type: "dreamscape" });
  }, [mutations, site.id]);

  const remainingEssence = Math.max(0, essence - totalCost);

  return (
    <motion.div
      className="flex min-h-full flex-col items-center px-4 py-6 md:px-8 md:py-8"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header */}
      <div className="mb-4 text-center">
        <h2
          className="text-2xl font-bold tracking-wide md:text-3xl"
          style={{ color: "#ef4444" }}
        >
          Purge
        </h2>
        {site.isEnhanced && (
          <span
            className="mt-2 inline-block rounded-full px-3 py-1 text-sm font-bold"
            style={{
              background: "rgba(168, 85, 247, 0.15)",
              color: "#c084fc",
              border: "1px solid rgba(168, 85, 247, 0.3)",
            }}
          >
            Enhanced — {String(discountPercent)}% off every card
          </span>
        )}
        <p className="mt-2 text-sm opacity-60">
          Pay essence to permanently remove cards. Each card removed this visit
          costs more than the last.
        </p>
      </div>

      {/* Cost / essence summary */}
      <div className="mb-4 flex flex-wrap items-center justify-center gap-3 text-sm font-medium">
        <span
          className="rounded-lg px-4 py-2"
          style={{
            background: "rgba(239, 68, 68, 0.12)",
            border: "1px solid rgba(239, 68, 68, 0.35)",
            color: "#fca5a5",
          }}
        >
          {String(selectedCount)} selected — cost{" "}
          <EssenceValue
            amount={totalCost}
            color={ESSENCE_COLOR}
            className="font-bold"
          />
        </span>
        <span
          className="rounded-lg px-4 py-2"
          style={{
            background: "rgba(148, 163, 184, 0.12)",
            border: "1px solid rgba(148, 163, 184, 0.3)",
          }}
        >
          Essence after:{" "}
          <EssenceValue
            amount={remainingEssence}
            color={ESSENCE_COLOR}
            className="font-bold"
          />{" "}
          / <EssenceValue amount={essence} color={ESSENCE_COLOR} />
        </span>
        <span
          className="rounded-lg px-4 py-2"
          style={{
            background: "rgba(148, 163, 184, 0.12)",
            border: "1px solid rgba(148, 163, 184, 0.3)",
            opacity: canSelectMore ? 1 : 0.5,
          }}
        >
          {canSelectMore ? (
            <>
              Next card:{" "}
              <EssenceValue
                amount={nextCardPrice}
                color={ESSENCE_COLOR}
                className="font-bold"
              />
            </>
          ) : selectedCount >= MAX_PURGE_PER_VISIT ? (
            "Visit limit reached"
          ) : (
            "Not enough essence for another"
          )}
        </span>
      </div>

      {/* Action buttons — kept above the deck grid so the Purge button stays
          visible without scrolling past a long deck. */}
      <div className="mb-6 flex gap-4">
        <button
          className="rounded-lg px-6 py-2.5 text-base font-bold transition-opacity"
          style={{
            background:
              selectedCount > 0
                ? "linear-gradient(135deg, #ef4444 0%, #dc2626 100%)"
                : "#4b5563",
            color: selectedCount > 0 ? "#ffffff" : "#9ca3af",
            opacity: selectedCount > 0 ? 1 : 0.6,
            cursor: selectedCount > 0 ? "pointer" : "not-allowed",
          }}
          disabled={selectedCount === 0}
          onClick={handlePurge}
        >
          Purge {String(selectedCount)} Card
          {selectedCount !== 1 ? "s" : ""}
          {selectedCount > 0 ? (
            <>
              {" — "}
              <EssenceValue amount={totalCost} color="inherit" />
            </>
          ) : null}
        </button>
        <button
          className="rounded-lg px-6 py-2.5 text-base font-medium transition-colors"
          style={{
            background: "rgba(107, 114, 128, 0.2)",
            border: "1px solid rgba(107, 114, 128, 0.4)",
            color: "#9ca3af",
          }}
          onClick={handleClose}
        >
          Close
        </button>
      </div>

      {/* Deck grid */}
      <div className="grid w-full max-w-5xl grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
        {deck.map((entry, index) => {
          const card = cardDatabase.get(entry.cardNumber);
          if (!card) return null;
          const order = selectedEntryIds.indexOf(entry.entryId);
          const isSelected = order !== -1;
          const cardPrice = isSelected
            ? purgeCardPrice(order + 1, modifiers)
            : null;
          const isAffordable = isSelected || canSelectMore;
          return (
            <motion.div
              key={entry.entryId}
              className="relative"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: index * 0.03 }}
              style={{ opacity: isAffordable ? 1 : 0.4 }}
            >
              <CardDisplay
                card={card}
                onClick={() => toggleSelection(entry.entryId)}
                selected={isSelected}
                selectionColor="#ef4444"
              />
              {cardPrice !== null && (
                <span
                  className="pointer-events-none absolute -right-1 -top-1 z-10 rounded-full px-2 py-0.5 text-xs font-bold shadow"
                  style={{
                    background: "#dc2626",
                    color: "#ffffff",
                    border: "1px solid rgba(255, 255, 255, 0.4)",
                  }}
                >
                  <EssenceValue amount={cardPrice} color="inherit" />
                </span>
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}
