const EFFECT_FIELDS = [
  "predicate",
  "count",
  "cardId",
  "dreamsignId",
  "packCount",
  "packSize",
  "offerCount",
  "essencePerSpark",
  "essencePerCard",
  "sparkBonus",
  "essence",
  "minimumEssence",
  "maximumEssence",
  "energyCostReduction",
  "subtype",
  "subtypeOptions",
  "nightmareCount",
  "transfiguration",
  "deckTarget",
  "cardType",
  "siteType",
];

const STARTER_EFFECT_KINDS = new Set([
  "purge-starter-card",
  "purge-random-starter-card",
  "purge-random-starter-and-gain-card",
  "replace-all-starter-cards",
  "transfigure-random-starter-cards",
  "transfigure-all-starter-cards",
]);
const STARTER_REPLACEMENT_KINDS = new Set([
  "purge-random-starter-and-gain-card",
  "replace-all-starter-cards",
]);
const MULTI_TRANSFIGURATION_KINDS = new Set([
  "transfigure-selected",
  "transfigure-random-cards",
  "transfigure-fixed-random-cards",
]);
const OPTIONAL_COUNT_MUTATION_KINDS = new Set([
  "replace-selected",
  "transfigure-fixed-selected",
]);
const AUTOMATIC_WAVE4B_KINDS = new Set([
  "copy-random-cards",
  "change-random-card-type",
]);
const WAVE7_KINDS = new Set([
  "replace-random-with-card",
  "change-card-type-selected",
]);
const SHOP_MODIFIER_KINDS = new Set([
  "free-next-shop",
  "lose-half-essence-and-free-purchases",
]);
const WAVE8_FIELDS = new Map([
  ["transfigure-all-cards", []],
  ["purge-disclosed-and-transfigure-same-type", ["transfiguration"]],
  ["make-predicate-fast-and-gain-nightmares", ["predicate", "nightmareCount"]],
  [
    "take-transfigured-cards-and-gain-nightmares",
    ["predicate", "offerCount", "transfiguration", "nightmareCount"],
  ],
  ["purge-one-transfigure-and-copy-others", ["offerCount", "transfiguration"]],
]);

export const SHARED_EXPLORATION_EFFECT_VALIDATION_KINDS = new Set([
  ...STARTER_EFFECT_KINDS,
  ...MULTI_TRANSFIGURATION_KINDS,
  ...OPTIONAL_COUNT_MUTATION_KINDS,
  ...AUTOMATIC_WAVE4B_KINDS,
  ...WAVE7_KINDS,
  ...SHOP_MODIFIER_KINDS,
  ...WAVE8_FIELDS.keys(),
  "add-fixed-site",
  "choose-site-type",
]);

const REQUIRED_AUTHORED_FIELDS = new Map([
  ["purge-random-starter-and-gain-card", ["predicate"]],
  ["replace-all-starter-cards", ["predicate"]],
  ["transfigure-selected", ["count"]],
  ["transfigure-random-cards", ["predicate", "count"]],
  ["transfigure-fixed-random-cards", ["predicate", "count", "transfiguration"]],
  ["copy-random-cards", ["predicate", "count"]],
  ["change-random-card-type", ["count", "cardType"]],
  ["replace-random-with-card", ["predicate", "cardId"]],
  ["change-card-type-selected", ["cardType", "deckTarget"]],
  ["lose-half-essence-and-free-purchases", ["count"]],
  ["purge-disclosed-and-transfigure-same-type", ["transfiguration"]],
  ["make-predicate-fast-and-gain-nightmares", ["predicate", "nightmareCount"]],
  [
    "take-transfigured-cards-and-gain-nightmares",
    ["predicate", "offerCount", "transfiguration", "nightmareCount"],
  ],
  ["purge-one-transfigure-and-copy-others", ["offerCount", "transfiguration"]],
  ["add-fixed-site", ["siteType"]],
  ["choose-site-type", ["offerCount"]],
]);

