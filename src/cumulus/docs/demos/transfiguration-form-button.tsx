import { useState } from "react";
import { TRANSFIGURATION_COLORS } from "../../../runtime/transfiguration-display";
import type { TransfigurationType } from "../../../types/quest";
import { TransfigurationFormButton } from "../../components/controls/TransfigurationFormButton";
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
  return (
    <div style={{ display: "flex", gap: token("--space-4") }}>
      {DEMO_FORMS.map((form) => (
        <TransfigurationFormButton
          key={form.type}
          id={`demo:${form.type}`}
          type={form.type}
          description={form.description}
          essenceCost={form.essenceCost}
          affordable={form.affordable}
          accent={TRANSFIGURATION_COLORS[form.type]}
          selected={selected === form.type}
          onActivate={() => setSelected(form.type)}
        />
      ))}
    </div>
  );
}

export const transfigurationFormButtonDemo: CumulusComponent = {
  id: "transfiguration-form-button",
  title: "Transfiguration Form Button",
  blurb:
    "The compact forge-form choice: a colored transfiguration glyph and form name in one touch-sized control, with the cost and effect revealed through InfoCard.",
  callout:
    "Use this on space-constrained transfiguration surfaces. A quick activation selects an affordable form; hover, focus, or touch-hold reveals its complete meaning without spending permanent screen area.",
  group: "Components",
  docName: "TransfigurationFormButton",
  Component: TransfigurationFormButtonDemo,
  usage: [
    {
      label: "Compact forge form",
      note: "Give each concrete card/form pairing a stable id so its reveal identity stays distinct.",
      code: `import { TransfigurationFormButton } from "src/cumulus/components/controls/TransfigurationFormButton";

<TransfigurationFormButton
  id={entryId + ":" + form.type}
  type={form.type}
  description={form.description}
  essenceCost={form.essenceCost}
  affordable={form.affordable}
  accent={form.accent}
  selected={selectedType === form.type}
  onActivate={() => selectForm(form.type)}
/>`,
    },
  ],
  demo: { defaultArgs: {} },
};
