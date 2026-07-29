// RichText — the design system's model for a run of formatted copy.
//
// A caller describes WHAT a piece of text is; the component that renders it
// owns HOW it looks (type scale, color, glossary-keyword emphasis, inline
// resource glyphs, secondary-line treatment). This keeps rich copy inside the
// design system: a screen states "this body is rules text" or "this is a muted
// status note" as data, instead of hand-assembling a `<RulesText>` / `<div>`
// subtree and passing it in as an arbitrary node. Slots that render copy (e.g.
// `InfoCard.body`) take a `RichText`, never a `ReactNode`.

import { Fragment, type ReactElement, type ReactNode } from "react";
import { token } from "../../primitives/tokens";
import { GLYPHS, type Glyph } from "../../primitives/glyph";
import type { CumulusColor } from "../../primitives/color";
import { InlineGlyph } from "../typography/InlineGlyph";
import {
  renderRulesSymbolsInline,
  renderRulesText,
  renderRulesTextInline,
} from "./RulesText";

export type RichTextDefinitionSymbol =
  "fast" | "interrupt" | "exhaust" | "trigger";

export interface RichTextDefinition {
  /** Canonical glossary term used as the compact row label. */
  readonly term: string;
  /** Rules-aware explanatory copy shown after the label. */
  readonly definition: string;
  /** Optional rules symbol rendered directly before the glossary term. */
  readonly symbol?: RichTextDefinitionSymbol;
  /** Whether the row uses its term, its rules symbol, or definition copy alone. */
  readonly termPresentation?: "text" | "symbolOnly" | "definitionOnly";
}

/**
 * A piece of formatted copy the design system knows how to render.
 *
 *  - `plain` — a run of plain prose; no markup parsing.
 *  - `rules` — Dreamtides rules text (see `RulesText`): glossary keywords gain
 *    the spark-amber emphasis and resource symbols (`◆`, `●`, `⍏N`) render as
 *    their inline glyphs. Use for card / dreamAvatar / dreamsign ability text.
 *  - `underline` — a semantically underlined run inside inline prose.
 *  - `glyph` — a named Boxicons glyph aligned to the current font's capital height.
 *  - `inline` — several parts rendered as one continuous line of prose.
 *  - `note`  — a de-emphasized secondary line (muted + italic), e.g. a
 *    "Locked" / "Visited" status shown under a site blurb.
 *  - `stack` — several parts laid out vertically as separate lines.
 *  - `definitions` — a compact, monochrome semantic definition list whose
 *    labels and descriptions share one line whenever space permits; complete
 *    authored sentences may omit the label and colon.
 */
export type RichText =
  | { readonly kind: "plain"; readonly text: string }
  | { readonly kind: "rules"; readonly text: string }
  | { readonly kind: "underline"; readonly text: string }
  | {
      readonly kind: "glyph";
      readonly glyph: Glyph;
      readonly label: string;
      readonly color?: CumulusColor;
    }
  | { readonly kind: "inline"; readonly parts: readonly RichText[] }
  | { readonly kind: "note"; readonly text: string }
  | { readonly kind: "stack"; readonly parts: readonly RichText[] }
  | {
      readonly kind: "definitions";
      readonly entries: readonly RichTextDefinition[];
    };

/** Ergonomic constructors for {@link RichText} values. */
export const richText = {
  plain: (text: string): RichText => ({ kind: "plain", text }),
  rules: (text: string): RichText => ({ kind: "rules", text }),
  underline: (text: string): RichText => ({ kind: "underline", text }),
  glyph: (
    glyph: Glyph,
    label: string,
    color?: CumulusColor,
  ): RichText => ({ kind: "glyph", glyph, label, color }),
  inline: (...parts: RichText[]): RichText => ({ kind: "inline", parts }),
  note: (text: string): RichText => ({ kind: "note", text }),
  stack: (...parts: RichText[]): RichText => ({ kind: "stack", parts }),
  definitions: (entries: readonly RichTextDefinition[]): RichText => ({
    kind: "definitions",
    entries,
  }),
};

/** Vertical gap (px) between stacked rich-text parts. */
const STACK_GAP = 8;
const INLINE_RULE_SYMBOL_RE = /[●✦▸⍟☪⧗❖]/;

interface RichTextRenderOptions {
  /**
   * Route every textual RichText field through the canonical inline rules-text
   * tokenizer. InfoCard enables this at its shared rendering boundary so icon
   * substitutions and compact Unicode trigger formatting stay consistent in
   * plain, note, underline, and definition-label copy.
   */
  readonly substituteRulesSymbols?: boolean;
}

/** One visible hairline with an even, compact rhythm between definition rows. */
const GLOSSARY_DEFINITION_DIVIDER_STYLE = {
  display: "block",
  width: "100%",
  height: "1px",
  margin: `${token("--space-4")} auto`,
  background: token("--border-glossary-definition"),
} as const;

