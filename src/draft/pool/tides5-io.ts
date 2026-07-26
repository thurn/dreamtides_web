// Schema and validation for the committed `tides5` artifact (`data/tides5.jsonc`,
// served as `/tides5-data.json`), the single input the `tides5` pool variant
// combines into draft pools.
//
// `tides5` is the SAME algorithm as `tides4` (the human-legible counterpart of
// `sigseed`) grown from a different corpus — only the known-good decklists in
// `docs/known_good_decklists.json` feed its pick-affinity statistics. The two
// artifacts therefore share a byte-for-byte identical schema: signature / facet /
// neutral tide decks plus a per-DreamAvatar `tidePoolByDreamAvatar`. Rather than
// duplicate the validator, `tides5` reuses the `tides4` schema and validation
// verbatim, re-exported here under `tides5` names so the rest of the codebase can
// refer to them symmetrically with the other tide variants.

export {
  validateTides4Decks as validateTides5Decks,
  TIDES4_COLORS as TIDES5_COLORS,
} from "./tides4-io.ts";

export type {
  Tides4Color as Tides5Color,
  Tides4DeckJson as Tides5DeckJson,
  Tides4DecksJson as Tides5DecksJson,
  Tides4DreamAvatarPool as Tides5DreamAvatarPool,
  Tides4Role as Tides5Role,
} from "./tides4-io.ts";
