import { type CSSProperties, type ReactNode } from "react";
import {
  tokenizeRulesSymbols,
  tokenizeRulesText,
  type TextSegment,
} from "./card-text";
import {
  TRANSFIGURE_MARK_END,
  TRANSFIGURE_MARK_START,
} from "../../../runtime/transfigure-markers";
import {
  BOLT_ICON_CLASS,
  ENERGY_ICON_COLOR,
  SPARK_ICON_COLOR,
} from "../controls/StandaloneGlyph";
import { InlineGlyph } from "../typography/InlineGlyph";
import { type CumulusColor, resolveColor } from "../../primitives/color";
import { GLYPHS } from "../../primitives/glyph";
import type { RulesTextGlossaryOwner } from "../../../data/glossary-terms";
import {
  rulesSymbolGlossaryEntry,
  type GlossaryCatalogEntry,
} from "../../../data/glossary";
import { rulesTextDefinitionCards } from "./rules-text-reveal";
import { useRevealSource } from "../../internal/reveal/context";
import { revealEntityId } from "../../internal/reveal/identity";
import { Pressable } from "../../primitives/Pressable";
import { meaning, opaque, txa, type LocalizedString } from "@trox/runtime";
import { useLocalizer } from "../../../runtime/localization/use-localizer";
import { localizedSourceText } from "../../../runtime/localization/runtime";

/**
 * Renders rules text with:
 *   - the energy `●` glyph swapped for the blue flame (`bxf bx-fire-alt`)
 *   - the spark `✦` glyph swapped for the amber-gold sparkle mark
 *   - the fast marker `❖` (and interrupt `❖❖`) swapped for the filled
 *     lightning bolt(s) shown before the card name in the title bar
 *   - the points `⍟`, lunar `☾`, and memory `⧗` glyphs swapped for their
 *     filled marks (star-circle, moon, brain)
 *   - the trigger marker `▸` rendered as authored Unicode in the surrounding
 *     font and color
 *   - glossary terms rendered as plain prose, with a curated set
 *     of keyword effects and action verbs (`dissolve`, `banish`, `prevent`,
 *     `foresee`, `veil`, `vengeful`, `reclaim`, …) emphasized in the spark
 *     amber so the eye catches them (see `HIGHLIGHTED_TERMS`). The
 *     plain-language definitions travel with named entity reveal specifications
 *     through the shared reveal coordinator.
 *
 * `RulesText` is the canonical block component for card, DreamAvatar,
 * Dreamsign, battle, editor, and reward surfaces. The lower render helpers are
 * passive formatters for structured-copy components whose outer entity owns
 * glossary interaction.
 */

/**
 * White fill for the inline activated-ability bolt, matching the filled bolt
 * the title bar shows before the card name so the two read as the same mark.
 */
const BOLT_ICON_COLOR = "#ffffff";

/**
 * Essence renders as a currency value: the amount in a readable violet glued
 * directly to the filled crypto glyph with no space, the way `2●` reads as an
 * energy value. A bare reference with no amount shows just the glyph. The whole
 * unit — plus the word in front of the amount — stays on one line. The violet
 * matches the purple used for glossary headings and the boon-dreamsign accent.
 */
const ESSENCE_TEXT_COLOR = "#c4b5fd";

/**
 * Journey site names ("draft", "shop", "dream journey", …) are tinted this blue
 * where they appear in front of the word "site"/"sites", so the site a
 * dreamsign refers to reads at a glance. The trailing "site"/"sites" stays in
 * the surrounding text color. Distinct from the spark-amber keyword emphasis
 * and the violet essence currency.
 */
const SITE_NAME_COLOR = "#60a5fa";

/**
 * Symbol types that render as an inline Boxicons mark sized to the surrounding
 * text. Energy and spark keep their dedicated branches below (each pins a
 * resource hue with a matching corner stat); these are the remaining glyphs
 * swapped for a filled icon. The trigger marker stays as authored Unicode and
 * inherits the rules-text font and color.
 */
type RulesSymbolToken = NonNullable<
  ReturnType<typeof rulesSymbolGlossaryEntry>["rulesSymbol"]
>["token"];

function rulesSymbolSpec(
  token: RulesSymbolToken,
  resolver: (token: RulesSymbolToken) => GlossaryCatalogEntry,
) {
  const symbol = resolver(token).rulesSymbol;
  if (symbol === undefined)
    throw new Error(`Missing rules symbol metadata ${token}`);
  const color = (() => {
    switch (symbol.semanticColorRole) {
      case "essence":
        return ESSENCE_TEXT_COLOR;
      case "energy":
        return ENERGY_ICON_COLOR;
      case "spark":
        return SPARK_ICON_COLOR;
      case undefined:
        return undefined;
    }
  })();
  return { glyph: GLYPHS[symbol.glyph], label: symbol.accessibleLabel, color };
}

