import type { CardData } from "../types/cards";
import type {
  TransfigurationChange,
  TransfigurationType,
} from "../types/journey";
import {
  TRANSFIGURE_MARK_END,
  TRANSFIGURE_MARK_START,
} from "../runtime/transfigure-markers";
import type { CardTransfigurationDisplay } from "../runtime/transfiguration-display";
import { transfigurationForm } from "../data/transfiguration-data";
import type {
  TransfigurationData,
  TransfigurationEligibility,
  TransfigurationFormDefinition,
  TransfigurationOperation,
} from "../types/transfiguration-data";

// The card-display constants and the display descriptor type live in
// `src/runtime/transfiguration-display.ts` so the Cumulus UI library can import
// the card-rendering pieces without reaching into this game-logic module. They
// are re-exported here so this module's existing consumers keep importing them
// from `transfiguration-logic`.
export type { CardTransfigurationDisplay };

/**
 * Private-use sentinel characters that wrap a transfigured span inside a card's
 * marked rules text. {@link renderRulesText} (via the `highlightColor` option)
 * splits a paragraph on these and paints the wrapped run in the transfiguration
 * tint. They are placed exactly where a change happens — around an appended
 * clause, a replaced phrase, or a bumped number — so only the modified text is
 * tinted, never the printed text that came with the card.
 */
export { TRANSFIGURE_MARK_END, TRANSFIGURE_MARK_START };

function mark(text: string): string {
  return TRANSFIGURE_MARK_START + text + TRANSFIGURE_MARK_END;
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
 * in lockstep with the transfigured rules text. Perfected chains every
 * applicable change, marking each one.
 */
export function buildTransfigurationDisplay(
  data: TransfigurationData,
  original: CardData,
  type: TransfigurationType,
): TransfiguredCard {
  const definition = transfigurationForm(data, type);
  const steps = operationSteps(data, original, definition);

  let card = original;
  let markedText = original.renderedText;
  let energyChanged = false;
  let sparkChanged = false;
  let fastChanged = false;

  for (const step of steps) {
    const stepDefinition = transfigurationForm(data, step);
    if (
      stepDefinition.operation.kind === "halveEnergyCost" ||
      stepDefinition.operation.kind === "doubleSpark"
    ) {
      const result = applyStatStep(card, stepDefinition.operation);
      card = result.card;
      energyChanged = energyChanged || result.energyChanged;
      sparkChanged = sparkChanged || result.sparkChanged;
      continue;
    }
    if (stepDefinition.operation.kind === "setFast") {
      if (!card.isFast) {
        card = { ...card, isFast: true };
        fastChanged = true;
      }
      continue;
    }
    if (stepDefinition.operation.kind === "useAuthoredAmplifiedText") {
      const transform = amplifiedTransform(card);
      if (transform === null) continue;
      markedText = transform.marked(markedText);
      card = { ...card, renderedText: transform.plain(card.renderedText) };
      continue;
    }
    // The transform is decided from the current plain text, then applied both
    // to the plain text (the card) and to the accumulated marked text (which
    // carries earlier steps' markers): the same find pattern lands in the same
    // place because the markers are invisible private-use characters.
    const transform = textTransformFor(
      card.renderedText,
      stepDefinition.operation,
    );
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
      form: definition,
      markedText,
      energyChanged,
      sparkChanged,
      fastChanged,
    },
  };
}

/** A prepared transfiguration offer with a pre-computed semantic change. */
export interface TransfigurationOffer {
  type: TransfigurationType;
  form: TransfigurationFormDefinition;
  change: TransfigurationChange;
  previewCard: CardData;
}

