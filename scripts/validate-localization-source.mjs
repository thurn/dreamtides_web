import { FluentParser, Message } from "@fluent/syntax";

const COUNTABLE_TERM_IDS = new Set([
  "journey",
  "dream-avatar",
  "dream-guide",
  "dreamscape",
  "dreamsign",
  "tide",
  "site",
  "reward",
  "card",
  "character",
  "event-card",
  "deck",
  "hand",
  "void",
  "figment",
  "battle",
  "player",
  "opponent",
  "turn",
  "round",
  "point",
]);
const COUNT_VARIABLE_PATTERN = /(?:^count$|count$|amount$|total$|number$)/iu;
const INDEFINITE_ARTICLE_PATTERN = /(?:^|\s)(?:a|an)\s+$/iu;
const PLURAL_CATEGORIES = new Set([
  "zero",
  "one",
  "two",
  "few",
  "many",
  "other",
]);

/**
 * Finds source-English grammar that depends on an interpolated value or that
 * bypasses Fluent's runtime plural selection.
 *
 * @param {string} source
 * @returns {Array<{ messageId: string, rule: string }>}
 */
export function validateLocalizationSource(source) {
  const resource = new FluentParser({ withSpans: false }).parse(source);
  const diagnostics = resource.body
    .filter((entry) => entry.type === "Junk")
    .flatMap((entry) =>
      entry.annotations.map(() => ({
        messageId: "<syntax>",
        rule: "valid-fluent-syntax",
      })),
    );

  for (const entry of resource.body) {
    if (!(entry instanceof Message)) continue;

    const context = {
      diagnostics,
      messageId: entry.id.name,
      pluralBranches: [],
    };
    if (entry.value !== null) inspectPattern(entry.value, context);
    for (const attribute of entry.attributes) {
      inspectPattern(attribute.value, context);
    }
  }

  return diagnostics;
}

function inspectPattern(pattern, context) {
  const directCountVariables = new Set();

  for (let index = 0; index < pattern.elements.length; index += 1) {
    const element = pattern.elements[index];
    if (element.type !== "Placeable") continue;

    if (element.expression.type === "VariableReference") {
      const variableName = element.expression.id.name;
      if (COUNT_VARIABLE_PATTERN.test(variableName)) {
        directCountVariables.add(variableName);
      }

      const previous = pattern.elements[index - 1];
      if (
        previous?.type === "TextElement" &&
        INDEFINITE_ARTICLE_PATTERN.test(previous.value)
      ) {
        addDiagnostic(context, "indefinite-article-before-variable");
      }
    }
  }

  for (const element of pattern.elements) {
    if (element.type !== "Placeable") continue;
    if (
      directCountVariables.size > 0 &&
      element.expression.type === "TermReference" &&
      COUNTABLE_TERM_IDS.has(element.expression.id.name) &&
      getNumberFacet(element.expression) === null
    ) {
      addDiagnostic(context, "countable-term-without-number-facet");
    }
    inspectExpression(element.expression, context);
  }
}

function inspectExpression(expression, context) {
  if (expression.type === "Placeable") {
    inspectExpression(expression.expression, context);
    return;
  }

  if (expression.type === "SelectExpression") {
    inspectSelectExpression(expression, context);
    return;
  }

  if (expression.type !== "TermReference") return;

  if (!COUNTABLE_TERM_IDS.has(expression.id.name)) return;
  const numberFacet = getNumberFacet(expression);
  if (numberFacet === null) {
    if (context.pluralBranches.length > 0) {
      addDiagnostic(context, "countable-term-without-number-facet");
    }
    return;
  }

  if (
    PLURAL_CATEGORIES.has(numberFacet) &&
    !context.pluralBranches.includes(numberFacet)
  ) {
    addDiagnostic(context, "number-facet-outside-matching-selector");
  }
}

function inspectSelectExpression(expression, context) {
  const variantKeys = expression.variants.map(getVariantKey);
  const isPluralSelector = variantKeys.includes("one");
  if (isPluralSelector) {
    const otherIndex = variantKeys.indexOf("other");
    if (otherIndex === -1 || !expression.variants[otherIndex].default) {
      addDiagnostic(context, "plural-selector-needs-default-other");
    }
  }

  for (let index = 0; index < expression.variants.length; index += 1) {
    const key = variantKeys[index];
    const pluralBranches =
      isPluralSelector && PLURAL_CATEGORIES.has(key)
        ? [...context.pluralBranches, key]
        : context.pluralBranches;
    inspectPattern(expression.variants[index].value, {
      ...context,
      pluralBranches,
    });
  }
}

function getNumberFacet(reference) {
  const argument = reference.arguments?.named.find(
    (candidate) => candidate.name.name === "number",
  );
  return argument?.value.type === "StringLiteral" ? argument.value.value : null;
}

function getVariantKey(variant) {
  return variant.key.value ?? variant.key.name;
}

function addDiagnostic(context, rule) {
  if (
    !context.diagnostics.some(
      (diagnostic) =>
        diagnostic.messageId === context.messageId && diagnostic.rule === rule,
    )
  ) {
    context.diagnostics.push({ messageId: context.messageId, rule });
  }
}
