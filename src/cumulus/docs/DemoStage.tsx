// The live preview surface on a Cumulus component's doc page. Renders the actual
// component with the current control `args` plus any `sampleContent` (props
// with no control — ReactNode children, structured model slots like a RichText
// body) inside a token-styled panel. Re-renders whenever the ComponentPage
// updates args, so control edits are reflected immediately.

import type { ComponentType, CSSProperties } from "react";
import { token } from "../primitives/tokens";

/**
 * Live examples include viewport-fixed product chrome. A transformed ancestor
 * gives those descendants a local containing block, while clipping keeps the
 * example inside its documentation frame.
 */
export const FIXED_PREVIEW_BOUNDARY_STYLE: CSSProperties = {
  position: "relative",
  overflow: "hidden",
  transform: "translateZ(0)",
};

interface DemoStageProps {
  Component: ComponentType<Record<string, unknown>>;
  args: Record<string, unknown>;
  sampleContent?: Record<string, unknown>;
}

export function DemoStage({ Component, args, sampleContent }: DemoStageProps) {
  return (
    <div
      data-cumulus-doc-preview-boundary=""
      style={{
        ...FIXED_PREVIEW_BOUNDARY_STYLE,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "160px",
        padding: token("--space-9"),
        background: token("--bg-sunken"),
        border: `1px solid ${token("--border-mid")}`,
        borderRadius: token("--radius-panel"),
      }}
    >
      <Component {...args} {...sampleContent} />
    </div>
  );
}
