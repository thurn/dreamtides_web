import { useState } from "react";
import {
  CardChangePair,
  type CardChangeKind,
} from "../../components/card/CardChangePair";
import { demoCard, demoInstanceId } from "./promotion-fixtures";
import type { CumulusComponent } from "../registry";
import { DemoControls, DemoSelect } from "./promotion-demo-controls";
function Demo() {
  const [kind, setKind] = useState<CardChangeKind>("transfiguration");
  const [reveal, setReveal] = useState<"before" | "complete">("complete");
  return (
    <div style={{ display: "grid", gap: 12, justifyItems: "center" }}>
      <DemoControls>
        <DemoSelect
          label="Change kind"
          value={kind}
          values={[
            "replacement",
            "copy",
            "transfiguration",
            "keyword",
            "card-type",
          ]}
          onChange={(value) => setKind(value as CardChangeKind)}
        />
        <DemoSelect
          label="Reveal phase"
          value={reveal}
          values={["before", "complete"]}
          onChange={(value) => setReveal(value as "before" | "complete")}
        />
      </DemoControls>
      <CardChangePair
        model={{
          changeId: "93000000-0000-4000-8000-000000000001",
          kind,
          before: {
            entryId: demoInstanceId(1),
            card: demoCard(1, "Wayfinder"),
          },
          after: {
            entryId: demoInstanceId(2),
            card: demoCard(2, "Wayfinder"),
          },
        }}
        reveal={reveal}
      />
    </div>
  );
}
export const cardChangePairDemo: CumulusComponent = {
  id: "card-change-pair",
  title: "Card Change Pair",
  blurb:
    "A resolved before-and-after card presentation for replacements, copies, Transfigurations, keyword changes, and card-type changes.",
  callout:
    "Display a completed mutation here; never ask this component to perform one.",
  details: [
    "Both entry IDs and card UUIDs remain semantic diagnostics, even when display names collide.",
  ],
  relatedSystems: ["entity-reveals"],
  group: "Card Workflows",
  docName: "CardChangePair",
  Component: Demo,
  usage: [
    { code: `<CardChangePair model={resolvedChange} reveal="complete" />` },
  ],
  demo: { defaultArgs: {} },
};
