import type { ReactNode } from "react";
import { token } from "../../primitives/tokens";

export function DemoControls({ children }: { readonly children: ReactNode }) {
  return (
    <div
      aria-label="Demo controls"
      style={{
        width: "100%",
        maxWidth: "100%",
        boxSizing: "border-box",
        display: "flex",
        flexWrap: "wrap",
        alignItems: "end",
        gap: token("--space-s"),
        padding: token("--space-s"),
        border: `1px solid ${token("--border-soft")}`,
        borderRadius: token("--radius-control"),
        background: token("--surface-card"),
      }}
    >
      {children}
    </div>
  );
}

export function DemoSelect({
  label,
  value,
  values,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly values: readonly string[];
  readonly onChange: (value: string) => void;
}) {
  return (
    <label style={{ display: "grid", gap: token("--space-xxs") }}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {values.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

export function DemoToggle({
  label,
  checked,
  onChange,
}: {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}

export function DemoLog({ children }: { readonly children: ReactNode }) {
  return (
    <output
      aria-live="polite"
      style={{
        display: "block",
        minWidth: 0,
        padding: token("--space-xs"),
        borderRadius: token("--radius-control"),
        background: token("--bg-sunken"),
        overflowWrap: "anywhere",
      }}
    >
      {children}
    </output>
  );
}
