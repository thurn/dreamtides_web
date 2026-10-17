import { describe, expect, it } from "vitest";
import { classifyInventoryText, inventoryCapabilityResolver, inventoryDslCapabilities, type InventoryCapabilityForm } from "./content-inventory";

const requirements = (text: string) => {
  const classified = classifyInventoryText(text);
  return { ...classified, needs: [...classified.requiredPrimitives.existing, ...classified.requiredPrimitives.new] };
};

describe("inventory cost modifier classification", () => {
  it.each([
    "When you abandon a character, the next character you play this turn costs 2● less.",
    "When you discard a card, your next card this turn costs 1● less.",
    "When you play your second card in a turn, your next character this turn costs 1● less.",
  ])("uses the one-shot modifier for a next-card discount: %s", (text) => {
    const result = requirements(text);
    expect(result.needs).toContain("costModifier");
    expect(result.needs).not.toContain("costModifierNth");
  });

  it.each(["first", "second", "third"])("retains the static %s-in-turn cost requirement", (ordinal) => {
    const result = requirements(`The ${ordinal} character you play in a turn costs 2● less.`);
    expect(result.needs).toContain("costModifier");
    expect(result.needs).toContain("costModifierNth");
  });
});

describe("inventory discard cost classification", () => {
  it.each([
    "Discard your hand: Gain 1●.",
    "To play this event, discard your hand. Gain 1⍟.",
    "Reclaim – Discard your hand",
  ])("uses mandatory whole-hand payment without a chosen-discard prompt: %s", (text) => {
    const result = requirements(text);
    expect(result.tags).toContain("cost-discard-hand");
    expect(result.needs).toContain("discardHandCost");
    expect(result.needs).not.toContain("discardCost");
    expect(result.needs).not.toContain("discardCostFilter");
    expect(result.promptKinds).not.toContain("chooseCards:discardCost");
  });

  it.each([
    ["Discard a card: Gain 1●.", false],
    ["Discard an event: Gain 1●.", true],
    ["Discard X cards: Gain 1●.", true],
  ] as const)("keeps chosen discard requirements and prompts: %s", (text, filtered) => {
    const result = requirements(text);
    expect(result.needs).toContain("discardCost");
    expect(result.needs.includes("discardCostFilter")).toBe(filtered);
    expect(result.needs).not.toContain("discardHandCost");
    expect(result.promptKinds).toContain("chooseCards:discardCost");
  });

  it("keeps the chosen prompt when both discard costs appear in the same clause", () => {
    const result = requirements("To play this event, discard a card, then discard your hand. Gain 1⍟.");
    expect(result.needs).toEqual(expect.arrayContaining(["discardCost", "discardHandCost"]));
    expect(result.promptKinds).toContain("chooseCards:discardCost");
  });

  it("classifies whole-hand discard in an effect separately from a payment", () => {
    const result = requirements("Discard your hand. Draw 2 cards.");
    expect(result.needs).not.toContain("discardHandCost");
    expect(result.tags).not.toContain("cost-discard-hand");
  });
});

/** Synthetic modules model public authoring APIs; engine/catalog exports are not test inputs. */
const moduleName = "inventory-fixtures/forms.ts";
const build = (symbol: string): InventoryCapabilityForm => ({ module: moduleName, symbol, kind: "builder" });
const form = (symbol: string, options: Omit<InventoryCapabilityForm, "module" | "symbol" | "kind"> = {}): InventoryCapabilityForm => ({ module: moduleName, symbol, kind: "form", ...options });

