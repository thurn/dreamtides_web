// Registry demo entry for Button — see resource-chip.tsx for the recipe this
// follows. `label` is the button's text (a plain string) and `cost` its inline
// essence price, both seeded via defaultArgs.

import { Button } from "../../components/Button";
import type { TangoComponent } from "../registry";

export const buttonDemo: TangoComponent = {
  id: "button",
  title: "Button",
  blurb:
    "The one button in Tango — the beveled purple sprite, scaled to any label and to a taller commit height. Low-emphasis and destructive actions are plain pressable text or icons, never a second button color.",
  group: "Components",
  docName: "Button",
  Component: Button,
  usage: [
    {
      label: "With cost",
      note: "An essence `cost` renders after the label, in white, inside the one purple button sprite.",
      code: `import { Button } from "src/tango/components/Button";

<Button
  size="md"
  cost={100}
  label="Begin Battle"
  onClick={beginBattle}
/>`,
    },
    {
      label: "Commit action",
      note: "`size=\"lg\"` is the taller commit height; `full` stretches the button to its container width.",
      code: `<Button size="lg" full label="Begin Your Dream" onClick={confirm} />`,
    },
    {
      label: "Disabled",
      note: "Dims the button and detaches its click / press feedback.",
      code: `<Button disabled label="Not Ready" />`,
    },
  ],
  demo: {
    defaultArgs: {
      size: "md",
      full: false,
      disabled: false,
      cost: 100,
      label: "Begin Battle",
    },
  },
};
