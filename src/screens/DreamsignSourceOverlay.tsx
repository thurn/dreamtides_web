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
  initialDreamsignPoolIds?: readonly string[];
  remainingDreamsignPool?: readonly string[];
  requestedOptionCount?: number;
  requiredTideGuarantee?: boolean;
}

interface DreamsignSourceEntry {
  id: string;
  name: string;
  hasTemplate: boolean;
  packageTides: PackageTideId[];
  mandatoryMatches: PackageTideId[];
  optionalMatches: PackageTideId[];
  unmatchedTides: PackageTideId[];
  inSourcePool: boolean;
  inCandidatePool: boolean;
  effectDescription: string;
  statusLabel: string;
}

interface CandidatePoolDebug {
  candidateIds: string[];
  sourcePoolSize: number;
  sourcePoolKnownIds: number;
  requiredCandidateCount: number;
  optionalCandidateCount: number;
  unmatchedCandidateCount: number;
  missingTemplateCount: number;
  requiredOfferCount: number;
}

function uniqueIds(ids: readonly string[]): string[] {
  return Array.from(new Set(ids));
}

function formatList(values: readonly string[]): string {
  return values.length > 0 ? values.join(", ") : "(none)";
}

function formatCount(value: number): string {
  return String(value);
}

function classifyStatus(entry: {
  readonly hasTemplate: boolean;
  readonly mandatoryMatches: readonly string[];
  readonly optionalMatches: readonly string[];
}): string {
  if (!entry.hasTemplate) {
    return "missing template";
  }
  if (entry.mandatoryMatches.length > 0) {
    return "mandatory tide match";
  }
  if (entry.optionalMatches.length > 0) {
    return "optional tide match";
  }
  return "no selected tide match";
}

function buildEntry(
  dreamsign: Dreamsign,
  template: DreamsignTemplate | undefined,
  mandatoryTides: Set<PackageTideId>,
  optionalTides: Set<PackageTideId>,
  sourcePoolIds: Set<string>,
  candidatePoolIds: Set<string>,
): DreamsignSourceEntry {
  const tides = template?.packageTides ?? [];
  const mandatoryMatches = tides.filter((tide) => mandatoryTides.has(tide));
  const optionalMatches = tides.filter((tide) => optionalTides.has(tide));
  const unmatchedTides = tides.filter(
    (tide) => !mandatoryTides.has(tide) && !optionalTides.has(tide),
  );
  const hasTemplate = template !== undefined;
  const id = dreamsign.id ?? dreamsign.name;
  const statusLabel = classifyStatus({
    hasTemplate,
    mandatoryMatches,
    optionalMatches,
  });
  return {
    id,
    name: dreamsign.name,
    hasTemplate,
    packageTides: tides,
    mandatoryMatches,
    optionalMatches,
    unmatchedTides,
    inSourcePool: sourcePoolIds.has(id),
    inCandidatePool: candidatePoolIds.has(id),
    effectDescription: template?.effectDescription ?? dreamsign.effectDescription,
    statusLabel,
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
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
          style={{
            background:
              entry.mandatoryMatches.length > 0
                ? "rgba(34, 211, 238, 0.22)"
                : entry.optionalMatches.length > 0
                  ? "rgba(168, 85, 247, 0.28)"
                  : "rgba(148, 163, 184, 0.22)",
            color: "#f1f5f9",
            border: `1px solid ${
              entry.mandatoryMatches.length > 0
                ? "rgba(34, 211, 238, 0.42)"
                : entry.optionalMatches.length > 0
                  ? "rgba(168, 85, 247, 0.45)"
                  : "rgba(148, 163, 184, 0.4)"
            }`,
          }}
        >
          {entry.statusLabel}
        </span>
      </div>

      <div className="mt-3 space-y-2 text-xs">
        <DebugRow label="template id" value={entry.id} />
        <DebugRow
          label="source pool"
          value={entry.inSourcePool ? "present in resolved package pool" : "not present in resolved package pool"}
        />
        <DebugRow
          label="candidate pool"
          value={entry.inCandidatePool ? "present before this reveal" : "not present before this reveal"}
        />
        <DebugRow label="template tides" value={formatList(entry.packageTides)} />
        <DebugRow
          label="mandatory matches"
          value={formatList(entry.mandatoryMatches)}
        />
        <DebugRow
          label="optional matches"
          value={formatList(entry.optionalMatches)}
        />
        <DebugRow label="other tides" value={formatList(entry.unmatchedTides)} />
        <DebugRow label="effect" value={entry.effectDescription} />
      </div>
    </div>
  );
}

function DebugRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="grid grid-cols-[112px_minmax(0,1fr)] gap-2 rounded-md px-2.5 py-2"
      style={{
        background: "rgba(30, 41, 59, 0.62)",
        border: "1px solid rgba(148, 163, 184, 0.14)",
      }}
    >
      <span className="font-semibold opacity-55">{label}</span>
      <span className="min-w-0 break-words" style={{ color: "#e2e8f0" }}>
        {value}
      </span>
    </div>
  );
}

