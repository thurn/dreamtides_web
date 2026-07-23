// Registry demo entry for DreamcallerPortrait — the highest-adoption workhorse
// in the catalog. The component takes only primitives plus a `dreamcaller`
// object slot, so the demo's `Component` is a showcase wrapper that renders the
// framings side by side against one real DreamcallerVisual (curated
// `imageNumber` + name/title; cutout art resolves from `public/`). `dreamcaller`
// is a ReactNode-free object prop seeded via `sampleContent`; `docName` still
// points at DreamcallerPortrait so the props table reports its actual API.

import type { ReactNode } from "react";
import { DreamcallerPortrait } from "../../components/hud/DreamcallerPortrait";
import type { DreamcallerVisual } from "../../components/hud/DreamcallerPortrait";
import { token } from "../../primitives/tokens";
import type { CumulusComponent } from "../registry";

/** Curated real dreamcaller: cutout art ships at public/dreamcallers/cutout/0025.png. */
const sampleDreamcaller: DreamcallerVisual = {
  imageNumber: "0025",
  name: "Threxan",
  title: "the Resounding Wrath",
};

/** One labeled cell in the showcase grid. */
function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: token("--space-3"),
      }}
    >
      {children}
      <span
        style={{
          fontSize: 12,
          color: token("--text-secondary"),
          fontFamily: "monospace",
        }}
      >
        {label}
      </span>
    </div>
  );
}

/** A `position: relative` stage so the full-bleed variants (which fill their
 * caller's stage) have a box to paint into. Carries the `.cumulus` token scope. */
function Stage({
  width,
  height,
  children,
}: {
  width: number;
  height: number;
  children: ReactNode;
}) {
  return (
    <div
      className="cumulus"
      style={{
        position: "relative",
        width,
        height,
        overflow: "hidden",
        borderRadius: token("--radius-panel"),
        border: `1px solid ${token("--border-mid")}`,
        background: token("--bg-sunken"),
      }}
    >
      {children}
    </div>
  );
}

/**
 * Renders all six DreamcallerPortrait framings against one real dreamcaller:
 * the self-framing `hero` / `panel` / `thumb`, and the two full-bleed stage
 * fills `standing` / `fullBleed` each mounted in a `position: relative` stage.
 */
function DreamcallerPortraitDemo(args: Record<string, unknown>) {
  const dreamcaller = args.dreamcaller as DreamcallerVisual;
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "flex-end",
        justifyContent: "center",
        gap: token("--space-8"),
      }}
    >
      <Cell label="hero">
        <div style={{ width: 220 }}>
          <DreamcallerPortrait dreamcaller={dreamcaller} variant="hero" />
        </div>
      </Cell>
      <Cell label="panel · size 120">
        <DreamcallerPortrait dreamcaller={dreamcaller} variant="panel" size={120} />
      </Cell>
      <Cell label="thumb · size 56">
        <DreamcallerPortrait dreamcaller={dreamcaller} variant="thumb" size={56} />
      </Cell>
      <Cell label="standing">
        <Stage width={150} height={230}>
          <DreamcallerPortrait dreamcaller={dreamcaller} variant="standing" />
        </Stage>
      </Cell>
      <Cell label="cutout">
        <Stage width={150} height={230}>
          <DreamcallerPortrait dreamcaller={dreamcaller} variant="cutout" />
        </Stage>
      </Cell>
      <Cell label="fullBleed">
        <Stage width={150} height={230}>
          <DreamcallerPortrait dreamcaller={dreamcaller} variant="fullBleed" />
        </Stage>
      </Cell>
    </div>
  );
}

export const dreamcallerPortraitDemo: CumulusComponent = {
  id: "dreamcaller-portrait",
  title: "Dreamcaller Portrait",
  blurb:
    "The shared framed and stage-filling Dreamcaller art surface: the transparent full-body cutout in one of six fixed framings. Three are self-framing over an opaque tinted backing — a large `hero` showcase, a square `panel` for profile cards and popovers, and a small square `thumb` for HUD rows and resident lists. Three fill a caller's own stage — `standing` adds the desktop Dreamcaller-select glow, `cutout` leaves the scene beneath it untouched, and `fullBleed` creates the mobile carousel showcase. The frame chrome and the per-variant crop belong to the design system; a caller supplies only the dreamcaller data, the variant, and an optional pixel `size`. When the art asset 404s the portrait falls back to a monogram so a missing image never leaves an empty hole.",
  callout:
    "There is no style or className escape hatch. To size the portrait pass a fixed pixel `size` — a sized portrait then refuses to shrink in a flex row — or omit `size` to fill the container width. The `standing`, `cutout`, and `fullBleed` variants ignore `size` and fill the caller's `position: relative` stage. Choose `cutout` when scene art must remain visually unchanged. For any other layout, wrap the portrait in your own element.",
  group: "Components",
  docName: "DreamcallerPortrait",
  Component: DreamcallerPortraitDemo,
  usage: [
    {
      label: "Hero showcase",
      note: "The large framing. Omit `size` to fill the container, or pass a pixel `size` to fix its width.",
      code: `import { DreamcallerPortrait } from "src/cumulus/components/hud/DreamcallerPortrait";

<DreamcallerPortrait dreamcaller={dreamcaller} variant="hero" />`,
    },
    {
      label: "Panel in a profile card",
      note: "The square framing for profile cards and popovers. A pixel `size` keeps it square and stops it shrinking in a flex row.",
      code: `<DreamcallerPortrait
  dreamcaller={dreamcaller}
  variant="panel"
  size={160}
/>`,
    },
    {
      label: "Thumb in a HUD row",
      note: "The small square framing for HUD rows and resident lists.",
      code: `<DreamcallerPortrait
  dreamcaller={dreamcaller}
  variant="thumb"
  size={56}
/>`,
    },
    {
      label: "Full-bleed stage fill",
      note: "`standing`, `cutout`, and `fullBleed` paint edge to edge over the caller's own relative-positioned stage; `cutout` adds no backdrop treatment.",
      code: `<div style={{ position: "relative", width: 320, height: 480 }}>
  <DreamcallerPortrait dreamcaller={dreamcaller} variant="standing" />
</div>`,
    },
  ],
  demo: {
    defaultArgs: {
      variant: "panel",
      size: 160,
    },
    sampleContent: {
      dreamcaller: sampleDreamcaller,
    },
  },
};
