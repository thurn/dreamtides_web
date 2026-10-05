import type { ExplorationActionContent } from "./exploration";
import { formatNumber } from "../runtime/format-number";

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

const EFFECT_TEXT_BY_MECHANIC = new Map<string, () => string>([
  [
    '["add-fixed-site",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,"DreamsignBazaar"]',
    () =>
      "Add a Dreamsign Bazaar site to this Dreamscape",
  ],
  [
    '["add-fixed-site",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,"Duplication"]',
    () =>
      "Add a duplication site to this Dreamscape",
  ],
  [
    '["add-fixed-site",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,"Purge"]',
    () =>
      "Add a purge site to this Dreamscape",
  ],
  [
    '["add-fixed-site",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,"Shop"]',
    () =>
      "Add a card market site to this Dreamscape",
  ],
  [
    '["add-fixed-site",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,"Transfiguration"]',
    () =>
      "Add a Transfiguration site to this Dreamscape",
  ],
  [
    '["add-site",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Add a disclosed site to this Dreamscape",
  ],
  [
    '["change-subtype-all",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,["Warrior","Mage","Spirit Animal","Survivor"],null,null,null]',
    () =>
      "All characters in your deck become the subtype of your choice",
  ],
  [
    '["change-subtype-selected","character",null,null,"chosen",null,null,null,null,null,null,null,null,null,null,"Detective",null,null,null,null]',
    () =>
      "Change a chosen character card to be a Detective",
  ],
  [
    '["change-subtype-selected","character",null,null,"chosen",null,null,null,null,null,null,null,null,null,null,"Monster",null,null,null,null]',
    () =>
      "Change a chosen character card to be a Monster",
  ],
  [
    '["change-subtype-selected","character",null,null,"chosen",null,null,null,null,null,null,null,null,null,null,"Musician",null,null,null,null]',
    () =>
      "Change a chosen character card to be a Musician",
  ],
  [
    '["change-subtype-selected","character",null,null,"chosen",null,null,null,null,null,null,null,null,null,null,"Outsider",null,null,null,null]',
    () =>
      "Change a chosen character card to be an Outsider",
  ],
  [
    '["change-subtype-selected","character",null,null,"chosen",null,null,null,null,null,null,null,null,null,null,"Spirit Animal",null,null,null,null]',
    () =>
      "Change a chosen character card to be a Spirit Animal",
  ],
  [
    '["change-subtype-selected","character",null,null,"chosen",null,null,null,null,null,null,null,null,null,null,"Synth",null,null,null,null]',
    () =>
      "Change a chosen character card to be a Synth",
  ],
  [
    '["change-subtype-selected","character",null,null,"chosen",null,null,null,null,null,null,null,null,null,null,"Vehicle",null,null,null,null]',
    () =>
      "Change a chosen character card to be a Vehicle",
  ],
  [
    '["change-subtype-selected","character",null,null,"chosen",null,null,null,null,null,null,null,null,null,null,"Warrior",null,null,null,null]',
    () =>
      "Change a chosen character card to be a Warrior",
  ],
  [
    '["choose-avatar",null,null,null,null,null,null,3,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Pick a new Avatar from three choices",
  ],
  [
    '["choose-pack","character",null,null,null,2,3,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose one of two packs of Character cards to add to your deck",
  ],
  [
    '["choose-pack","cheap-character",null,null,null,2,3,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose one of two packs of ≤2● cost Character cards to add to your deck",
  ],
  [
    '["choose-pack","spirit-animal",null,null,null,2,3,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose one of two packs of Spirit Animal cards to add to your deck",
  ],
  [
    '["choose-pack","survivor",null,null,null,2,3,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose one of two packs of Survivor cards to add to your deck",
  ],
  [
    '["choose-pack","warrior",null,null,null,2,3,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose one of two packs of Warrior cards to add to your deck",
  ],
  [
    '["choose-pack","warrior",null,null,null,3,3,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose one of three packs of Warrior cards to add to your deck",
  ],
  [
    '["choose-site-type",null,null,null,null,null,null,3,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose one of three offered site types to add to this Dreamscape",
  ],
  [
    '["copy-offered-deck-card",null,null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Draw four cards from your deck and choose one to gain a copy of.",
  ],
  [
    '["copy-random-cards","character",2,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Gain one copy of each of two random Character cards in your deck",
  ],
  [
    '["copy-selected-card","character",1,null,"chosen",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Gain a copy of a chosen Character card",
  ],
  [
    '["copy-selected-card","event",2,null,"chosen",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Gain two copies of a chosen Event",
  ],
  [
    '["copy-selected-card",null,1,null,"chosen",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Gain one copy of a chosen card",
  ],
  [
    '["copy-selected-card",null,2,null,"chosen",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Gain two copies of a chosen card",
  ],
  [
    '["copy-selected-cards",null,2,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Gain one copy of each of two chosen cards",
  ],
  [
    '["double-essence",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Double your current essence",
  ],
  [
    '["draft-card","character",1,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Draft a Character from four choices",
  ],
  [
    '["draft-card","character",2,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Draft a Character from four choices and gain two copies of it",
  ],
  [
    '["draft-card","cheap-character",1,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Draft a ≤2● cost Character from four choices",
  ],
  [
    '["draft-card","cheap-character",2,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Draft a ≤2● cost Character from four choices and gain two copies of it",
  ],
  [
    '["draft-card","event",1,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Draft an Event from four choices",
  ],
  [
    '["draft-card","event",2,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Draft an Event from four choices and gain two copies of it",
  ],
  [
    '["draft-card","spirit-animal",1,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Draft a Spirit Animal from four choices",
  ],
  [
    '["draft-card","spirit-animal",2,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Draft a Spirit Animal from four choices and gain two copies of it",
  ],
  [
    '["draft-card","survivor",1,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Draft a Survivor from four choices",
  ],
  [
    '["draft-card","survivor",2,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Draft a Survivor from four choices and gain two copies of it",
  ],
  [
    '["draft-card","warrior",1,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Draft a Warrior from four choices",
  ],
  [
    '["draft-card","warrior",2,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Draft a Warrior from four choices and gain two copies of it",
  ],
  [
    '["free-next-shop",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "All items in the next shop you visit are free",
  ],
  [
    '["gain-essence-per-card","character",null,null,null,null,null,null,null,15,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Gain 15 essence for each Character card in your deck",
  ],
  [
    '["gain-essence-per-card","cheap-character",null,null,null,null,null,null,null,15,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Gain 15 essence for each ≤2● cost Character in your deck",
  ],
  [
    '["gain-essence-per-card","event",null,null,null,null,null,null,null,15,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Gain 15 essence for each Event card in your deck",
  ],
  [
    '["gain-essence-per-card","spirit-animal",null,null,null,null,null,null,null,15,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Gain 15 essence for each Spirit Animal card in your deck",
  ],
  [
    '["gain-essence-per-card","survivor",null,null,null,null,null,null,null,15,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Gain 15 essence for each Survivor card in your deck",
  ],
  [
    '["gain-essence-per-card","warrior",null,null,null,null,null,null,null,15,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Gain 15 essence for each Warrior card in your deck",
  ],
  [
    '["gain-essence",null,null,null,null,null,null,null,null,null,null,100,null,null,null,null,null,null,null,null]',
    () =>
      "Gain 100 essence",
  ],
  [
    '["gain-offered-dreamsign",null,null,null,null,null,null,3,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Gain one of three offered dreamsigns",
  ],
  [
    '["gain-random-cards","character",1,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Gain a random Character card",
  ],
  [
    '["gain-random-cards","character",2,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Gain two random Character cards",
  ],
  [
    '["gain-random-cards","cheap-character",2,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Gain two random ≤2● cost Character cards",
  ],
  [
    '["gain-random-cards","event",1,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Gain a random Event card",
  ],
  [
    '["gain-random-cards","legendary",1,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Gain a random legendary card",
  ],
  [
    '["gain-random-cards","spirit-animal",2,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Gain two random Spirit Animal cards",
  ],
  [
    '["gain-random-cards","survivor",1,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Gain a random Survivor card",
  ],
  [
    '["gain-random-cards","survivor",2,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Gain two random Survivor cards",
  ],
  [
    '["gain-random-cards","warrior",2,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Gain two random Warrior cards",
  ],
  [
    '["gain-random-dreamsign",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Gain a random dreamsign",
  ],
  [
    '["increase-spark-all",null,null,null,null,null,null,null,null,null,1,null,null,null,null,null,null,null,null,null]',
    () =>
      "All characters in your deck gain +1✦",
  ],
  [
    '["lose-half-essence-and-free-purchases",null,3,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Lose half your current essence. The next three items you purchase are free.",
  ],
  [
    '["make-fast-all",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "All cards in your deck become ❖ (fast)",
  ],
  [
    '["next-battle-opening-hand","event",2,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "At the start of your next battle, draw two events.",
  ],
  [
    '["next-battle-opening-hand",null,2,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Draw two additional cards at the start of your next battle",
  ],
  [
    '["next-battle-smaller-hand-and-cost-discount",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Draw one fewer card at the start of your next battle. All cards cost 1● less during that battle.",
  ],
  [
    '["next-battle-starting-energy",null,2,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Gain two additional energy at the start of your next battle",
  ],
  [
    '["purge-and-copy",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Purge a chosen card and gain a copy of another chosen card in your deck",
  ],
  [
    '["purge-dreamsign-for-essence",null,null,null,null,null,null,null,null,null,null,50,null,null,null,null,null,null,null,null]',
    () =>
      "Purge a chosen dreamsign and gain 50 essence",
  ],
  [
    '["purge-duplicates-and-grant-reclaim",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Purge all copies of every duplicated card from your deck. Every card remaining in your deck gains reclaim.",
  ],
  [
    '["purge-for-essence",null,null,null,null,null,null,null,20,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Purge a chosen card and gain 20 essence for each ✦ it had",
  ],
  [
    '["purge-one-transfigure-and-copy-others",null,null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,"Attuned",null]',
    () =>
      "Select four random cards from your deck and choose one to purge. Apply Attuned to the other three eligible cards, then gain a copy of each.",
  ],
  [
    '["purge-random-starter-and-gain-card","survivor",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Purge a random starter card. Gain a random Survivor.",
  ],
  [
    '["purge-random-starter-card",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Purge a random starter card",
  ],
  [
    '["purge-random-subtype-and-increase-spark",null,null,null,null,null,null,null,null,null,1,null,null,null,null,"Mage",null,null,null,null]',
    () =>
      "Purge a random Mage character. Every other Mage character in your deck gains +1✦.",
  ],
  [
    '["purge-random-subtype-and-increase-spark",null,null,null,null,null,null,null,null,null,1,null,null,null,null,"Monster",null,null,null,null]',
    () =>
      "Purge a random Monster character. Every other Monster character in your deck gains +1✦.",
  ],
  [
    '["purge-random-subtype-and-increase-spark",null,null,null,null,null,null,null,null,null,1,null,null,null,null,"Spirit Animal",null,null,null,null]',
    () =>
      "Purge a random Spirit Animal character. Every other Spirit Animal character in your deck gains +1✦.",
  ],
  [
    '["purge-random-subtype-and-increase-spark",null,null,null,null,null,null,null,null,null,1,null,null,null,null,"Survivor",null,null,null,null]',
    () =>
      "Purge a random Survivor. Every other Survivor in your deck gains +1✦.",
  ],
  [
    '["purge-random-subtype-and-increase-spark",null,null,null,null,null,null,null,null,null,1,null,null,null,null,"Synth",null,null,null,null]',
    () =>
      "Purge a random Synth character. Every other Synth character in your deck gains +1✦.",
  ],
  [
    '["purge-random-subtype-and-increase-spark",null,null,null,null,null,null,null,null,null,1,null,null,null,null,"Visionary",null,null,null,null]',
    () =>
      "Purge a random Visionary character. Every other Visionary character in your deck gains +1✦.",
  ],
  [
    '["purge-random-subtype-and-increase-spark",null,null,null,null,null,null,null,null,null,1,null,null,null,null,"Visitor",null,null,null,null]',
    () =>
      "Purge a random Visitor character. Every other Visitor character in your deck gains +1✦.",
  ],
  [
    '["purge-random-subtype-and-increase-spark",null,null,null,null,null,null,null,null,null,1,null,null,null,null,"Warrior",null,null,null,null]',
    () =>
      "Purge a random Warrior. Every other Warrior in your deck gains +1✦.",
  ],
  [
    '["purge-selected-dreamsign-and-gain-random",null,3,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Purge a chosen Dreamsign. Gain three random Dreamsigns.",
  ],
  [
    '["purge-selected","character",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Purge a chosen Character card",
  ],
  [
    '["purge-selected","cheap-character",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Purge a chosen ≤1✦ Character card",
  ],
  [
    '["purge-selected","event",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Purge a chosen Event",
  ],
  [
    '["purge-selected","warrior",2,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Purge up to two chosen Warrior cards",
  ],
  [
    '["purge-selected","warrior",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Purge a chosen Warrior",
  ],
  [
    '["purge-selected",null,2,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Purge up to two chosen cards",
  ],
  [
    '["purge-selected",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Purge a chosen card",
  ],
  [
    '["replace-all-dreamsigns-random",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Replace all of your Dreamsigns with random Dreamsigns",
  ],
  [
    '["replace-all-starter-cards","character",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Purge all starter cards and replace each one with a Character card",
  ],
  [
    '["replace-selected-dreamsign-with-offered",null,null,null,null,null,null,3,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Replace a chosen dreamsign with one of three offered dreamsigns",
  ],
  [
    '["replace-selected","character",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Purge a chosen Character card and gain a random Character replacement",
  ],
  [
    '["replace-selected","cheap-character",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Purge a chosen ≤2● cost Character and gain a random ≤2● cost Character replacement",
  ],
  [
    '["replace-selected","event",2,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Purge up to two chosen Event cards and gain a random Event replacement for each card purged",
  ],
  [
    '["replace-selected","event",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Purge a chosen Event card and gain a random Event replacement",
  ],
  [
    '["replace-selected","spirit-animal",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Purge a chosen Spirit Animal card and gain a random Spirit Animal replacement",
  ],
  [
    '["replace-selected","warrior",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Purge a chosen Warrior card and gain a random Warrior replacement",
  ],
  [
    '["take-cards","character",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Take any number of Character cards from four choices",
  ],
  [
    '["take-cards","cheap-character",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Take any number of ≤2● cost Character cards from four choices",
  ],
  [
    '["take-cards","event",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Take any number of Event cards from four choices",
  ],
  [
    '["take-cards","spirit-animal",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Take any number of Spirit Animal cards from four choices",
  ],
  [
    '["take-cards","survivor",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Take any number of Survivor cards from four choices",
  ],
  [
    '["take-cards","warrior",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Take any number of Warrior cards from four choices",
  ],
  [
    '["transfigure-all-cards",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Transfigure all cards in your deck",
  ],
  [
    '["transfigure-all-for-essence","character",null,null,null,null,null,null,null,null,null,100,null,null,null,null,null,null,"Kindled",null]',
    () =>
      "Lose 100 essence. Apply Kindled to every eligible Character card in your deck.",
  ],
  [
    '["transfigure-all-for-essence","cheap-character",null,null,null,null,null,null,null,null,null,100,null,null,null,null,null,null,"Kindled",null]',
    () =>
      "Lose 100 essence. Apply Kindled to every eligible Cheap Character card in your deck.",
  ],
  [
    '["transfigure-all-for-essence","event",null,null,null,null,null,null,null,null,null,100,null,null,null,null,null,null,"Inspired",null]',
    () =>
      "Lose 100 essence. Apply Inspired to every eligible Event card in your deck.",
  ],
  [
    '["transfigure-all-for-essence","warrior",null,null,null,null,null,null,null,null,null,100,null,null,null,null,null,null,"Kindled",null]',
    () =>
      "Lose 100 essence. Apply Kindled to every eligible Warrior card in your deck.",
  ],
  [
    '["transfigure-all-starter-cards",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Transfigure all starter cards",
  ],
  [
    '["transfigure-fixed-random-cards","cheap-character",2,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,"Kindled",null]',
    () =>
      "Apply Kindled to two random eligible ≤2● cost Character cards in your deck",
  ],
  [
    '["transfigure-fixed-selected","event",null,null,"chosen",null,null,null,null,null,null,null,null,null,null,null,null,null,"Inspired",null]',
    () =>
      "Apply Inspired to a chosen Event",
  ],
  [
    '["transfigure-fixed-selected","warrior",2,null,"chosen",null,null,null,null,null,null,null,null,null,null,null,null,null,"Kindled",null]',
    () =>
      "Apply Kindled to two chosen Warrior cards",
  ],
  [
    '["transfigure-fixed-selected",null,null,null,"chosen",null,null,null,null,null,null,null,null,null,null,null,null,null,"Empowered",null]',
    () =>
      "Apply Empowered to a chosen card",
  ],
  [
    '["transfigure-next-draft-or-shop",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "The next draft or shop site you visit will contain transfigured cards",
  ],
  [
    '["transfigure-random-cards","event",2,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Apply a transfiguration to two random Event cards",
  ],
  [
    '["transfigure-random-starter-cards",null,2,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Transfigure two random starter cards",
  ],
  [
    '["transfigure-selected","event",2,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Apply a transfiguration to two chosen Event cards",
  ],
  [
    '["transfigure-selected",null,1,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Apply a transfiguration to a chosen card",
  ],
  [
    '["transfigured-card-draft","character",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Draft a transfigured Character from four choices",
  ],
  [
    '["transfigured-card-draft","cheap-character",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Draft a transfigured ≤2● cost Character from four choices",
  ],
  [
    '["transfigured-card-draft","event",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Draft a transfigured Event from four choices",
  ],
  [
    '["transfigured-card-draft","spirit-animal",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Draft a transfigured Spirit Animal from four choices",
  ],
  [
    '["transfigured-card-draft","warrior",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Draft a transfigured Warrior from four choices",
  ],
]);

