// Registry demo entry for GlassDialog — the glass overlay shell.
//
// GlassDialog is a fixed full-screen overlay, so rendering it permanently would
// cover the whole doc stage. Instead `Component` here is a small wrapper that
// gates the dialog behind a GlassButton open/close toggle: the stage shows the
// trigger, and clicking it mounts the real GlassDialog (title, subtitle, and a
// body paragraph) whose own close disc dismisses it. `docName` points at
// GlassDialog so the props table stays accurate to its actual API.

import { useState } from "react";
import { GlassDialog } from "../../components/overlay/GlassDialog";
import { GlassButton } from "../../components/controls/GlassButton";
import { token } from "../../primitives/tokens";
import type { CumulusComponent } from "../registry";

/**
 * Gates GlassDialog behind an open/close toggle so the fixed full-screen
 * overlay only covers the stage on demand. The dialog's own close disc (and the
 * toggle) return to the closed state.
 */
function GlassDialogDemo() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <GlassButton label="Open dialog" onPress={() => setOpen(true)} />
      {open && (
        <GlassDialog
          title="Choose a Dreamsign to Replace"
          subtitle="You can hold three dreamsigns."
          onClose={() => setOpen(false)}
        >
          <p style={{ margin: 0, font: token("--t-body"), color: token("--text-primary") }}>
            The Purge replacement flow uses this shell for its dreamsign grid
            and actions. On desktop it is bounded and centered over the scene;
            below the desktop breakpoint it fills and frosts the viewport.
          </p>
        </GlassDialog>
      )}
    </>
  );
}

export const glassDialogDemo: CumulusComponent = {
  id: "glass-dialog",
  title: "Glass Dialog",
  blurb:
    "The glass overlay shell: a modal dialog with a bounded, centered glass panel on desktop and a full-bleed frosted overlay on mobile, with a hairline-closed header (title, optional subtitle, and a glass close disc) over a scrolling body. Its companion GlassBackdrop is the frosted layer alone, for a screen that wants the frost without the dialog chrome.",
  callout:
    "Dreamsign Revelation uses this shell for its Purge replacement dialog. The close disc is the shared IconButton at size `md`. Close placement is internal: it sits on the header row by default, and `cutoutAwareClose` floats it beside a device island on a full-bleed mobile mock-up. `wide` opts into the roomy-desktop variant.",
  group: "Components",
  docName: "GlassDialog",
  Component: GlassDialogDemo,
  usage: [
    {
      note: "A modal dialog with a bounded desktop panel and a full-bleed frosted mobile overlay. `title`/`subtitle` head a hairline-closed header with a trailing glass close; the body scrolls.",
      code: `import { GlassDialog } from "src/cumulus/components/overlay/GlassDialog";

<GlassDialog
  title="Starting Deck"
  subtitle="These are the cards you begin the quest with."
  onClose={closeModal}
>
  <DeckGrid entries={entries} />
</GlassDialog>`,
    },
    {
      label: "Backdrop only",
      note: "GlassBackdrop is the frosted layer alone — an absolute z0 sibling of a screen's content, so sibling controls frost the raw scene instead of double-frosting an ancestor glass surface.",
      code: `import { GlassBackdrop } from "src/cumulus/components/overlay/GlassDialog";

<div style={{ position: "relative" }}>
  <GlassBackdrop />
  {/* content lifted above the frost */}
</div>`,
    },
  ],
  demo: {
    defaultArgs: {},
  },
};
