import type { DeckMods } from "../engine/dsl/types";
import type { DeckEntry } from "../types/journey";

/** Shared projection of persistent journey modifications into an engine variant. */
export function deckModsOf(entry: Pick<DeckEntry, "sparkBonus" | "keywordModification" | "typeChange">): DeckMods | null {
  const keywords = entry.keywordModification ?? null;
  const reclaim = wholeOrNull(keywords?.setReclaim ?? keywords?.reclaim);
  const costReduction = Math.max(0, wholeOrNull(keywords?.energyCostReduction) ?? 0);
  const mods: DeckMods = {
    sparkBonus: wholeOrNull(entry.sparkBonus) ?? 0,
    costReduction,
    fast: keywords?.fast === true,
    reclaim: reclaim === null || reclaim < 0 ? null : reclaim,
    typeChange:
      entry.typeChange == null
        ? null
        : {
            cardType: entry.typeChange.cardType === "Character" ? "character" : "event",
            subtype: entry.typeChange.subtype,
          },
  };
  const modified =
    mods.sparkBonus !== 0 || mods.costReduction !== 0 || mods.fast || mods.reclaim !== null || mods.typeChange !== null;
  return modified ? mods : null;
}

function wholeOrNull(value: number | undefined): number | null {
  return value === undefined || !Number.isFinite(value) ? null : Math.trunc(value);
}
