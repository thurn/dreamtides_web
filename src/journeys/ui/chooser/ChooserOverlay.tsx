import type { ReactNode } from "react";

import {
  OFFERING_ACCENT,
  OFFERING_NEUTRAL,
} from "./offering-tokens";

export interface ChooserOverlayProps {
  readonly title: string;
  readonly children: ReactNode;
  readonly confirmDisabled: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

/**
 * Modal envelope used by every journey chooser (card, dreamsign,
 * transfiguration). The visual look matches the dreamsign-draft and
 * dreamsign-offering surfaces via the shared offering tokens
 * (purple title, purple confirm button, slate cancel) so a player
 * encountering a chooser from a journey effect sees the same
 * affordances they used at a dreamsign site.
 */
export function ChooserOverlay({
  title,
  children,
  confirmDisabled,
  onCancel,
  onConfirm,
}: ChooserOverlayProps) {
  return (
    <div
      data-offering-chooser-overlay=""
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/55 px-4 py-6"
    >
      <section
        aria-modal="true"
        role="dialog"
        aria-labelledby="journey-chooser-title"
        className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-lg text-white shadow-2xl"
        style={{
          background:
            "linear-gradient(145deg, #1a1025 0%, #0f0a18 60%, #0d0814 100%)",
          border: `1px solid ${OFFERING_ACCENT.border}`,
          boxShadow: `0 0 24px ${OFFERING_ACCENT.glow}, 0 8px 22px rgba(0, 0, 0, 0.55)`,
        }}
      >
        <header
          className="border-b px-5 py-4 text-center"
          style={{ borderColor: OFFERING_ACCENT.border }}
        >
          <h2
            id="journey-chooser-title"
            data-offering-header=""
            className="text-2xl font-bold tracking-wide md:text-3xl"
            style={{ color: OFFERING_ACCENT.primary }}
          >
            {title}
          </h2>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {children}
        </div>

        <footer
          className="flex items-center justify-between gap-3 border-t px-5 py-4"
          style={{ borderColor: OFFERING_ACCENT.border }}
        >
          <button
            type="button"
            data-offering-skip=""
            onClick={onCancel}
            className="rounded-lg px-6 py-2.5 text-base font-medium transition-colors"
            style={{
              background: OFFERING_NEUTRAL.background,
              border: `1px solid ${OFFERING_NEUTRAL.border}`,
              color: OFFERING_NEUTRAL.text,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            data-offering-accept=""
            disabled={confirmDisabled}
            onClick={confirmDisabled ? undefined : onConfirm}
            className="rounded-lg px-5 py-2.5 font-bold text-white transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
            style={{
              backgroundColor: OFFERING_ACCENT.buttonBackground,
            }}
          >
            Confirm
          </button>
        </footer>
      </section>
    </div>
  );
}