describe("inventory exported capabilities", () => {
  it("resolves callable exports, aliases and type-only reexports without executing modules", () => {
    const resolver = fixtureResolver("aliases");
    expect(resolver([build("alias")])).toBe(true);
    expect(resolver([form("Reexported", { member: "return" })])).toBe(true);
  });

  it("rejects missing modules/exports, private declarations and noncallable values", () => {
    const resolver = fixtureResolver("invalid");
    expect(resolver([build("hidden")])).toBe(false);
    expect(resolver([build("value")])).toBe(false);
    expect(resolver([form("Private")])).toBe(false);
    expect(resolver([form("Broken")])).toBe(false);
    expect(resolver([form("Pending")])).toBe(false);
    expect(resolver([{ ...build("value"), module: "inventory-fixtures/missing.ts" }])).toBe(false);
  });

  it("keeps every supported descriptor stable under representation-field rename and reformatting", () => {
    const descriptors = [build("pay"), form("Payment", { member: "return" }), form("Trigger", { member: "draw", option: "filter" }), form("Trigger", { member: "draw", option: "from", optionLiteral: "void" }), form("Speed", { literal: "fast" }), form("Options", { option: "once" }), form("Zone")];
    const old = fixtureResolver("representationOld");
    const changed = fixtureResolver("representationChanged");
    expect(descriptors.map(descriptor => old([descriptor]))).toEqual([true, true, true, true, true, true, true]);
    expect(descriptors.map(descriptor => changed([descriptor]))).toEqual([true, true, true, true, true, true, true]);
  });

  it("requires the semantic option on the matching registered variant, not merely its generic builder", () => {
    const resolver = fixtureResolver("semanticOption");
    expect(resolver([build("generic")])).toBe(true);
    expect(resolver([form("Trigger", { member: "play", option: "filter" })])).toBe(true);
    expect(resolver([form("Trigger", { member: "draw", option: "filter" })])).toBe(false);
    expect(resolver([form("Trigger", { member: "draw", option: "ordinal" })])).toBe(false);
    expect(resolver([form("Trigger", { member: "play", option: "from", optionLiteral: "void" })])).toBe(false);
    expect(resolver([form("Trigger", { member: "play", option: "from", optionLiteral: "hand" })])).toBe(true);
    expect(resolver([form("Selector", { option: "bounds" })])).toBe(false);
    expect(resolver([form("Trigger", { member: "absent" })])).toBe(false);
  });

  it("resolves inherited option forms and aliases with one shared module model", () => {
    const resolver = fixtureResolver("inherited");
    expect(resolver([form("Extended", { option: "limited" })])).toBe(true);
    expect(resolver([form("Alias", { option: "limited" })])).toBe(true);
    expect(resolver([form("Extended", { option: "missing" })])).toBe(false);
  });

  it("keeps alternative forms independent and recognizes actual absence", () => {
    const resolver = fixtureResolver("alternatives");
    expect(resolver([])).toBe(false);
    expect(resolver([form("Missing"), form("Actual", { member: "present" })])).toBe(true);
    expect(resolver([form("Missing"), form("Actual", { member: "absent" })])).toBe(false);
  });
});


