import type { ChangeEvent, ReactElement, Ref } from "react";
import type { LocalizedString } from "@trox/runtime";
import { controlChrome } from "../../internal/control-treatment";
import { token } from "../../primitives/tokens";
import { useLocalizer } from "../../../runtime/localization/use-localizer";
import type { DomTestId } from "../../types/dom";

/** Named input modes supported by the shared text field. */
export type TextFieldKind = "text" | "search";

export interface TextFieldProps {
  /** Localized field label. */
  label: LocalizedString;
  /** Controlled value. */
  value: string;
  /** Reports edited text. */
  onChange: (value: string) => void;
  /** Commits the current value on blur or Enter. */
  onCommit?: (value: string) => void;
  /** Text or search semantics. Defaults to text. */
  kind?: TextFieldKind;
  /** Optional placeholder. */
  placeholder?: LocalizedString;
  /** Optional supporting copy beneath the control. */
  supportingText?: LocalizedString;
  /** Validation copy; also marks the input invalid. */
  error?: LocalizedString;
  /** Prevent editing. */
  disabled?: boolean;
  /** Stable test id for the input. */
  testId?: DomTestId;
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
  const resolve = useLocalizer();
  const message = error ?? supportingText;
  const invalid = error !== undefined;
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
        {resolve(label)}
      </span>
      <input
        ref={inputRef}
        type={kind}
        value={value}
        placeholder={
          placeholder === undefined ? undefined : resolve(placeholder)
        }
        disabled={disabled}
        aria-invalid={invalid ? true : undefined}
        data-testid={testId}
        onChange={(event: ChangeEvent<HTMLInputElement>) =>
          onChange(event.target.value)
        }
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
          role={invalid ? "alert" : undefined}
          style={{
            color: !invalid
              ? token("--text-on-glass-muted")
              : token("--danger"),
            font: token("--t-caption"),
          }}
        >
          {resolve(message)}
        </span>
      )}
    </label>
  );
}
