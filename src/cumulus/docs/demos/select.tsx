// Registry demo entry for Select — see segmented-control.tsx for the recipe
// this follows. Select is a controlled component (value + onChange), so the
// demo wraps it in a small stateful component that owns the chosen value and
// forwards picks into `onChange`; `docName` still points at the real Select so
// the props table documents its actual API.

import { useEffect, useState } from "react";
import { Select, type SelectOption } from "../../components/controls/Select";
import { GLYPHS } from "../../primitives/glyph";
import type { CumulusComponent } from "../registry";

const OPTIONS: SelectOption[] = [
  { value: "name", label: "Name" },
  { value: "drafted", label: "Drafted" },
  { value: "cost", label: "Cost" },
  { value: "spark", label: "Spark" },
  { value: "subtype", label: "Subtype" },
];

interface SelectDemoArgs {
  options?: SelectOption[];
  /** Seeds (and, if edited via the control panel, re-seeds) the chosen value. */
  value?: string;
  size?: "sm" | "md";
  full?: boolean;
  align?: "start" | "end";
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
    />
  );
}

export const selectDemo: CumulusComponent = {
  id: "select",
  title: "Select",
  blurb:
    "The compact dropdown control, and Cumulus's standard mobile filter/sort control: a button that shows a leading glyph and the current selection, and opens a menu on tap. Two of them share a single line where a segmented control would not fit.",
  callout:
    "The trigger is single-font by construction — one leading glyph, one selection label, one dropdown caret — so a caller cannot mix two type voices in a button.",
  details: [
    "It reserves the width of its widest option's label, so the button holds one size and never jitters as the selection changes. Give a menu entry a compact `triggerLabel` to show a shorter form on the collapsed button while the menu shows the full phrase. The menu opens above or below according to the available viewport space and scrolls when neither side can fit every option. Trigger and menu wear the same liquid glass, so the open control reads as one continuous surface.",
  ],
  group: "Components",
  docName: "Select",
  Component: SelectDemo,
  usage: [
    {
      note: "A controlled dropdown: own the chosen value and update it from `onChange`. `leadingGlyph` gives the button its identity (a funnel for a filter, up/down arrows for a sort).",
      code: `import { useState } from "react";
import { Select } from "src/cumulus/components/controls/Select";
import { GLYPHS } from "src/cumulus/primitives/glyph";

const [sort, setSort] = useState("name");

<Select
  leadingGlyph={GLYPHS.sort}
  options={[
    { value: "name", label: "Name" },
    { value: "drafted", label: "Drafted" },
    { value: "cost", label: "Cost" },
  ]}
  value={sort}
  onChange={setSort}
/>`,
    },
    {
      label: "Action picker",
      note: "Use placeholder with an unmatched controlled value when choosing an item performs an action and resets the trigger.",
      code: `<Select placeholder="Add an Action" options={actionOptions} value="" onChange={addAction} />`,
    },
    {
      label: "Right-aligned in a bar",
      note: 'Set `align="end"` when the Select sits against the trailing edge so its menu stays on-screen.',
      code: `<Select
  leadingGlyph={GLYPHS.sort}
  align="end"
  options={sortOptions}
  value={sort}
  onChange={setSort}
/>`,
    },
  ],
  demo: {
    defaultArgs: {
      options: OPTIONS,
      value: "name",
      size: "md",
      full: false,
      align: "start",
    },
  },
};
