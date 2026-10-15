import { CARDS } from "../content/cards";
import { FIGMENTS } from "../content/figments";
import type { GameCardModel } from "../cumulus/components/card/CardView";
import { BASE_VARIANT } from "../engine/dsl/types";
import { isTypeRemap } from "../engine/dsl/type-remap";
import { parseFigmentId, type FigmentId } from "../engine/state/ids";
import { cardIdFromUnknown, parseCardId, type CardId, type CardSubtype } from "../types/card-identity";

/** UUID-addressed semantic references; names are resolved only by this display formatter. */
export interface TypeRemapTextMetadata {
  readonly types: readonly CardSubtype[];
  readonly cards: readonly { readonly id: CardId; readonly name: string }[];
  readonly referencedCards: readonly CardId[];
  readonly figments: readonly { readonly id: FigmentId; readonly name: string; readonly subtype: CardSubtype; readonly typeRemapTarget?: boolean }[];
  readonly createdFigments: readonly FigmentId[];
}

const printed = new Map(CARDS.map(card => [parseCardId(card.id), card]));
const metadata = new Map<CardId, TypeRemapTextMetadata>();
const escape = (word: string) => [...word].map(char => "\\^$.*+?()[]{}|".includes(char) ? `\\${char}` : char).join("");
const plural = (word: string) => /child$/iu.test(word) ? `${word}ren` : /companions$/iu.test(word) ? word : /[^aeiou]y$/iu.test(word) ? `${word.slice(0, -1)}ies` : /(?:s|x|ch|sh)$/iu.test(word) ? `${word}es` : `${word}s`;
const withCase = (word: string, sample: string) => sample === sample.toUpperCase() ? word.toUpperCase() : sample[0] === sample[0]?.toUpperCase() ? word : word.toLowerCase();

function sourceMetadata(id: CardId): TypeRemapTextMetadata {
  const cached = metadata.get(id);
  if (cached !== undefined) return cached;
  const card = printed.get(id), referencedCards = new Set<CardId>([id]), createdFigments = new Set<FigmentId>();
  // This read-only walk collects display references, never rewrites or evaluates an instruction.
  const seen = new WeakSet<object>();
  const visit = (value: unknown): void => {
    if (typeof value !== "object" || value === null || seen.has(value)) return;
    seen.add(value);
    if ("op" in value && value.op === "createCard" && "card" in value) {
      const ref = cardIdFromUnknown(value.card);
      if (ref !== null) referencedCards.add(ref);
    }
    if ("op" in value && value.op === "materializeFigments" && "figment" in value && typeof value.figment === "string") createdFigments.add(parseFigmentId(value.figment));
    Object.values(value).forEach(visit);
  };
  for (const amplified of [false, true]) visit(card?.abilities?.({ ...BASE_VARIANT, amplified }));
  const result: TypeRemapTextMetadata = {
    types: [...new Set([...CARDS.filter(item => item.cardType === "Character").map(item => item.subtype), ...FIGMENTS.map(item => item.subtype)])].filter(isTypeRemap),
    cards: [...referencedCards].flatMap(ref => { const source = printed.get(ref); return source === undefined ? [] : [{ id: ref, name: source.name }]; }),
    referencedCards: [...referencedCards],
    figments: FIGMENTS.map(item => ({ id: parseFigmentId(item.id), name: item.name, subtype: item.subtype, typeRemapTarget: item.typeRemapTarget })),
    createdFigments: [...createdFigments],
  };
  metadata.set(id, result);
  return result;
}

type Span = { readonly start: number; readonly end: number; readonly replacement?: string };

