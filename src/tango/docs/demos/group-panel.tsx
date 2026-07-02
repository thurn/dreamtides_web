// Registry demo entry for GroupPanel — see info-card.tsx for the recipe this
// follows. `radius` and `padding` are string|number props that seed as
// editable controls via defaultArgs; `children` is a ReactNode slot with no
// generated control, so it's seeded via sampleContent with a representative
// "dense related info" grouping (a rules line, a hairline divider, and a
// labelled value row) so the live pane has real content to organize.

import { GroupPanel } from "../../components/GroupPanel";
import type { TangoComponent } from "../registry";

export const groupPanelDemo: TangoComponent = {
  id: "group-panel",
  title: "Group Panel",
  group: "Components",
  docName: "GroupPanel",
  Component: GroupPanel,
  demo: {
    defaultArgs: {
      radius: "var(--r-popover)",
      padding: "var(--space-6)",
    },
    sampleContent: {
      children: (
        <div style={{ width: 320 }}>
          <div
            style={{
              font: "var(--t-rules)",
              fontSize: 16,
              lineHeight: 1.36,
              color: "var(--text-primary)",
            }}
          >
            Whenever you foresee, draw a card. Dawn: Gain 2 essence.
          </div>
          <div
            style={{
              height: 1,
              margin: "14px 0 0",
              background:
                "linear-gradient(90deg, transparent, var(--line-strong) 18%, var(--line-strong) 82%, transparent)",
            }}
          />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 13,
            }}
          >
            <span
              style={{
                font: "var(--t-eyebrow)",
                letterSpacing: "var(--tracking-eyebrow)",
                textTransform: "uppercase",
                color: "var(--text-secondary)",
              }}
            >
              Tides
            </span>
            <span style={{ color: "var(--text-primary)", fontWeight: 600 }}>
              Moon &middot; Tide
            </span>
          </div>
        </div>
      ),
    },
  },
};
