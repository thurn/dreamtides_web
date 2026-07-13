// The interactive control panel on a Cumulus component's doc page. For each
// documented prop it renders the widget that controlForProp picks (toggle /
// select / number / text), controlled by the page's `args` state, and reports
// edits through `onChange`. Props whose control is "none" (ReactNode slots,
// functions, ...) render no widget — they are supplied via the registry's
// sampleContent and documented in the props table.

import type { PropMeta } from "./controls";
import { controlForProp } from "./controls";
import { token } from "../primitives/tokens";

interface ControlPanelProps {
  metas: PropMeta[];
  args: Record<string, unknown>;
  onChange: (name: string, value: unknown) => void;
}

const fieldStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: token("--space-2"),
};

const labelStyle: React.CSSProperties = {
  font: token("--t-caption"),
  color: token("--text-secondary"),
};

const inputStyle: React.CSSProperties = {
  font: token("--t-body-sm"),
  color: token("--text-primary"),
  background: token("--surface-chrome"),
  border: `1px solid ${token("--border-mid")}`,
  borderRadius: token("--radius-inset"),
  padding: `${token("--space-2")} ${token("--space-4")}`,
};

/**
 * Coerce an unknown arg value to a string for a text/select input's `value`.
 * text/select controls only ever back string-typed props, so a non-string
 * (unset) value renders as empty rather than being stringified.
 */
function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Coerce an unknown arg value to a number input's string `value`. */
function asNumberString(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value)
    ? String(value)
    : "";
}

export function ControlPanel({ metas, args, onChange }: ControlPanelProps) {
  const controls = metas
    .map((meta) => ({ meta, spec: controlForProp(meta) }))
    .filter(({ spec }) => spec.kind !== "none");

  if (controls.length === 0) {
    return (
      <p style={{ color: token("--text-muted"), font: token("--t-body-sm") }}>
        No interactive controls.
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: token("--space-5") }}>
      {controls.map(({ meta, spec }) => {
        const id = `cumulus-control-${meta.name}`;
        return (
          <div key={meta.name} style={fieldStyle}>
            <label htmlFor={id} style={labelStyle}>
              {meta.name}
            </label>
            {spec.kind === "toggle" && (
              <input
                id={id}
                type="checkbox"
                checked={Boolean(args[meta.name])}
                onChange={(event) => onChange(meta.name, event.target.checked)}
                style={{ alignSelf: "flex-start" }}
              />
            )}
            {spec.kind === "select" &&
              (() => {
                // If the current arg value isn't one of the options (e.g.
                // defaultArgs omits the prop), fall back to the first option so
                // the rendered value matches what the native <select> shows —
                // otherwise the browser displays option[0] while the controlled
                // value stays "" and UI/state diverge.
                const current = asString(args[meta.name]);
                const value = spec.options.includes(current)
                  ? current
                  : (spec.options[0] ?? "");
                return (
                  <select
                    id={id}
                    value={value}
                    onChange={(event) => onChange(meta.name, event.target.value)}
                    style={inputStyle}
                  >
                    {spec.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                );
              })()}
            {spec.kind === "number" && (
              <input
                id={id}
                type="number"
                value={asNumberString(args[meta.name])}
                onChange={(event) => {
                  const next = event.target.value;
                  onChange(meta.name, next === "" ? undefined : Number(next));
                }}
                style={inputStyle}
              />
            )}
            {spec.kind === "text" && (
              <input
                id={id}
                type="text"
                value={asString(args[meta.name])}
                onChange={(event) => onChange(meta.name, event.target.value)}
                style={inputStyle}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
