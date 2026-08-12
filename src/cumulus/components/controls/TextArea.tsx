import type { ChangeEvent, KeyboardEvent, ReactElement, Ref } from "react";
import type { LocalizedString } from "@trox/runtime";
import { controlChrome } from "../../internal/control-treatment";
import { token } from "../../primitives/tokens";
import { useLocalizer } from "../../../runtime/localization/use-localizer";

export interface TextAreaProps {
  /** Visible field label. */
  readonly label?: LocalizedString;
  /** Visible label supplied by canonical authored or developer-only copy. */
  readonly authoredLabel?: string;
  /** Controlled multiline text. */
  readonly value: string;
  /** Reports each local text edit. */
  readonly onChange: (value: string) => void;
  /** Commits the draft on blur or Command/Ctrl+Enter. */
  readonly onCommit?: (value: string) => void;
  /** Optional placeholder shown while empty. */
  readonly placeholder?: LocalizedString;
  readonly authoredPlaceholder?: string;
  /** Supporting copy beneath the control. */
  readonly supportingText?: LocalizedString;
  readonly authoredSupportingText?: string;
  /** Validation copy; also marks the textarea invalid. */
  readonly error?: LocalizedString;
  readonly authoredError?: string;
  /** Stable test id for product QA. */
  readonly testId?: string;
  /** Optional ref to the native textarea. */
  readonly inputRef?: Ref<HTMLTextAreaElement>;
}

/** A labeled multiline authoring field on shared glass control chrome. */
export function TextArea({
  label,
  authoredLabel,
  value,
  onChange,
  onCommit,
  placeholder,
  authoredPlaceholder,
  supportingText,
  authoredSupportingText,
  error,
  authoredError,
  testId,
  inputRef,
}: TextAreaProps): ReactElement {
  const resolve = useLocalizer();
  if ((label === undefined) === (authoredLabel === undefined)) {
    throw new Error("TextArea requires exactly one of label or authoredLabel.");
  }
  if (placeholder !== undefined && authoredPlaceholder !== undefined) {
    throw new Error("TextArea accepts placeholder or authoredPlaceholder, not both.");
  }
  if (supportingText !== undefined && authoredSupportingText !== undefined) {
    throw new Error("TextArea accepts supportingText or authoredSupportingText, not both.");
  }
  if (error !== undefined && authoredError !== undefined) {
    throw new Error("TextArea accepts error or authoredError, not both.");
  }
  const chrome = controlChrome("onGlass");
  const message = authoredError ?? (error === undefined ? authoredSupportingText : resolve(error)) ??
    (supportingText === undefined ? undefined : resolve(supportingText));
  const invalid = error !== undefined || authoredError !== undefined;
  const commit = (): void => onCommit?.(value);
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
      <textarea
        ref={inputRef}
        rows={3}
        value={value}
        placeholder={
          authoredPlaceholder ?? (placeholder === undefined ? undefined : resolve(placeholder))
        }
        aria-invalid={invalid ? true : undefined}
        data-testid={testId}
        onChange={(event: ChangeEvent<HTMLTextAreaElement>) =>
          onChange(event.target.value)
        }
        onBlur={commit}
        onKeyDown={(event: KeyboardEvent<HTMLTextAreaElement>) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            commit();
          }
        }}
        style={{
          ...chrome.trigger,
          width: "100%",
          minHeight: 96,
          boxSizing: "border-box",
          padding: token("--space-s"),
          resize: "vertical",
          color: token("--text-on-glass"),
          font: token("--t-body"),
          outline: "none",
        }}
      />
      {message === undefined ? null : (
        <span
          role={invalid ? "alert" : undefined}
          style={{
            color:
              !invalid
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
