// Registry demo entry for GlassDialog — the glass overlay shell.
//
// GlassDialog is a fixed full-screen overlay, so rendering it permanently would
// cover the whole doc stage. Instead `Component` here is a small wrapper that
// gates the dialog behind a GlassButton open/close toggle: the stage shows the
// trigger, and clicking it mounts the real GlassDialog (title, subtitle, and a
// body paragraph) whose own close disc dismisses it. `docName` points at
// GlassDialog so the props table stays accurate to its actual API.

import { assertLocalized } from "@trox/runtime";
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
      <GlassButton
        label={assertLocalized("Open dialog")}
        onPress={() => setOpen(true)}
      />
      {open && (
        <GlassDialog
          title={assertLocalized("Choose a Dreamsign to Replace")}
          subtitle={assertLocalized("You can hold three dreamsigns.")}
          onClose={() => setOpen(false)}
        >
          <p
            style={{
              margin: 0,
              font: token("--t-body"),
              color: token("--text-primary"),
            }}
          >
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
    "The glass overlay shell: a modal dialog with a bounded desktop panel and a full-bleed mobile overlay by default, plus centered content-sized and companion-paired popup presentations. Standard chrome places the title, optional subtitle, and close disc in a hairline-closed header; flowing chrome floats the close disc in prose flow. Its companion GlassBackdrop is the frosted layer alone, for a screen that wants the frost without the dialog chrome.",
  callout:
    "Dreamsign Revelation uses this shell for its Purge replacement dialog.",
  details: [
    'Pass `onClose` for the shared close disc, or omit it when one explicit commit action must own completion. Use `presentation="popup"` for a bounded content-sized surface on both desktop and mobile.',
    'Add `companion` when one tangible object should lead a popup pair: the object sits left of a wider prose panel on desktop and centered above it on mobile. `chrome="flowing-close"` places the close disc in body flow so ordinary prose wraps around it.',
    'Close placement is internal: it sits on the header row by default, and `cutoutAwareClose` floats it beside a device island on a full-bleed mobile mock-up. Battle overlays use `desktopCenterTarget="battlefield"` so a docked inspector rail stays outside the panel\'s centering region.',
  ],
  group: "Surfaces & Overlays",
  docName: "GlassDialog",
  Component: GlassDialogDemo,
  usage: [
    {
      note: "A modal dialog with a bounded desktop panel and a full-bleed frosted mobile overlay. `title`/`subtitle` head a hairline-closed header with a trailing glass close; the body scrolls.",
      code: `import { GlassDialog } from "src/cumulus/components/overlay/GlassDialog";

<GlassDialog
  title={assertLocalized("Starting Deck")}
  subtitle={assertLocalized("These are the cards you begin the journey with.")}
  onClose={closeModal}
>
  <DeckGrid entries={entries} />
</GlassDialog>`,
    },
    {
      label: "Commit gated",
      note: "Omit `onClose` when the dialog must expose only its explicit commit action. The header remains and no dismissal control is rendered.",
      code: `<GlassDialog title={assertLocalized("Foresee 2")} desktopCenterTarget="battlefield">
  <ForeseeOrder />
  <GlassButton label={assertLocalized("Confirm")} variant="accent" placement="onGlass" onPress={confirm} />
</GlassDialog>`,
    },
    {
      label: "Content-sized popup",
      note: "Use the popup presentation for compact guidance or confirmation copy that should remain a centered glass window on mobile as well as desktop.",
      code: `<GlassDialog title={assertLocalized("How to Play")} presentation="popup" onClose={closeGuide}>
  <HowToPlayCopy />
</GlassDialog>`,
    },
    {
      label: "Flowing prose close",
      note: "Use flowing-close chrome for titleless prose whose opening lines should wrap around the close disc and then regain the full content measure.",
      code: `<GlassDialog title={assertLocalized("How to Play")} presentation="popup" chrome="flowing-close" onClose={closeGuide}>
  <HowToPlayCopy />
</GlassDialog>`,
    },
    {
      label: "Companion popup",
      note: "Pair one tangible object with a prose popup. The complete pair is centered horizontally on desktop and stacks object-first on mobile.",
      code: `<GlassDialog
  title={assertLocalized("How to Play")}
  presentation="popup"
  companion={<DreamwellCard model={dreamwell} />}
  onClose={closeGuide}
>
  <HowToPlayCopy />
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
    stage: "viewport",
  },
};
