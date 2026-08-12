import { blake3 } from "@noble/hashes/blake3.js";
import { base32, canonicalJson, comparePaths, deepFreeze, hex, sortRecord } from "./canonical-json.js";
import { TroxValueError } from "./errors.js";
import { assertWellFormedUnicode } from "./unicode.js";
export const MAX_SAFE_SELECTOR_INTEGER = 9_007_199_254_740_991;
const STABLE_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;
export const PLACEHOLDER = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;
export const CATEGORIES = ["zero", "one", "two", "few", "many", "other"];
/** @internal */
export const ASSERT_LOCALIZED_MEANING = "trox.assert-localized";
export function assertStableId(value, label) {
    if (typeof value !== "string" || new TextEncoder().encode(value).length > 96 || !STABLE_ID.test(value)) {
        throw new TroxValueError("trox.invalid-stable-id", `invalid ${label} \`${String(value)}\``);
    }
}
export function assertSelectorInteger(value) {
    if (!Number.isSafeInteger(value) || value < 0 || value > MAX_SAFE_SELECTOR_INTEGER) {
        throw new TroxValueError("trox.invalid-selector-number", "selector values must be nonnegative safe integers");
    }
}
export function assertNfc(value, label) {
    if (typeof value !== "string") {
        throw new TroxValueError("trox.invalid-string", `${label} must be a string`);
    }
    assertWellFormedUnicode(value, label);
    if (value.normalize("NFC") !== value) {
        throw new TroxValueError("trox.non-nfc", `${label} must be NFC`);
    }
}
function patternValue(input) {
    if (typeof input === "string") {
        assertNfc(input, "source text");
        parsePlaceholders(input);
        return { pattern: { kind: "text", text: input }, selectors: [], meaning: null };
    }
    return input;
}
export function exact(value, pattern) {
    assertSelectorInteger(value);
    const armValue = patternValue(pattern);
    assertNoNestedMeaning(armValue);
    return { key: { exact: value }, value: armValue };
}
function categoryArm(category, pattern) {
    const armValue = patternValue(pattern);
    assertNoNestedMeaning(armValue);
    return { key: { category }, value: armValue };
}
export const zero = (pattern) => categoryArm("zero", pattern);
export const one = (pattern) => categoryArm("one", pattern);
export const two = (pattern) => categoryArm("two", pattern);
export const few = (pattern) => categoryArm("few", pattern);
export const many = (pattern) => categoryArm("many", pattern);
export const other = (pattern) => categoryArm("other", pattern);
export function plural(value, branches) {
    return numericPattern("plural", value, branches);
}
export function ordinal(value, branches) {
    return numericPattern("ordinal", value, branches);
}
function numericPattern(kind, value, branches) {
    assertSelectorInteger(value);
    if (branches.length === 0 || branches.length > 256) {
        throw new TroxValueError("trox.branch-limit", "numeric selector must have 1..=256 branches");
    }
    let prior;
    let hasOther = false;
    const selectors = [];
    const identityBranches = [];
    branches.forEach((arm, index) => {
        const order = "exact" in arm.key
            ? [0, arm.key.exact]
            : [1, CATEGORIES.indexOf(arm.key.category)];
        if (prior !== undefined && (order[0] < prior[0] || (order[0] === prior[0] && order[1] <= prior[1]))) {
            throw new TroxValueError("trox.branch-order", "numeric selector branches are duplicate or noncanonical");
        }
        prior = order;
        if ("category" in arm.key && arm.key.category === "other")
            hasOther = true;
        selectors.push(...prefixSelectors(arm.value.selectors, index));
        const key = "exact" in arm.key
            ? { exact: arm.key.exact }
            : kind === "plural" ? { plural: arm.key.category } : { ordinal: arm.key.category };
        identityBranches.push({ key, pattern: arm.value.pattern });
    });
    if (!hasOther)
        throw new TroxValueError("trox.missing-other", "numeric selector requires other");
    selectors.push({ kind, path: [], value });
    return { pattern: { kind, branches: identityBranches }, selectors, meaning: null };
}
export function when(key, pattern) {
    if (typeof key === "string")
        assertStableId(key, "selector key");
    const armValue = patternValue(pattern);
    assertNoNestedMeaning(armValue);
    return { role: "when", key, value: armValue };
}
export function otherwise(pattern) {
    const armValue = patternValue(pattern);
    assertNoNestedMeaning(armValue);
    return { role: "otherwise", value: armValue };
}
function assertNoNestedMeaning(value) {
    if (value.meaning !== null) {
        throw new TroxValueError("trox.nested-meaning", "meaning may only wrap a complete top-level pattern");
    }
}
export function select(value, branches) {
    if (typeof value === "string")
        assertStableId(value, "selector key");
    if (branches.length === 0 || branches.length > 256 || branches.at(-1)?.role !== "otherwise") {
        throw new TroxValueError("trox.missing-otherwise", "select requires final otherwise");
    }
    if (branches.slice(0, -1).some((arm) => arm.role !== "when")) {
        throw new TroxValueError("trox.otherwise-order", "otherwise must appear exactly once at the end");
    }
    const keys = [];
    const seen = new Set();
    const selectors = [];
    const identityBranches = [];
    branches.forEach((arm, index) => {
        selectors.push(...prefixSelectors(arm.value.selectors, index));
        if (arm.role === "when") {
            if (typeof arm.key !== typeof value)
                throw new TroxValueError("trox.selector-key-type", "select keys must have one JSON type");
            if (seen.has(arm.key))
                throw new TroxValueError("trox.duplicate-selector-key", "select branch keys must be unique");
            seen.add(arm.key);
            keys.push(arm.key);
            identityBranches.push({ role: "when", pattern: arm.value.pattern });
        }
        else
            identityBranches.push({ role: "otherwise", pattern: arm.value.pattern });
    });
    selectors.push({ branch_keys: keys, kind: "select", path: [], value });
    return { pattern: { kind: "select", branches: identityBranches }, selectors, meaning: null };
}
function prefixSelectors(records, branch) {
    return records.map((record) => ({ ...record, path: [branch, ...record.path] }));
}
export function meaning(meaningId, pattern) {
    assertStableId(meaningId, "meaning");
    const value = patternValue(pattern);
    if (value.meaning !== null)
        throw new TroxValueError("trox.duplicate-meaning", "duplicate meaning wrapper");
    return { ...value, meaning: meaningId };
}
export class TermId {
    value;
    _termIdBrand = true;
    constructor(value) { assertStableId(value, "term ID"); this.value = value; Object.freeze(this); }
}
export function termId(value) { return new TermId(value); }
class TermBuilder {
    id;
    formId;
    numberValue;
    constructor(id, formId, numberValue) { this.id = id; this.formId = formId; this.numberValue = numberValue; }
    form(formId) {
        assertStableId(formId, "term form");
        if (this.formId !== undefined)
            throw new TroxValueError("trox.duplicate-term-form", "duplicate term form");
        return new TermBuilder(this.id, formId, this.numberValue);
    }
    number(number) { assertSelectorInteger(number); return toTermArgument(new TermBuilder(this.id, this.formId, number)); }
    finish() { return toTermArgument(this); }
}
function toTermArgument(value) {
    return {
        kind: "term", term_id: value.id.value,
        ...(value.formId === undefined ? {} : { form: value.formId }),
        ...(value.numberValue === undefined ? {} : { number: value.numberValue }),
    };
}
export function term(id) { return new TermBuilder(id); }
export function indefinite(id) { return term(id).form("indefinite").finish(); }
export function counted(id, number) { return term(id).form("counted").number(number); }
export function opaque(value) {
    if (!value.isAtomic())
        throw new TroxValueError("trox.non-atomic-opaque", "opaque value must be atomic");
    return { kind: "opaque", value: value.wireValue() };
}
export class LocalizedString {
    #wire;
    constructor(wire, token) {
        if (token !== CONSTRUCTION_TOKEN)
            throw new TroxValueError("trox.constructor", "use tx, txa, or assertLocalized to construct LocalizedString");
        this.#wire = deepFreeze(wire);
        Object.freeze(this);
    }
    /** @internal */
    static fromValidatedWire(wire, token) {
        return new LocalizedString(wire, token);
    }
    get entryId() { return this.#wire.entry_id; }
    get sourceSignature() { return this.#wire.source_signature; }
    get identity() { return this.#wire.identity; }
    get arguments() { return this.#wire.arguments; }
    get selectors() { return this.#wire.selectors; }
    isAtomic() { return this.#wire.identity.pattern.kind === "text" && Object.keys(this.#wire.arguments).length === 0 && this.#wire.selectors.length === 0; }
    toCanonicalJSON() { return canonicalJson(this.#wire); }
    wireValue() { return structuredClone(this.#wire); }
    toString() { throw new TroxValueError("trox.explicit-resolution", "LocalizedString must be resolved by a Localizer"); }
    [Symbol.toPrimitive]() { throw new TroxValueError("trox.explicit-resolution", "LocalizedString must be resolved by a Localizer"); }
}
/** @internal */
export const CONSTRUCTION_TOKEN = Symbol("trox-construction");
export function tx(pattern, description) {
    return construct(patternValue(pattern), {}, description);
}
export function txa(pattern, inputs, description) {
    if (inputs === null || typeof inputs !== "object" || Array.isArray(inputs)) {
        throw new TroxValueError("trox.invalid-arguments", "argument bindings must be an object");
    }
    const args = {};
    for (const [name, input] of Object.entries(inputs)) {
        if (!PLACEHOLDER.test(name) || name.length > 64)
            throw new TroxValueError("trox.invalid-placeholder", `invalid argument name \`${name}\``);
        args[name] = argumentFrom(input);
    }
    return construct(patternValue(pattern), args, description);
}
/**
 * Asserts that runtime text is appropriate to display without translation.
 * Intended for migrations, verbatim user input, tests, and developer surfaces.
 * Calls are ignored by source extraction.
 */
export function assertLocalized(rawString) {
    const normalized = typeof rawString === "string" ? rawString.normalize("NFC") : rawString;
    assertNfc(normalized, "asserted-localized text");
    const text = normalized.replaceAll("{", "{{").replaceAll("}", "}}");
    return constructValidated({ pattern: { kind: "text", text }, selectors: [], meaning: ASSERT_LOCALIZED_MEANING }, {});
}
function argumentFrom(value) {
    if (typeof value === "string") {
        assertNfc(value, "argument text");
        return { kind: "text", value };
    }
    if (typeof value === "number") {
        if (!Number.isFinite(value))
            throw new TroxValueError("trox.invalid-number", "Trox numbers must be finite");
        return { kind: "number", value: Object.is(value, -0) ? 0 : value };
    }
    if (typeof value === "boolean")
        return { kind: "boolean", value };
    if (value !== null && typeof value === "object" && (value.kind === "term" || value.kind === "opaque")) {
        validateArgument(value);
        return structuredClone(value);
    }
    throw new TroxValueError("trox.invalid-argument", "unsupported argument value");
}
function construct(value, args, description) {
    assertNfc(description, "description");
    if (description.trim() === "")
        throw new TroxValueError("trox.description", "description must not be empty");
    validatePattern(value.pattern);
    validateArgumentMap(value.pattern, args);
    return constructValidated(value, args);
}
function constructValidated(value, args) {
    const identity = { identity_version: 1, meaning: value.meaning, pattern: value.pattern };
    let digest;
    const identityDigest = () => {
        digest ??= blake3(new TextEncoder().encode(canonicalJson(identity)));
        return digest;
    };
    const wire = {
        arguments: sortRecord(args),
        get entry_id() { return `tx1_${base32(identityDigest().slice(0, 16))}`; },
        format: "trox-localized-string",
        identity,
        selectors: [...value.selectors].sort((a, b) => comparePaths(a.path, b.path)),
        get source_signature() { return hex(identityDigest()); },
        version: { major: 1, minor: 0 },
    };
    validateSelectorRecords(wire.identity.pattern, wire.selectors);
    return LocalizedString.fromValidatedWire(wire, CONSTRUCTION_TOKEN);
}
/** @internal */
export function assertedLocalizedPattern(value) {
    return value.identity.meaning === ASSERT_LOCALIZED_MEANING
        && value.identity.pattern.kind === "text"
        && Object.keys(value.arguments).length === 0
        && value.selectors.length === 0
        ? value.identity.pattern.text
        : undefined;
}
export function validateArgumentMap(pattern, argumentsValue) {
    const actual = Object.keys(argumentsValue).sort();
    if (actual.length > 256) {
        throw new TroxValueError("trox.argument-limit", "message exceeds 256 arguments");
    }
    const expected = collectPatternPlaceholders(pattern);
    if (expected.join("\0") !== actual.join("\0")) {
        throw new TroxValueError("trox.argument-mismatch", `expected ${expected.join(", ")}; got ${actual.join(", ")}`);
    }
    for (const argument of Object.values(argumentsValue))
        validateArgument(argument);
}
function validateArgument(argument) {
    if (argument === null || typeof argument !== "object" || Array.isArray(argument)) {
        throw new TroxValueError("trox.invalid-argument", "argument must be a tagged object");
    }
    switch (argument.kind) {
        case "text":
            assertNfc(argument.value, "argument text");
            return;
        case "number":
            if (typeof argument.value !== "number" || !Number.isFinite(argument.value)) {
                throw new TroxValueError("trox.invalid-number", "Trox numbers must be finite");
            }
            return;
        case "boolean":
            if (typeof argument.value !== "boolean") {
                throw new TroxValueError("trox.invalid-argument", "boolean argument value must be boolean");
            }
            return;
        case "term":
            assertStableId(argument.term_id, "term ID");
            if (argument.form !== undefined)
                assertStableId(argument.form, "term form");
            if (argument.number !== undefined)
                assertSelectorInteger(argument.number);
            return;
        case "opaque": {
            const nested = argument.value;
            if (nested === null || typeof nested !== "object" || Array.isArray(nested)
                || nested.format !== "trox-localized-string"
                || nested.version?.major !== 1 || nested.version.minor !== 0
                || nested.identity?.pattern?.kind !== "text"
                || nested.arguments === null || typeof nested.arguments !== "object"
                || Object.keys(nested.arguments).length !== 0
                || !Array.isArray(nested.selectors) || nested.selectors.length !== 0) {
                throw new TroxValueError("trox.non-atomic-opaque", "opaque value must be atomic");
            }
            validateIdentity(nested.identity);
            const nestedDigest = blake3(new TextEncoder().encode(canonicalJson(nested.identity)));
            if (nested.entry_id !== `tx1_${base32(nestedDigest.slice(0, 16))}` || nested.source_signature !== hex(nestedDigest)) {
                throw new TroxValueError("trox.identity-mismatch", "opaque value identity hash mismatch");
            }
            return;
        }
    }
}
function validatePattern(pattern, depth = 0, nodes = { count: 0 }) {
    nodes.count += 1;
    if (nodes.count > 4096)
        throw new TroxValueError("trox.pattern-limit", "pattern exceeds 4,096 nodes");
    if (depth > 16)
        throw new TroxValueError("trox.selector-depth", "pattern exceeds 16 nested selectors");
    if (pattern.kind === "text") {
        if (typeof pattern.text !== "string")
            throw new TroxValueError("trox.pattern", "text pattern requires string text");
        assertNfc(pattern.text, "source text");
        parsePlaceholders(pattern.text);
        return;
    }
    if (!Array.isArray(pattern.branches) || pattern.branches.length === 0 || pattern.branches.length > 256)
        throw new TroxValueError("trox.branch-limit", "selector branch limit exceeded");
    if (pattern.kind === "select") {
        if (pattern.branches.at(-1)?.role !== "otherwise" || pattern.branches.slice(0, -1).some((branch) => branch.role !== "when"))
            throw new TroxValueError("trox.otherwise-order", "select requires exactly one final otherwise");
    }
    else {
        let prior;
        let last;
        let hasOther = false;
        for (const branch of pattern.branches) {
            let order;
            if ("exact" in branch.key) {
                assertSelectorInteger(branch.key.exact);
                order = [0, branch.key.exact];
            }
            else {
                const category = pattern.kind === "plural" && "plural" in branch.key ? branch.key.plural : pattern.kind === "ordinal" && "ordinal" in branch.key ? branch.key.ordinal : undefined;
                if (category === undefined || !CATEGORIES.includes(category))
                    throw new TroxValueError("trox.branch-kind", "numeric branch key differs from selector kind");
                order = [1, CATEGORIES.indexOf(category)];
                hasOther ||= category === "other";
            }
            prior = last;
            if (prior !== undefined && (order[0] < prior[0] || (order[0] === prior[0] && order[1] <= prior[1])))
                throw new TroxValueError("trox.branch-order", "numeric branches are duplicate or noncanonical");
            last = order;
        }
        if (!hasOther)
            throw new TroxValueError("trox.missing-other", "numeric selector requires other");
    }
    for (const branch of pattern.branches)
        validatePattern(branch.pattern, depth + 1, nodes);
}
export function validateIdentity(identity) {
    if (identity.identity_version !== 1)
        throw new TroxValueError("trox.identity-version", "identity version must be 1");
    if (identity.meaning !== null) {
        if (typeof identity.meaning !== "string")
            throw new TroxValueError("trox.meaning", "meaning must be a stable ID or null");
        assertStableId(identity.meaning, "meaning");
    }
    validatePattern(identity.pattern);
}
export function parsePlaceholders(text) {
    const names = new Set();
    for (let index = 0; index < text.length;) {
        if (text.startsWith("{{", index) || text.startsWith("}}", index)) {
            index += 2;
            continue;
        }
        if (text[index] === "{") {
            const end = text.indexOf("}", index + 1);
            if (end < 0)
                throw new TroxValueError("trox.invalid-braces", "unclosed `{`");
            const name = text.slice(index + 1, end);
            if (name.length > 64 || !PLACEHOLDER.test(name))
                throw new TroxValueError("trox.invalid-placeholder", `invalid placeholder \`{${name}}\``);
            names.add(name);
            index = end + 1;
            continue;
        }
        if (text[index] === "}")
            throw new TroxValueError("trox.invalid-braces", "unmatched `}`");
        index += 1;
    }
    return [...names].sort();
}
export function collectPatternPlaceholders(pattern) {
    const names = new Set();
    const visit = (node) => {
        if (node.kind === "text")
            for (const name of parsePlaceholders(node.text))
                names.add(name);
        else
            for (const branch of node.branches)
                visit(branch.pattern);
    };
    visit(pattern);
    return [...names].sort();
}
export function validateSelectorRecords(pattern, records) {
    if (!Array.isArray(records))
        throw new TroxValueError("trox.selector-records", "selector records must be an array");
    const expected = [];
    const visit = (node, path) => {
        if (node.kind === "text")
            return;
        expected.push({ path, kind: node.kind, selectBranches: node.kind === "select" ? node.branches.length - 1 : 0 });
        node.branches.forEach((branch, index) => visit(branch.pattern, [...path, index]));
    };
    visit(pattern, []);
    expected.sort((left, right) => comparePaths(left.path, right.path));
    if (records.length !== expected.length)
        throw new TroxValueError("trox.selector-records", "selector record count differs from pattern nodes");
    records.forEach((record, index) => {
        const wanted = expected[index];
        if (record.kind !== wanted.kind || canonicalJson(record.path) !== canonicalJson(wanted.path))
            throw new TroxValueError("trox.selector-records", "selector records do not match canonical pattern order");
        if (record.kind === "select") {
            if (!Array.isArray(record.branch_keys) || (typeof record.value !== "string" && typeof record.value !== "boolean")) {
                throw new TroxValueError("trox.selector-records", "select keys and value must be strings or booleans");
            }
            if (record.branch_keys.length !== wanted.selectBranches || record.branch_keys.some((key) => typeof key !== typeof record.value))
                throw new TroxValueError("trox.selector-records", "select branch keys do not match selector value");
            const seen = new Set();
            for (const key of record.branch_keys) {
                if (typeof key !== "string" && typeof key !== "boolean")
                    throw new TroxValueError("trox.selector-records", "select keys must be strings or booleans");
                if (typeof key === "string")
                    assertStableId(key, "selector key");
                if (seen.has(key))
                    throw new TroxValueError("trox.duplicate-selector-key", "select branch keys must be unique");
                seen.add(key);
            }
            if (typeof record.value === "string")
                assertStableId(record.value, "selector value");
        }
        else
            assertSelectorInteger(record.value);
    });
}
