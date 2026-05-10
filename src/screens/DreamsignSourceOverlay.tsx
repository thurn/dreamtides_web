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
  packageTides: PackageTideId[];
  matchedMandatoryTides: PackageTideId[];
  matchedOptionalTides: PackageTideId[];
  isFallback: boolean;
  hasTemplate: boolean;
}

function sortTides(tides: readonly string[]): string[] {
  return [...tides].sort((a, b) => a.localeCompare(b));
}

function buildEntry(
  dreamsign: Dreamsign,
  template: DreamsignTemplate | undefined,
  mandatoryTides: Set<PackageTideId>,
  optionalTides: Set<PackageTideId>,
): DreamsignSourceEntry {
  const tides = template?.packageTides ?? [];
  const matchedMandatoryTides = tides.filter((tide) =>
    mandatoryTides.has(tide),
  );
  const matchedOptionalTides = tides.filter((tide) =>
    optionalTides.has(tide),
  );
  return {
    id: dreamsign.id ?? dreamsign.name,
    name: dreamsign.name,
    packageTides: sortTides(tides),
    matchedMandatoryTides: sortTides(matchedMandatoryTides),
    matchedOptionalTides: sortTides(matchedOptionalTides),
    isFallback:
      matchedMandatoryTides.length === 0 && matchedOptionalTides.length === 0,
    hasTemplate: template !== undefined,
  };
}

function TideChip({
  label,
  variant,
}: {
  label: string;
  variant: "required" | "optional" | "neutral";
}) {
  const colors =
    variant === "required"
      ? {
        background: "rgba(251, 191, 36, 0.16)",
        border: "1px solid rgba(251, 191, 36, 0.35)",
        color: "#fbbf24",
      }
      : variant === "optional"
        ? {
          background: "rgba(96, 165, 250, 0.16)",
          border: "1px solid rgba(96, 165, 250, 0.35)",
          color: "#93c5fd",
        }
        : {
          background: "rgba(148, 163, 184, 0.16)",
          border: "1px solid rgba(148, 163, 184, 0.35)",
          color: "#cbd5e1",
        };
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide uppercase"
      style={colors}
    >
      {label}
    </span>
  );
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
        {entry.isFallback ? (
          <TideChip label="fallback" variant="neutral" />
        ) : (
          <TideChip label="selected" variant="required" />
        )}
      </div>

      {entry.matchedMandatoryTides.length + entry.matchedOptionalTides.length > 0 ? (
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
          {entry.hasTemplate
            ? "No selected tide overlap. This dreamsign is being shown as a broader-pool fallback."
            : "This dreamsign is no longer in the loaded catalog; treating as a fallback."}
        </p>
      )}

      {entry.packageTides.length > 0 && (
        <>
          <p className="mt-3 text-[11px] font-medium uppercase tracking-wide opacity-60">
            Dreamsign tide ids
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {entry.packageTides.map((tide) => (
              <TideChip key={`tide-${tide}`} label={tide} variant="neutral" />
            ))}
          </div>
        </>
      )}
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