/**
 * Glossary terms emphasized in the spark amber color wherever they appear in
 * rules text — the keyword effects and action verbs worth drawing the eye to.
 *
 * Membership is keyed on the word form as written (lower-cased), not on the
 * glossary entry, so emphasis can split conjugations of a single entry:
 * `dissolve` and `dissolves` are emphasized while the past-tense `dissolved`
 * is not, and the `support` keyword is emphasized while the `supported`
 * relationship word is not. Terms outside this set — including the named
 * triggers `▸Materialized`, `▸Dissolved`, and `▸Dawn` — render as plain prose.
 */
const HIGHLIGHTED_TERMS: ReadonlySet<string> = new Set([
  // Action verbs.
  "banish",
  "banished",
  "banishes",
  "dissolve",
  "dissolves",
  "discover",
  "erode",
  "eroded",
  "erodes",
  "prevent",
  "prevented",
  "rematerialize",
  "ephemeral",
  "foresee",
  // Static keyword abilities.
  "awakened",
  "awaken",
  "awakens",
  "phasing",
  "support",
  "supports",
  "veil",
  "veiled",
  "reclaim",
  "reclaimed",
  "offering",
  "vengeful",
  // Journey verbs that appear in dreamsign text.
  "enhanced",
  "duplicate",
  "duplicated",
  "duplicates",
  "purge",
  "purged",
  "purges",
  "transfigure",
  "transfigured",
  "transfigures",
]);

const HIGHLIGHTED_TERM_STYLE: CSSProperties = {
  color: `var(--cv-rules-highlight-color, ${SPARK_ICON_COLOR})`,
};

/**
 * Spark-amber emphasis layered onto a highlighted term. The color is a CSS var
 * so a surface with a different rules-box background can retune it — the figment
 * frame's black-on-light box overrides it to a high-contrast deep gold — while
 * every other surface inherits the default spark amber via the fallback.
 */
/**
 * True when a glossary term, by its word form as written (case-insensitive),
 * is emphasized in rules text. Exported for the highlighter tests.
 */
export function isHighlightedRulesTextTerm(word: string): boolean {
  return HIGHLIGHTED_TERMS.has(word.toLowerCase());
}

/** Semantic game object whose authored rules text is being rendered. */
export interface RulesTextOwner {
  /** Object type used to contextualize glossary definitions. */
  readonly kind: RulesTextGlossaryOwner;
  /** Stable UUID or domain id for this exact rules-text owner. */
  readonly id: string;
}

export interface RulesTextProps {
  /** The rules text to render. */
  readonly text: LocalizedString;
  /** Semantic owner required for context-sensitive glossary definitions. */
  readonly owner: RulesTextOwner;
  /**
   * `source` makes the complete text block one glossary reveal target.
   * `delegated` renders passive copy inside an entity that owns the reveal.
   * @default "source"
   */
  readonly glossaryInteraction?: "source" | "delegated";
}

interface RenderRulesTextOptions {
  /**
   * When set, runs of text wrapped in transfigure markers (see
   * `TRANSFIGURE_MARK_START` / `TRANSFIGURE_MARK_END`) are painted in this color
   * and given a slightly heavier weight, so only the transfigured span of a
   * card's rules text is tinted. Text outside the markers renders normally.
   */
  highlightColor?: CumulusColor;
  rulesSymbolResolver?: (token: RulesSymbolToken) => GlossaryCatalogEntry;
}

/** One run of a paragraph, flagged for whether it is a transfigured span. */
interface MarkerChunk {
  text: string;
  highlighted: boolean;
}

/**
 * Splits a paragraph on the transfigure marker characters into alternating
 * plain and highlighted runs. Markers are placed at clause/word boundaries by
 * `buildTransfigurationDisplay`, so each run tokenizes cleanly on its own.
 */
function splitOnMarkers(paragraph: string): MarkerChunk[] {
  const chunks: MarkerChunk[] = [];
  let buffer = "";
  let highlighted = false;
  for (const ch of paragraph) {
    if (ch === TRANSFIGURE_MARK_START || ch === TRANSFIGURE_MARK_END) {
      if (buffer.length > 0) {
        chunks.push({ text: buffer, highlighted });
        buffer = "";
      }
      highlighted = ch === TRANSFIGURE_MARK_START;
      continue;
    }
    buffer += ch;
  }
  if (buffer.length > 0) {
    chunks.push({ text: buffer, highlighted });
  }
  return chunks;
}

