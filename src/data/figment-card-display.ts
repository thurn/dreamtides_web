import { asCardName, type CardName } from "../types/card-identity";

/**
 * The player-facing name for a figment card. Authored data stores the concise
 * identity ("Shadow", "Legionnaire"); the shared card renderer supplies the
 * object kind exactly once so every figment reads as a figment.
 */
export function figmentCardDisplayName(
  name: string,
  subtype: string,
): CardName {
  const authoredName = name.trim();
  const identity =
    authoredName === "" || /^Figment$/iu.test(authoredName)
      ? subtype.trim()
      : authoredName;
  if (identity === "") {
    return asCardName("Figment");
  }
  const withKind = /\s+Figment$/iu.test(identity)
    ? identity
    : `${identity} Figment`;
  return asCardName(withKind);
}
