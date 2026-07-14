import { useState } from "react";
import type { TransfigurationType } from "../../../types/quest";
import {
  TransfigurationFormButton,
  type TransfigurationFormButtonVariant,
} from "../../components/controls/TransfigurationFormButton";
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

function TransfigurationFormButtonDemo() {
  const [selected, setSelected] = useState<TransfigurationType | null>(null);
  const variants: readonly TransfigurationFormButtonVariant[] = [
    "compact",
    "priced",
  ];
  return (
    <div
      style={{
        width: 560,
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: token("--space-6"),
      }}
    >
      {variants.map((variant) => (
        <div
          key={variant}
          style={{
            display: "flex",
            flexDirection: "column",
            gap: token("--space-4"),
          }}
        >
          {DEMO_FORMS.map((form) => (
            <TransfigurationFormButton
              key={form.type}
              form={form}
              variant={variant}
              selected={selected === form.type}
              onActivate={setSelected}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export const transfigurationFormButtonDemo: CumulusComponent = {
  id: "transfiguration-form-button",
  title: "Transfiguration Form Button",
  blurb:
    "The canonical forge-form choice: compact and price-bearing controls with shared glyph, color, state, and accessibility behavior.",
  callout:
    "Use the compact variant for space-constrained lists and the priced variant when each choice carries a visible essence quote.",
  group: "Components",
  docName: "TransfigurationFormButton",
  Component: TransfigurationFormButtonDemo,
  usage: [
    {
      label: "Forge form",
      note: "Pass the structured form model and choose one of the two strict presentation variants.",
      code: `import { TransfigurationFormButton } from "src/cumulus/components/controls/TransfigurationFormButton";

<TransfigurationFormButton
  form={form}
  variant="priced"
  selected={selectedType === form.type}
  onActivate={selectForm}
/>`,
    },
  ],
  demo: { defaultArgs: {} },
};
