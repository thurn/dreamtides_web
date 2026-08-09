import { useState } from "react";
import type { TransfigurationType } from "../../../types/journey";
import {
  TransfigurationButton,
  type TransfigurationButtonVariant,
} from "../../components/controls/TransfigurationButton";
import { token } from "../../primitives/tokens";
import type { CumulusComponent } from "../registry";
import type { TransfigurationFormDefinition } from "../../../types/transfiguration-data";

function demoPresentation(
  id: TransfigurationType,
): TransfigurationFormDefinition {
  return {
    id,
    glossaryUuid: "00000000-0000-4000-8000-000000000001",
    name: id,
    effectDisclosure: "Demo effect",
    selectedCardDescription: "Demo selected-card effect",
    accessibilityDescription: `${id} demo`,
    glyph: `transfiguration${id}`,
    accentColor: "#9b8afb",
    tintColor: "#c9c1ff",
    merchantAllowed: true,
    eligibility: { kind: "positiveEnergyCost" },
    operation: { kind: "halveEnergyCost", rounding: "Down", minimum: 0 },
    pricing: { kind: "free" },
    benefit: { kind: "flat", value: 1 },
  };
}

const DEMO_FORMS = [
  {
    type: "Inspired" as const,
    description: "Give this event Fleeting.",
    essenceCost: 0,
    affordable: true,
  },
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
      data-transfiguration-button-demo=""
      style={{
        width: "100%",
        maxWidth: 560,
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(min(240px, 100%), 1fr))",
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
          {DEMO_FORMS.map((form) => {
            return (
              <TransfigurationButton
                key={form.type}
                form={{ ...form, presentation: demoPresentation(form.type) }}
                variant={variant}
                selected={selected === form.type}
                onPress={setSelected}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

export const transfigurationButtonDemo: CumulusComponent = {
  id: "transfiguration-button",
  title: "Transfiguration Button",
  blurb:
    "The canonical forge-form choice: compact and optionally priced controls with shared glyph, color, state, and accessibility behavior.",
  callout:
    "Use the compact variant for space-constrained lists and the priced variant when choices may carry an essence quote; zero-cost choices omit the price.",
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
