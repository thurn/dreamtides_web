import type { ReactElement, ReactNode } from "react";
import { Pressable } from "../../primitives/Pressable";
import { GLYPHS } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import { GlowIcon } from "./GlowIcon";
import { GroupPanel } from "./GroupPanel";

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
    <section data-testid={testId} data-disclosure-expanded={expanded ? "true" : "false"}>
      <GroupPanel>
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
            color: token("--text-primary"),
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
                  color: token("--text-secondary"),
                  font: token("--t-caption"),
                }}
              >
                {summary}
              </span>
            )}
          </span>
          <GlowIcon
            iconClass={expanded ? GLYPHS.chevronUp : GLYPHS.chevronDown}
            color="text-secondary"
            size="1.25em"
          />
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
      </GroupPanel>
    </section>
  );
}
