import { useCallback, useMemo, useState } from "react";

import type { ChooserRequest, ChooserResolution } from "../../apply/chooserPlan";
import type { TransfigurationType } from "../../../types/quest";

import { ChooserOverlay } from "./ChooserOverlay";

const TRANSFIGURATIONS: readonly TransfigurationType[] = [
  "Enduring",
  "Empowered",
  "Amplified",
  "Kindled",
  "Inspired",
  "Resonant",
  "Attuned",
  "Perfected",
];

const TILE_COLORS: Readonly<Record<TransfigurationType, string>> = {
  Enduring: "#8b5a2b",
  Empowered: "#228b56",
  Amplified: "#b88712",
  Kindled: "#b93434",
  Inspired: "#2563eb",
  Resonant: "#b83280",
  Attuned: "#d94679",
  Perfected: "#7c3aed",
};

export interface TransfigurationChooserProps {
  readonly request: Extract<ChooserRequest, { kind: "transfiguration" }>;
  readonly onResolve: (resolution: ChooserResolution) => void;
  readonly onCancel: () => void;
}

function transfigurationChooserIdentity(
  request: Extract<ChooserRequest, { kind: "transfiguration" }>,
): string {
  return JSON.stringify([
    request.requestId,
    [...request.eligibleTransfigurations].sort(),
  ]);
}

export function TransfigurationChooser(props: TransfigurationChooserProps) {
  const resetKey = useMemo(
    () => transfigurationChooserIdentity(props.request),
    [props.request],
  );

  return <TransfigurationChooserInner key={resetKey} {...props} />;
}

function TransfigurationChooserInner({
  request,
  onResolve,
  onCancel,
}: TransfigurationChooserProps) {
  const [selectedType, setSelectedType] = useState<TransfigurationType | null>(
    null,
  );

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
              onClick={eligible ? () => setSelectedType(type) : undefined}
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
