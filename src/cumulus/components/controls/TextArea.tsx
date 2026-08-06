import type {
  ChangeEvent,
  KeyboardEvent,
  ReactElement,
  Ref,
} from "react";
import { controlChrome } from "../../internal/control-treatment";
import { token } from "../../primitives/tokens";

export interface TextAreaProps {
  /** Visible field label. */
  readonly label: string;
  /** Controlled multiline text. */
  readonly value: string;
  /** Reports each local text edit. */
  readonly onChange: (value: string) => void;
  /** Commits the draft on blur or Command/Ctrl+Enter. */
  readonly onCommit?: (value: string) => void;
  /** Optional placeholder shown while empty. */
  readonly placeholder?: string;
  /** Supporting copy beneath the control. */
  readonly supportingText?: string;
  /** Validation copy; also marks the textarea invalid. */
  readonly error?: string;
  /** Prevent editing. */
  readonly disabled?: boolean;
  /** Stable test id for product QA. */
  readonly testId?: string;
  /** Optional ref to the native textarea. */
  readonly inputRef?: Ref<HTMLTextAreaElement>;
}

/** A labeled multiline authoring field on shared glass control chrome. */
export function TextArea({
  label,
  value,
  onChange,
  onCommit,
  placeholder,
  supportingText,
  error,
  disabled = false,
  testId,
  inputRef,
}: TextAreaProps): ReactElement {
  const chrome = controlChrome("onGlass");
  const message = error ?? supportingText;
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
        {label}
      </span>
      <textarea
        ref={inputRef}
        rows={3}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        aria-invalid={error === undefined ? undefined : true}
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
          role={error === undefined ? undefined : "alert"}
          style={{
            color:
              error === undefined
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
