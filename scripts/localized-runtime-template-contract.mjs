export function runtimeTemplateArgumentName(sourceName) {
  const normalized =
    sourceName === "name"
      ? "affiliation_name"
      : /^[0-9]+$/u.test(sourceName)
        ? `value_${sourceName}`
        : sourceName
            .replace(/([a-z0-9])([A-Z])/gu, "$1_$2")
            .replaceAll("-", "_")
            .toLowerCase();
  if (!/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/u.test(normalized)) {
    throw new Error(
      `Cannot normalize runtime-template argument ${JSON.stringify(sourceName)}.`,
    );
  }
  return normalized;
}

const RUNTIME_TEMPLATE_ARGUMENT_KINDS = new Map([
  ["1", "scalar"],
  ["action-label", "localized"],
  ["amount", "scalar"],
  ["card-theme", "localized"],
  ["cardName", "localized"],
  ["card_type", "localized"],
  ["categoryName", "localized"],
  ["count", "scalar"],
  ["deck_card", "localized"],
  ["dreamsignName", "localized"],
  ["essence-per-spark", "scalar"],
  ["firstCardName", "localized"],
  ["fixed_card", "localized"],
  ["maximumCost", "scalar"],
  ["name", "localized"],
  ["nightmare_card", "localized"],
  ["offered_card", "localized"],
  ["pickCount", "scalar"],
  ["pickNumber", "scalar"],
  ["pickTotal", "scalar"],
  ["secondCardName", "localized"],
  ["siteName", "localized"],
  ["starter_card", "localized"],
  ["subtype", "localized"],
  ["term", "localized"],
  ["transfiguration", "localized"],
  ["win-essence", "scalar"],
]);

export function runtimeTemplateArgumentKind(sourceName) {
  const kind = RUNTIME_TEMPLATE_ARGUMENT_KINDS.get(sourceName);
  if (kind === undefined) {
    throw new Error(
      `Runtime-template argument ${JSON.stringify(sourceName)} must be classified as localized or scalar.`,
    );
  }
  return kind;
}

export function collectRuntimeTemplateSources(value, path, result) {
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      collectRuntimeTemplateSources(entry, `${path}[${String(index)}]`, result),
    );
    return;
  }
  if (value !== null && typeof value === "object") {
    Object.entries(value).forEach(([key, entry]) =>
      collectRuntimeTemplateSources(entry, `${path}.${key}`, result),
    );
    return;
  }
  if (
    typeof value === "string" &&
    /\{[^{}]+\}/u.test(value) &&
    !result.has(value)
  ) {
    result.set(value, path);
  }
}

export function runtimeTemplateContract(template) {
  const sourceNames = [...template.matchAll(/\{([^{}]+)\}/gu)].map(
    (match) => match[1],
  );
  const uniqueSourceNames = [...new Set(sourceNames)];
  const normalizedNames = uniqueSourceNames.map(runtimeTemplateArgumentName);
  if (new Set(normalizedNames).size !== normalizedNames.length) {
    throw new Error(
      `Runtime-template arguments collide after normalization: ${template}`,
    );
  }
  return {
    sourceNames: uniqueSourceNames,
    argumentNames: normalizedNames,
    argumentKinds: uniqueSourceNames.map(runtimeTemplateArgumentKind),
    pattern: template.replace(
      /\{([^{}]+)\}/gu,
      (_match, name) => `{${runtimeTemplateArgumentName(name)}}`,
    ),
  };
}
