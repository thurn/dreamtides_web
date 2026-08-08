import { createHash } from "node:crypto";

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
}

function hash(value) {
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}

function camel(key) {
  return key.replace(/[-_]([a-z])/gu, (_, letter) => letter.toUpperCase());
}

function normalize(value) {
  if (Array.isArray(value)) return value.map(normalize);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [camel(key), normalize(child)]));
}

function variant(value, path) {
  if (typeof value === "string") return { kind: camel(value[0].toLowerCase() + value.slice(1)) };
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${path}: expected a typed variant`);
  }
  const entries = Object.entries(value);
  if (entries.length !== 1) throw new Error(`${path}: expected exactly one variant key`);
  const [name, payload] = entries[0];
  return { kind: camel(name[0].toLowerCase() + name.slice(1)), ...normalize(payload) };
}

function catalog(payload, gameplay) {
  const normalized = { schemaVersion: 1, ...payload };
  const contentHash = hash(normalized);
  return { ...normalized, contentHash, ...(gameplay ? { foldHash: contentHash } : {}) };
}

const GAMBLE_IDS = {
  GravokThreeGateWager: "gravok-three-gate-wager",
  TidemarkLadderClimb: "tidemark-ladder-climb",
  StarwayStairs: "starway-stairs",
  FourSuitReprise: "four-suit-reprise",
  Blackjack: "blackjack",
};

export function compileGambleData(source) {
  if (!Array.isArray(source?.games) || source.games.length !== 5) {
    throw new Error("gamble.toml games: expected the five compiler-validated games");
  }
  const games = source.games.map((game, index) => {
    const id = GAMBLE_IDS[game.id];
    if (id === undefined) throw new Error(`gamble.toml games[${String(index)}].id: unknown game`);
    return {
      id,
      rulesVersion: game.rules_version,
      selection: normalize(game.selection),
      economy: variant(game.economy, `games[${String(index)}].economy`),
      presentation: normalize(game.presentation),
      rules: variant(game.rules, `games[${String(index)}].rules`),
    };
  });
  return catalog({ games }, true);
}

function choiceLimit(value, path) {
  if (value === "All") return null;
  const normalized = variant(value, path);
  if (normalized.kind !== "count" || !Number.isInteger(normalized.Count ?? normalized.count)) {
    const raw = Object.values(value)[0];
    if (Number.isInteger(raw)) return raw;
    throw new Error(`${path}: expected Count or All`);
  }
  return normalized.Count ?? normalized.count;
}

export function compileTransfigurationData(source) {
  if (!Array.isArray(source?.forms) || source.forms.length !== 9 || source.site === undefined) {
    throw new Error("transfiguration.toml: expected site and nine compiler-validated forms");
  }
  const site = normalize(source.site);
  site.standardChoiceLimit = choiceLimit(source.site.standard_choice_limit, "site.standard_choice_limit");
  site.enhancedChoiceLimit = choiceLimit(source.site.enhanced_choice_limit, "site.enhanced_choice_limit");
  const forms = source.forms.map((form, index) => ({
    ...normalize(Object.fromEntries(Object.entries(form).filter(([key]) => !["eligibility", "operation", "pricing", "benefit"].includes(key)))),
    glyph: form.glyph[0].toLowerCase() + form.glyph.slice(1),
    eligibility: variant(form.eligibility, `forms[${String(index)}].eligibility`),
    operation: variant(form.operation, `forms[${String(index)}].operation`),
    pricing: variant(form.pricing, `forms[${String(index)}].pricing`),
    benefit: variant(form.benefit, `forms[${String(index)}].benefit`),
  }));
  return catalog({ site, forms }, true);
}

export function compileTideAlignmentsData(source) {
  const records = source?.["tide-alignments"];
  if (!Array.isArray(records) || records.length !== 5) {
    throw new Error("tide_alignments.toml tide-alignments: expected the five compiler-validated alignments");
  }
  return catalog({ alignments: normalize(records) }, false);
}
