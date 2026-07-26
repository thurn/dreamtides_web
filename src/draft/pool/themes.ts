// The candidate-theme model shared by the `default` and `diverse` variants:
// given a color identity, work out which draft lists are on-color, which cards
// are legal, and which themes the walk may add.

import { T_ON } from "./constants.ts";
import type { PoolData } from "./types.ts";
import { colorPrefix, inter } from "./util.ts";

export interface OnColorCandidates {
  /** On-color draft list names (bare color lists and color+archetype slices). */
  onColorDraft: string[];
  /** Every card legal for this identity: core plus all on-color draft cards. */
  legal: Set<string>;
  /** Theme label -> the theme's legal cards, in walk-visit order. */
  themes: Map<string, Set<string>>;
}

/**
 * Build the on-color candidate model for identity `C`. A draft list is on-color
 * when its color prefix is non-empty and contained in `C`. Themes are the
 * on-color mechanic archetypes whose legal fraction clears {@link T_ON}, plus
 * the on-color color+archetype slices; when `allowedDraft` is set those slices
 * are restricted to a DreamAvatar's list. If no theme qualifies, every on-color
 * slice becomes a theme so the walk always has somewhere to go.
 */
export function onColorCandidates(
  poolData: PoolData,
  C: Set<string>,
  allowedDraft: Set<string> | null,
): OnColorCandidates {
  const { core, archLists, draftLists } = poolData;
  const onColorDraft = [...draftLists.keys()].filter((n) => {
    const p = colorPrefix(n);
    return p !== "" && [...p].every((c) => C.has(c));
  });
  const legal = new Set(core);
  for (const n of onColorDraft) {
    for (const c of draftLists.get(n) ?? []) legal.add(c);
  }
  const themes = new Map<string, Set<string>>();
  for (const [a, cards] of archLists) {
    if (inter(cards, legal) / cards.size >= T_ON) {
      themes.set(`A:${a}`, new Set([...cards].filter((c) => legal.has(c))));
    }
  }
  for (const n of onColorDraft) {
    if (!n.includes("-")) continue;
    if (allowedDraft !== null && !allowedDraft.has(n)) continue;
    themes.set(`D:${n}`, draftLists.get(n) ?? new Set());
  }
  if (themes.size === 0) {
    for (const n of onColorDraft) {
      themes.set(`D:${n}`, draftLists.get(n) ?? new Set());
    }
  }
  return { onColorDraft, legal, themes };
}
