import { useCallback, useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { DeckEntry, Dreamsign, SiteState } from "../types/quest";
import { useQuest } from "../state/quest-context";
import { logEvent } from "../logging";
import { CardDisplay } from "../components/CardDisplay";
import { RulesText } from "../components/RulesText";

/** Maximum number of banes a Cleanse site can remove. */
const MAX_CLEANSE = 3;

/** Props for the CleanseSiteScreen component. */
interface CleanseSiteScreenProps {
  site: SiteState;
}

/** A bane item that can be cleansed: either a bane card or a bane dreamsign. */
type BaneItem =
  | { kind: "card"; key: string; entry: DeckEntry; cardName: string }
  | { kind: "dreamsign"; key: string; dreamsign: Dreamsign; index: number };

/**
 * Displays the Cleanse site. The player sees every Bane card and Bane
 * Dreamsign they hold and selects up to 3 to remove, then confirms.
 */
export function CleanseSiteScreen({ site }: CleanseSiteScreenProps) {
  const { state, mutations, cardDatabase } = useQuest();
  const { deck, dreamsigns } = state;

  const [autoClosed, setAutoClosed] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const baneItems = useMemo<BaneItem[]>(() => {
    const items: BaneItem[] = [];
    for (const entry of deck) {
      if (entry.isBane) {
        const card = cardDatabase.get(entry.cardNumber);
        items.push({
          kind: "card",
          key: `card-${entry.entryId}`,
          entry,
          cardName: card?.name ?? `Card #${String(entry.cardNumber)}`,
        });
      }
    }
    for (let i = 0; i < dreamsigns.length; i++) {
      if (dreamsigns[i].isBane) {
        items.push({
          kind: "dreamsign",
          key: `dreamsign-${String(i)}`,
          dreamsign: dreamsigns[i],
          index: i,
        });
      }
    }
    return items;
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

  const toggleSelected = useCallback((key: string) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else if (next.size < MAX_CLEANSE) {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleCleanse = useCallback(() => {
    const cardEntryIds: string[] = [];
    const dreamsignIndices: number[] = [];
    for (const item of baneItems) {
      if (!selectedKeys.has(item.key)) {
        continue;
      }
      if (item.kind === "card") {
        cardEntryIds.push(item.entry.entryId);
      } else {
        dreamsignIndices.push(item.index);
      }
    }
    if (cardEntryIds.length + dreamsignIndices.length === 0) {
      return;
    }
    mutations.cleanseBanes(site.id, cardEntryIds, dreamsignIndices);
  }, [baneItems, selectedKeys, mutations, site.id]);

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
              {"✓"}
            </span>
          </motion.div>
          <p className="text-xl font-bold" style={{ color: "#10b981" }}>
            Nothing to cleanse.
          </p>
          <p className="text-sm opacity-50">
            Your collection is free of banes.
          </p>
        </motion.div>
      </AnimatePresence>
    );
  }

  const selectedCount = selectedKeys.size;

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
          Choose up to {String(MAX_CLEANSE)} banes to remove ({String(selectedCount)}/
          {String(MAX_CLEANSE)})
        </p>
      </div>

      {/* Bane items display */}
      <div className="mb-8 flex flex-wrap justify-center gap-6">
        {baneItems.map((item, index) => {
          const isSelected = selectedKeys.has(item.key);
          const isDisabled = !isSelected && selectedCount >= MAX_CLEANSE;
          return (
            <motion.button
              key={item.key}
              type="button"
              data-cleanse-bane-key={item.key}
              data-cleanse-selected={isSelected ? "true" : "false"}
              disabled={isDisabled}
              className="rounded-xl outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-red-400"
              style={{
                opacity: isDisabled ? 0.4 : 1,
                cursor: isDisabled ? "not-allowed" : "pointer",
                boxShadow: isSelected
                  ? "0 0 0 3px #dc2626, 0 0 22px rgba(220, 38, 38, 0.45)"
                  : "none",
              }}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: isDisabled ? 0.4 : 1, y: 0 }}
              transition={{ delay: index * 0.1, duration: 0.4 }}
              onClick={() => toggleSelected(item.key)}
            >
              {item.kind === "card" ? (
                <BaneCardDisplay cardNumber={item.entry.cardNumber} />
              ) : (
                <BaneDreamsignDisplay dreamsign={item.dreamsign} />
              )}
            </motion.button>
          );
        })}
      </div>

      {/* Action buttons */}
      <div className="flex gap-4">
        <motion.button
          className="rounded-lg px-8 py-3 text-lg font-bold text-white transition-opacity"
          style={{
            background:
              selectedCount > 0
                ? "linear-gradient(135deg, #dc2626 0%, #991b1b 100%)"
                : "#4b5563",
            boxShadow:
              selectedCount > 0
                ? "0 0 20px rgba(220, 38, 38, 0.3)"
                : "none",
            opacity: selectedCount > 0 ? 1 : 0.6,
            cursor: selectedCount > 0 ? "pointer" : "not-allowed",
          }}
          whileHover={selectedCount > 0 ? { scale: 1.05 } : undefined}
          whileTap={selectedCount > 0 ? { scale: 0.97 } : undefined}
          disabled={selectedCount === 0}
          onClick={handleCleanse}
        >
          {selectedCount > 0
            ? `Cleanse ${String(selectedCount)} ${selectedCount === 1 ? "Bane" : "Banes"}`
            : "Cleanse"}
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
