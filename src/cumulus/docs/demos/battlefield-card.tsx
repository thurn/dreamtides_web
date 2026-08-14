import { useState } from "react";
import { BattlefieldCard } from "../../components/battle/BattlefieldCard";
import type { GameCardSelection } from "../../components/card/CardView";
import { demoCard, demoInstanceId } from "./promotion-fixtures";
import type { CumulusComponent } from "../registry";
import {
  DemoControls,
  DemoLog,
  DemoSelect,
  DemoToggle,
} from "./promotion-demo-controls";
function Demo() {
  const [last, setLast] = useState("No intent yet");
  const [interaction, setInteraction] = useState<
    "passive" | "pressable" | "draggable"
  >("draggable");
  const [selection, setSelection] = useState<"none" | GameCardSelection>(
    "playable",
  );
  const [exhausted, setExhausted] = useState(false);
  const [figment, setFigment] = useState(false);
  const [challenge, setChallenge] = useState(true);
  const [score, setScore] = useState(false);
  const interactionModel =
    interaction === "passive"
      ? ({ kind: "passive" } as const)
      : interaction === "pressable"
        ? ({
            kind: "pressable" as const,
            onPress: (id: string) => setLast(`press ${id}`),
          } as const)
        : ({
            kind: "draggable" as const,
            onPress: (id: string) => setLast(`press ${id}`),
            onDragStart: (id: string) => setLast(`drag-start ${id}`),
            onDragEnd: (id: string) => setLast(`drag-end ${id}`),
            onDrop: (drop: { readonly battleCardId: string }) =>
              setLast(`drop ${drop.battleCardId}`),
          } as const);
  return (
    <div style={{ display: "grid", gap: 12, justifyItems: "center" }}>
      <DemoControls>
        <DemoSelect
          label="Interaction"
          value={interaction}
          values={["passive", "pressable", "draggable"]}
          onChange={(value) =>
            setInteraction(value as "passive" | "pressable" | "draggable")
          }
        />
        <DemoSelect
          label="Selection"
          value={selection}
          values={["none", "selected", "playable", "danger", "figment"]}
          onChange={(value) => setSelection(value as typeof selection)}
        />
        <DemoToggle
          label="Exhausted"
          checked={exhausted}
          onChange={setExhausted}
        />
        <DemoToggle label="Figment" checked={figment} onChange={setFigment} />
        <DemoToggle
          label="Challenge"
          checked={challenge}
          onChange={setChallenge}
        />
        <DemoToggle label="Score +3" checked={score} onChange={setScore} />
      </DemoControls>
      <div style={{ width: 190 }}>
        <BattlefieldCard
          model={{
            battleCardId: demoInstanceId(1),
            card: demoCard(1, "Wayfinder"),
            exhausted,
            storedMemory: 2,
            figment,
            ...(selection === "none" ? {} : { selection }),
            ...(challenge
              ? {
                  challengeMarker: {
                    owner: "player" as const,
                    side: "near" as const,
                  },
                }
              : {}),
            ...(score
              ? {
                  scoreAnnouncement: {
                    points: 3,
                    presentationId: "demo-score-3",
                  },
                }
              : {}),
            motion: "snap",
            presentation: "battlefield",
          }}
          interaction={interactionModel}
        />
      </div>
      <DemoLog>Intent: {last}</DemoLog>
    </div>
  );
}
export const battlefieldCardDemo: CumulusComponent = {
  id: "battlefield-card",
  title: "Battlefield Card",
  blurb:
    "The complete face-up battle-instance presentation for exhaustion, memory, figments, selection, challenge markers, score announcements, press, and pointer drag.",
  callout:
    "The board owns legality and drop geometry; this component emits semantic battle-instance intent.",
  details: [
    "Passive, pressable, and draggable variants form a closed interaction union while GameCard remains the reveal owner.",
    "The caller owns board geometry and battle legality; quick press and deliberate drag report only battle-instance intent.",
  ],
  relatedSystems: ["entity-reveals"],
  group: "Battle",
  docName: "BattlefieldCard",
  Component: Demo,
  usage: [
    {
      code: `<BattlefieldCard model={preparedCard} interaction={{ kind: "pressable", onPress }} />`,
    },
  ],
  demo: { defaultArgs: {} },
};
