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

const sectionHeadingStyle: React.CSSProperties = {
  font: token("--t-eyebrow"),
  letterSpacing: token("--tracking-eyebrow"),
  textTransform: "uppercase",
  color: token("--text-muted"),
  margin: `0 0 ${token("--space-5")}`,
};

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
      <header>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            gap: token("--space-4"),
            flexWrap: "wrap",
          }}
        >
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
        </div>
        <h1 style={{ font: token("--t-title"), color: token("--text-primary"), margin: `${token("--space-4")} 0 0` }}>
          {entry.title}
        </h1>
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
        <h2 style={sectionHeadingStyle}>Props</h2>
        <PropsTable docName={entry.docName} />
      </section>
    </div>
  );
}
