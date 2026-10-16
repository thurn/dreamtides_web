import { readFileSync } from "node:fs";
import type { EngineCatalog } from "../../src/engine/catalog";
import { parseCardId } from "../../src/types/card-identity";
import { parseAvatarId, parseDreamsignId, parseTideId, parseOpponentId, parseAffiliationId, parseApollyonIncarnationId } from "../../src/types/identifiers";
import { parseJourneySeed } from "../../src/types/journey-seed";
import { parseContentHash } from "../../src/types/content-hash";
import type { ApollyonIncarnationContent } from "../../src/types/content";
import type { DeckPool, PoolDeck } from "./types";
import { digest } from "./provenance";
import SETTINGS from "./catalog.json";

export function object(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("Expected an object");
  return value as Record<string, unknown>;
}
export function text(value: unknown): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error("Expected non-empty text");
  return value;
}
export function integer(value: unknown, minimum: number, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) throw new Error("Integer outside supported range");
  return value;
}
export function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error("Expected an array");
  return value;
}
/** Decode identities before lookup; card repetitions are separate physical deck entries. */
export interface PoolRules { readonly tides: ReadonlySet<PoolDeck["archetypes"][number]>; readonly affiliations: ReadonlySet<NonNullable<PoolDeck["affiliationId"]>>; readonly abilityActiveFromLayer: number; readonly dreamsignsFromLayer: number; readonly deckSize: number; readonly incarnations?: readonly ApollyonIncarnationContent[]; readonly rosterAvatarIds?: ReadonlySet<PoolDeck["avatarId"]> }
export function decodePool(value: unknown, catalog: EngineCatalog, rules?: PoolRules): DeckPool {
  const raw = object(value);
  if (raw.schemaVersion !== 1) throw new Error("Unsupported pool schema");
  const provenance = object(raw.provenance);
  const generatedAt = text(provenance.generatedAt);
  if (!Number.isFinite(Date.parse(generatedAt)) || provenance.apollyon !== "hv-umm2.295") throw new Error("Invalid pool provenance");
  const seen = new Set<PoolDeck["id"]>();
  const decks = array(raw.decks).map((value): PoolDeck => {
    const entry = object(value);
    const id = parseOpponentId(entry.id);
    if (seen.has(id)) throw new Error("Duplicate pool deck identity");
    seen.add(id);
    const avatarId = parseAvatarId(entry.avatarId);
    catalog.avatar(avatarId);
    const incarnationId = entry.incarnationId === undefined ? undefined : parseApollyonIncarnationId(entry.incarnationId);
    const incarnation = incarnationId === undefined ? undefined : rules?.incarnations?.find((boss) => boss.id === incarnationId);
    if (incarnationId !== undefined && (incarnation === undefined || incarnation.aspect.id !== avatarId)) throw new Error("Unknown incarnation or mismatched Aspect");
    if (incarnationId === undefined && rules?.rosterAvatarIds !== undefined && !rules.rosterAvatarIds.has(avatarId)) throw new Error("Ordinary deck requires a roster Avatar");
    const cards = array(entry.cards).map(parseCardId);
    if (cards.length === 0) throw new Error("Empty pool deck");
    for (const card of cards) catalog.card(card);
    const dreamsigns = array(entry.dreamsigns).map(parseDreamsignId);
    for (const dreamsign of dreamsigns) catalog.dreamsign(dreamsign);
    const archetypes = array(entry.archetypes).map(parseTideId);
    if (new Set(archetypes).size !== archetypes.length || archetypes.length === 0) throw new Error("Invalid archetype identities");
    if (rules !== undefined && archetypes.some((tide) => !rules.tides.has(tide))) throw new Error("Unknown archetype UUID");
    if (typeof entry.abilityActive !== "boolean") throw new Error("Invalid avatar activation");
    const layer = integer(entry.layer, Math.min(...SETTINGS.layers), Math.max(...SETTINGS.layers));
    const affiliationId = entry.affiliationId === null ? null : parseAffiliationId(entry.affiliationId);
    if (rules !== undefined && ((affiliationId !== null && !rules.affiliations.has(affiliationId)) || entry.abilityActive !== (layer >= rules.abilityActiveFromLayer) || cards.length !== rules.deckSize || (incarnation === undefined ? dreamsigns.length !== (layer >= rules.dreamsignsFromLayer ? 1 : 0) : false))) throw new Error("Pool deck contradicts generator metadata");
    if (incarnation !== undefined && (layer !== SETTINGS.apollyon.layer || !entry.abilityActive || affiliationId !== null || JSON.stringify(dreamsigns) !== JSON.stringify(incarnation.dreamsignIds) || incarnation.deckRecipe.signatureCardIds.some((id) => cards.filter((card) => card === id).length !== 1) || incarnation.deckRecipe.archetypeTideIds.some((id) => !archetypes.includes(id)))) throw new Error("Pool boss contradicts authored recipe");
    return {
      ...(incarnationId === undefined ? {} : { incarnationId }),
      id, avatarId, cards, dreamsigns, archetypes,
      layer,
      abilityActive: entry.abilityActive,
      affiliationId,
      poolSeed: integer(entry.poolSeed, 0, 0xffffffff),
    };
  });
  if (decks.length < 2) throw new Error("Pool requires at least two decks");
  const addition = raw.apollyonAppend === undefined ? undefined : object(raw.apollyonAppend);
  const apollyonAppend = addition === undefined ? undefined : { generatedAt: text(addition.generatedAt), reason: text(addition.reason), sourceHash: parseContentHash(addition.sourceHash), basePoolHash: parseContentHash(addition.basePoolHash) };
  if (apollyonAppend !== undefined && !Number.isFinite(Date.parse(apollyonAppend.generatedAt))) throw new Error("Invalid append timestamp");
  return { schemaVersion: 1, ...(apollyonAppend === undefined ? {} : { apollyonAppend }), provenance: { generatedAt, reason: text(provenance.reason), seed: parseJourneySeed(provenance.seed), sourceHash: parseContentHash(provenance.sourceHash), apollyon: "hv-umm2.295" }, decks };
}
export function readPool(path: string, catalog: EngineCatalog, rules?: PoolRules) {
  const bytes = readFileSync(path);
  return { pool: decodePool(JSON.parse(bytes.toString("utf8")), catalog, rules), poolHash: digest(bytes) };
}
