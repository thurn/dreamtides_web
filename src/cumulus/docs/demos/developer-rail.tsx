import { DeveloperRail } from "../../components/overlay/DeveloperRail";
import { token } from "../../primitives/tokens";
import type { CumulusComponent } from "../registry";

function Demo({ title = "Tutorial Editor", subtitle = "1 action" }: { title?: string; subtitle?: string }) {
  return (
    <div style={{ width: 380, height: 560 }}>
      <DeveloperRail id="demo-developer-rail" title={title} subtitle={subtitle} side="left" onClose={() => undefined}>
        <p style={{ margin: 0, color: token("--text-on-glass"), font: token("--t-body") }}>
          Developer tool content scrolls inside the edge rail.
        </p>
      </DeveloperRail>
    </div>
  );
}

export const developerRailDemo: CumulusComponent = {
  id: "developer-rail",
  title: "Developer Rail",
  blurb: "The shared edge-attached shell for persistent developer tools, with canonical glass, header hierarchy, close action, scrolling body, and optional footer.",
  callout: "Use this shell for docked developer tools; the parent screen owns the rail track and responsive takeover behavior.",
  group: "Components",
  docName: "DeveloperRail",
  Component: Demo,
  usage: [
    {
      code: `<DeveloperRail id="tutorial-editor" title="Tutorial Editor" side="left" onClose={close}>\n  <TutorialEditorContent />\n</DeveloperRail>`,
    },
  ],
  demo: { defaultArgs: { title: "Tutorial Editor", subtitle: "1 action" } },
};