export function validateExplorationEffectAuthoredFields(action, { fail }) {
  const missingField = REQUIRED_AUTHORED_FIELDS.get(action.effectKind)?.find(
    (field) => action[field] === undefined,
  );
  if (missingField !== undefined) {
    fail(`${action.effectKind} requires ${missingField}`);
  }
}

function hasTokens(text) {
  return typeof text === "string" && /\$[A-Z][A-Z0-9_]*|\{[^{}]+\}/u.test(text);
}

function presentationTokens(text) {
  return typeof text === "string"
    ? (text.match(/\{[a-z][a-z0-9_]*\}/gu) ?? [])
    : [];
}

function rejectUnsupportedFields(action, allowedFields, fail, effectKindLabel) {
  const allowed = new Set(allowedFields);
  const unsupported = EFFECT_FIELDS.find(
    (field) => action[field] !== undefined && !allowed.has(field),
  );
  if (unsupported !== undefined) {
    fail(
      `field ${unsupported} does not apply to ${effectKindLabel} ${action.effectKind}`,
    );
  }
}

function requireNoFollowup(action, fail) {
  if (
    action.followupTitle !== undefined ||
    action.followupSubtitle !== undefined
  ) {
    fail(`${action.effectKind} does not support a followup`);
  }
}

function validFollowupOverride(value, nonblank) {
  if (value === undefined) return true;
  if (typeof value === "string") return !nonblank || value.trim() !== "";
  return (
    typeof value === "object" &&
    value !== null &&
    value.format === "trox-source-message-ref" &&
    typeof value.entry_id === "string"
  );
}

function validateFollowupOverrides(action, fail, nonblank = false) {
  if (
    action.followupTitle === undefined &&
    action.followupSubtitle === undefined
  )
    return;
  const titleValid = validFollowupOverride(action.followupTitle, nonblank);
  const subtitleValid = validFollowupOverride(
    action.followupSubtitle,
    nonblank,
  );
  if (!titleValid || !subtitleValid) {
    fail(
      `${action.effectKind} has an invalid followup override${nonblank ? " with blank text" : ""}`,
    );
  }
}

function requireMetadata(action, mechanic, policies, fail) {
  const policyAllowed = policies.includes(action.selectionPolicyId);
  if (action.canonicalMechanicId !== mechanic || !policyAllowed) {
    fail(
      `${action.effectKind} has an incompatible mechanic or selection policy`,
    );
  }
}

function requirePredicate(action, predicates, fail, predicateRequirement) {
  if (!predicates.has(action.predicate)) {
    fail(`${action.effectKind} ${predicateRequirement}`);
  }
}

function requireTransfiguration(action, transfigurations, fail) {
  if (!transfigurations.has(action.transfiguration)) {
    fail(`${action.effectKind} requires a supported transfiguration`);
  }
}

/**
 * Validate the camelCase compatibility shape shared by the editor API and asset
 * generator. Callers own source-defaulting and convert the message through their
 * path-specific error factory.
 */
