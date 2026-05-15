/**
 * Round white-on-red close button (×) anchored to the top-left of the
 * `JourneyScreen`.
 *
 * `disabled` suppresses the click handler and visually dims the button. The
 * `JourneyScreen` sets `disabled` for `choose_your_loss` manifests, where the
 * player is required to commit to one of the offered losses and cannot bail.
 *
 * Isolation: this file imports only React. No quest-prototype-wide types.
 */

/** Props for `CloseButton`. */
export interface CloseButtonProps {
  /** When true, click is suppressed and the button is visually dimmed. */
  readonly disabled?: boolean;
  /** Invoked when the button is clicked (only when not disabled). */
  readonly onClick: () => void;
}

/** Round red × button used to exit a journey. */
export function CloseButton({ disabled = false, onClick }: CloseButtonProps) {
  return (
    <button
      type="button"
      aria-label="Close journey"
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className="absolute left-4 top-4 flex h-10 w-10 items-center justify-center rounded-full text-xl font-bold leading-none transition-opacity"
      style={{
        backgroundColor: "#dc2626",
        color: "#ffffff",
        border: "1px solid rgba(255, 255, 255, 0.15)",
        boxShadow: "0 0 10px rgba(220, 38, 38, 0.35)",
        opacity: disabled ? 0.35 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      {"×"}
    </button>
  );
}
