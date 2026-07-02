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
  demo: {
    defaultArgs: {
      size: "md",
      full: false,
      disabled: false,
      cost: 100,
      frameScale: 1,
    },
    sampleContent: {
      children: "Begin Battle",
      icon: <i className="bxf bx-sword" />,
    },
  },
};
