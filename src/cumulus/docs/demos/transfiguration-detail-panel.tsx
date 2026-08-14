import { useState } from "react";
import type { TransfigurationType } from "../../../types/journey";
import { TransfigurationDetailPanel } from "../../components/card/TransfigurationDetailPanel";
import { demoTransfigurationCandidate } from "./promotion-fixtures";
import type { CumulusComponent } from "../registry";
import { DemoControls, DemoLog, DemoSelect } from "./promotion-demo-controls";
function Demo() {
  const [value, setValue] = useState<TransfigurationType | null>("Empowered");
  const [status, setStatus] = useState<"idle" | "submitting">("idle");
  const [quote, setQuote] = useState<"show-cost" | "included">("show-cost");
  const [navigation, setNavigation] = useState<"fixed" | "reselectable">(
    "reselectable",
  );
  const [last, setLast] = useState("No interaction yet");
  return (
    <div style={{ width: "100%", maxWidth: 680, display: "grid", gap: 12 }}>
      <DemoControls>
        <DemoSelect
          label="Selected form"
          value={value ?? "none"}
          values={[
            "none",
            ...demoTransfigurationCandidate.forms.map((form) => form.type),
          ]}
          onChange={(next) =>
            setValue(next === "none" ? null : (next as TransfigurationType))
          }
        />
        <DemoSelect
          label="Status"
          value={status}
          values={["idle", "submitting"]}
          onChange={(next) => setStatus(next as "idle" | "submitting")}
        />
        <DemoSelect
          label="Quote"
          value={quote}
          values={["show-cost", "included"]}
          onChange={(next) => setQuote(next as "show-cost" | "included")}
        />
        <DemoSelect
          label="Navigation"
          value={navigation}
          values={["fixed", "reselectable"]}
          onChange={(next) => setNavigation(next as "fixed" | "reselectable")}
        />
      </DemoControls>
      <TransfigurationDetailPanel
        candidate={demoTransfigurationCandidate}
        value={value}
        status={status}
        quote={quote}
        navigation={
          navigation === "fixed"
            ? { kind: "fixed" }
            : {
                kind: "reselectable",
                onBack: () => {
                  setValue(null);
                  setLast("Returned to card selection");
                },
              }
        }
        onChange={(type) => {
          setValue(type);
          setLast(`Selected form: ${type}`);
        }}
        onConfirm={(type) => setLast(`Confirmed form: ${type}`)}
      />
      <DemoLog>{last}</DemoLog>
    </div>
  );
}
export const transfigurationDetailPanelDemo: CumulusComponent = {
  id: "transfiguration-detail-panel",
  title: "Transfiguration Detail Panel",
  blurb:
    "A controlled form chooser for one prepared candidate, including previews, affordability, quoted costs, navigation, and commit state.",
  callout:
    "Pass prepared quotes and persist selection in the hosting workflow.",
  details: [
    "The panel emits only a Transfiguration type; payment and card mutation remain outside the component.",
    "Builders prepare each form's quote and affordability; status and controlled selection belong to the hosting workflow.",
  ],
  group: "Card Workflows",
  docName: "TransfigurationDetailPanel",
  Component: Demo,
  usage: [
    {
      code: `<TransfigurationDetailPanel candidate={candidate} value={type} status="idle" quote="show-cost" navigation={{ kind: "fixed" }} onChange={setType} onConfirm={commit} />`,
    },
  ],
  demo: { defaultArgs: {} },
};
