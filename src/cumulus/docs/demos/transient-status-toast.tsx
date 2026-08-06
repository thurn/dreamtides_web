import { TransientStatusToast } from "../../components/status/TransientStatusToast";
import type { CumulusComponent } from "../registry";

function TransientStatusToastDemo() {
  return <TransientStatusToast copy={{ title: "Action Not Applied", message: "Try again when the game is ready." }} onDismiss={() => undefined} />;
}

export const transientStatusToastDemo: CumulusComponent = {
  id: "transient-status-toast",
  title: "Transient Status Toast",
  blurb: "The fixed, safe-area-aware short-lived warning surface for structured player-facing status copy.",
  callout: "Keep lifecycle and auto-dismiss timing in the controller; this component owns only transient presentation and optional tap dismissal.",
  group: "Components",
  docName: "TransientStatusToast",
  Component: TransientStatusToastDemo,
  usage: [{ code: `import { TransientStatusToast } from "src/cumulus/components/status/TransientStatusToast";

<TransientStatusToast
  copy={{ message: "Action not applied. Try again." }}
  onDismiss={dismiss}
/>` }],
  demo: { defaultArgs: {} },
};
