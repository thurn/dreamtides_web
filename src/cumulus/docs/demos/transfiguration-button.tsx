import { useState } from "react";
import { assertLocalized } from "@trox/runtime";
import type { TransfigurationType } from "../../../types/journey";
import {
  TransfigurationButton,
  type TransfigurationButtonVariant,
} from "../../components/controls/TransfigurationButton";
import { token } from "../../primitives/tokens";
import type { CumulusComponent } from "../registry";
import type { LocalizedTransfigurationPresentation } from "../../components/controls/transfiguration-presentation";

function demoPresentation(
  id: TransfigurationType,
): LocalizedTransfigurationPresentation {
  return {
    name: assertLocalized(id),
    description: assertLocalized(`${id} demo effect`),
    glyph: `transfiguration${id}`,
    accentColor: "#9b8afb",
  };
}

const DEMO_FORMS = [
  {
    type: "Inspired" as const,
    essenceCost: 0,
    affordable: true,
  },
  {
    type: "Empowered" as const,
    essenceCost: 40,
    affordable: true,
  },
  {
    type: "Kindled" as const,
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
  group: "Actions & Inputs",
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
