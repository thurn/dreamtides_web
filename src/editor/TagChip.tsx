import type { CSSProperties, ReactNode } from "react";
import { readableTextColor } from "./tag-color";

export interface TagChipProps {
  name: string;
  color: string;
  /** Renders an inline × control that calls this when activated. */
  onRemove?: () => void;
  /** Makes the whole chip a button that calls this when activated. */
  onClick?: () => void;
  /** Dims the chip and disables interaction (already-applied filter options). */
  muted?: boolean;
  size?: "sm" | "md";
  title?: string;
  /** Optional leading content, e.g. a checkmark for selected filter chips. */
  leading?: ReactNode;
}

export default function TagChip({
  name,
  color,
  onRemove,
  onClick,
  muted = false,
  size = "md",
  title,
  leading,
}: TagChipProps) {
  const textColor = readableTextColor(color);
  const paddingY = size === "sm" ? "1px" : "2px";
  const paddingX = size === "sm" ? "7px" : "9px";
  const fontSize = size === "sm" ? "0.68rem" : "0.74rem";

  const baseStyle: CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    maxWidth: "100%",
    boxSizing: "border-box",
    padding: `${paddingY} ${paddingX}`,
    borderRadius: "999px",
    background: color,
    color: textColor,
    border: `1px solid ${textColor === "#ffffff" ? "rgba(0,0,0,0.25)" : "rgba(255,255,255,0.35)"}`,
    fontSize,
    fontWeight: 700,
    lineHeight: 1.3,
    letterSpacing: "0.01em",
    opacity: muted ? 0.4 : 1,
    cursor: onClick !== undefined && !muted ? "pointer" : "default",
    whiteSpace: "nowrap",
    overflow: "hidden",
  };

  const label = (
    <>
      {leading}
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {name}
      </span>
      {onRemove !== undefined ? (
        <button
          type="button"
          aria-label={`Remove tag ${name}`}
          title={`Remove ${name}`}
          onClick={(event) => {
            event.stopPropagation();
            onRemove();
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "15px",
            height: "15px",
            marginRight: "-3px",
            padding: 0,
            border: 0,
            borderRadius: "999px",
            background: textColor === "#ffffff" ? "rgba(0,0,0,0.28)" : "rgba(255,255,255,0.4)",
            color: textColor,
            fontSize: "0.7rem",
            fontWeight: 900,
            lineHeight: 1,
            cursor: "pointer",
          }}
        >
          <span aria-hidden="true">×</span>
        </button>
      ) : null}
    </>
  );

  if (onClick !== undefined) {
    return (
      <button
        type="button"
        aria-label={title ?? name}
        title={title ?? name}
        disabled={muted}
        onClick={onClick}
        style={{ ...baseStyle, font: "inherit" }}
      >
        {label}
      </button>
    );
  }

  return (
    <span title={title ?? name} style={baseStyle}>
      {label}
    </span>
  );
}
