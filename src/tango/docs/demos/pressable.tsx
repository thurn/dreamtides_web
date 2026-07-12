// Registry demo entry for Pressable, the first real Tango component import.
//
// This file establishes the reusable per-component "import recipe": a
// `TangoComponent` entry lives in its own `demos/<id>.tsx` file (JSX needs a
// `.tsx` file; the registry itself stays a plain `.ts` aggregator — see
// registry.ts), providing sensible `defaultArgs` for the component's
// controllable props plus any `sampleContent` ReactNode the demo needs (here,
// the "Press me" target so the scale-down is visible). Later component tasks
// each add one sibling file here and one import + array entry in
// registry.ts.

import type { CSSProperties } from "react";
import { Pressable } from "../../primitives/Pressable";
import { token } from "../../primitives/tokens";
import type { TangoComponent } from "../registry";

const targetStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: `${token("--space-4")} ${token("--space-8")}`,
  borderRadius: token("--radius-control"),
  border: `1px solid ${token("--border-soft")}`,
  background: token("--surface-raised"),
  color: token("--text-primary"),
  font: token("--t-button"),
};

export const pressableDemo: TangoComponent = {
  id: "pressable",
  title: "Pressable",
  blurb:
    "The one press-feedback primitive. Interactive surfaces measure their rendered box for proportional hover and press movement; readable rules-copy reveals use the strict stationary variant.",
  callout:
    "Reach for a higher-level component first. Pressable is a low-level building block — before wrapping raw markup in it, look for an existing Tango component (Button, TideDisc, SegmentedControl, SiteNode, …) that already bakes in the press feedback. Use Pressable only when you're building a genuinely new interactive surface no component covers.",
  group: "Primitives",
  docName: "Pressable",
  Component: Pressable,
  usage: [
    {
      label: "Wrap any element",
      note: "Pressable measures the wrapped element so wide rows and compact controls move by a comparable physical distance. Mouse and pen hover upward, every primary press moves downward, and touch never hovers.",
      code: `import { Pressable } from "src/tango/primitives/Pressable";

<Pressable as="button" onClick={handleActivate}>
  <span className="my-target">Press me</span>
</Pressable>`,
    },
    {
      label: "Disabled",
      note: "A disabled Pressable detaches its press feedback and shows the default cursor.",
      code: `<Pressable as="div" disabled>
  <span className="my-target">Unavailable</span>
</Pressable>`,
    },
    {
      label: "Info-only reveal surface",
      note: "Wrap a surface you press to reveal information but cannot act on (a tide disc, an essence value) in the same Pressable — it follows the standard treatment (up on hover, down on press), so a press is acknowledged on touch too.",
      code: `<Pressable as="span">
  <span className="my-target">Reveal on press</span>
</Pressable>`,
    },
    {
      label: "Readable rules-copy reveal",
      note: "Ability text is the strict exception: use `stationary` so holding it to read keyword definitions never shrinks the copy beneath the finger.",
      code: `<Pressable as="span" pressFeedback="stationary">
  <RulesText text={abilityText} />
</Pressable>`,
    },
  ],
  demo: {
    defaultArgs: {
      as: "button",
      disabled: false,
      pressFeedback: "scale",
    },
    sampleContent: {
      children: <span style={targetStyle}>Press me</span>,
    },
  },
};
