// Registry demo entry for SegmentedControl — see pressable.tsx for the
// recipe this follows. SegmentedControl is a controlled component (value +
// onChange), so a generated "value" text control alone wouldn't make
// clicking a segment do anything. `Component` here is a small stateful
// wrapper that owns the selected segment and forwards clicks into
// `onChange`; `docName` still points at the real SegmentedControl, so the
// props table stays accurate to its actual (undecorated) API.

import { useEffect, useState, type CSSProperties } from "react";
import {
  SegmentedControl,
  type SegmentedOption,
} from "../../components/SegmentedControl";
import type { TangoComponent } from "../registry";

const OPTIONS: SegmentedOption[] = [
  { value: "All", label: "All" },
  { value: "Characters", label: "Characters" },
  { value: "Events", label: "Events" },
];

function firstValue(options: (string | SegmentedOption)[]): string {
  const first = options[0];
  return typeof first === "string" ? first : (first?.value ?? "");
}

interface SegmentedControlDemoArgs {
  /** Segments to render; defaults to a representative All/Characters/Events set. */
  options?: (string | SegmentedOption)[];
  /** Seeds (and, if edited via the control panel, re-seeds) the initially-selected segment. */
  value?: string;
  size?: "sm" | "md";
  full?: boolean;
  style?: CSSProperties;
}

/**
 * Wraps the controlled SegmentedControl with local selection state so the
 * demo stage is genuinely interactive — clicking a segment visibly moves the
 * active fill. The `value` arg (driven by the generated control panel) seeds
 * the initial/re-seeded selection; clicks afterwards are tracked locally
 * since a plain text control can't observe SegmentedControl's onChange.
 */
function SegmentedControlDemo({
  options = OPTIONS,
  value,
  size = "md",
  full = false,
  style,
}: SegmentedControlDemoArgs) {
  const [selected, setSelected] = useState(() => value ?? firstValue(options));

  useEffect(() => {
    if (value !== undefined) {
      setSelected(value);
    }
  }, [value]);

  return (
    <SegmentedControl
      options={options}
      value={selected}
      onChange={setSelected}
      size={size}
      full={full}
      style={style}
    />
  );
}

export const segmentedControlDemo: TangoComponent = {
  id: "segmented-control",
  title: "Segmented Control",
  group: "Components",
  docName: "SegmentedControl",
  Component: SegmentedControlDemo,
  demo: {
    defaultArgs: {
      options: OPTIONS,
      value: "All",
      size: "md",
      full: false,
    },
  },
};
