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
import type { TangoComponent } from "../registry";

/**
 * Gates GlassDialog behind an open/close toggle so the fixed full-screen
 * overlay only covers the stage on demand. The dialog's own close disc (and the
 * toggle) return to the closed state.
 */
function GlassDialogDemo() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <GlassButton label="Open dialog" onPress={() => setOpen(true)} />
      {open && (
        <GlassDialog
          title="Starting Deck"
          subtitle="These are the cards you begin the quest with."
          onClose={() => setOpen(false)}
        >
          <p style={{ margin: 0, font: token("--t-body"), color: token("--text-primary") }}>
            The glass overlay shell holds any body content over a frosted
            backdrop — a card grid, a form, a summary. On desktop it is a
            bounded, centered panel; below the desktop breakpoint it goes
            full-bleed, its header clearing the device cutout.
          </p>
        </GlassDialog>
      )}
    </>
  );
}

export const glassDialogDemo: TangoComponent = {
  id: "glass-dialog",
  title: "Glass Dialog",
  blurb:
    "The glass overlay shell: a modal dialog that frosts the scene behind it — a bounded, centered glass panel on desktop and a full-bleed frosted overlay on mobile, with a hairline-closed header (title, optional subtitle, and a glass close disc) over a scrolling body. Its companion GlassBackdrop is the frosted layer alone, for a screen that wants the frost without the dialog chrome.",
  callout:
    "The close disc is the shared IconButton at size `md`, and the close placement is internal — a later cutout-aware placement is an additive, non-breaking extension.",
  status: "incubating",
  group: "Components",
  docName: "GlassDialog",
  Component: GlassDialogDemo,
  usage: [
    {
      note: "A modal dialog over a frosted backdrop. `title`/`subtitle` head a hairline-closed header with a trailing glass close; the body scrolls.",
      code: `import { GlassDialog } from "src/tango/components/overlay/GlassDialog";

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
      code: `import { GlassBackdrop } from "src/tango/components/overlay/GlassDialog";

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