// Independent authoring fixtures specify the intended API, including future forms.
// They are not generated from descriptors or populated from the current engine.
const completeAuthoringFixtures = new Map<string, string>([
  ["src/engine/effects/primitives/cost-modifier.ts", 'export interface CostModifierNthNode { from?: "void" }'],
  ["src/engine/dsl/builders.ts", `
    export function controls() {} export function costPaid() {}
    export function randomIn() {} export function countCards() {}
    export function costOf() {} export function conditionCardCounts() {}
    export function lastPlayed() {} export function lastMaterialized() {}
    export function pointsCost() {} export function giveOpponentPointsCost() {} export function returnCost() {}
    export function discardHandCost() {} export function discardCostFilter() {}
    export function banishXCost() {} export function banishFromAnyVoidCost() {}
    export function abandonXCost() {}
  `],
  ["src/engine/dsl/triggers.ts", `
    export function whenDissolved() {} export function whenDiscardSelf() {}
    export function whenPutIntoVoid() {} export function atEndOfTurn() {}
    export function whenForesee() {} export function firstTimeEachTurn() {}
    export function whenRemovesEnemy() {} export function whenDissolvesEnemyInChallenge() {}
  `],
  ["src/engine/dsl/types.ts", `
    export type PaymentCost = { tag: "banishFromHand"; count: number } | { tag: "discard"; count: "x"; min?: number };
    export type Condition = { tag: "energyAtLeast"; amount: number } | { tag: "thisTurn" } | { tag: "sourceWasAlternativePlayed" };
    export type ValueExpr = { tag: "handSize" } | { tag: "storedCounters" } | { tag: "playedThisTurn" };
    export type Trigger = { tag: "play"; nth?: number; from?: "hand" | "void" }
      | { tag: "draw"; filter?: object } | { tag: "materialize"; nth?: number }
      | { tag: "reclaim" } | { tag: "returnToHand" } | { tag: "erode" }
      | { tag: "foresee" } | { tag: "copy" } | { tag: "removesEnemy" }
      | { tag: "handBecomesEmpty"; firstTimeEachTurn?: true } | { tag: "namedAbilityTriggered"; firstTimeEachTurn?: true };
    export type CharacterRef = { tag: "lastMaterialized" };
    export type FunctionalZone = "hand" | "void" | "deck";
    export interface ActivatedAbility { oncePerTurn?: boolean; zone?: FunctionalZone }
    export type Speed = "standard" | "fast";
    export interface CharacterSelector { figment?: boolean; hasAbility?: string; challenging?: boolean; costAtLeast?: number }
    export interface StackItemSelector { costAtMost?: number; sparkAtMost?: number }
    export interface CardFilter { hasAbility?: string; costAtMost?: number; sparkAtMost?: number }
    export interface ZoneCardSpec { zone: "hand" | "void" | "deck" }
    export interface ZoneTargetSpec { zone: "void"; costAtMost?: number | { tag: "x" } }
    export type BoundValue = number | { tag: "x" } | { tag: "sourceSpark" };
    export interface StaticAbility { zone?: FunctionalZone }
    export interface AlternativeCostAbility { tag: "alternativeCost"; condition?: Condition }
    export type Ability = { tag: "playCondition" } | AlternativeCostAbility;
    export interface TriggeredAbility { oncePerTurn?: boolean }
    export interface DeckMods {
      typeChange?: { cardType: "character" | "event"; subtype: string };
    }
    export interface Variant { typeRemap?: string; }
  `],
  ["src/engine/effects/types.ts", 'export type CardRef = { tag: "source" } | { tag: "lastPlayed" };'],
  ["src/engine/effects/primitives/grant-reclaim.ts", 'export type ReclaimCards = { tag: "inZone" } | { tag: "movedBy" } | { tag: "subject" };'],
]);
const expectedCapabilityNames = [
  "costModifierNthOrigin",
  "banishFromHandCost", "conditionControls", "conditionEnergyAtLeast", "conditionCostPaid",
  "valueHandSize", "triggerNth", "functionalZones", "oncePerTurn", "speedFast",
  "selectorFigment", "selectorHasAbility", "stackSelectorBounds", "selectorChallenger",
  "selectorBounds", "cardFilterBounds", "zoneCardRefs", "randomSelection", "valueZoneCounts",
  "valueCardStats", "storedCounters", "conditionCardCounts", "turnHistory", "historyRefs",
  "staticZones", "playCondition", "alternativeCost", "conditionalAlternativeCost", "alternativePlayResult", "pointsCost", "giveOpponentPointsCost", "returnCost",
  "discardHandCost", "discardCostFilter", "banishXCost", "banishFromAnyVoidCost",
  "whenDissolvedTrigger", "whenDiscardSelfTrigger", "whenReclaimTrigger", "whenReturnTrigger",
  "whenErodeTrigger", "whenForeseeTrigger", "whenCopyTrigger", "whenRemovesEnemyTrigger",
  "whenPutIntoVoidTrigger", "whenPlayFromVoidTrigger", "drawTriggerFilter",
  "materializeNthTrigger", "atEndOfTurnTrigger", "firstTimeEachTurn", "typeRemap",
  "discardCostFilterMin", "abandonXCost", "cardFilterSparkBounds", "voidTargetXBound",
  "boundSourceSpark", "activatedFromVoid", "grantReclaimTriggeringCard",
] as const;
// Each independently authored row contains only that capability's intended API.
// Virtual namespaces let all rows share one compiler/library model.
const typesModule = "src/engine/dsl/types.ts";
const buildersModule = "src/engine/dsl/builders.ts";
const triggersModule = "src/engine/dsl/triggers.ts";
const minimalApiFixtures = [
  ["costModifierNthOrigin", "src/engine/effects/primitives/cost-modifier.ts", 'export interface CostModifierNthNode { from?: "void" }'],
  ["banishFromHandCost", typesModule, 'export type PaymentCost = { kind: "banishFromHand" };'],
  ["conditionControls", buildersModule, 'export function controls() {}'],
  ["conditionEnergyAtLeast", typesModule, 'export type Condition = { kind: "energyAtLeast" };'],
  ["conditionCostPaid", buildersModule, 'export function costPaid() {}'],
  ["valueHandSize", typesModule, 'export type ValueExpr = { kind: "handSize" };'],
  ["triggerNth", typesModule, 'export type Trigger = { kind: "play"; nth?: number };'],
  ["functionalZones", typesModule, 'export type FunctionalZone = "hand" | "deck";'],
  ["oncePerTurn", typesModule, 'export interface ActivatedAbility { oncePerTurn?: boolean }'],
  ["speedFast", typesModule, 'export type Speed = "standard" | "fast";'],
  ["selectorFigment", typesModule, 'export interface CharacterSelector { figment?: boolean }'],
  ["selectorHasAbility", typesModule, 'export interface CharacterSelector { hasAbility?: string } export interface CardFilter { hasAbility?: string }'],
  ["stackSelectorBounds", typesModule, 'export interface StackItemSelector { costAtMost?: number; sparkAtMost?: number }'],
  ["selectorChallenger", typesModule, 'export interface CharacterSelector { challenging?: boolean }'],
  ["selectorBounds", typesModule, 'export interface CharacterSelector { costAtLeast?: number }'],
  ["cardFilterBounds", typesModule, 'export interface CardFilter { hasAbility?: string; costAtMost?: number }'],
  ["zoneCardRefs", typesModule, 'export interface ZoneCardSpec { zone: "hand" | "deck" }'],
  ["randomSelection", buildersModule, 'export function randomIn() {}'],
  ["valueZoneCounts", buildersModule, 'export function countCards() {}'],
  ["valueCardStats", buildersModule, 'export function costOf() {}'],
  ["storedCounters", typesModule, 'export type ValueExpr = { kind: "storedCounters" };'],
  ["conditionCardCounts", buildersModule, 'export function conditionCardCounts() {}'],
  ["turnHistory", typesModule, 'export type ValueExpr = { kind: "playedThisTurn" }; export type Condition = { kind: "thisTurn" };'],
  ["historyRefs", "src/engine/effects/types.ts", 'export type CardRef = { kind: "lastPlayed" };'],
  ["staticZones", typesModule, 'export interface StaticAbility { zone?: "hand" | "void" }'],
  ["playCondition", typesModule, 'export type Ability = { kind: "playCondition" };'],
  ["alternativeCost", typesModule, 'export type Ability = { kind: "alternativeCost" };'],
  ["conditionalAlternativeCost", typesModule, 'export interface AlternativeCostAbility { condition?: { kind: "controls" } }'],
  ["alternativePlayResult", typesModule, 'export type Condition = { kind: "sourceWasAlternativePlayed" };'],
  ["giveOpponentPointsCost", buildersModule, 'export function giveOpponentPointsCost() {}'],
  ["pointsCost", buildersModule, 'export function pointsCost() {}'],
  ["returnCost", buildersModule, 'export function returnCost() {}'],
  ["discardHandCost", buildersModule, 'export function discardHandCost() {}'],
  ["discardCostFilter", buildersModule, 'export function discardCostFilter() {}'],
  ["banishXCost", buildersModule, 'export function banishXCost() {}'],
  ["banishFromAnyVoidCost", buildersModule, 'export function banishFromAnyVoidCost() {}'],
  ["whenDissolvedTrigger", triggersModule, 'export function whenDissolved() {}'],
  ["whenDiscardSelfTrigger", triggersModule, 'export function whenDiscardSelf() {}'],
  ["whenReclaimTrigger", typesModule, 'export type Trigger = { kind: "reclaim" };'],
  ["whenReturnTrigger", typesModule, 'export type Trigger = { kind: "returnToHand" };'],
  ["whenErodeTrigger", typesModule, 'export type Trigger = { kind: "erode" };'],
  ["whenForeseeTrigger", typesModule, 'export type Trigger = { kind: "foresee" };'],
  ["whenCopyTrigger", typesModule, 'export type Trigger = { kind: "copy" };'],
  ["whenRemovesEnemyTrigger", typesModule, 'export type Trigger = { kind: "removesEnemy" };'],
  ["whenPutIntoVoidTrigger", triggersModule, 'export function whenPutIntoVoid() {}'],
  ["whenPlayFromVoidTrigger", typesModule, 'export type Trigger = { kind: "play"; from?: "void" };'],
  ["drawTriggerFilter", typesModule, 'export type Trigger = { kind: "draw"; filter?: object };'],
  ["materializeNthTrigger", typesModule, 'export type Trigger = { kind: "materialize"; nth?: number };'],
  ["atEndOfTurnTrigger", triggersModule, 'export function atEndOfTurn() {}'],
  ["firstTimeEachTurn", typesModule, 'export type Trigger = { kind: "handBecomesEmpty"; firstTimeEachTurn?: true } | { kind: "namedAbilityTriggered"; firstTimeEachTurn?: true };'],
  ["typeRemap", typesModule, 'export interface Variant { typeRemap?: string }'],
  ["discardCostFilterMin", typesModule, 'export type PaymentCost = { kind: "discard"; min?: number };'],
  ["abandonXCost", buildersModule, 'export function abandonXCost() {}'],
  ["cardFilterSparkBounds", typesModule, 'export interface CardFilter { sparkAtMost?: number }'],
  ["voidTargetXBound", typesModule, 'export interface ZoneTargetSpec { costAtMost?: number }'],
  ["boundSourceSpark", typesModule, 'export type BoundValue = number | { kind: "sourceSpark" };'],
  ["activatedFromVoid", typesModule, 'export interface ActivatedAbility { zone?: "void" }'],
  ["grantReclaimTriggeringCard", "src/engine/effects/primitives/grant-reclaim.ts", 'export type ReclaimCards = { kind: "subject" };'],
] as const;
const scopedModule = (capability: string, module: string) => `inventory-intended/${capability}/${module}`;
const minimalSources = new Map<string, string>();
for (const [capability, intendedModule, source] of minimalApiFixtures) {
  for (const module of completeAuthoringFixtures.keys()) {
    minimalSources.set(scopedModule(capability, module), module === intendedModule ? source : "export {};");
  }
}
minimalSources.set(scopedModule("firstTimeEachTurn", triggersModule), "export function firstTimeEachTurn() {};");
minimalSources.set(scopedModule("whenRemovesEnemyTrigger", triggersModule),
  "export function whenRemovesEnemy() {} export function whenDissolvesEnemyInChallenge() {}");
