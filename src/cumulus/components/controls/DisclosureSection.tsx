import type { ReactElement, ReactNode } from "react";
import { glassContentControlSurface } from "../../internal/control-treatment";
import { Pressable } from "../../primitives/Pressable";
import type { GlassControlPlacement } from "../../primitives/control-placement";
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
  /**
   * Surface beneath the section. `onMedia` gives the section its own liquid
   * glass boundary; `onGlass` uses a lighter tonal lens inside an existing
   * glass panel or dialog. Defaults to `onMedia`.
   */
  placement?: GlassControlPlacement;
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
  placement = "onMedia",
  testId,
}: DisclosureSectionProps): ReactElement {
  return (
    <section
      data-testid={testId}
      data-disclosure-expanded={expanded ? "true" : "false"}
      data-glass-placement={placement}
      style={{
        ...glassContentControlSurface(placement),
        padding: token("--space-l"),
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
          gap: token("--space-xs"),
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
                marginTop: token("--space-xxs"),
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
            gap: token("--space-xs"),
            marginTop: token("--space-m"),
          }}
        >
          {children}
        </div>
      ) : null}
    </section>
  );
}
