// Renders the documented props of a Cumulus component as a table on its doc page.
// Pure presentation over the generated metadata (see metadata.ts): prop name,
// TS type, required flag, default value, and JSDoc description. A prop whose
// type is a named model object carries a `nested` field list, expanded inline
// under the prop row in a collapsible sub-table so callers can see the shape
// they must supply rather than only the opaque type name. Components with no
// entry in the metadata (or no props) get a graceful empty state rather than an
// empty table.

import { token } from "../primitives/tokens";
import type { NestedTypeDoc, PropMeta } from "./controls";
import { metasFor } from "./metadata";

const cellStyle: React.CSSProperties = {
  padding: `${token("--space-xs")} ${token("--space-m")}`,
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
  fontFamily: token("--font-meta"),
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
          minWidth: "900px",
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
            <PropRow key={meta.name} meta={meta} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PropRow({ meta }: { meta: PropMeta }) {
  return (
    <>
      <tr>
        <td style={{ ...cellStyle, color: token("--text-primary") }}>
          <code style={codeStyle}>{meta.name}</code>
        </td>
        <td style={cellStyle}>
          <code style={{ ...codeStyle, whiteSpace: "nowrap" }}>
            {formatPropType(meta)}
          </code>
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
      {meta.nested ? <NestedRow nested={meta.nested} /> : null}
    </>
  );
}

/**
 * Spell out string-literal union members when docgen leaves the type behind a
 * named alias. Direct unions already contain their values in `tsType`, so they
 * stay unchanged instead of repeating the same literals twice.
 */
export function formatPropType(
  meta: Pick<PropMeta, "tsType" | "unionMembers">,
): string {
  if (meta.unionMembers.length === 0) return meta.tsType;

  const literals = meta.unionMembers.map((member) => JSON.stringify(member));
  if (literals.every((literal) => meta.tsType.includes(literal))) {
    return meta.tsType;
  }

  return `${meta.tsType} = ${literals.join(" | ")}`;
}

// A full-width row beneath a prop that carries a nested model object. The
// fields sit inside a native <details> so the main table stays scannable, with
// its own compact three-column layout (Field / Type / Description) that mirrors
// the parent table's vocabulary.
function NestedRow({ nested }: { nested: NestedTypeDoc }) {
  const fieldCount = nested.fields.length;
  return (
    <tr>
      <td
        colSpan={5}
        style={{
          padding: `0 ${token("--space-m")} ${token("--space-s")}`,
          borderBottom: `1px solid ${token("--border-soft")}`,
        }}
      >
        <details
          style={{
            background: token("--bg-sunken"),
            border: `1px solid ${token("--border-soft")}`,
            borderRadius: token("--space-xs"),
            padding: `${token("--space-xs")} ${token("--space-s")}`,
          }}
        >
          <summary
            style={{
              cursor: "pointer",
              color: token("--text-muted"),
              font: token("--t-body-sm"),
              listStyle: "revert",
            }}
          >
            <code style={{ ...codeStyle, color: token("--text-secondary") }}>
              {nested.name}
            </code>{" "}
            fields ({fieldCount})
          </summary>
          <table
            style={{
              width: "100%",
              minWidth: "360px",
              borderCollapse: "collapse",
              marginTop: token("--space-xs"),
              font: token("--t-body-sm"),
              color: token("--text-secondary"),
            }}
          >
            <thead>
              <tr>
                <th style={nestedHeaderCellStyle}>Field</th>
                <th style={nestedHeaderCellStyle}>Type</th>
                <th style={nestedHeaderCellStyle}>Description</th>
              </tr>
            </thead>
            <tbody>
              {nested.fields.map((field) => (
                <tr key={field.name}>
                  <td
                    style={{
                      ...nestedCellStyle,
                      color: token("--text-primary"),
                      whiteSpace: "nowrap",
                    }}
                  >
                    <code style={codeStyle}>{field.name}</code>
                    {field.optional ? (
                      <span
                        title="optional"
                        style={{ color: token("--text-faint") }}
                      >
                        ?
                      </span>
                    ) : null}
                  </td>
                  <td style={nestedCellStyle}>
                    <code style={codeStyle}>{field.tsType}</code>
                  </td>
                  <td style={nestedCellStyle}>
                    {field.description === "" ? (
                      <span style={{ color: token("--text-faint") }}>—</span>
                    ) : (
                      field.description
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </td>
    </tr>
  );
}

const nestedCellStyle: React.CSSProperties = {
  padding: `${token("--space-xs")} ${token("--space-s")}`,
  borderBottom: `1px solid ${token("--border-soft")}`,
  textAlign: "left",
  verticalAlign: "top",
};

const nestedHeaderCellStyle: React.CSSProperties = {
  ...nestedCellStyle,
  color: token("--text-faint"),
  font: token("--t-eyebrow"),
  letterSpacing: token("--tracking-eyebrow"),
  textTransform: "uppercase",
  borderBottom: `1px solid ${token("--border-mid")}`,
};