minimalSources.set(scopedModule("whenForeseeTrigger", triggersModule), "export function whenForesee() {}");
minimalSources.set(scopedModule("historyRefs", typesModule), 'export type CharacterRef = { kind: "lastMaterialized" };');
minimalSources.set(scopedModule("historyRefs", buildersModule), "export function lastPlayed() {} export function lastMaterialized() {}");
const minimalResolver = inventoryCapabilityResolver(minimalSources);

// Every immutable source state has its own virtual module namespace. Relative
// implementation/reexport paths stay together; missing modules have no entry.
const contractSources = {
  aliases: new Map([[moduleName, 'export { create as alias } from "./implementation"; export type { Action as Reexported } from "./implementation";'], ["inventory-fixtures/implementation.ts", 'export function create() { throw new Error("must not execute"); } export type Action = { representation: "return" };']]),
  invalid: new Map([[moduleName, 'function hidden() {} export const value = 4; interface Private { feature?: boolean } export type Broken = Unavailable; export type Pending = never;']]),
  representationOld: new Map([[moduleName, 'export function pay() {} export type Payment = { cost: "return"; count: number }; export type Trigger = { on: "draw"; filter?: object; from?: "void" }; export type Speed = "standard" | "fast"; export interface Options { once?: boolean } export type Zone = "hand" | "deck";']]),
  representationChanged: new Map([[moduleName, `export function pay () { }
      export type Payment = {
        readonly paymentKind: "return";
        readonly quantity: number;
      };
      export type Trigger = { readonly eventName: "draw"; readonly filter?: object; readonly from?: "void" };
      export type Speed =
        | "standard"
        | "fast";
      export interface Options { readonly once?: boolean; }
      export type Zone = "hand" | "deck";
    `]]),
  semanticOption: new Map([[moduleName, `export function generic() {}
      export type Trigger = { event: "play"; filter?: object; ordinal?: number; from?: "hand" }
        | { event: "draw"; filter?: never };
      export interface Selector { controller: "any"; }
    `]]),
  inherited: new Map([[moduleName, 'export interface Base { limited?: boolean } export interface Extended extends Base { unrelated?: string } export type Alias = Extended;']]),
  alternatives: new Map([[moduleName, 'export type Actual = { renamedTag: "present" };']]),
  pending: new Map([[moduleName, 'export type Action = { tag: "present" }; export type Pending = never; export interface Present { from: "hand"; unusable?: never; unknown?: unknown; untyped?: any }']]),
  firstOccasion: new Map([...completeAuthoringFixtures, [typesModule, 'export interface TriggeredAbility { oncePerTurn?: boolean }']]),
  renamedRepresentation: new Map([...completeAuthoringFixtures].map(([module, source]) => [module, source.replaceAll("tag:", "representation:")])),
  voidAbsent: new Map([["src/engine/effects/primitives/cost-modifier.ts", 'export interface CostModifierNthNode { nth: number }']]),
  voidWrong: new Map([["src/engine/effects/primitives/cost-modifier.ts", 'export interface CostModifierNthNode { from?: "hand" }']]),
  voidExact: new Map([["src/engine/effects/primitives/cost-modifier.ts", 'export interface CostModifierNthNode { from?: "void" }']]),
  subtypeAbsent: new Map([...completeAuthoringFixtures, [typesModule, 'export interface DeckMods { typeChange?: { subtype: string } } export interface Variant { amplified: boolean }']]),
  subtypePresent: new Map([...completeAuthoringFixtures, [typesModule, 'export interface Variant { amplified: boolean; typeRemap?: string }']]),
  semanticRename: new Map([[moduleName, 'export interface Selector { renamedBound?: number }']]),
  retiredHistory: new Map([...completeAuthoringFixtures, [typesModule, (completeAuthoringFixtures.get(typesModule) ?? "").replace('tag: "playedThisTurn"', 'tag: "playedThisTrun"')]]),
};
const contractModule = (state: string, module: string) => `inventory-contracts/${state}/${module}`;
const contractResolver = inventoryCapabilityResolver(new Map(Object.entries(contractSources).flatMap(([state, sources]) =>
  [...sources].map(([module, source]) => [contractModule(state, module), source]))));
