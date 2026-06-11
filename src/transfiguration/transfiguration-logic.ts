import type { CardData } from "../types/cards";
import type { TransfigurationType } from "../types/quest";

/** Color hex value for each transfiguration type. */
export const TRANSFIGURATION_COLORS: Readonly<
  Record<TransfigurationType, string>
> = {
  Viridian: "#10b981",
  Golden: "#f59e0b",
  Scarlet: "#ef4444",
  Azure: "#3b82f6",
  Bronze: "#d97706",
  Magenta: "#d946ef",
  Rose: "#f43f5e",
  Prismatic: "#a855f7",
};

/**
 * Lighter pastel tints used to paint the transfigured parts of a card itself —
 * the name gem, the changed stat orb, and the added/changed rules text. These
 * sit a few shades lighter than {@link TRANSFIGURATION_COLORS} (which stay
 * saturated for borders, badges, and selection glows) so the tinted text reads
 * clearly over the card's dark frosted chrome while still reading as the same
 * color family. Each value is the Tailwind 300-level pastel of its type's hue.
 */
export const TRANSFIGURATION_TINT_COLORS: Readonly<
  Record<TransfigurationType, string>
> = {
  Viridian: "#6ee7b7",
  Golden: "#fcd34d",
  Scarlet: "#fca5a5",
  Azure: "#93c5fd",
  Bronze: "#f0c08a",
  Magenta: "#f0abfc",
  Rose: "#fda4af",
  Prismatic: "#d8b4fe",
};

/**
 * Private-use sentinel characters that wrap a transfigured span inside a card's
 * marked rules text. {@link renderRulesText} (via the `highlightColor` option)
 * splits a paragraph on these and paints the wrapped run in the transfiguration
 * tint. They are placed exactly where a change happens — around an appended
 * clause, a replaced phrase, or a bumped number — so only the modified text is
 * tinted, never the printed text that came with the card.
 */
export const TRANSFIGURE_MARK_START = "\u{E000}";
export const TRANSFIGURE_MARK_END = "\u{E001}";

function mark(text: string): string {
  return TRANSFIGURE_MARK_START + text + TRANSFIGURE_MARK_END;
}

/**
 * Everything a {@link CardView} needs to paint a card as transfigured: the tint
 * color, the rules text with its changed spans wrapped in transfigure markers,
 * and flags for which corner stats changed. Computed by
 * {@link buildTransfigurationDisplay}.
 */
export interface CardTransfigurationDisplay {
  type: TransfigurationType;
  /** Light tint for the name gem, changed stat orb(s), and changed text. */
  color: string;
  /** Rules text with the changed/added spans wrapped in transfigure markers. */
  markedText: string;
  /** True when the energy cost changed (Viridian); tints the energy orb. */
  energyChanged: boolean;
  /** True when the spark changed (Scarlet); tints the spark orb. */
  sparkChanged: boolean;
}

/** A transfigured card paired with the display descriptor that paints it. */
export interface TransfiguredCard {
  /** The transfigured card: updated stats and rules text, no markers. */
  card: CardData;
  /** Pass to a `CardView`'s `transfiguration` prop to paint the changes. */
  display: CardTransfigurationDisplay;
}

/**
 * Builds the transfigured card and its display descriptor for a given
 * transfiguration type. The returned `card` is identical to
 * {@link applyTransfigurationToCard} (an equivalence test guards this), so the
 * surfaces that only need the mechanical result stay on that function; this is
 * the entry point for surfaces that also paint the change.
 *
 * Markers are laid down alongside the same text edits so the marked text stays
 * in lockstep with the transfigured rules text. Prismatic chains every
 * applicable change, marking each one.
 */
