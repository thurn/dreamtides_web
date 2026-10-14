import type { BoundValue, CardFilter, CharacterSelector, Cost, NamedTrigger, PaymentCost } from "../engine/dsl/types";

/** One cost of a stated Reclaim cost ("Reclaim 0●"), as the player reads it. */
export function costPhrase(cost: Cost): string {
  switch (cost.cost) {
    case "energy":
      return `${String(cost.amount)} energy`;
    case "energyX":
      return "X energy";
    case "exhaustSelf":
      return "exhaust it";
    case "abandon":
      return cost.count === "x" ? "abandon X characters" : `abandon ${plural(cost.count, "character", "characters")}`;
    case "return":
      return `return ${plural(cost.count, "character", "characters")} to hand`;
    case "discard":
      if (cost.count === "hand") return "discard your hand";
      return cost.count === "x" ? "discard X cards" : `discard ${plural(cost.count, "card", "cards")}`;
    case "counters":
      return `remove ${plural(cost.amount, "memory counter", "memory counters")}`;
    case "points":
      return `pay ${plural(cost.amount, "point", "points")}`;
    case "banishFromAnyVoid":
      return `banish ${plural(cost.count, "card", "cards")} from ${cost.player === "any" ? "either void" : cost.player === "opponent" ? "the opponent's void" : "your void"}`;
    case "banishFromVoid":
      return `banish ${cost.count === "x" ? "X cards" : plural(cost.count, "card", "cards")} from your void`;
    case "banishFromHand":
      return `banish ${plural(cost.count, "other card", "other cards")} from your hand`;
    case "reveal":
      return `reveal ${plural(cost.count, "card", "cards")}`;
    case "choice":
      return cost.options.map((option) => option.map(costPhrase).join(" and ")).join(" or ");
    case "optional":
      return `optionally ${cost.costs.map(costPhrase).join(" and ")}`;
  }
}

/** A named (▸) trigger restriction, shared by card and character descriptions. */
function namedAbilityPhrase(name: NamedTrigger | undefined): string {
  const labels = { materialized: "Materialized", dawn: "Dawn", dusk: "Dusk", night: "Night", challenge: "Challenge", dissolved: "Dissolved" } satisfies Record<NamedTrigger, string>;
  return name === undefined ? "" : `with ▸${labels[name]} abilities`;
}

/** Each authorable restriction supplies both permission qualification and its ordered copy. */
export function permissionFilterFields(filter: CardFilter, many: boolean) {
  const { costAtLeast: lower, costAtMost: upper, sparkAtLeast: sparkLower, sparkAtMost: sparkUpper } = filter;
  return {
    fast: { qualified: filter.fast === true, text: filter.fast === true ? "Fast" : "" },
    costAtLeast: {
      qualified: lower !== undefined,
      text: lower === undefined ? "" : upper === undefined ? `≥${String(lower)} energy cost`
        : lower === upper ? `${String(lower)} energy cost` : `${String(lower)}–${String(upper)} energy cost`,
    },
    costAtMost: {
      qualified: upper !== undefined,
      text: lower === undefined && upper !== undefined ? `≤${String(upper)} energy cost` : "",
    },
    sparkAtLeast: {
      qualified: sparkLower !== undefined,
      text: sparkLower === undefined ? "" : sparkUpper === undefined ? `≥${String(sparkLower)}✦`
        : sparkLower === sparkUpper ? `${String(sparkLower)}✦` : `${String(sparkLower)}–${String(sparkUpper)}✦`,
    },
    sparkAtMost: {
      qualified: sparkUpper !== undefined,
      text: sparkLower === undefined && sparkUpper !== undefined ? `≤${String(sparkUpper)}✦` : "",
    },
    subtype: { qualified: Boolean(filter.subtype), text: filter.subtype },
    cardType: { qualified: filter.cardType !== undefined, text: `${filter.cardType ?? "card"}${many ? "s" : ""}` },
    hasAbility: { qualified: filter.hasAbility !== undefined, text: namedAbilityPhrase(filter.hasAbility) },
  } satisfies Record<keyof CardFilter, { readonly qualified: boolean; readonly text: string | undefined }>;
}

/** The permission's effective type/subtype, copiable speed/cost, and spark restrictions. */
export function permittedCardKind(filter: CardFilter, many: boolean): string {
  return Object.values(permissionFilterFields(filter, many)).map((field) => field.text).filter(Boolean).join(" ");
}

function plural(count: number, one: string, many: string): string {
  return `${String(count)} ${count === 1 ? one : many}`;
}

