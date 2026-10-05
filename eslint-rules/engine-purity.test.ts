import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, it } from "vitest";
import rule from "./engine-purity.js";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: "module" },
});

ruleTester.run("engine-purity", rule, {
  valid: [
    { name: "module constants", code: `export const LIMIT = 10; const KINDS = ["a", "b"] as const;` },
    { name: "local mutable state", code: `export function f() { let total = 0; const seen = new Map(); seen.set("a", 1); total += 1; return total; }` },
    { name: "mutating a parameter that shadows nothing", code: `export function f(state: { list: number[] }) { state.list.push(1); }` },
    { name: "a shadowing local with a module name", code: `const items = [1]; export function f() { const items: number[] = []; items.push(2); return items; }` },
    { name: "reading a module constant", code: `const TABLE = [1, 2]; export function f() { return TABLE.map((x) => x * 2); }` },
  ],
  invalid: [
    { name: "a top-level let", code: `let counter = 0; export const read = () => counter;`, errors: [{ messageId: "mutableBinding" }] },
    { name: "a top-level Map", code: `const cache = new Map<string, number>(); export const read = () => cache.size;`, errors: [{ messageId: "mutableValue" }] },
    { name: "mutating a module array from a function", code: `const seen: number[] = []; export function f() { seen.push(1); }`, errors: [{ messageId: "mutation" }] },
    { name: "assigning into a module object", code: `const state = { n: 0 }; export function f() { state.n = 1; }`, errors: [{ messageId: "mutation" }] },
    { name: "Math.random", code: `export const roll = () => Math.random();`, errors: [{ messageId: "random" }] },
    { name: "Date.now", code: `export const now = () => Date.now();`, errors: [{ messageId: "clock" }] },
    { name: "new Date()", code: `export const now = () => new Date();`, errors: [{ messageId: "clock" }] },
    { name: "performance.now", code: `export const now = () => performance.now();`, errors: [{ messageId: "clock" }] },
  ],
});