/** Evaluate one compiler-validated eligibility predicate without form identity. */
export function isTransfigurationEligibilitySatisfied(
  data: TransfigurationData,
  card: CardData,
  eligibility: TransfigurationEligibility,
): boolean {
  switch (eligibility.kind) {
    case "positiveEnergyCost":
      return card.energyCost !== null && card.energyCost > 0;
    case "distinctAuthoredAmplifiedText":
      return (
        card.amplifiedText !== undefined &&
        card.amplifiedText.trim().length > 0 &&
        card.amplifiedText !== card.renderedText
      );
    case "cardType":
      return card.cardType === eligibility.cardType;
    case "eventWithoutFast":
      return card.cardType === "Event" && !card.isFast;
    case "namedTrigger":
      return resonantTransform(card.renderedText) !== null;
    case "activatedEnergyCost":
      return attunedTransform(card.renderedText, 1, 0) !== null;
    case "atLeastEligibleForms":
      return eligibleDefinitions(data, card, false).length >= eligibility.count;
  }
}

function eligibleDefinitions(
  data: TransfigurationData,
  card: CardData,
  includeComposite: boolean,
): TransfigurationFormDefinition[] {
  return data.site.formOrder
    .map((id) => transfigurationForm(data, id))
    .filter(
      (definition) =>
        (includeComposite ||
          definition.operation.kind !== "applyEligibleForms") &&
        isTransfigurationEligibilitySatisfied(
          data,
          card,
          definition.eligibility,
        ),
    );
}

/** Returns the list of transfiguration types the card is eligible for. */
export function eligibleTransfigurations(
  data: TransfigurationData,
  card: CardData,
): TransfigurationType[] {
  return eligibleDefinitions(data, card, true).map(
    (definition) => definition.id,
  );
}

function operationSteps(
  data: TransfigurationData,
  card: CardData,
  definition: TransfigurationFormDefinition,
): TransfigurationType[] {
  const operation = definition.operation;
  if (operation.kind !== "applyEligibleForms") return [definition.id];
  return operation.formOrder.filter((id) => {
    const definition = transfigurationForm(data, id);
    return isTransfigurationEligibilitySatisfied(
      data,
      card,
      definition.eligibility,
    );
  });
}

/**
 * Applies a transfiguration to a card, returning the modified card. This is
 * deterministic so the same badge produces the same battle card every time.
 * Perfected applies every other transfiguration the card is eligible for.
 */
export function applyTransfigurationToCard(
  data: TransfigurationData,
  card: CardData,
  type: TransfigurationType,
): CardData {
  const definition = transfigurationForm(data, type);
  if (definition.operation.kind === "applyEligibleForms") {
    let result = card;
    for (const step of operationSteps(data, card, definition)) {
      result = applyTransfigurationToCard(data, result, step);
    }
    return result;
  }
  if (
    definition.operation.kind === "halveEnergyCost" ||
    definition.operation.kind === "doubleSpark"
  )
    return applyStatStep(card, definition.operation).card;
  if (definition.operation.kind === "setFast")
    return card.isFast ? card : { ...card, isFast: true };
  if (definition.operation.kind === "useAuthoredAmplifiedText")
    return isTransfigurationEligibilitySatisfied(
      data,
      card,
      definition.eligibility,
    )
      ? { ...card, renderedText: card.amplifiedText! }
      : card;
  const transform = textTransformFor(card.renderedText, definition.operation);
  if (transform === null) {
    return card;
  }
  return { ...card, renderedText: transform.plain(card.renderedText) };
}

/** The result of a stat-only transfiguration step (Empowered or Kindled). */
interface StatStepResult {
  card: CardData;
  energyChanged: boolean;
  sparkChanged: boolean;
}

/**
 * Applies a stat-only step: Empowered halves the energy cost (rounded down, so a
 * 1● card becomes free), Kindled doubles the base spark (or sets a 0-spark
 * character to 1). The flags drive which corner stat orb receives a shape
 * badge in the card display.
 */
