import { useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type {
  CardSourceDebugEntry,
  CardSourceDebugState,
} from "../types/quest";
import { TideDocumentationHover } from "../components/TideDocumentationHover";

interface CardSourceOverlayProps {
  cardSourceDebug: CardSourceDebugState | null;
  isOpen: boolean;
  onClose: () => void;
}

function surfaceCopy(surface: CardSourceDebugState["surface"]): string {
  switch (surface) {
    case "Draft":
      return "Draft cards come directly from your dreamcaller's pool.";
    case "Shop":
    case "SpecialtyShop":
      return "Shop cards prefer cards from your dreamcaller's pool, falling back to the broader pool only when needed.";
    case "BattleReward":
    case "Reward":
      return "Rewards prefer cards from your dreamcaller's pool, falling back to the broader pool when none match.";
  }
}

function labelize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function CardExplanation({ entry }: { entry: CardSourceDebugEntry }) {
  const sourceTides = entry.sourceTides ?? [];

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
            background: entry.isFallback
              ? "rgba(148, 163, 184, 0.22)"
              : "rgba(168, 85, 247, 0.28)",
            color: entry.isFallback ? "#cbd5e1" : "#f1f5f9",
            border: `1px solid ${
              entry.isFallback
                ? "rgba(148, 163, 184, 0.4)"
                : "rgba(168, 85, 247, 0.45)"
            }`,
          }}
        >
          {entry.isFallback ? "Fallback" : "On theme"}
        </span>
      </div>

      {sourceTides.length > 0 ? (
        <div className="mt-3 space-y-2">
          {sourceTides.map((tide) => (
            <div
              key={`${entry.cardNumber}-${tide.requirement}-${tide.tideId}`}
              className="rounded-md px-2.5 py-2 text-xs"
              style={{
                background: "rgba(30, 41, 59, 0.62)",
                border: "1px solid rgba(148, 163, 184, 0.16)",
              }}
            >
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-semibold" style={{ color: "#e0f2fe" }}>
                  <TideDocumentationHover tideId={tide.tideId}>
                    {tide.displayName}
                  </TideDocumentationHover>
                </span>
                <span className="opacity-55">•</span>
                <span className="opacity-80">{labelize(tide.requirement)}</span>
                <span className="opacity-55">•</span>
                <span className="opacity-80">{labelize(tide.role)}</span>
              </div>
              <p className="mt-1 opacity-65">
                This card entered the pool through {tide.displayName}.
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-xs opacity-70">
          {entry.isFallback
            ? "Drawn from the broader pool because no selected tide matched this card."
            : "Selected package match; source details are unavailable for this entry."}
        </p>
      )}
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
