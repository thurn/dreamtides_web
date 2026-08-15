import {
  parseCardName,
  type CardName,
  type CardSubtype,
} from "../types/card-identity";

/**
 * The player-facing name for a figment card. Authored data stores the concise
 * identity ("Shadow", "Legionnaire"); the shared card renderer supplies the
 * object kind exactly once so every figment reads as a figment.
 */
export function figmentCardDisplayName(
  name: CardName,
  subtype: CardSubtype,
): CardName {
  const identity = figmentCardIdentityName(name, subtype);
  if (identity === "") {
    return parseCardName("Figment");
  }
  return parseCardName(`${identity} Figment`);
}

/** Recover the canonical authored identity from a Figment card display name. */
export function figmentCardIdentityName(
  name: CardName,
  subtype: CardSubtype,
): string {
  const authoredName = name.trim();
  return authoredName === "" || /^Figment$/iu.test(authoredName)
    ? subtype.trim()
    : authoredName.replace(/\s+Figment$/iu, "");
}