const fixtureResolver = (state: keyof typeof contractSources) => {
  const scoped = (forms: readonly InventoryCapabilityForm[]) => forms.map(form => ({ ...form, module: contractModule(state, form.module) }));
  return Object.assign((forms: readonly InventoryCapabilityForm[]) => contractResolver(scoped(forms)), {
    validate: (forms: readonly InventoryCapabilityForm[]) => contractResolver.validate(scoped(forms)),
  });
};

const intendedResolver = inventoryCapabilityResolver(completeAuthoringFixtures);

// Intended API target contracts are independent of lifecycle declarations.
const intendedBinding = (form: InventoryCapabilityForm): InventoryCapabilityForm => {
  const { pending: _pending, ...binding } = form;
  return binding;
};

describe("inventory descriptor contracts", () => {
  it("requires actual first-occasion descriptors beyond source-local oncePerTurn", () => {
    const first = inventoryDslCapabilities.find(entry => entry.name === "firstTimeEachTurn");
    expect(first).toBeDefined();
    expect(fixtureResolver("firstOccasion")(first?.forms.filter(form => form.module === typesModule) ?? [])).toBe(false);
  });

  it("covers every actual descriptor with an independent intended authoring fixture", () => {
    expect(inventoryDslCapabilities.map(entry => entry.name).sort()).toEqual([...expectedCapabilityNames].sort());
    expect(inventoryDslCapabilities.flatMap(entry => entry.forms).every(form => completeAuthoringFixtures.has(form.module))).toBe(true);
    expect(minimalApiFixtures.map(([name]) => name).sort()).toEqual([...expectedCapabilityNames].sort());
  });

  it.each(inventoryDslCapabilities)("resolves $name on its intended synthetic module/export/form", ({ name, forms }) => {
    const scopedForms = forms.map(form => ({ ...intendedBinding(form), module: scopedModule(name, form.module) }));
    for (const form of scopedForms) expect(minimalResolver.validate([form])).toBe(true);
    expect(minimalResolver.validate(scopedForms)).toBe(true);
  });

  it("keeps every binding valid when representation discriminator fields are renamed", () => {
    const resolver = fixtureResolver("renamedRepresentation");
    expect(inventoryDslCapabilities.map(entry => resolver.validate(entry.forms.map(intendedBinding)))).toEqual(expectedCapabilityNames.map(() => true));
  });

  it("requires the actual void option and tracks its pending stage precisely", () => {
    const capability = inventoryDslCapabilities.find(entry => entry.name === "costModifierNthOrigin")!;
    const form = capability.forms[0];
    const absent = fixtureResolver("voidAbsent");
    expect(absent.validate([{ ...form, pending: "option" }])).toBe(false);
    expect(() => absent.validate([intendedBinding(form)])).toThrow();
    const wrong = fixtureResolver("voidWrong");
    expect(wrong([intendedBinding(form)])).toBe(false);
    const exact = fixtureResolver("voidExact");
    expect(exact.validate([intendedBinding(form)])).toBe(true);
    expect(() => exact.validate([{ ...form, pending: "option" }])).toThrow();
  });

  it("distinguishes own-card subtype overrides from selector/conditional-figment remaps", () => {
    const absent = fixtureResolver("subtypeAbsent");
    const c12 = inventoryDslCapabilities.find(entry => entry.name === "typeRemap");
    expect(c12).toBeDefined();
    expect(absent(c12?.forms ?? [])).toBe(false);
    expect(() => absent.validate(c12?.forms ?? [])).toThrow();
    const present = fixtureResolver("subtypePresent");
    expect(present.validate(c12?.forms ?? [])).toBe(true);
  });

  it("diagnoses missing modules and stale exported names instead of projecting missing capabilities", () => {
    expect(() => intendedResolver.validate([{ ...build("missing"), module: "missing/module.ts" }])).toThrow();
    expect(() => intendedResolver.validate([{ module: "src/engine/dsl/builders.ts", symbol: "randomFrom", kind: "builder" }])).toThrow();
    expect(() => intendedResolver.validate([{ module: "src/engine/dsl/types.ts", symbol: "MissingType", kind: "form", pending: "option" }])).toThrow();
    expect(() => intendedResolver.validate([])).toThrow();
  });

  it("diagnoses semantic API renames while accepting explicit rebound metadata", () => {
    const renamed = fixtureResolver("semanticRename");
    expect(() => renamed.validate([form("Selector", { option: "bound" })])).toThrow();
    expect(renamed.validate([form("Selector", { option: "renamedBound" })])).toBe(true);
  });

  it("permits only the declared missing stage for intentional pending features", () => {
    const resolver = fixtureResolver("pending");
    expect(resolver.validate([{ ...form("Action", { member: "future" }), pending: "member" }])).toBe(false);
    expect(resolver.validate([{ ...form("Action", { option: "future" }), pending: "option" }])).toBe(false);
    expect(resolver.validate([{ ...build("future"), pending: "export" }])).toBe(false);
    expect(() => resolver.validate([{ ...form("Missing", { member: "future" }), pending: "member" }])).toThrow();
    expect(() => resolver.validate([{ ...form("Pending"), pending: "option" }])).toThrow();
    expect(() => resolver.validate([form("Present", { option: "from", optionLiteral: "void", pending: "option" })])).toThrow();
    for (const option of ["unusable", "unknown", "untyped"]) {
      expect(() => resolver.validate([form("Present", { option, pending: "option" })])).toThrow();
    }
    expect(() => resolver.validate([{ ...form("Action", { member: "absent", option: "future" }), pending: "option" }])).toThrow();
  });

  it("validates every alternative so a working branch cannot mask a stale binding", () => {
    expect(() => intendedResolver.validate([
      { module: "src/engine/dsl/types.ts", symbol: "FunctionalZone", kind: "form" },
      { module: "src/engine/dsl/types.ts", symbol: "OldZone", kind: "form" },
    ])).toThrow();
  });
});


