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
  { value: "deck", label: "Deck Order" },
  { value: "cost-asc", label: "Cost (Low to High)" },
  { value: "cost-desc", label: "Cost (High to Low)" },
  { value: "spark-desc", label: "Spark (High to Low)" },
  { value: "name-asc", label: "Name (A to Z)" },
];

interface SelectDemoArgs {
  options?: SelectOption[];
  /** Seeds (and, if edited via the control panel, re-seeds) the chosen value. */
  value?: string;
  eyebrow?: string;
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
  eyebrow = "Sort",
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
      eyebrow={eyebrow}
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
    "The compact dropdown control: one resting trigger that names the current choice and reveals the rest in a menu on tap. Use it for a longer list — a sort order with several modes, a filter with many values — where laying every option out at once (SegmentedControl) would not fit.",
  callout:
    "The trigger wears the shared control `treatment`, so a Select and a SegmentedControl placed together read as one cluster. The menu stays a solid raised popover in every treatment so it is legible over scene art.",
  group: "Components",
  docName: "Select",
  Component: SelectDemo,
  usage: [
    {
      note: "A controlled dropdown: own the chosen value and update it from `onChange`. The `eyebrow` names what the dropdown controls.",
      code: `import { useState } from "react";
import { Select } from "src/tango/components/controls/Select";

const [sort, setSort] = useState("deck");

<Select
  eyebrow="Sort"
  options={[
    { value: "deck", label: "Deck Order" },
    { value: "cost-asc", label: "Cost (Low to High)" },
    { value: "name-asc", label: "Name (A to Z)" },
  ]}
  value={sort}
  onChange={setSort}
/>`,
    },
    {
      label: "Right-aligned in a bar",
      note: "Set `align=\"end\"` when the Select sits against the trailing edge so its menu stays on-screen.",
      code: `<Select
  eyebrow="Sort"
  align="end"
  treatment="glass"
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
      eyebrow: "Sort",
      size: "md",
      full: false,
      align: "start",
      treatment: "accent",
    },
  },
};
