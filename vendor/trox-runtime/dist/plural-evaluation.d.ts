import type { PluralCategory } from "./authoring.js";
interface Relation {
    readonly operand: "n" | "i" | "fractional";
    readonly modulus?: number;
    readonly negate: boolean;
    readonly ranges: readonly (readonly [number, number])[];
}
type CompiledCondition = readonly (readonly Relation[])[];
export declare class CompiledPluralRules {
    #private;
    private constructor();
    static compile(rules: Partial<Record<PluralCategory, string>>): CompiledPluralRules | undefined;
    category(value: number): PluralCategory;
}
export declare function evaluatePluralCategory(rules: Partial<Record<PluralCategory, string>>, value: number): PluralCategory;
export declare function compilePluralCondition(rule: unknown): CompiledCondition | undefined;
export {};