export function buildTransfigurationDisplay(
  original: CardData,
  type: TransfigurationType,
): TransfiguredCard {
  const steps: Exclude<TransfigurationType, "Prismatic">[] =
    type === "Prismatic"
      ? eligibleNonPrismaticTransfigurations(original)
      : [type];

  let card = original;
  let markedText = original.renderedText;
  let energyChanged = false;
  let sparkChanged = false;

  for (const step of steps) {
    if (step === "Viridian" || step === "Scarlet") {
      const result = applyStatStep(card, step);
      card = result.card;
      energyChanged = energyChanged || result.energyChanged;
      sparkChanged = sparkChanged || result.sparkChanged;
      continue;
    }
    // The transform is decided from the current plain text, then applied both
    // to the plain text (the card) and to the accumulated marked text (which
    // carries earlier steps' markers): the same find pattern lands in the same
    // place because the markers are invisible private-use characters.
    const transform = textTransformFor(card.renderedText, step);
    if (transform === null) {
      continue;
    }
    markedText = transform.marked(markedText);
    card = { ...card, renderedText: transform.plain(card.renderedText) };
  }

  return {
    card,
    display: {
      type,
      color: TRANSFIGURATION_TINT_COLORS[type],
      markedText,
      energyChanged,
      sparkChanged,
    },
  };
}

/** A prepared transfiguration offer with pre-computed preview and description. */
export interface TransfigurationOffer {
  type: TransfigurationType;
  description: string;
  previewCard: CardData;
}

/** Returns true if the card is eligible for Viridian transfiguration. */
export function isViridianEligible(card: CardData): boolean {
  return card.energyCost !== null && card.energyCost > 0;
}

/** Returns true if the card's rules text contains at least one digit. */
export function isGoldenEligible(card: CardData): boolean {
  return /\d/.test(card.renderedText);
}

/** Returns true if the card is a Character (eligible for Scarlet). */
export function isScarletEligible(card: CardData): boolean {
  return card.cardType === "Character";
}

/** Returns true if the card is an Event (eligible for Azure). */
export function isAzureEligible(card: CardData): boolean {
  return card.cardType === "Event";
}

/** Returns true if the card is an Event (eligible for Bronze). */
export function isBronzeEligible(card: CardData): boolean {
  return card.cardType === "Event";
}

/**
 * Returns true if the card has a named trigger whose reach Magenta can widen:
 * a `▸Dawn` trigger (which then also fires on materialize), a `▸Materialized`
 * trigger (which then also fires on dissolve), or a `once per turn` clause
 * (which then fires any number of times per turn).
 */
export function isMagentaEligible(card: CardData): boolean {
  return magentaTransform(card.renderedText) !== null;
}

/**
 * Returns true if the card has an activated ability with an energy cost (an
 * `N●` cost token before the ability's colon) that Rose can reduce by 1.
 */
export function isRoseEligible(card: CardData): boolean {
  return roseTransform(card.renderedText) !== null;
}

/**
 * Returns true if the card is eligible for two or more of the other
 * transfigurations — the requirement for Prismatic.
 */
export function isPrismaticEligible(card: CardData): boolean {
  return eligibleNonPrismaticTransfigurations(card).length >= 2;
}

/** Eligibility check functions for every non-Prismatic transfiguration. */
const NON_PRISMATIC_CHECKS: ReadonlyArray<
  [Exclude<TransfigurationType, "Prismatic">, (card: CardData) => boolean]
> = [
  ["Viridian", isViridianEligible],
  ["Golden", isGoldenEligible],
  ["Scarlet", isScarletEligible],
  ["Azure", isAzureEligible],
  ["Bronze", isBronzeEligible],
  ["Magenta", isMagentaEligible],
  ["Rose", isRoseEligible],
];

function eligibleNonPrismaticTransfigurations(
  card: CardData,
): Exclude<TransfigurationType, "Prismatic">[] {
  return NON_PRISMATIC_CHECKS.filter(([, check]) => check(card)).map(
    ([type]) => type,
  );
}

/** Returns the list of transfiguration types the card is eligible for. */
export function eligibleTransfigurations(
  card: CardData,
): TransfigurationType[] {
  const types: TransfigurationType[] = eligibleNonPrismaticTransfigurations(
    card,
  );
  if (isPrismaticEligible(card)) {
    types.push("Prismatic");
  }
  return types;
}

/**
 * Applies a transfiguration to a card, returning the modified card. This is
 * deterministic so the same badge produces the same battle card every time.
 * Prismatic applies every other transfiguration the card is eligible for.
 */
export function applyTransfigurationToCard(
  card: CardData,
  type: TransfigurationType,
): CardData {
  if (type === "Prismatic") {
    let result = card;
    for (const step of eligibleNonPrismaticTransfigurations(card)) {
      result = applyTransfigurationToCard(result, step);
    }
    return result;
  }
  if (type === "Viridian" || type === "Scarlet") {
    return applyStatStep(card, type).card;
  }
  const transform = textTransformFor(card.renderedText, type);
  if (transform === null) {
    return card;
  }
  return { ...card, renderedText: transform.plain(card.renderedText) };
}