/** Strips any stray transfigure markers from a string. */
function stripMarkers(text: string): string {
  return text
    .split(TRANSFIGURE_MARK_START)
    .join("")
    .split(TRANSFIGURE_MARK_END)
    .join("");
}

function renderSegment(
  segment: TextSegment,
  key: number | string,
  options: RenderRulesTextOptions,
): ReactNode {
  if (segment.kind === "text") {
    return <span key={key}>{segment.value}</span>;
  }
  if (segment.kind === "nobreak") {
    return (
      <span key={key} style={{ whiteSpace: "nowrap" }}>
        {segment.segments.map((inner, j) =>
          renderSegment(inner, `${key}-${j}`, options),
        )}
      </span>
    );
  }
  if (segment.kind === "essence") {
    const symbol = rulesSymbolSpec(
      "essence",
      options.rulesSymbolResolver ?? rulesSymbolGlossaryEntry,
    );
    // Essence renders as a currency value: the amount in violet glued directly
    // to the filled crypto glyph with no space (`50◆`), the way `2●` reads as an
    // energy value. A bare reference (no amount) shows just the glyph. The unit
    // stays on one line.
    return (
      <span key={key} style={{ color: symbol.color, whiteSpace: "nowrap" }}>
        {segment.amount !== null ? segment.amount : null}
        <InlineGlyph
          glyph={symbol.glyph}
          label={localizedSourceText(symbol.label)}
        />
      </span>
    );
  }
  if (segment.kind === "siteName") {
    // A journey site name written before "site"/"sites" reads in blue; the word
    // "site" itself stays in the surrounding text color.
    return (
      <span key={key} style={{ color: SITE_NAME_COLOR }}>
        {segment.value}
      </span>
    );
  }
  if (segment.kind === "term") {
    // Glossary terms read as plain prose; their definitions surface beside the
    // card in its hover-help panel rather than as per-word tooltips. A curated
    // set of keyword effects and action verbs carries a spark-amber emphasis so
    // the eye still catches them.
    return (
      <span
        key={key}
        style={
          isHighlightedRulesTextTerm(segment.word)
            ? HIGHLIGHTED_TERM_STYLE
            : undefined
        }
      >
        {segment.word}
      </span>
    );
  }
  if (segment.kind === "bolt") {
    // The fast/interrupt marker renders as the filled lightning bolt — the same
    // white mark the title bar shows before the card name. A fast ability draws
    // one bolt; an interrupt draws two bolts pulled together so they almost
    // touch (matching the title-bar treatment). The whole group stays on one
    // line.
    return <RulesTextBolt key={key} count={segment.count} />;
  }
  if (segment.symbol === "trigger") {
    return <span key={key}>{segment.char}</span>;
  }
  if (segment.symbol === "energy") {
    const symbol = rulesSymbolSpec(
      "energy",
      options.rulesSymbolResolver ?? rulesSymbolGlossaryEntry,
    );
    // The inline energy glyph renders as the blue flame mark, so a `●3` reads as
    // the same resource as the corner energy stat. Its one-em inline box flows
    // like a character and follows the current font's capital height.
    return (
      <span
        key={key}
        style={{
          // A var so a light-box surface (the figment frame) can render the
          // resource glyph in its own text color instead of the bright resource
          // hue, which is hard to read on a pale fill. Defaults to the resource
          // color everywhere else.
          color: `var(--cv-rules-energy-color, ${symbol.color})`,
        }}
      >
        <InlineGlyph
          glyph={symbol.glyph}
          label={localizedSourceText(symbol.label)}
        />
      </span>
    );
  }
  if (segment.symbol === "spark") {
    const symbol = rulesSymbolSpec(
      "spark",
      options.rulesSymbolResolver ?? rulesSymbolGlossaryEntry,
    );
    // The inline spark glyph renders as the amber-gold single-sparkle mark, so a
    // `1✦` reads as the same resource as the corner spark stat (which uses the
    // busier multi-star glyph at its larger size). Its one-em inline box follows
    // the current font's capital height.
    return (
      <span
        key={key}
        style={{
          // See the energy glyph above: a var so the figment's light box can
          // render the spark in its black text color rather than the gold
          // resource hue, which is hard to read on the pale fill.
          color: `var(--cv-rules-spark-color, ${symbol.color})`,
        }}
      >
        <InlineGlyph
          glyph={symbol.glyph}
          label={localizedSourceText(symbol.label)}
        />
      </span>
    );
  }
  if (
    segment.symbol === "essence" ||
    segment.symbol === "points" ||
    segment.symbol === "lunar" ||
    segment.symbol === "store"
  ) {
    const symbol = rulesSymbolSpec(
      segment.symbol,
      options.rulesSymbolResolver ?? rulesSymbolGlossaryEntry,
    );
    return (
      <span key={key} style={{ color: symbol.color }}>
        <InlineGlyph
          glyph={symbol.glyph}
          label={localizedSourceText(symbol.label)}
        />
      </span>
    );
  }
  return (
    <span key={key} className="font-bold">
      {segment.char}
    </span>
  );
}

