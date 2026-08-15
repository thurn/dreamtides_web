import { useState } from "react";
import { assertLocalized } from "@trox/runtime";
import { parseDreamwellCardId } from "../../../types/identifiers";
import {
  BattleForeseeEditor,
  type BattleForeseeResult,
} from "../../components/battle/BattleForeseeEditor";
import { demoCard, demoIdentitySeed } from "./promotion-fixtures";
import type { CumulusComponent } from "../registry";
import { DemoControls, DemoToggle } from "./promotion-demo-controls";
import { parseBattleCardId } from "../../../types/identifiers";

const sourceId = parseDreamwellCardId("f9b479cf-02cb-40e1-bb64-70b29977bf15");
const source = {
  cardId: sourceId,
  displaySnapshot: {
    id: sourceId,
    name: assertLocalized("Skypath"),
    renderedText: assertLocalized("Foresee 1."),
    energyAdded: 1,
    imageNumber: 1897537165,
  },
};
function Demo() {
  const [result, setResult] = useState<BattleForeseeResult | null>(null);
  const [showSource, setShowSource] = useState(true);
  return (
    <div style={{ width: "100%", maxWidth: 980, display: "grid", gap: 12 }}>
      <DemoControls>
        <DemoToggle
          label="Dreamwell source"
          checked={showSource}
          onChange={setShowSource}
        />
      </DemoControls>
      <BattleForeseeEditor
        model={{
          initialCount: 2,
          allowedCounts: [1, 2, 3],
          cards: [1, 2, 3].map((index) => ({
            battleCardId: parseBattleCardId(demoIdentitySeed(index)),
            card: demoCard(index),
          })),
          ...(showSource ? { source } : {}),
        }}
        onConfirm={setResult}
      />
      <div>
        <strong>Latest committed complete result</strong>
        <pre>{JSON.stringify(result, null, 2)}</pre>
      </div>
    </div>
  );
}
export const battleForeseeEditorDemo: CumulusComponent = {
  id: "battle-foresee-editor",
  title: "Battle Foresee Editor",
  blurb:
    "A commit-gated local editor for a prepared deck prefix, count choices, deck order, and Void partition.",
  callout:
    "Supply allowed counts and battle-instance IDs; apply the emitted complete result in battle state.",
  details: [
    "Pointer capture and keyboard controls edit the same staged result without mutating input arrays.",
  ],
  group: "Battle",
  docName: "BattleForeseeEditor",
  Component: Demo,
  usage: [
    {
      code: `<BattleForeseeEditor model={preparedForesee} onConfirm={commitResult} />`,
    },
  ],
  demo: { defaultArgs: {} },
};
