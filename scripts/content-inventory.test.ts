import { describe, expect, it } from "vitest";
import { classifyInventoryText, inventoryCapabilityResolver, type InventoryCapabilityForm } from "./content-inventory";

const requirements = (text: string) => {
  const classified = classifyInventoryText(text);
  return { ...classified, needs: [...classified.requiredPrimitives.existing, ...classified.requiredPrimitives.new] };
};

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
const resolveForms = (source: string) => inventoryCapabilityResolver(new Map([[moduleName, source]]));
const build = (symbol: string): InventoryCapabilityForm => ({ module: moduleName, symbol, kind: "builder" });
const form = (symbol: string, options: Omit<InventoryCapabilityForm, "module" | "symbol" | "kind"> = {}): InventoryCapabilityForm => ({ module: moduleName, symbol, kind: "form", ...options });

describe("inventory exported capabilities", () => {
  it("resolves callable exports, aliases and type-only reexports without executing modules", () => {
    const resolver = inventoryCapabilityResolver(new Map([
      [moduleName, 'export { create as alias } from "./implementation"; export type { Action as Reexported } from "./implementation";'],
      ["inventory-fixtures/implementation.ts", 'export function create() { throw new Error("must not execute"); } export type Action = { representation: "return" };'],
    ]));
    expect(resolver([build("alias")])).toBe(true);
    expect(resolver([form("Reexported", { member: "return" })])).toBe(true);
  });

  it("rejects missing modules/exports, private declarations and noncallable values", () => {
    const resolver = resolveForms('function hidden() {} export const value = 4; interface Private { feature?: boolean } export type Broken = Unavailable; export type Pending = never;');
    expect(resolver([build("hidden")])).toBe(false);
    expect(resolver([build("value")])).toBe(false);
    expect(resolver([form("Private")])).toBe(false);
    expect(resolver([form("Broken")])).toBe(false);
    expect(resolver([form("Pending")])).toBe(false);
    expect(resolver([{ ...build("value"), module: "inventory-fixtures/missing.ts" }])).toBe(false);
  });

  it("keeps every supported descriptor stable under representation-field rename and reformatting", () => {
    const descriptors = [build("pay"), form("Payment", { member: "return" }), form("Trigger", { member: "draw", option: "filter" }), form("Trigger", { member: "draw", option: "from", optionLiteral: "void" }), form("Speed", { literal: "fast" }), form("Options", { option: "once" }), form("Zone")];
    const old = resolveForms('export function pay() {} export type Payment = { cost: "return"; count: number }; export type Trigger = { on: "draw"; filter?: object; from?: "void" }; export type Speed = "standard" | "fast"; export interface Options { once?: boolean } export type Zone = "hand" | "deck";');
    const changed = resolveForms(`export function pay () { }
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
    `);
    expect(descriptors.map(descriptor => old([descriptor]))).toEqual([true, true, true, true, true, true, true]);
    expect(descriptors.map(descriptor => changed([descriptor]))).toEqual([true, true, true, true, true, true, true]);
  });

  it("requires the semantic option on the matching registered variant, not merely its generic builder", () => {
    const resolver = resolveForms(`export function generic() {}
      export type Trigger = { event: "play"; filter?: object; ordinal?: number; from?: "hand" }
        | { event: "draw"; filter?: never };
      export interface Selector { controller: "any"; }
    `);
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
    const resolver = resolveForms('export interface Base { limited?: boolean } export interface Extended extends Base { unrelated?: string } export type Alias = Extended;');
    expect(resolver([form("Extended", { option: "limited" })])).toBe(true);
    expect(resolver([form("Alias", { option: "limited" })])).toBe(true);
    expect(resolver([form("Extended", { option: "missing" })])).toBe(false);
  });

  it("keeps alternative forms independent and recognizes actual absence", () => {
    const resolver = resolveForms('export type Actual = { renamedTag: "present" };');
    expect(resolver([])).toBe(false);
    expect(resolver([form("Missing"), form("Actual", { member: "present" })])).toBe(true);
    expect(resolver([form("Missing"), form("Actual", { member: "absent" })])).toBe(false);
  });
});