const pendingBindings = inventoryDslCapabilities.flatMap(entry => entry.forms
  .filter(form => form.pending !== undefined)
  .map(form => ({ name: entry.name, symbol: form.symbol, form })));

if (pendingBindings.length > 0) describe("pending inventory lifecycle", () => {
  it.each(pendingBindings)("requires retirement for fulfilled $name ($symbol)", ({ name, form }) => {
    const scoped = { ...form, module: scopedModule(name, form.module) };
    expect(() => minimalResolver.validate([scoped])).toThrow();
  });
});


const lifecyclePrefix = "inventory-lifecycle";
const lifecycleSources = new Map([
  [`${lifecyclePrefix}/missing.ts`, 'export type Action = { kind: "other" }; export interface Options {} export type Speed = "standard";'],
  [`${lifecyclePrefix}/present.ts`, 'export function operation() {} export type Action = { kind: "feature" }; export interface Options { feature?: number } export type Speed = "standard" | "feature";'],
  [`${lifecyclePrefix}/renamed.ts`, 'export function renamed() {} export type Action = { kind: "renamed" }; export interface Options { renamed?: number } export type Speed = "standard" | "renamed";'],
  [`${lifecyclePrefix}/removed.ts`, 'export type Action = { kind: "other" }; export interface Options {} export type Speed = "standard";'],
]);
const lifecycleResolver = inventoryCapabilityResolver(lifecycleSources);
const lifecycleForms: readonly InventoryCapabilityForm[] = [
  { module: `${lifecyclePrefix}/present.ts`, symbol: "operation", kind: "builder", pending: "export" },
  { module: `${lifecyclePrefix}/present.ts`, symbol: "Action", kind: "form", member: "feature", pending: "member" },
  { module: `${lifecyclePrefix}/present.ts`, symbol: "Options", kind: "form", option: "feature", pending: "option" },
  { module: `${lifecyclePrefix}/present.ts`, symbol: "Speed", kind: "form", literal: "feature", pending: "literal" },
];

