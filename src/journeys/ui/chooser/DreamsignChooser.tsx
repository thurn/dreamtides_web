import { useCallback, useMemo, useState } from "react";

import type { ChooserRequest, ChooserResolution } from "../../apply/chooserPlan";

import { ChooserOverlay } from "./ChooserOverlay";
import { OFFERING_ACCENT } from "./offering-tokens";

export interface DreamsignChooserCandidate {
  readonly index: number;
  readonly id?: string;
  readonly name: string;
  readonly description: string;
}

export interface DreamsignChooserProps {
  readonly request: Extract<ChooserRequest, { kind: "dreamsign" }>;
  readonly candidates: readonly DreamsignChooserCandidate[];
  readonly onResolve: (resolution: ChooserResolution) => void;
  readonly onCancel: () => void;
}

function isPickCountValid(
  request: Extract<ChooserRequest, { kind: "dreamsign" }>,
  count: number,
): boolean {
  return count >= request.minPicks && count <= request.maxPicks;
}

function dreamsignChooserIdentity(
  request: Extract<ChooserRequest, { kind: "dreamsign" }>,
  candidates: readonly DreamsignChooserCandidate[],
): string {
  return JSON.stringify([
    request.requestId,
    request.poolKind,
    request.rolledDreamsignIds ?? [],
    request.minPicks,
    request.maxPicks,
    candidates.map((candidate) =>
      [String(candidate.index), candidate.id ?? ""].join(":"),
    ),
  ]);
}

export function DreamsignChooser(props: DreamsignChooserProps) {
  const resetKey = useMemo(
    () => dreamsignChooserIdentity(props.request, props.candidates),
    [props.candidates, props.request],
  );

  return <DreamsignChooserInner key={resetKey} {...props} />;
}

function DreamsignChooserInner({
  request,
  candidates,
  onResolve,
  onCancel,
}: DreamsignChooserProps) {
  const [selectedIndices, setSelectedIndices] = useState<readonly number[]>([]);

  const selectedIndexSet = useMemo(
    () => new Set(selectedIndices),
    [selectedIndices],
  );

  const candidateByIndex = useMemo(
    () => new Map(candidates.map((candidate) => [candidate.index, candidate])),
    [candidates],
  );

  const toggleIndex = useCallback((index: number) => {
    setSelectedIndices((current) => {
      if (current.includes(index)) {
        return current.filter((selected) => selected !== index);
      }
      if (request.maxPicks === 1) {
        return [index];
      }
      return [...current, index];
    });
  }, [request.maxPicks]);

  const handleConfirm = useCallback(() => {
    if (!isPickCountValid(request, selectedIndices.length)) return;
    const selectedCandidates = selectedIndices
      .map((index) => candidateByIndex.get(index))
      .filter((candidate): candidate is DreamsignChooserCandidate =>
        candidate !== undefined,
      );
    const indices = selectedCandidates.map((candidate) => candidate.index);
    const dreamsignIds = selectedCandidates
      .map((candidate) => candidate.id)
      .filter((id): id is string => typeof id === "string");
    onResolve({
      kind: "dreamsign",
      indices,
      ...(dreamsignIds.length === indices.length ? { dreamsignIds } : {}),
    });
  }, [candidateByIndex, onResolve, request, selectedIndices]);

  return (
    <ChooserOverlay
      title={request.title}
      confirmDisabled={!isPickCountValid(request, selectedIndices.length)}
      onCancel={onCancel}
      onConfirm={handleConfirm}
    >
      <div className="flex flex-col gap-3">
        {candidates.map((candidate) => {
          const selected = selectedIndexSet.has(candidate.index);
          return (
            <button
              key={`${candidate.index}:${candidate.id ?? candidate.name}`}
              type="button"
              data-offering-card=""
              data-offering-card-selected={selected ? "true" : "false"}
              aria-pressed={selected}
              onClick={() => toggleIndex(candidate.index)}
              className="rounded-lg p-4 text-left transition-colors hover:brightness-125"
              style={{
                background:
                  "linear-gradient(145deg, #1a1025 0%, #0f0a18 60%, #0d0814 100%)",
                border: `1px solid ${selected ? OFFERING_ACCENT.borderStrong : OFFERING_ACCENT.border}`,
                boxShadow: selected
                  ? `0 0 0 2px ${OFFERING_ACCENT.border}, 0 0 18px ${OFFERING_ACCENT.glow}`
                  : `0 0 12px ${OFFERING_ACCENT.glow}`,
              }}
            >
              <span
                className="block text-base font-bold"
                style={{ color: "#f8fafc" }}
              >
                {candidate.name}
              </span>
              <span
                className="mt-2 block text-sm leading-snug opacity-80"
                style={{ color: "#e2e8f0" }}
              >
                {candidate.description}
              </span>
            </button>
          );
        })}
      </div>
    </ChooserOverlay>
  );
}
