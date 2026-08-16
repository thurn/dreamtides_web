import { useState } from "react";
import { assertLocalized, opaque, txa } from "@trox/runtime";
import { ExplorationChoice } from "../../components/controls/ExplorationChoice";
import { richText } from "../../components/card/rich-text";
import type { CumulusComponent } from "../registry";
import {
  demoCard,
  demoDreamsign,
  demoIdentitySeed,
} from "./promotion-fixtures";
import { DemoControls, DemoLog, DemoSelect } from "./promotion-demo-controls";
import { parseDeckEntryId } from "../../../types/identifiers";
import { parseExplorationActionId } from "../../../types/identifiers";
const previewCard = demoCard(1);
const cardEntity = {
  kind: "card" as const,
  id: previewCard.cardId,
  entryId: parseDeckEntryId(demoIdentitySeed(1)),
  card: previewCard,
};
const dreamsign = demoDreamsign(1);
const dreamsignEntity = {
  kind: "dreamsign" as const,
  id: dreamsign.id,
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
  const annotatedEntity =
    variant === "dreamsign-preview" ? dreamsignEntity : cardEntity;
  const annotatedName =
    variant === "dreamsign-preview"
      ? dreamsign.name
      : assertLocalized(previewCard.displaySnapshot.name);
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
              ? richText.rules(
                  assertLocalized(
                    "Continue carefully through the long luminous passage.",
                  ),
                )
              : richText.annotated(
                  txa(
                    "Study {entity} and draw 1 card. Then remember {entity}",
                    { entity: opaque(annotatedName) },
                    "[exploration] Demonstration choice effect with the same revealable entity referenced twice. entity is the proper name of a card or Dreamsign.",
                  ).annotate({ entity: annotatedEntity }),
                ),
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
    "Builders attach reveal entities to lazy localized placeholders; the component distinguishes quick activation from hold-to-read.",
  details: [
    "Unavailable choices stay readable, keyboard activation emits the action ID, and underlined entity names remain presentation inside the full-cell target.",
    "Translators control placeholder order and repetition; the component resolves structured runs only at its final rendering boundary.",
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
