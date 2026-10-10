// @vitest-environment node

import { describe, expect, it } from "vitest";
import { analyzeModule, findCycleHazards } from "./import-cycles.mjs";

/**
 * Analyzes synthetic modules named `/<name>.ts`, whose relative specifiers
 * `./<name>` resolve among themselves.
 *
 * @param {Record<string, string>} sources
 */
function check(sources) {
  /** @type {Map<string, import("./import-cycles.mjs").ModuleFacts>} */
  const modules = new Map();
  for (const [name, source] of Object.entries(sources)) {
    const path = `/${name}.ts`;
    modules.set(
      path,
      analyzeModule(path, source, (specifier) => {
        const target = `/${specifier.replace(/^\.\//, "")}.ts`;
        return specifier.startsWith("./") && `${specifier.slice(2)}` in sources
          ? target
          : null;
      }),
    );
  }
  const { cycles, hazards } = findCycleHazards(modules);
  return {
    cycles,
    hazards: hazards.map(({ reader, target }) => `${reader} -> ${target}`),
  };
}

describe("import cycle hazards", () => {
  it("allows a cycle whose modules reference each other only inside functions", () => {
    expect(
      check({
        a: 'import { b } from "./b";\nexport function a() { return b(); }',
        b: 'import { a } from "./a";\nexport const b = () => a();',
      }),
    ).toEqual({ cycles: [["/a.ts", "/b.ts"]], hazards: [] });
  });

  it("reports a module-level read of a cycle partner", () => {
    expect(
      check({
        a: 'import { B } from "./b";\nexport const A = [B];',
        b: 'import { a } from "./a";\nexport const B = 1;\nexport function a2() { return a; }',
      }).hazards,
    ).toEqual(["/a.ts -> /b.ts"]);
  });

  it("allows module-level reads when no cycle joins the modules", () => {
    expect(
      check({
        a: 'import { B } from "./b";\nexport const A = [B];',
        b: "export const B = 1;",
      }),
    ).toEqual({ cycles: [], hazards: [] });
  });

  it("ignores type-only imports and re-exports", () => {
    expect(
      check({
        a: 'import type { B } from "./b";\nimport { type C } from "./b";\nexport const A: B | C = 1;',
        b: 'import { A } from "./a";\nexport type B = number;\nexport type C = number;\nexport type { A as D } from "./a";\nexport const E = A;',
      }),
    ).toEqual({ cycles: [], hazards: [] });
  });

  it("reports a namespace object built from re-exports inside a cycle", () => {
    const sources = {
      registry: 'import * as all from "./index";\nexport function find(key: string) { return (all as Record<string, unknown>)[key]; }',
      index: 'export * from "./member";',
      member: 'import { find } from "./registry";\nexport const value = { run: () => find("value") };',
    };
    expect(check(sources).hazards).toEqual(["/index.ts -> /member.ts"]);
  });

  it("allows namespace member reads inside functions", () => {
    expect(
      check({
        registry: 'import * as all from "./index";\nexport function find() { return all.value; }',
        index: 'export * from "./member";',
        member: 'import { find } from "./registry";\nexport const value = { run: () => find() };',
      }).hazards,
    ).toEqual([]);
  });

  it("allows getters and methods that read cycle partners", () => {
    expect(
      check({
        table: 'import { entry } from "./entry";\nexport const TABLE = { get entry() { return entry; }, read() { return entry; } };',
        entry: 'import { TABLE } from "./table";\nexport const entry = { lookup: () => TABLE };',
      }).hazards,
    ).toEqual([]);
  });

  it("reports callbacks handed to a module-level call", () => {
    expect(
      check({
        a: 'import { B } from "./b";\nexport const A = [1].map(() => B);',
        b: 'import { A } from "./a";\nexport const B = 1;\nexport function f() { return A; }',
      }).hazards,
    ).toEqual(["/a.ts -> /b.ts"]);
  });

  it("follows local declarations that a module-level expression names", () => {
    expect(
      check({
        a: 'import { B } from "./b";\nfunction build() { return B; }\nexport const A = build();',
        b: 'import { A } from "./a";\nexport const B = 1;\nexport function f() { return A; }',
      }).hazards,
    ).toEqual(["/a.ts -> /b.ts"]);
  });

  it("reports static class members and allows instance members", () => {
    const partner = 'import { Holder } from "./a";\nexport const B = 1;\nexport function f() { return Holder; }';
    expect(
      check({
        a: 'import { B } from "./b";\nexport class Holder { value = B; method() { return B; } }',
        b: partner,
      }).hazards,
    ).toEqual([]);
    expect(
      check({
        a: 'import { B } from "./b";\nexport class Holder { static value = B; }',
        b: partner,
      }).hazards,
    ).toEqual(["/a.ts -> /b.ts"]);
  });

  it("reports a read through a barrel that re-exports a cycle partner", () => {
    expect(
      check({
        a: 'import { B } from "./barrel";\nexport const A = B;',
        barrel: 'export { B } from "./b";',
        b: 'import { A } from "./a";\nexport const B = 1;\nexport function f() { return A; }',
      }).hazards,
    ).toEqual(["/a.ts -> /b.ts", "/a.ts -> /barrel.ts"]);
  });
});
