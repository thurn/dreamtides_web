import { useState } from "react";
import { assertLocalized } from "@trox/runtime";
import type { TransfigurationType } from "../../../types/journey";
import {
  TransfigurationButton,
  type TransfigurationButtonLayout,
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
    pricing: { kind: "unpriced" as const },
  },
  {
    type: "Empowered" as const,
    pricing: { kind: "essence" as const, amount: 40, affordable: true },
  },
  {
    type: "Kindled" as const,
    pricing: { kind: "essence" as const, amount: 80, affordable: false },
  },
];

function TransfigurationButtonDemo() {
  const [selected, setSelected] = useState<TransfigurationType | null>(null);
  const layouts: readonly TransfigurationButtonLayout[] = [
    "compact",
    "wide",
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
      {layouts.map((layout) => (
        <div
          key={layout}
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
                layout={layout}
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
    "The canonical forge-form choice: compact and wide layouts for first-class unpriced and Essence-priced choices.",
  callout:
    "Choose pricing semantics independently from layout: unpriced choices carry no payment data, while Essence-priced choices own amount and affordability.",
  group: "Actions & Inputs",
  docName: "TransfigurationButton",
  Component: TransfigurationButtonDemo,
  usage: [
    {
      label: "Forge form",
      note: "Pass an explicitly unpriced or Essence-priced form and choose its layout independently.",
      code: `import { TransfigurationButton } from "src/cumulus/components/controls/TransfigurationButton";

<TransfigurationButton
  form={form}
  layout="wide"
  selected={selectedType === form.type}
  onPress={selectForm}
/>`,
    },
  ],
  demo: { defaultArgs: {} },
};
