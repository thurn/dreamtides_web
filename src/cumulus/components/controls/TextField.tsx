import type { ChangeEvent, ReactElement, Ref } from "react";
import { controlChrome } from "../../internal/control-treatment";
import { token } from "../../primitives/tokens";

/** Named input modes supported by the shared text field. */
export type TextFieldKind = "text" | "search";

export interface TextFieldProps {
  /** Visible field label. */
  label: string;
  /** Controlled value. */
  value: string;
  /** Reports edited text. */
  onChange: (value: string) => void;
  /** Commits the current value on blur or Enter. */
  onCommit?: (value: string) => void;
  /** Text or search semantics. Defaults to text. */
  kind?: TextFieldKind;
  /** Optional placeholder. */
  placeholder?: string;
  /** Optional supporting copy beneath the control. */
  supportingText?: string;
  /** Validation copy; also marks the input invalid. */
  error?: string;
  /** Prevent editing. */
  disabled?: boolean;
  /** Stable test id for the input. */
  testId?: string;
  /** Optional ref to the native input for focus orchestration. */
  inputRef?: Ref<HTMLInputElement>;
}

/** A labeled controlled text/search input on the shared glass control surface. */
export function TextField({
  label,
  value,
  onChange,
  onCommit,
  kind = "text",
  placeholder,
  supportingText,
  error,
  disabled = false,
  testId,
  inputRef,
}: TextFieldProps): ReactElement {
  const message = error ?? supportingText;
  const chrome = controlChrome("onGlass");
  return (
    <label style={{ display: "grid", gap: token("--space-xs") }}>
      <span
        style={{
          color: token("--text-on-glass-muted"),
          font: token("--t-eyebrow"),
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <input
        ref={inputRef}
        type={kind}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={error === undefined ? undefined : true}
        data-testid={testId}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        onInput={(event) => onChange(event.currentTarget.value)}
        onBlur={(event) => onCommit?.(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.currentTarget.blur();
          }
        }}
        style={{
          ...chrome.trigger,
          width: "100%",
          minHeight: token("--touch-min"),
          boxSizing: "border-box",
          paddingInline: token("--space-s"),
          color: token("--text-on-glass"),
          font: token("--t-body"),
          outline: "none",
        }}
      />
      {message === undefined ? null : (
        <span
          role={error === undefined ? undefined : "alert"}
          style={{
            color: error === undefined
              ? token("--text-on-glass-muted")
              : token("--danger"),
            font: token("--t-caption"),
          }}
        >
          {message}
        </span>
      )}
    </label>
  );
}
