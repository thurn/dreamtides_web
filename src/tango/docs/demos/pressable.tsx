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
    "The one press-feedback primitive. Wrap any element in it and that element gains the shared press-down compression, so every interactive surface in Tango presses with the identical feel.",
  callout:
    "Reach for a higher-level component first. Pressable is a low-level building block — before wrapping raw markup in it, look for an existing Tango component (Button, TidePill, SegmentedControl, SiteNode, …) that already bakes in the press feedback. Use Pressable only when you're building a genuinely new interactive surface no component covers.",
  group: "Primitives",
  docName: "Pressable",
  Component: Pressable,
  usage: [
    {
      label: "Wrap any element",
      note: "Pressable adds the shared scale-down feedback and a pointer cursor to whatever it wraps. Pass the tag via `as`; extra HTML attributes (onClick, aria-*) forward to the rendered element.",
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
      label: "No compression (hover-only)",
      note: "Set `compress={false}` for a surface you hover to reveal information but cannot act on — its pointer handlers and cursor stay, but a press does not scale it down, so it never reads as an actionable button.",
      code: `<Pressable as="span" compress={false}>
  <span className="my-target">Reveal on hover</span>
</Pressable>`,
    },
  ],
  demo: {
    defaultArgs: {
      as: "button",
      disabled: false,
      compress: true,
    },
    sampleContent: {
      children: <span style={targetStyle}>Press me</span>,
    },
  },
};
