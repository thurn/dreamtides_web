// D97Panel — the one frame every Dreamtides 97 overworld popup panel uses:
// a modal layer over the world holding one floating GlassPanel in the same
// material and header as the D97 card panels (the deck editor and the
// shop's CardBrowserPanel and CardPickerPanel): the popover glass tint and
// radius, a title with an optional supporting line, and a trailing glass
// close disc centred on the header row. The panel hugs its content up to a
// reading measure and scrolls its body past the viewport. The layer has no
// scrim (the HUD hides behind every panel instead). PURE: it reports Close.

import type { ReactElement, ReactNode } from "react";
import { GlassPanel } from "../../components/overlay/GlassPanel";
import { GLYPHS } from "../../primitives/glyph";
import { token } from "../../primitives/tokens";
import { useIsDesktop } from "../../primitives/use-is-desktop";
import type { DomTestId } from "../../types/dom";

/** The panels a D97 frame holds, for test hooks and QA. */
export type D97PanelKind = "quest-log" | "menu" | "encounter-preview" | "quest-reward";

export interface D97PanelProps {
  readonly kind: D97PanelKind;
  /** The panel's heading, also its dialog name. */
  readonly title: string;
  /** An optional supporting line under the title. */
  readonly subtitle?: string;
  /** Dismisses the panel from its close disc; omit for a panel the player must answer. */
  readonly onClose?: () => void;
  /** The close disc's accessible name. */
  readonly closeLabel?: string;
  readonly closeTestId?: DomTestId;
  /** The scrolling body. */
  readonly children: ReactNode;
}

/** The widest a popup panel grows: a comfortable reading measure. */
const PANEL_MAX_WIDTH_PX = 640;
/** The narrowest a popup panel shrinks, so a short title never crowds its close disc. */
const PANEL_MIN_WIDTH_PX = 320;
/** The widest a card-choice panel grows, as the other D97 card panels. */
const CARD_PANEL_MAX_WIDTH_PX = 1180;

/** A D97 overworld popup panel. */
export function D97Panel({
  kind,
  title,
  subtitle,
  onClose,
  closeLabel = "Close",
  closeTestId,
  children,
}: D97PanelProps): ReactElement {
  const isDesktop = useIsDesktop();
  const inset = isDesktop ? token("--space-2xl") : token("--gutter");
  const bodyPadding = isDesktop ? token("--space-2xl") : token("--space-l");
  const maxWidth = kind === "quest-reward" ? CARD_PANEL_MAX_WIDTH_PX : PANEL_MAX_WIDTH_PX;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="cumulus"
      data-d97-panel={kind}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: token("--layer-app-overlay"),
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: inset,
      }}
    >
      <div
        data-d97-panel-frame=""
        style={{
          width: "fit-content",
          minWidth: `min(100%, ${String(PANEL_MIN_WIDTH_PX)}px)`,
          maxWidth: `min(100%, ${String(maxWidth)}px)`,
          maxHeight: "100%",
          minHeight: 0,
          display: "flex",
        }}
      >
        <GlassPanel
          title={title}
          {...(subtitle === undefined ? {} : { subtitle })}
          radius="popover"
          tint="popover"
          headerSpacing={isDesktop ? "regular" : "medium"}
          {...(onClose === undefined
            ? {}
            : {
                rightAccessory: {
                  kind: "iconButton" as const,
                  button: { glyph: GLYPHS.close, label: closeLabel, onPress: onClose, testId: closeTestId },
                },
              })}
        >
          <div
            data-d97-panel-body=""
            style={{
              minHeight: 0,
              overflowY: "auto",
              WebkitOverflowScrolling: "touch",
              overscrollBehaviorY: "contain",
              padding: bodyPadding,
            }}
          >
            {children}
          </div>
        </GlassPanel>
      </div>
    </div>
  );
}
