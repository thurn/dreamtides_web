// Registry demo entry for GroupPanel — see info-card.tsx for the recipe this
// follows. GroupPanel is a fixed-shape flat card with no styling props, so it
// seeds no editable controls; `children` is a ReactNode slot with no generated
// control, so it's seeded via sampleContent with a representative "dense
// related info" grouping (a rules line, a hairline divider, and a labelled
// value row) so the live pane has real content to organize.

import { GroupPanel } from "../../components/controls/GroupPanel";
import type { CumulusComponent } from "../registry";

export const groupPanelDemo: CumulusComponent = {
  id: "group-panel",
  title: "Group Panel",
  blurb:
    "The information-grouping card: a flat, solid deep-plum card that collects dense, related values into one unit. It earns its place by organizing information, not by holding a lone label — and reads as a distinct surface from InfoCard's glass.",
  group: "Components",
  docName: "GroupPanel",
  Component: GroupPanel,
  usage: [
    {
      note: "A fixed-shape flat card that collects genuinely dense, related content (a heading, a body, a labelled value row) into one surface. It takes no styling props — only children.",
      code: `import { GroupPanel } from "src/cumulus/components/controls/GroupPanel";

<GroupPanel>
  <p className="eyebrow">Dreamcaller</p>
  <p>Essence, Spark, and the run's docked dreamsigns.</p>
</GroupPanel>`,
    },
  ],
  demo: {
    defaultArgs: {},
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
