// LeaveSiteButton — the ONE way to leave a dreamscape site. A danger-red square
// button with a white X, pinned to the top-right corner of the scene, used in
// place of an inline "walk on" link so leaving a site is always in the same
// place and reads the same way on every site screen (shop, purge, duplication,
// dreamsign revelation, dream merchant).
//
// The appearance and its fixed top-right placement ARE the design system's — a
// caller supplies only behavior (`onLeave`, `disabled`), an accessible name
// (`label`), and a test hook (`testId`). There is no style/className escape
// hatch: the button always looks and sits the same.

import "./leave-site-button.css";

/** Props for {@link LeaveSiteButton}. */
export interface LeaveSiteButtonProps {
  /** Invoked when the player leaves the site. */
  onLeave: () => void;
  /** Accessible label / tooltip. Defaults to "Leave site". */
  label?: string;
  /** Disables the button (e.g. while an animation is committing). */
  disabled?: boolean;
  /** `data-testid` for the button. */
  testId?: string;
}

/**
 * The standard leave-a-site control: a red square X button anchored to the
 * top-right corner of the current site scene.
 */
export function LeaveSiteButton({
  onLeave,
  label = "Leave site",
  disabled = false,
  testId,
}: LeaveSiteButtonProps) {
  return (
    <button
      type="button"
      className="tango leave-site-btn"
      data-testid={testId}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onLeave}
    >
      <i className="bx bx-x" aria-hidden="true" />
    </button>
  );
}