function applyStatStep(
  card: CardData,
  operation: Extract<
    TransfigurationOperation,
    { kind: "halveEnergyCost" | "doubleSpark" }
  >,
): StatStepResult {
  if (operation.kind === "halveEnergyCost") {
    if (card.energyCost === null || card.energyCost <= 0) {
      return { card, energyChanged: false, sparkChanged: false };
    }
    // Halving the cost recomputes a single energy value, so drop any printed
    // multi-cost orb labels: leaving them would make the display ignore the
    // halved cost and render the stale pre-Empowered orbs.
    const { energyCosts: _energyCosts, ...rest } = card;
    return {
      card: {
        ...rest,
        energyCost: Math.max(
          operation.minimum,
          Math.floor(card.energyCost / 2),
        ),
      },
      energyChanged: true,
      sparkChanged: false,
    };
  }
  const oldSpark = card.spark ?? 0;
  return {
    card: {
      ...card,
      spark: oldSpark === 0 ? operation.zeroResult : oldSpark * 2,
    },
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
 * composes correctly when Perfected chains several steps.
 */
function textTransformFor(
  text: string,
  operation: TransfigurationOperation,
): TextTransform | null {
  switch (operation.kind) {
    case "appendRulesClause":
      return appendTransform(
        operation.clause === "DrawCard" ? "Draw a card." : "Reclaim.",
      );
    case "widenNamedTrigger":
      return resonantTransform(text);
    case "reduceActivatedEnergyCost":
      return attunedTransform(text, operation.amount, operation.minimum);
    case "halveEnergyCost":
    case "useAuthoredAmplifiedText":
    case "doubleSpark":
    case "setFast":
    case "applyEligibleForms":
      return null;
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

/** Splits rules text into stable diff units while retaining all whitespace. */
function diffTokens(text: string): string[] {
  return text.match(/\s+|[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu) ?? [];
}

/** Marks every token introduced by an authored replacement. */
function markAuthoredReplacement(
  original: string,
  replacement: string,
): string {
  const before = diffTokens(original);
  const after = diffTokens(replacement);
  const lengths = Array.from({ length: before.length + 1 }, () =>
    Array<number>(after.length + 1).fill(0),
  );
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      lengths[i][j] =
        before[i] === after[j]
          ? lengths[i + 1][j + 1] + 1
          : Math.max(lengths[i + 1][j], lengths[i][j + 1]);
    }
  }

  const output: string[] = [];
  let added = "";
  const flushAdded = (): void => {
    if (added.length > 0) {
      output.push(mark(added));
      added = "";
    }
  };
  let i = 0;
  let j = 0;
  while (i < before.length || j < after.length) {
    if (i < before.length && j < after.length && before[i] === after[j]) {
      flushAdded();
      output.push(after[j]);
      i += 1;
      j += 1;
    } else if (
      i < before.length &&
      (j >= after.length || lengths[i + 1][j] >= lengths[i][j + 1])
    ) {
      i += 1;
    } else {
      added += after[j];
      j += 1;
    }
  }
  flushAdded();
  return output.join("");
}

function amplifiedTransform(card: CardData): TextTransform | null {
  if (
    card.amplifiedText === undefined ||
    card.amplifiedText.trim() === "" ||
    card.amplifiedText === card.renderedText
  )
    return null;
  const replacement = card.amplifiedText;
  return {
    plain: () => replacement,
    marked: () => markAuthoredReplacement(card.renderedText, replacement),
  };
}

/**
 * Resonant widens a named trigger's reach by adding a keyword, tinting only the
 * added keyword:
 *   - `▸Dawn:` also fires on materialize → `▸Materialized, Dawn:`
 *   - `▸Materialized:` also fires on dissolve → `▸Materialized, Dissolved:`
 *   - `once per turn` → `any number of times per turn`
 */
function resonantTransform(text: string): TextTransform | null {
  if (/once per turn/i.test(text)) {
    return {
      plain: (t) => t.replace(/once per turn/i, "any number of times per turn"),
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
const ATTUNED_COST_PATTERN = /([1-9]\d*)●(?=[^:.\n]*:)/;

/**
 * Attuned reduces an activated ability's energy cost by 1, tinting only the
 * changed number (the `●` glyph keeps its resource hue).
 */
function attunedTransform(
  text: string,
  amount: number,
  minimum: number,
): TextTransform | null {
  const match = ATTUNED_COST_PATTERN.exec(text);
  if (match === null) {
    return null;
  }
  const token = `${match[1]}●`;
  const newNum = String(Math.max(minimum, parseInt(match[1], 10) - amount));
  return {
    plain: (t) => t.replace(token, `${newNum}●`),
    marked: (t) => t.replace(token, `${mark(newNum)}●`),
  };
}

/** Builds the preview card and description for a given transfiguration type. */
function buildOffer(
  data: TransfigurationData,
  card: CardData,
  type: TransfigurationType,
): TransfigurationOffer {
  const form = transfigurationForm(data, type);
  const previewCard = applyTransfigurationToCard(data, card, type);
  switch (form.operation.kind) {
    case "halveEnergyCost":
      return {
        type,
        form,
        change: {
          kind: "energy-delta",
          from: card.energyCost ?? 0,
          to: previewCard.energyCost ?? 0,
        },
        previewCard,
      };
    case "doubleSpark":
      return {
        type,
        form,
        change: {
          kind: "spark-delta",
          from: card.spark ?? 0,
          to: previewCard.spark ?? 0,
        },
        previewCard,
      };
    case "appendRulesClause":
      return {
        type,
        form,
        change:
          form.operation.clause === "DrawCard"
            ? { kind: "added-draw" }
            : { kind: "added-reclaim" },
        previewCard,
      };
    case "setFast":
      return { type, form, change: { kind: "added-fast" }, previewCard };
    case "useAuthoredAmplifiedText": {
      return {
        type,
        form,
        change: {
          kind: "amplified-rules",
          rulesText: previewCard.renderedText,
        },
        previewCard,
      };
    }
    case "widenNamedTrigger":
      return {
        type,
        form,
        change: { kind: "widened-trigger" },
        previewCard,
      };
    case "reduceActivatedEnergyCost":
      return {
        type,
        form,
        change: {
          kind: "reduced-activated-cost",
          amount: form.operation.amount,
        },
        previewCard,
      };
    case "applyEligibleForms":
      return {
        type,
        form,
        change: { kind: "all-available" },
        previewCard,
      };
  }
}

/**
 * Every transfiguration form the Transfiguration site offers for a card: one
 * full offer per eligible form, in catalog order. Composite forms are excluded
 * so the player's choice between the
 * individual forms stays meaningful — Perfected (which folds in every other
 * form) would otherwise dominate the list and make the choice moot. Returns an
 * empty array when the card already carries a transfiguration or no form
 * applies.
 */
export function offeredTransfigurationForms(
  data: TransfigurationData,
  card: CardData,
  existingTransfiguration: TransfigurationType | null,
): TransfigurationOffer[] {
  if (existingTransfiguration !== null) {
    return [];
  }
  return eligibleDefinitions(data, card, false).map((definition) =>
    buildOffer(data, card, definition.id),
  );
}

/**
 * Assigns a random eligible transfiguration to a card and returns
 * the complete offer with pre-computed preview and semantic change.
 * Returns null if the card already has a transfiguration or no types
 * are eligible.
 */
export function assignTransfiguration(
  data: TransfigurationData,
  card: CardData,
  existingTransfiguration: TransfigurationType | null,
): TransfigurationOffer | null {
  if (existingTransfiguration !== null) {
    return null;
  }
  const eligible = eligibleTransfigurations(data, card);
  if (eligible.length === 0) {
    return null;
  }
  const chosen = eligible[Math.floor(Math.random() * eligible.length)];
  return buildOffer(data, card, chosen);
}

/** Returns the semantic change produced by a transfiguration. */
export function describeTransfiguration(
  data: TransfigurationData,
  card: CardData,
  type: TransfigurationType,
): TransfigurationChange {
  return buildOffer(data, card, type).change;
}

/** Returns a record of the specific fields modified by a transfiguration offer. */
export function transfigurationEffectDetails(
  offer: TransfigurationOffer,
  originalCard: CardData,
): Record<string, unknown> {
  const details: Record<string, unknown> = { cardId: originalCard.id };
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
