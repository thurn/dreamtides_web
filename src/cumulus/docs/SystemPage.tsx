import type { CSSProperties } from "react";
import { token } from "../primitives/tokens";
import { getUISystem, type CumulusUISystemId } from "./systems/registry";
import "./system-page.css";

const stickyNavStyle: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 30,
  display: "flex",
  alignItems: "center",
  padding: `${token("--space-s")} 0`,
  background: token("--bg-app"),
  borderBottom: `1px solid ${token("--border-soft")}`,
};

export function SystemPage({ id }: { readonly id: CumulusUISystemId }) {
  const system = getUISystem(id);
  if (system === undefined) {
    return (
      <div style={{ color: token("--text-secondary") }}>
        <p>No Cumulus UI system is registered for this route.</p>
        <a href="#/" style={{ color: token("--accent-bright") }}>
          Back to overview
        </a>
      </div>
    );
  }

  const Docs = system.Docs;
  return (
    <article data-cumulus-system-page={system.id}>
      <nav style={stickyNavStyle}>
        <a href="#/" style={{ font: token("--t-caption"), color: token("--text-muted") }}>
          ← Overview
        </a>
      </nav>
      <header style={{ padding: `${token("--space-3xl")} 0` }}>
        <p
          style={{
            margin: `0 0 ${token("--space-xs")}`,
            color: token("--accent-bright"),
            font: token("--t-eyebrow"),
            letterSpacing: token("--tracking-eyebrow"),
            textTransform: "uppercase",
          }}
        >
          UI System
        </p>
        <h1 style={{ margin: 0, color: token("--text-primary"), font: token("--t-title") }}>
          {system.title}
        </h1>
        <p
          style={{
            maxWidth: "68ch",
            margin: `${token("--space-s")} 0 0`,
            color: token("--text-secondary"),
            font: token("--t-lead"),
          }}
        >
          {system.blurb}
        </p>
      </header>
      <Docs />
    </article>
  );
}
