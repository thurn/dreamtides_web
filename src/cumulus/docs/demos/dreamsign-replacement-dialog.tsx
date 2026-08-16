import { useState } from "react";
import { assertLocalized } from "@trox/runtime";
import { DreamsignReplacementDialog } from "../../components/overlay/DreamsignReplacementDialog";
import { demoDreamsign } from "./promotion-fixtures";
import type { CumulusComponent } from "../registry";
import { DemoControls, DemoLog, DemoSelect } from "./promotion-demo-controls";
function Demo() {
  const [heldCount, setHeldCount] = useState(2);
  const [incomingIndex, setIncomingIndex] = useState(1);
  const [last, setLast] = useState("No interaction yet");
  const held = Array.from({ length: heldCount }, (_, index) =>
    demoDreamsign(index + 2),
  );
  return (
    <div style={{ display: "grid", gap: 12 }}>
      <DemoControls>
        <DemoSelect
          label="Incoming"
          value={String(incomingIndex)}
          values={["1", "7", "9"]}
          onChange={(value) => setIncomingIndex(Number(value))}
        />
        <DemoSelect
          label="Held count"
          value={String(heldCount)}
          values={["0", "1", "2", "6"]}
          onChange={(value) => setHeldCount(Number(value))}
        />
      </DemoControls>
      <DreamsignReplacementDialog
        model={{
          incoming: demoDreamsign(incomingIndex),
          held,
          capacity: Math.max(1, heldCount),
          dismissLabel: assertLocalized("Keep choosing"),
          closeLabel: assertLocalized("Close replacement"),
        }}
        onDreamsignPress={(id) => setLast(`Selected held UUID: ${id}`)}
        onDismiss={() => setLast("Dismissed without replacement")}
      />
      <DemoLog>{last}</DemoLog>
    </div>
  );
}
export const dreamsignReplacementDialogDemo: CumulusComponent = {
  id: "dreamsign-replacement-dialog",
  title: "Dreamsign Replacement Dialog",
  blurb:
    "A UUID-routed capacity-resolution dialog that keeps the incoming and held Dreamsigns fully readable.",
  callout:
    "Selection emits a held Dreamsign UUID; capacity and mutation rules stay with the caller.",
  details: [
    "Reading a Dreamsign uses the Entity Reveal coordinator while the explicit action selects it for replacement.",
    "The selected value is the held Dreamsign UUID, never its position or display name.",
  ],
  relatedSystems: ["entity-reveals"],
  group: "Surfaces & Overlays",
  docName: "DreamsignReplacementDialog",
  Component: Demo,
  usage: [
    {
      code: `<DreamsignReplacementDialog model={replacement} onDreamsignPress={replaceById} onDismiss={cancel} />`,
    },
  ],
  demo: { defaultArgs: {}, stage: "viewport" },
};
