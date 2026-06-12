import { useEffect } from "react";

export function BattleChoicePromptOverlay({
  title,
  options,
  onChoose,
}: {
  title: string;
  options: readonly { label: string }[];
  onChoose: (index: number) => void;
}) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        // A choice is required — do not close on Escape.
        event.stopPropagation();
      }
    }
    window.addEventListener("keydown", handleKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-[60] overflow-y-auto bg-slate-950/85 p-3 backdrop-blur"
      data-battle-dreamwell-choice=""
      // Backdrop click does nothing — a choice is required.
      onClick={(event) => event.stopPropagation()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="battle-choice-prompt-title"
        tabIndex={-1}
        className="pointer-events-auto mx-auto flex max-h-[calc(100vh-1.5rem)] w-full max-w-lg flex-col gap-4 overflow-y-auto rounded-[2rem] border border-violet-300/25 bg-[linear-gradient(180deg,_rgba(7,10,18,0.98)_0%,_rgba(11,17,30,0.96)_100%)] p-5 shadow-2xl shadow-slate-950/70"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="border-b border-slate-800 pb-3">
          <h3
            id="battle-choice-prompt-title"
            className="text-lg font-semibold text-white"
          >
            {title}
          </h3>
        </header>
        <div className="flex flex-col gap-2">
          {options.map((option, index) => (
            <button
              key={index}
              type="button"
              data-battle-dreamwell-option={String(index)}
              className={createButtonClassName(true)}
              onClick={() => onChoose(index)}
            >
              {option.label}
            </button>
          ))}
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
