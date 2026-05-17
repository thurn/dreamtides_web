import type { ReactNode } from "react";

export interface ChooserOverlayProps {
  readonly title: string;
  readonly children: ReactNode;
  readonly confirmDisabled: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

export function ChooserOverlay({
  title,
  children,
  confirmDisabled,
  onCancel,
  onConfirm,
}: ChooserOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4 py-6">
      <section
        aria-modal="true"
        role="dialog"
        aria-labelledby="journey-chooser-title"
        className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-amber-200/25 bg-zinc-950/95 text-white shadow-2xl"
      >
        <header className="border-b border-white/10 px-5 py-4">
          <h2
            id="journey-chooser-title"
            className="text-xl font-semibold leading-tight text-amber-100"
          >
            {title}
          </h2>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        <footer className="flex items-center justify-between gap-3 border-t border-white/10 px-5 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-white/20 px-4 py-2 text-sm font-semibold text-zinc-100 transition-colors hover:bg-white/10"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={confirmDisabled}
            onClick={confirmDisabled ? undefined : onConfirm}
            className="rounded-md bg-amber-600 px-5 py-2 text-sm font-semibold text-white transition-opacity enabled:hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Confirm
          </button>
        </footer>
      </section>
    </div>
  );
}
