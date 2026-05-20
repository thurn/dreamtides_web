import { useCallback, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";

import type {
  JourneyExplanation,
  JourneyExplanationChoice,
  JourneyExplanationOperation,
  JourneyExplanationValueComponent,
} from "./journeyExplanation";

export type { JourneyExplanation } from "./journeyExplanation";

interface JourneyExplanationOverlayProps {
  readonly explanation: JourneyExplanation | null;
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

function signed(value: number): string {
  return value > 0 ? `+${String(value)}` : String(value);
}

function CecGrid({ choice }: { readonly choice: JourneyExplanationChoice }) {
  const items = [
    ["Cost", choice.cec.cost],
    ["Reward", choice.cec.reward],
    ["Burden", choice.cec.burden],
    ["Uncertainty", choice.cec.uncertainty],
    ["Net", choice.cec.net],
  ] as const;

  return (
    <dl className="mt-3 grid grid-cols-5 gap-2">
      {items.map(([label, value]) => (
        <div
          key={label}
          className="rounded-md px-2 py-1.5"
          style={{
            background: "rgba(15, 23, 42, 0.72)",
            border: "1px solid rgba(148, 163, 184, 0.16)",
          }}
        >
          <dt className="text-[10px] font-semibold uppercase tracking-wide opacity-55">
            {label}
          </dt>
          <dd className="mt-0.5 text-xs font-bold tabular-nums">
            {label === "Cost" ? String(value) : signed(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function OperationList({
  title,
  operations,
}: {
  readonly title: string;
  readonly operations: readonly JourneyExplanationOperation[];
}) {
  if (operations.length === 0) return null;

  return (
    <div className="mt-3">
      <h4 className="text-[11px] font-bold uppercase tracking-wide opacity-60">
        {title}
      </h4>
      <ul className="mt-1.5 space-y-1.5">
        {operations.map((operation, index) => (
          <li
            key={`${operation.role}-${operation.label}-${String(index)}`}
            className="rounded-md px-2 py-1.5 text-xs"
            style={{
              background: "rgba(2, 6, 23, 0.42)",
              border: "1px solid rgba(148, 163, 184, 0.12)",
            }}
          >
            <span className="font-semibold">{operation.label}</span>
            <span className="ml-2 opacity-60">{operation.role}</span>
            {operation.convertedEssence !== undefined ? (
              <span className="ml-2 font-semibold tabular-nums">
                {signed(operation.convertedEssence)} CEC
              </span>
            ) : null}
            <ComponentList components={operation.bands} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ComponentList({
  components,
}: {
  readonly components: readonly JourneyExplanationValueComponent[];
}) {
  if (components.length === 0) return null;

  return (
    <ul className="mt-2 space-y-1 text-[11px] opacity-75">
      {components.map((component, index) => (
        <li key={`${component.kind}-${component.label}-${String(index)}`}>
          {component.kind}: {component.label} ({signed(component.value)} CEC)
        </li>
      ))}
    </ul>
  );
}

function ChoiceExplanation({
  choice,
}: {
  readonly choice: JourneyExplanationChoice;
}) {
  return (
    <section
      className="rounded-lg p-3"
      style={{
        background: "rgba(15, 23, 42, 0.58)",
        border: "1px solid rgba(125, 211, 252, 0.18)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold" style={{ color: "#f8fafc" }}>
            {choice.label}
          </h3>
          <p className="mt-1 text-xs leading-relaxed opacity-78">{choice.text}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {choice.locked ? (
            <span className="rounded-full border border-red-300/35 bg-red-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-red-100">
              Locked
            </span>
          ) : null}
          {choice.odds ? (
            <span className="rounded-full border border-sky-300/25 bg-sky-400/12 px-2 py-0.5 text-[10px] font-bold uppercase text-sky-100">
              {choice.odds}
            </span>
          ) : null}
        </div>
      </div>

      <CecGrid choice={choice} />

      <div className="mt-3 rounded-md bg-black/20 p-2">
        <h4 className="text-[11px] font-bold uppercase tracking-wide opacity-60">
          Value breakdown
        </h4>
        <ul className="mt-1 space-y-1 text-xs opacity-78">
          {choice.valueDetails.map((detail) => (
            <li key={detail}>{detail}</li>
          ))}
        </ul>
        <ComponentList components={choice.components} />
      </div>

      <OperationList title="Costs" operations={choice.costs} />
      <OperationList title="Rewards" operations={choice.rewards} />
      <OperationList title="Burdens" operations={choice.burdens} />
      <OperationList title="Operations" operations={choice.operations} />
    </section>
  );
}

export function JourneyExplanationOverlay({
  explanation,
  isOpen,
  onClose,
}: JourneyExplanationOverlayProps) {
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

  return (
    <AnimatePresence>
      {isOpen && explanation !== null && (
        <>
          <div
            className="fixed inset-0 z-[54]"
            onClick={handleClose}
            aria-hidden="true"
            data-testid="journey-explanation-backdrop"
          />
          <motion.aside
            key="journey-explanation-overlay"
            className="fixed top-4 right-4 left-4 z-[55] max-h-[78vh] overflow-hidden rounded-2xl md:left-auto md:w-[520px]"
            onClick={(event) => {
              event.stopPropagation();
            }}
            style={{
              background:
                "linear-gradient(180deg, rgba(6, 12, 24, 0.97) 0%, rgba(11, 17, 30, 0.97) 100%)",
              border: "1px solid rgba(125, 211, 252, 0.3)",
              boxShadow: "0 20px 60px rgba(2, 6, 23, 0.55)",
              backdropFilter: "blur(12px)",
              color: "#e2e8f0",
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
                  Why Journey?
                </p>
                <h2 className="text-lg font-bold" style={{ color: "#f8fafc" }}>
                  {explanation.shapeLabel}
                </h2>
                <p className="mt-1 text-xs leading-relaxed opacity-72">
                  Shape {explanation.shapeId}; topology {explanation.topology};
                  stage {explanation.stage}; Dreamscape{" "}
                  {String(explanation.dreamscape)}. CEC means converted essence.
                </p>
              </div>
              <button
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors"
                style={{
                  background: "rgba(255, 255, 255, 0.08)",
                  color: "#e2e8f0",
                }}
                onClick={handleClose}
                aria-label="Close journey explanation"
              >
                {"x"}
              </button>
            </div>

            <div className="max-h-[calc(78vh-102px)] space-y-4 overflow-y-auto p-4">
              <section className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
                <Metric label="Journey" value={explanation.journeyId} />
                <Metric
                  label="Root index"
                  value={String(explanation.rootJourneyIndex)}
                />
                <Metric label="Seed" value={explanation.seed} />
                <Metric label="Progress" value={explanation.progress.label} />
              </section>

              <section className="rounded-lg bg-black/20 p-3">
                <h3 className="text-sm font-bold">Progress state</h3>
                <p className="mt-1 text-xs opacity-75">
                  {explanation.progress.detail}
                </p>
              </section>

              <section className="rounded-lg bg-black/20 p-3">
                <h3 className="text-sm font-bold">Shape selection</h3>
                <p className="mt-1 text-xs opacity-75">
                  Selected tags:{" "}
                  {explanation.selectedTags.length > 0
                    ? explanation.selectedTags.join(", ")
                    : "none"}.
                </p>
                {explanation.selectedShapeScore !== undefined ? (
                  <p className="mt-1 text-xs opacity-75">
                    Selected shape score:{" "}
                    {String(explanation.selectedShapeScore)}.
                  </p>
                ) : null}
                {explanation.topShapeScores.length > 0 ? (
                  <ol className="mt-2 space-y-1 text-xs opacity-78">
                    {explanation.topShapeScores.map((entry) => (
                      <li key={entry.shapeId}>
                        {entry.shapeId}: {String(entry.score)}
                      </li>
                    ))}
                  </ol>
                ) : null}
              </section>

              {explanation.precommittedSummaries.length > 0 ? (
                <section className="rounded-lg bg-black/20 p-3">
                  <h3 className="text-sm font-bold">Precommitted generation</h3>
                  <ul className="mt-1 space-y-1 text-xs opacity-75">
                    {explanation.precommittedSummaries.map((summary) => (
                      <li key={summary}>{summary}</li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="space-y-3">
                <h3 className="text-sm font-bold">Visible choices</h3>
                {explanation.choices.map((choice) => (
                  <ChoiceExplanation key={choice.id} choice={choice} />
                ))}
              </section>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

function Metric({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div
      className="rounded-md px-2 py-1.5"
      style={{
        background: "rgba(15, 23, 42, 0.62)",
        border: "1px solid rgba(148, 163, 184, 0.16)",
      }}
    >
      <div className="text-[10px] font-bold uppercase tracking-wide opacity-55">
        {label}
      </div>
      <div className="mt-0.5 truncate text-xs font-semibold">{value}</div>
    </div>
  );
}
