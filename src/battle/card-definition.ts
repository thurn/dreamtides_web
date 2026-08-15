import {
  cardIdFromUnknown,
  cardSubtypeFromUnknown,
  parseCardName,
} from "../types/card-identity";
import type { ArtCrop, CardData, CardType } from "../types/cards";
import {
  cardTypeChangePredicateIdFromUnknown,
  deckEntryIdFromUnknown,
} from "../types/identifiers";
import type {
  CardKeywordModification,
  CardTypeChange,
  TransfigurationType,
} from "../types/journey";
import type { CardTransfigurationDisplay } from "../runtime/transfiguration-display";
import type { BattleDeckCardDefinition } from "./types";

export function createBaseBattleDeckCardDefinition(
  card: CardData,
): BattleDeckCardDefinition {
  return {
    sourceDeckEntryId: null,
    cardId: card.id,
    cardNumber: card.cardNumber,
    name: card.name,
    battleCardKind: card.cardType === "Character" ? "character" : "event",
    subtype: card.subtype,
    energyCost: card.energyCost ?? 0,
    printedEnergyCost: card.energyCost,
    // Carry multi-cost orb labels through only when present: this definition is
    // serialized into the shared battle state, and Firebase rejects an explicit
    // `undefined` field. Single-cost cards omit it and fall back to the orb
    // derived from `printedEnergyCost`.
    ...(card.energyCosts ? { energyCosts: card.energyCosts } : {}),
    printedSpark: card.spark ?? 0,
    isFast: card.isFast,
    timing: card.isFast ? "fast" : "standard",
    reclaimCost: card.reclaimCost ?? null,
    renderedText: card.renderedText,
    imageNumber: card.imageNumber,
    // Only set `art` when the card has a curated crop: this definition is
    // serialized into the shared battle state, and Firebase rejects an explicit
    // `undefined` field. Cards with no crop fall back to the default at render.
    ...(card.art ? { art: card.art } : {}),
    transfiguration: null,
    isBane: false,
  };
}

/** Decode a serialized debug-command card definition at the event boundary. */
export function battleDeckCardDefinitionFromUnknown(
  value: unknown,
): BattleDeckCardDefinition | null {
  if (!isPlainRecord(value)) return null;

  const sourceDeckEntryId =
    value.sourceDeckEntryId === null
      ? null
      : deckEntryIdFromUnknown(value.sourceDeckEntryId);
  const cardId = cardIdFromUnknown(value.cardId);
  const subtype = cardSubtypeFromUnknown(value.subtype);
  const art = value.art === undefined ? undefined : artCropFromUnknown(value.art);
  const typeChange =
    value.typeChange === undefined || value.typeChange === null
      ? value.typeChange
      : cardTypeChangeFromUnknown(value.typeChange);
  const keywordModification =
    value.keywordModification === undefined ||
    value.keywordModification === null
      ? value.keywordModification
      : cardKeywordModificationFromUnknown(value.keywordModification);
  const transfigurationDisplay =
    value.transfigurationDisplay === undefined
      ? undefined
      : cardTransfigurationDisplayFromUnknown(value.transfigurationDisplay);

  if (
    sourceDeckEntryId === null && value.sourceDeckEntryId !== null ||
    cardId === null ||
    subtype === null ||
    !isIntegerNumber(value.cardNumber) ||
    typeof value.name !== "string" ||
    value.name.length === 0 ||
    !isBattleCardKind(value.battleCardKind) ||
    !isFiniteNumber(value.energyCost) ||
    !isNullableFiniteNumber(value.printedEnergyCost) ||
    !isOptionalStringArray(value.energyCosts) ||
    !isFiniteNumber(value.printedSpark) ||
    typeof value.isFast !== "boolean" ||
    !isOptionalBattleCardTiming(value.timing) ||
    !isNullableFiniteNumber(value.reclaimCost) ||
    typeof value.renderedText !== "string" ||
    !isIntegerNumber(value.imageNumber) ||
    art === null ||
    !isNullableTransfigurationType(value.transfiguration) ||
    transfigurationDisplay === null ||
    typeChange === null && value.typeChange !== null ||
    keywordModification === null && value.keywordModification !== null ||
    typeof value.isBane !== "boolean"
  ) {
    return null;
  }

  return {
    sourceDeckEntryId,
    cardId,
    cardNumber: value.cardNumber,
    name: parseCardName(value.name),
    battleCardKind: value.battleCardKind,
    subtype,
    energyCost: value.energyCost,
    printedEnergyCost: value.printedEnergyCost,
    ...(value.energyCosts === undefined
      ? {}
      : { energyCosts: [...value.energyCosts] }),
    printedSpark: value.printedSpark,
    isFast: value.isFast,
    ...(value.timing === undefined ? {} : { timing: value.timing }),
    reclaimCost: value.reclaimCost,
    renderedText: value.renderedText,
    imageNumber: value.imageNumber,
    ...(art === undefined ? {} : { art }),
    transfiguration: value.transfiguration,
    ...(transfigurationDisplay === undefined ? {} : { transfigurationDisplay }),
    ...(typeChange === undefined || typeChange === null ? {} : { typeChange }),
    ...(keywordModification === undefined || keywordModification === null
      ? {}
      : { keywordModification }),
    isBane: value.isBane,
  };
}

