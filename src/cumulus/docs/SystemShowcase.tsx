import type { CSSProperties } from "react";
import { token } from "../primitives/tokens";
import type { CumulusUISystem } from "./systems/registry";
import type { DomElementId } from "../types/dom";

const articleStyle: CSSProperties = {
  display: "grid",
  gap: token("--space-2xl"),
  alignItems: "center",
  padding: token("--space-2xl"),
  background: token("--surface-card"),
  border: `1px solid ${token("--border-mid")}`,
  borderRadius: token("--radius-panel"),
  boxShadow: token("--shadow-md"),
};

const docsLinkStyle: CSSProperties = {
  display: "inline-flex",
  width: "fit-content",
  marginTop: token("--space-m"),
  padding: `${token("--space-xs")} ${token("--space-m")}`,
  borderRadius: token("--radius-pill"),
  background: token("--accent-tint"),
  border: `1px solid ${token("--border-accent")}`,
  color: token("--accent-bright"),
  font: token("--t-button-sm"),
  textDecoration: "none",
};

export function SystemShowcase({
  system,
  anchorId,
}: {
  readonly system: CumulusUISystem;
  readonly anchorId: DomElementId;
}) {
  const Preview = system.Preview;
  return (
    <article
      id={anchorId}
      data-cumulus-system-showcase={system.id}
      className="cumulus-system-showcase"
      style={articleStyle}
    >
      <div>
        <p
          style={{
            margin: `0 0 ${token("--space-xs")}`,
            color: token("--accent-bright"),
            font: token("--t-eyebrow"),
            letterSpacing: token("--tracking-eyebrow"),
            textTransform: "uppercase",
          }}
        >
          Behavior System
        </p>
        <a
          href={`#/systems/${system.id}`}
          style={{
            color: token("--text-primary"),
            font: token("--t-title-sm"),
            textDecoration: "none",
          }}
        >
          {system.title}
        </a>
        <p
          style={{
            maxWidth: "58ch",
            margin: `${token("--space-s")} 0 0`,
            color: token("--text-secondary"),
            font: token("--t-body-sm"),
          }}
        >
          {system.blurb}
        </p>
        <a href={`#/systems/${system.id}`} style={docsLinkStyle}>
          Read system contract →
        </a>
      </div>
      <Preview />
    </article>
  );
}