describe("declared capability lifecycle", () => {
  it.each(lifecycleForms)("requires explicit retirement of the $pending declaration", (marked) => {
    const missing = { ...marked, module: `${lifecyclePrefix}/missing.ts` };
    expect(lifecycleResolver.validate([missing])).toBe(false);
    expect(() => lifecycleResolver.validate([marked])).toThrow();
    expect(() => lifecycleResolver.validate([marked, { module: `${lifecyclePrefix}/present.ts`, symbol: "Speed", kind: "form", literal: "standard" }])).toThrow();
    const retired = intendedBinding(marked);
    expect(lifecycleResolver.validate([retired])).toBe(true);
    for (const state of ["renamed", "removed"]) {
      expect(() => lifecycleResolver.validate([{ ...retired, module: `${lifecyclePrefix}/${state}.ts` }])).toThrow();
    }
  });

  it("diagnoses a retired history alternative even while its sibling binding remains available", () => {
    const history = inventoryDslCapabilities.find(entry => entry.name === "turnHistory");
    expect(history).toBeDefined();
    const retired = history?.forms.map(intendedBinding) ?? [];
    expect(intendedResolver.validate(retired)).toBe(true);
    const resolver = fixtureResolver("retiredHistory");
    const workingSibling = retired.find(form => form.symbol === "Condition");
    expect(workingSibling).toBeDefined();
    expect(resolver.validate(workingSibling === undefined ? [] : [workingSibling])).toBe(true);
    expect(() => resolver.validate(retired)).toThrow();
  });
});
