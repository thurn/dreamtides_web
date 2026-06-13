import type { CSSProperties } from "react";

/**
 * A small white-filled, black-outlined gear icon flagging a card whose battle
 * effect is scripted for basic automation. Call sites size and position it via
 * `className` and/or `style`: the SVG carries no intrinsic width/height, so the
 * width supplied by the class (e.g. `.c-automation-gear`) or inline style fully
 * governs its size. This lets the on-card flag match the energy-pip box exactly
 * so it stacks centered in a column directly below the pip.
 */
export function AutomationGearIcon({
  className,
  style,
}: {
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      role="img"
      aria-label="automated"
      viewBox="0 0 24 24"
      className={className}
      style={{ display: "block", ...style }}
    >
      <path
        fill="#fff"
        stroke="#000"
        strokeWidth={1.5}
        strokeLinejoin="round"
        d="M12 2.5l1.2 2.05a7.5 7.5 0 0 1 1.7.7l2.3-.62 1.6 1.6-.62 2.3c.3.54.53 1.11.7 1.7L21.5 12l-2.05 1.2c-.17.59-.4 1.16-.7 1.7l.62 2.3-1.6 1.6-2.3-.62a7.5 7.5 0 0 1-1.7.7L12 21.5l-1.2-2.05a7.5 7.5 0 0 1-1.7-.7l-2.3.62-1.6-1.6.62-2.3a7.5 7.5 0 0 1-.7-1.7L2.5 12l2.05-1.2c.17-.59.4-1.16.7-1.7l-.62-2.3 1.6-1.6 2.3.62c.54-.3 1.11-.53 1.7-.7L12 2.5z"
      />
      <circle cx={12} cy={12} r={3.2} fill="#fff" stroke="#000" strokeWidth={1.5} />
    </svg>
  );
}
