import { useCallback, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { GLOSSARY } from "../data/glossary";
import { GlossaryDefinitionCard } from "./GlossaryDefinitionCard";
import { logEvent } from "../logging";

/**
 * Quick-reference popup that lists every glossary term and its
 * definition.
 *
 * Sourced from `GLOSSARY` in `src/data/glossary.ts` — the same data the
 * card-text tokenizer (`src/tango/components/card-text.ts`) uses to wrap
 * matching words in hover popovers. There is exactly one place that
 * names the terms and writes their definitions; this popup and the
 * in-card tooltip both consume that single source.
 *
 * Visual chrome reuses `GlossaryDefinitionCard` so each row of the
 * popup matches the floating tooltip exactly. The player learns the
 * association: a term in card text and a term in the popup look the
 * same.
 *
 * The popup is a centered modal sized for comfortable reading at
 * mobile widths and below. Its body scrolls when the glossary grows
 * past the viewport height.
 */
interface GlossaryPopupProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GlossaryPopup({ isOpen, onClose }: GlossaryPopupProps) {
  const openTimestampRef = useRef<number>(0);
  const prevOpenRef = useRef(false);

  useEffect(() => {
    if (isOpen && !prevOpenRef.current) {
      openTimestampRef.current = Date.now();
      logEvent("glossary_popup_opened", { entryCount: GLOSSARY.length });
    }
    prevOpenRef.current = isOpen;
  }, [isOpen]);

  const handleClose = useCallback(() => {
    const duration = Date.now() - openTimestampRef.current;
    logEvent("glossary_popup_closed", { durationMs: duration });
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return undefined;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
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
          key="glossary-popup-backdrop"
          data-testid="glossary-popup-backdrop"
          className="fixed inset-0 z-[70] flex items-center justify-center px-3 py-6"
          style={{ backgroundColor: "rgba(5, 2, 10, 0.78)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={(event) => {
            // Backdrop click closes the popup. Clicks inside the
            // panel bubble to the same handler, so guard on target.
            if (event.target === event.currentTarget) {
              handleClose();
            }
          }}
        >
          <motion.div
            data-testid="glossary-popup-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Glossary"
            className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-lg"
            style={{
              background: "rgba(10, 6, 18, 0.98)",
              border: "1px solid rgba(124, 58, 237, 0.45)",
              boxShadow: "0 24px 60px rgba(0, 0, 0, 0.65)",
            }}
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.18 }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-3"
              style={{
                borderBottom: "1px solid rgba(124, 58, 237, 0.3)",
                background:
                  "linear-gradient(180deg, rgba(10, 6, 18, 0.98) 0%, rgba(10, 6, 18, 0.85) 100%)",
              }}
            >
              <div>
                <h2
                  className="text-base font-bold md:text-lg"
                  style={{ color: "#e2e8f0" }}
                >
                  Glossary
                </h2>
                <p
                  className="text-[11px] opacity-60"
                  style={{ color: "#cbd5f5" }}
                >
                  {String(GLOSSARY.length)} terms
                </p>
              </div>
              <button
                type="button"
                className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-lg transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                style={{
                  background: "rgba(255, 255, 255, 0.1)",
                  color: "#e2e8f0",
                }}
                onClick={handleClose}
                aria-label="Close glossary"
              >
                {"✕"}
              </button>
            </div>

            {/* Scrollable body. Each entry renders the same
                `GlossaryDefinitionCard` shown in card-text hover
                tooltips, so the player connects the popup row to the
                floating definition. */}
            <div
              className="flex-1 overflow-y-auto px-4 py-3"
              data-testid="glossary-popup-body"
            >
              <ul className="flex flex-col gap-2">
                {GLOSSARY.map((entry) => (
                  <li key={entry.term} data-testid="glossary-popup-entry">
                    <GlossaryDefinitionCard entry={entry} />
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
