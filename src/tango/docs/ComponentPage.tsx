// A single Tango component's documentation page: live demo, interactive
// controls, and the generated props table. Resolves the route id to a registry
// entry, holds the live `args` state (seeded from the entry's defaultArgs), and
// wires the ControlPanel's edits back into that state so the DemoStage
// re-renders. An unknown id renders a graceful not-found state.

import { useState } from "react";
import "./component-page.css";
import { token } from "../primitives/tokens";
import { getComponent } from "./registry";
import { hasMockup } from "./mockups/registry";
import { metasFor } from "./metadata";
import { DemoStage } from "./DemoStage";
import { ControlPanel } from "./ControlPanel";
import { PropsTable } from "./PropsTable";
import { UsageSection } from "./UsageSection";

const sectionHeadingStyle: React.CSSProperties = {
  font: token("--t-eyebrow"),
  letterSpacing: token("--tracking-eyebrow"),
  textTransform: "uppercase",
  color: token("--text-muted"),
  margin: `0 0 ${token("--space-5")}`,
};

// The page-level nav row (← Overview / View full-screen mockup →) pinned to the
// top of the viewport as the reader scrolls the tall doc page, so those exits
// are always one reach away. Opaque background + a hairline underline so the
// sections below scroll cleanly under it; a stacking context above the demo.
const stickyNavStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 30,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "baseline",
  gap: token("--space-4"),
  flexWrap: "wrap",
  padding: `${token("--space-4")} 0`,
  background: token("--bg-app"),
  borderBottom: `1px solid ${token("--border-soft")}`,
};

/**
 * A guidance admonition shown under a component's blurb — used to steer readers
 * (e.g. "prefer a higher-level component before reaching for this primitive").
 * An accent-tinted box with an info mark so it reads as advice, not chrome.
 */
function Callout({ text }: { text: string }) {
  return (
    <div
      style={{
        display: "flex",
        gap: token("--space-3"),
        marginTop: token("--space-6"),
        maxWidth: "64ch",
        padding: `${token("--space-4")} ${token("--space-5")}`,
        background: token("--accent-tint"),
        border: `1px solid ${token("--border-accent")}`,
        borderRadius: token("--radius-control"),
      }}
    >
      <i
        className="bxf bx-info-circle"
        aria-hidden="true"
        style={{ color: token("--accent-bright"), fontSize: 18, lineHeight: 1.4 }}
      />
      <p
        style={{
          margin: 0,
          font: token("--t-body-sm"),
          color: token("--text-secondary"),
        }}
      >
        {text}
      </p>
    </div>
  );
}

export function ComponentPage({ id }: { id: string }) {
  const entry = getComponent(id);
  const [args, setArgs] = useState<Record<string, unknown>>(
    () => ({ ...entry?.demo.defaultArgs }),
  );

  if (!entry) {
    return (
      <div style={{ color: token("--text-secondary") }}>
        <p>
          No Tango component is registered for <code>{id}</code>.
        </p>
        <a href="#/" style={{ color: token("--accent-bright") }}>
          Back to overview
        </a>
      </div>
    );
  }

  const metas = metasFor(entry.docName);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: token("--space-9") }}>
      <nav style={stickyNavStyle}>
        <a
          href="#/"
          style={{ font: token("--t-caption"), color: token("--text-muted") }}
        >
          ← Overview
        </a>
        {hasMockup(entry.id) && (
          <a
            href={`#/${entry.id}/mockup`}
            style={{ font: token("--t-caption"), color: token("--accent-bright") }}
          >
            View full-screen mockup →
          </a>
        )}
      </nav>

      <header>
        <h1 style={{ font: token("--t-title"), color: token("--text-primary"), margin: 0 }}>
          {entry.title}
        </h1>
        {entry.status === "incubating" && (
          <span
            style={{
              display: "inline-block",
              marginTop: token("--space-3"),
              padding: `${token("--space-1")} ${token("--space-3")}`,
              borderRadius: token("--radius-pill"),
              font: token("--t-caption"),
              color: token("--text-on-accent"),
              background: token("--accent"),
            }}
          >
            Incubating
          </span>
        )}
        <p
          style={{
            font: token("--t-lead"),
            color: token("--text-secondary"),
            margin: `${token("--space-4")} 0 0`,
            maxWidth: "64ch",
          }}
        >
          {entry.blurb}
        </p>
        {entry.callout != null && <Callout text={entry.callout} />}
      </header>

      <div className="tango-component-page__layout">
        <section>
          <h2 style={sectionHeadingStyle}>Demo</h2>
          <DemoStage
            Component={entry.Component}
            args={args}
            sampleContent={entry.demo.sampleContent}
          />
        </section>
        <section
          style={{
            padding: token("--space-6"),
            background: token("--surface-card"),
            border: `1px solid ${token("--border-soft")}`,
            borderRadius: token("--radius-control"),
          }}
        >
          <h2 style={sectionHeadingStyle}>Controls</h2>
          <ControlPanel
            metas={metas}
            args={args}
            onChange={(name, value) =>
              setArgs((prev) => ({ ...prev, [name]: value }))
            }
          />
        </section>
      </div>

      <section>
        <h2 style={sectionHeadingStyle}>Usage</h2>
        <UsageSection examples={entry.usage} />
      </section>

      <section>
        <h2 style={sectionHeadingStyle}>Props</h2>
        <PropsTable docName={entry.docName} />
      </section>
    </div>
  );
}