const FOLLOWUP_SUBTITLE_BY_MECHANIC = new Map<string, () => string>([
  [
    '["change-subtype-all",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,["Warrior","Mage","Spirit Animal","Survivor"],null,null,null]',
    () =>
      "Choose one shared subtype for every Character.",
  ],
  [
    '["change-subtype-selected","character",null,null,"chosen",null,null,null,null,null,null,null,null,null,null,"Spirit Animal",null,null,null,null]',
    () =>
      "Choose a Character to become a Spirit Animal.",
  ],
  [
    '["change-subtype-selected","character",null,null,"chosen",null,null,null,null,null,null,null,null,null,null,"Warrior",null,null,null,null]',
    () =>
      "Choose a Character to become a Warrior.",
  ],
  [
    '["choose-avatar",null,null,null,null,null,null,3,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose one offered Avatar.",
  ],
  [
    '["choose-pack","character",null,null,null,2,3,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose one pack to add to your deck.",
  ],
  [
    '["choose-pack","cheap-character",null,null,null,2,3,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose one pack to add to your deck.",
  ],
  [
    '["choose-pack","spirit-animal",null,null,null,2,3,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose one Spirit Animal pack to add to your deck.",
  ],
  [
    '["choose-pack","survivor",null,null,null,2,3,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose one pack to add to your deck.",
  ],
  [
    '["choose-pack","warrior",null,null,null,2,3,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose one pack to add to your deck.",
  ],
  [
    '["copy-offered-deck-card",null,null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose one offered card to copy.",
  ],
  [
    '["copy-selected-card",null,1,null,"chosen",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose a card to gain one copy of.",
  ],
  [
    '["copy-selected-cards",null,2,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose two cards to copy.",
  ],
  [
    '["draft-card","character",1,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose one offered card.",
  ],
  [
    '["draft-card","character",2,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose one offered card.",
  ],
  [
    '["draft-card","cheap-character",1,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose one offered card.",
  ],
  [
    '["draft-card","cheap-character",2,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose one offered card.",
  ],
  [
    '["draft-card","event",1,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose one offered card.",
  ],
  [
    '["draft-card","event",2,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose one offered Event to gain twice.",
  ],
  [
    '["draft-card","spirit-animal",1,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose one offered card.",
  ],
  [
    '["draft-card","spirit-animal",2,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose one offered card.",
  ],
  [
    '["draft-card","survivor",1,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose one offered card.",
  ],
  [
    '["draft-card","survivor",2,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose one offered card.",
  ],
  [
    '["draft-card","warrior",1,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose one offered card.",
  ],
  [
    '["draft-card","warrior",2,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose one offered card.",
  ],
  [
    '["gain-dreamsign",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose a Dreamsign to replace.",
  ],
  [
    '["gain-nightmare-and-dreamsign",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,2,null,null]',
    () =>
      "Choose a Dreamsign to replace.",
  ],
  [
    '["gain-nightmare-and-offered-dreamsign",null,null,null,null,null,null,3,null,null,null,null,null,null,null,null,null,2,null,null]',
    () =>
      "Choose one offered Dreamsign.",
  ],
  [
    '["gain-offered-dreamsign",null,null,null,null,null,null,3,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose one offered Dreamsign.",
  ],
  [
    '["gain-random-dreamsign",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose a Dreamsign to replace.",
  ],
  [
    '["purge-and-copy",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "First choose a card to purge, then choose a different card to copy.",
  ],
  [
    '["purge-dreamsign-for-essence",null,null,null,null,null,null,null,null,null,null,50,null,null,null,null,null,null,null,null]',
    () =>
      "Choose a Dreamsign to purge.",
  ],
  [
    '["purge-for-essence",null,null,null,null,null,null,null,20,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose a card to burn for 20 essence per ✦.",
  ],
  [
    '["purge-selected-dreamsign-and-gain-random",null,3,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose a Dreamsign to purge.",
  ],
  [
    '["take-cards","character",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose any number of offered cards.",
  ],
  [
    '["take-cards","cheap-character",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose any number of offered cards.",
  ],
  [
    '["take-cards","event",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose any number of offered cards.",
  ],
  [
    '["take-cards","spirit-animal",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose any number of offered cards.",
  ],
  [
    '["take-cards","survivor",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose any offered Survivor cards.",
  ],
  [
    '["transfigure-selected",null,1,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose a card, then choose its transfiguration.",
  ],
  [
    '["transfigured-card-draft","character",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose one offered transfigured Character.",
  ],
  [
    '["transfigured-card-draft","cheap-character",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose one offered card.",
  ],
  [
    '["transfigured-card-draft","event",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose one transfigured Event.",
  ],
  [
    '["transfigured-card-draft","spirit-animal",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose one transfigured Spirit Animal.",
  ],
  [
    '["transfigured-card-draft","warrior",null,null,null,null,null,4,null,null,null,null,null,null,null,null,null,null,null,null]',
    () =>
      "Choose one transfigured Warrior.",
  ],
]);

