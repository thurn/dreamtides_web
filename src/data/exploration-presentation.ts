import { LocalizedString, opaque, tx, txa } from "@trox/runtime";
import type { ExplorationActionContent } from "./exploration";

const PRESENTATION_FIELDS = [
  "effectKind",
  "predicate",
  "count",
  "cardType",
  "deckTarget",
  "packCount",
  "packSize",
  "offerCount",
  "essencePerSpark",
  "essencePerCard",
  "sparkBonus",
  "essence",
  "minimumEssence",
  "maximumEssence",
  "energyCostReduction",
  "subtype",
  "subtypeOptions",
  "nightmareCount",
  "transfiguration",
  "siteType",
] as const;

export function serializeExplorationPresentationMechanic(
  action: Pick<ExplorationActionContent, (typeof PRESENTATION_FIELDS)[number]>,
): string {
  return JSON.stringify(
    PRESENTATION_FIELDS.map((field) => action[field] ?? null),
  );
}

const EFFECT_TEXT_BY_MECHANIC = new Map<string, () => LocalizedString>([
  [
    '["add-fixed-site",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,"DreamsignBazaar"]',
    () =>
      tx(
        "Add a Dreamsign Bazaar site to this Dreamscape",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["add-fixed-site",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,"Duplication"]',
    () =>
      tx(
        "Add a duplication site to this Dreamscape",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["add-fixed-site",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,"Purge"]',
    () =>
      tx(
        "Add a purge site to this Dreamscape",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["add-fixed-site",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,"Shop"]',
    () =>
      tx(
        "Add a card market site to this Dreamscape",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["add-fixed-site",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,"Transfiguration"]',
    () =>
      tx(
        "Add a Transfiguration site to this Dreamscape",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["add-site",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Add a disclosed site to this Dreamscape",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["change-random-card-type",null,2,"Event",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Modify two random cards to become Event cards",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["change-subtype-all",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,["Warrior","Mage","Spirit Animal","Survivor"],null,null,null]',
    () =>
      tx(
        "All characters in your deck become the subtype of your choice",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["change-subtype-selected","character",null,null,"chosen",null,null,null,null,null,null,null,null,null,null,"Detective",null,null,null,null]',
    () =>
      tx(
        "Change a chosen character card to be a Detective",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["change-subtype-selected","character",null,null,"chosen",null,null,null,null,null,null,null,null,null,null,"Monster",null,null,null,null]',
    () =>
      tx(
        "Change a chosen character card to be a Monster",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["change-subtype-selected","character",null,null,"chosen",null,null,null,null,null,null,null,null,null,null,"Musician",null,null,null,null]',
    () =>
      tx(
        "Change a chosen character card to be a Musician",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["change-subtype-selected","character",null,null,"chosen",null,null,null,null,null,null,null,null,null,null,"Outsider",null,null,null,null]',
    () =>
      tx(
        "Change a chosen character card to be an Outsider",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["change-subtype-selected","character",null,null,"chosen",null,null,null,null,null,null,null,null,null,null,"Spirit Animal",null,null,null,null]',
    () =>
      tx(
        "Change a chosen character card to be a Spirit Animal",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["change-subtype-selected","character",null,null,"chosen",null,null,null,null,null,null,null,null,null,null,"Synth",null,null,null,null]',
    () =>
      tx(
        "Change a chosen character card to be a Synth",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["change-subtype-selected","character",null,null,"chosen",null,null,null,null,null,null,null,null,null,null,"Vehicle",null,null,null,null]',
    () =>
      tx(
        "Change a chosen character card to be a Vehicle",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["change-subtype-selected","character",null,null,"chosen",null,null,null,null,null,null,null,null,null,null,"Warrior",null,null,null,null]',
    () =>
      tx(
        "Change a chosen character card to be a Warrior",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["choose-avatar",null,null,null,null,null,null,3,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Pick a new Avatar from three choices",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["choose-pack","character",null,null,null,2,3,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose one of two packs of Character cards to add to your deck",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["choose-pack","cheap-character",null,null,null,2,3,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose one of two packs of ≤2● cost Character cards to add to your deck",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["choose-pack","spirit-animal",null,null,null,2,3,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose one of two packs of Spirit Animal cards to add to your deck",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["choose-pack","survivor",null,null,null,2,3,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose one of two packs of Survivor cards to add to your deck",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["choose-pack","warrior",null,null,null,2,3,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose one of two packs of Warrior cards to add to your deck",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["choose-pack","warrior",null,null,null,3,3,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose one of three packs of Warrior cards to add to your deck",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["choose-site-type",null,null,null,null,null,null,3,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose one of three offered site types to add to this Dreamscape",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["copy-offered-deck-card",null,null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Draw four cards from your deck and choose one to gain a copy of.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["copy-random-cards","character",2,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Gain one copy of each of two random Character cards in your deck",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["copy-selected-card","character",1,null,"chosen",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Gain a copy of a chosen Character card",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["copy-selected-card","event",2,null,"chosen",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Gain two copies of a chosen Event",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["copy-selected-card",null,1,null,"chosen",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Gain one copy of a chosen card",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["copy-selected-card",null,2,null,"chosen",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Gain two copies of a chosen card",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["copy-selected-cards",null,2,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Gain one copy of each of two chosen cards",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["double-essence",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Double your current essence",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["draft-card","character",1,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Draft a Character from four choices",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["draft-card","character",2,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Draft a Character from four choices and gain two copies of it",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["draft-card","cheap-character",1,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Draft a ≤2● cost Character from four choices",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["draft-card","cheap-character",2,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Draft a ≤2● cost Character from four choices and gain two copies of it",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["draft-card","event",1,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Draft an Event from four choices",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["draft-card","event",2,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Draft an Event from four choices and gain two copies of it",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["draft-card","spirit-animal",1,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Draft a Spirit Animal from four choices",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["draft-card","spirit-animal",2,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Draft a Spirit Animal from four choices and gain two copies of it",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["draft-card","survivor",1,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Draft a Survivor from four choices",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["draft-card","survivor",2,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Draft a Survivor from four choices and gain two copies of it",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["draft-card","warrior",1,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Draft a Warrior from four choices",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["draft-card","warrior",2,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Draft a Warrior from four choices and gain two copies of it",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["free-next-shop",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "All items in the next shop you visit are free",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["gain-essence-per-card","character",null,null,null,null,null,null,null,15,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Gain 15 essence for each Character card in your deck",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["gain-essence-per-card","cheap-character",null,null,null,null,null,null,null,15,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Gain 15 essence for each ≤2● cost Character in your deck",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["gain-essence-per-card","event",null,null,null,null,null,null,null,15,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Gain 15 essence for each Event card in your deck",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["gain-essence-per-card","spirit-animal",null,null,null,null,null,null,null,15,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Gain 15 essence for each Spirit Animal card in your deck",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["gain-essence-per-card","survivor",null,null,null,null,null,null,null,15,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Gain 15 essence for each Survivor card in your deck",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["gain-essence-per-card","warrior",null,null,null,null,null,null,null,15,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Gain 15 essence for each Warrior card in your deck",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["gain-essence",null,null,null,null,null,null,null,null,null,null,100,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Gain 100 essence",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["gain-offered-dreamsign",null,null,null,null,null,null,3,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Gain one of three offered dreamsigns",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["gain-random-cards","character",1,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Gain a random Character card",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["gain-random-cards","character",2,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Gain two random Character cards",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["gain-random-cards","cheap-character",2,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Gain two random ≤2● cost Character cards",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["gain-random-cards","event",1,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Gain a random Event card",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["gain-random-cards","legendary",1,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Gain a random legendary card",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["gain-random-cards","spirit-animal",2,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Gain two random Spirit Animal cards",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["gain-random-cards","survivor",1,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Gain a random Survivor card",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["gain-random-cards","survivor",2,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Gain two random Survivor cards",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["gain-random-cards","warrior",2,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Gain two random Warrior cards",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["gain-random-dreamsign",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Gain a random dreamsign",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["increase-spark-all",null,null,null,null,null,null,null,null,null,1,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "All characters in your deck gain +1✦",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["lose-half-essence-and-free-purchases",null,3,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Lose half your current essence. The next three items you purchase are free.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["make-fast-all",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "All cards in your deck become ❖ (fast)",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["next-battle-opening-hand",null,2,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Draw two additional cards at the start of your next battle",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["next-battle-smaller-hand-and-cost-discount",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Draw one fewer card at the start of your next battle. All cards cost 1● less during that battle.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["next-battle-starting-energy",null,2,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Gain two additional energy at the start of your next battle",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["purge-and-copy",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Purge a chosen card and gain a copy of another chosen card in your deck",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["purge-dreamsign-for-essence",null,null,null,null,null,null,null,null,null,null,50,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Purge a chosen dreamsign and gain 50 essence",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["purge-duplicates-and-grant-reclaim",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Purge all copies of every duplicated card from your deck. Every card remaining in your deck gains reclaim.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["purge-for-essence",null,null,null,null,null,null,null,20,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Purge a chosen card and gain 20 essence for each ✦ it had",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["purge-one-transfigure-and-copy-others",null,null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,"Attuned",null]',
    () =>
      tx(
        "Select four random cards from your deck and choose one to purge. Apply Attuned to the other three eligible cards, then gain a copy of each.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["purge-random-starter-and-gain-card","survivor",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Purge a random starter card. Gain a random Survivor.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["purge-random-starter-card",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Purge a random starter card",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["purge-random-subtype-and-increase-spark",null,null,null,null,null,null,null,null,null,1,null,null,null,null,"Mage",null,null,null,null]',
    () =>
      tx(
        "Purge a random Mage character. Every other Mage character in your deck gains +1✦.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["purge-random-subtype-and-increase-spark",null,null,null,null,null,null,null,null,null,1,null,null,null,null,"Monster",null,null,null,null]',
    () =>
      tx(
        "Purge a random Monster character. Every other Monster character in your deck gains +1✦.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["purge-random-subtype-and-increase-spark",null,null,null,null,null,null,null,null,null,1,null,null,null,null,"Spirit Animal",null,null,null,null]',
    () =>
      tx(
        "Purge a random Spirit Animal character. Every other Spirit Animal character in your deck gains +1✦.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["purge-random-subtype-and-increase-spark",null,null,null,null,null,null,null,null,null,1,null,null,null,null,"Survivor",null,null,null,null]',
    () =>
      tx(
        "Purge a random Survivor. Every other Survivor in your deck gains +1✦.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["purge-random-subtype-and-increase-spark",null,null,null,null,null,null,null,null,null,1,null,null,null,null,"Synth",null,null,null,null]',
    () =>
      tx(
        "Purge a random Synth character. Every other Synth character in your deck gains +1✦.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["purge-random-subtype-and-increase-spark",null,null,null,null,null,null,null,null,null,1,null,null,null,null,"Visionary",null,null,null,null]',
    () =>
      tx(
        "Purge a random Visionary character. Every other Visionary character in your deck gains +1✦.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["purge-random-subtype-and-increase-spark",null,null,null,null,null,null,null,null,null,1,null,null,null,null,"Visitor",null,null,null,null]',
    () =>
      tx(
        "Purge a random Visitor character. Every other Visitor character in your deck gains +1✦.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["purge-random-subtype-and-increase-spark",null,null,null,null,null,null,null,null,null,1,null,null,null,null,"Warrior",null,null,null,null]',
    () =>
      tx(
        "Purge a random Warrior. Every other Warrior in your deck gains +1✦.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["purge-selected-dreamsign-and-gain-random",null,3,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Purge a chosen Dreamsign. Gain three random Dreamsigns.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["purge-selected","character",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Purge a chosen Character card",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["purge-selected","cheap-character",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Purge a chosen ≤1✦ Character card",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["purge-selected","event",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Purge a chosen Event",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["purge-selected","warrior",2,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Purge up to two chosen Warrior cards",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["purge-selected","warrior",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Purge a chosen Warrior",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["purge-selected",null,2,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Purge up to two chosen cards",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["purge-selected",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Purge a chosen card",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["replace-all-dreamsigns-random",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Replace all of your Dreamsigns with random Dreamsigns",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["replace-all-starter-cards","character",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Purge all starter cards and replace each one with a Character card",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["replace-selected-dreamsign-with-offered",null,null,null,null,null,null,3,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Replace a chosen dreamsign with one of three offered dreamsigns",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["replace-selected","character",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Purge a chosen Character card and gain a random Character replacement",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["replace-selected","cheap-character",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Purge a chosen ≤2● cost Character and gain a random ≤2● cost Character replacement",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["replace-selected","event",2,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Purge up to two chosen Event cards and gain a random Event replacement for each card purged",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["replace-selected","event",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Purge a chosen Event card and gain a random Event replacement",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["replace-selected","spirit-animal",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Purge a chosen Spirit Animal card and gain a random Spirit Animal replacement",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["replace-selected","warrior",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Purge a chosen Warrior card and gain a random Warrior replacement",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["take-cards","character",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Take any number of Character cards from four choices",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["take-cards","cheap-character",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Take any number of ≤2● cost Character cards from four choices",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["take-cards","event",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Take any number of Event cards from four choices",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["take-cards","spirit-animal",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Take any number of Spirit Animal cards from four choices",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["take-cards","survivor",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Take any number of Survivor cards from four choices",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["take-cards","warrior",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Take any number of Warrior cards from four choices",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["transfigure-all-cards",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Transfigure all cards in your deck",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["transfigure-all-for-essence","character",null,null,null,null,null,null,null,null,null,100,null,null,null,null,null,null,"Kindled",null]',
    () =>
      tx(
        "Lose 100 essence. Apply Kindled to every eligible Character card in your deck.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["transfigure-all-for-essence","cheap-character",null,null,null,null,null,null,null,null,null,100,null,null,null,null,null,null,"Kindled",null]',
    () =>
      tx(
        "Lose 100 essence. Apply Kindled to every eligible Cheap Character card in your deck.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["transfigure-all-for-essence","event",null,null,null,null,null,null,null,null,null,100,null,null,null,null,null,null,"Inspired",null]',
    () =>
      tx(
        "Lose 100 essence. Apply Inspired to every eligible Event card in your deck.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["transfigure-all-for-essence","warrior",null,null,null,null,null,null,null,null,null,100,null,null,null,null,null,null,"Kindled",null]',
    () =>
      tx(
        "Lose 100 essence. Apply Kindled to every eligible Warrior card in your deck.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["transfigure-all-starter-cards",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Transfigure all starter cards",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["transfigure-fixed-random-cards","cheap-character",2,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,"Kindled",null]',
    () =>
      tx(
        "Apply Kindled to two random eligible ≤2● cost Character cards in your deck",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["transfigure-fixed-selected","event",null,null,"chosen",null,null,null,null,null,null,null,null,null,null,null,null,null,"Inspired",null]',
    () =>
      tx(
        "Apply Inspired to a chosen Event",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["transfigure-fixed-selected","warrior",2,null,"chosen",null,null,null,null,null,null,null,null,null,null,null,null,null,"Kindled",null]',
    () =>
      tx(
        "Apply Kindled to two chosen Warrior cards",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["transfigure-fixed-selected",null,null,null,"chosen",null,null,null,null,null,null,null,null,null,null,null,null,null,"Empowered",null]',
    () =>
      tx(
        "Apply Empowered to a chosen card",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["transfigure-next-draft-or-shop",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "The next draft or shop site you visit will contain transfigured cards",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["transfigure-random-cards","event",2,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Apply a transfiguration to two random Event cards",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["transfigure-random-starter-cards",null,2,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Transfigure two random starter cards",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["transfigure-selected","event",2,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Apply a transfiguration to two chosen Event cards",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["transfigure-selected",null,1,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Apply a transfiguration to a chosen card",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["transfigured-card-draft","character",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Draft a transfigured Character from four choices",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["transfigured-card-draft","cheap-character",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Draft a transfigured ≤2● cost Character from four choices",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["transfigured-card-draft","event",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Draft a transfigured Event from four choices",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["transfigured-card-draft","spirit-animal",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Draft a transfigured Spirit Animal from four choices",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
  [
    '["transfigured-card-draft","warrior",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Draft a transfigured Warrior from four choices",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      ),
  ],
]);

const FOLLOWUP_SUBTITLE_BY_MECHANIC = new Map<string, () => LocalizedString>([
  [
    '["change-subtype-all",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,["Warrior","Mage","Spirit Animal","Survivor"],null,null,null]',
    () =>
      tx(
        "Choose one shared subtype for every Character.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["change-subtype-selected","character",null,null,"chosen",null,null,null,null,null,null,null,null,null,null,"Spirit Animal",null,null,null,null]',
    () =>
      tx(
        "Choose a Character to become a Spirit Animal.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["change-subtype-selected","character",null,null,"chosen",null,null,null,null,null,null,null,null,null,null,"Warrior",null,null,null,null]',
    () =>
      tx(
        "Choose a Character to become a Warrior.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["choose-avatar",null,null,null,null,null,null,3,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose one offered Avatar.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["choose-pack","character",null,null,null,2,3,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose one pack to add to your deck.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["choose-pack","cheap-character",null,null,null,2,3,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose one pack to add to your deck.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["choose-pack","spirit-animal",null,null,null,2,3,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose one Spirit Animal pack to add to your deck.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["choose-pack","survivor",null,null,null,2,3,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose one pack to add to your deck.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["choose-pack","warrior",null,null,null,2,3,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose one pack to add to your deck.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["copy-offered-deck-card",null,null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose one offered card to copy.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["copy-selected-card",null,1,null,"chosen",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose a card to gain one copy of.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["copy-selected-cards",null,2,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose two cards to copy.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["draft-card","character",1,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose one offered card.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["draft-card","character",2,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose one offered card.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["draft-card","cheap-character",1,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose one offered card.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["draft-card","cheap-character",2,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose one offered card.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["draft-card","event",1,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose one offered card.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["draft-card","event",2,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose one offered Event to gain twice.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["draft-card","spirit-animal",1,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose one offered card.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["draft-card","spirit-animal",2,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose one offered card.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["draft-card","survivor",1,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose one offered card.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["draft-card","survivor",2,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose one offered card.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["draft-card","warrior",1,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose one offered card.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["draft-card","warrior",2,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose one offered card.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["gain-dreamsign",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose a Dreamsign to replace.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["gain-nightmare-and-dreamsign",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,2,null,null]',
    () =>
      tx(
        "Choose a Dreamsign to replace.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["gain-nightmare-and-offered-dreamsign",null,null,null,null,null,null,3,null,null,null,null,null,null,null,null,null,2,null,null]',
    () =>
      tx(
        "Choose one offered Dreamsign.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["gain-offered-dreamsign",null,null,null,null,null,null,3,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose one offered Dreamsign.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["gain-random-dreamsign",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose a Dreamsign to replace.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["purge-and-copy",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "First choose a card to purge, then choose a different card to copy.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["purge-dreamsign-for-essence",null,null,null,null,null,null,null,null,null,null,50,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose a Dreamsign to purge.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["purge-for-essence",null,null,null,null,null,null,null,20,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose a card to burn for 20 essence per ✦.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["purge-selected-dreamsign-and-gain-random",null,3,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose a Dreamsign to purge.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["take-cards","character",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose any number of offered cards.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["take-cards","cheap-character",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose any number of offered cards.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["take-cards","event",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose any number of offered cards.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["take-cards","spirit-animal",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose any number of offered cards.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["take-cards","survivor",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose any offered Survivor cards.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["transfigure-selected",null,1,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose a card, then choose its transfiguration.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["transfigured-card-draft","character",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose one offered transfigured Character.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["transfigured-card-draft","cheap-character",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose one offered card.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["transfigured-card-draft","event",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose one transfigured Event.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["transfigured-card-draft","spirit-animal",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose one transfigured Spirit Animal.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
  [
    '["transfigured-card-draft","warrior",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      tx(
        "Choose one transfigured Warrior.",
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.followup.FollowupOverride.subtitle",
      ),
  ],
]);

export function staticExplorationEffectText(
  action: ExplorationActionContent,
): LocalizedString | undefined {
  const exact = EFFECT_TEXT_BY_MECHANIC.get(
    serializeExplorationPresentationMechanic(action),
  );
  if (exact !== undefined) return exact();
  if (action.count === 1) {
    return EFFECT_TEXT_BY_MECHANIC.get(
      serializeExplorationPresentationMechanic({
        ...action,
        count: undefined,
      }),
    )?.();
  }
  return undefined;
}

export function sharedExplorationFollowupSubtitle(
  action: ExplorationActionContent,
): LocalizedString | undefined {
  const exact = FOLLOWUP_SUBTITLE_BY_MECHANIC.get(
    serializeExplorationPresentationMechanic(action),
  );
  if (exact !== undefined) return exact();
  if (action.count === 1) {
    return FOLLOWUP_SUBTITLE_BY_MECHANIC.get(
      serializeExplorationPresentationMechanic({
        ...action,
        count: undefined,
      }),
    )?.();
  }
  return undefined;
}

export type ExplorationPresentationArgument =
  | "card_type"
  | "deck_card"
  | "dreamsign"
  | "fixed_card"
  | "nightmare_card"
  | "offered_card"
  | "predicate"
  | "starter_card"
  | "transfiguration";
export type ExplorationPresentationArguments = Partial<
  Record<ExplorationPresentationArgument, LocalizedString>
>;

function requiredArgument(
  values: ExplorationPresentationArguments,
  name: ExplorationPresentationArgument,
): LocalizedString {
  const value = values[name];
  if (value === undefined)
    throw new Error(
      `Missing derived Exploration presentation argument {${name}}.`,
    );
  return value;
}

export function derivedExplorationEffectArgumentNames(
  action: ExplorationActionContent,
): readonly ExplorationPresentationArgument[] {
  switch (action.effectKind) {
    case "gain-offered-card":
      return ["offered_card"];
    case "gain-card":
      return ["fixed_card"];
    case "gain-dreamsign":
      return ["dreamsign"];
    case "reduce-cost-all-and-gain-nightmares":
      return ["nightmare_card"];
    case "make-predicate-fast-and-gain-nightmares":
      return ["predicate", "nightmare_card"];
    case "transfigure-fixed-selected":
      return action.deckTarget === "offered"
        ? ["transfiguration", "deck_card"]
        : [];
    case "change-subtype-selected":
      return action.deckTarget === "offered" ? ["deck_card"] : [];
    case "copy-selected-card":
      return action.deckTarget === "offered" ? ["deck_card"] : [];
    case "replace-random-with-card":
    case "replace-selected-with-card":
      return ["fixed_card"];
    case "change-card-type-selected":
      return action.deckTarget === "offered" ? ["deck_card", "card_type"] : [];
    case "gain-nightmare-and-offered-dreamsign":
      return ["nightmare_card"];
    case "purge-starter-card":
      return ["starter_card"];
    case "purge-disclosed-and-transfigure-same-type":
      return ["deck_card", "transfiguration"];
    case "gain-nightmare-and-dreamsign":
      return ["nightmare_card", "dreamsign"];
    case "take-transfigured-cards-and-gain-nightmares":
      return ["predicate", "transfiguration", "nightmare_card"];
    case "gain-nightmare-and-card":
      return ["nightmare_card", "fixed_card"];
    default:
      return [];
  }
}

export function derivedExplorationEffectText(
  action: ExplorationActionContent,
  values: ExplorationPresentationArguments,
): LocalizedString {
  const staticText = staticExplorationEffectText(action);
  if (staticText !== undefined) return staticText;
  const count = action.count ?? 1;
  const nightmareCount = action.nightmareCount ?? 1;
  switch (action.effectKind) {
    case "gain-random-essence": {
      const minimumEssence = action.minimumEssence;
      const maximumEssence = action.maximumEssence;
      if (minimumEssence === undefined || maximumEssence === undefined) {
        throw new Error(
          "Missing essence range for derived Exploration presentation.",
        );
      }
      return txa(
        "Gain a random amount of essence between {minimum_essence} and {maximum_essence}",
        {
          minimum_essence: minimumEssence,
          maximum_essence: maximumEssence,
        },
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      );
    }
    case "gain-offered-card":
      return count === 1
        ? txa(
            "Gain {offered_card}",
            { offered_card: opaque(requiredArgument(values, "offered_card")) },
            "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
          )
        : txa(
            "Gain {count} copies of {offered_card}",
            {
              count,
              offered_card: opaque(requiredArgument(values, "offered_card")),
            },
            "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
          );
    case "gain-card":
      return txa(
        "Gain {fixed_card}",
        { fixed_card: opaque(requiredArgument(values, "fixed_card")) },
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      );
    case "gain-dreamsign":
      return txa(
        "Gain {dreamsign}",
        { dreamsign: opaque(requiredArgument(values, "dreamsign")) },
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      );
    case "reduce-cost-all-and-gain-nightmares":
      return txa(
        "All cards in your deck are reduced in cost by {energy_cost_reduction}●. Gain {nightmare_count} {nightmare_card} cards.",
        {
          energy_cost_reduction: action.energyCostReduction ?? 1,
          nightmare_count: nightmareCount,
          nightmare_card: opaque(requiredArgument(values, "nightmare_card")),
        },
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      );
    case "transfigure-fixed-selected":
      return txa(
        "Apply {transfiguration} to {deck_card}",
        {
          transfiguration: opaque(requiredArgument(values, "transfiguration")),
          deck_card: opaque(requiredArgument(values, "deck_card")),
        },
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      );
    case "change-subtype-selected":
      return txa(
        "Change {deck_card} to become a {subtype}",
        {
          deck_card: opaque(requiredArgument(values, "deck_card")),
          subtype: action.subtype ?? "Outsider",
        },
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      );
    case "copy-selected-card":
      return txa(
        "Gain {count} copies of {deck_card}",
        { count, deck_card: opaque(requiredArgument(values, "deck_card")) },
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      );
    case "replace-random-with-card":
      return txa(
        "Purge a random Character card and replace it with {fixed_card}",
        { fixed_card: opaque(requiredArgument(values, "fixed_card")) },
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      );
    case "replace-selected-with-card":
      return txa(
        "Choose a card to purge and replace it with {fixed_card}",
        { fixed_card: opaque(requiredArgument(values, "fixed_card")) },
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      );
    case "change-card-type-selected":
      return txa(
        "Change {deck_card} to become {card_type}",
        {
          deck_card: opaque(requiredArgument(values, "deck_card")),
          card_type: opaque(requiredArgument(values, "card_type")),
        },
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      );
    case "gain-nightmare-and-offered-dreamsign":
      return txa(
        "Gain {nightmare_count} {nightmare_card} cards. Gain one of {offer_count} offered Dreamsigns.",
        {
          nightmare_count: nightmareCount,
          nightmare_card: opaque(requiredArgument(values, "nightmare_card")),
          offer_count: action.offerCount ?? 1,
        },
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      );
    case "purge-starter-card":
      return txa(
        "Purge {starter_card}",
        { starter_card: opaque(requiredArgument(values, "starter_card")) },
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      );
    case "make-predicate-fast-and-gain-nightmares":
      return txa(
        "Every {predicate} card in your deck becomes ❖ (fast). Gain {nightmare_count} {nightmare_card} cards.",
        {
          predicate: opaque(requiredArgument(values, "predicate")),
          nightmare_count: nightmareCount,
          nightmare_card: opaque(requiredArgument(values, "nightmare_card")),
        },
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      );
    case "purge-disclosed-and-transfigure-same-type":
      return txa(
        "Purge {deck_card}. Apply {transfiguration} to every other eligible card in your deck with the same card type.",
        {
          deck_card: opaque(requiredArgument(values, "deck_card")),
          transfiguration: opaque(requiredArgument(values, "transfiguration")),
        },
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      );
    case "gain-nightmare-and-dreamsign":
      return txa(
        "Gain {nightmare_count} {nightmare_card} cards. Gain {dreamsign}.",
        {
          nightmare_count: nightmareCount,
          nightmare_card: opaque(requiredArgument(values, "nightmare_card")),
          dreamsign: opaque(requiredArgument(values, "dreamsign")),
        },
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      );
    case "take-transfigured-cards-and-gain-nightmares":
      return txa(
        "Gain any number of {predicate} cards from {offer_count} choices. Apply {transfiguration} to each eligible card gained. Gain {nightmare_count} {nightmare_card} cards.",
        {
          predicate: opaque(requiredArgument(values, "predicate")),
          offer_count: action.offerCount ?? 1,
          transfiguration: opaque(requiredArgument(values, "transfiguration")),
          nightmare_count: nightmareCount,
          nightmare_card: opaque(requiredArgument(values, "nightmare_card")),
        },
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      );
    case "gain-nightmare-and-card":
      return txa(
        "Gain {nightmare_count} {nightmare_card} cards. Gain {fixed_card}.",
        {
          nightmare_count: nightmareCount,
          nightmare_card: opaque(requiredArgument(values, "nightmare_card")),
          fixed_card: opaque(requiredArgument(values, "fixed_card")),
        },
        "Path: EncounterDefinition.actions.ActionDefinition.presentation_override.ActionPresentationOverride.effect_text",
      );
    default:
      throw new Error(
        `Missing code-owned Exploration presentation for ${action.effectKind} (${serializeExplorationPresentationMechanic(action)}).`,
      );
  }
}
