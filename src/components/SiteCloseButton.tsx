import "./site-close-button.css";

/** Props for {@link SiteCloseButton}. */
interface SiteCloseButtonProps {
  /** Invoked when the player leaves the site. */
  onClose: () => void;
  /** Optional `data-testid` for the button. */
  testId?: string;
  /** Accessible label / tooltip. Defaults to "Leave site". */
  label?: string;
  /** Disables the button (e.g. while an animation is committing). */
  disabled?: boolean;
}

/**
 * The standard way to leave a dreamscape site: a red square button with a
 * white X anchored to the top-right corner of the scene. Every site screen
 * uses this in place of an inline "walk on" link so leaving a site is always
 * in the same place and reads the same way.
 */
export function SiteCloseButton({
  onClose,
  testId,
  label = "Leave site",
  disabled = false,
}: SiteCloseButtonProps) {
  return (
    <button
      type="button"
      className="site-close-btn"
      data-testid={testId}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClose}
    >
      <i className="bx bx-x" aria-hidden="true" />
    </button>
  );
}
