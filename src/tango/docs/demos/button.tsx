// Registry demo entry for Button — see resource-chip.tsx for the recipe this
// follows. `icon` is a Boxicons class string; `label` is the button's text
// (a plain string), so it surfaces as a text control seeded via defaultArgs.

import { Button } from "../../components/Button";
import type { TangoComponent } from "../registry";

export const buttonDemo: TangoComponent = {
  id: "button",
  title: "Button",
  group: "Components",
  docName: "Button",
  Component: Button,
  usage: [
    {
      label: "With icon and cost",
      note: "A leading `icon` node and an essence `cost` render inside the one purple button sprite.",
      code: `import { Button } from "src/tango/components/Button";

<Button
  size="md"
  cost={100}
  icon="bxf bx-sword"
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
      icon: "bxf bx-sword",
      label: "Begin Battle",
    },
  },
};
