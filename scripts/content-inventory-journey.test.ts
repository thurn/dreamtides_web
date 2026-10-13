import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { inventoryCapabilityResolver, inventoryJourneyCapabilities, type InventoryCapabilityForm } from "./content-inventory";

// Public synthetic modules are physical temp-repository sources. Factories throw
// if executed: the inventory observes authoring availability without loading hooks.
const root = mkdtempSync(join(tmpdir(), "journey-inventory-"));
afterAll(() => rmSync(root, { recursive: true, force: true }));
const sources = new Map<string, string>();
const registryModule = "src/rules/journey/modifier-registry.ts";
const mappings = [
  ["journeyEssence", "journey-essence"], ["journeySites", "journey-sites"],
  ["journeyShop", "journey-shop"], ["journeyDraft", "journey-draft"],
  ["journeyPurge", "journey-purge"], ["journeyDuplication", "journey-duplication"],
  ["journeyTransfiguration", "journey-transfiguration"], ["journeyOnGain", "journey-on-gain"],
  ["journeyDeckEntry", "journey-deck-entry"], ["journeyBattleInit", "journey-battle-init"],
] as const;
const put = (scope: string, module: string, source: string): void => {
  const path = join(root, scope, module);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, source);
  sources.set(path, readFileSync(path, "utf8"));
};
const rebound = (scope: string, form: InventoryCapabilityForm): InventoryCapabilityForm => ({
  ...form, module: join(root, scope, form.module),
  ...(form.registration === undefined ? {} : { registration: {
    ...form.registration, module: join(root, scope, form.registration.module),
  } }),
});
const formsOf = (scope: string, name: string): readonly InventoryCapabilityForm[] => {
  const entry = inventoryJourneyCapabilities.find(entry => entry.name === name);
  if (entry === undefined) throw new Error(`Undeclared synthetic capability ${name}`);
  return entry.forms.map(form => rebound(scope, form));
};
const factory = (name: string): string => `export function ${name}(...args: unknown[]) { throw new Error("must not execute"); }`;
const constructor = "export function createJourneyModifierRegistry(definitions: unknown[]) { return definitions; }";
const registration = (name: string, file: string): string => `import { ${name} as hook } from "./${file}";
  ${constructor}
  export const journeyModifierRegistry = createJourneyModifierRegistry([hook({}, {})]);`;
for (const [name, file] of mappings) {
  put("supported", `src/rules/journey/${file}.ts`, factory(name));
}
put("supported", registryModule, `${mappings.map(([name, file]) => `import { ${name} } from "./${file}";`).join("\n")}
  ${constructor}
  export const journeyModifierRegistry = createJourneyModifierRegistry([${mappings.map(([name]) => `${name}({}, {})`).join(",")}]);`);

