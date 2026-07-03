// ComponentShowcase — one component's entry in the /tango overview. Rather than
// a bare link the reader must click through to see anything, each catalog entry
// shows a live, fully interactive example inline: the component's full-screen
// mockup, embedded into a bounded, screen-shaped frame right on the overview.
// A header names the component and links out to its full docs page (demo +
// controls + props table) and, when one exists, its dedicated full-screen
// mockup route. Components without a mockup fall back to the plain interactive
// demo so every entry still shows something live.

import type { CSSProperties } from "react";
import { token } from "../primitives/tokens";
import type { TangoComponent } from "./registry";
import { getMockup, hasMockup } from "./mockups/registry";
import { DemoStage } from "./DemoStage";

const articleStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: token("--space-4"),
};

const headerRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  justifyContent: "space-between",
  gap: token("--space-4"),
  flexWrap: "wrap",
};

const titleLinkStyle: CSSProperties = {
  font: token("--t-title-sm"),
  color: token("--text-primary"),
  textDecoration: "none",
  margin: 0,
};

const linksRowStyle: CSSProperties = {
  display: "flex",
  alignItems: "baseline",
  gap: token("--space-5"),
  flexWrap: "wrap",
};

const docsLinkStyle: CSSProperties = {
  font: token("--t-caption"),
  color: token("--text-muted"),
  textDecoration: "none",
};

const mockupLinkStyle: CSSProperties = {
  font: token("--t-caption"),
  color: token("--accent-bright"),
  textDecoration: "none",
};

// The embedded example is screen-shaped and bounded so the overview stays a
// scannable gallery. The mockup fills it at 100%×100% and clips its own bleed;
// scenes are responsive, so they compose down to this frame. The full-screen
// route is one click away for the uncropped experience.
const frameStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  height: "clamp(360px, 52vh, 500px)",
  borderRadius: token("--radius-panel"),
  overflow: "hidden",
  border: `1px solid ${token("--border-mid")}`,
  boxShadow: token("--shadow-lg"),
  background: token("--bg-sunken"),
};

export function ComponentShowcase({ entry }: { entry: TangoComponent }) {
  const Mockup = getMockup(entry.id);
  return (
    <article style={articleStyle}>
      <div style={headerRowStyle}>
        <a href={`#/${entry.id}`} style={titleLinkStyle}>
          {entry.title}
        </a>
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
        <div style={frameStyle}>
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