function remapText(text: string, chosen: CardSubtype, data: TypeRemapTextMetadata): string {
  // Formatting markers are invisible to word boundaries and survive substitutions.
  const tags = /\[[^\]\n]*\]|<[^>\n]*>|[\uE000\uE001]/gu;
  const offsets: number[] = [], markup: { at: number; text: string }[] = [];
  let plain = "", cursor = 0;
  for (const match of text.matchAll(tags)) {
    for (; cursor < match.index; cursor++) { offsets.push(cursor); plain += text[cursor]; }
    markup.push({ at: plain.length, text: match[0] }); cursor += match[0].length;
  }
  for (; cursor < text.length; cursor++) { offsets.push(cursor); plain += text[cursor]; }
  const spans: Span[] = [];
  const protect = (expression: RegExp) => {
    for (const match of plain.matchAll(expression)) spans.push({ start: match.index, end: match.index + match[0].length });
  };
  for (const id of data.referencedCards) {
    const card = data.cards.find(item => item.id === id);
    if (card !== undefined && card.name.length > 0) protect(new RegExp(`\\b${escape(card.name)}\\b`, "gu"));
  }
  protect(/\{[^}]*\}|\b(?:chosen|that) (?:character )?type\b/giu);
  const eligible = data.figments.filter(item => item.subtype === chosen && item.typeRemapTarget !== false);
  const canonical = eligible.filter(item => item.typeRemapTarget === true);
  const targets = canonical.length === 0 ? eligible : canonical;
  const replacement = targets.length === 1 ? targets[0] : undefined;
  for (const id of data.createdFigments) {
    const source = data.figments.find(item => item.id === id);
    if (source === undefined) continue;
    const names = [source.name, source.subtype].filter(word => word.length > 0);
    const expression = new RegExp(`\\b(?:materialize|create)\\b[^.!?\\n:]*?\\b(${names.map(escape).join("|")})(?=\\s+figments?\\b)`, "giu");
    for (const match of plain.matchAll(expression)) {
      const start = match.index + match[0].length - match[1].length;
      spans.push({ start, end: start + match[1].length, ...(replacement === undefined ? {} : { replacement: withCase(replacement.name, match[1]) }) });
    }
  }
  const words = data.types.flatMap(type => [{ word: type, plural: false }, { word: plural(type), plural: true }]).sort((a, b) => b.word.length - a.word.length);
  const expression = new RegExp(`\\b(?:${words.map(item => escape(item.word)).join("|")})\\b`, "giu");
  for (const match of words.length === 0 ? [] : plain.matchAll(expression)) {
    if (spans.some(span => match.index < span.end && match.index + match[0].length > span.start)) continue;
    const form = words.find(item => item.word.toLowerCase() === match[0].toLowerCase());
    spans.push({ start: match.index, end: match.index + match[0].length, replacement: withCase(form?.plural === true ? plural(chosen) : chosen, match[0]) });
  }
  const edits = spans.filter((span): span is Span & { replacement: string } => span.replacement !== undefined).sort((a, b) => a.start - b.start);
  let output = "", at = 0;
  for (const edit of edits) {
    const start = offsets[edit.start], end = offsets[edit.end - 1] + 1;
    if (start < at) continue;
    output += text.slice(at, start);
    let written = 0;
    for (const mark of markup.filter(item => item.at > edit.start && item.at < edit.end)) {
      const until = Math.round((mark.at - edit.start) / (edit.end - edit.start) * edit.replacement.length);
      output += edit.replacement.slice(written, until) + mark.text;
      written = until;
    }
    output += edit.replacement.slice(written);
    at = end;
  }
  return edits.length === 0 ? text : output + text.slice(at);
}

/** Apply C12 only after the final UI model is built, including its highlighted form text. */
export function remapGameCardModelTypes<T extends GameCardModel>(model: T, chosen: CardSubtype | undefined, metadata?: TypeRemapTextMetadata): T {
  if (chosen === undefined) return model;
  const data = metadata ?? sourceMetadata(model.cardId);
  return { ...model, displaySnapshot: { ...model.displaySnapshot, renderedText: remapText(model.displaySnapshot.renderedText, chosen, data) },
    ...(model.transfiguration === undefined ? {} : { transfiguration: { ...model.transfiguration, markedText: remapText(model.transfiguration.markedText, chosen, data) } }) };
}
