// Standalone documentation endpoint for the Tango design system, reachable at
// `/tango` (see the route branch in `src/main.tsx`). Switches on the hash route
// (see route.ts) between the overview table of contents, a component's doc page,
// and a component's full-screen mockup placeholder (the real mockups land in
// Task 6.3). The chrome is styled lightly with Tango tokens — dogfooding the
// design system it documents.
import "../primitives/tango-tokens.css";
import "../assets/phosphor.css";

import type { CSSProperties } from "react";
import { useTangoRoute } from "./route";
import { TANGO_COMPONENTS, type TangoComponent } from "./registry";
import { ComponentPage } from "./ComponentPage";
import { token } from "../primitives/tokens";

const pageStyle: CSSProperties = {
  minHeight: "100vh",
  background: token("--bg-app"),
  color: token("--text-primary"),
  fontFamily: token("--font-sans"),
  padding: token("--space-9"),
  boxSizing: "border-box",
};

const contentStyle: CSSProperties = {
  maxWidth: "960px",
  margin: "0 auto",
};

/** Group registry entries by their `group`, preserving first-seen order. */
function groupComponents(
  components: TangoComponent[],
): { group: string; entries: TangoComponent[] }[] {
  const groups: { group: string; entries: TangoComponent[] }[] = [];
  for (const component of components) {
    let bucket = groups.find((candidate) => candidate.group === component.group);
    if (!bucket) {
      bucket = { group: component.group, entries: [] };
      groups.push(bucket);
    }
    bucket.entries.push(component);
  }
  return groups;
}

function Overview() {
  const groups = groupComponents(TANGO_COMPONENTS);
  return (
    <div>
      <header style={{ marginBottom: token("--space-10") }}>
        <p
          style={{
            font: token("--t-eyebrow"),
            letterSpacing: token("--tracking-eyebrow"),
            textTransform: "uppercase",
            color: token("--accent-bright"),
            margin: `0 0 ${token("--space-3")}`,
          }}
        >
          Design System
        </p>
        <h1 style={{ font: token("--t-display"), margin: 0 }}>Tango</h1>
      </header>

      {groups.length === 0 ? (
        <p style={{ color: token("--text-muted"), font: token("--t-body") }}>
          Components coming soon.
        </p>
      ) : (
        <nav style={{ display: "flex", flexDirection: "column", gap: token("--space-9") }}>
          {groups.map(({ group, entries }) => (
            <section key={group}>
              <h2
                style={{
                  font: token("--t-eyebrow"),
                  letterSpacing: token("--tracking-eyebrow"),
                  textTransform: "uppercase",
                  color: token("--text-muted"),
                  margin: `0 0 ${token("--space-5")}`,
                }}
              >
                {group}
              </h2>
              <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: token("--space-3") }}>
                {entries.map((entry) => (
                  <li key={entry.id}>
                    <a
                      href={`#/${entry.id}`}
                      style={{
                        display: "block",
                        padding: `${token("--space-4")} ${token("--space-6")}`,
                        background: token("--surface-card"),
                        border: `1px solid ${token("--border-soft")}`,
                        borderRadius: token("--r-md"),
                        color: token("--text-primary"),
                        font: token("--t-lead"),
                        textDecoration: "none",
                      }}
                    >
                      {entry.title}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </nav>
      )}
    </div>
  );
}

function MockupPlaceholder({ id }: { id: string }) {
  return (
    <div style={{ color: token("--text-secondary") }}>
      <p>Mockup for {id} — coming in a later task.</p>
      <a href={`#/${id}`} style={{ color: token("--accent-bright") }}>
        Back to {id}
      </a>
    </div>
  );
}

export default function TangoApp() {
  const route = useTangoRoute();
  return (
    <div className="tango" style={pageStyle}>
      <div style={contentStyle}>
        {route.view === "overview" && <Overview />}
        {route.view === "component" && (
          // key on the route id so a direct component→component hash change
          // (both `{view:"component"}`, no intervening overview) remounts the
          // page and re-seeds its args from the new component's defaultArgs —
          // otherwise React reconciles it as the same element and stale args
          // leak onto the new component.
          <ComponentPage key={route.id} id={route.id} />
        )}
        {route.view === "mockup" && <MockupPlaceholder id={route.id} />}
      </div>
    </div>
  );
}
