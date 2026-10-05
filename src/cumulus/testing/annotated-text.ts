import {
  annotatedTextValue,
  annotateText,
  fillTemplate,
  type AnnotatedText,
} from "../../runtime/text";

/** Builds annotated fixture copy from a `{placeholder}` template. */
export function annotatedFixture<TAnnotation>(
  template: string,
  values: Readonly<Record<string, string>>,
  annotations: Readonly<Record<string, TAnnotation>>,
): AnnotatedText<TAnnotation> {
  return annotateText(
    (filled) => fillTemplate(template, filled),
    values,
    annotations,
  );
}

function isAnnotatedText(value: unknown): value is AnnotatedText<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { parts?: unknown }).parts) &&
    typeof (value as { annotations?: unknown }).annotations === "object"
  );
}

/** Vitest equality hook: annotated copy equals a string with the same text. */
export function annotatedTextEquality(
  left: unknown,
  right: unknown,
): boolean | undefined {
  if (isAnnotatedText(left) && typeof right === "string") {
    return annotatedTextValue(left) === right;
  }
  if (typeof left === "string" && isAnnotatedText(right)) {
    return left === annotatedTextValue(right);
  }
  return undefined;
}
