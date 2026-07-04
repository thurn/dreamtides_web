import { useCallback, useMemo, useState } from "react";

import { CardDisplay } from "../../../components/CardDisplay";
import type { CardData } from "../../../types/cards";
import type { ChooserRequest, ChooserResolution } from "../../apply/chooserPlan";

import { ChooserOverlay } from "./ChooserOverlay";
import { OFFERING_ACCENT } from "./offering-tokens";

export interface CardChooserCandidate {
  readonly entryId: string;
  readonly cardId?: string;
  readonly name: string;
  readonly rulesText?: string;
  readonly card?: CardData;
}

export interface CardChooserProps {
  readonly request: Extract<ChooserRequest, { kind: "card" }>;
  readonly candidates: readonly CardChooserCandidate[];
  readonly onResolve: (resolution: ChooserResolution) => void;
  readonly onCancel: () => void;
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
  return JSON.stringify([
    request.requestId,
    request.poolKind,
    request.deckFilter ?? null,
    request.rolledCardIds ?? [],
    request.minPicks,
    request.maxPicks,
    candidates.map((candidate) =>
      [candidate.entryId, candidate.cardId ?? ""].join(":"),
    ),
  ]);
}

export function CardChooser(props: CardChooserProps) {
  const resetKey = useMemo(
    () => cardChooserIdentity(props.request, props.candidates),
    [props.candidates, props.request],
  );

  return <CardChooserInner key={resetKey} {...props} />;
}

function CardChooserInner({
  request,
  candidates,
  onResolve,
  onCancel,
}: CardChooserProps) {
  const [selectedEntryIds, setSelectedEntryIds] = useState<readonly string[]>([]);

  const selectedEntrySet = useMemo(
    () => new Set(selectedEntryIds),
    [selectedEntryIds],
  );

  const candidateByEntryId = useMemo(
    () => new Map(candidates.map((candidate) => [candidate.entryId, candidate])),
    [candidates],
  );

  const toggleEntry = useCallback((entryId: string) => {
    setSelectedEntryIds((current) => {
      if (current.includes(entryId)) {
        return current.filter((selected) => selected !== entryId);
      }
      if (request.maxPicks === 1) {
        return [entryId];
      }
      return [...current, entryId];
    });
  }, [request.maxPicks]);

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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {candidates.map((candidate) => {
          const selected = selectedEntrySet.has(candidate.entryId);
          return (
            <button
              key={candidate.entryId}
              type="button"
              data-offering-card=""
              data-offering-card-selected={selected ? "true" : "false"}
              aria-pressed={selected}
              onClick={() => toggleEntry(candidate.entryId)}
              className="group relative rounded-lg p-2 text-left transition-transform hover:scale-[1.01] focus-visible:ring-2 focus-visible:ring-purple-300 focus-visible:outline-none"
              style={{
                background: selected
                  ? "rgba(168, 85, 247, 0.16)"
                  : "rgba(15, 10, 24, 0.58)",
                border: `1px solid ${selected ? OFFERING_ACCENT.borderStrong : OFFERING_ACCENT.border}`,
                boxShadow: selected
                  ? `0 0 0 2px ${OFFERING_ACCENT.borderStrong}, 0 0 22px ${OFFERING_ACCENT.glow}`
                  : `0 0 12px ${OFFERING_ACCENT.glow}`,
              }}
            >
              {candidate.card ? (
                <CardDisplay
                  card={candidate.card}
                  selected={selected}
                  selectionColor="accent"
                />
              ) : (
                <span className="block min-h-28 p-2">
                  <span
                    className="block text-base font-bold"
                    style={{ color: "#f8fafc" }}
                  >
                    {candidate.name}
                  </span>
                  {candidate.rulesText ? (
                    <span
                      className="mt-2 block text-sm leading-snug opacity-80"
                      style={{ color: "#e2e8f0" }}
                    >
                      {candidate.rulesText}
                    </span>
                  ) : null}
                </span>
              )}
              {selected ? (
                <span
                  aria-hidden="true"
                  className="absolute top-3 right-3 flex h-7 w-7 items-center justify-center rounded-full text-base font-bold shadow-lg"
                  style={{
                    background: OFFERING_ACCENT.buttonBackground,
                    border: "1px solid rgba(255, 255, 255, 0.72)",
                    color: "#ffffff",
                  }}
                >
                  ✓
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </ChooserOverlay>
  );
}
