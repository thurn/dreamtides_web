import { formatNumber } from "./format-number";

/** Player-facing English copy authored in a content catalog. */
export type DisplayText = string;

/** A value substituted into a `{placeholder}` of authored catalog text. */
export type TemplateValue = string | number | boolean;

function snakeCase(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/gu, "$1_$2")
    .replace(/-/gu, "_")
    .toLowerCase();
}

/**
 * Fills `{name}` placeholders in authored catalog text. A placeholder matches
 * a value key exactly or by its snake_case form (`deckCard` fills
 * `{deck_card}`). Numbers use {@link formatNumber}; an unmatched placeholder
 * throws, so authored text and its callers stay in agreement.
 */
export function fillTemplate(
  text: string,
  values: Readonly<Record<string, TemplateValue>> = {},
): string {
  const bySnakeName = new Map<string, TemplateValue>();
  for (const [key, value] of Object.entries(values)) {
    bySnakeName.set(snakeCase(key), value);
  }
  return text.replace(
    /\{([A-Za-z_][A-Za-z0-9_-]*|\d+)\}/gu,
    (_match, name: string) => {
      const value = values[name] ?? bySnakeName.get(snakeCase(name));
      if (value === undefined) throw new Error(`missing value for {${name}}`);
      return typeof value === "number" ? formatNumber(value) : String(value);
    },
  );
}

/** Validates authored catalog text that must be non-empty. */
export function requireText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${label} must be non-empty text.`);
  }
  return value;
}

/** One run of {@link AnnotatedText}: literal copy or an annotated placeholder. */
export type AnnotatedTextPart<TAnnotation> =
  | { readonly kind: "literal"; readonly value: string }
  | {
      readonly kind: "placeholder";
      readonly name: string;
      readonly value: string;
      readonly annotation: TAnnotation;
    };

/**
 * Display copy whose selected placeholder values carry application metadata,
 * such as the entity a card name refers to, so the renderer can give those
 * runs their own markup. `annotations` lists the metadata by placeholder name
 * in the order it was supplied.
 */
export interface AnnotatedText<TAnnotation> {
  readonly parts: readonly AnnotatedTextPart<TAnnotation>[];
  readonly annotations: Readonly<Record<string, TAnnotation>>;
}

/** Plain copy as {@link AnnotatedText} with no annotated runs. */
export function plainAnnotatedText<TAnnotation>(
  text: string,
): AnnotatedText<TAnnotation> {
  return {
    parts: text === "" ? [] : [{ kind: "literal", value: text }],
    annotations: {},
  };
}

/**
 * Renders copy through `render` and splits out the runs produced by the
 * annotated placeholders. `render` receives `values` with each annotated
 * value replaced by a private-use sentinel; every sentinel in the output
 * becomes a placeholder run carrying the original value and its annotation.
 */
export function annotateText<TAnnotation>(
  render: (values: Readonly<Record<string, string>>) => string,
  values: Readonly<Record<string, string>>,
  annotations: Readonly<Record<string, TAnnotation>>,
): AnnotatedText<TAnnotation> {
  const names = Object.keys(annotations).filter((name) => name in values);
  const marked = { ...values };
  names.forEach((name, index) => {
    marked[name] = `\uE000${String(index)}\uE001`;
  });
  const parts: AnnotatedTextPart<TAnnotation>[] = [];
  for (const piece of render(marked).split(/(\uE000\d+\uE001)/u)) {
    const match = /^\uE000(\d+)\uE001$/u.exec(piece);
    if (match === null) {
      if (piece !== "") parts.push({ kind: "literal", value: piece });
      continue;
    }
    const name = names[Number(match[1])];
    parts.push({
      kind: "placeholder",
      name,
      value: values[name],
      annotation: annotations[name],
    });
  }
  return {
    parts,
    annotations: Object.fromEntries(
      names.map((name) => [name, annotations[name]]),
    ),
  };
}

/** Replaces each annotation of {@link AnnotatedText} through `map`. */
export function mapAnnotations<TFrom, TTo>(
  text: AnnotatedText<TFrom>,
  map: (annotation: TFrom) => TTo,
): AnnotatedText<TTo> {
  return {
    parts: text.parts.map((part) =>
      part.kind === "literal"
        ? part
        : { ...part, annotation: map(part.annotation) },
    ),
    annotations: Object.fromEntries(
      Object.entries(text.annotations).map(([name, value]) => [
        name,
        map(value),
      ]),
    ),
  };
}

/** The visible copy of {@link AnnotatedText}. */
export function annotatedTextValue<TAnnotation>(
  text: AnnotatedText<TAnnotation>,
): string {
  return text.parts.map((part) => part.value).join("");
}
