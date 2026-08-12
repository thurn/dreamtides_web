import type { ChangeEvent, ReactElement, Ref } from "react";
import type { LocalizedString } from "@trox/runtime";
import { controlChrome } from "../../internal/control-treatment";
import { token } from "../../primitives/tokens";
import { useLocalizer } from "../../../runtime/localization/use-localizer";

/** Named input modes supported by the shared text field. */
export type TextFieldKind = "text" | "search";

export interface TextFieldProps {
  /** Localized field label. */
  label?: LocalizedString;
  /** Label supplied by canonical authored or developer-only copy. */
  authoredLabel?: string;
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
  authoredPlaceholder?: string;
  /** Optional supporting copy beneath the control. */
  supportingText?: LocalizedString;
  authoredSupportingText?: string;
  /** Validation copy; also marks the input invalid. */
  error?: LocalizedString;
  authoredError?: string;
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
  authoredLabel,
  value,
  onChange,
  onCommit,
  kind = "text",
  placeholder,
  authoredPlaceholder,
  supportingText,
  authoredSupportingText,
  error,
  authoredError,
  disabled = false,
  testId,
  inputRef,
}: TextFieldProps): ReactElement {
  const resolve = useLocalizer();
  if ((label === undefined) === (authoredLabel === undefined)) {
    throw new Error("TextField requires exactly one of label or authoredLabel.");
  }
  if (placeholder !== undefined && authoredPlaceholder !== undefined) {
    throw new Error("TextField accepts placeholder or authoredPlaceholder, not both.");
  }
  if (supportingText !== undefined && authoredSupportingText !== undefined) {
    throw new Error("TextField accepts supportingText or authoredSupportingText, not both.");
  }
  if (error !== undefined && authoredError !== undefined) {
    throw new Error("TextField accepts error or authoredError, not both.");
  }
  const message = authoredError ?? (error === undefined ? authoredSupportingText : resolve(error)) ??
    (supportingText === undefined ? undefined : resolve(supportingText));
  const invalid = error !== undefined || authoredError !== undefined;
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
        {authoredLabel ?? resolve(label!)}
      </span>
      <input
        ref={inputRef}
        type={kind}
        value={value}
        placeholder={authoredPlaceholder ?? (placeholder === undefined ? undefined : resolve(placeholder))}
        disabled={disabled}
        aria-invalid={invalid ? true : undefined}
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
          role={invalid ? "alert" : undefined}
          style={{
            color: !invalid
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
