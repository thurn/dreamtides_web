import { useEffect, useState } from "react";
import { CardDisplay } from "../../components/CardDisplay";
import type { DreamwellCardViewData } from "../../components/DreamwellCardView";
import type { BattleMutableState } from "../types";
import { battleCardDisplayFromInstance } from "./BattleCardView";
import { DreamwellPromptCard } from "./DreamwellPromptCard";

export function togglePick(
  selected: readonly string[],
  id: string,
  count: number,
): string[] {
  if (selected.includes(id)) {
    return selected.filter((s) => s !== id);
  }
  if (selected.length < count) {
    return [...selected, id];
  }
  // At cap
  if (count === 1) {
    return [id];
  }
  return [...selected];
}

export function BattleCardPickerOverlay({
  title,
  sourceName,
  sourceCard,
  candidateIds,
  count,
  optional,
  highlightCardIds,
  state,
  onConfirm,
  onSkip,
}: {
  title: string;
  /** The effect source driving this prompt (e.g. the dreamwell card name). */
  sourceName?: string | null;
  /**
   * The full Dreamwell card driving this prompt. When provided it is rendered at
   * the head of the modal so the player sees what triggered the prompt; it
   * supersedes the {@link sourceName} text label.
   */
  sourceCard?: DreamwellCardViewData | null;
  candidateIds: readonly string[];
  count: number;
  optional: boolean;
  /** Candidate ids to flag (e.g. a card just drawn before a discard prompt). */
  highlightCardIds?: readonly string[];
  state: BattleMutableState;
  onConfirm: (chosenIds: string[]) => void;
  onSkip: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    setSelected([]);
  }, [candidateIds]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.stopPropagation();
        if (optional) {
          onSkip();
        }
        // Required pick: ignore Escape
      }
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [optional, onSkip]);

  function handleBackdropClick(event: React.MouseEvent<HTMLDivElement>): void {
    if (event.target === event.currentTarget) {
      event.stopPropagation();
      if (optional) {
        onSkip();
      }
      // Required pick: ignore backdrop click
    }
  }

  const canConfirm = selected.length === count;
  const highlightSet = new Set(highlightCardIds ?? []);
  const hasHighlight = highlightSet.size > 0;

  if (candidateIds.length === 0) {
    return (
      <div
        className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950/85 p-3 backdrop-blur"
        data-battle-dreamwell-picker=""
        onClick={handleBackdropClick}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="battle-card-picker-title"
          tabIndex={-1}
          className="pointer-events-auto mx-auto flex max-h-[calc(100vh-1.5rem)] w-full max-w-4xl flex-col gap-4 overflow-y-auto rounded-[2rem] border border-violet-300/25 bg-[linear-gradient(180deg,_rgba(7,10,18,0.98)_0%,_rgba(11,17,30,0.96)_100%)] p-5 shadow-2xl shadow-slate-950/70"
          onClick={(event) => event.stopPropagation()}
        >
          <header className="flex flex-col gap-2 border-b border-slate-800 pb-3">
            {sourceCard ? (
              <DreamwellPromptCard card={sourceCard} />
            ) : sourceName ? (
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-300/80">
                {sourceName}
              </p>
            ) : null}
            <h3
              id="battle-card-picker-title"
              className="text-lg font-semibold text-white"
            >
              {title}
            </h3>
          </header>
          <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/60 px-4 py-8 text-center text-sm text-slate-400">
            No valid targets
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-800 pt-3">
            <button
              type="button"
              data-battle-dreamwell-action={optional ? "skip" : "confirm"}
              className={createButtonClassName(true)}
              onClick={() => {
                if (optional) {
                  onSkip();
                } else {
                  onConfirm([]);
                }
              }}
            >
              {optional ? "Skip" : "Continue"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950/85 p-3 backdrop-blur"
      data-battle-dreamwell-picker=""
      onClick={handleBackdropClick}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="battle-card-picker-title"
        tabIndex={-1}
        className="pointer-events-auto mx-auto flex max-h-[calc(100vh-1.5rem)] w-full max-w-4xl flex-col gap-4 overflow-y-auto rounded-[2rem] border border-violet-300/25 bg-[linear-gradient(180deg,_rgba(7,10,18,0.98)_0%,_rgba(11,17,30,0.96)_100%)] p-5 shadow-2xl shadow-slate-950/70"
        onClick={(event) => event.stopPropagation()}
      >
        {sourceCard ? <DreamwellPromptCard card={sourceCard} /> : null}
        <header className="flex flex-col gap-2 border-b border-slate-800 pb-3 md:flex-row md:items-start md:justify-between">
          <div>
            {!sourceCard && sourceName ? (
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-300/80">
                {sourceName}
              </p>
            ) : null}
            <h3
              id="battle-card-picker-title"
              className="mt-0.5 text-lg font-semibold text-white"
            >
              {title}
            </h3>
            <p className="mt-1 text-sm text-slate-400">
              Choose {String(count)}
              {hasHighlight
                ? " — the highlighted card was just drawn"
                : ""}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              data-battle-dreamwell-action="confirm"
              disabled={!canConfirm}
              className={createButtonClassName(canConfirm)}
              onClick={() => {
                if (canConfirm) {
                  onConfirm(selected);
                }
              }}
            >
              Confirm
            </button>
            {optional ? (
              <button
                type="button"
                data-battle-dreamwell-action="skip"
                className={createButtonClassName(true)}
                onClick={onSkip}
              >
                Skip
              </button>
            ) : null}
          </div>
        </header>
        <div className="flex flex-wrap justify-center gap-3">
          {candidateIds.map((id) => {
            const instance = state.cardInstances[id];
            if (instance === undefined) {
              return null;
            }
            const isSelected = selected.includes(id);
            const isHighlighted = highlightSet.has(id);
            return (
              <article
                key={id}
                data-battle-dreamwell-pick-card={id}
                data-battle-dreamwell-pick-highlighted={
                  isHighlighted ? "" : undefined
                }
                className={[
                  "relative flex w-[9.5rem] shrink-0 cursor-pointer flex-col gap-2 rounded-2xl border p-2 transition",
                  isSelected
                    ? "border-violet-400/70 bg-violet-900/25 ring-2 ring-violet-400/40"
                    : isHighlighted
                      ? "border-amber-300/70 bg-amber-500/10 hover:border-amber-200/80"
                      : "border-slate-800 bg-slate-900/75 hover:border-violet-400/40 hover:bg-slate-900/90",
                ].join(" ")}
                onClick={() => {
                  setSelected((previous) => togglePick(previous, id, count));
                }}
              >
                {isHighlighted ? (
                  <span className="absolute -top-2 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap rounded-full border border-amber-300/70 bg-amber-400 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-950 shadow">
                    Just drawn
                  </span>
                ) : null}
                <CardDisplay
                  card={battleCardDisplayFromInstance(instance)}
                  className="w-full"
                />
              </article>
            );
          })}
        </div>
        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-800 pt-3">
          <button
            type="button"
            data-battle-dreamwell-action="confirm"
            disabled={!canConfirm}
            className={createButtonClassName(canConfirm)}
            onClick={() => {
              if (canConfirm) {
                onConfirm(selected);
              }
            }}
          >
            Confirm
          </button>
          {optional ? (
            <button
              type="button"
              data-battle-dreamwell-action="skip"
              className={createButtonClassName(true)}
              onClick={onSkip}
            >
              Skip
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function createButtonClassName(isEnabled: boolean): string {
  return [
    "rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition",
    isEnabled
      ? "border-violet-300/45 bg-violet-400/10 text-violet-50 hover:bg-violet-400/20"
      : "cursor-not-allowed border-slate-800 bg-slate-900/70 text-slate-600",
  ].join(" ");
}
