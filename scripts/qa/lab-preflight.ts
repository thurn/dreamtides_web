/** Node-only card-lab preflight. Run before the browser sweep with the same card/variant/side options. */
import { loadavg } from "node:os";
import { engineDeckEntry } from "../../src/battle/integration/engine-battle-init";
import { loadCardsV2Database } from "../../src/data/cards-v2-database";
import { loadTransfigurationData } from "../../src/data/transfiguration-data";
import { createCatalog } from "../../src/engine/catalog";
import { contentAvatarDefinitions, contentCardDefinitions, contentDreamsignDefinitions, contentDreamwellDefinitions, contentFigmentDefinitions } from "../../src/engine/content-catalog";
import { createEngine } from "../../src/engine/engine";
import { SIDES, type Side } from "../../src/engine/state/ids";
import { CARD_LAB_VARIANTS, cardLabVariant, variantTransfiguration, type CardLabVariant } from "../../src/engine/testing/card-lab";
import { runCardLabPreflight, runDreamwellLabPreflight } from "../../src/engine/testing/lab-preflight";
import { PROMPT_LAB_DEFINITIONS } from "../../src/engine/testing/prompt-lab";
import { eligibleTransfigurations } from "../../src/transfiguration/transfiguration-logic";
import { parseCardId, type CardId } from "../../src/types/card-identity";
import { parseDeckEntryId, parseDreamwellCardId } from "../../src/types/identifiers";

function options(argv: readonly string[]) {
  let cards: CardId[] = [];
  let variants: readonly CardLabVariant[] = CARD_LAB_VARIANTS;
  let sides: readonly Side[] = SIDES;
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    const value = argv[++index];
    if (value === undefined) throw new Error(`${argument} requires a value`);
    switch (argument) {
      case "--cards": cards = value.split(",").map(parseCardId); break;
      case "--variants":
        variants = value === "all" ? CARD_LAB_VARIANTS : value.split(",").map((token) => {
          const variant = cardLabVariant(token);
          if (variant === null) throw new Error(`Unknown variant ${token}`);
          return variant;
        });
        if (variants[0] !== "base") variants = ["base", ...variants.filter((variant) => variant !== "base")];
        break;
      case "--as":
        if (value !== "both" && value !== "player" && value !== "enemy") throw new Error("--as is player, enemy, or both");
        sides = value === "both" ? SIDES : [value];
        break;
      default: throw new Error(`Unknown argument ${argument}`);
    }
  }
  if (cards.length === 0) throw new Error("--cards <uuid,...> is required");
  return { cards, variants, sides };
}

function main() {
  const started = performance.now();
  const hostLoad = loadavg()[0];
  const requested = options(process.argv.slice(2));
  const cards = new Map([...loadCardsV2Database().values()].map((card) => [card.id, card]));
  const transfigurations = loadTransfigurationData();
  const pool = contentCardDefinitions();
  const dreamwell = contentDreamwellDefinitions();
  const dreamwellById = new Map(dreamwell.map((card) => [card.id, card]));
  // Content UUIDs have precedence; append only lab definitions not already present.
  const withLab = <Id, T extends { readonly id: Id }>(content: readonly T[], lab: readonly T[]): T[] => {
    const known = new Set(content.map((entry) => entry.id));
    return [...content, ...lab.filter((entry) => !known.has(entry.id))];
  };
  const engine = createEngine(createCatalog(
    withLab(pool, PROMPT_LAB_DEFINITIONS.cards), dreamwell,
    {
      avatars: withLab(contentAvatarDefinitions(), PROMPT_LAB_DEFINITIONS.emblems.avatars ?? []),
      dreamsigns: withLab(contentDreamsignDefinitions(), PROMPT_LAB_DEFINITIONS.emblems.dreamsigns ?? []),
    },
    withLab(contentFigmentDefinitions(), PROMPT_LAB_DEFINITIONS.figments),
  ));
  const counts = { pass: 0, pending: 0, skip: 0, fail: 0 };
  for (const uuid of requested.cards) for (const side of requested.sides) for (const variant of requested.variants) {
    const runStarted = performance.now();
    const card = cards.get(uuid);
    const dreamwellCard = card === undefined ? dreamwellById.get(parseDreamwellCardId(uuid)) : undefined;
    const transfiguration = variantTransfiguration(variant);
    const eligible = card !== undefined && (transfiguration === null || eligibleTransfigurations(transfigurations, card).includes(transfiguration));
    const row = dreamwellCard !== undefined
      ? variant !== "base"
        ? { uuid: dreamwellCard.id, side, variant, verdict: "skip" as const, reason: "ineligibleVariant", detail: null }
        : runDreamwellLabPreflight(engine, { cardId: dreamwellCard.id, side }, dreamwell.map((definition) => definition.id))
      : card === undefined
      ? { uuid, side, variant, verdict: "fail" as const, reason: "unknownCard", detail: "UUID is absent from the content catalog" }
      : !eligible
        ? { uuid, side, variant, verdict: "skip" as const, reason: "ineligibleVariant", detail: null }
        : runCardLabPreflight(engine, {
          entry: engineDeckEntry({ entryId: parseDeckEntryId("card-lab"), cardNumber: card.cardNumber, transfiguration, isBane: false }, card, transfigurations),
          variant, side,
        }, pool);
    counts[row.verdict]++;
    console.log(JSON.stringify({ ...row, elapsedMs: performance.now() - runStarted }));
  }
  console.log(JSON.stringify({ event: "labPreflightSummary", ...requested, counts, elapsedMs: performance.now() - started, hostLoad, enemyMode: "scripted-lab-play-first-legal-prompts" }));
  process.exitCode = counts.fail > 0 ? 1 : 0;
}

try { main(); } catch (error) {
  console.error(JSON.stringify({ event: "labPreflightError", detail: error instanceof Error ? error.message : String(error) }));
  process.exitCode = 2;
}
