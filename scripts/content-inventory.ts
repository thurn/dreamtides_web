/**
 * Phase 5.1 content inventory (docs/plan/phase-5-content.md § 5.1).
 *
 *   npx tsx scripts/content-inventory.ts           # writes the inventory
 *   npx tsx scripts/content-inventory.ts --check   # exits 1 when the file is stale
 *
 * Emits docs/plan/evidence/content-inventory.json: one record per catalog
 * entity and the Phase 5 bead plan, with every pending entity routed to the
 * bead that implements it.
 *
 * - **Entities.** The coverage gate's enumeration (cards, dreamsigns,
 *   avatars, Dreamwell cards, figments; src/engine/content-gates.test.ts),
 *   plus the nine transfigurations (keyed by their glossary UUIDs), the
 *   exploration actions that change a deck entry or the next battle (D39),
 *   and Apollyon's incarnations. Amplified text is part of its card's record.
 * - **Tags** come from the regex rules in `RULES` over each entity's printed
 *   and amplified text, split into cost and effect clauses, then the manual
 *   corrections in `CORRECTIONS`. Each tag names a mechanic family, the
 *   primitives and DSL forms it needs, and the prompt kinds it raises.
 * - **Primitives** in `PRIMITIVES` are probed against src/engine: a primitive
 *   module exists when its file is listed in effects/primitives/index.ts, a
 *   builder when src/engine/dsl exports it, and a DSL addition when its probe
 *   pattern matches. Only primitives that do not exist yet create bead
 *   edges: a bead depends on the bead that introduces each new primitive
 *   its entities need.
 * - **Families.** Each card joins the latest family (in the § 5.1 order)
 *   among its tags, and a keyword card that needs no new primitive joins the
 *   keyword family; Starter, Tutorial, and Special cards form the pilot.
 * - **Beads.** Each section (5.2–5.6, 5.7a) is planned family by family. Every
 *   new primitive the family first needs gets a primitive bead, which also
 *   takes up to `MAX_EXEMPLARS` entities that need only it. The family's
 *   other entities, ordered by tags so similar entities sit together, fill
 *   composition beads up to `TARGET_WEIGHT` and `MAX_ENTITIES`. The fixed
 *   tasks (the card checkpoint, 5.7, 5.7b, and 5.8) are split as their page
 *   sections describe. Every bead outside 5.6 that has no other edge waits
 *   for the pilot beads.
 *
 * Output is deterministic: no timestamps, and every list is sorted.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { APOLLYON_INCARNATIONS } from "../src/content/apollyon";
import { AVATARS } from "../src/content/avatars";
import { CARDS } from "../src/content/cards";
import type { ContentStatus } from "../src/content/define";
import { DREAMSIGNS } from "../src/content/dreamsigns";
import { DREAMWELL_CARDS } from "../src/content/dreamwell";
import { EXPLORATION } from "../src/content/exploration";
import { FIGMENTS } from "../src/content/figments";
import { TRANSFIGURATION } from "../src/content/transfiguration";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUTPUT = "docs/plan/evidence/content-inventory.json";
// Bead sizing (phase-5-content.md § Bead sizing). A bead's weight is the sum
// of its entities' weights; see `weight`.
const TARGET_WEIGHT = 9;
const MAX_ENTITIES = 6;
const MAX_EXEMPLARS = 3;
const WEIGHT_TEXT_UNIT = 120;
const WEIGHT_AMPLIFIED = 0.4;
const WEIGHT_TAG = 0.2;
const APOLLYON_PER_BEAD = 2;

/** Code-unit order, independent of the host locale. */
const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const read = (path: string): string => readFileSync(join(ROOT, path), "utf8");

// ---------------------------------------------------------------------------
// Mechanic families, in the batch order of phase-5-content.md § 5.1.
// Family 0 is neutral: its tags never move an entity to a later family.

interface Family {
  readonly family: number;
  readonly slug: string;
  readonly name: string;
}

const FAMILIES: readonly Family[] = [
  { family: 0, slug: "neutral", name: "neutral (triggers, costs, selectors)" },
  { family: 1, slug: "starter", name: "Starter, Tutorial, Nightmare, and Contemplation" },
  { family: 2, slug: "keyword-bodies", name: "vanilla and keyword-only bodies" },
  { family: 3, slug: "card-flow", name: "card flow" },
  { family: 4, slug: "energy-points", name: "energy and points" },
  { family: 5, slug: "removal", name: "removal" },
  { family: 6, slug: "materialize-recursion", name: "materialize and recursion" },
  { family: 7, slug: "figments", name: "figments and Legionnaire synergies" },
  { family: 8, slug: "spark-support", name: "spark, Support, anthems, and base spark" },
  { family: 9, slug: "counters", name: "counters (⧗)" },
  { family: 10, slug: "movement", name: "movement and position" },
  { family: 11, slug: "prevent-interrupts", name: "Prevent and other Interrupts" },
  { family: 12, slug: "copies", name: "copies (D15)" },
  { family: 13, slug: "gain-control", name: "gain control" },
  { family: 14, slug: "cost-modifiers", name: "cost modifiers and nth-in-turn" },
  { family: 15, slug: "subtype-synergies", name: "type and subtype synergies" },
  { family: 16, slug: "unique", name: "remaining unique cards" },
];

// ---------------------------------------------------------------------------
// Primitives and DSL forms. `kind`:
// - "primitive": a module under src/engine/effects/primitives/ (exists when
//   index.ts lists it);
// - "builder": an export of src/engine/dsl/ (exists when exported);
// - "dsl": a DSL addition (exists when `probe` matches `file`);
// - "extension": an option on an existing primitive module (exists when
//   `probe` matches its module);
// - "journey": a journey-modifier hook (P8), built by 5.6.
// `group` is the primitive group test file; `fallout` names the exported
// symbols a new form changes, for the batch's fallout listing.

const P = "src/engine/effects/primitives/";
const DSL_TYPES = "src/engine/dsl/types.ts";
const DSL_TRIGGERS = "src/engine/dsl/triggers.ts";

type PrimitiveKind = "primitive" | "builder" | "dsl" | "extension" | "journey";

interface PrimitiveEntry {
  readonly name: string;
  readonly kind: PrimitiveKind;
  readonly module?: string;
  readonly group?: string;
  readonly probe?: RegExp;
  readonly fallout?: readonly string[];
  readonly symbol?: string;
  readonly note?: string;
}

interface PrimitiveExtra {
  readonly symbol?: string;
  readonly note?: string;
}

const prim = (name: string, file: string, group: string, extra: PrimitiveExtra = {}): PrimitiveEntry => ({
  name,
  kind: "primitive",
  module: `${P}${file}`,
  group: `${P}${group}.test.ts`,
  ...extra,
});
const builder = (name: string): PrimitiveEntry => ({ name, kind: "builder" });
const dsl = (name: string, file: string, probe: RegExp, fallout: readonly string[], extra: PrimitiveExtra = {}): PrimitiveEntry => ({
  name,
  kind: "dsl",
  module: file,
  probe,
  fallout,
  ...extra,
});
const ext = (name: string, file: string, probe: RegExp, group: string, extra: PrimitiveExtra = {}): PrimitiveEntry => ({
  name,
  kind: "extension",
  module: `${P}${file}`,
  probe,
  group: `${P}${group}.test.ts`,
  ...extra,
});
const journey = (name: string, note: string): PrimitiveEntry => ({ name, kind: "journey", note });

const GAP_38 = "engine gap noted by hv-7x4l.8 (3.8)";
const GAP_37 = "engine gap noted by 3.7";
const GAP_36 = "engine gap noted by 3.6 (d24ea640)";

