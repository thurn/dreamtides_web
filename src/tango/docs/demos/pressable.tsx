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
  group: "Primitives",
  docName: "Pressable",
  Component: Pressable,
  demo: {
    defaultArgs: {
      as: "button",
      disabled: false,
    },
    sampleContent: {
      children: <span style={targetStyle}>Press me</span>,
    },
  },
};
