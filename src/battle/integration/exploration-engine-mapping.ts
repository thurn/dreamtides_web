import type { ExplorationEffectKind } from "../../data/exploration";
import { deckModsFromUnknown } from "../../engine/dsl/deck-mods";
import type { DeckMods, Variant } from "../../engine/dsl/types";
import type { BattleInit, NextBattleEffects } from "../../engine/state/types";
import { parseCardTypeChangePredicateId } from "../../types/identifiers";
import type { DeckEntry, JourneyState } from "../../types/journey";

type Destination =
  | { readonly target: "deck-mod"; readonly field: keyof DeckMods }
  | { readonly target: "variant"; readonly field: Extract<keyof Variant, "transfigurations"> }
  | { readonly target: "battle-init"; readonly field: Extract<keyof BattleInit, "decks" | "dreamsigns" | "avatars"> }
  | { readonly target: "next-battle"; readonly field: keyof NextBattleEffects }
  | { readonly target: "nonbattle"; readonly field: Extract<keyof JourneyState, "essence" | "atlas" | "shopModifiers" | "siteOfferModifiers"> };

/** All destinations of one Exploration effect, including each branch of compound rewards. */
export function explorationEngineDestinations(kind: ExplorationEffectKind): readonly Destination[] {
  const decks = { target: "battle-init", field: "decks" } as const;
  const forms = { target: "variant", field: "transfigurations" } as const;
  const signs = { target: "battle-init", field: "dreamsigns" } as const;
  const essence = { target: "nonbattle", field: "essence" } as const;
  switch (kind) {
    case "increase-spark-all": return [{ target: "deck-mod", field: "sparkBonus" }];
    case "purge-random-subtype-and-increase-spark": return [{ target: "deck-mod", field: "sparkBonus" }, decks];
    case "make-fast-all": return [{ target: "deck-mod", field: "fast" }];
    case "make-predicate-fast-and-gain-nightmares": return [{ target: "deck-mod", field: "fast" }, decks];
    case "reduce-cost-all-and-gain-nightmares": return [{ target: "deck-mod", field: "costReduction" }, decks];
    case "purge-duplicates-and-grant-reclaim": return [{ target: "deck-mod", field: "reclaim" }, decks];
    case "change-subtype-selected":
    case "change-card-type-selected":
    case "change-subtype-all": return [{ target: "deck-mod", field: "typeChange" }];
    case "next-battle-opening-hand": return [{ target: "next-battle", field: "openingHand" }];
    case "next-battle-starting-energy": return [{ target: "next-battle", field: "startingEnergy" }];
    case "next-battle-smaller-hand-and-cost-discount": return [{ target: "next-battle", field: "smallerHandAndCostDiscount" }];
    case "transfigure-selected":
    case "transfigure-random-cards":
    case "transfigure-fixed-random-cards":
    case "transfigure-random-starter-cards":
    case "transfigure-all-starter-cards":
    case "transfigure-all-cards":
    case "transfigure-fixed-selected": return [forms];
    case "transfigure-all-for-essence": return [forms, essence];
    case "purge-disclosed-and-transfigure-same-type":
    case "transfigured-card-draft":
    case "take-transfigured-cards-and-gain-nightmares":
    case "purge-one-transfigure-and-copy-others": return [forms, decks];
    case "transfigure-next-draft-or-shop": return [forms, { target: "nonbattle", field: "siteOfferModifiers" }];
    case "purge-and-copy":
    case "gain-card":
    case "purge-selected":
    case "purge-starter-card":
    case "purge-random-starter-card":
    case "purge-random-starter-and-gain-card":
    case "replace-all-starter-cards":
    case "choose-pack":
    case "draft-card":
    case "take-cards":
    case "replace-selected-with-card":
    case "replace-random-with-card":
    case "replace-selected":
    case "gain-nightmare-and-card":
    case "gain-random-cards":
    case "gain-offered-card":
    case "copy-selected-card":
    case "copy-selected-cards":
    case "copy-random-cards":
    case "copy-offered-deck-card": return [decks];
    case "purge-for-essence": return [decks, essence];
    case "gain-dreamsign":
    case "gain-random-dreamsign":
    case "gain-offered-dreamsign":
    case "replace-selected-dreamsign-with-offered":
    case "replace-all-dreamsigns-random":
    case "purge-selected-dreamsign-and-gain-random": return [signs];
    case "gain-nightmare-and-dreamsign":
    case "gain-nightmare-and-offered-dreamsign": return [signs, decks];
    case "purge-dreamsign-for-essence": return [signs, essence];
    case "choose-avatar": return [{ target: "battle-init", field: "avatars" }];
    case "gain-essence-per-card":
    case "gain-essence":
    case "gain-random-essence":
    case "double-essence": return [essence];
    case "add-fixed-site":
    case "choose-site-type":
    case "add-site": return [{ target: "nonbattle", field: "atlas" }];
    case "free-next-shop": return [{ target: "nonbattle", field: "shopModifiers" }];
    case "lose-half-essence-and-free-purchases": return [essence, { target: "nonbattle", field: "shopModifiers" }];
    default: {
      const unmapped: never = kind;
      throw new Error(`Unmapped Exploration effect: ${String(unmapped)}`);
    }
  }
}

/** Project lab modifiers through the same typed Exploration destinations into the real journey DTO. */
export function journeyDeckModFields(value: unknown): Pick<DeckEntry, "sparkBonus" | "keywordModification" | "typeChange"> {
  const mods = deckModsFromUnknown(value);
  const entry: Pick<DeckEntry, "sparkBonus" | "keywordModification" | "typeChange"> = {};
  const sources = ["increase-spark-all", "reduce-cost-all-and-gain-nightmares", "make-fast-all", "purge-duplicates-and-grant-reclaim", "change-card-type-selected"] as const;
  for (const kind of sources) for (const route of explorationEngineDestinations(kind)) {
    if (route.target !== "deck-mod") continue;
    const field = route.field;
    switch (field) {
      case "sparkBonus": entry.sparkBonus = mods.sparkBonus; break;
      case "costReduction": entry.keywordModification = { ...entry.keywordModification, energyCostReduction: mods.costReduction }; break;
      case "fast": entry.keywordModification = { ...entry.keywordModification, fast: mods.fast }; break;
      case "reclaim": entry.keywordModification = { ...entry.keywordModification, ...(mods.reclaim === null ? {} : { setReclaim: mods.reclaim }) }; break;
      case "typeChange": entry.typeChange = mods.typeChange === null ? null : {
        predicateId: parseCardTypeChangePredicateId("card-lab-mods"),
        cardType: mods.typeChange.cardType === "character" ? "Character" : "Event",
        subtype: mods.typeChange.subtype,
        label: mods.typeChange.subtype,
      }; break;
      default: { const unmapped: never = field; throw new Error(`Unmapped deck modification: ${String(unmapped)}`); }
    }
  }
  return entry;
}