export function validateExplorationEffectAction(
  action,
  { predicates, transfigurations, fixedSiteTypes, fail, terminology = {} },
) {
  const kind = action.effectKind;
  if (!SHARED_EXPLORATION_EFFECT_VALIDATION_KINDS.has(kind)) return;
  const effectKindLabel = terminology.effectKind ?? "effect kind";
  const offerCountLabel = terminology.offerCount ?? "offerCount";
  const positiveInteger = terminology.positiveInteger ?? "positive integer";
  const predicateRequirement =
    terminology.predicateRequirement ??
    "requires a supported non-Any predicate";
  const siteTypeLabel = terminology.siteType ?? "siteType";

  const wave8Fields = WAVE8_FIELDS.get(kind);
  if (wave8Fields !== undefined) {
    const metadata = {
      "transfigure-all-cards": ["transfigure-deck-entry", ["uniform"]],
      "purge-disclosed-and-transfigure-same-type": [
        "purge-deck-entry",
        ["purge-misfit"],
      ],
      "make-predicate-fast-and-gain-nightmares": [
        "make-deck-fast",
        [undefined],
      ],
      "take-transfigured-cards-and-gain-nightmares": [
        "transfigured-card-chooser",
        ["card-fit"],
      ],
      "purge-one-transfigure-and-copy-others": [
        "transfigure-deck-entry",
        ["uniform"],
      ],
    }[kind];
    requireMetadata(action, metadata[0], metadata[1], fail);
    rejectUnsupportedFields(action, wave8Fields, fail, effectKindLabel);
    if (wave8Fields.includes("predicate"))
      requirePredicate(action, predicates, fail, predicateRequirement);
    if (wave8Fields.includes("transfiguration")) {
      requireTransfiguration(action, transfigurations, fail);
    }
    if (
      wave8Fields.includes("nightmareCount") &&
      (!Number.isInteger(action.nightmareCount) || action.nightmareCount <= 0)
    ) {
      fail(`${kind} requires a ${positiveInteger} nightmareCount`);
    }
    if (wave8Fields.includes("offerCount") && action.offerCount !== 4) {
      fail(`${kind} requires ${offerCountLabel} 4`);
    }
    if (
      [
        "take-transfigured-cards-and-gain-nightmares",
        "purge-one-transfigure-and-copy-others",
      ].includes(kind)
    ) {
      validateFollowupOverrides(action, fail, true);
    } else requireNoFollowup(action, fail);
    const tokens =
      typeof action.effectText === "string"
        ? (action.effectText.match(/\{[^{}]+\}/gu) ?? [])
        : [];
    if (
      typeof action.effectText === "string" &&
      /\$[A-Z][A-Z0-9_]*/u.test(action.effectText)
    ) {
      fail(`${kind} has an unsupported presentation token`);
    }
    if (kind === "purge-disclosed-and-transfigure-same-type") {
      if (
        action.effectText !== undefined &&
        (tokens.length !== 1 || tokens[0] !== "{deck_card}")
      ) {
        fail(`${kind} requires exactly the deck-card presentation token`);
      }
    } else {
      const allowed = new Set([
        ...([
          "make-predicate-fast-and-gain-nightmares",
          "take-transfigured-cards-and-gain-nightmares",
        ].includes(kind)
          ? ["{nightmare_card}"]
          : []),
      ]);
      if (tokens.some((token) => !allowed.has(token))) {
        fail(`${kind} has an unsupported presentation token`);
      }
    }
    return;
  }

  if (SHOP_MODIFIER_KINDS.has(kind)) {
    requireMetadata(action, "shop-purchase-modifier", [undefined], fail);
    rejectUnsupportedFields(
      action,
      kind === "lose-half-essence-and-free-purchases" ? ["count"] : [],
      fail,
      effectKindLabel,
    );
    if (
      kind === "lose-half-essence-and-free-purchases" &&
      (!Number.isInteger(action.count) || action.count <= 0)
    ) {
      fail(`${kind} requires a ${positiveInteger} count`);
    }
    requireNoFollowup(action, fail);
    if (hasTokens(action.effectText))
      fail(`${kind} does not support presentation tokens`);
    return;
  }

  if (STARTER_EFFECT_KINDS.has(kind)) {
    const replacement = STARTER_REPLACEMENT_KINDS.has(kind);
    const transfigure =
      kind === "transfigure-random-starter-cards" ||
      kind === "transfigure-all-starter-cards";
    requireMetadata(
      action,
      replacement
        ? "replace-deck-entry"
        : transfigure
          ? "transfigure-deck-entry"
          : "purge-deck-entry",
      replacement ? [undefined] : ["uniform"],
      fail,
    );
    rejectUnsupportedFields(
      action,
      [
        ...(replacement ? ["predicate"] : []),
        ...(kind === "transfigure-random-starter-cards" ? ["count"] : []),
      ],
      fail,
      effectKindLabel,
    );
    if (replacement)
      requirePredicate(action, predicates, fail, predicateRequirement);
    if (
      kind === "transfigure-random-starter-cards" &&
      (!Number.isInteger(action.count) || action.count <= 0)
    ) {
      fail(`${kind} requires a ${positiveInteger} count`);
    }
    const allowedTokens = new Set(
      kind === "purge-starter-card" ? ["{starter_card}"] : [],
    );
    const tokens = presentationTokens(action.effectText);
    if (
      /\$[A-Z][A-Z0-9_]*/u.test(action.effectText) ||
      tokens.some((token) => !allowedTokens.has(token))
    ) {
      fail(`${kind} does not support presentation tokens`);
    }
    if (
      kind === "purge-starter-card" &&
      action.effectText !== undefined &&
      !tokens.includes("{starter_card}")
    ) {
      fail(`${kind} must present {starter_card}`);
    }
    requireNoFollowup(action, fail);
    return;
  }

  if (MULTI_TRANSFIGURATION_KINDS.has(kind)) {
    requireMetadata(
      action,
      "transfigure-deck-entry",
      kind === "transfigure-selected"
        ? ["uniform", "transfiguration-value"]
        : ["uniform"],
      fail,
    );
    rejectUnsupportedFields(
      action,
      [
        "predicate",
        "count",
        ...(kind === "transfigure-fixed-random-cards"
          ? ["transfiguration"]
          : []),
      ],
      fail,
      effectKindLabel,
    );
    if (!Number.isInteger(action.count) || action.count <= 0) {
      fail(`${kind} requires a ${positiveInteger} count`);
    }
    if (kind !== "transfigure-selected" || action.count > 1) {
      requirePredicate(action, predicates, fail, predicateRequirement);
    }
    if (kind === "transfigure-fixed-random-cards") {
      requireTransfiguration(action, transfigurations, fail);
    }
    if (kind === "transfigure-selected" && action.count > 1) {
      validateFollowupOverrides(action, fail);
    } else if (kind !== "transfigure-selected") {
      requireNoFollowup(action, fail);
      if (hasTokens(action.effectText))
        fail(`${kind} does not support presentation tokens`);
    }
    return;
  }

  if (OPTIONAL_COUNT_MUTATION_KINDS.has(kind)) {
    requireMetadata(
      action,
      kind === "replace-selected"
        ? "replace-deck-entry"
        : "transfigure-deck-entry",
      kind === "replace-selected"
        ? ["uniform", "card-fit-quality"]
        : ["uniform", "transfiguration-value"],
      fail,
    );
    rejectUnsupportedFields(
      action,
      kind === "replace-selected"
        ? ["predicate", "count"]
        : ["predicate", "count", "transfiguration", "deckTarget"],
      fail,
      effectKindLabel,
    );
    if (
      action.count !== undefined &&
      (!Number.isInteger(action.count) || action.count <= 0)
    ) {
      fail(
        `${kind} requires a ${positiveInteger} count when count is authored`,
      );
    }
    if (kind === "replace-selected")
      requirePredicate(action, predicates, fail, predicateRequirement);
    if (kind === "transfigure-fixed-selected") {
      requireTransfiguration(action, transfigurations, fail);
      if (action.deckTarget !== "chosen" && action.deckTarget !== "offered") {
        fail(`${kind} requires a chosen or offered deckTarget`);
      }
    }
    const count = action.count ?? 1;
    if (count > 1) {
      if (
        kind === "transfigure-fixed-selected" &&
        (action.deckTarget !== "chosen" || !predicates.has(action.predicate))
      ) {
        fail(
          `multi-card ${kind} requires a chosen target and supported predicate; chosen deck-target required`,
        );
      }
      validateFollowupOverrides(action, fail);
    }
    return;
  }

  if (AUTOMATIC_WAVE4B_KINDS.has(kind)) {
    requireMetadata(
      action,
      kind === "copy-random-cards"
        ? "duplicate-deck-entry"
        : "change-entry-card-type",
      ["uniform"],
      fail,
    );
    rejectUnsupportedFields(
      action,
      kind === "copy-random-cards"
        ? ["predicate", "count"]
        : ["count", "cardType"],
      fail,
      effectKindLabel,
    );
    if (!Number.isInteger(action.count) || action.count <= 0) {
      fail(`${kind} requires a ${positiveInteger} count`);
    }
    if (kind === "copy-random-cards")
      requirePredicate(action, predicates, fail, predicateRequirement);
    if (
      kind === "change-random-card-type" &&
      action.cardType !== "Character" &&
      action.cardType !== "Event"
    ) {
      fail(`${kind} requires Character or Event cardType`);
    }
    requireNoFollowup(action, fail);
    const allowed = new Set(
      kind === "change-random-card-type" ? ["{card_type}"] : [],
    );
    const tokens = presentationTokens(action.effectText);
    if (
      /\$[A-Z][A-Z0-9_]*/u.test(action.effectText) ||
      tokens.some((token) => !allowed.has(token))
    ) {
      fail(`${kind} does not support target-disclosing presentation tokens`);
    }
    return;
  }

  if (WAVE7_KINDS.has(kind)) {
    const replacement = kind === "replace-random-with-card";
    requireMetadata(
      action,
      replacement ? "replace-deck-entry" : "change-entry-card-type",
      replacement ? ["uniform"] : ["deck-entry-centrality"],
      fail,
    );
    rejectUnsupportedFields(
      action,
      replacement ? ["predicate", "cardId"] : ["cardType", "deckTarget"],
      fail,
      effectKindLabel,
    );
    if (replacement) {
      requirePredicate(action, predicates, fail, predicateRequirement);
      if (typeof action.cardId !== "string" || action.cardId.trim() === "") {
        fail(`${kind} requires cardId`);
      }
      requireNoFollowup(action, fail);
    } else {
      if (action.cardType !== "Character" && action.cardType !== "Event") {
        fail(`${kind} requires Character or Event cardType`);
      }
      if (action.deckTarget !== "chosen" && action.deckTarget !== "offered") {
        fail(`${kind} requires a chosen or offered deckTarget`);
      }
    }
    const allowed = new Set([
      ...(replacement ? ["{fixed_card}"] : ["{card_type}"]),
      ...(!replacement && action.deckTarget === "offered"
        ? ["{deck_card}"]
        : []),
    ]);
    const tokens = presentationTokens(action.effectText);
    if (
      /\$[A-Z][A-Z0-9_]*/u.test(action.effectText) ||
      tokens.some((token) => !allowed.has(token))
    ) {
      fail(`${kind} has an unsupported presentation token`);
    }
    return;
  }

  if (kind === "add-fixed-site") {
    requireMetadata(action, "add-site", ["fixed"], fail);
    rejectUnsupportedFields(action, ["siteType"], fail, effectKindLabel);
    if (!fixedSiteTypes.has(action.siteType))
      fail(`${kind} requires a supported ${siteTypeLabel}`);
    requireNoFollowup(action, fail);
    if (hasTokens(action.effectText))
      fail(`${kind} does not support presentation tokens`);
    return;
  }

  if (kind === "choose-site-type") {
    requireMetadata(action, "add-site", ["site-uniform"], fail);
    rejectUnsupportedFields(action, ["offerCount"], fail, effectKindLabel);
    if (action.offerCount !== 3) fail(`${kind} requires ${offerCountLabel} 3`);
    validateFollowupOverrides(action, fail, true);
    if (hasTokens(action.effectText))
      fail(`${kind} does not support presentation tokens`);
  }
}