const PRIMITIVES: readonly PrimitiveEntry[] = [
  // Registered primitives (Phase 3).
  prim("awaken", "awaken.ts", "characters"),
  prim("banish", "banish.ts", "characters"),
  prim("banishUntil", "banish-until.ts", "characters"),
  prim("chooseOne", "choose-one.ts", "flow"),
  prim("copyCard", "copy-card.ts", "stack"),
  prim("costModifier", "cost-modifier.ts", "resources"),
  prim("createCopyInHand", "create-copy-in-hand.ts", "cards"),
  prim("disableTriggers", "disable-triggers.ts", "characters"),
  prim("discard", "discard.ts", "cards"),
  prim("dissolve", "dissolve.ts", "characters"),
  prim("draw", "draw.ts", "cards"),
  prim("erode", "erode.ts", "cards"),
  prim("exhaust", "exhaust.ts", "characters"),
  prim("floating", "floating-trigger.ts", "flow"),
  prim("forDuration", "for-duration.ts", "flow"),
  prim("foresee", "foresee.ts", "cards"),
  prim("gainControl", "gain-control.ts", "characters"),
  prim("gainEnergy", "gain-energy.ts", "resources"),
  prim("gainMaxEnergy", "gain-max-energy.ts", "resources"),
  prim("gainPoints", "gain-points.ts", "resources"),
  prim("gainSpark", "gain-spark.ts", "characters"),
  prim("giveAllTypes", "give-all-types.ts", "characters"),
  prim("grant", "grant.ts", "characters"),
  prim("ifThen", "if-then.ts", "flow"),
  prim("materializeFigmentCopy", "materialize-figment-copy.ts", "characters"),
  prim("materializeFigments", "materialize-figments.ts", "characters"),
  prim("optional", "optional.ts", "flow"),
  prim("phase", "phase.ts", "characters"),
  prim("prevent", "prevent.ts", "stack"),
  prim("repeat", "repeat.ts", "flow"),
  prim("returnToHand", "return-to-hand.ts", "characters"),
  prim("sequence", "sequence.ts", "flow"),
  prim("setBaseSpark", "set-base-spark.ts", "characters"),
  prim("sparkModifier", "spark-modifier.ts", "characters"),
  prim("triggerAbility", "trigger-ability.ts", "characters"),
  prim("winTheGame", "win-the-game.ts", "flow"),
  // Registered DSL builders.
  ...[
    "keyword", "reclaim", "additionalCost", "optionalCost", "choiceCost", "abandonCost", "discardCost",
    "banishFromVoidCost", "revealCost", "countersCost", "energy", "energyX", "exhaustSelf", "activated",
    "staticAbility", "event", "winCondition", "noCardsIn", "stackItem", "ofSubtype", "count", "supported",
    "supporting", "times", "lockedAtResolution", "upTo", "triggered", "onMaterialized", "onDawn", "onDusk",
    "onNight", "onChallenge", "onDissolved", "whenYouPlay", "whenOpponentPlays", "whenMaterialize", "whenDraw",
    "whenDiscard", "whenAbandon", "whenLeavesPlay", "whenGainsSpark", "whenScores", "whenOpponentScores",
    "whenLeavesVoid", "whenYouChallengeWith", "atStartOfTurn", "atStartOfFirstTurn", "sourceIn", "triggeringCard",
    "whileSourceInPlay", "untilEndOfTurn", "untilYourNextTurn", "untilOpponentPays",
  ].map((name) => builder(name)),
  prim("gainAdditionalSpark", "gain-spark.ts", "characters", { symbol: "gainAdditionalSpark" }),
  prim("delayed", "floating-trigger.ts", "flow", { symbol: "delayed" }),
  prim("discardRandom", "discard.ts", "cards", { symbol: "discardRandom" }),
  prim("loseKeyword", "grant.ts", "characters", { symbol: "loseKeyword" }),
  dsl("banishFromHandCost", DSL_TYPES, /cost: "banishFromHand"/, []),
  dsl("conditionControls", DSL_TYPES, /cond: "controls"/, []),
  dsl("conditionEnergyAtLeast", DSL_TYPES, /cond: "energyAtLeast"/, []),
  dsl("conditionCostPaid", DSL_TYPES, /cond: "costPaid"/, []),
  dsl("valueHandSize", DSL_TYPES, /value: "handSize"/, []),
  dsl("triggerNth", DSL_TYPES, /on: "play";[^\n]*nth\?/, []),
  dsl("functionalZones", DSL_TYPES, /export type FunctionalZone/, []),
  dsl("oncePerTurn", DSL_TYPES, /oncePerTurn\?: boolean/, []),
  dsl("speedFast", DSL_TYPES, /export type Speed = "standard" \| "fast"/, []),
  ext("preventDestination", "prevent.ts", /destination\?: PreventDestination/, "stack"),

  // Phase 5: cards group.
  prim("discover", "discover.ts", "cards", { note: "Discover (engine-design § Primitive catalog)" }),
  prim("lookAtTop", "look-at-top.ts", "cards", { note: "lookAtTop(n, distribute)" }),
  prim("reveal", "reveal.ts", "cards"),
  prim("shuffleInto", "shuffle-into.ts", "cards"),
  prim("putInDeck", "put-in-deck.ts", "cards", { note: "putOnTop / putOnBottom" }),
  prim("drawMatching", "draw-matching.ts", "cards", { note: "draw a card matching a filter (\"Draw a warrior\")" }),
  prim("discardChosen", "discard-chosen.ts", "cards", { note: "discard a card the controller chooses from the opponent's hand" }),
  prim("takeFromAmong", "take-from-among.ts", "cards", { note: "put chosen cards from among looked-at or eroded cards into hand" }),
  prim("returnFromVoid", "return-from-void.ts", "cards", { note: "return a card from a void to its owner's hand" }),
  prim("banishCards", "banish-cards.ts", "cards", { note: "banish cards from a void or hand, optionally until a duration" }),
  prim("grantReclaim", "grant-reclaim.ts", "cards", { note: `a card in a void gains Reclaim, costed or not (${GAP_38})` }),
  prim("grantCardKeyword", "grant-card-keyword.ts", "cards", { note: "cards in hand, void, or deck gain a keyword" }),
  prim("modifyCardCost", "modify-card-cost.ts", "cards", { note: "\"it costs 0● this turn\", \"reduce its cost by 1●\"" }),
  prim("createCard", "create-card.ts", "cards", { note: "create a named or random catalog card in hand (C1, C11)" }),
  // Phase 5: resources group.
  prim("doubleEnergy", "double-energy.ts", "resources"),
  prim("loseEnergy", "lose-energy.ts", "resources"),
  prim("losePoints", "lose-points.ts", "resources", { note: "C14: stops at 0" }),
  prim("storeCounters", "store-counters.ts", "resources", { note: "store N⧗ (engine-design: store)" }),
  // Phase 5: characters group.
  prim("abandon", "abandon.ts", "characters", { note: "abandon(chooser, predicate) as an effect" }),
  prim("materialize", "materialize.ts", "characters", { note: `materialize(from, selection) from void, deck, or hand (${GAP_38})` }),
  prim("rematerialize", "rematerialize.ts", "characters"),
  prim("move", "move.ts", "characters", { note: "move(slotRule)" }),
  prim("loseAllAbilities", "lose-all-abilities.ts", "characters"),
  prim("gainAbilities", "gain-abilities.ts", "characters"),
  prim("chooseSubtype", "choose-subtype.ts", "characters", { note: "choose a character type and record it on the source" }),
  // Phase 5: stack group.
  ext("copyCardTimes", "copy-card.ts", /times/, "stack", { note: "copying more than once" }),
  ext("preventUnlessAbandons", "prevent.ts", /unlessAbandons/, "stack"),
  prim("playRestriction", "play-restriction.ts", "stack", { note: "continuous: limits which cards a player may play" }),
  // Phase 5: flow group.
  prim("eachPlayer", "each-player.ts", "flow"),
  prim("choosePlayer", "choose-player.ts", "flow"),
  prim("ruleModifier", "rule-modifier.ts", "flow", { note: "continuous changes to turn rules: draw counts, energy carry-over, ephemeral retention, Offering payment" }),
  prim("drawDreamwell", "draw-dreamwell.ts", "resources", { note: "C16: draw an additional Dreamwell card" }),
  prim("takeExtraTurn", "take-extra-turn.ts", "flow", { note: "C8" }),
  // Phase 5: continuous permissions.
  prim("playFromZone", "play-from-zone.ts", "cards", { note: "continuous: cards may be played from the void or the top of the deck" }),
  prim("reclaimNotBanished", "reclaim-not-banished.ts", "cards", { note: `continuous: cards you reclaim are not banished (${GAP_38})` }),
  // Phase 5: cost modifiers.
  ext("costModifierNth", "cost-modifier.ts", /nthInTurn|nth:/, "resources", { note: "\"the first warrior you play each turn costs…\"" }),
  ext("costModifierReclaim", "cost-modifier.ts", /reclaim/i, "resources", { note: "\"Reclaim abilities cost you 1● less\"" }),
  ext("costModifierActivated", "cost-modifier.ts", /activated/, "resources", { note: `cost modifiers on activated abilities (${GAP_37})` }),
  // Phase 5: DSL additions.
  dsl("selectorFigment", DSL_TYPES, /readonly figment\?: boolean/, ["CharacterSelector"], { note: "figment or not" }),
  dsl("selectorHasAbility", DSL_TYPES, /readonly hasAbility\?/, ["CharacterSelector", "CardFilter"], { note: "\"characters with ▸Materialized abilities\"" }),
  dsl("stackSelectorBounds", DSL_TYPES, /interface StackItemSelector \{[^}]*costAtMost/, ["StackItemSelector"], { note: "cost and ✦ bounds on stack items (\"Prevent a played ≤2● cost card\")" }),
  dsl("selectorChallenger", DSL_TYPES, /readonly challenging\?: boolean/, ["CharacterSelector"], { note: "challengers" }),
  dsl("selectorBounds", DSL_TYPES, /costAtLeast\?|costExactly\?/, ["CharacterSelector"], { note: "exact, ≥, X-valued, and relative cost and ✦ bounds" }),
  dsl("cardFilterBounds", DSL_TYPES, /interface CardFilter \{[^}]*costAtMost/, ["CardFilter"], { note: `cost and ✦ bounds on play and materialize filters (${GAP_36})` }),
  dsl("zoneCardRefs", DSL_TYPES, /ZoneCardSpec|kind: "inZone"/, ["CardRef"], { note: "references to cards in a void, deck, or hand" }),
  dsl("randomSelection", DSL_TYPES, /random\?: boolean;[^\n]*\n[^\n]*selection|selection: "random"/, ["CardRef"], { note: "\"a random …\" selections" }),
  dsl("valueZoneCounts", DSL_TYPES, /value: "countCards"/, ["ValueExpr"], { note: "counts of cards in a zone" }),
  dsl("valueCardStats", DSL_TYPES, /value: "sparkOf"|value: "costOf"/, ["ValueExpr"], { note: "\"this character's ✦\", \"that card's cost\"" }),
  dsl("storedCounters", DSL_TYPES, /value: "storedCounters"/, ["ValueExpr", "PaymentCost"], { note: "stored ⧗ values and X⧗ costs" }),
  dsl("conditionCardCounts", DSL_TYPES, /cond: "cardsIn";[^\n]*atLeast/, ["Condition"], { note: "\"if there are 3 or more events in your void\"" }),
  dsl("turnHistory", DSL_TYPES, /value: "playedThisTurn"|cond: "thisTurn"/, ["ValueExpr", "Condition"], { note: "turn counters: cards played, discarded, dissolved this turn" }),
  dsl("historyRefs", DSL_TYPES, /kind: "lastPlayed"/, ["CardRef"], { note: `"the last warrior you played" (${GAP_38})` }),
  dsl("staticZones", DSL_TYPES, /interface StaticAbility \{[^}]*zone/, ["StaticAbility"], { note: `statics that work from hand, void, or deck (C4; ${GAP_37})` }),
  dsl("playCondition", DSL_TYPES, /kind: "playCondition"/, ["Ability"], { note: "\"Play this event only if …\"" }),
  dsl("alternativeCost", DSL_TYPES, /kind: "alternativeCost"/, ["Ability"], { note: "\"you may play this card for …\"" }),
  dsl("pointsCost", DSL_TYPES, /cost: "points"/, ["PaymentCost"], { note: "pay ⍟ as a cost" }),
  dsl("returnCost", DSL_TYPES, /cost: "returnToHand"/, ["PaymentCost"], { note: "\"Return a character you control to hand:\" as a cost" }),
  dsl("discardCostFilter", DSL_TYPES, /cost: "discard";[^\n]*filter/, ["PaymentCost"], { note: "discard a matching card, X cards, or the whole hand as a cost" }),
  dsl("banishXCost", DSL_TYPES, /banishFromVoid";[^\n]*count: number \| "x"/, ["PaymentCost"], { note: "banish X cards from your void" }),
  dsl("banishFromAnyVoidCost", DSL_TYPES, /banishFromVoid";[^\n]*player/, ["PaymentCost"], { note: "banish a card from the opponent's or any void as a cost" }),
  dsl("whenDissolvedTrigger", DSL_TYPES, /on: "dissolved"; readonly subject/, ["Trigger"], { note: "\"when a character you control is dissolved\"" }),
  dsl("whenDiscardSelfTrigger", DSL_TYPES, /on: "discard";[^\n]*self/, ["Trigger"], { note: "\"when you discard this card\"" }),
  dsl("whenReclaimTrigger", DSL_TYPES, /on: "reclaim"/, ["Trigger"]),
  dsl("whenReturnTrigger", DSL_TYPES, /on: "returnToHand"/, ["Trigger"]),
  dsl("whenErodeTrigger", DSL_TYPES, /on: "erode"/, ["Trigger"]),
  dsl("whenForeseeTrigger", DSL_TYPES, /on: "foresee"/, ["Trigger"]),
  dsl("whenCopyTrigger", DSL_TYPES, /on: "copy"/, ["Trigger"], { note: `"when you copy" (${GAP_38})` }),
  dsl("whenRemovesEnemyTrigger", DSL_TYPES, /on: "removesEnemy"/, ["Trigger"], { note: "\"when you dissolve or banish an enemy\"" }),
  dsl("whenPutIntoVoidTrigger", DSL_TYPES, /on: "putIntoVoid"/, ["Trigger"]),
  dsl("whenPlayFromVoidTrigger", DSL_TYPES, /from\?: "void"|fromVoid/, ["Trigger"], { note: "\"when you play a card from your void\"" }),
  dsl("drawTriggerFilter", DSL_TYPES, /on: "draw";[^\n]*filter/, ["Trigger"], { note: "\"when you draw a character\"" }),
  dsl("materializeNthTrigger", DSL_TYPES, /on: "materialize";[^\n]*nth/, ["Trigger"], { note: "\"your second spirit animal in a turn\"" }),
  dsl("atEndOfTurnTrigger", DSL_TRIGGERS, /export const atEndOfTurn\b/, ["Trigger"], { note: "\"at the end of your turn\" (Ending)" }),
  dsl("firstTimeEachTurn", DSL_TYPES, /firstTimeEachTurn/, ["TriggeredAbility"], { note: "\"the first time each turn …\"" }),
  dsl("typeRemap", "src/engine/dsl/types.ts", /typeRemap/, ["Variant"], { note: `C12 type remap for selectors and figments (${GAP_38})` }),
  // Journey-modifier registry (P8, 5.6).
  journey("journeyEssence", "essence gains and site rewards"),
  journey("journeyShop", "shop offers, pricing, restocks, duplication, the Dream Bazaar"),
  journey("journeyDraft", "draft choice counts"),
  journey("journeyPurge", "purge permissions, payouts, and windows"),
  journey("journeyDuplication", "duplication counts"),
  journey("journeyTransfiguration", "transfiguration counts, random and forced transfigurations"),
  journey("journeySites", "site enhancement and rerolls, essence-site alternatives"),
  journey("journeyOnGain", "\"when you gain this dreamsign\" one-shots"),
  journey("journeyDeckEntry", "deck-entry changes from dreamsigns (D39 variant)"),
  journey("journeyBattleInit", "battle-start effects: opening hand, draw counts, hand rules"),
];

// ---------------------------------------------------------------------------
// Prompt kinds, as `kind:role`. `exists` is probed against
// src/engine/prompts/types.ts.

const PROMPTS = {
  target: "chooseTargets:target",
  discard: "chooseCards:discard",
  foresee: "arrange:foresee",
  youMay: "confirm:youMay",
  preventUnlessPays: "payOrDecline:preventUnlessPays",
  chooseOne: "chooseMode:chooseOne",
  chooseX: "chooseNumber:chooseX",
  abandonCost: "chooseCards:abandonCost",
  discardCost: "chooseCards:discardCost",
  banishCost: "chooseCards:banishCost",
  offeringCost: "chooseCards:offeringCost",
  revealCost: "chooseCards:revealCost",
  chooseCost: "chooseMode:chooseCost",
  optionalCost: "confirm:optionalCost",
  playRoute: "chooseMode:playRoute",
  discover: "chooseCards:discover",
  lookAtTop: "arrange:lookAtTop",
  chooseInZone: "chooseCards:chooseInZone",
  chooseAmong: "chooseCards:chooseAmong",
  chooseFromOpponentHand: "chooseCards:chooseFromOpponentHand",
  optionalPayment: "payOrDecline:optionalPayment",
  chooseSubtype: "chooseSubtype:chooseSubtype",
  choosePlayer: "choosePlayer:choosePlayer",
  chooseSlot: "chooseSlot:move",
  payToEnd: "action:payToEnd",
} as const;

type PromptKey = keyof typeof PROMPTS;

/** The part of an entity's text a rule reads. */
type TextPart = "effect" | "cost" | "all";

interface Rule {
  readonly tag: string;
  readonly family: number;
  readonly part?: TextPart;
  readonly re: RegExp;
  readonly needs: readonly string[];
  readonly prompts?: readonly PromptKey[];
}

// ---------------------------------------------------------------------------
// Tag rules. Each rule matches `re` against one part of the text: "effect"
// (effect clauses, the default), "cost" (activated-ability costs and
// additional costs), or "all". `family` is the rule's mechanic family,
// `needs` the primitives it requires, `prompts` the prompt kinds it raises.

const RULES: readonly Rule[] = [
  // Keywords (family 2).
  { tag: "kw-awakened", family: 2, part: "all", re: /(^|\n)Awakened\b/, needs: ["keyword"] },
  { tag: "kw-vengeful", family: 2, part: "all", re: /(^|\n)Vengeful\b/, needs: ["keyword"] },
  { tag: "kw-veil", family: 2, part: "all", re: /(^|\n)Veil\b/, needs: ["keyword"] },
  { tag: "kw-offering", family: 2, part: "all", re: /(^|\n)Offering\b/, needs: ["keyword", "banishFromHandCost"], prompts: ["playRoute", "offeringCost"] },
  { tag: "kw-reclaim", family: 2, part: "all", re: /(^|\n|, )Reclaim\b/, needs: ["reclaim"], prompts: ["playRoute"] },
  { tag: "ephemeral", family: 3, re: /\bwith ephemeral|gain ephemeral/i, needs: ["draw"] },
  { tag: "kw-phasing", family: 6, part: "all", re: /(^|\n)Phasing\b/, needs: ["phase"] },
  { tag: "kw-support", family: 8, part: "all", re: /(^|\n)Support\s*[–-]/, needs: ["sparkModifier", "supported"] },
  { tag: "kw-cannot-be-prevented", family: 11, re: /cannot be prevented/, needs: ["keyword"] },
  { tag: "all-types", family: 15, re: /all character types/, needs: ["giveAllTypes"] },
  { tag: "grant-card-keyword", family: 2, re: /Cards in your hand have|in your deck with [^.]* have awakened/i, needs: ["grantCardKeyword"] },
  { tag: "fast-activated", family: 0, part: "all", re: /(^|\n)❖/, needs: ["speedFast"] },

  // Card flow (family 3).
  { tag: "draw", family: 3, re: /\bdraws? (a card|one card|\d+ cards?|two cards?|X(\+1)? cards?|that many|one of|1 of|2 of|until|an additional card)|\bdraw a card\b|draw one card|\bdraw (cards )?for each|Draw two/i, needs: ["draw"] },
  { tag: "draw-matching", family: 3, re: /\bdraws? (a|an) (warrior|spirit animal|event|character|≤\S+ cost (card|character))\b/i, needs: ["drawMatching"] },
  { tag: "discard", family: 3, re: /(^|[.:,]\s*|then |That player |player )discards? (a card|one card|\d+ cards|two cards|X cards|your hand|their hand)|\bdiscard (a card|one card|\d+ cards|two cards|X cards)\b(?! as an additional)/i, needs: ["discard"], prompts: ["discard"] },
  { tag: "discard-chosen", family: 3, re: /Discard a chosen/, needs: ["discardChosen", "reveal"], prompts: ["chooseFromOpponentHand"] },
  { tag: "opponent-hand-choice", family: 0, part: "all", re: /chosen (card|character|event|≤\S+ cost card) from the opponent's hand|Choose a card in the opponent's hand/i, needs: [], prompts: ["chooseFromOpponentHand"] },
  { tag: "take-from-opponent-hand", family: 3, re: /Put a card from it into your hand/, needs: ["reveal", "takeFromAmong"], prompts: ["chooseFromOpponentHand"] },
  { tag: "foresee", family: 3, re: /\bforesee \d/i, needs: ["foresee"], prompts: ["foresee"] },
  { tag: "erode", family: 3, re: /\berodes? (\d|X)/i, needs: ["erode"] },
  { tag: "take-from-among", family: 3, re: /from among those cards|of those cards into your hand|(one|two) of them into your hand|Draw one of them|draw (1|2) of the cards|one into your hand/i, needs: ["takeFromAmong"], prompts: ["chooseAmong"] },
  { tag: "look-at-top", family: 3, re: /Look at the top/i, needs: ["lookAtTop"], prompts: ["lookAtTop"] },
  { tag: "discover", family: 3, re: /\bDiscover\b/i, needs: ["discover"], prompts: ["discover"] },
  { tag: "reveal", family: 3, re: /\breveal (the opponent's hand|the top card)/i, needs: ["reveal"] },
  { tag: "shuffle-into-deck", family: 3, re: /shuffles? [^.]*into (your|their) deck|shuffle the rest back/i, needs: ["shuffleInto"] },
  { tag: "put-in-deck", family: 3, re: /on (the )?top of (your|their|the opponent's) deck|on the bottom of (your|their) deck|on the bottom\b/i, needs: ["putInDeck"] },
  { tag: "each-player", family: 3, re: /\bEach player\b|each player's/i, needs: ["eachPlayer"] },
  { tag: "choose-player", family: 3, re: /Choose a player|A player erodes|a player's (void|hand)|from a void\b/i, needs: ["choosePlayer"], prompts: ["choosePlayer"] },
  { tag: "create-card", family: 3, re: /create '[^']+' in your hand|Add a random [^.]* to your hand/i, needs: ["createCard"] },
  { tag: "hand-size", family: 3, re: /cards in hand|until you have \d+ cards/i, needs: ["valueHandSize", "conditionCardCounts"] },

  // Energy and points (family 4).
  { tag: "gain-energy", family: 4, re: /\bgains? (\d+|X)●|\bGain 1● for each|gain 2● instead/i, needs: ["gainEnergy"] },
  { tag: "gain-points", family: 4, re: /\bgains? (\d+|X)⍟|Gain ⍟ equal|gain \d+⍟ instead/i, needs: ["gainPoints"] },
  { tag: "max-energy", family: 4, re: /maximum ●/i, needs: ["gainMaxEnergy"] },
  { tag: "double-energy", family: 4, re: /Double your current ●/i, needs: ["doubleEnergy"] },
  { tag: "lose-energy", family: 4, re: /\bLose \d+●/, needs: ["loseEnergy"] },
  { tag: "lose-points", family: 4, re: /loses? (an equivalent quantity of |\d+)⍟/i, needs: ["losePoints"] },
  { tag: "points-cost", family: 4, part: "all", re: /pay \d+⍟|giving the opponent \d+⍟/i, needs: ["pointsCost"] },

  // Removal (family 5).
  { tag: "dissolve", family: 5, re: /\bdissolve (a|an|each|all|any|up to)\b/i, needs: ["dissolve"] },
  { tag: "banish", family: 5, re: /\bBanish (an|a|up to \w+) (≤\S+ (cost )?)?(enemy|character|chosen character)\b(?! from)/i, needs: ["banish"] },
  { tag: "banish-until", family: 5, re: /\bBanish [^.]*until /i, needs: ["banishUntil"] },
  { tag: "banish-cards", family: 5, re: /\bBanish (a card|up to \w+ cards|\d+ cards|X cards|your hand and void|a chosen (card|character)|one)\b[^.:]*(void|hand|deck|banish one)?|and banish one/i, needs: ["banishCards"] },
  { tag: "abandon-effect", family: 5, re: /(^|[.:]\s*|, )(Abandon|abandons) (a|an|them|each|two)\b|Each player abandons/i, needs: ["abandon"] },
  { tag: "bounce-enemy", family: 5, re: /Return (an enemy|a character to its controller's|a character with cost X●|a played)[^.]* to (its controller's |the opponent's )?hand/i, needs: ["returnToHand"] },
  { tag: "remove-to-deck", family: 5, re: /Put an enemy on top/i, needs: ["putInDeck"] },

  // Materialize and recursion (family 6).
  { tag: "materialize-card", family: 6, re: /\bmaterializes? (it|this character|this card|all|each|up to|two random|a random|a ≤|a warrior|a character|X ≤|the last one)\b(?![^.]*figment)|return (this character|this card|it|a random character|all ≤\S+ cost characters)[^.]*to play|discover [^.]*(and|then) materialize it/i, needs: ["materialize"] },
  { tag: "rematerialize", family: 6, re: /\bRematerialize\b/i, needs: ["rematerialize"] },
  { tag: "return-own-to-hand", family: 6, re: /Return (a|all but one|all other|another)? ?characters? (you control )?to (your )?hand|return this character to hand|Return all other characters to hand/i, needs: ["returnToHand"] },
  { tag: "return-from-void", family: 6, re: /from (your|their|each player's) void to (your |their )?hand|return (it|this card|this character) (from your void )?to (your )?hand|Put the banished card into your hand|card from your void to your hand/i, needs: ["returnFromVoid"] },
  { tag: "grant-reclaim", family: 6, re: /gains? reclaim|have reclaim|to gain reclaim/i, needs: ["grantReclaim"] },
  { tag: "play-from-zone", family: 6, re: /you may (immediately )?play [^.]*from (your|the top of your|your hand or) (void|deck)|play (that|this) card from your void|play characters from the top of your deck|play this character from your void/i, needs: ["playFromZone"] },
  { tag: "reclaim-not-banished", family: 6, re: /not banished when they leave play/i, needs: ["reclaimNotBanished"] },
  { tag: "void-zone", family: 6, re: /(this|that) (card|character) is in your void|from your void\.|this character from your void/i, needs: ["functionalZones"] },

  // Figments (family 7).
  { tag: "figments", family: 7, re: /figments?\b(?! copy)/i, needs: ["materializeFigments"] },
  { tag: "figment-copy", family: 7, re: /figment copy/i, needs: ["materializeFigmentCopy"] },
  { tag: "figment-selector", family: 7, re: /non-figment|figments? you control|ember figment is dissolved|no shadow figments|materialize a figment|Abandon (X|\d) (warrior )?figments|you materialized a figment/i, needs: ["selectorFigment"] },

  // Spark, Support, anthems (family 8).
  { tag: "gain-spark", family: 8, re: /gains? (an additional )?\+(\d+|X)✦|gains \+1 spark|Give [^.]*\+(\d+|X)✦|gains \+\d+✦/i, needs: ["gainSpark"] },
  { tag: "spark-static", family: 8, re: /\b(has|have) \+(\d+|X)✦/i, needs: ["sparkModifier"] },
  { tag: "set-spark", family: 8, re: /✦ (of each [^.]* )?becomes|have \d+✦|has 0✦|It has 0✦/i, needs: ["setBaseSpark"] },
  { tag: "awaken", family: 8, re: /\bAwaken (a|each|another)/i, needs: ["awaken"] },
  { tag: "grant-keyword", family: 8, re: /(gains?|have|has|with) (awakened|vengeful)|gain awakened|and vengeful/i, needs: ["grant"] },
  { tag: "additional-spark", family: 8, re: /additional \+?1?✦|an additional \+1✦/i, needs: ["gainAdditionalSpark", "whenGainsSpark"] },
  { tag: "supporting-count", family: 8, re: /supporting it/i, needs: ["supporting"] },

  // Counters (family 9).
  { tag: "store-counters", family: 9, re: /\bStore \d+⧗/i, needs: ["storeCounters"] },
  { tag: "counters-cost", family: 9, part: "cost", re: /\d+⧗/, needs: ["countersCost"] },
  { tag: "stored-counters", family: 9, part: "all", re: /X⧗|stored ⧗/, needs: ["storedCounters"] },

  // Movement (family 10).
  { tag: "move", family: 10, re: /\bMove this character|Reposition this character|to the abandoned character's position/i, needs: ["move"], prompts: ["chooseSlot"] },

  // Prevent and Interrupts (family 11).
  { tag: "prevent", family: 11, re: /\bPrevent\b|Return a played/, needs: ["prevent", "stackItem"], prompts: ["target"] },
  { tag: "prevent-destination", family: 11, re: /Prevent[^.]*\. Put it|then put that card into your hand|Return a played/i, needs: ["preventDestination"] },
  { tag: "prevent-unless-abandons", family: 11, re: /unless the opponent abandons/i, needs: ["preventUnlessAbandons"], prompts: ["abandonCost"] },
  { tag: "play-restriction", family: 11, re: /cannot play events|may only play one card|cannot be played while/i, needs: ["playRestriction"] },

  // Copies (family 12).
  { tag: "copy", family: 12, re: /\bcopy (it|that event)\b|copy it twice|Copy the (second|next) event|copy it an additional|copies? of (it|that event)|ephemeral copy|\bcopy of (the first|it)/i, needs: ["copyCard"] },
  { tag: "copy-times", family: 12, re: /copy it twice|additional time|copy it an additional/i, needs: ["copyCardTimes"] },
  { tag: "copy-in-hand", family: 12, re: /copy of (that event|the first event)[^.]* (in|to) your hand/i, needs: ["createCopyInHand"] },
  { tag: "trigger-copy", family: 12, part: "all", re: /when you copy/i, needs: ["whenCopyTrigger"] },

  // Gain control (family 13).
  { tag: "gain-control", family: 13, re: /Gain control/i, needs: ["gainControl"] },

  // Cost modifiers and nth-in-turn (family 14).
  { tag: "cost-modifier", family: 14, part: "all", re: /costs? (you )?\d+● (less|more)|cost (you )?\d+●\.|costs? (you )?0●|reduce (its|the) cost|cost is reduced|play ❖ and ❖❖ events for 1●|cost characters cost you/i, needs: ["costModifier"] },
  { tag: "cost-modifier-nth", family: 14, part: "all", re: /(first|second|third|next) [^.]*(each turn|in a turn|this turn)[^.]* costs?|(first|second) [^.]* cost/i, needs: ["costModifierNth"] },
  { tag: "self-cost", family: 14, part: "all", re: /This (character|event) costs|this card costs|Reduce the cost of this card|this character costs/i, needs: ["staticZones", "costModifier"] },
  { tag: "card-cost", family: 14, re: /\b(It|They|That event) (costs?|is reduced)|reduce its cost|Its cost is reduced|It costs \d● more/i, needs: ["modifyCardCost"] },
  { tag: "reclaim-cost-modifier", family: 14, part: "all", re: /Reclaim abilities cost/i, needs: ["costModifierReclaim"] },
  { tag: "alternative-cost", family: 14, part: "all", re: /you may play this card (for|from)|play this card for 0●|You may play this card from your hand or void/i, needs: ["alternativeCost"] },
  { tag: "nth-in-turn", family: 14, part: "all", re: /\b(second|third) (card|character|event|spirit animal)[^.]*(in a|each) turn|your (second|third) (card|character|event|spirit animal)|draw your (second|third) card|first time each turn|The first [^.]* each turn|first card you draw|(second|third) card you draw/i, needs: ["triggerNth"] },
  { tag: "turn-history", family: 14, part: "all", re: /for each (card|other card|character|other character) you('ve| have)? (played|controlled|discarded|control that left)|you('ve| have) discarded|discarded this turn|played no|materialized (a figment|2 characters) this turn|left play this turn|dissolved this turn|which (dissolved|were discarded) this turn|you abandoned this turn|played (another|an) event this turn|scored ⍟ last turn|each card you have played this turn|you've played this turn/i, needs: ["turnHistory"] },

  // Subtypes (family 15).
  { tag: "subtype-reference", family: 15, re: /\b(warriors?|spirit animals?|survivors?|outsiders?|wraiths?)\b(?! figment)/i, needs: ["ofSubtype"] },
  { tag: "choose-subtype", family: 15, re: /Choose a character type|pick a character type|chosen type|share a character type/i, needs: ["chooseSubtype"], prompts: ["chooseSubtype"] },

  // Remaining unique mechanics (family 16).
  { tag: "rule-modifier", family: 16, part: "all", re: /during your Draw phase|carries over between turns|are not banished at the end of your turn|pay Offering costs by|You may play ❖ and ❖❖ events for|After you draw your opening hand|If 3 or more ▸Dawn abilities trigger|your hand becomes empty/i, needs: ["ruleModifier"] },
  { tag: "draw-dreamwell", family: 3, re: /additional Dreamwell card/i, needs: ["drawDreamwell"] },
  { tag: "extra-turn", family: 16, re: /extra turn/i, needs: ["takeExtraTurn"] },
  { tag: "win-the-game", family: 16, re: /you win the game/i, needs: ["winCondition", "noCardsIn"] },
  { tag: "lose-abilities", family: 16, re: /loses all abilities/i, needs: ["loseAllAbilities", "untilOpponentPays"], prompts: ["payToEnd"] },
  { tag: "gain-abilities", family: 16, re: /gains (the|those) abilities|This character gains those abilities/i, needs: ["gainAbilities"] },
  { tag: "trigger-ability", family: 16, re: /Trigger (the|its)|trigger its|triggers an additional time|trigger that ability again|ability triggers an additional/i, needs: ["triggerAbility"] },
  { tag: "disable-triggers", family: 16, re: /Disable the triggered abilities/i, needs: ["disableTriggers"] },
  { tag: "cannot-be-targeted", family: 16, re: /cannot be targeted by effects/i, needs: ["grant"] },

  // Neutral: triggers.
  { tag: "trigger-materialized", family: 0, part: "all", re: /▸Materialized/, needs: ["onMaterialized"] },
  { tag: "trigger-dawn", family: 0, part: "all", re: /▸Dawn|, Dawn:|Dawn phase/, needs: ["onDawn"] },
  { tag: "trigger-night", family: 0, part: "all", re: /▸Night/, needs: ["onNight"] },
  { tag: "trigger-challenge", family: 0, part: "all", re: /▸Challenge/, needs: ["onChallenge"] },
  { tag: "trigger-dissolved-self", family: 0, part: "all", re: /▸Dissolved|, Dissolved:/, needs: ["onDissolved"] },
  { tag: "trigger-play", family: 0, part: "all", re: /\b[Ww]hen (you|the opponent|a player) plays? /, needs: ["whenYouPlay"] },
  { tag: "trigger-materialize", family: 0, part: "all", re: /\b[Ww]hen you materialize/, needs: ["whenMaterialize"] },
  { tag: "trigger-abandon", family: 0, part: "all", re: /\b[Ww]hen you abandon/, needs: ["whenAbandon"] },
  { tag: "trigger-discard", family: 0, part: "all", re: /\b[Ww]hen you discard (a|one)/, needs: ["whenDiscard"] },
  { tag: "trigger-draw", family: 0, part: "all", re: /\b[Ww]hen you draw/, needs: ["whenDraw"] },
  { tag: "trigger-leaves-play", family: 0, part: "all", re: /leaves play,|left play/, needs: ["whenLeavesPlay"] },
  { tag: "trigger-scores", family: 0, part: "all", re: /scores? ⍟/, needs: ["whenScores"] },
  { tag: "trigger-leaves-void", family: 0, part: "all", re: /leaves your void/, needs: ["whenLeavesVoid"] },
  { tag: "trigger-challenge-with", family: 0, part: "all", re: /When you challenge with/, needs: ["whenYouChallengeWith"] },
  { tag: "trigger-start-of-turn", family: 0, part: "all", re: /At the start of your (first )?turn|At the start of each battle/, needs: ["atStartOfTurn"] },
  { tag: "trigger-end-of-turn", family: 0, part: "all", re: /At the end of (your|each) turn|abandon them at end of turn|Banish them at end of turn/i, needs: ["atEndOfTurnTrigger"] },
  { tag: "trigger-dissolved-other", family: 0, part: "all", re: /\b(a|an|another) (non-figment )?(character|warrior|survivor|spirit animal|ember figment)[^.,]* (is|are) dissolved|When a character is dissolved/i, needs: ["whenDissolvedTrigger"] },
  { tag: "trigger-discard-self", family: 0, part: "all", re: /When you discard (or erode )?this card/i, needs: ["whenDiscardSelfTrigger"] },
  { tag: "trigger-reclaim", family: 0, part: "all", re: /when you reclaim/i, needs: ["whenReclaimTrigger"] },
  { tag: "trigger-return", family: 0, part: "all", re: /When you return (a|another) character/i, needs: ["whenReturnTrigger"] },
  { tag: "trigger-erode", family: 0, part: "all", re: /When you erode|discard or erode this card|you erode each turn/i, needs: ["whenErodeTrigger"] },
  { tag: "trigger-foresee", family: 0, part: "all", re: /when you foresee/i, needs: ["whenForeseeTrigger"] },
  { tag: "trigger-removes-enemy", family: 0, part: "all", re: /When you dissolve or banish an enemy|dissolves an enemy (in|during) a challenge|scores ⍟ in a challenge/i, needs: ["whenRemovesEnemyTrigger"] },
  { tag: "trigger-put-into-void", family: 0, part: "all", re: /is put into your void/i, needs: ["whenPutIntoVoidTrigger"] },
  { tag: "trigger-play-from-void", family: 0, part: "all", re: /when you play (a card|an event|a character) from your void|you play from your void/i, needs: ["whenPlayFromVoidTrigger"] },
  { tag: "trigger-draw-filter", family: 0, part: "all", re: /when you draw a character|first card you draw [^.]* is a/i, needs: ["drawTriggerFilter"] },
  { tag: "trigger-materialize-nth", family: 0, part: "all", re: /materialize your second|not the first spirit animal|first character you materialize each turn/i, needs: ["materializeNthTrigger"] },
  { tag: "first-time-each-turn", family: 0, part: "all", re: /The first time each turn/i, needs: ["firstTimeEachTurn"] },
  { tag: "once-per-turn", family: 0, part: "all", re: /Once per turn/i, needs: ["oncePerTurn"] },
  { tag: "floating-trigger", family: 0, part: "all", re: /Until end of turn, when|The next time you play/i, needs: ["floating"] },

  // Neutral: costs.
  { tag: "cost-exhaust", family: 0, part: "cost", re: /☾/, needs: ["exhaustSelf"] },
  { tag: "cost-energy", family: 0, part: "cost", re: /\d+●/, needs: ["energy"] },
  { tag: "cost-energy-x", family: 0, part: "all", re: /(^|\n|, )X●[,:]|X●: |X● cost|cost X●|Choose a value of X|with cost X\b/, needs: ["energyX"], prompts: ["chooseX"] },
  { tag: "cost-abandon", family: 0, part: "cost", re: /\bAbandon (a|an|another|two|\d|a non-figment|X)/i, needs: ["abandonCost"], prompts: ["abandonCost"] },
  { tag: "cost-abandon-self", family: 0, part: "cost", re: /\b[Aa]bandon this character/, needs: ["abandonCost"] },
  { tag: "cost-discard", family: 0, part: "cost", re: /\bDiscard (a|an|\d|X|two|your hand)/i, needs: ["discardCost"], prompts: ["discardCost"] },
  { tag: "cost-discard-filter", family: 0, part: "cost", re: /\bDiscard (a character|an event|a ≤|X cards|your hand)/i, needs: ["discardCostFilter"] },
  { tag: "cost-banish-void", family: 0, part: "cost", re: /\bBanish (\d+|a|X) (cards?|character) from (your|the opponent's|a) void|banish \d+ cards from your void|banish X cards/i, needs: ["banishFromVoidCost"], prompts: ["banishCost"] },
  { tag: "cost-banish-any-void", family: 0, part: "cost", re: /from (the opponent's|a) void/i, needs: ["banishFromAnyVoidCost"] },
  { tag: "cost-banish-x", family: 0, part: "cost", re: /banish X cards/i, needs: ["banishXCost"], prompts: ["chooseX"] },
  { tag: "cost-banish-hand", family: 0, part: "cost", re: /banish a card from hand/i, needs: ["banishFromHandCost"], prompts: ["offeringCost"] },
  { tag: "cost-reveal", family: 0, part: "cost", re: /reveal this card/i, needs: ["revealCost"] },
  { tag: "cost-return", family: 0, part: "cost", re: /Return a character you control to hand/i, needs: ["returnCost"], prompts: ["target"] },
  { tag: "cost-choice", family: 0, part: "cost", re: /\b(abandon|discard)[^,.]* or (discard|pay)/i, needs: ["choiceCost"], prompts: ["chooseCost"] },
  { tag: "cost-optional", family: 0, part: "all", re: /as an additional cost|You may pay an additional/i, needs: ["optionalCost", "conditionCostPaid"], prompts: ["optionalCost"] },
  { tag: "additional-cost", family: 0, part: "all", re: /To play this (card|event|character)|as an additional cost/i, needs: ["additionalCost"] },
  { tag: "play-condition", family: 14, part: "all", re: /Play this event only if/i, needs: ["playCondition"] },

  // Neutral: selectors, values, conditions.
  { tag: "selector-bounds", family: 0, part: "all", re: /≤X|with X✦|with cost X●|cost X●|≥\d|with cost (less|greater)|less than or equal|lower cost|lesser cost|higher cost|greater than that card's cost|(?<![≤≥\d])[0-9]● cost (character|event|card)|cost 1● higher|with ✦ less|with 1✦|≤1✦ character|a 1✦ character|with the highest ✦/i, needs: ["selectorBounds"] },
  { tag: "selector-has-ability", family: 0, part: "all", re: /(Characters|Characters you control) with ▸\w+ abilities/i, needs: ["selectorHasAbility"] },
  { tag: "stack-selector-bounds", family: 0, re: /Prevent a played ≤|Return a played ≤/i, needs: ["stackSelectorBounds"] },
  { tag: "selector-challenger", family: 0, part: "all", re: /challengers?\b|challenging character/i, needs: ["selectorChallenger"] },
  { tag: "card-filter-bounds", family: 0, part: "all", re: /(play|materialize) (a|an|your)? ?(non-figment )?(≤\S+|\d●) cost|play a \d● cost|next time you play a ≤|with cost X●, draw|with \d✦, materialize|≤1✦ character, materialize/i, needs: ["cardFilterBounds"] },
  { tag: "zone-cards", family: 0, re: /(in|from|into) (your|the opponent's|their|a player's|each player's|a) (void|deck)\b|from your hand|the top card of your deck/i, needs: ["zoneCardRefs"], prompts: ["chooseInZone"] },
  { tag: "random", family: 0, part: "all", re: /\brandom\b/i, needs: ["randomSelection"] },
  { tag: "value-zone-count", family: 0, part: "all", re: /for each (character|event|≤2● cost character|card) in your void|number of cards in your void|or more (events|cards|≤2● cost characters) in your void|≥8 cards in your void|7 or more cards in your void|3 or more cards in your void/i, needs: ["valueZoneCounts"] },
  { tag: "value-card-stat", family: 0, part: "all", re: /this character's ✦|abandoned character's ✦|that character's (cost|✦)|that card's cost|for each ✦ this character has|equal to this character's ✦|equivalent quantity/i, needs: ["valueCardStats"] },
  { tag: "condition-card-count", family: 0, part: "all", re: /If there are \d+ or more|if there are three or more|if you have (one or fewer|fewer than)|or more cards in your void|or more events in your void|If the top card of your deck/i, needs: ["conditionCardCounts"] },
  { tag: "condition-controls", family: 0, part: "all", re: /If you control|while you control|unless you control|If you have only one challenger|you control no/i, needs: ["conditionControls"] },
  { tag: "history-reference", family: 0, part: "all", re: /last (warrior|one|event)|first event you played last turn|which you abandoned this turn/i, needs: ["historyRefs"] },
  { tag: "static-zone", family: 0, part: "all", re: /in your deck with|If this card is in your void, characters|Characters in your deck|Survivors in your void have|Characters in your void with|Cards in your hand have|in your hand with ephemeral/i, needs: ["staticZones"] },
  { tag: "count-value", family: 0, part: "all", re: /for each (warrior|spirit animal|character|figment|≤2● cost character|other character)[^.]* you control|for each \d survivors you control|the number of characters you control/i, needs: ["count"] },
  { tag: "you-may", family: 0, part: "all", re: /\byou may\b(?! (play|pay))/i, needs: ["optional"], prompts: ["youMay"] },
  { tag: "you-may-pay", family: 0, part: "all", re: /you may pay \d+●/i, needs: ["optional"], prompts: ["optionalPayment"] },
  { tag: "choose-one", family: 0, part: "all", re: /Choose one:/i, needs: ["chooseOne"], prompts: ["chooseOne"] },
  { tag: "unless-pays", family: 0, part: "all", re: /unless the opponent pays/i, needs: [], prompts: ["preventUnlessPays"] },
  { tag: "duration", family: 0, part: "all", re: /until end of turn|this turn\b|until your next turn/i, needs: ["untilEndOfTurn"] },
  { tag: "targeted", family: 0, re: /\b(Dissolve|Banish|Return|Give|Gain control of|Put|Awaken|Rematerialize|Materialize a figment copy of) (a|an|another|up to \w+|this)\b ?[^.]*?(enemy|character)(?! from)/, needs: [], prompts: ["target"] },
];

// Journey-effect rules for dreamsign text (5.6). A dreamsign paragraph that
// matches one of these is a journey effect; other paragraphs act in battle.
const JOURNEY_RULES: readonly Rule[] = [
  { tag: "journey-essence", family: 0, re: /essence/i, needs: ["journeyEssence"] },
  { tag: "journey-shop", family: 0, re: /shop|dream bazaar|purchase|Restock/i, needs: ["journeyShop"] },
  { tag: "journey-draft", family: 0, re: /drafting|draft site|choices show/i, needs: ["journeyDraft"] },
  { tag: "journey-purge", family: 0, re: /\bpurge/i, needs: ["journeyPurge"] },
  { tag: "journey-duplication", family: 0, re: /duplicat/i, needs: ["journeyDuplication"] },
  { tag: "journey-transfiguration", family: 0, re: /transfigur/i, needs: ["journeyTransfiguration"] },
  { tag: "journey-sites", family: 0, re: /\bsites?\b|dreamscape/i, needs: ["journeySites"] },
  { tag: "journey-on-gain", family: 0, re: /When you gain this dreamsign|pick 1 of 3 dreamsigns/i, needs: ["journeyOnGain"] },
  { tag: "journey-deck-entry", family: 0, re: /add (a )?\w+ card to your deck|cards you add to it|cards in your deck that mention|Character cards in your deck are|Nightmare cards|cannot be purged|add 5 Nightmare|to your deck,/i, needs: ["journeyDeckEntry"] },
  { tag: "journey-battle-init", family: 0, re: /always in your opening hand/i, needs: ["journeyBattleInit"] },
];

// ---------------------------------------------------------------------------
// Manual corrections, keyed by entity UUID: tags to add or remove, a forced
// family, and why. Applied after the regex rules.

/** What a tag contributes, whether a rule or a correction defines it. */
interface TagInfo {
  readonly family: number;
  readonly needs: readonly string[];
  readonly prompts?: readonly PromptKey[];
}

interface Correction {
  readonly add?: readonly string[];
  readonly remove?: readonly string[];
  readonly family?: number;
  readonly note?: string;
}

const CORRECTIONS: Readonly<Record<string, Correction>> = {
  // Card flow, energy, and removal readings the rules miss or over-read.
  "25d00336-5ad7-433b-8ced-71720a9f074a": { add: ["banish-self"], note: "\"Banish this card\" moves the resolving event to banishment" },
  "50fe6c54-4bf2-4177-a2f7-4c00a4a4c188": { add: ["discard"], note: "\"That player discard X cards\" (sic) is a discard; log the typo" },
  "28c3ef90-c0dc-4b85-92c8-40758b99e0ce": { add: ["reveal"], note: "reveals the top card of the deck while the condition holds" },
  "eae700c9-5005-4627-b8d6-a5c2c273e61a": { add: ["reveal"], note: "\"Look at the opponent's hand\"" },
  "a911ef71-799c-4240-ad13-8fabd3caeafa": { family: 16, note: "C8 extra turn" },
  "6e2188f8-580e-4a66-a3e3-267d509de903": { family: 16, remove: ["zone-cards"], note: "C15 win condition; all its primitives exist" },
  "ccff822e-e2ae-4d38-9720-6df289dbe4cd": { family: 7, note: "C5 figment copy" },
  "69964b8e-0f38-4fb7-a0cd-89430ef04c2d": { note: "C1: Contemplation, added by 5.1 as Special data; created by card 09e17f29-8ee1-477f-8175-ff37eb1f254a, and never drafted, sold, rewarded, or dealt to an opponent" },
  "7f550d4e-c6a1-4e5e-ae0c-1b3edd6f0f4a": { remove: ["return-from-void"], note: "returns itself from play to hand" },
  "d1b7d5c6-cde9-48c6-80ba-642ddc9f35ad": { remove: ["put-in-deck"], note: "prevent with the deckTop destination" },
  // Dreamsigns.
  "3d86f8ce-42ac-43dc-96d5-121e6d1a6167": { add: ["type-remap"], remove: ["choose-subtype", "subtype-reference"], note: "C12: a journey-level remap stored with the run (5.6), applied to battle selectors and figment types through the deck-entry variant" },
  "427c71e3-178f-4352-8d6f-f0789cb13c2d": { note: "journey essence paid from a battle event (removing an enemy outside a challenge); 5.6 builds the battle-result hook" },
  "eb55b141-82f8-4ba4-b319-420f762e9ee4": { note: "journey essence paid from a battle event (dissolving an enemy in a challenge); 5.6 builds the battle-result hook" },
  "8e2d26a8-ff39-48a4-a30e-434479c4675f": { remove: ["choose-subtype"], note: "a journey one-shot that changes each deck entry's subtype (D39 typeChange)" },
};

// Engine gaps noted by Phase 3 beads, each with the primitive that closes it.
const GAPS: readonly { readonly gap: string; readonly source: string; readonly primitive: string }[] = [
  { gap: "C12 type remap for figments", source: "hv-7x4l.8 (3.8)", primitive: "typeRemap" },
  { gap: "\"the last warrior you played\" reference", source: "hv-7x4l.8 (3.8)", primitive: "historyRefs" },
  { gap: "\"when you copy\" triggers", source: "hv-7x4l.8 (3.8)", primitive: "whenCopyTrigger" },
  { gap: "granting costed Reclaim", source: "hv-7x4l.8 (3.8)", primitive: "grantReclaim" },
  { gap: "\"cards you reclaim are not banished\"", source: "hv-7x4l.8 (3.8)", primitive: "reclaimNotBanished" },
  { gap: "materialize from the void", source: "hv-7x4l.8 (3.8)", primitive: "materialize" },
  { gap: "statics that work from other zones (C4 \"in your deck\")", source: "3.7", primitive: "staticZones" },
  { gap: "cost modifiers on activated abilities", source: "3.7", primitive: "costModifierActivated" },
  { gap: "whenYouPlay cost-bound filter (d24ea640)", source: "3.6", primitive: "cardFilterBounds" },
];

// Family overrides by tag, for tags that mark a whole card as unique.
const UNIQUE_TAGS: ReadonlySet<string> = new Set(["extra-turn", "win-the-game", "lose-abilities", "gain-abilities", "trigger-ability", "disable-triggers", "cannot-be-targeted", "play-restriction"]);

// The keyword tags of family 2.
const KEYWORD_TAGS: ReadonlySet<string> = new Set(["kw-awakened", "kw-vengeful", "kw-veil", "kw-offering", "kw-reclaim", "ephemeral"]);

// Extra tags a correction may add that no rule defines.
const EXTRA_TAGS: Readonly<Record<string, TagInfo>> = {
  "banish-self": { family: 5, needs: ["banishCards"] },
  "type-remap": { family: 0, needs: ["typeRemap", "journeyDeckEntry", "journeyOnGain"] },
};

// D39 exploration effects: each changes a deck entry or the next battle.
const DECK_ENTRY_EFFECTS: Readonly<Record<string, string>> = {
  "increase-spark-all": "Variant.deckMods.sparkBonus",
  "purge-random-subtype-and-increase-spark": "Variant.deckMods.sparkBonus",
  "reduce-cost-all-and-gain-nightmares": "Variant.deckMods.costReduction",
  "make-fast-all": "Variant.deckMods.fast",
  "make-predicate-fast-and-gain-nightmares": "Variant.deckMods.fast",
  "purge-duplicates-and-grant-reclaim": "Variant.deckMods.reclaim",
  "change-subtype-selected": "Variant.deckMods.typeChange",
  "change-subtype-all": "Variant.deckMods.typeChange",
  "change-card-type-selected": "Variant.deckMods.typeChange",
  "next-battle-opening-hand": "BattleInit.openingHand",
  "next-battle-starting-energy": "BattleInit.startingEnergy",
  "next-battle-smaller-hand-and-cost-discount": "BattleInit.smallerHandCostDiscount",
};

// The transfiguration transforms of engine-design § Transfigurations (5.7a).
const TRANSFIGURATION_NEEDS: Readonly<Record<string, readonly string[]>> = {
  Empowered: ["costModifier"],
  Amplified: [],
  Kindled: ["setBaseSpark"],
  Resonant: ["onMaterialized", "onDawn", "onDissolved", "oncePerTurn"],
  Inspired: ["draw"],
  Enduring: ["reclaim"],
  Hastened: ["speedFast"],
  Attuned: ["costModifierActivated"],
  Perfected: ["costModifier", "setBaseSpark", "draw", "reclaim", "speedFast", "costModifierActivated"],
};

// ---------------------------------------------------------------------------
// Text parsing.

type TextParts = Readonly<Record<TextPart | "condition", string>>;

/** Splits rules text into cost clauses, trigger conditions, and effect clauses. */
function splitClauses(text: string): TextParts {
  const cost: string[] = [];
  const effect: string[] = [];
  const condition: string[] = [];
  for (const raw of text.split(/\n+/u)) {
    const paragraph = raw.trim();
    if (paragraph === "") continue;
    const additional = /^(To play this (?:card|event|character), )([^.]*)\.\s*(.*)$/su.exec(paragraph);
    if (additional) {
      cost.push(additional[2] ?? "");
      if (additional[3]) effect.push(additional[3]);
      continue;
    }
    const reclaimCost = /^Reclaim\s*[–-]\s*(.*)$/su.exec(paragraph);
    if (reclaimCost) {
      cost.push(reclaimCost[1] ?? "");
      continue;
    }
    const activated = /^(?:❖+\s*[–-]\s*)?([^:▸]+?):\s+(.*)$/su.exec(paragraph);
    if (activated && !/\b(When|If|Once per turn|Until|Choose one|Support|At the|While|After|Before)\b/u.test(activated[1] ?? "")) {
      cost.push(activated[1] ?? "");
      effect.push(activated[2] ?? "");
      continue;
    }
    // "When …, effect": the trigger condition is not an effect clause.
    const trigger = /^((?:Once per turn, |Until end of turn, )?(?:[Ww]hen|At the|The first time)\b[^,]*),\s+(.*)$/su.exec(paragraph);
    if (trigger) {
      condition.push(trigger[1] ?? "");
      effect.push(trigger[2] ?? "");
      continue;
    }
    effect.push(paragraph);
  }
  return { cost: cost.join("\n"), effect: effect.join("\n"), condition: condition.join("\n"), all: text };
}

function applyRules(text: string, rules: readonly Rule[]): Rule[] {
  const parts = splitClauses(text);
  return rules.filter((rule) => rule.re.test(parts[rule.part ?? "effect"]));
}

// ---------------------------------------------------------------------------
// Probes against the engine.

const primitiveIndex = read(`${P}index.ts`);
const dslSource = readdirSync(join(ROOT, "src/engine/dsl"))
  .filter((file) => file.endsWith(".ts") && !file.endsWith(".test.ts"))
  .map((file) => read(`src/engine/dsl/${file}`))
  .join("\n");
const promptTypes = read("src/engine/prompts/types.ts");

function primitiveExists(entry: PrimitiveEntry): boolean {
  const module = entry.module ?? "";
  switch (entry.kind) {
    case "primitive": {
      const base = module.slice(P.length).replace(/\.ts$/u, "");
      if (!primitiveIndex.includes(`"./${base}"`)) return false;
      return entry.symbol === undefined || new RegExp(`export function ${entry.symbol}\\b`, "u").test(read(module));
    }
    case "builder":
      return new RegExp(`export (function|const) ${entry.name}\\b`, "u").test(dslSource);
    case "dsl":
    case "extension":
      return existsSync(join(ROOT, module)) && (entry.probe?.test(read(module)) ?? false);
    case "journey":
      return false;
  }
}

function promptExists(spec: string): boolean {
  const [kind = "", role = ""] = spec.split(":");
  if (kind === "action") return /payToEnd/u.test(read("src/engine/steps/types.ts")) || /payToEnd/u.test(dslSource);
  return new RegExp(`kind: "${kind}"`, "u").test(promptTypes) && new RegExp(`\\| "${role}"`, "u").test(promptTypes);
}

interface ProbedPrimitive extends PrimitiveEntry {
  readonly exists: boolean;
}

const PRIMITIVE_BY_NAME = new Map<string, ProbedPrimitive>();
for (const entry of PRIMITIVES) {
  if (PRIMITIVE_BY_NAME.has(entry.name)) throw new Error(`duplicate primitive ${entry.name}`);
  PRIMITIVE_BY_NAME.set(entry.name, { ...entry, exists: primitiveExists(entry) });
}

function primitive(name: string): ProbedPrimitive {
  const entry = PRIMITIVE_BY_NAME.get(name);
  if (entry === undefined) throw new Error(`unknown primitive ${name}`);
  return entry;
}

const PROMPT_EXISTS = new Map<string, boolean>(Object.values(PROMPTS).map((spec) => [spec, promptExists(spec)]));

const TAGS = new Map<string, TagInfo>([...RULES, ...JOURNEY_RULES].map((rule) => [rule.tag, rule]));
for (const [tag, info] of Object.entries(EXTRA_TAGS)) TAGS.set(tag, info);
for (const info of TAGS.values()) for (const need of info.needs) primitive(need);
for (const needs of Object.values(TRANSFIGURATION_NEEDS)) for (const need of needs) primitive(need);
for (const entry of GAPS) primitive(entry.primitive);
for (const tag of [...UNIQUE_TAGS, ...KEYWORD_TAGS]) if (!TAGS.has(tag)) throw new Error(`unknown tag ${tag}`);

// ---------------------------------------------------------------------------
// Rules decisions and card text clarifications that name an entity.

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gu;

function clarificationsByUuid(): Map<string, string[]> {
  const result = new Map<string, string[]>();
  for (const section of read("docs/plan/decisions.md").split(/^### /mu)) {
    const id = /^(C\d+)\./u.exec(section)?.[1];
    if (id === undefined) continue;
    for (const uuid of new Set(section.match(UUID_RE) ?? [])) result.set(uuid, [...(result.get(uuid) ?? []), id]);
  }
  return result;
}

function evidenceByUuid(directory: string): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const path = join(ROOT, directory);
  if (!existsSync(path)) return result;
  for (const file of readdirSync(path).sort(compare)) {
    const id = file.replace(/\.md$/u, "");
    for (const uuid of new Set(readFileSync(join(path, file), "utf8").match(UUID_RE) ?? [])) {
      result.set(uuid, [...(result.get(uuid) ?? []), id]);
    }
  }
  return result;
}

function modulePaths(directory: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const file of readdirSync(join(ROOT, directory)).sort(compare)) {
    if (!file.endsWith(".ts") || file === "index.ts") continue;
    const id = /\bid: "([0-9a-f-]{36})"/u.exec(read(`${directory}/${file}`))?.[1];
    if (id !== undefined) result.set(id, `${directory}/${file}`);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Entity records.

type EntityKind = "card" | "dreamwell" | "figment" | "avatar" | "dreamsign" | "transfiguration" | "explorationEffect" | "apollyonIncarnation";

const KIND_ORDER: readonly EntityKind[] = ["card", "dreamwell", "figment", "avatar", "dreamsign", "transfiguration", "explorationEffect", "apollyonIncarnation"];

/** The catalog fields of an entity record, before tagging. */
interface EntityBase {
  readonly id: string;
  readonly kind: EntityKind;
  readonly name: string;
  readonly module?: string;
  readonly status?: "pending" | "vanilla" | "authored";
  readonly cardType?: string;
  readonly rarity?: string;
  readonly cost?: number | null;
  readonly costs?: readonly string[];
  readonly speed?: "standard" | "fast" | "interrupt";
  readonly subtype?: string;
  readonly spark?: number | null;
  readonly tier?: number;
  readonly energyAdded?: number;
  readonly text?: string;
  readonly amplifiedText?: string;
  readonly encounterCard?: string;
  readonly effectKind?: string;
  readonly engineField?: string;
  readonly deckArchetype?: string;
  readonly clarifications?: readonly string[];
  readonly rulesDecisions?: readonly string[];
  readonly cardIssues?: readonly string[];
}

interface EntityRecord extends EntityBase {
  readonly tags: readonly string[];
  readonly requiredPrimitives: { readonly existing: readonly string[]; readonly new: readonly string[] };
  readonly promptKinds: readonly string[];
  family: number;
  routing: string[];
  readonly correction?: string;
}

function statusOf(entity: ContentStatus): "pending" | "vanilla" | "authored" {
  if (entity.pending === true) return "pending";
  if (entity.vanilla === true) return "vanilla";
  return "authored";
}

function splitNeeds(needs: Iterable<string>): EntityRecord["requiredPrimitives"] {
  const sorted = [...new Set(needs)].sort(compare);
  return { existing: sorted.filter((name) => primitive(name).exists), new: sorted.filter((name) => !primitive(name).exists) };
}

function finishRecord(base: EntityBase, tagged: readonly string[], correction: Correction | undefined, routing: string[]): EntityRecord {
  const tags = new Set(tagged);
  for (const tag of correction?.remove ?? []) tags.delete(tag);
  for (const tag of correction?.add ?? []) tags.add(tag);
  const needs: string[] = [];
  const prompts = new Set<string>();
  let family = 0;
  for (const tag of tags) {
    const info = TAGS.get(tag);
    if (info === undefined) throw new Error(`${base.id}: unknown tag ${tag}`);
    needs.push(...info.needs);
    for (const prompt of info.prompts ?? []) prompts.add(PROMPTS[prompt]);
    family = Math.max(family, info.family);
    if (UNIQUE_TAGS.has(tag)) family = 16;
  }
  return {
    ...base,
    tags: [...tags].sort(compare),
    requiredPrimitives: splitNeeds(needs),
    promptKinds: [...prompts].sort(compare),
    family: correction?.family ?? family,
    routing,
    ...(correction?.note === undefined ? {} : { correction: correction.note }),
  };
}

const tagsOf = (text: string, rules: readonly Rule[] = RULES): string[] => applyRules(text, rules).map((rule) => rule.tag);
const joined = (text: string, amplifiedText: string | undefined): string => (amplifiedText === undefined ? text : `${text}\n${amplifiedText}`);

function buildEntities(): EntityRecord[] {
  const clarifications = clarificationsByUuid();
  const rulesDecisions = evidenceByUuid("docs/plan/evidence/rules-decisions");
  const cardIssues = evidenceByUuid("docs/plan/evidence/card-issues");
  const modules = new Map([
    ...modulePaths("src/content/cards"),
    ...modulePaths("src/content/dreamsigns"),
    ...modulePaths("src/content/avatars"),
    ...modulePaths("src/content/dreamwell"),
    ...modulePaths("src/content/figments"),
  ]);
  const known = (id: string): Pick<EntityBase, "module" | "clarifications" | "rulesDecisions" | "cardIssues"> => ({
    ...(modules.has(id) ? { module: modules.get(id) } : {}),
    ...(clarifications.has(id) ? { clarifications: clarifications.get(id) } : {}),
    ...(rulesDecisions.has(id) ? { rulesDecisions: rulesDecisions.get(id) } : {}),
    ...(cardIssues.has(id) ? { cardIssues: cardIssues.get(id) } : {}),
  });

  const records: EntityRecord[] = [];
  for (const card of CARDS) {
    const base: EntityBase = {
      id: card.id,
      kind: "card",
      name: card.name,
      status: statusOf(card),
      cardType: card.cardType,
      rarity: card.rarity,
      cost: card.energyCost,
      ...(card.energyCosts === undefined ? {} : { costs: card.energyCosts }),
      speed: card.isInterrupt ? "interrupt" : card.isFast ? "fast" : "standard",
      subtype: card.subtype,
      spark: card.spark,
      text: card.renderedText,
      ...(card.amplifiedText === undefined ? {} : { amplifiedText: card.amplifiedText }),
      ...known(card.id),
    };
    const correction = CORRECTIONS[card.id];
    const record = finishRecord(base, tagsOf(joined(card.renderedText, card.amplifiedText)), correction, ["5.2"]);
    // Keyword bodies: a keyword card whose other clauses need no new
    // primitive and nothing past energy and points.
    const keywordBody = record.tags.some((tag) => KEYWORD_TAGS.has(tag)) && record.family <= 4 && record.requiredPrimitives.new.length === 0;
    if (["Starter", "Tutorial", "Special"].includes(card.rarity)) record.family = 1;
    else if (record.family === 0 || (keywordBody && correction?.family === undefined)) record.family = 2;
    records.push(record);
  }
  for (const sign of DREAMSIGNS) {
    const paragraphs = sign.effectDescription.split(/\n+/u).filter((paragraph) => paragraph.trim() !== "");
    const isJourney = (paragraph: string): boolean => JOURNEY_RULES.some((rule) => rule.re.test(paragraph));
    const battleText = paragraphs.filter((paragraph) => !isJourney(paragraph)).join("\n");
    const journeyText = paragraphs.filter(isJourney).join("\n");
    const tags = [...(battleText === "" ? [] : tagsOf(battleText)), ...(journeyText === "" ? [] : tagsOf(journeyText, JOURNEY_RULES.map((rule) => ({ ...rule, part: "all" }))))];
    const base: EntityBase = { id: sign.id, kind: "dreamsign", name: sign.name, status: statusOf(sign), rarity: sign.rarity, text: sign.effectDescription, ...known(sign.id) };
    const record = finishRecord(base, tags, CORRECTIONS[sign.id], []);
    if (battleText !== "") record.routing.push("5.5");
    if (record.tags.some((tag) => tag.startsWith("journey-") || tag === "type-remap")) record.routing.push("5.6");
    if (record.routing.length === 0) record.routing.push("complete");
    records.push(record);
  }
  for (const avatar of AVATARS) {
    const base: EntityBase = { id: avatar.id, kind: "avatar", name: avatar.name, status: statusOf(avatar), text: avatar.renderedText, ...known(avatar.id) };
    records.push(finishRecord(base, tagsOf(avatar.renderedText), CORRECTIONS[avatar.id], ["5.4"]));
  }
  for (const card of DREAMWELL_CARDS) {
    const base: EntityBase = {
      id: card.id,
      kind: "dreamwell",
      name: card.name,
      status: statusOf(card),
      tier: card.order,
      energyAdded: card.energyAdded,
      text: card.renderedText,
      ...known(card.id),
    };
    records.push(finishRecord(base, tagsOf(card.renderedText), CORRECTIONS[card.id], ["5.3"]));
  }
  for (const figment of FIGMENTS) {
    const base: EntityBase = {
      id: figment.id,
      kind: "figment",
      name: figment.name,
      status: statusOf(figment),
      cost: 0,
      subtype: figment.subtype,
      spark: figment.spark,
      text: figment.renderedText,
      ...known(figment.id),
    };
    records.push(finishRecord(base, tagsOf(figment.renderedText), CORRECTIONS[figment.id], [figment.pending === true ? "5.2" : "complete"]));
  }
  for (const form of TRANSFIGURATION.forms) {
    records.push({
      id: form.glossaryUuid,
      kind: "transfiguration",
      name: form.name,
      text: form.description,
      tags: ["transfiguration"],
      requiredPrimitives: splitNeeds(TRANSFIGURATION_NEEDS[form.id] ?? []),
      promptKinds: [],
      family: 0,
      routing: ["5.7a"],
    });
  }
  for (const encounter of EXPLORATION.encounters) {
    for (const action of encounter.action) {
      const field = DECK_ENTRY_EFFECTS[action.effectKind];
      if (field === undefined) continue;
      records.push({
        id: action.id,
        kind: "explorationEffect",
        name: action.label,
        encounterCard: encounter.cardId,
        effectKind: action.effectKind,
        engineField: field,
        tags: ["deck-entry-modification"],
        requiredPrimitives: { existing: [], new: [] },
        promptKinds: [],
        family: 0,
        routing: ["5.7b"],
      });
    }
  }
  for (const incarnation of APOLLYON_INCARNATIONS) {
    records.push({
      id: incarnation.id,
      kind: "apollyonIncarnation",
      name: incarnation.title,
      text: incarnation.description,
      deckArchetype: incarnation.deckType,
      tags: ["apollyon"],
      requiredPrimitives: { existing: [], new: [] },
      promptKinds: [],
      family: 0,
      routing: ["5.8"],
    });
  }
  return records;
}

// ---------------------------------------------------------------------------
// Bead planning (phase-5-content.md § Bead sizing).

/**
 * An entity's rough authoring cost: one unit, plus its printed text length,
 * its amplified text, and the tags past the third.
 */
function weight(record: EntityRecord): number {
  return 1 + (record.text?.length ?? 0) / WEIGHT_TEXT_UNIT + (record.amplifiedText === undefined ? 0 : WEIGHT_AMPLIFIED) + WEIGHT_TAG * Math.max(0, record.tags.length - 3);
}

// The engine files that read each DSL type, which a DSL addition also edits.
const DSL_READERS: Readonly<Record<string, readonly string[]>> = {
  CharacterSelector: ["src/engine/dsl/builders.ts", "src/engine/dsl/selectors.ts"],
  CardFilter: ["src/engine/dsl/builders.ts", "src/engine/dsl/selectors.ts"],
  StackItemSelector: ["src/engine/dsl/builders.ts", "src/engine/dsl/selectors.ts"],
  CardRef: ["src/engine/dsl/builders.ts", "src/engine/effects/interpreter.ts"],
  ValueExpr: ["src/engine/dsl/builders.ts", "src/engine/dsl/values.ts"],
  Condition: ["src/engine/dsl/builders.ts", "src/engine/effects/interpreter.ts"],
  Trigger: ["src/engine/dsl/triggers.ts", "src/engine/triggers/matcher.ts"],
  TriggeredAbility: ["src/engine/dsl/triggers.ts", "src/engine/triggers/matcher.ts"],
  PaymentCost: ["src/engine/dsl/builders.ts", "src/engine/rules/costs.ts"],
  Ability: ["src/engine/dsl/builders.ts", "src/engine/rules/timing.ts"],
  StaticAbility: ["src/engine/dsl/builders.ts", "src/engine/continuous/layers.ts"],
  Variant: [],
};

function areaFiles(names: readonly string[]): { modules: string[]; groups: string[]; fallout: string[] } {
  const modules = new Set<string>();
  const groups = new Set<string>();
  const fallout = new Set<string>();
  for (const name of names) {
    const entry = primitive(name);
    if (entry.module !== undefined && entry.kind !== "journey") modules.add(entry.module);
    if (entry.group !== undefined) groups.add(entry.group);
    for (const symbol of entry.fallout ?? []) {
      fallout.add(symbol);
      for (const file of DSL_READERS[symbol] ?? []) modules.add(file);
    }
  }
  return { modules: [...modules].sort(compare), groups: [...groups].sort(compare), fallout: [...fallout].sort(compare) };
}

interface IntroducedPrimitive {
  readonly name: string;
  readonly kind: PrimitiveKind;
  readonly module: string | null;
}

const introduction = (name: string): IntroducedPrimitive => ({ name, kind: primitive(name).kind, module: primitive(name).module ?? null });

const kebab = (name: string): string => name.replace(/([a-z0-9])([A-Z])/gu, "$1-$2").toLowerCase();

/**
 * - "primitive": introduces one new primitive or DSL form, with tests on
 *   synthetic cards, plus the few entities that first need only it;
 * - "composition": entities whose primitives all exist by the time it runs;
 * - "task": a fixed Phase 5 task, split where its page section allows.
 */
type BeadKind = "primitive" | "composition" | "task";

interface Bead {
  readonly key: string;
  readonly order: number;
  readonly section: string;
  readonly kind: BeadKind;
  readonly title: string;
  readonly entities: readonly { readonly id: string; readonly kind: EntityKind; readonly status: string }[];
  readonly weight: number;
  readonly introduces: readonly IntroducedPrimitive[];
  readonly newPromptKinds: readonly string[];
  readonly dependsOn: readonly string[];
  serializedAfter: { readonly bead: string; readonly code: string }[];
  readonly externalDependsOn: readonly string[];
  readonly pilot: boolean;
  readonly coreReview: boolean;
  readonly scenarios: string;
  readonly areas: readonly string[];
  readonly sharedAreas: readonly string[];
  readonly falloutHints: readonly string[];
  readonly knownDecisions: readonly object[];
}

/** One planned content section: the entities it covers and the primitives each needs there. */
interface Section {
  readonly section: string;
  readonly slug: string;
  readonly name: string;
  readonly members: readonly EntityRecord[];
  readonly needsOf: (record: EntityRecord) => readonly string[];
  readonly pilot?: boolean;
  readonly extraDependsOn?: readonly string[];
  readonly externalDependsOn?: readonly string[];
}

const SPECS_INDEX = "src/content/specs/index.ts";

class Planner {
  readonly beads: Bead[] = [];
  readonly introducedBy = new Map<string, string>();
  private readonly promptsSeen = new Set<string>();
  private pilotKeys: string[] = [];

  /**
   * Plans one section: primitive beads family by family, then composition
   * beads over the section's remaining entities in family order, so a
   * family's remainder shares a bead with the next family's first entities.
   */
  planSection(section: Section): void {
    const families = [...new Set(section.members.map((record) => record.family))].sort((a, b) => a - b);
    const left: EntityRecord[] = [];
    for (const family of families) {
      const members = section.members.filter((record) => record.family === family).sort((a, b) => compare(a.id, b.id));
      left.push(...this.planPrimitives(section, members, familyName(section, family)));
    }
    const ordered = left.sort((a, b) => a.family - b.family || compare(a.tags.join(","), b.tags.join(",")) || compare(a.id, b.id));
    const chunks: EntityRecord[][] = [];
    let chunk: EntityRecord[] = [];
    let total = 0;
    for (const record of ordered) {
      if (chunk.length > 0 && (total + weight(record) > TARGET_WEIGHT || chunk.length >= MAX_ENTITIES)) {
        chunks.push(chunk);
        chunk = [];
        total = 0;
      }
      chunk.push(record);
      total += weight(record);
    }
    if (chunk.length > 0) chunks.push(chunk);
    chunks.forEach((members, index) => {
      const names = [...new Set(members.map((record) => familyName(section, record.family)))];
      const number = String(index + 1).padStart(2, "0");
      this.add(section, "composition", `${section.slug}-${number}`, `${section.section} ${names.join(" / ")} (${String(index + 1)}/${String(chunks.length)})`, members, []);
    });
    if (section.pilot === true) this.pilotKeys = this.beads.filter((bead) => bead.section === section.section).map((bead) => bead.key);
  }

  /**
   * Adds a primitive bead for each new primitive the family first needs, most
   * widely needed first, and returns the members no primitive bead took.
   */
  private planPrimitives(section: Section, members: readonly EntityRecord[], name: string): EntityRecord[] {
    const pending = (record: EntityRecord): string[] => section.needsOf(record).filter((need) => !this.introducedBy.has(need));
    const frequency = new Map<string, number>();
    for (const record of members) for (const need of pending(record)) frequency.set(need, (frequency.get(need) ?? 0) + 1);
    const ranked = [...frequency.keys()].sort((a, b) => (frequency.get(b) ?? 0) - (frequency.get(a) ?? 0) || compare(a, b));
    const left = new Set(members);
    for (const need of ranked) {
      const key = `prim-${kebab(need)}`;
      this.introducedBy.set(need, key);
      const ready = [...left]
        .filter((record) => section.needsOf(record).includes(need) && section.needsOf(record).every((other) => this.introducedBy.has(other)))
        .sort((a, b) => weight(a) - weight(b) || compare(a.id, b.id));
      const exemplars: EntityRecord[] = [];
      let total = 0;
      for (const record of ready) {
        if (exemplars.length >= MAX_EXEMPLARS || total + weight(record) > TARGET_WEIGHT) break;
        exemplars.push(record);
        total += weight(record);
      }
      for (const record of exemplars) left.delete(record);
      this.add(section, "primitive", key, `${section.section} primitive ${need} (${name})`, exemplars, [need]);
    }
    return [...left];
  }

  /** A fixed task bead, outside the per-entity planning. */
  addTask(section: string, key: string, title: string, members: readonly EntityRecord[], dependsOn: readonly string[], externalDependsOn: readonly string[], areas: readonly string[], coreReview: boolean): void {
    this.beads.push({
      key,
      order: this.beads.length + 1,
      section,
      kind: "task",
      title,
      entities: members.map((record) => ({ id: record.id, kind: record.kind, status: record.status ?? "pending" })),
      weight: round(members.reduce((sum, record) => sum + weight(record), 0)),
      introduces: [],
      newPromptKinds: [],
      dependsOn: [...new Set(dependsOn)].sort(compare),
      serializedAfter: [],
      externalDependsOn: [...externalDependsOn],
      pilot: false,
      coreReview,
      scenarios: `src/content/specs/${key}.scenarios.ts`,
      areas: [...areas],
      sharedAreas: [],
      falloutHints: [],
      knownDecisions: [],
    });
  }

  private add(section: Section, kind: BeadKind, key: string, title: string, members: readonly EntityRecord[], introduces: readonly string[]): void {
    const needs = new Set(members.flatMap((record) => section.needsOf(record)));
    const dependsOn = new Set([...needs].map((need) => this.introducedBy.get(need) ?? key).filter((other) => other !== key));
    for (const other of section.extraDependsOn ?? []) dependsOn.add(other);
    const pilot = section.pilot === true;
    // Every bead after the pilot waits for it; an edge to another planned bead already implies it.
    if (!pilot && section.section !== "5.6" && dependsOn.size === 0) for (const other of this.pilotKeys) dependsOn.add(other);
    const newPromptKinds = [...new Set(members.flatMap((record) => record.promptKinds))]
      .filter((spec) => PROMPT_EXISTS.get(spec) !== true && !this.promptsSeen.has(spec))
      .sort(compare);
    for (const spec of newPromptKinds) this.promptsSeen.add(spec);
    const files = areaFiles(introduces);
    const fallout = new Set(files.fallout);
    if (newPromptKinds.length > 0) fallout.add("PromptRole");
    const scenarios = `src/content/specs/${key}.scenarios.ts`;
    const shared = [
      ...files.modules,
      ...(files.modules.some((file) => file.startsWith(P)) ? [`${P}index.ts`] : []),
      ...files.groups,
      ...(introduces.length > 0 || newPromptKinds.length > 0 ? ["engine hubs"] : []),
      ...[...fallout].sort(compare).map((symbol) => `fallout: ${symbol}`),
    ];
    const areas = [...members.map((record) => record.module ?? record.id).sort(compare), ...shared, scenarios, SPECS_INDEX];
    for (const record of members) record.routing.push(key);
    this.beads.push({
      key,
      order: this.beads.length + 1,
      section: section.section,
      kind,
      title,
      entities: members.map((record) => ({ id: record.id, kind: record.kind, status: record.status ?? "pending" })),
      weight: round(members.reduce((sum, record) => sum + weight(record), 0)),
      introduces: introduces.map(introduction),
      newPromptKinds,
      dependsOn: [...dependsOn].sort(compare),
      serializedAfter: [],
      externalDependsOn: [...(section.externalDependsOn ?? [])],
      pilot,
      coreReview: introduces.length > 0 || newPromptKinds.length > 0,
      scenarios,
      areas: [...new Set(areas)],
      sharedAreas: [...new Set(shared)],
      falloutHints: [...fallout].sort(compare),
      knownDecisions: members
        .filter((record) => record.clarifications ?? record.rulesDecisions ?? record.cardIssues ?? record.correction)
        .map((record) => ({
          id: record.id,
          ...(record.clarifications ? { clarifications: record.clarifications } : {}),
          ...(record.rulesDecisions ? { rulesDecisions: record.rulesDecisions } : {}),
          ...(record.cardIssues ? { cardIssues: record.cardIssues } : {}),
          ...(record.correction ? { note: record.correction } : {}),
        })),
    });
  }

  keysOf(section: string): string[] {
    return this.beads.filter((bead) => bead.section === section).map((bead) => bead.key);
  }
}

// Shared files a bead only appends to (workflow.md § Serialization edges): a
// new union member, registry entry, builder, or group test needs no edge.
const ADDITIVE_FILES: ReadonlySet<string> = new Set([`${P}index.ts`, DSL_TYPES, DSL_TRIGGERS, "src/engine/dsl/builders.ts", SPECS_INDEX]);

/**
 * Adds serialization edges (workflow.md § Serialization edges): each bead
 * that changes an entity module or engine logic file another bead also
 * changes waits for the previous such bead in plan order, unless a planning
 * edge already orders them.
 */
function serialize(beads: readonly Bead[]): void {
  const last = new Map<string, string>();
  const byKey = new Map(beads.map((bead) => [bead.key, bead]));
  const reaches = (from: string, to: string, seen = new Set<string>()): boolean => {
    if (from === to) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    const bead = byKey.get(from);
    return bead !== undefined && [...bead.dependsOn, ...bead.serializedAfter.map((edge) => edge.bead)].some((next) => reaches(next, to, seen));
  };
  for (const bead of beads) {
    const code = bead.areas.filter((area) => (area.startsWith("src/content/") && !area.startsWith("src/content/specs/")) || (area.startsWith("src/engine/") && !ADDITIVE_FILES.has(area) && !area.endsWith(".test.ts")));
    for (const file of code) {
      const previous = last.get(file);
      if (previous !== undefined && !reaches(bead.key, previous)) bead.serializedAfter.push({ bead: previous, code: file });
      last.set(file, bead.key);
    }
  }
}

const round = (value: number): number => Math.round(value * 10) / 10;

function familyName(section: Section, family: number): string {
  const entry = FAMILIES.find((candidate) => candidate.family === family);
  return entry === undefined || family === 0 || section.pilot === true ? section.name : `${section.name}: ${entry.name}`;
}

// 5.6 owns the journey hooks and the type remap; every other section owns engine primitives.
const isJourneyNeed = (name: string): boolean => primitive(name).kind === "journey" || name === "typeRemap";

// The exploration effects of 5.7b, one bead per modification kind.
const DECK_ENTRY_BEADS: readonly { readonly key: string; readonly title: string; readonly effectKinds: readonly string[] }[] = [
  { key: "deck-mods-spark-bonus", title: "spark bonus", effectKinds: ["increase-spark-all", "purge-random-subtype-and-increase-spark"] },
  { key: "deck-mods-cost-reduction", title: "cost reduction", effectKinds: ["reduce-cost-all-and-gain-nightmares"] },
  { key: "deck-mods-fast", title: "Fast", effectKinds: ["make-fast-all", "make-predicate-fast-and-gain-nightmares"] },
  { key: "deck-mods-reclaim", title: "granted and overridden Reclaim", effectKinds: ["purge-duplicates-and-grant-reclaim"] },
  { key: "deck-mods-subtype-change", title: "subtype change", effectKinds: ["change-subtype-all", "change-subtype-selected"] },
  { key: "deck-mods-card-type-change", title: "card-type change", effectKinds: ["change-card-type-selected"] },
  { key: "next-battle-opening-hand", title: "next-battle opening hand", effectKinds: ["next-battle-opening-hand"] },
  { key: "next-battle-starting-energy", title: "next-battle starting energy", effectKinds: ["next-battle-starting-energy"] },
  { key: "next-battle-smaller-hand", title: "next-battle smaller hand and cost discount", effectKinds: ["next-battle-smaller-hand-and-cost-discount"] },
];

function planBeads(records: readonly EntityRecord[]): Planner {
  const planner = new Planner();
  const routed = (task: string): EntityRecord[] => records.filter((record) => record.routing.includes(task));
  const engineNeeds = (record: EntityRecord): readonly string[] => record.requiredPrimitives.new.filter((name) => !isJourneyNeed(name));
  const cards = routed("5.2");
  planner.planSection({ section: "5.2", slug: "pilot", name: "Starter, Tutorial, Nightmare, and Contemplation", members: cards.filter((record) => record.family === 1), needsOf: engineNeeds, pilot: true });
  planner.planSection({ section: "5.2", slug: "cards", name: "cards", members: cards.filter((record) => record.family !== 1), needsOf: engineNeeds });
  const cardKeys = planner.keysOf("5.2");
  planner.addTask("5.2", "card-checkpoint", "5.2 card coverage checkpoint", [], cardKeys, [], ["docs/plan/evidence/qa-ledger/", "docs/plan/evidence/pre-existing/"], false);
  // Each section's shared setup is one bead the section's other beads wait for.
  const pilotKeys = planner.keysOf("5.2").filter((key) => planner.beads.find((bead) => bead.key === key)?.pilot === true);
  planner.addTask("5.3", "dreamwell-lab", "5.3 Card-lab variant that forces the next Dreamwell draw", [], pilotKeys, ["Phase 4.7"], ["scripts/qa/", "src/screens/"], false);
  planner.planSection({ section: "5.3", slug: "dreamwell", name: "Dreamwell cards", members: routed("5.3"), needsOf: engineNeeds, extraDependsOn: ["dreamwell-lab"] });
  planner.addTask("5.4", "avatar-lab", "5.4 Card-lab avatar scene (?goto=card-lab&avatar=<uuid>)", [], pilotKeys, [], ["scripts/qa/", "src/screens/"], false);
  planner.planSection({ section: "5.4", slug: "avatars", name: "Avatars", members: routed("5.4"), needsOf: engineNeeds, extraDependsOn: ["avatar-lab"] });
  planner.addTask("5.5", "dreamsign-lab", "5.5 Card-lab dreamsign scene (?goto=card-lab&dreamsign=<uuid>)", [], pilotKeys, [], ["scripts/qa/", "src/screens/"], false);
  planner.planSection({ section: "5.5", slug: "dreamsigns-battle", name: "Dreamsigns: battle effects", members: routed("5.5"), needsOf: engineNeeds, extraDependsOn: ["dreamsign-lab"] });
  planner.addTask("5.6", "journey-registry", "5.6 Journey-modifier registry keyed by dreamsign UUID, with modifier logging", [], [], ["5.1", "Phase 4.1"], ["src/rules/journey/", "engine hubs"], true);
  planner.planSection({
    section: "5.6",
    slug: "dreamsigns-journey",
    name: "Dreamsigns: journey effects (P8)",
    members: routed("5.6"),
    needsOf: (record) => record.requiredPrimitives.new.filter(isJourneyNeed),
    extraDependsOn: ["journey-registry"],
  });
  planner.planSection({
    section: "5.7a",
    slug: "transfigurations",
    name: "Transfiguration transforms",
    members: routed("5.7a"),
    needsOf: (record) => record.requiredPrimitives.new,
    extraDependsOn: [planner.introducedBy.get("journeyTransfiguration") ?? "5.6"],
    externalDependsOn: ["the Phase 3 gate"],
  });
  const transfigurationKeys = planner.keysOf("5.7a");
  planner.addTask("5.7", "transfiguration-sweep", "5.7 Transfiguration sweep sample", [], [...transfigurationKeys, "card-checkpoint"], [], ["docs/plan/evidence/qa-ledger/"], false);
  const deckEntry = routed("5.7b");
  planner.addTask("5.7b", "deck-mods-foundation", "5.7b Deck-entry modifications: exhaustive mapping, card-lab mods, fuzz mods", [], [...transfigurationKeys, "card-checkpoint"], [], ["src/engine/", "scripts/qa/", "engine hubs"], true);
  for (const { key, title, effectKinds } of DECK_ENTRY_BEADS) {
    const members = deckEntry.filter((record) => effectKinds.includes(record.effectKind ?? ""));
    planner.addTask("5.7b", key, `5.7b Deck-entry modifications: ${title}`, members, ["deck-mods-foundation"], [], [], false);
    for (const record of members) record.routing.push(key);
  }
  const apollyon = routed("5.8").sort((a, b) => compare(a.id, b.id));
  const contentKeys = ["card-checkpoint", ...planner.keysOf("5.4"), ...planner.keysOf("5.5")];
  planner.addTask("5.8", "apollyon-design", "5.8 Apollyon incarnations: provisional mechanics design (D6)", apollyon, [], [], ["docs/design.md", "docs/plan/evidence/rules-decisions/"], true);
  const implementationKeys: string[] = [];
  for (let index = 0; index < apollyon.length; index += APOLLYON_PER_BEAD) {
    const members = apollyon.slice(index, index + APOLLYON_PER_BEAD);
    const key = `apollyon-${String(index / APOLLYON_PER_BEAD + 1).padStart(2, "0")}`;
    implementationKeys.push(key);
    planner.addTask("5.8", key, `5.8 Apollyon incarnations (${String(index / APOLLYON_PER_BEAD + 1)}/${String(Math.ceil(apollyon.length / APOLLYON_PER_BEAD))})`, members, ["apollyon-design", ...contentKeys], [], [], false);
    for (const record of members) record.routing.push(key);
  }
  planner.addTask("5.8", "apollyon-sanity", "5.8 Apollyon sanity matrix and frozen deck pool", [], implementationKeys, ["Phase 7.1"], [], false);
  serialize(planner.beads);
  return planner;
}

// ---------------------------------------------------------------------------
// Output.

/**
 * JSON with two-space indentation, except that a value whose single-line form
 * fits in INLINE_WIDTH characters stays on one line, and every element of the
 * entities, primitives, and promptKinds lists takes exactly one line.
 */
const INLINE_WIDTH = 120;
const ONE_PER_LINE: ReadonlySet<string> = new Set(["entities", "primitives", "promptKinds"]);

function pretty(value: unknown, indent: string, key: string | undefined): string {
  const inline = JSON.stringify(value);
  if (typeof value !== "object" || value === null || inline.length + indent.length <= INLINE_WIDTH) return inline;
  const inner = `${indent}  `;
  if (Array.isArray(value)) {
    const items = value.map((item: unknown) => (key !== undefined && ONE_PER_LINE.has(key) ? JSON.stringify(item) : pretty(item, inner, undefined)));
    return `[\n${items.map((item) => `${inner}${item}`).join(",\n")}\n${indent}]`;
  }
  const entries = Object.entries(value).map(([name, item]) => `${inner}${JSON.stringify(name)}: ${pretty(item, inner, name)}`);
  return `{\n${entries.join(",\n")}\n${indent}}`;
}

function main(): void {
  const records = buildEntities();
  const ids = records.map((record) => record.id);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))].sort(compare);
  if (duplicates.length > 0) throw new Error(`duplicate UUIDs: ${duplicates.join(", ")}`);
  const unknownCorrections = Object.keys(CORRECTIONS).filter((id) => !ids.includes(id));
  if (unknownCorrections.length > 0) throw new Error(`corrections for unknown entities: ${unknownCorrections.join(", ")}`);
  const gated: readonly EntityKind[] = ["card", "dreamsign", "avatar", "dreamwell", "figment"];
  const missingModules = records.filter((record) => gated.includes(record.kind) && record.module === undefined);
  if (missingModules.length > 0) throw new Error(`no module for ${missingModules.map((record) => record.id).join(", ")}`);

  const planner = planBeads(records);
  const { beads, introducedBy } = planner;
  const oversized = beads.filter((bead) => bead.kind === "composition" && bead.entities.length > MAX_ENTITIES);
  if (oversized.length > 0) throw new Error(`composition beads over ${String(MAX_ENTITIES)} entities: ${oversized.map((bead) => bead.key).join(", ")}`);
  const keys = beads.map((bead) => bead.key);
  const duplicateKeys = [...new Set(keys.filter((key, index) => keys.indexOf(key) !== index))];
  if (duplicateKeys.length > 0) throw new Error(`duplicate bead keys: ${duplicateKeys.join(", ")}`);
  const dangling = beads.flatMap((bead) => [...bead.dependsOn, ...bead.serializedAfter.map((edge) => edge.bead)].filter((key) => !keys.includes(key)).map((key) => `${bead.key} -> ${key}`));
  if (dangling.length > 0) throw new Error(`edges to unknown beads: ${dangling.join(", ")}`);
  const unrouted = records.filter((record) => record.status === "pending" && !record.routing.some((route) => keys.includes(route)));
  if (unrouted.length > 0) throw new Error(`pending entities in no bead: ${unrouted.map((record) => record.id).join(", ")}`);

  const count = (match: (record: EntityRecord) => boolean): Record<string, number> =>
    Object.fromEntries(KIND_ORDER.map((kind) => [kind, records.filter((record) => record.kind === kind && match(record)).length]));
  const usage = new Map<string, number>();
  for (const record of records) for (const name of [...record.requiredPrimitives.existing, ...record.requiredPrimitives.new]) usage.set(name, (usage.get(name) ?? 0) + 1);
  const promptUsage = new Map<string, number>();
  for (const record of records) for (const spec of record.promptKinds) promptUsage.set(spec, (promptUsage.get(spec) ?? 0) + 1);
  const promptFirst = new Map<string, string>();
  for (const bead of beads) for (const spec of bead.newPromptKinds) if (!promptFirst.has(spec)) promptFirst.set(spec, bead.key);

  const inventory = {
    generatedBy: relative(ROOT, fileURLToPath(import.meta.url)),
    summary: {
      countsByKind: count(() => true),
      total: records.length,
      duplicateIds: duplicates.length,
      pendingByKind: count((record) => record.status === "pending"),
      cardsWithAmplifiedText: records.filter((record) => record.kind === "card" && record.amplifiedText !== undefined).length,
      beads: beads.length,
      beadsBySection: Object.fromEntries([...new Set(beads.map((bead) => bead.section))].map((section) => [section, beads.filter((bead) => bead.section === section).length])),
      beadsByKind: Object.fromEntries((["primitive", "composition", "task"] as const).map((kind) => [kind, beads.filter((bead) => bead.kind === kind).length])),
      largestCompositionBead: Math.max(...beads.filter((bead) => bead.kind === "composition").map((bead) => bead.entities.length)),
      newPrimitives: [...PRIMITIVE_BY_NAME.values()].filter((entry) => !entry.exists && usage.has(entry.name)).length,
      notes: [
        "Bead dependsOn lists planning edges: the bead that introduces each new primitive the bead needs, the pilot beads for a bead with no other edge, and the fixed task edges of the phase page. Serialization edges (workflow.md § Serialization edges) are added at filing, from sharedAreas and entity modules.",
        "Primitive and prompt existence is probed against src/engine when the script runs; DSL-addition probe patterns name the expected shape and are a planning aid.",
        "Tags come from regex rules and manual corrections in scripts/content-inventory.ts; an implementing session reads the printed text clause by clause (recipe step 2) and may need primitives the tags miss.",
      ],
    },
    gaps: GAPS.map((entry) => ({
      ...entry,
      exists: primitive(entry.primitive).exists,
      introducedBy: introducedBy.get(entry.primitive) ?? null,
    })),
    beads,
    primitives: [...PRIMITIVE_BY_NAME.values()]
      .filter((entry) => usage.has(entry.name))
      .sort((a, b) => Number(a.exists) - Number(b.exists) || compare(a.name, b.name))
      .map((entry) => ({
        name: entry.name,
        kind: entry.kind,
        module: entry.module ?? null,
        exists: entry.exists,
        usedBy: usage.get(entry.name),
        introducedBy: entry.exists ? null : (introducedBy.get(entry.name) ?? null),
        ...(entry.note === undefined ? {} : { note: entry.note }),
      })),
    promptKinds: [...promptUsage.keys()]
      .sort(compare)
      .map((spec) => ({ kind: spec, exists: PROMPT_EXISTS.get(spec) ?? false, usedBy: promptUsage.get(spec), firstBead: promptFirst.get(spec) ?? null })),
    entities: [...records].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || compare(a.id, b.id)),
  };

  const output = `${pretty(inventory, "", undefined)}\n`;
  const target = join(ROOT, OUTPUT);
  if (process.argv.includes("--check")) {
    if ((existsSync(target) ? readFileSync(target, "utf8") : "") !== output) {
      console.error(`${OUTPUT} is stale; run npx tsx scripts/content-inventory.ts`);
      process.exit(1);
    }
    console.log(`${OUTPUT} is current`);
    return;
  }
  writeFileSync(target, output);
  console.log(`wrote ${OUTPUT}: ${String(records.length)} entities, ${String(beads.length)} beads`);
}

main();
