import { useCallback, useMemo, useState } from "react";

import type { ChooserRequest, ChooserResolution } from "../../apply/chooserPlan";

import { ChooserOverlay } from "./ChooserOverlay";

export interface CardChooserCandidate {
  readonly entryId: string;
  readonly cardId?: string;
  readonly name: string;
  readonly rulesText?: string;
}

export interface CardChooserProps {
  readonly request: Extract<ChooserRequest, { kind: "card" }>;
  readonly candidates: readonly CardChooserCandidate[];
  readonly onResolve: (resolution: ChooserResolution) => void;
  readonly onCancel: () => void;
}

interface CardSelectionState {
  readonly identity: string;
  readonly entryIds: readonly string[];
}

function isPickCountValid(
  request: Extract<ChooserRequest, { kind: "card" }>,
  count: number,
): boolean {
  return count >= request.minPicks && count <= request.maxPicks;
}

function cardChooserIdentity(
  request: Extract<ChooserRequest, { kind: "card" }>,
  candidates: readonly CardChooserCandidate[],
): string {
  return [
    request.requestId,
    ...candidates.map(
      (candidate) => `${candidate.entryId}:${candidate.cardId ?? ""}`,
    ),
  ].join("|");
}

export function CardChooser({
  request,
  candidates,
  onResolve,
  onCancel,
}: CardChooserProps) {
  const chooserIdentity = useMemo(
    () => cardChooserIdentity(request, candidates),
    [candidates, request],
  );
  const [selection, setSelection] = useState<CardSelectionState>({
    identity: chooserIdentity,
    entryIds: [],
  });
  const selectedEntryIds =
    selection.identity === chooserIdentity ? selection.entryIds : [];

  const selectedEntrySet = useMemo(
    () => new Set(selectedEntryIds),
    [selectedEntryIds],
  );

  const candidateByEntryId = useMemo(
    () => new Map(candidates.map((candidate) => [candidate.entryId, candidate])),
    [candidates],
  );

  const toggleEntry = useCallback((entryId: string) => {
    setSelection((current) => {
      const currentEntryIds =
        current.identity === chooserIdentity ? current.entryIds : [];
      if (currentEntryIds.includes(entryId)) {
        return {
          identity: chooserIdentity,
          entryIds: currentEntryIds.filter((selected) => selected !== entryId),
        };
      }
      if (request.maxPicks === 1) {
        return { identity: chooserIdentity, entryIds: [entryId] };
      }
      return { identity: chooserIdentity, entryIds: [...currentEntryIds, entryId] };
    });
  }, [chooserIdentity, request.maxPicks]);

  const handleConfirm = useCallback(() => {
    if (!isPickCountValid(request, selectedEntryIds.length)) return;
    const selectedCandidates = selectedEntryIds
      .map((entryId) => candidateByEntryId.get(entryId))
      .filter((candidate): candidate is CardChooserCandidate =>
        candidate !== undefined,
      );
    const cardIds = selectedCandidates
      .map((candidate) => candidate.cardId)
      .filter((cardId): cardId is string => typeof cardId === "string");
    onResolve({
      kind: "card",
      entryIds: selectedEntryIds,
      ...(cardIds.length === selectedEntryIds.length ? { cardIds } : {}),
    });
  }, [candidateByEntryId, onResolve, request, selectedEntryIds]);

  return (
    <ChooserOverlay
      title={request.title}
      confirmDisabled={!isPickCountValid(request, selectedEntryIds.length)}
      onCancel={onCancel}
      onConfirm={handleConfirm}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {candidates.map((candidate) => {
          const selected = selectedEntrySet.has(candidate.entryId);
          return (
            <button
              key={candidate.entryId}
              type="button"
              aria-pressed={selected}
              onClick={() => toggleEntry(candidate.entryId)}
              className="min-h-28 rounded-md border bg-zinc-900/80 p-4 text-left transition-colors hover:bg-zinc-800"
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
              {candidate.rulesText ? (
                <span className="mt-2 block text-sm leading-snug text-zinc-300">
                  {candidate.rulesText}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </ChooserOverlay>
  );
}