const rejected = ["missing-module", "missing-export", "noncallable", "unregistered", "private-registry", "wrong-factory", "shadowed-factory", "outside-registry", "noncallable-constructor", "wrong-constructor", "private-constructor", "renamed-constructor", "missing-registry", "non-array"] as const;
for (const [name, file] of mappings.slice(0, 2)) {
  for (const state of rejected) {
    const scope = `${name}/${state}`;
    if (state !== "missing-module") put(scope, `src/rules/journey/${file}.ts`, state === "missing-export" ? `function ${name}() {}` : state === "noncallable" ? `export const ${name} = 1;` : factory(name));
    let source = registration(name, file);
    if (state === "unregistered") source = `${constructor} export const journeyModifierRegistry = createJourneyModifierRegistry([]);`;
    if (state === "private-registry") source = source.replace("export const journeyModifierRegistry", "const journeyModifierRegistry");
    if (state === "wrong-factory") {
      put(scope, "src/rules/journey/unrelated.ts", factory(name));
      source = source.replace(`"./${file}"`, '"./unrelated"');
    }
    if (state === "shadowed-factory") source = source.replace("as hook", "as importedHook").replace(constructor, `${constructor} function hook(...args: unknown[]) { return args; }`);
    if (state === "renamed-constructor") source = source.replace(constructor, "export function renamed(definitions: unknown[]) { return definitions; }");
    if (state === "outside-registry") source = source.replace("[hook({}, {})]", "[]") + `\nhook({}, {}); // ${name}({}, {})\nconst text = "${name}({}, {})";`;
    if (state === "noncallable-constructor") source = source.replace(constructor, "export const createJourneyModifierRegistry = 1;");
    if (state === "wrong-constructor") source = source.replace("export const journeyModifierRegistry = createJourneyModifierRegistry", "function other(values: unknown[]) { return values; } export const journeyModifierRegistry = other");
    if (state === "private-constructor") source = source.replace("export function createJourneyModifierRegistry", "function createJourneyModifierRegistry");
    if (state === "non-array") source = source.replace("[hook({}, {})]", "hook({}, {})");
    if (state !== "missing-registry") put(scope, registryModule, source);
  }
  put(`${name}/aliased`, `src/rules/journey/${file}.ts`, `function implementation(...args: unknown[]) { throw new Error("must not execute"); } export { implementation as ${name} };`);
  put(`${name}/aliased`, registryModule, registration(name, file).replace(constructor, "function build(definitions: unknown[]) { return definitions; } export { build as createJourneyModifierRegistry };").replace("= createJourneyModifierRegistry", "= build"));
}
const resolver = inventoryCapabilityResolver(sources);

describe("public journey inventory bindings", () => {
  it("declares owning factory modules and the production registration seam", () => {
    expect(inventoryJourneyCapabilities.map(entry => entry.name).sort()).toEqual(mappings.map(([name]) => name).sort());
    for (const [name, file] of mappings) {
      const forms = inventoryJourneyCapabilities.find(entry => entry.name === name)?.forms;
      expect(forms).toEqual([{ module: `src/rules/journey/${file}.ts`, symbol: name, kind: "builder", registration: {
        module: registryModule, symbol: "journeyModifierRegistry", constructor: "createJourneyModifierRegistry",
      } }]);
    }
  });
  it.each(mappings)("recognizes registered callable %s without executing it", (name) => {
    expect(resolver.validate(formsOf("supported", name))).toBe(true);
  });
  it.each(mappings.slice(0, 2))("resolves exported and imported aliases for %s", (name) => {
    expect(resolver.validate(formsOf(`${name}/aliased`, name))).toBe(true);
  });
  it.each(mappings.slice(0, 2))("keeps incomplete or unrelated %s support unavailable", (name) => {
    for (const state of rejected) expect(resolver(formsOf(`${name}/${state}`, name)), state).toBe(false);
  });
  it("diagnoses an unregistered public builder", () => {
    expect(() => resolver.validate(formsOf("journeyEssence/unregistered", "journeyEssence"))).toThrow(/registration/u);
  });
  it("does not silently ignore registration on an incompatible type form", () => {
    const [form] = formsOf("supported", "journeyEssence");
    if (form === undefined) throw new Error("Missing synthetic factory form");
    expect(() => resolver.validate([{ ...form, kind: "form" }])).toThrow();
  });
  it("uses a fresh source snapshot after registration changes while retaining the original", () => {
    const forms = formsOf("supported", "journeyEssence");
    const changed = new Map(sources);
    changed.set(join(root, "supported", registryModule), `${constructor} export const journeyModifierRegistry = createJourneyModifierRegistry([]);`);
    expect(inventoryCapabilityResolver(changed)(forms)).toBe(false);
    expect(resolver(forms)).toBe(true);
    const original = sources.get(join(root, "supported", registryModule));
    if (original === undefined) throw new Error("Missing synthetic registry source");
    changed.set(join(root, "supported", registryModule), original);
    expect(inventoryCapabilityResolver(changed)(forms)).toBe(true);
  });
});
