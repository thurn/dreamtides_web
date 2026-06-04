import { useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type {
  CardSourceDebugEntry,
  CardSourceDebugState,
} from "../types/quest";

interface CardSourceOverlayProps {
  cardSourceDebug: CardSourceDebugState | null;
  isOpen: boolean;
  onClose: () => void;
}

function surfaceCopy(surface: CardSourceDebugState["surface"]): string {
  switch (surface) {
    case "Draft":
      return "Draft cards come directly from your dreamcaller's idf3 pool, built around its signature cards.";
    case "Shop":
    case "SpecialtyShop":
      return "Shop cards are drawn from your dreamcaller's idf3 pool, built around its signature cards.";
    case "BattleReward":
    case "Reward":
      return "Rewards are drawn from your dreamcaller's idf3 pool, built around its signature cards.";
  }
}

function CardExplanation({ entry }: { entry: CardSourceDebugEntry }) {
  const inStarterDecklist = entry.inStarterDecklist;
  const copies = entry.draftPoolCopies;

  return (
    <div
      className="rounded-lg p-3"
      style={{
        background: "rgba(15, 23, 42, 0.5)",
        border: "1px solid rgba(148, 163, 184, 0.18)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold" style={{ color: "#f8fafc" }}>
            {entry.cardName}
          </p>
          <p className="text-[11px] opacity-50">#{String(entry.cardNumber)}</p>
        </div>
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{
            background: inStarterDecklist
              ? "rgba(168, 85, 247, 0.28)"
              : "rgba(148, 163, 184, 0.22)",
            color: inStarterDecklist ? "#f1f5f9" : "#cbd5e1",
            border: `1px solid ${
              inStarterDecklist
                ? "rgba(168, 85, 247, 0.45)"
                : "rgba(148, 163, 184, 0.4)"
            }`,
          }}
        >
          {inStarterDecklist ? "Starter deck" : "Draft pool"}
        </span>
      </div>

      <p className="mt-3 text-xs opacity-70">
        {inStarterDecklist
          ? "Part of this dreamcaller's starting decklist."
          : copies > 0
            ? `Draft-pool card (${String(copies)} ${copies === 1 ? "copy" : "copies"}).`
            : "Drawn from the broader pool."}
      </p>
    </div>
  );
}

export function CardSourceOverlay({
  cardSourceDebug,
  isOpen,
  onClose,
}: CardSourceOverlayProps) {
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
  }, [handleClose, isOpen]);

  return (
    <AnimatePresence>
      {isOpen && cardSourceDebug !== null && (
        <motion.aside
          key="card-source-overlay"
          className="fixed top-4 right-4 left-4 z-[55] max-h-[70vh] overflow-hidden rounded-2xl md:left-auto md:w-[440px]"
          style={{
            background:
              "linear-gradient(180deg, rgba(7, 10, 18, 0.96) 0%, rgba(11, 17, 30, 0.96) 100%)",
            border: "1px solid rgba(96, 165, 250, 0.28)",
            boxShadow: "0 20px 60px rgba(2, 6, 23, 0.5)",
            backdropFilter: "blur(12px)",
          }}
          initial={{ opacity: 0, y: -16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.22 }}
        >
          <div
            className="flex items-start justify-between gap-3 px-4 py-3"
            style={{ borderBottom: "1px solid rgba(148, 163, 184, 0.14)" }}
          >
            <div>
              <p className="text-xs font-bold tracking-[0.18em] uppercase opacity-60">
                Why am I seeing these cards?
              </p>
              <h2 className="text-lg font-bold" style={{ color: "#f8fafc" }}>
                {cardSourceDebug.screenLabel}
              </h2>
              <p className="mt-1 text-xs opacity-70">
                {surfaceCopy(cardSourceDebug.surface)}
              </p>
            </div>
            <button
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors"
              style={{
                background: "rgba(255, 255, 255, 0.08)",
                color: "#e2e8f0",
              }}
              onClick={handleClose}
              aria-label="Close card source overlay"
            >
              {"✕"}
            </button>
          </div>

          <div className="max-h-[calc(70vh-92px)] space-y-3 overflow-y-auto p-4">
            {(cardSourceDebug.entries ?? []).map((entry) => (
              <CardExplanation
                key={`${String(entry.cardNumber)}-${cardSourceDebug.surface}`}
                entry={entry}
              />
            ))}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
