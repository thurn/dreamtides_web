import type { ReactElement, ReactNode } from "react";
import { Pressable } from "../../primitives/Pressable";
import { GLYPHS } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import { StandaloneGlyph } from "./StandaloneGlyph";

export interface DisclosureSectionProps {
  /** Section heading shown in the disclosure trigger. */
  title: string;
  /** Optional concise context shown beside the heading. */
  summary?: string;
  /** Controlled open state. */
  expanded: boolean;
  /** Reports the requested open state. */
  onExpandedChange: (expanded: boolean) => void;
  /** Content revealed beneath the trigger. */
  children: ReactNode;
  /** Stable test id for the section. */
  testId?: string;
}

/** A dense information section with a Cumulus-owned disclosure trigger. */
export function DisclosureSection({
  title,
  summary,
  expanded,
  onExpandedChange,
  children,
  testId,
}: DisclosureSectionProps): ReactElement {
  return (
    <section
      data-testid={testId}
      data-disclosure-expanded={expanded ? "true" : "false"}
      style={{
        padding: token("--space-6"),
        borderTop: `1px solid ${token("--border-soft")}`,
      }}
    >
      <Pressable
        as="button"
        aria-expanded={expanded}
        onClick={() => onExpandedChange(!expanded)}
        style={{
          appearance: "none",
          width: "100%",
          padding: 0,
          border: "none",
          background: "transparent",
          color: token("--text-on-glass"),
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr) auto",
          alignItems: "center",
          gap: token("--space-3"),
          textAlign: "start",
        }}
      >
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", font: token("--t-button-sm") }}>
            {title}
          </span>
          {summary === undefined ? null : (
            <span
              style={{
                display: "block",
                marginTop: token("--space-1"),
                color: token("--text-on-glass-muted"),
                font: token("--t-caption"),
              }}
            >
              {summary}
            </span>
          )}
        </span>
        <span style={{ display: "inline-flex", fontSize: "1.25em" }}>
          <StandaloneGlyph
            glyph={expanded ? GLYPHS.chevronUp : GLYPHS.chevronDown}
            color="text-secondary"
          />
        </span>
      </Pressable>
      {expanded ? (
        <div
          style={{
            display: "grid",
            gap: token("--space-3"),
            marginTop: token("--space-5"),
          }}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}