export function staticExplorationEffectText(
  action: ExplorationActionContent,
): string | undefined {
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
): string | undefined {
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
  Record<ExplorationPresentationArgument, string>
>;

function requiredArgument(
  values: ExplorationPresentationArguments,
  name: ExplorationPresentationArgument,
): string {
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
): string {
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
      return `Gain a random amount of essence between ${formatNumber(minimumEssence)} and ${formatNumber(maximumEssence)}`;
    }
    case "gain-offered-card":
      return count === 1
        ? `Gain ${requiredArgument(values, "offered_card")}`
        : `Gain ${formatNumber(count)} copies of ${requiredArgument(values, "offered_card")}`;
    case "gain-card":
      return `Gain ${requiredArgument(values, "fixed_card")}`;
    case "gain-dreamsign":
      return `Gain ${requiredArgument(values, "dreamsign")}`;
    case "reduce-cost-all-and-gain-nightmares":
      return `All cards in your deck are reduced in cost by ${formatNumber(action.energyCostReduction ?? 1)}●. Gain ${formatNumber(nightmareCount)} ${requiredArgument(values, "nightmare_card")} cards.`;
    case "transfigure-fixed-selected":
      return `Apply ${requiredArgument(values, "transfiguration")} to ${requiredArgument(values, "deck_card")}`;
    case "change-subtype-selected":
      return `Change ${requiredArgument(values, "deck_card")} to become a ${action.subtype ?? "Outsider"}`;
    case "copy-selected-card":
      return `Gain ${formatNumber(count)} copies of ${requiredArgument(values, "deck_card")}`;
    case "replace-random-with-card":
      return `Purge a random Character card and replace it with ${requiredArgument(values, "fixed_card")}`;
    case "replace-selected-with-card":
      return `Choose a card to purge and replace it with ${requiredArgument(values, "fixed_card")}`;
    case "change-card-type-selected":
      return `Change ${requiredArgument(values, "deck_card")} to become ${requiredArgument(values, "card_type")}`;
    case "gain-nightmare-and-offered-dreamsign":
      return `Gain ${formatNumber(nightmareCount)} ${requiredArgument(values, "nightmare_card")} cards. Gain one of ${formatNumber(action.offerCount ?? 1)} offered Dreamsigns.`;
    case "purge-starter-card":
      return `Purge ${requiredArgument(values, "starter_card")}`;
    case "make-predicate-fast-and-gain-nightmares":
      return `Every ${requiredArgument(values, "predicate")} card in your deck becomes ❖ (fast). Gain ${formatNumber(nightmareCount)} ${requiredArgument(values, "nightmare_card")} cards.`;
    case "purge-disclosed-and-transfigure-same-type":
      return `Purge ${requiredArgument(values, "deck_card")}. Apply ${requiredArgument(values, "transfiguration")} to every other eligible card in your deck with the same card type.`;
    case "gain-nightmare-and-dreamsign":
      return `Gain ${formatNumber(nightmareCount)} ${requiredArgument(values, "nightmare_card")} cards. Gain ${requiredArgument(values, "dreamsign")}.`;
    case "take-transfigured-cards-and-gain-nightmares":
      return `Gain any number of ${requiredArgument(values, "predicate")} cards from ${formatNumber(action.offerCount ?? 1)} choices. Apply ${requiredArgument(values, "transfiguration")} to each eligible card gained. Gain ${formatNumber(nightmareCount)} ${requiredArgument(values, "nightmare_card")} cards.`;
    case "gain-nightmare-and-card":
      return `Gain ${formatNumber(nightmareCount)} ${requiredArgument(values, "nightmare_card")} cards. Gain ${requiredArgument(values, "fixed_card")}.`;
    default:
      throw new Error(
        `Missing code-owned Exploration presentation for ${action.effectKind} (${serializeExplorationPresentationMechanic(action)}).`,
      );
  }
}
