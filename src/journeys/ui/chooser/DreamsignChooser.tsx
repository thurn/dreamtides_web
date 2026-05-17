import { useCallback, useMemo, useState } from "react";

import type { ChooserRequest, ChooserResolution } from "../../apply/chooserPlan";

import { ChooserOverlay } from "./ChooserOverlay";

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

export function DreamsignChooser({
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

  const toggleIndex = useCallback((index: number) => {
    setSelectedIndices((current) => {
      if (current.includes(index)) {
        return current.filter((selected) => selected !== index);
      }
      return [...current, index];
    });
  }, []);

  const handleConfirm = useCallback(() => {
    if (!isPickCountValid(request, selectedIndices.length)) return;
    const selectedCandidates = candidates.filter((candidate) =>
      selectedIndexSet.has(candidate.index),
    );
    const dreamsignIds = selectedCandidates
      .map((candidate) => candidate.id)
      .filter((id): id is string => typeof id === "string");
    onResolve({
      kind: "dreamsign",
      indices: selectedIndices,
      dreamsignIds,
    });
  }, [candidates, onResolve, request, selectedIndexSet, selectedIndices]);

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
              aria-pressed={selected}
              onClick={() => toggleIndex(candidate.index)}
              className="rounded-md border bg-zinc-900/80 p-4 text-left transition-colors hover:bg-zinc-800"
              style={{
                borderColor: selected
                  ? "rgba(252, 211, 77, 0.95)"
                  : "rgba(255, 255, 255, 0.14)",
                boxShadow: selected
                  ? "0 0 0 2px rgba(245, 158, 11, 0.35)"
                  : "none",
              }}
            >
              <span className="block text-base font-semibold text-amber-100">
                {candidate.name}
              </span>
              <span className="mt-2 block text-sm leading-snug text-zinc-300">
                {candidate.description}
              </span>
            </button>
          );
        })}
      </div>
    </ChooserOverlay>
  );
}