function artCropFromUnknown(value: unknown): ArtCrop | null {
  if (
    !isPlainRecord(value) ||
    !isFiniteNumber(value.x) ||
    !isFiniteNumber(value.y) ||
    !isFiniteNumber(value.scale)
  ) {
    return null;
  }
  return { x: value.x, y: value.y, scale: value.scale };
}

function cardTypeChangeFromUnknown(value: unknown): CardTypeChange | null {
  if (!isPlainRecord(value)) return null;
  const predicateId = cardTypeChangePredicateIdFromUnknown(value.predicateId);
  const subtype = cardSubtypeFromUnknown(value.subtype);
  if (
    predicateId === null ||
    !isCardType(value.cardType) ||
    subtype === null ||
    typeof value.label !== "string"
  ) {
    return null;
  }
  return {
    predicateId,
    cardType: value.cardType,
    subtype,
    label: value.label,
  };
}

function cardKeywordModificationFromUnknown(
  value: unknown,
): CardKeywordModification | null {
  if (!isPlainRecord(value)) return null;
  if (value.fast !== undefined && typeof value.fast !== "boolean") return null;
  const energyCostReduction = value.energyCostReduction;
  const reclaim = value.reclaim;
  const setReclaim = value.setReclaim;
  if (
    energyCostReduction !== undefined && !isFiniteNumber(energyCostReduction) ||
    reclaim !== undefined && !isFiniteNumber(reclaim) ||
    setReclaim !== undefined && !isFiniteNumber(setReclaim)
  ) return null;
  return {
    ...(value.fast === undefined ? {} : { fast: value.fast }),
    ...(energyCostReduction === undefined
      ? {}
      : { energyCostReduction }),
    ...(reclaim === undefined ? {} : { reclaim }),
    ...(setReclaim === undefined
      ? {}
      : { setReclaim }),
  };
}

function cardTransfigurationDisplayFromUnknown(
  value: unknown,
): CardTransfigurationDisplay | null {
  if (!isPlainRecord(value) || !isPlainRecord(value.form)) return null;
  const form = value.form;
  if (
    !isTransfigurationType(value.type) ||
    typeof form.name !== "string" ||
    typeof form.description !== "string" ||
    !isTransfigurationGlyph(form.glyph) ||
    !isHexColor(form.accentColor) ||
    !isHexColor(form.tintColor) ||
    typeof value.markedText !== "string" ||
    typeof value.energyChanged !== "boolean" ||
    !isNullableString(value.energyChangeName) ||
    typeof value.sparkChanged !== "boolean" ||
    !isNullableString(value.sparkChangeName) ||
    typeof value.fastChanged !== "boolean"
  ) {
    return null;
  }
  return {
    type: value.type,
    form: {
      name: form.name,
      description: form.description,
      glyph: form.glyph,
      accentColor: form.accentColor,
      tintColor: form.tintColor,
    },
    markedText: value.markedText,
    energyChanged: value.energyChanged,
    energyChangeName: value.energyChangeName,
    sparkChanged: value.sparkChanged,
    sparkChangeName: value.sparkChangeName,
    fastChanged: value.fastChanged,
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isIntegerNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value);
}

function isNullableFiniteNumber(value: unknown): value is number | null {
  return value === null || isFiniteNumber(value);
}

function isOptionalStringArray(value: unknown): value is string[] | undefined {
  return (
    value === undefined ||
    Array.isArray(value) && value.every((entry) => typeof entry === "string")
  );
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isCardType(value: unknown): value is CardType {
  return value === "Character" || value === "Event";
}

function isBattleCardKind(
  value: unknown,
): value is BattleDeckCardDefinition["battleCardKind"] {
  return value === "character" || value === "event";
}

function isOptionalBattleCardTiming(
  value: unknown,
): value is BattleDeckCardDefinition["timing"] {
  return (
    value === undefined ||
    value === "standard" ||
    value === "fast" ||
    value === "interrupt"
  );
}

const TRANSFIGURATION_TYPES: readonly TransfigurationType[] = [
  "Empowered",
  "Amplified",
  "Kindled",
  "Inspired",
  "Enduring",
  "Hastened",
  "Resonant",
  "Attuned",
  "Perfected",
];

function isTransfigurationType(value: unknown): value is TransfigurationType {
  return (
    typeof value === "string" &&
    TRANSFIGURATION_TYPES.some((candidate) => candidate === value)
  );
}

function isNullableTransfigurationType(
  value: unknown,
): value is TransfigurationType | null {
  return value === null || isTransfigurationType(value);
}

function isTransfigurationGlyph(
  value: unknown,
): value is CardTransfigurationDisplay["form"]["glyph"] {
  return (
    value === "transfigurationEmpowered" ||
    value === "transfigurationAmplified" ||
    value === "transfigurationKindled" ||
    value === "transfigurationInspired" ||
    value === "transfigurationEnduring" ||
    value === "transfigurationHastened" ||
    value === "transfigurationResonant" ||
    value === "transfigurationAttuned" ||
    value === "transfigurationPerfected"
  );
}

function isHexColor(value: unknown): value is `#${string}` {
  return typeof value === "string" && value.startsWith("#");
}
