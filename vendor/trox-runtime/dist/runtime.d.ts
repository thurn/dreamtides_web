import { type NumberFormat } from "./number-format.js";
import { AnnotatedLocalizedString, LocalizedString, type ArgumentInput, type ArgumentSchema, type IdentityDescriptor, type PluralCategory } from "./authoring.js";
export { TroxDeserializeError, TroxResolveError, TroxValueError } from "./errors.js";
export { formatNumber, type NumberFormat } from "./number-format.js";
export { canonicalJson } from "./canonical-json.js";
export type { ArgumentSchema } from "./authoring.js";
export interface BundleTermSurface {
    readonly origin_locale: string;
    readonly text: string;
}
export type BundleTermForm = {
    readonly kind: "scalar";
    readonly origin_locale: string;
    readonly text: string;
} | {
    readonly kind: "number";
    readonly values: Partial<Record<PluralCategory, BundleTermSurface>>;
};
export interface BundleTerm {
    readonly facets: Readonly<Record<string, string>>;
    readonly forms: Readonly<Record<string, BundleTermForm>>;
}
export interface ExpansionDescriptor {
    readonly entry_signature: string;
    readonly path: readonly unknown[];
}
export interface BundleRow {
    readonly expansion: ExpansionDescriptor;
    readonly origin_locale: string;
    readonly translation: string;
}
export interface BundleEntry {
    readonly arguments?: Readonly<Record<string, ArgumentSchema>>;
    readonly contract_signature?: string;
    readonly source_signature: string;
    readonly rows: Readonly<Record<string, BundleRow>>;
    readonly identity?: IdentityDescriptor;
}
export interface Bundle {
    readonly cldr_version: string;
    readonly direction: "ltr" | "rtl";
    readonly entries: Readonly<Record<string, BundleEntry>>;
    readonly fallback_chain: readonly string[];
    readonly fallbacks_flattened: true;
    readonly format: "trox-bundle";
    readonly isolation: "isolate" | "none";
    readonly locale: string;
    readonly message_facets: readonly string[];
    readonly number_format: NumberFormat;
    readonly plural_rules: {
        readonly cardinal: Partial<Record<PluralCategory, string>>;
        readonly ordinal: Partial<Record<PluralCategory, string>>;
    };
    readonly source_catalog_fingerprint: string;
    readonly source_locale: string;
    readonly terms: Readonly<Record<string, BundleTerm>>;
    readonly version: {
        readonly major: 1;
        readonly minor: 0 | 1;
    };
}
export interface SourceMessageRef {
    readonly contract_signature: string;
    readonly entry_id: string;
    readonly format: "trox-source-message-ref";
    readonly source_signature: string;
    readonly version: {
        readonly major: 1;
        readonly minor: 0;
    };
}
export interface Diagnostic {
    readonly code: string;
    readonly entry_id?: string;
    readonly message: string;
}
/** One display-ready run produced from a localized message. */
export type ResolvedLocalizedPart<T> = {
    readonly kind: "literal";
    readonly value: string;
} | {
    readonly kind: "placeholder";
    readonly name: string;
    readonly value: string;
    readonly annotation?: T;
};
/** Structured resolution plus whether the complete message used source fallback. */
export interface ResolvedLocalizedPartsOutcome<T> {
    readonly parts: readonly ResolvedLocalizedPart<T>[];
    readonly usedSourceFallback: boolean;
}
export declare class SourceCatalog {
    #private;
    readonly fingerprint: string;
    constructor(source: Bundle);
    localizedStringFromJSON(input: string): LocalizedString;
    sourceMessageFromValue(input: unknown): SourceMessage;
    sourceMessageFromJSON(input: string): SourceMessage;
}
export declare class SourceMessage {
    #private;
    get argumentSchemas(): Readonly<Record<string, ArgumentSchema>>;
    get sourceRef(): SourceMessageRef;
    bind(inputs: Readonly<Record<string, ArgumentInput>>): LocalizedString;
}
export declare class Localizer {
    #private;
    constructor(target: Bundle, source: Bundle, options?: {
        readonly strict?: boolean;
        readonly diagnostic?: (diagnostic: Diagnostic) => void;
    });
    get sourceCatalog(): SourceCatalog;
    localizedStringFromJSON(input: string): LocalizedString;
    resolveChecked(value: LocalizedString): string;
    resolve(value: LocalizedString): string;
    /** Resolves an annotated value through the target row and returns the first failure. */
    resolvePartsChecked<T>(value: AnnotatedLocalizedString<T>): readonly ResolvedLocalizedPart<T>[];
    /** Resolves an annotated value with the same diagnostics and source recovery as resolve(). */
    resolveParts<T>(value: AnnotatedLocalizedString<T>): readonly ResolvedLocalizedPart<T>[];
    /** Resolves structured parts and reports whether the complete message used source fallback. */
    resolvePartsOutcome<T>(value: AnnotatedLocalizedString<T>): ResolvedLocalizedPartsOutcome<T>;
    private resolveValuePartsChecked;
    private resolveValueParts;
    private targetRow;
    private interpolateParts;
    private argumentSurface;
    private interpolatePartsRecovering;
    private isolate;
    private termSurface;
    private emit;
    private report;
}
export declare function bundleFromCanonicalJSON(input: string): Bundle;
