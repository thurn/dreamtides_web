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
import type { TangoComponent } from "../registry";

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
 * caller's stage) have a box to paint into. Carries the `.tango` token scope. */
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
      className="tango"
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
 * Renders all five DreamcallerPortrait framings against one real dreamcaller:
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
      <Cell label="fullBleed">
        <Stage width={150} height={230}>
          <DreamcallerPortrait dreamcaller={dreamcaller} variant="fullBleed" />
        </Stage>
      </Cell>
    </div>
  );
}

export const dreamcallerPortraitDemo: TangoComponent = {
  id: "dreamcaller-portrait",
  title: "Dreamcaller Portrait",
  blurb:
    "The one way to render a dreamcaller's character art: the transparent full-body cutout standing on a tinted radial backdrop, in one of five fixed framings. Three are self-framing — a large `hero` showcase, a square `panel` for profile cards and popovers, and a small square `thumb` for HUD rows and resident lists. Two are full-bleed fills that paint edge to edge over a caller's own stage — `standing` for the desktop Dreamcaller-select column and `fullBleed` for the mobile carousel page. The frame chrome and the per-variant crop belong to the design system; a caller supplies only the dreamcaller data, the variant, and an optional pixel `size`. When the art asset 404s the portrait falls back to a tinted monogram disc so a missing image never leaves an empty hole.",
  callout:
    "There is no style or className escape hatch. To size the portrait pass a fixed pixel `size` — a sized portrait then refuses to shrink in a flex row — or omit `size` to fill the container width. The `standing` and `fullBleed` variants ignore `size` and fill the caller's `position: relative` stage. For any other layout (margins, a decorative glow), wrap the portrait in your own element.",
  group: "Components",
  docName: "DreamcallerPortrait",
  Component: DreamcallerPortraitDemo,
  usage: [
    {
      label: "Hero showcase",
      note: "The large framing. Omit `size` to fill the container, or pass a pixel `size` to fix its width.",
      code: `import { DreamcallerPortrait } from "src/tango/components/hud/DreamcallerPortrait";

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
      note: "`standing` (desktop column) and `fullBleed` (mobile carousel) paint edge to edge over the caller's own relative-positioned stage; they ignore `size`.",
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