/** The result of a stat-only transfiguration step (Viridian or Scarlet). */
interface StatStepResult {
  card: CardData;
  energyChanged: boolean;
  sparkChanged: boolean;
}

/**
 * Applies a stat-only step: Viridian halves the energy cost (rounded), Scarlet
 * doubles the base spark (or sets a 0-spark character to 1). The flags drive
 * which corner stat orb is tinted in the card display.
 */
function applyStatStep(
  card: CardData,
  step: "Viridian" | "Scarlet",
): StatStepResult {
  if (step === "Viridian") {
    if (card.energyCost === null || card.energyCost <= 0) {
      return { card, energyChanged: false, sparkChanged: false };
    }
    return {
      card: { ...card, energyCost: Math.round(card.energyCost / 2) },
      energyChanged: true,
      sparkChanged: false,
    };
  }
  const oldSpark = card.spark ?? 0;
  return {
    card: { ...card, spark: oldSpark === 0 ? 1 : oldSpark * 2 },
    energyChanged: false,
    sparkChanged: true,
  };
}

/**
 * A text-changing transfiguration step expressed as two parallel string edits:
 * `plain` rewrites the printed rules text, while `marked` performs the same
 * rewrite but wraps the changed span in transfigure markers so the card display
 * can tint exactly that span. Both run off the same input text.
 */
interface TextTransform {
  plain: (text: string) => string;
  marked: (text: string) => string;
}

/**
 * Returns the text transform for a text-changing step (or null when the step
 * does not apply to this card). Driven off the current plain text so it
 * composes correctly when Prismatic chains several steps.
 */
function textTransformFor(
  text: string,
  step: Exclude<TransfigurationType, "Prismatic" | "Viridian" | "Scarlet">,
): TextTransform | null {
  switch (step) {
    case "Azure":
      return appendTransform("Draw a card.");
    case "Bronze":
      return appendTransform("Reclaim.");
    case "Golden":
      return goldenTransform(text);
    case "Magenta":
      return magentaTransform(text);
    case "Rose":
      return roseTransform(text);
  }
}

function appendClause(text: string, clause: string): string {
  return text + (text.length > 0 ? " " : "") + clause;
}

/** Appends a clause; the marked variant tints the whole appended clause. */
function appendTransform(clause: string): TextTransform {
  return {
    plain: (text) => appendClause(text, clause),
    marked: (text) => appendClause(text, mark(clause)),
  };
}

/**
 * Golden bumps the first number in the rules text up by one; only the bumped
 * number is tinted, so a neighboring resource glyph (e.g. the `●` of `2●`)
 * keeps its resource hue.
 */
function goldenTransform(text: string): TextTransform | null {
  const match = /\d+/.exec(text);
  if (match === null) {
    return null;
  }
  const oldNum = match[0];
  const newNum = String(parseInt(oldNum, 10) + 1);
  return {
    plain: (t) => t.replace(oldNum, newNum),
    marked: (t) => t.replace(oldNum, mark(newNum)),
  };
}

/**
 * Magenta widens a named trigger's reach by adding a keyword, tinting only the
 * added keyword:
 *   - `▸Dawn:` also fires on materialize → `▸Materialized, Dawn:`
 *   - `▸Materialized:` also fires on dissolve → `▸Materialized, Dissolved:`
 *   - `once per turn` → `any number of times per turn`
 */
function magentaTransform(text: string): TextTransform | null {
  if (/once per turn/i.test(text)) {
    return {
      plain: (t) =>
        t.replace(/once per turn/i, "any number of times per turn"),
      marked: (t) =>
        t.replace(/once per turn/i, mark("any number of times per turn")),
    };
  }
  if (text.includes("▸Dawn")) {
    return {
      plain: (t) => t.replace("▸Dawn", "▸Materialized, Dawn"),
      marked: (t) => t.replace("▸Dawn", `▸${mark("Materialized, ")}Dawn`),
    };
  }
  if (text.includes("▸Materialized:")) {
    return {
      plain: (t) => t.replace("▸Materialized:", "▸Materialized, Dissolved:"),
      marked: (t) =>
        t.replace("▸Materialized:", `▸Materialized${mark(", Dissolved")}:`),
    };
  }
  return null;
}

