import { useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { TideChip } from "../components/TideChip";
import type { CardSourceDebugEntry, CardSourceDebugState } from "../types/quest";

interface CardSourceOverlayProps {
  cardSourceDebug: CardSourceDebugState | null;
  isOpen: boolean;
  onClose: () => void;
}

function matchedTides(entry: CardSourceDebugEntry): string[] {
  return [...entry.matchedMandatoryTides, ...entry.matchedOptionalTides];
}

function surfaceCopy(surface: CardSourceDebugState["surface"]): string {
  switch (surface) {
    case "Draft":
      return "Draft cards come directly from your resolved package pool.";
    case "Shop":
    case "SpecialtyShop":
      return "Shop cards prefer selected package tides and fall back to the broader pool only when needed.";
    case "BattleReward":
    case "Reward":
      return "Rewards prefer selected package tides and fall back when no overlap is available.";
  }
}

function CardExplanation({ entry }: { entry: CardSourceDebugEntry }) {
  const selectedTides = matchedTides(entry);

  return (
    <div
      className="rounded-xl p-3"
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
        {entry.isFallback ? (
          <TideChip label="fallback" variant="neutral" />
        ) : (
          <TideChip label="selected" variant="required" />
        )}
      </div>

      {selectedTides.length > 0 ? (
        <>
          <p className="mt-3 text-[11px] font-medium uppercase tracking-wide opacity-60">
            Matching selected tides
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {entry.matchedMandatoryTides.map((tide) => (
              <TideChip key={`required-${tide}`} label={tide} variant="required" />
            ))}
            {entry.matchedOptionalTides.map((tide) => (
              <TideChip key={`optional-${tide}`} label={tide} variant="optional" />
            ))}
          </div>
        </>
      ) : (
        <p className="mt-3 text-xs opacity-70">
          No selected tide overlap. This card is being shown as a broader-pool
          fallback.
        </p>
      )}

      <p className="mt-3 text-[11px] font-medium uppercase tracking-wide opacity-60">
        Card tide ids
      </p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {entry.cardTides.map((tide) => (
          <TideChip key={`card-${tide}`} label={tide} variant="neutral" />
        ))}
      </div>
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
              {"\u2715"}
            </button>
          </div>

          <div className="max-h-[calc(70vh-92px)] space-y-3 overflow-y-auto p-4">
            {cardSourceDebug.entries.map((entry) => (
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
