// Registry demo entry for Select — see segmented-control.tsx for the recipe
// this follows. Select is a controlled component (value + onChange), so the
// demo wraps it in a small stateful component that owns the chosen value and
// forwards picks into `onChange`; `docName` still points at the real Select so
// the props table documents its actual API.

import { useEffect, useState } from "react";
import { Select, type SelectOption } from "../../components/controls/Select";
import type { ControlTreatment } from "../../components/controls/control-treatment";
import { GLYPHS } from "../../primitives/glyph";
import type { TangoComponent } from "../registry";

const OPTIONS: SelectOption[] = [
  { value: "deck", label: "Deck Order", triggerLabel: "Deck" },
  { value: "cost-asc", label: "Cost (Low to High)", triggerLabel: "Cost ↑" },
  { value: "cost-desc", label: "Cost (High to Low)", triggerLabel: "Cost ↓" },
  { value: "spark-desc", label: "Spark (High to Low)", triggerLabel: "Spark ↓" },
  { value: "name-asc", label: "Name (A to Z)", triggerLabel: "Name" },
];

interface SelectDemoArgs {
  options?: SelectOption[];
  /** Seeds (and, if edited via the control panel, re-seeds) the chosen value. */
  value?: string;
  size?: "sm" | "md";
  full?: boolean;
  align?: "start" | "end";
  treatment?: ControlTreatment;
}

/**
 * Wraps the controlled Select with local selection state so the demo stage is
 * genuinely interactive — opening the menu and picking a row visibly updates
 * the trigger label. The `value` arg (from the generated control panel) seeds
 * the initial/re-seeded selection.
 */
function SelectDemo({
  options = OPTIONS,
  value,
  size = "md",
  full = false,
  align = "start",
  treatment = "accent",
}: SelectDemoArgs) {
  const [selected, setSelected] = useState(
    () => value ?? options[0]?.value ?? "",
  );

  useEffect(() => {
    if (value !== undefined) {
      setSelected(value);
    }
  }, [value]);

  return (
    <Select
      options={options}
      value={selected}
      onChange={setSelected}
      leadingGlyph={GLYPHS.sort}
      size={size}
      full={full}
      align={align}
      treatment={treatment}
    />
  );
}

export const selectDemo: TangoComponent = {
  id: "select",
  title: "Select",
  blurb:
    "The compact dropdown control, and Tango's standard mobile filter/sort control: a button that shows a leading glyph and the current selection, and opens a menu on tap. Two of them share a single line where a segmented control would not fit.",
  callout:
    "The trigger is single-font by construction — one leading glyph, one selection label, one chevron — so a caller cannot mix two type voices in a button. Give a menu entry a compact `triggerLabel` to keep the collapsed button narrow while the menu shows the full phrase. The trigger wears the shared control `treatment`; the menu stays a solid raised popover.",
  group: "Components",
  docName: "Select",
  Component: SelectDemo,
  usage: [
    {
      note: "A controlled dropdown: own the chosen value and update it from `onChange`. `leadingGlyph` gives the button its identity (a funnel for a filter, up/down arrows for a sort).",
      code: `import { useState } from "react";
import { Select } from "src/tango/components/controls/Select";
import { GLYPHS } from "src/tango/primitives/glyph";

const [sort, setSort] = useState("deck");

<Select
  leadingGlyph={GLYPHS.sort}
  options={[
    { value: "deck", label: "Deck Order", triggerLabel: "Deck" },
    { value: "cost-asc", label: "Cost (Low to High)", triggerLabel: "Cost ↑" },
    { value: "name-asc", label: "Name (A to Z)", triggerLabel: "Name" },
  ]}
  value={sort}
  onChange={setSort}
/>`,
    },
    {
      label: "Right-aligned in a bar",
      note: "Set `align=\"end\"` when the Select sits against the trailing edge so its menu stays on-screen.",
      code: `<Select
  leadingGlyph={GLYPHS.sort}
  align="end"
  treatment="sprite"
  options={sortOptions}
  value={sort}
  onChange={setSort}
/>`,
    },
  ],
  demo: {
    defaultArgs: {
      options: OPTIONS,
      value: "deck",
      size: "md",
      full: false,
      align: "start",
      treatment: "accent",
    },
  },
};
