import type { LocalizedString } from "@trox/runtime";
import type { ReactElement, ReactNode } from "react";
import { GLYPHS } from "../../primitives/glyph";
import type { Glyph } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import { GlassPanel } from "./GlassPanel";

export interface DeveloperRailProps {
  /** DOM id targeted by the rail disclosure trigger. */
  readonly id: string;
  /** Developer tool name shown in the rail header. */
  readonly title?: LocalizedString;
  readonly authoredTitle?: string;
  /** Optional concise tool context. */
  readonly subtitle?: LocalizedString;
  readonly authoredSubtitle?: string;
  /** Physical screen edge occupied by the docked rail. */
  readonly side: "left" | "right";
  /** Accessible close action. */
  readonly onClose: () => void;
  /** Accessible name for the close action. */
  readonly closeLabel?: LocalizedString;
  readonly authoredCloseLabel?: string;
  /** Optional tool action placed before the close disc. */
  readonly headerAction?: {
    readonly glyph: Glyph;
    readonly label: LocalizedString;
    readonly onPress: () => void;
    readonly disabled?: boolean;
    readonly testId?: string;
  };
  /** Scrollable tool content. */
  readonly children: ReactNode;
  /** Optional fixed rail footer. */
  readonly footer?: ReactNode;
  /** Stable test id for product QA. */
  readonly testId?: string;
}

/** Shared edge-attached shell for persistent developer tools. */
export function DeveloperRail({
  id,
  title,
  authoredTitle,
  subtitle,
  authoredSubtitle,
  side,
  onClose,
  closeLabel,
  authoredCloseLabel,
  headerAction,
  children,
  footer,
  testId,
}: DeveloperRailProps): ReactElement {
  if ((title === undefined) === (authoredTitle === undefined) ||
      (closeLabel === undefined) === (authoredCloseLabel === undefined)) {
    throw new Error("DeveloperRail title and close label require exactly one localized or authored ownership path.");
  }
  if (subtitle !== undefined && authoredSubtitle !== undefined) {
    throw new Error("DeveloperRail accepts subtitle or authoredSubtitle, not both.");
  }
  return (
    <aside
      id={id}
      data-developer-rail={side}
      data-testid={testId}
      style={{
        position: "relative",
        zIndex: 60,
        minWidth: 0,
        height: "100dvh",
      }}
    >
      <GlassPanel
        frame="edgeRail"
        authoredEyebrow="Developer Tools"
        title={title}
        authoredTitle={authoredTitle}
        subtitle={subtitle}
        authoredSubtitle={authoredSubtitle}
        headerSpacing="compact"
        rightAccessory={
          headerAction === undefined
            ? {
                kind: "iconButton",
                button: {
                  glyph: GLYPHS.close,
                  label: closeLabel,
                  authoredLabel: authoredCloseLabel,
                  onPress: onClose,
                  size: "sm",
                },
              }
            : {
                kind: "iconButtonGroup",
                buttons: [
                  { ...headerAction, size: "sm" },
                  {
                    glyph: GLYPHS.close,
                    label: closeLabel,
                    authoredLabel: authoredCloseLabel,
                    onPress: onClose,
                    size: "sm",
                  },
                ],
              }
        }
        footer={footer}
      >
        <div
          style={{
            height: "100%",
            overflowY: "auto",
            padding: token("--space-m"),
            boxSizing: "border-box",
          }}
        >
          {children}
        </div>
      </GlassPanel>
    </aside>
  );
}
