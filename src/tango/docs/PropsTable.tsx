// Renders the documented props of a Tango component as a table on its doc page.
// Pure presentation over the generated metadata (see metadata.ts): prop name,
// TS type, required flag, default value, and JSDoc description. Components with
// no entry in the metadata (or no props) get a graceful empty state rather than
// an empty table.

import { token } from "../primitives/tokens";
import { metasFor } from "./metadata";

const cellStyle: React.CSSProperties = {
  padding: `${token("--space-3")} ${token("--space-5")}`,
  borderBottom: `1px solid ${token("--border-soft")}`,
  textAlign: "left",
  verticalAlign: "top",
};

const headerCellStyle: React.CSSProperties = {
  ...cellStyle,
  color: token("--text-muted"),
  font: token("--t-eyebrow"),
  letterSpacing: token("--tracking-eyebrow"),
  textTransform: "uppercase",
  borderBottom: `1px solid ${token("--border-mid")}`,
};

const codeStyle: React.CSSProperties = {
  fontFamily: token("--font-mono"),
  fontSize: "12px",
  color: token("--accent-bright"),
};

export function PropsTable({ docName }: { docName: string }) {
  const metas = metasFor(docName);

  if (metas.length === 0) {
    return (
      <p style={{ color: token("--text-muted"), font: token("--t-body-sm") }}>
        No documented props.
      </p>
    );
  }

  return (
    // Horizontally scrollable so the trailing columns (Default, Description)
    // stay reachable instead of running off-screen on narrow viewports —
    // the table itself keeps a sane minimum width rather than squeezing its
    // columns unreadably thin.
    <div style={{ overflowX: "auto" }}>
      <table
        style={{
          width: "100%",
          minWidth: "480px",
          borderCollapse: "collapse",
          font: token("--t-body-sm"),
          color: token("--text-secondary"),
        }}
      >
        <thead>
          <tr>
            <th style={headerCellStyle}>Prop</th>
            <th style={headerCellStyle}>Type</th>
            <th style={headerCellStyle}>Required</th>
            <th style={headerCellStyle}>Default</th>
            <th style={headerCellStyle}>Description</th>
          </tr>
        </thead>
        <tbody>
          {metas.map((meta) => (
            <tr key={meta.name}>
              <td style={{ ...cellStyle, color: token("--text-primary") }}>
                <code style={codeStyle}>{meta.name}</code>
              </td>
              <td style={cellStyle}>
                <code style={codeStyle}>{meta.tsType}</code>
              </td>
              <td style={cellStyle}>{meta.required ? "yes" : "no"}</td>
              <td style={cellStyle}>
                {meta.defaultValue === null ? (
                  <span style={{ color: token("--text-faint") }}>—</span>
                ) : (
                  <code style={codeStyle}>{meta.defaultValue}</code>
                )}
              </td>
              <td style={cellStyle}>
                {meta.description === "" ? (
                  <span style={{ color: token("--text-faint") }}>—</span>
                ) : (
                  meta.description
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
