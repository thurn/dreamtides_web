import { assertLocalized, type LocalizedString } from "@trox/runtime";
import type { ReactElement, ReactNode } from "react";
import { GLYPHS } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import { GlassPanel } from "./GlassPanel";
import type { DomElementId, DomTestId } from "../../types/dom";

export interface DeveloperRailProps {
  /** DOM id targeted by the rail disclosure trigger. */
  readonly id: DomElementId;
  /** Developer tool name shown in the rail header. */
  readonly title: LocalizedString;
  /** Optional concise tool context. */
  readonly subtitle?: LocalizedString;
  /** Physical screen edge occupied by the docked rail. */
  readonly side: "left" | "right";
  /** Accessible close action. */
  readonly onClose: () => void;
  /** Accessible name for the close action. */
  readonly closeLabel: LocalizedString;
  /** Scrollable tool content. */
  readonly children: ReactNode;
  /** Optional fixed rail footer. */
  readonly footer?: ReactNode;
  /** Stable test id for product QA. */
  readonly testId?: DomTestId;
}

/** Shared edge-attached shell for persistent developer tools. */
export function DeveloperRail({
  id,
  title,
  subtitle,
  side,
  onClose,
  closeLabel,
  children,
  footer,
  testId,
}: DeveloperRailProps): ReactElement {
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
        eyebrow={assertLocalized("Developer Tools")}
        title={title}
        subtitle={subtitle}
        headerSpacing="compact"
        rightAccessory={{
          kind: "iconButton",
          button: {
            glyph: GLYPHS.close,
            label: closeLabel,
            onPress: onClose,
            size: "sm",
          },
        }}
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