/**
 * The energy cost token of an activated ability: an `N●` (N ≥ 1) that sits in
 * an ability's cost, i.e. followed by a colon with no sentence break (period,
 * colon, or newline) in between. This skips `N●` amounts that appear inside an
 * effect rather than a cost.
 */
const ROSE_COST_PATTERN = /([1-9]\d*)●(?=[^:.\n]*:)/;

/**
 * Rose reduces an activated ability's energy cost by 1, tinting only the
 * changed number (the `●` glyph keeps its resource hue).
 */
function roseTransform(text: string): TextTransform | null {
  const match = ROSE_COST_PATTERN.exec(text);
  if (match === null) {
    return null;
  }
  const token = `${match[1]}●`;
  const newNum = String(parseInt(match[1], 10) - 1);
  return {
    plain: (t) => t.replace(token, `${newNum}●`),
    marked: (t) => t.replace(token, `${mark(newNum)}●`),
  };
}

/** Builds the preview card and description for a given transfiguration type. */
function buildOffer(
  card: CardData,
  type: TransfigurationType,
): TransfigurationOffer {
  const previewCard = applyTransfigurationToCard(card, type);
  switch (type) {
    case "Viridian":
      return {
        type,
        description: `Energy cost: ${String(card.energyCost ?? 0)} → ${String(previewCard.energyCost ?? 0)}`,
        previewCard,
      };
    case "Scarlet":
      return {
        type,
        description: `Spark: ${String(card.spark ?? 0)} → ${String(previewCard.spark ?? 0)}`,
        previewCard,
      };
    case "Azure":
      return { type, description: "Adds: Draw a card.", previewCard };
    case "Bronze":
      return { type, description: "Adds: Reclaim.", previewCard };
    case "Golden": {
      const match = /\d+/.exec(card.renderedText);
      if (match === null) {
        return {
          type,
          description: "Modifies a number in rules text.",
          previewCard,
        };
      }
      const num = parseInt(match[0], 10);
      return {
        type,
        description: `Number in text: ${String(num)} → ${String(num + 1)}`,
        previewCard,
      };
    }
    case "Magenta":
      return {
        type,
        description: "Widens a named trigger to fire more often.",
        previewCard,
      };
    case "Rose":
      return {
        type,
        description: "Activated ability costs 1 less.",
        previewCard,
      };
    case "Prismatic":
      return {
        type,
        description: "Applies every available transfiguration.",
        previewCard,
      };
  }
}

/**
 * Assigns a random eligible transfiguration to a card and returns
 * the complete offer with pre-computed preview and description.
 * Returns null if the card already has a transfiguration or no types
 * are eligible.
 */
export function assignTransfiguration(
  card: CardData,
  existingTransfiguration: TransfigurationType | null,
): TransfigurationOffer | null {
  if (existingTransfiguration !== null) {
    return null;
  }
  const eligible = eligibleTransfigurations(card);
  if (eligible.length === 0) {
    return null;
  }
  const chosen = eligible[Math.floor(Math.random() * eligible.length)];
  return buildOffer(card, chosen);
}

/** Returns a human-readable description of what a transfiguration does to a card. */
export function describeTransfiguration(
  card: CardData,
  type: TransfigurationType,
): string {
  return buildOffer(card, type).description;
}

/** Returns a record of the specific fields modified by a transfiguration offer. */
export function transfigurationEffectDetails(
  offer: TransfigurationOffer,
  originalCard: CardData,
): Record<string, unknown> {
  const details: Record<string, unknown> = {};
  if (offer.previewCard.energyCost !== originalCard.energyCost) {
    details.energyCost = {
      from: originalCard.energyCost,
      to: offer.previewCard.energyCost,
    };
  }
  if (offer.previewCard.spark !== originalCard.spark) {
    details.spark = {
      from: originalCard.spark,
      to: offer.previewCard.spark,
    };
  }
  if (offer.previewCard.renderedText !== originalCard.renderedText) {
    details.renderedText = {
      from: originalCard.renderedText,
      to: offer.previewCard.renderedText,
    };
  }
  return details;
}
