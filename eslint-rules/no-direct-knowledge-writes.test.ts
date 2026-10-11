import { RuleTester } from "eslint";
import tsParser from "@typescript-eslint/parser";
import { describe, it } from "vitest";
import rule from "./no-direct-knowledge-writes.js";

RuleTester.describe = describe;
RuleTester.it = it;

const ruleTester = new RuleTester({
  languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: "module" },
});

const write = [{ messageId: "write" }];

ruleTester.run("no-direct-knowledge-writes", rule, {
  valid: [
    { name: "reading knowledge", code: `export const f = (state: S, side: Side, id: Id) => state.knownTo[side].includes(id);` },
    { name: "copying knowledge into a new list", code: `export function f(state: S) { const known = new Set(state.knownTo.player); known.add(1); return [...state.knownTo.enemy]; }` },
    { name: "a derived list", code: `export function f(state: S) { const kept = state.knownTo.player.filter((id) => id !== 1); kept.push(2); return kept; }` },
    { name: "building a state with new knowledge", code: `export const f = (state: S) => ({ ...state, knownTo: { player: [], enemy: [...state.knownTo.enemy] } });` },
    { name: "a local record named knownTo", code: `export function f() { const knownTo: Record<Side, Id[]> = { player: [], enemy: [] }; knownTo.player.push(1); return knownTo; }` },
    { name: "rebinding an alias", code: `export function f(state: S, other: Id[]) { let known = state.knownTo.player; known = other; return known; }` },
    { name: "a helper call", code: `export function f(state: S, deck: Id[]) { forgetShuffledDeck(state, deck); }` },
    { name: "Object.assign into a fresh object", code: `export const f = (state: S) => Object.assign({}, state.knownTo);` },
    { name: "a mutating call on another field", code: `export function f(state: S) { state.sides.player.deck.push(1); }` },
  ],
  invalid: [
    { name: "assigning a side's list", code: `export function f(state: S, side: Side) { state.knownTo[side] = []; }`, errors: write },
    { name: "assigning the whole record", code: `export function f(state: S) { state.knownTo = { player: [], enemy: [] }; }`, errors: write },
    { name: "a named side by string key", code: `export function f(state: S) { state["knownTo"].player = []; }`, errors: write },
    { name: "an element", code: `export function f(state: S) { state.knownTo.player[0] = 1; }`, errors: write },
    { name: "truncating", code: `export function f(state: S) { state.knownTo.player.length = 0; }`, errors: write },
    { name: "compound assignment", code: `export function f(state: S) { state.knownTo.player.length -= 1; }`, errors: write },
    { name: "an update expression", code: `export function f(state: S) { state.knownTo.player.length++; }`, errors: write },
    { name: "delete", code: `export function f(state: S) { delete state.knownTo.player; }`, errors: write },
    { name: "push", code: `export function f(state: S, side: Side) { state.knownTo[side].push(1); }`, errors: write },
    { name: "splice on a cast", code: `export function f(state: S) { (state.knownTo.player as number[]).splice(0, 1); }`, errors: write },
    { name: "sort", code: `export function f(state: S) { state.knownTo.enemy.sort(); }`, errors: write },
    { name: "optional chaining", code: `export function f(state?: S) { state?.knownTo.player.push(1); }`, errors: write },
    { name: "Object.assign into knowledge", code: `export function f(state: S) { Object.assign(state.knownTo, { player: [] }); }`, errors: write },
    { name: "destructuring into knowledge", code: `export function f(state: S, next: S) { ({ player: state.knownTo.player } = next.knownTo); }`, errors: write },
    { name: "through a nested state", code: `export function f(slice: { committed: S }) { slice.committed.knownTo.enemy = []; }`, errors: write },
    { name: "an aliased list", code: `export function f(state: S, side: Side) { const known = state.knownTo[side]; known.push(1); }`, errors: write },
    { name: "an aliased record", code: `export function f(state: S) { const record = state.knownTo; record.player = []; }`, errors: write },
    { name: "an alias of an alias", code: `export function f(state: S) { const a = state.knownTo; const b = a.player; b.unshift(1); }`, errors: write },
    { name: "an alias assigned later", code: `export function f(state: S) { let known: number[]; known = state.knownTo.player; known[0] = 1; }`, errors: write },
    { name: "a destructured record", code: `export function f(state: S) { const { knownTo } = state; knownTo.player.pop(); }`, errors: write },
    { name: "a renamed destructured record", code: `export function f(state: S) { const { knownTo: known } = state; known.enemy = []; }`, errors: write },
    { name: "a destructured list", code: `export function f(state: S) { const { player } = state.knownTo; player.shift(); }`, errors: write },
    { name: "a nested destructure", code: `export function f(state: S) { const { knownTo: { enemy } } = state; enemy.fill(1); }`, errors: write },
  ],
});
