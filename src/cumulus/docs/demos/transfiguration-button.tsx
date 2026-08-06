import { useState } from "react";
import type { TransfigurationType } from "../../../types/journey";
import {
  TransfigurationButton,
  type TransfigurationButtonVariant,
} from "../../components/controls/TransfigurationButton";
import { token } from "../../primitives/tokens";
import type { CumulusComponent } from "../registry";

const DEMO_FORMS = [
  {
    type: "Empowered" as const,
    description: "Reduce this card's energy cost.",
    essenceCost: 40,
    affordable: true,
  },
  {
    type: "Kindled" as const,
    description: "Double this character's spark.",
    essenceCost: 80,
    affordable: false,
  },
];

function TransfigurationButtonDemo() {
  const [selected, setSelected] = useState<TransfigurationType | null>(null);
  const variants: readonly TransfigurationButtonVariant[] = [
    "compact",
    "priced",
  ];
  return (
    <div
      style={{
        width: 560,
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: token("--space-l"),
      }}
    >
      {variants.map((variant) => (
        <div
          key={variant}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: token("--space-s"),
          }}
        >
          {DEMO_FORMS.map((form) => (
            <TransfigurationButton
              key={form.type}
              form={form}
              variant={variant}
              selected={selected === form.type}
              onPress={setSelected}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export const transfigurationButtonDemo: CumulusComponent = {
  id: "transfiguration-button",
  title: "Transfiguration Button",
  blurb:
    "The canonical forge-form choice: compact and price-bearing controls with shared glyph, color, state, and accessibility behavior.",
  callout:
    "Use the compact variant for space-constrained lists and the priced variant when each choice carries a visible essence quote.",
  group: "Components",
  docName: "TransfigurationButton",
  Component: TransfigurationButtonDemo,
  usage: [
    {
      label: "Forge form",
      note: "Pass the structured form model and choose one of the two strict presentation variants.",
      code: `import { TransfigurationButton } from "src/cumulus/components/controls/TransfigurationButton";

<TransfigurationButton
  form={form}
  variant="priced"
  selected={selectedType === form.type}
  onPress={selectForm}
/>`,
    },
  ],
  demo: { defaultArgs: {} },
};
