import { LeaveSiteButton } from "../../components/hud/LeaveSiteButton";
import type { TangoComponent } from "../registry";

function LeaveSiteButtonDemo(args: Record<string, unknown>) {
  return (
    <div style={{ position: "relative", width: 180, height: 120 }}>
      <LeaveSiteButton
        onLeave={() => {}}
        label={typeof args.label === "string" ? args.label : "Leave site"}
        disabled={args.disabled === true}
        testId={
          typeof args.testId === "string" && args.testId !== ""
            ? args.testId
            : undefined
        }
      />
    </div>
  );
}

export const leaveSiteButtonDemo: TangoComponent = {
  id: "leave-site-button",
  title: "Leave Site Button",
  blurb:
    "The fixed top-right exit control for site screens: a danger-red square X button with consistent placement and accessible labeling.",
  group: "Components",
  docName: "LeaveSiteButton",
  Component: LeaveSiteButtonDemo,
  usage: [
    {
      code: `import { LeaveSiteButton } from "src/tango/components/hud/LeaveSiteButton";

<LeaveSiteButton onLeave={completeQuestSite} />`,
    },
  ],
  demo: {
    defaultArgs: {
      label: "Leave site",
      disabled: false,
      testId: "",
    },
  },
};
