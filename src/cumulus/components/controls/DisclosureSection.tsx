import type { ReactElement, ReactNode } from "react";
import type { LocalizedString } from "@trox/runtime";
import { glassContentControlSurface } from "../../internal/control-treatment";
import { Pressable } from "../../primitives/Pressable";
import type { GlassControlPlacement } from "../../primitives/control-placement";
import { GLYPHS } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import { StandaloneGlyph } from "./StandaloneGlyph";
import type { DomTestId } from "../../types/dom";
import { useLocalizer } from "../../../runtime/localization/use-localizer";

export interface DisclosureSectionProps {
  /** Localized heading shown in the disclosure trigger. */
  title: LocalizedString;
  /** Optional localized context shown beside the heading. */
  summary?: LocalizedString;
  /** Controlled open state. */
  expanded: boolean;
  /** Reports the requested open state. */
  onExpandedChange: (expanded: boolean) => void;
  /**
   * Surface beneath the section. `onMedia` gives the section its own liquid
   * glass boundary; `onGlass` uses a lighter tonal lens inside an existing
   * glass panel or dialog. Defaults to `onMedia`.
   */
  placement?: GlassControlPlacement;
  /** Stable test id for the section. */
  testId?: DomTestId;
  /** Content revealed beneath the trigger. */
  children: ReactNode;
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
  const resolve = useLocalizer();
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
            {resolve(title)}
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
              {resolve(summary)}
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