function renderDefinitionText(
  definition: string,
  options: RichTextRenderOptions,
): ReactNode {
  return options.substituteRulesSymbols === true ||
    INLINE_RULE_SYMBOL_RE.test(definition)
    ? options.substituteRulesSymbols === true
      ? renderRulesSymbolsInline(definition)
      : renderRulesTextInline(definition)
    : definition;
}

function renderInlineText(
  text: string,
  options: RichTextRenderOptions,
): ReactNode {
  return options.substituteRulesSymbols === true
    ? renderRulesSymbolsInline(text)
    : text;
}

function definitionSymbolSpec(
  symbol: Exclude<RichTextDefinitionSymbol, "trigger">,
): {
  readonly glyph: Glyph;
  readonly count: number;
} {
  switch (symbol) {
    case "fast":
      return { glyph: GLYPHS.bolt, count: 1 };
    case "interrupt":
      return { glyph: GLYPHS.bolt, count: 2 };
    case "exhaust":
      return { glyph: GLYPHS.exhaust, count: 1 };
  }
}

function DefinitionSymbol({
  symbol,
  title,
  trailingGap,
}: {
  readonly symbol: RichTextDefinitionSymbol;
  readonly title?: string;
  readonly trailingGap: boolean;
}) {
  if (symbol === "trigger") {
    return (
      <span data-definition-symbol={symbol} style={{ display: "inline" }}>
        ▸
      </span>
    );
  }
  const { glyph, count } = definitionSymbolSpec(symbol);
  return (
    <span
      data-definition-symbol={symbol}
      style={{
        display: "inline",
        marginRight: trailingGap ? token("--space-1") : undefined,
      }}
    >
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          style={{
            marginLeft: index === 0 ? undefined : "-0.35em",
          }}
        >
          <InlineGlyph glyph={glyph} color="text-primary" label={title} />
        </span>
      ))}
    </span>
  );
}

/**
 * Renders a {@link RichText} value to nodes. Pure. `key` is applied to the
 * returned root so the result can sit directly in a React list (e.g. a stack).
 */
export function renderRichText(
  value: RichText,
  key: string | number = 0,
  options: RichTextRenderOptions = {},
): ReactNode {
  switch (value.kind) {
    case "plain":
      return <span key={key}>{renderInlineText(value.text, options)}</span>;
    case "rules":
      return <Fragment key={key}>{renderRulesText(value.text)}</Fragment>;
    case "underline":
      return (
        <span key={key} style={{ textDecoration: "underline" }}>
          {renderInlineText(value.text, options)}
        </span>
      );
    case "glyph":
      return (
        <InlineGlyph
          key={key}
          glyph={value.glyph}
          color={value.color}
          label={value.label}
        />
      );
    case "inline":
      return (
        <Fragment key={key}>
          {value.parts.map((part, i) => renderRichText(part, i, options))}
        </Fragment>
      );
    case "note":
      return (
        <div
          key={key}
          style={{ color: token("--text-muted"), fontStyle: "italic" }}
        >
          {renderInlineText(value.text, options)}
        </div>
      );
    case "stack":
      return (
        <div
          key={key}
          style={{ display: "flex", flexDirection: "column", gap: STACK_GAP }}
        >
          {value.parts.map((part, i) => renderRichText(part, i, options))}
        </div>
      );
    case "definitions":
      return (
        <dl
          key={key}
          style={{
            display: "flex",
            flexDirection: "column",
            margin: 0,
            color: token("--text-primary"),
            lineHeight: 1.25,
          }}
        >
          {value.entries.map((entry, index) => (
            <div
              key={`${entry.term}-${String(index)}`}
              data-definition-row={index}
            >
              {index === 0 ? null : (
                <span
                  aria-hidden="true"
                  data-definition-divider=""
                  style={GLOSSARY_DEFINITION_DIVIDER_STYLE}
                />
              )}
              {entry.termPresentation === "definitionOnly" ? (
                <dd style={{ display: "inline", margin: 0 }}>
                  {renderDefinitionText(entry.definition, options)}
                </dd>
              ) : (
                <>
                  <dt
                    style={{
                      display: "inline",
                      fontWeight: 700,
                    }}
                  >
                    {entry.symbol === undefined ? null : (
                      <DefinitionSymbol
                        symbol={entry.symbol}
                        title={
                          entry.termPresentation === "symbolOnly"
                            ? entry.term
                            : undefined
                        }
                        trailingGap={entry.termPresentation !== "symbolOnly"}
                      />
                    )}
                    {entry.termPresentation === "symbolOnly"
                      ? null
                      : renderInlineText(entry.term, options)}
                  </dt>
                  <dd style={{ display: "inline", margin: 0 }}>
                    {": "}
                    {renderDefinitionText(entry.definition, options)}
                  </dd>
                </>
              )}
            </div>
          ))}
        </dl>
      );
  }
}

/** Renders a {@link RichText} value inline. */
export function RichTextView({ value }: { value: RichText }): ReactElement {
  return <>{renderRichText(value)}</>;
}
