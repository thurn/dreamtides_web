export type EditableCardField =
  | "energy-cost"
  | "subtype"
  | "name"
  | "spark"
  | "rendered-text"
  | "amplified-text";

export const EDITABLE_CARD_FIELDS: ReadonlySet<EditableCardField>;

export interface CardEditorRecord {
  id: CardId;
  cardNumber: number;
  cardType?: CardType;
  rarity?: string;
  "energy-cost": number | string;
  subtype: string;
  name: string;
  spark: number | string;
  "rendered-text": string;
  "amplified-text": string;
  source: Record<string, unknown>;
  preview: Record<string, unknown>;
}

export type CardEditValidationResult =
  | {
      ok: true;
      field: string;
      value: string | number;
    }
  | {
      ok: false;
      field: string;
      value: unknown;
      message: string;
    };

export function readEditorCards(options?: { rootDir?: string }): CardEditorRecord[];

export function validateCardEdit(field: string, rawValue: unknown): CardEditValidationResult;

export function patchRenderedCardsToml(
  source: string,
  patch: { cardId: CardId; field: string; value: unknown },
): { source: string };

export function refreshCardDataJson(options?: { rootDir?: string }): {
  count: number;
  path: string;
};
import type { CardId } from "../src/types/card-identity";
import type { CardType } from "../src/types/cards";
