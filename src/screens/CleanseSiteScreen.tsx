import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { DeckEntry, Dreamsign, SiteState } from "../types/quest";
import { useQuest } from "../state/quest-context";
import { logEvent } from "../logging";
import { CardDisplay } from "../components/CardDisplay";
import { RulesText } from "../components/RulesText";

/** Props for the CleanseSiteScreen component. */
interface CleanseSiteScreenProps {
  site: SiteState;
}

/** A bane item that can be cleansed: either a bane card or a bane dreamsign. */
type BaneItem =
  | { kind: "card"; entry: DeckEntry; cardName: string }
  | { kind: "dreamsign"; dreamsign: Dreamsign; index: number };

/** Displays the cleanse site: removes bane-flagged items from the player's collection. */
export function CleanseSiteScreen({ site }: CleanseSiteScreenProps) {
  const { state, mutations, cardDatabase } = useQuest();
  const { deck, dreamsigns } = state;

  const [autoClosed, setAutoClosed] = useState(false);

  const baneItems = useMemo<BaneItem[]>(() => {
    const items: BaneItem[] = [];
    for (const entry of deck) {
      if (entry.isBane) {
        const card = cardDatabase.get(entry.cardNumber);
        items.push({
          kind: "card",
          entry,
          cardName: card?.name ?? `Card #${String(entry.cardNumber)}`,
        });
      }
    }
    for (let i = 0; i < dreamsigns.length; i++) {
      if (dreamsigns[i].isBane) {
        items.push({
          kind: "dreamsign",
          dreamsign: dreamsigns[i],
          index: i,
        });
      }
    }
    return items.slice(0, 3);
  }, [deck, dreamsigns, cardDatabase]);

  const hasBanes = baneItems.length > 0;

  useEffect(() => {
    logEvent("site_entered", {
      siteType: "Cleanse",
      isEnhanced: site.isEnhanced,
      baneCount: baneItems.length,
    });
  }, [site.isEnhanced, baneItems.length]);

  const completeSite = useCallback(() => {
    logEvent("site_completed", {
      siteType: "Cleanse",
      isEnhanced: site.isEnhanced,
    });
    mutations.markSiteVisited(site.id);
    mutations.setScreen({ type: "dreamscape" });
  }, [site, mutations]);

  // Auto-complete when no banes exist
  useEffect(() => {
    if (!hasBanes && !autoClosed) {
      setAutoClosed(true);
      const timer = setTimeout(completeSite, 1000);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [hasBanes, autoClosed, completeSite]);

  const handleCleanseAll = useCallback(() => {
    const removedCards: Array<{ cardNumber: number; cardName: string }> = [];
    const removedDreamsigns: string[] = [];

    // Remove bane dreamsigns first (by descending index to preserve indices)
    const dreamsignIndices = baneItems
      .filter((item): item is BaneItem & { kind: "dreamsign" } => item.kind === "dreamsign")
      .map((item) => item.index)
      .sort((a, b) => b - a);
    for (const idx of dreamsignIndices) {
      const ds = dreamsigns[idx];
      if (ds) {
        removedDreamsigns.push(ds.name);
      }
      mutations.removeDreamsign(idx, "cleanse_site");
    }

    // Remove bane cards
    for (const item of baneItems) {
      if (item.kind === "card") {
        removedCards.push({
          cardNumber: item.entry.cardNumber,
          cardName: item.cardName,
        });
        mutations.removeCard(item.entry.entryId, "cleanse_site");
      }
    }

    logEvent("cleanse_completed", {
      banesRemovedCount: removedCards.length + removedDreamsigns.length,
      removedCards,
      removedDreamsigns,
    });

    completeSite();
  }, [baneItems, dreamsigns, mutations, completeSite]);

  const handleDecline = useCallback(() => {
    logEvent("cleanse_declined", {
      baneCount: baneItems.length,
    });
    completeSite();
  }, [baneItems.length, completeSite]);

  // "Nothing to cleanse" display
  if (!hasBanes) {
    return (
      <AnimatePresence>
        <motion.div
          className="flex min-h-full flex-col items-center justify-center gap-4 p-8"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            className="flex h-20 w-20 items-center justify-center rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(16, 185, 129, 0.2) 0%, transparent 70%)",
            }}
            animate={{
              boxShadow: [
                "0 0 15px rgba(16, 185, 129, 0.2)",
                "0 0 30px rgba(16, 185, 129, 0.4)",
                "0 0 15px rgba(16, 185, 129, 0.2)",
              ],
            }}
            transition={{ duration: 1.2, repeat: Infinity }}
          >
            <span className="text-4xl" style={{ color: "#10b981" }}>
              {"\u2713"}
            </span>
          </motion.div>
          <p
            className="text-xl font-bold"
            style={{ color: "#10b981" }}
          >
            Nothing to cleanse.
          </p>
          <p className="text-sm opacity-50">
            Your collection is free of banes.
          </p>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <motion.div
      className="flex min-h-full flex-col items-center px-4 py-6 md:px-8 md:py-8"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
    >
      {/* Header */}
      <div className="mb-6 text-center">
        <h2
          className="text-2xl font-bold tracking-wide md:text-3xl"
          style={{ color: "#dc2626" }}
        >
          Cleanse
        </h2>
        <p className="mt-1 text-sm opacity-50">
          Purify your collection of tainted items
        </p>
      </div>

      {/* Bane items display */}
      <div className="mb-8 flex flex-wrap justify-center gap-6">
        {baneItems.map((item, index) => (
          <motion.div
            key={item.kind === "card" ? item.entry.entryId : `ds-${String(item.index)}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.15, duration: 0.4 }}
          >
            {item.kind === "card" ? (
              <BaneCardDisplay
                cardNumber={item.entry.cardNumber}
              />
            ) : (
              <BaneDreamsignDisplay dreamsign={item.dreamsign} />
            )}
          </motion.div>
        ))}
      </div>

      {/* Action buttons */}
      <div className="flex gap-4">
        <motion.button
          className="rounded-lg px-8 py-3 text-lg font-bold text-white transition-opacity"
          style={{
            background: "linear-gradient(135deg, #dc2626 0%, #991b1b 100%)",
            boxShadow: "0 0 20px rgba(220, 38, 38, 0.3)",
          }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.97 }}
          onClick={handleCleanseAll}
        >
          Cleanse All
        </motion.button>
        <button
          className="rounded-lg px-8 py-3 text-lg font-medium transition-colors"
          style={{
            background: "rgba(107, 114, 128, 0.2)",
            border: "1px solid rgba(107, 114, 128, 0.4)",
            color: "#9ca3af",
          }}
          onClick={handleDecline}
        >
          Decline
        </button>
      </div>
    </motion.div>
  );
}

/** Renders a bane card with a dark red tainted overlay. */
function BaneCardDisplay({ cardNumber }: { cardNumber: number }) {
  const { cardDatabase } = useQuest();
  const card = cardDatabase.get(cardNumber);

  if (!card) {
    return (
      <p className="text-sm opacity-50">
        Unknown card #{String(cardNumber)}
      </p>
    );
  }

  return (
    <div
      className="relative rounded-xl p-4"
      style={{
        background:
          "linear-gradient(145deg, #1a0a0a 0%, #1a0510 60%, #0d0814 100%)",
        border: "1px solid rgba(220, 38, 38, 0.4)",
        boxShadow: "0 0 20px rgba(220, 38, 38, 0.15)",
      }}
    >
      <div className="mb-2 text-center">
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
          style={{
            background: "rgba(220, 38, 38, 0.15)",
            color: "#fca5a5",
            border: "1px solid rgba(220, 38, 38, 0.3)",
          }}
        >
          Bane
        </span>
      </div>
      <div style={{ width: "180px" }}>
        <CardDisplay card={card} />
      </div>
      {/* Tainted overlay */}
      <div
        className="pointer-events-none absolute inset-0 rounded-xl"
        style={{
          background:
            "linear-gradient(180deg, rgba(220, 38, 38, 0.08) 0%, rgba(220, 38, 38, 0.15) 100%)",
          border: "1px solid rgba(220, 38, 38, 0.2)",
        }}
      />
    </div>
  );
}

/** Renders a bane dreamsign with tainted visual treatment. */
function BaneDreamsignDisplay({ dreamsign }: { dreamsign: Dreamsign }) {
  return (
    <div
      className="relative flex w-56 flex-col items-center gap-2 rounded-xl p-4"
      style={{
        background:
          "linear-gradient(145deg, #1a0a0a 0%, #1a0510 60%, #0d0814 100%)",
        border: "1px solid rgba(220, 38, 38, 0.4)",
        boxShadow: "0 0 20px rgba(220, 38, 38, 0.15)",
      }}
    >
      <span
        className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
        style={{
          background: "rgba(220, 38, 38, 0.15)",
          color: "#fca5a5",
          border: "1px solid rgba(220, 38, 38, 0.3)",
        }}
      >
        Bane
      </span>
      <h3
        className="text-center text-base font-bold"
        style={{ color: "#fca5a5" }}
      >
        {dreamsign.name}
      </h3>
      <p
        className="text-center text-xs leading-relaxed opacity-60"
        style={{ color: "#e2e8f0" }}
      >
        <RulesText text={dreamsign.effectDescription} />
      </p>
      {/* Tainted overlay */}
      <div
        className="pointer-events-none absolute inset-0 rounded-xl"
        style={{
          background:
            "linear-gradient(180deg, rgba(220, 38, 38, 0.06) 0%, rgba(220, 38, 38, 0.12) 100%)",
        }}
      />
    </div>
  );
}
