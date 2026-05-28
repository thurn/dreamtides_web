export type EditableCardField =
  | "energy-cost"
  | "subtype"
  | "name"
  | "spark"
  | "rendered-text";

export const EDITABLE_CARD_FIELDS: ReadonlySet<EditableCardField>;

export interface CardEditorRecord {
  id: string;
  cardNumber: number;
  cardType?: string;
  rarity?: string;
  "energy-cost": number | string;
  subtype: string;
  name: string;
  spark: number | string;
  "rendered-text": string;
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
  patch: { cardId: string; field: string; value: unknown },
): { source: string };

export function refreshCardDataJson(options?: { rootDir?: string }): {
  count: number;
  path: string;
};
