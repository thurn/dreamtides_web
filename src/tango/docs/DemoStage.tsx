// The live preview surface on a Tango component's doc page. Renders the actual
// component with the current control `args` plus any `sampleContent` (props
// with no control — ReactNode children, structured model slots like a RichText
// body) inside a token-styled panel. Re-renders whenever the ComponentPage
// updates args, so control edits are reflected immediately.

import type { ComponentType } from "react";
import { token } from "../primitives/tokens";

interface DemoStageProps {
  Component: ComponentType<Record<string, unknown>>;
  args: Record<string, unknown>;
  sampleContent?: Record<string, unknown>;
}

export function DemoStage({ Component, args, sampleContent }: DemoStageProps) {
  return (
    <div
      style={{
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
