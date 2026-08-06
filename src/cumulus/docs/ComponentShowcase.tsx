// ComponentShowcase — one component's entry in the /cumulus overview. Rather than
// a bare link the reader must click through to see anything, each catalog entry
// shows a live, fully interactive example inline: the component's full-screen
// mockup, embedded into a bounded, screen-shaped frame right on the overview.
// A header names the component and links out to its full docs page (demo +
// controls + props table) and, when one exists, its dedicated full-screen
// mockup route. Components without a mockup fall back to the plain interactive
// demo so every entry still shows something live.

import type { CSSProperties } from "react";
import { token } from "../primitives/tokens";
import type { CumulusComponent } from "./registry";
import { getMockup, hasMockup } from "./mockups/registry";
import { DemoStage, FIXED_PREVIEW_BOUNDARY_STYLE } from "./DemoStage";

const articleStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: token("--space-m"),
};

// Title on its own line, with the navigation affordances as clearly-visible
// pills directly beneath it — rather than small low-contrast text pushed to the
// far right of the title row, where they read as decorative and are easy to
// miss.
const headerStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: token("--space-s"),
};

const titleLinkStyle: CSSProperties = {
  font: token("--t-title-sm"),
  color: token("--text-primary"),
  textDecoration: "none",
  margin: 0,
};

// A one-or-two-sentence description of what the component does, sitting under
// the title so the reader knows the component's job before studying its live
// example below — in place of a caption floated over the example itself.
const blurbStyle: CSSProperties = {
  font: token("--t-body-sm"),
  color: token("--text-secondary"),
  margin: 0,
  maxWidth: "64ch",
};

const linksRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: token("--space-s"),
  flexWrap: "wrap",
};

// A base pill: bordered, padded, on a raised surface, so it plainly reads as a
// tappable control rather than incidental text.
const pillBase: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: token("--space-xs"),
  padding: `${token("--space-xs")} ${token("--space-m")}`,
  borderRadius: token("--radius-pill"),
  font: token("--t-button-sm"),
  textDecoration: "none",
  whiteSpace: "nowrap",
};

// Primary route to the docs page: an accent-tinted filled pill.
const docsLinkStyle: CSSProperties = {
  ...pillBase,
  background: token("--accent-tint"),
  border: `1px solid ${token("--border-accent")}`,
  color: token("--accent-bright"),
};

// Secondary route to the full-screen mockup: an outlined pill on a raised
// surface, so it reads as a control but sits a rung below the primary.
const mockupLinkStyle: CSSProperties = {
  ...pillBase,
  background: token("--surface-raised"),
  border: `1px solid ${token("--border-mid")}`,
  color: token("--text-secondary"),
};

// The embedded example is screen-shaped and bounded so the overview stays a
// scannable gallery. The mockup fills it at 100%×100% and clips its own bleed;
// scenes are responsive, so they compose down to this frame. The full-screen
// route is one click away for the uncropped experience.
const frameStyle: CSSProperties = {
  ...FIXED_PREVIEW_BOUNDARY_STYLE,
  width: "100%",
  height: "clamp(360px, 52vh, 500px)",
  borderRadius: token("--radius-panel"),
  border: `1px solid ${token("--border-mid")}`,
  boxShadow: token("--shadow-lg"),
  background: token("--bg-sunken"),
};

export function ComponentShowcase({
  entry,
  anchorId,
}: {
  entry: CumulusComponent;
  // DOM id the overview's table of contents scrolls to / tracks for this
  // showcase. Optional so the showcase still renders standalone without a TOC.
  anchorId?: string;
}) {
  const Mockup = getMockup(entry.id);
  return (
    <article id={anchorId} style={articleStyle}>
      <div style={headerStyle}>
        <a href={`#/${entry.id}`} style={titleLinkStyle}>
          {entry.title}
        </a>
        <p style={blurbStyle}>{entry.blurb}</p>
        <div style={linksRowStyle}>
          <a href={`#/${entry.id}`} style={docsLinkStyle}>
            Docs &amp; props →
          </a>
          {hasMockup(entry.id) && (
            <a href={`#/${entry.id}/mockup`} style={mockupLinkStyle}>
              Full-screen mockup ↗
            </a>
          )}
        </div>
      </div>

      {Mockup ? (
        <div data-cumulus-doc-preview-boundary="" style={frameStyle}>
          <Mockup />
        </div>
      ) : (
        <DemoStage
          Component={entry.Component}
          args={entry.demo.defaultArgs}
          sampleContent={entry.demo.sampleContent}
        />
      )}
    </article>
  );
}
