export declare const MAX_SAFE_SELECTOR_INTEGER = 9007199254740991;
export declare const PLACEHOLDER: RegExp;
export declare const CATEGORIES: readonly ["zero", "one", "two", "few", "many", "other"];
export type PluralCategory = (typeof CATEGORIES)[number];
export type SelectorKey = string | boolean;
export declare function assertStableId(value: unknown, label: string): asserts value is string;
export declare function assertSelectorInteger(value: number): void;
export declare function assertNfc(value: string, label: string): void;
export interface TextPattern {
    readonly kind: "text";
    readonly text: string;
}
export interface ExactKey {
    readonly exact: number;
}
export interface PluralKey {
    readonly plural: PluralCategory;
}
export interface OrdinalKey {
    readonly ordinal: PluralCategory;
}
export type NumericKey = ExactKey | PluralKey | OrdinalKey;
export interface NumericIdentityBranch {
    readonly key: NumericKey;
    readonly pattern: Pattern;
}
export interface PluralPattern {
    readonly kind: "plural";
    readonly branches: readonly NumericIdentityBranch[];
}
export interface OrdinalPattern {
    readonly kind: "ordinal";
    readonly branches: readonly NumericIdentityBranch[];
}
export interface WhenIdentityBranch {
    readonly role: "when";
    readonly pattern: Pattern;
}
export interface OtherwiseIdentityBranch {
    readonly role: "otherwise";
    readonly pattern: Pattern;
}
export interface SelectPattern {
    readonly kind: "select";
    readonly branches: readonly (WhenIdentityBranch | OtherwiseIdentityBranch)[];
}
export type Pattern = TextPattern | PluralPattern | OrdinalPattern | SelectPattern;
export interface IdentityDescriptor {
    readonly identity_version: 1;
    readonly meaning: string | null;
    readonly pattern: Pattern;
}
export interface PluralSelectorRecord {
    readonly kind: "plural";
    readonly path: readonly number[];
    readonly value: number;
}
export interface OrdinalSelectorRecord {
    readonly kind: "ordinal";
    readonly path: readonly number[];
    readonly value: number;
}
export interface SelectSelectorRecord {
    readonly branch_keys: readonly SelectorKey[];
    readonly kind: "select";
    readonly path: readonly number[];
    readonly value: SelectorKey;
}
export type SelectorRecord = PluralSelectorRecord | OrdinalSelectorRecord | SelectSelectorRecord;
interface PatternValue {
    readonly pattern: Pattern;
    readonly selectors: readonly SelectorRecord[];
    readonly meaning: string | null;
}
type PatternInput = string | PatternValue;
type NumericArmKey = {
    readonly exact: number;
} | {
    readonly category: PluralCategory;
};
interface NumericArm {
    readonly key: NumericArmKey;
    readonly value: PatternValue;
}
export declare function exact(value: number, pattern: PatternInput): NumericArm;
export declare const zero: (pattern: PatternInput) => NumericArm;
export declare const one: (pattern: PatternInput) => NumericArm;
export declare const two: (pattern: PatternInput) => NumericArm;
export declare const few: (pattern: PatternInput) => NumericArm;
export declare const many: (pattern: PatternInput) => NumericArm;
export declare const other: (pattern: PatternInput) => NumericArm;
export declare function plural(value: number, branches: readonly NumericArm[]): PatternValue;
export declare function ordinal(value: number, branches: readonly NumericArm[]): PatternValue;
interface WhenArm<K extends SelectorKey> {
    readonly role: "when";
    readonly key: K;
    readonly value: PatternValue;
}
interface OtherwiseArm {
    readonly role: "otherwise";
    readonly value: PatternValue;
}
type SelectArm<K extends SelectorKey = SelectorKey> = WhenArm<K> | OtherwiseArm;
export declare function when<K extends SelectorKey>(key: K, pattern: PatternInput): WhenArm<K>;
export declare function otherwise(pattern: PatternInput): OtherwiseArm;
type FiniteSelector<K extends SelectorKey> = K extends string ? string extends K ? never : K : K;
export declare function select<K extends SelectorKey>(value: FiniteSelector<K>, branches: readonly SelectArm<K>[]): PatternValue;
export declare function meaning(meaningId: string, pattern: PatternInput): PatternValue;
export declare class TermId {
    readonly value: string;
    private readonly _termIdBrand;
    constructor(value: string);
}
export declare function termId(value: string): TermId;
export interface TextArgument {
    readonly kind: "text";
    readonly value: string;
}
export interface NumberArgument {
    readonly kind: "number";
    readonly value: number;
}
export interface BooleanArgument {
    readonly kind: "boolean";
    readonly value: boolean;
}
export interface TermArgument {
    readonly kind: "term";
    readonly term_id: string;
    readonly form?: string;
    readonly number?: number;
}
export interface OpaqueArgument {
    readonly kind: "opaque";
    readonly value: LocalizedStringWire;
}
export type Argument = TextArgument | NumberArgument | BooleanArgument | TermArgument | OpaqueArgument;
export type ArgumentInput = string | number | boolean | TermArgument | OpaqueArgument;
export type ArgumentSchema = {
    readonly kind: "scalar";
} | {
    readonly kind: "opaque";
} | {
    readonly kind: "term";
    readonly form?: string;
    readonly number: boolean;
};
declare class TermBuilder {
    readonly id: TermId;
    readonly formId: string | undefined;
    readonly numberValue: number | undefined;
    constructor(id: TermId, formId?: string, numberValue?: number);
    form(formId: string): TermBuilder;
    number(number: number): TermArgument;
    finish(): TermArgument;
}
export declare function term(id: TermId): TermBuilder;
export declare function indefinite(id: TermId): TermArgument;
export declare function counted(id: TermId, number: number): TermArgument;
export declare function opaque(value: LocalizedString): OpaqueArgument;
export interface LocalizedStringWire {
    readonly arguments: Readonly<Record<string, Argument>>;
    readonly contract_signature?: string;
    readonly entry_id: string;
    readonly format: "trox-localized-string";
    readonly identity: IdentityDescriptor;
    readonly selectors: readonly SelectorRecord[];
    readonly source_signature: string;
    readonly version: {
        readonly major: 1;
        readonly minor: 0 | 1;
    };
}
export declare class LocalizedString {
    #private;
    private constructor();
    get entryId(): string;
    get sourceSignature(): string;
    get contractSignature(): string;
    get identity(): IdentityDescriptor;
    get arguments(): Readonly<Record<string, Argument>>;
    get selectors(): readonly SelectorRecord[];
    isAtomic(): boolean;
    toCanonicalJSON(): string;
    wireValue(): LocalizedStringWire;
    toString(): never;
    [Symbol.toPrimitive](): never;
}
export declare function tx(pattern: PatternInput, description: string): LocalizedString;
export declare function txa(pattern: PatternInput, inputs: Readonly<Record<string, ArgumentInput>>, description: string): LocalizedString;
/**
 * Asserts that runtime text is appropriate to display without translation.
 * Intended for migrations, verbatim user input, tests, and developer surfaces.
 * Calls are ignored by source extraction.
 */
export declare function assertLocalized(rawString: string): LocalizedString;
export declare function validateArgumentMap(pattern: Pattern, argumentsValue: Readonly<Record<string, Argument>>): void;
export declare function validateIdentity(identity: IdentityDescriptor): void;
export declare function parsePlaceholders(text: string): string[];
export declare function collectPatternPlaceholders(pattern: Pattern): string[];
export declare function validateSelectorRecords(pattern: Pattern, records: readonly SelectorRecord[]): void;
export {};
