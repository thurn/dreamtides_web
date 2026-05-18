import { useCallback, useEffect, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Dreamsign } from "../types/quest";
import type { DreamsignTemplate, PackageTideId } from "../types/content";

interface DreamsignSourceOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  screenLabel: string;
  offeredDreamsigns: Dreamsign[];
  dreamsignTemplates: readonly DreamsignTemplate[];
  mandatoryTides: readonly PackageTideId[];
  optionalTides: readonly PackageTideId[];
  remainingPoolSize: number;
}

interface DreamsignSourceEntry {
  id: string;
  name: string;
  isFallback: boolean;
  hasTemplate: boolean;
}

function buildEntry(
  dreamsign: Dreamsign,
  template: DreamsignTemplate | undefined,
  mandatoryTides: Set<PackageTideId>,
  optionalTides: Set<PackageTideId>,
): DreamsignSourceEntry {
  const tides = template?.packageTides ?? [];
  const hasMandatoryMatch = tides.some((tide) => mandatoryTides.has(tide));
  const hasOptionalMatch = tides.some((tide) => optionalTides.has(tide));
  return {
    id: dreamsign.id ?? dreamsign.name,
    name: dreamsign.name,
    isFallback: !hasMandatoryMatch && !hasOptionalMatch,
    hasTemplate: template !== undefined,
  };
}

function DreamsignExplanation({ entry }: { entry: DreamsignSourceEntry }) {
  return (
    <div
      className="rounded-xl p-3"
      style={{
        background: "rgba(15, 23, 42, 0.5)",
        border: "1px solid rgba(168, 85, 247, 0.18)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-semibold" style={{ color: "#f8fafc" }}>
          {entry.name}
        </p>
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

      <p className="mt-3 text-xs opacity-70">
        {entry.isFallback
          ? entry.hasTemplate
            ? "Drawn from the broader pool because no on-theme dreamsign was available."
            : "This dreamsign has no entry in the loaded catalog and is treated as a fallback."
          : "Matches your dreamcaller's dreamsign pool."}
      </p>
    </div>
  );
}

export function DreamsignSourceOverlay({
  isOpen,
  onClose,
  screenLabel,
  offeredDreamsigns,
  dreamsignTemplates,
  mandatoryTides,
  optionalTides,
  remainingPoolSize,
}: DreamsignSourceOverlayProps) {
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

  const entries = useMemo(() => {
    const templatesById = new Map(
      dreamsignTemplates.map((template) => [template.id, template]),
    );
    const mandatorySet = new Set(mandatoryTides);
    const optionalSet = new Set(optionalTides);
    return offeredDreamsigns.map((dreamsign) =>
      buildEntry(
        dreamsign,
        dreamsign.id !== undefined ? templatesById.get(dreamsign.id) : undefined,
        mandatorySet,
        optionalSet,
      ),
    );
  }, [dreamsignTemplates, mandatoryTides, offeredDreamsigns, optionalTides]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <div
            data-testid="dreamsign-source-overlay-backdrop"
            className="fixed inset-0 z-[54]"
            onClick={handleClose}
            aria-hidden="true"
          />
          <motion.aside
            key="dreamsign-source-overlay"
            className="fixed top-4 right-4 left-4 z-[55] max-h-[70vh] overflow-hidden rounded-2xl md:left-auto md:w-[440px]"
            onClick={(event) => {
              event.stopPropagation();
            }}
            style={{
              background:
                "linear-gradient(180deg, rgba(7, 10, 18, 0.96) 0%, rgba(11, 17, 30, 0.96) 100%)",
              border: "1px solid rgba(168, 85, 247, 0.32)",
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
                  Why am I seeing these dreamsigns?
                </p>
                <h2 className="text-lg font-bold" style={{ color: "#f8fafc" }}>
                  {screenLabel}
                </h2>
                <p className="mt-1 text-xs opacity-70">
                  Dreamsigns are drawn from your Dreamcaller's pool. Each shown
                  dreamsign is removed from the run's shared pool. Remaining in
                  pool: {String(remainingPoolSize)}.
                </p>
              </div>
              <button
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors"
                style={{
                  background: "rgba(255, 255, 255, 0.08)",
                  color: "#e2e8f0",
                }}
                onClick={handleClose}
                aria-label="Close dreamsign source overlay"
              >
                {"✕"}
              </button>
            </div>

            <div className="max-h-[calc(70vh-92px)] space-y-3 overflow-y-auto p-4">
              {entries.length === 0 ? (
                <p className="text-sm opacity-70">
                  No dreamsigns are currently offered.
                </p>
              ) : (
                entries.map((entry) => (
                  <DreamsignExplanation
                    key={`${entry.id}-${entry.name}`}
                    entry={entry}
                  />
                ))
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