function RulesTextBolt({ count }: { readonly count: number }) {
  const resolve = useLocalizer();
  const label =
    count >= 2
      ? txa(
          meaning("rules-interrupt-marker-name", "Interrupt"),
          {},
          "Accessible name for the paired rules-text bolt marker.",
        )
      : txa(
          meaning("rules-fast-marker-name", "Fast"),
          {},
          "Accessible name for the single rules-text bolt marker.",
        );
  return (
    <span
      aria-label={resolve(label)}
      style={{ color: BOLT_ICON_COLOR, whiteSpace: "nowrap" }}
    >
      {Array.from({ length: count }, (_, index) => (
        <span
          key={index}
          style={{ marginLeft: index === 0 ? undefined : "-0.35em" }}
        >
          <InlineGlyph glyph={BOLT_ICON_CLASS} />
        </span>
      ))}
    </span>
  );
}

/**
 * Splits rules text into ability paragraphs.
 *
 * Cards in `data/cards.toml` separate distinct abilities with
 * a blank line (`\n\n`). Each chunk between blank lines is one ability and
 * renders as its own paragraph block so the player can tell adjacent
 * abilities apart. A single-ability card produces exactly one paragraph and
 * no inter-ability gap. See backlog task 029.
 *
 * Surrounding whitespace and stray empty strings are trimmed so a leading
 * newline (some TOML entries open with `"""\n`) does not produce an empty
 * paragraph.
 */
function splitRulesTextIntoParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);
}

/**
 * Top margin applied to every ability paragraph after the first, sizing the
 * blank line that separates two abilities to a slim fraction of a full blank
 * line. The margin sits on top of each line's leading, so even a small value
 * reads as a clear break between abilities; keeping it tight packs more
 * abilities into the fixed text box (and lets more cards hold the rules-text
 * cap before the font shrinks) while still reading as separate "list items"
 * rather than "essay paragraphs".
 *
 * The actual size lives in the `--cv-paragraph-gap` component variable (see
 * `CardView.css`) so it can be tuned alongside the other card-view spacing
 * variables. It is expressed in `em` there so it scales with the surrounding
 * (possibly auto-shrunk) font size. The literal fallback keeps the gap sane on
 * any surface that renders rules text without the card-view token in scope.
 * See backlog task 029.
 */
const PARAGRAPH_GAP = "var(--cv-paragraph-gap, 0.22em)";

/** Renders the parsed rules text segments to React nodes. */
export function renderRulesText(
  text: string,
  options: RenderRulesTextOptions = {},
): ReactNode[] {
  const paragraphs = splitRulesTextIntoParagraphs(text);
  return paragraphs.map((paragraph, p) => {
    const style: CSSProperties = p === 0 ? {} : { marginTop: PARAGRAPH_GAP };
    return (
      <div key={p} data-rules-text-paragraph="" style={style}>
        {renderParagraph(paragraph, p, options)}
      </div>
    );
  });
}

/**
 * Renders one ability paragraph. With a `highlightColor` set, the paragraph is
 * split on transfigure markers so each transfigured run is tokenized on its own
 * and wrapped in a tinted, slightly heavier span; runs outside the markers
 * render normally. Without a highlight color any stray markers are stripped and
 * the paragraph tokenizes as a single run.
 */