function buildCandidateDebug({
  candidateIds,
  sourcePoolIds,
  templatesById,
  mandatoryTides,
  optionalTides,
  offeredIds,
}: {
  readonly candidateIds: readonly string[];
  readonly sourcePoolIds: readonly string[];
  readonly templatesById: ReadonlyMap<string, DreamsignTemplate>;
  readonly mandatoryTides: ReadonlySet<PackageTideId>;
  readonly optionalTides: ReadonlySet<PackageTideId>;
  readonly offeredIds: ReadonlySet<string>;
}): CandidatePoolDebug {
  let requiredCandidateCount = 0;
  let optionalCandidateCount = 0;
  let unmatchedCandidateCount = 0;
  let missingTemplateCount = 0;
  let requiredOfferCount = 0;

  for (const id of candidateIds) {
    const template = templatesById.get(id);
    if (template === undefined) {
      missingTemplateCount += 1;
      unmatchedCandidateCount += 1;
      continue;
    }

    const hasRequired = template.packageTides.some((tide) =>
      mandatoryTides.has(tide),
    );
    const hasOptional = template.packageTides.some((tide) =>
      optionalTides.has(tide),
    );
    if (hasRequired) {
      requiredCandidateCount += 1;
      if (offeredIds.has(id)) {
        requiredOfferCount += 1;
      }
    } else if (hasOptional) {
      optionalCandidateCount += 1;
    } else {
      unmatchedCandidateCount += 1;
    }
  }

  return {
    candidateIds: [...candidateIds],
    sourcePoolSize: sourcePoolIds.length,
    sourcePoolKnownIds: sourcePoolIds.filter((id) => templatesById.has(id)).length,
    requiredCandidateCount,
    optionalCandidateCount,
    unmatchedCandidateCount,
    missingTemplateCount,
    requiredOfferCount,
  };
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
  initialDreamsignPoolIds = [],
  remainingDreamsignPool = [],
  requestedOptionCount,
  requiredTideGuarantee = false,
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

  const { entries, candidateDebug } = useMemo(() => {
    const templatesById = new Map(
      dreamsignTemplates.map((template) => [template.id, template]),
    );
    const mandatorySet = new Set(mandatoryTides);
    const optionalSet = new Set(optionalTides);
    const offeredIds = new Set(
      offeredDreamsigns.map((dreamsign) => dreamsign.id ?? dreamsign.name),
    );
    const candidateIds = uniqueIds([
      ...offeredIds,
      ...remainingDreamsignPool,
    ]);
    const sourcePoolIds = initialDreamsignPoolIds.length > 0
      ? uniqueIds(initialDreamsignPoolIds)
      : candidateIds;
    const sourcePoolSet = new Set(sourcePoolIds);
    const candidatePoolSet = new Set(candidateIds);
    return {
      entries: offeredDreamsigns.map((dreamsign) =>
        buildEntry(
        dreamsign,
        dreamsign.id !== undefined ? templatesById.get(dreamsign.id) : undefined,
        mandatorySet,
        optionalSet,
          sourcePoolSet,
          candidatePoolSet,
        ),
      ),
      candidateDebug: buildCandidateDebug({
        candidateIds,
        sourcePoolIds,
        templatesById,
        mandatoryTides: mandatorySet,
        optionalTides: optionalSet,
        offeredIds,
      }),
    };
  }, [
    dreamsignTemplates,
    initialDreamsignPoolIds,
    mandatoryTides,
    offeredDreamsigns,
    optionalTides,
    remainingDreamsignPool,
  ]);

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
                  Developer generation trace for this Dreamsign reveal.
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
              <div
                className="rounded-xl p-3 text-xs"
                style={{
                  background: "rgba(15, 23, 42, 0.58)",
                  border: "1px solid rgba(96, 165, 250, 0.18)",
                }}
              >
                <p className="mb-2 font-semibold" style={{ color: "#f8fafc" }}>
                  Selection input
                </p>
                <div className="space-y-2">
                  <DebugRow
                    label="source pool"
                    value={`resolved package dreamsignPoolIds: ${formatCount(candidateDebug.sourcePoolSize)} ids (${formatCount(candidateDebug.sourcePoolKnownIds)} known templates)`}
                  />
                  <DebugRow
                    label="candidate set"
                    value={`${formatCount(candidateDebug.candidateIds.length)} ids before reveal; ${formatCount(entries.length)} offered/spent; ${formatCount(remainingPoolSize)} remaining after reveal`}
                  />
                  <DebugRow
                    label="requested"
                    value={requestedOptionCount === undefined ? "(unknown)" : formatCount(requestedOptionCount)}
                  />
                  <DebugRow
                    label="selected tides"
                    value={`mandatory: ${formatList(mandatoryTides)}; optional subset: ${formatList(optionalTides)}`}
                  />
                  <DebugRow
                    label="candidate tides"
                    value={`mandatory-match candidates: ${formatCount(candidateDebug.requiredCandidateCount)}; optional-only candidates: ${formatCount(candidateDebug.optionalCandidateCount)}; no selected-tide match: ${formatCount(candidateDebug.unmatchedCandidateCount)}; missing templates: ${formatCount(candidateDebug.missingTemplateCount)}`}
                  />
                  <DebugRow
                    label="rule"
                    value={
                      requiredTideGuarantee
                        ? `Dreamsign Draft applies required-tide coverage when possible; offered required-tide matches: ${formatCount(candidateDebug.requiredOfferCount)}.`
                        : "This reveal uses the shuffled candidate pool without required-tide coverage."
                    }
                  />
                </div>
              </div>
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
