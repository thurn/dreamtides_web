declare const catalogNameBrand: unique symbol;

type CatalogName<Name extends string> = string & {
  readonly [catalogNameBrand]: Name;
};

export type DreamwellCardName = CatalogName<"DreamwellCardName">;

function parseCatalogName<Name extends string>(
  value: unknown,
  label: Name,
): CatalogName<Name> {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value as CatalogName<Name>;
}

export const parseDreamwellCardName = (value: unknown): DreamwellCardName =>
  parseCatalogName(value, "DreamwellCardName");