function renderParagraph(
  paragraph: string,
  p: number,
  options: RenderRulesTextOptions,
): ReactNode[] {
  if (options.highlightColor === undefined) {
    const segments = tokenizeRulesText(stripMarkers(paragraph));
    return segments.map((segment, i) =>
      renderSegment(segment, `${p}-${i}`, options),
    );
  }
  // Narrowed to defined here; hoist to a const so it stays typed inside the map
  // closure (property-access narrowing does not persist across closures).
  const highlightColor = resolveColor(options.highlightColor);
  const chunks = splitOnMarkers(paragraph);
  return chunks.map((chunk, c) => {
    const segments = tokenizeRulesText(chunk.text);
    const nodes = segments.map((segment, i) =>
      renderSegment(segment, `${p}-${c}-${i}`, options),
    );
    if (!chunk.highlighted) {
      return <span key={`${p}-${c}`}>{nodes}</span>;
    }
    return (
      <span
        key={`${p}-${c}`}
        data-transfigured=""
        style={{ color: highlightColor, fontWeight: 600 }}
      >
        {nodes}
      </span>
    );
  });
}

/**
 * Renders rules text markup without paragraph containers so a structured copy
 * model can keep a label and its definition in one continuous line. Multiple
 * authored paragraphs are joined with a space because the caller owns the
 * surrounding block layout.
 */
export function renderRulesTextInline(text: string): ReactNode[] {
  return splitRulesTextIntoParagraphs(text).flatMap((paragraph, index) => [
    ...(index === 0 ? [] : [<span key={`separator-${String(index)}`}> </span>]),
    ...renderParagraph(paragraph, index, {}),
  ]);
}

/**
 * Renders canonical rules symbols inline while preserving surrounding prose.
 * Trigger markers normalize to the compact authored form (`▸Dawn`).
 */
export function renderRulesSymbolsInline(
  text: string,
  options: Pick<RenderRulesTextOptions, "rulesSymbolResolver"> = {},
): ReactNode[] {
  return tokenizeRulesSymbols(stripMarkers(text)).map((segment, segmentIndex) =>
    renderSegment(segment, segmentIndex, options),
  );
}

function rulesTextEntityType(owner: RulesTextOwner): string {
  switch (owner.kind) {
    case "card":
      return "card-rules-text";
    case "dreamAvatar":
      return "dream-avatar-rules-text";
    case "dreamsign":
      return "dreamsign-rules-text";
  }
}

function rulesTextAriaLabel(owner: RulesTextOwner, text: LocalizedString) {
  if (owner.kind === "card") {
    return txa(
      "Card rules: {rules_text}",
      { rules_text: opaque(text) },
      "Accessible name for interactive authored card rules text.",
    );
  }
  if (owner.kind === "dreamAvatar") {
    return txa(
      "Avatar ability: {rules_text}",
      { rules_text: opaque(text) },
      "Accessible name for interactive authored Dream Avatar rules text.",
    );
  }
  return txa(
    "Dreamsign ability: {rules_text}",
    { rules_text: opaque(text) },
    "Accessible name for interactive authored Dreamsign rules text.",
  );
}

function RulesTextSource({
  text,
  owner,
  content,
}: {
  readonly text: LocalizedString;
  readonly owner: RulesTextOwner;
  readonly content: ReactNode;
}) {
  const entityType = rulesTextEntityType(owner);
  const binding = useRevealSource({
    identity: {
      entityType,
      entityId: revealEntityId(entityType, owner.id),
    },
    spec: {
      primary: { kind: "source", description: text },
      secondaries: rulesTextDefinitionCards(text, owner.kind),
    },
    feedback: "stationary",
  });
  return (
    <Pressable
      as="div"
      ref={binding.ref}
      {...binding.sourceProps}
      hoverFeedback="stationary"
      pressFeedback="stationary"
      tabIndex={0}
      ariaLabelMessage={rulesTextAriaLabel(owner, text)}
      data-rules-text-source={owner.id}
      data-rules-text-owner={owner.kind}
      style={{
        ...binding.sourceProps.style,
        display: "block",
        width: "100%",
        cursor: "default",
      }}
    >
      {content}
    </Pressable>
  );
}

/**
 * Renders rules text in authored ability paragraphs.
 *
 * Use as a drop-in for any place that prints `card.renderedText`,
 * `dreamAvatar.renderedText`, or `dreamsign.effectDescription` raw — the
 * tokenizer handles the symbol substitution and glossary-term emphasis.
 */
export function RulesText({
  text,
  owner,
  glossaryInteraction = "source",
}: RulesTextProps) {
  const resolve = useLocalizer();
  const content = renderRulesText(resolve(text));
  const hasDefinitions = rulesTextDefinitionCards(text, owner.kind).length > 0;
  if (glossaryInteraction === "delegated" || !hasDefinitions) {
    return <>{content}</>;
  }
  return <RulesTextSource text={text} owner={owner} content={content} />;
}
