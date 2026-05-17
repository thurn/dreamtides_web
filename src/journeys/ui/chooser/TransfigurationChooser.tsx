import { useCallback, useMemo, useState } from "react";

import type { ChooserRequest, ChooserResolution } from "../../apply/chooserPlan";
import type { TransfigurationType } from "../../../types/quest";

import { ChooserOverlay } from "./ChooserOverlay";

const TRANSFIGURATIONS: readonly TransfigurationType[] = [
  "Bronze",
  "Viridian",
  "Golden",
  "Scarlet",
  "Azure",
  "Magenta",
  "Rose",
  "Prismatic",
];

const TILE_COLORS: Readonly<Record<TransfigurationType, string>> = {
  Bronze: "#8b5a2b",
  Viridian: "#228b56",
  Golden: "#b88712",
  Scarlet: "#b93434",
  Azure: "#2563eb",
  Magenta: "#b83280",
  Rose: "#d94679",
  Prismatic: "#7c3aed",
};

export interface TransfigurationChooserProps {
  readonly request: Extract<ChooserRequest, { kind: "transfiguration" }>;
  readonly onResolve: (resolution: ChooserResolution) => void;
  readonly onCancel: () => void;
}

interface TransfigurationSelectionState {
  readonly identity: string;
  readonly type: TransfigurationType | null;
}

function transfigurationChooserIdentity(
  request: Extract<ChooserRequest, { kind: "transfiguration" }>,
): string {
  return [
    request.requestId,
    ...request.eligibleTransfigurations,
  ].join("|");
}

export function TransfigurationChooser({
  request,
  onResolve,
  onCancel,
}: TransfigurationChooserProps) {
  const chooserIdentity = useMemo(
    () => transfigurationChooserIdentity(request),
    [request],
  );
  const [selection, setSelection] = useState<TransfigurationSelectionState>({
    identity: chooserIdentity,
    type: null,
  });
  const selectedType = selection.identity === chooserIdentity ? selection.type : null;

  const eligibleSet = useMemo(
    () => new Set(request.eligibleTransfigurations),
    [request.eligibleTransfigurations],
  );

  const handleConfirm = useCallback(() => {
    if (selectedType === null || !eligibleSet.has(selectedType)) return;
    onResolve({ kind: "transfiguration", type: selectedType });
  }, [eligibleSet, onResolve, selectedType]);

  return (
    <ChooserOverlay
      title={request.title}
      confirmDisabled={selectedType === null || !eligibleSet.has(selectedType)}
      onCancel={onCancel}
      onConfirm={handleConfirm}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {TRANSFIGURATIONS.map((type) => {
          const eligible = eligibleSet.has(type);
          const selected = selectedType === type;
          return (
            <button
              key={type}
              type="button"
              disabled={!eligible}
              aria-disabled={!eligible}
              aria-pressed={selected}
              onClick={
                eligible
                  ? () => setSelection({ identity: chooserIdentity, type })
                  : undefined
              }
              className="min-h-24 rounded-md border p-3 text-center text-sm font-semibold text-white transition-opacity enabled:hover:brightness-110 disabled:cursor-not-allowed"
              style={{
                backgroundColor: TILE_COLORS[type],
                borderColor: selected
                  ? "rgba(255, 255, 255, 0.95)"
                  : "rgba(255, 255, 255, 0.22)",
                boxShadow: selected
                  ? "0 0 0 2px rgba(255, 255, 255, 0.4)"
                  : "none",
                opacity: eligible ? 1 : 0.32,
              }}
            >
              {type}
            </button>
          );
        })}
      </div>
    </ChooserOverlay>
  );
}
