// Registry demo entry for Button — see pressable.tsx for the recipe this
// follows. `icon` is a ReactNode-slot prop (no generated control), so it
// needs sampleContent; `children` is the button's label, also sampleContent.

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
  icon={<i className="bxf bx-sword" />}
  onClick={beginBattle}
>
  Begin Battle
</Button>`,
    },
    {
      label: "Commit action",
      note: "`size=\"lg\"` is the taller commit height; `full` stretches the button to its container width.",
      code: `<Button size="lg" full onClick={confirm}>
  Begin Your Dream
</Button>`,
    },
    {
      label: "Disabled",
      note: "Dims the button and detaches its click / press feedback.",
      code: `<Button disabled>Not Ready</Button>`,
    },
  ],
  demo: {
    defaultArgs: {
      size: "md",
      full: false,
      disabled: false,
      cost: 100,
    },
    sampleContent: {
      children: "Begin Battle",
      icon: <i className="bxf bx-sword" />,
    },
  },
};
