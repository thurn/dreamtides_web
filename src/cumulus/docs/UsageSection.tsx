// UsageSection — the "Usage" block on a component's /cumulus doc page. Renders the
// component's authored code snippets (registry entry `usage`) as syntax-
// highlighted (see syntax-highlight.tsx) monospace source in a sunken, bordered
// pane, each with a copy-to-clipboard affordance that copies the raw source. When a component lists more than one snippet (genuinely distinct
// usage variants — e.g. Button with vs. without a cost, InfoCard's four media
// variants), each snippet is introduced by its own label + optional note so the
// reader can tell the variants apart; a single-snippet component renders just
// the one block with no label chrome.

import { useState, type CSSProperties } from "react";
import { token } from "../primitives/tokens";
import { highlightTsx } from "./syntax-highlight";
import type { CumulusUsageExample } from "./registry";

const listStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: token("--space-xl"),
};

const variantLabelStyle: CSSProperties = {
  font: token("--t-eyebrow"),
  letterSpacing: token("--tracking-eyebrow"),
  textTransform: "uppercase",
  color: token("--accent-bright"),
  margin: `0 0 ${token("--space-xs")}`,
};

const variantNoteStyle: CSSProperties = {
  font: token("--t-body-sm"),
  color: token("--text-muted"),
  margin: `0 0 ${token("--space-s")}`,
  maxWidth: "64ch",
};

const paneStyle: CSSProperties = {
  position: "relative",
  minWidth: 0,
  maxWidth: "100%",
  background: token("--bg-sunken"),
  border: `1px solid ${token("--border-soft")}`,
  borderRadius: token("--radius-control"),
  boxShadow: token("--shadow-sm"),
};

const preStyle: CSSProperties = {
  margin: 0,
  maxWidth: "100%",
  boxSizing: "border-box",
  padding: `${token("--space-l")} ${token("--space-l")}`,
  overflowX: "auto",
};

const codeStyle: CSSProperties = {
  fontFamily: token("--font-meta"),
  fontSize: "12.5px",
  lineHeight: 1.65,
  color: token("--text-secondary"),
  whiteSpace: "pre-wrap",
  overflowWrap: "anywhere",
  tabSize: 2,
};

const copyButtonStyle: CSSProperties = {
  position: "absolute",
  top: token("--space-s"),
  right: token("--space-s"),
  display: "inline-flex",
  alignItems: "center",
  gap: token("--space-xs"),
  padding: `${token("--space-xs")} ${token("--space-s")}`,
  background: token("--surface-raised"),
  border: `1px solid ${token("--border-mid")}`,
  borderRadius: token("--radius-pill"),
  color: token("--text-secondary"),
  font: token("--t-eyebrow"),
  letterSpacing: token("--tracking-eyebrow"),
  textTransform: "uppercase",
  cursor: "pointer",
};

/** A single code pane: the source plus a copy-to-clipboard button. */
function CodePane({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    // navigator.clipboard is the modern path; the doc site runs in a secure
    // browser context so the promise resolves. A rejected promise (e.g. an
    // older browser) is swallowed — copy is a convenience, not load-bearing.
    void navigator.clipboard?.writeText(code).then(
      () => setCopied(true),
      () => undefined,
    );
  }

  return (
    <div style={paneStyle}>
      <button
        type="button"
        onClick={copy}
        onMouseLeave={() => setCopied(false)}
        style={copyButtonStyle}
      >
        {copied ? "Copied" : "Copy"}
      </button>
      <pre style={preStyle}>
        {/* The raw `code` string still backs the Copy button above; only the
            displayed source is tokenized and colored. */}
        <code style={codeStyle}>{highlightTsx(code)}</code>
      </pre>
    </div>
  );
}

/**
 * Renders a component's authored usage snippets. Single-snippet components show
 * one bare pane; multi-variant components label each pane so the reader can
 * distinguish the variants.
 */
export function UsageSection({ examples }: { examples: CumulusUsageExample[] }) {
  const multi = examples.length > 1;
  return (
    <div style={listStyle}>
      {examples.map((example, index) => (
        <div key={example.label ?? index}>
          {multi && example.label && (
            <p style={variantLabelStyle}>{example.label}</p>
          )}
          {multi && example.note && (
            <p style={variantNoteStyle}>{example.note}</p>
          )}
          <CodePane code={example.code} />
        </div>
      ))}
    </div>
  );
}
