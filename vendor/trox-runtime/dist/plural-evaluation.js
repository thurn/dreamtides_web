const STANDARD_CATEGORIES = ["zero", "one", "two", "few", "many"];
export class CompiledPluralRules {
    #rules;
    constructor(rules) {
        this.#rules = rules;
    }
    static compile(rules) {
        const compiled = [];
        for (const category of STANDARD_CATEGORIES) {
            const source = rules[category];
            if (source === undefined)
                continue;
            const condition = compilePluralCondition(source);
            if (condition === undefined)
                return undefined;
            compiled.push([category, condition]);
        }
        return new CompiledPluralRules(compiled);
    }
    category(value) {
        return this.#rules.find(([, condition]) => evaluateCondition(condition, value))?.[0] ?? "other";
    }
}
export function evaluatePluralCategory(rules, value) {
    return CompiledPluralRules.compile(rules)?.category(value) ?? "other";
}
export function compilePluralCondition(rule) {
    if (typeof rule !== "string")
        return undefined;
    const condition = rule.split("@")[0].trim();
    if (condition === "")
        return undefined;
    const clauses = [];
    for (const clause of condition.split(" or ")) {
        if (clause === "")
            return undefined;
        const relations = [];
        for (const source of clause.split(" and ")) {
            const relation = compileRelation(source.trim());
            if (relation === undefined)
                return undefined;
            relations.push(relation);
        }
        clauses.push(relations);
    }
    return clauses;
}
function compileRelation(source) {
    const normalized = source
        .replaceAll(" is not ", " != ")
        .replaceAll(" is ", " = ")
        .replaceAll(" not in ", " != ")
        .replaceAll(" not within ", " != ")
        .replaceAll(" in ", " = ")
        .replaceAll(" within ", " = ")
        .replaceAll(" mod ", " % ");
    const operator = normalized.includes(" != ") ? " != " : normalized.includes(" = ") ? " = " : undefined;
    if (operator === undefined)
        return undefined;
    const pieces = normalized.split(operator);
    if (pieces.length !== 2)
        return undefined;
    const [left = "", right = ""] = pieces;
    const negate = operator === " != ";
    const parts = left.trim().split(/\s+/);
    if (!/^[nivwftce]$/.test(parts[0] ?? ""))
        return undefined;
    let modulus;
    if (parts.length === 3 && parts[1] === "%" && /^[1-9][0-9]*$/.test(parts[2] ?? "")) {
        modulus = Number(parts[2]);
        if (!Number.isSafeInteger(modulus))
            return undefined;
    }
    else if (parts.length !== 1)
        return undefined;
    const ranges = [];
    for (const rawRange of right.split(",")) {
        const values = rawRange.trim().split("..");
        if (values.length > 2 || values.some((value) => !/^[0-9]+$/.test(value)))
            return undefined;
        const start = Number(values[0]);
        const end = Number(values[1] ?? values[0]);
        if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end)
            return undefined;
        ranges.push([start, end]);
    }
    if (ranges.length === 0)
        return undefined;
    return {
        operand: parts[0] === "n" || parts[0] === "i" ? parts[0] : "fractional",
        ...(modulus === undefined ? {} : { modulus }),
        negate,
        ranges,
    };
}
function evaluateCondition(condition, value) {
    return condition.some((clause) => clause.every((relation) => evaluateRelation(relation, value)));
}
function evaluateRelation(relation, value) {
    let operand = relation.operand === "fractional" ? 0 : value;
    if (relation.modulus !== undefined)
        operand %= relation.modulus;
    const contained = relation.ranges.some(([start, end]) => operand >= start && operand <= end);
    return contained !== relation.negate;
}
