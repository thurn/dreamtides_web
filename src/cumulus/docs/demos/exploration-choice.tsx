import { useState } from "react";
import { assertLocalized } from "@trox/runtime";
import { ExplorationChoice } from "../../components/controls/ExplorationChoice";
import type { CumulusComponent } from "../registry";
import { demoCard, demoDreamsign, demoIdentitySeed } from "./promotion-fixtures";
import { DemoControls, DemoLog, DemoSelect } from "./promotion-demo-controls";
import { parseDeckEntryId } from "../../../types/identifiers";
import { parseExplorationActionId } from "../../../types/identifiers";
import { parseCardId } from "../../../types/card-identity";
const cardEntity = {
  kind: "card" as const,
  id: parseCardId("90000000-0000-4000-8000-000000000001"),
  entryId: parseDeckEntryId(demoIdentitySeed(1)),
  label: assertLocalized("Wayfinder"),
  card: demoCard(1, "Wayfinder"),
};
const dreamsign = demoDreamsign(1);
const dreamsignEntity = {
  kind: "dreamsign" as const,
  id: dreamsign.id,
  label: dreamsign.name,
  dreamsign,
};
function Demo() {
  const [variant, setVariant] = useState<
    "plain" | "card-preview" | "dreamsign-preview" | "unavailable"
  >("card-preview");
  const [last, setLast] = useState("No activation yet");
  const preview =
    variant === "card-preview"
      ? cardEntity
      : variant === "dreamsign-preview"
        ? dreamsignEntity
        : undefined;
  return (
    <div style={{ width: "100%", maxWidth: 620, display: "grid", gap: 12 }}>
      <DemoControls>
        <DemoSelect
          label="Variant"
          value={variant}
          values={["plain", "card-preview", "dreamsign-preview", "unavailable"]}
          onChange={(value) =>
            setVariant(
              value as
                "plain" | "card-preview" | "dreamsign-preview" | "unavailable",
            )
          }
        />
      </DemoControls>
      <ExplorationChoice
        model={{
          actionId: parseExplorationActionId(
            "94000000-0000-4000-8000-000000000001",
          ),
          label: assertLocalized("Follow the signal"),
          description:
            variant === "plain"
              ? [
                  {
                    kind: "text",
                    value: assertLocalized(
                      "Continue carefully through the long luminous passage.",
                    ),
                  },
                ]
              : [
                  { kind: "text", value: assertLocalized("Study ") },
                  {
                    kind: "entity",
                    entity:
                      variant === "dreamsign-preview"
                        ? dreamsignEntity
                        : cardEntity,
                  },
                  {
                    kind: "rules",
                    value: assertLocalized(" and draw 1 card."),
                  },
                  { kind: "text", value: assertLocalized(" Then remember ") },
                  {
                    kind: "entity",
                    entity:
                      variant === "dreamsign-preview"
                        ? dreamsignEntity
                        : cardEntity,
                  },
                ],
          availability: variant === "unavailable" ? "unavailable" : "available",
          preview: preview,
        }}
        onPress={setLast}
      />
      <small>
        Quick click, tap, or keyboard activation chooses. Focus or touch-hold
        reveals the prepared entity without choosing.
      </small>
      <DemoLog>Last action UUID: {last}</DemoLog>
    </div>
  );
}
export const explorationChoiceDemo: CumulusComponent = {
  id: "exploration-choice",
  title: "Exploration Choice",
  blurb:
    "A reveal-aware semantic action whose ordered description can mix localized text, rules, and UUID-backed entities.",
  callout:
    "Builders prepare authored part order; the component distinguishes quick activation from hold-to-read.",
  details: [
    "Unavailable choices stay readable, keyboard activation emits the action ID, and inline entities keep their own reveal identity.",
    "Builders prepare the ordered text, rules, and entity parts before rendering; the component performs no placeholder search.",
  ],
  relatedSystems: ["entity-reveals"],
  group: "Actions & Inputs",
  docName: "ExplorationChoice",
  Component: Demo,
  usage: [
    {
      code: `<ExplorationChoice model={preparedChoice} onPress={resolveActionId} />`,
    },
  ],
  demo: { defaultArgs: {} },
};
