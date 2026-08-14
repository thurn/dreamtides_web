import { useState } from "react";
import { ViewportTutorialDialogue } from "../../components/overlay/ViewportTutorialDialogue";
import {
  useTutorialAnchor,
  useTutorialObstacle,
} from "../../components/overlay/tutorial-placement";
import { GameCard } from "../../components/card/CardView";
import { demoDialogue } from "./promotion-fixtures";
import { demoCard } from "./promotion-fixtures";
import type { CumulusComponent } from "../registry";
import {
  DemoControls,
  DemoSelect,
  DemoToggle,
} from "./promotion-demo-controls";
function Demo() {
  const [placement, setPlacement] = useState<"floating" | "anchored">(
    "floating",
  );
  const [context, setContext] = useState<"battle" | "card" | "site">("card");
  const [visible, setVisible] = useState(true);
  const [obstacles, setObstacles] = useState<"open" | "crowded" | "shifted">(
    "crowded",
  );
  const anchorRef = useTutorialAnchor("demo-site-anchor");
  const cardRef = useTutorialObstacle("demo-card", "card");
  const chromeRef = useTutorialObstacle("demo-chrome", "chrome");
  return (
    <div style={{ width: "100%", maxWidth: 760, display: "grid", gap: 12 }}>
      <DemoControls>
        <DemoSelect
          label="Placement"
          value={placement}
          values={["floating", "anchored"]}
          onChange={(value) => setPlacement(value as "floating" | "anchored")}
        />
        <DemoSelect
          label="Context"
          value={context}
          values={["battle", "card", "site"]}
          onChange={(value) => setContext(value as typeof context)}
        />
        <DemoSelect
          label="Obstacles"
          value={obstacles}
          values={["open", "crowded", "shifted"]}
          onChange={(value) => setObstacles(value as typeof obstacles)}
        />
        <DemoToggle label="Visible" checked={visible} onChange={setVisible} />
      </DemoControls>
      <div
        data-demo-tutorial-stage=""
        style={{
          width: "100%",
          height: 420,
          position: "relative",
          transform: "translateZ(0)",
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,.3)",
          borderRadius: 16,
        }}
      >
        <div
          ref={anchorRef}
          style={{
            position: "absolute",
            left: "40%",
            bottom: 24,
            width: 180,
            height: 44,
            display: "grid",
            placeItems: "center",
            background: "rgba(115, 91, 170, .8)",
            borderRadius: 10,
          }}
        >
          Registered site anchor
        </div>
        {obstacles !== "open" && (
          <div
            ref={cardRef}
            style={{
              position: "absolute",
              width: 150,
              left: obstacles === "shifted" ? "62%" : "16%",
              top: obstacles === "shifted" ? 90 : 120,
            }}
          >
            <GameCard model={demoCard(1, "Registered obstacle")} />
          </div>
        )}
        {obstacles === "crowded" && (
          <div
            ref={chromeRef}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 64,
              display: "grid",
              placeItems: "center",
              background: "rgba(22, 17, 44, .94)",
            }}
          >
            Registered chrome obstacle
          </div>
        )}
      </div>
      <ViewportTutorialDialogue
        presentationId="demo-tutorial"
        dialogue={demoDialogue}
        context={context}
        placement={
          placement === "floating"
            ? { kind: "floating", avoidance: "cards-and-chrome" }
            : { kind: "anchored", anchorId: "demo-site-anchor" }
        }
        visible={visible}
        diagnostics={{ triggerId: "demo", messageIndex: 0 }}
      />
    </div>
  );
}
export const viewportTutorialDialogueDemo: CumulusComponent = {
  id: "viewport-tutorial-dialogue",
  title: "Viewport Tutorial Dialogue",
  blurb:
    "A measured CharacterDialogue surface placed from registered semantic anchors and obstacles within viewport safe space.",
  callout:
    "Hosts register placement geometry; tutorial state owns sequencing and visibility.",
  details: [
    "Floating and anchored preferences consume only the Tutorial Dialogue Placement coordinator snapshot.",
  ],
  relatedSystems: ["tutorial-dialogue-placement"],
  group: "Overlays",
  docName: "ViewportTutorialDialogue",
  Component: Demo,
  usage: [
    {
      code: `<ViewportTutorialDialogue presentationId={id} dialogue={dialogue} context="card" placement={{ kind: "floating", avoidance: "cards-and-chrome" }} visible />`,
    },
  ],
  demo: { defaultArgs: {} },
};