/** A choice names every payment together, including the empty alternative. */
export function costOptionLabel(costs: readonly PaymentCost[]): string {
  const text = costs.length === 0 ? "pay nothing" : costs.map(choiceCostPhrase).join(" and ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function boundPhrase(bound: BoundValue): string {
  if (typeof bound === "number") return String(bound);
  if (bound.value === "x") return "X";
  if (bound.value === "sourceSpark") return "this character’s spark";
  const cards = bound.zone === "void" ? permittedCardKind(bound.filter, true) : "cards";
  return `the number of ${cards} in ${bound.player === "you" ? "your" : "your opponent’s"} ${bound.zone}`;
}

function characterLeafPhrase(count: number | "x", selector: Omit<CharacterSelector, "anyOf">): string {
  const adjectives = [
    selector.another === true ? "other" : "",
    selector.exhausted === undefined ? "" : selector.exhausted ? "exhausted" : "ready",
    selector.rank === undefined ? "" : `${selector.rank}-rank`,
    selector.figment === undefined ? "" : selector.figment ? "figment" : "non-figment",
    selector.subtype ?? "",
    selector.notSubtype === undefined ? "" : `non-${selector.notSubtype}`,
  ].filter(Boolean);
  const restrictions = [
    selector.controller === "any" ? "" : selector.controller === "you" ? "you control" : "your opponent controls",
    namedAbilityPhrase(selector.hasAbility),
    selector.challenging === undefined ? "" : selector.challenging ? `that ${count === 1 ? "is" : "are"} challenging` : `that ${count === 1 ? "is" : "are"} not challenging`,
    selector.blocking === undefined ? "" : selector.blocking ? `that ${count === 1 ? "is" : "are"} blocking` : `that ${count === 1 ? "is" : "are"} not blocking`,
    ...(["sparkAtMost", "sparkAtLeast", "costAtMost", "costAtLeast"] as const).flatMap((key) => {
      const bound = selector[key];
      return bound === undefined ? [] : [`with ${key.startsWith("spark") ? "spark" : "energy cost"} at ${key.endsWith("Most") ? "most" : "least"} ${boundPhrase(bound)}`];
    }),
  ].filter(Boolean);
  return [count === "x" ? "X" : String(count), ...adjectives, count === 1 ? "character" : "characters", ...restrictions].join(" ");
}

function characterCostPhrase(count: number | "x", selector: CharacterSelector): string {
  const outer = characterLeafPhrase(count, selector);
  if (selector.anyOf === undefined) return outer;
  if (selector.anyOf.length === 0) return `${outer} matching no characters`;
  const alternatives = selector.anyOf.map(branch => characterLeafPhrase(1, { ...branch, controller: "any" }).slice(2));
  return `${outer} matching at least one of (${alternatives.join(" or ")})`;
}

function variableMinimum(cost: Extract<PaymentCost, { readonly count: number | "x" }>): string {
  return cost.count === "x" && "min" in cost && cost.min !== undefined ? ` (X is at least ${String(cost.min)})` : "";
}

function filteredCards(count: number | "x", filter: CardFilter): string {
  return `${count === "x" ? "X" : String(count)} ${permittedCardKind(filter, count !== 1)}`;
}

/** Cost-choice copy keeps its authored restrictions; stated Reclaim copy uses `costPhrase`. */
function choiceCostPhrase(cost: PaymentCost): string {
  const capture = "captureSpark" in cost && cost.captureSpark === true ? " and use its spark as X" :
    "captureCost" in cost && cost.captureCost === true ? " and use its energy cost as X" : "";
  switch (cost.cost) {
    case "energy":
      return `pay ${costPhrase(cost)}`;
    case "abandon":
      return `abandon ${"kind" in cost.selector ? "this character" : characterCostPhrase(cost.count, cost.selector)}${capture}${variableMinimum(cost)}`;
    case "return":
      return `return ${characterCostPhrase(cost.count, cost.selector)} to hand`;
    case "discard":
      return cost.count === "hand" ? costPhrase(cost) : `discard ${filteredCards(cost.count, cost.filter)}${capture}${variableMinimum(cost)}`;
    case "banishFromVoid":
      return `banish ${filteredCards(cost.count, cost.filter)} from your void${variableMinimum(cost)}`;
    case "banishFromAnyVoid":
      return `banish ${filteredCards(cost.count, cost.filter)} from ${cost.player === "any" ? "either void" : cost.player === "opponent" ? "your opponent’s void" : "your void"}`;
    case "reveal":
      return `reveal ${filteredCards(cost.count, cost.filter)}`;
    default:
      return costPhrase(cost);
  }
}
