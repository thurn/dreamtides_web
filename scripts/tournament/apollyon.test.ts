import { expect, it } from "vitest";
import { createCatalog } from "../../src/engine/catalog";
import { parseCardId } from "../../src/types/card-identity";
import { parseApollyonIncarnationId, parseAvatarId, parseDreamsignId, parseOpponentId, parseTideId } from "../../src/types/identifiers";
import { parseJourneySeed } from "../../src/types/journey-seed";
import type { ApollyonIncarnationContent } from "../../src/types/content";
import { assertApollyonPool, apollyonSchedule, apollyonStatistics } from "./apollyon";
import { decodePool } from "./pool";
import { options } from "./options";
import { digest } from "./provenance";
import type { DeckPool, GameRecord, TournamentConfig } from "./types";

const uuid = (value: number) => `5e5e5e5e-0000-4000-8000-${String(value).padStart(12, "0")}`;
const cards = [1, 2, 3].map((value) => parseCardId(uuid(value)));
const tide = parseTideId(uuid(4)), roster = parseAvatarId(uuid(5));
const dreamsigns = [6, 7].map((value) => parseDreamsignId(uuid(value)));
const incarnations: ApollyonIncarnationContent[] = [10, 20].map((value) => ({
  id: parseApollyonIncarnationId(uuid(value)), title: "synthetic", description: "synthetic", deckType: "synthetic",
  aspect: { id: parseAvatarId(uuid(value + 1)), renderedText: "synthetic", proposedAbilities: () => [], abilities: () => [], verifiedText: "synthetic" },
  deckRecipe: { poolAvatarId: roster, archetypeTideIds: [tide], signatureCardIds: [cards[0]] }, dreamsignIds: [dreamsigns[0], dreamsigns[1]],
}));
const catalog = createCatalog(cards.map((id) => ({ id, cardType: "character", subtype: "Warrior", costs: [], spark: 1, speed: "standard", status: "vanilla", abilities: () => [] })), [], {
  avatars: [roster, ...incarnations.map((boss) => boss.aspect.id)].map((id) => ({ id, status: "vanilla", abilities: () => [] })),
  dreamsigns: dreamsigns.map((id) => ({ id, status: "vanilla", abilities: () => [] })),
});
const rules = { tides: new Set([tide]), affiliations: new Set<never>(), abilityActiveFromLayer: 0, dreamsignsFromLayer: 0, deckSize: cards.length, incarnations, rosterAvatarIds: new Set([roster]) };
const ordinary = [0, 1, 2].map((index) => ({ id: parseOpponentId(`synthetic-atlas-${String(index)}`), layer: 6, avatarId: roster, cards, dreamsigns: [dreamsigns[0]], archetypes: [tide], abilityActive: true, affiliationId: null, poolSeed: index }));
const bosses = incarnations.map((boss, index) => ({ ...ordinary[0], id: parseOpponentId(`synthetic-boss-${String(index)}`), incarnationId: boss.id, avatarId: boss.aspect.id, dreamsigns: boss.dreamsignIds }));
const pool: DeckPool = { schemaVersion: 1, provenance: { generatedAt: "2026-01-01T00:00:00Z", reason: "synthetic", seed: parseJourneySeed("pool"), sourceHash: digest("source"), apollyon: "hv-umm2.295" }, decks: [...ordinary, ...bosses] };
const config: TournamentConfig = { a: "greedy", b: "greedy", games: 20, matchup: "apollyon", seed: parseJourneySeed("matrix"), budgets: { turnPlanning: { iterations: 1 }, response: { iterations: 1 } }, poolHash: digest("pool"), sourceHash: digest("source"), scheduleVersion: 1, runtime: { node: process.version, platform: process.platform, architecture: process.arch } };
const targets = [1, 2, 3, 4, 5, 6, 7];

it("pairs each incarnation against Atlas decks with exchanged physical seats and balanced first moves", () => {
  const matches = apollyonSchedule(config, pool, [], targets);
  expect(apollyonSchedule(config, pool, [], targets)).toEqual(matches);
  expect(matches).toHaveLength(config.games);
  expect(matches.map((match) => match.ordinal)).toEqual(Array.from({ length: config.games }, (_, index) => index));
  for (const boss of bosses) {
    const selected = matches.filter((match) => match.decks.player.incarnationId === boss.incarnationId || match.decks.enemy.incarnationId === boss.incarnationId);
    expect(selected).toHaveLength(config.games / bosses.length);
    expect(new Set(selected.map((match) => match.decks.player.incarnationId === undefined ? match.decks.player.id : match.decks.enemy.id))).toEqual(new Set(ordinary.map((deck) => deck.id)));
    expect(selected.filter((match) => match.decks[match.init.startingSide!].incarnationId === boss.incarnationId)).toHaveLength(selected.length / 2);
    expect(selected.filter((match) => match.decks.player.incarnationId === boss.incarnationId)).toHaveLength(selected.length / 2);
  }
  for (let index = 0; index < matches.length; index += 2) {
    const first = matches[index], second = matches[index + 1];
    expect(first.init.seed).toBe(second.init.seed);
    expect(first.init.startingSide).toBe(second.init.startingSide);
    expect(first.decks.player).toEqual(second.decks.enemy);
    expect(first.decks.enemy).toEqual(second.decks.player);
    expect(first.init.avatars?.player).toBe(first.decks.player.avatarId);
    expect(first.init.dreamsigns?.enemy).toEqual(first.decks.enemy.dreamsigns);
    expect(first.init.scoreToWin).toBe(targets[6]);
  }
  expect(apollyonSchedule(config, pool, [], [3]).every((match) => match.init.scoreToWin === 3)).toBe(true);
  expect(() => apollyonSchedule(config, pool, [], [])).toThrow();
  expect(() => apollyonSchedule({ ...config, games: config.games + 1 }, pool, [], targets)).toThrow();
  expect(() => apollyonSchedule(config, { ...pool, decks: bosses }, [], targets)).toThrow();
  expect(() => apollyonSchedule(config, { ...pool, decks: [...pool.decks, bosses[0]] }, [], targets)).toThrow();
});

it("authenticates the boss marker, Aspect, full recipe signatures and Dreamsigns without applying ordinary one-sign limits", () => {
  expect(decodePool(pool, catalog, rules)).toEqual(pool);
  const boss = bosses[0];
  for (const forged of [
    { ...boss, incarnationId: parseApollyonIncarnationId(uuid(99)) }, { ...boss, avatarId: roster }, { ...boss, incarnationId: undefined },
    { ...boss, dreamsigns: [dreamsigns[0]] }, { ...boss, cards: [cards[1], cards[1], cards[2]] },
    { ...boss, cards: [cards[0], cards[0], cards[2]] }, { ...boss, abilityActive: false }, { ...boss, layer: 5 },
  ]) expect(() => decodePool({ ...pool, decks: [...ordinary, forged] }, catalog, rules)).toThrow();
  expect(() => decodePool(pool, catalog)).toThrow();
  expect(() => decodePool({ ...pool, decks: [...ordinary, { ...boss, incarnationId: undefined, avatarId: roster, dreamsigns: boss.dreamsigns }] }, catalog, rules)).toThrow();
});

it("counts boss wins by the actual deck seat and excludes failed attempts from the matrix", () => {
  const matches = apollyonSchedule(config, pool, [], targets);
  const records: GameRecord[] = matches.map((spec) => ({ event: "tournament.game", timestamp: "2026-01-01T00:00:00Z", ordinal: spec.ordinal, spec,
    outcome: { status: "completed", result: { kind: "victory", winner: spec.leg === 0 ? "player" : "enemy", reason: "score" }, finalStateHash: digest(`result-${String(spec.ordinal)}`), actions: [], startAnswers: [], logs: [], decisionCount: 0, decisionMs: 0 } }));
  const failed: GameRecord = { ...records[0], outcome: { status: "failed", failure: "synthetic", actions: [], startAnswers: [], logs: [], decisionCount: 0, decisionMs: 0 } };
  const stats = apollyonStatistics([...records, failed]);
  expect(stats.map((row) => row.wins)).toEqual(bosses.map(() => config.games / bosses.length));
  expect(stats.every((row) => row.rate === 1 && row.losses === 0 && row.draws === 0)).toBe(true);
  const draws = apollyonStatistics(records.map((record) => ({ ...record, outcome: { ...record.outcome, status: "completed", finalStateHash: digest("draw"), result: { kind: "draw", reason: "turnLimit" } } })));
  expect(draws.every((row) => row.rate === 0.5 && row.wins === 0 && row.draws === config.games / bosses.length)).toBe(true);
});

it("admits same-policy matrices explicitly while ordinary tournaments require distinct policies", () => {
  expect(options(["--apollyon", "--a", "greedy", "--b", "greedy"]).apollyon).toBe(true);
  expect(() => options(["--a", "greedy", "--b", "greedy"])).toThrow();
  expect(() => options(["--apollyon", "--a", "random", "--b", "greedy"])).toThrow();
  expect(() => options(["--apollyon", "--a", "greedy", "--b", "greedy", "--games", "100"])).toThrow();
});

it("requires the complete supplied incarnation set before public matrix execution", () => {
  const ids = incarnations.map((boss) => boss.id);
  expect(() => assertApollyonPool(pool, ids)).not.toThrow();
  expect(() => assertApollyonPool({ ...pool, decks: [...ordinary, bosses[0]] }, ids)).toThrow();
  expect(() => assertApollyonPool({ ...pool, decks: [...pool.decks, bosses[0]] }, ids)).toThrow();
  expect(() => assertApollyonPool(pool, [...ids, parseApollyonIncarnationId(uuid(99))])).toThrow();
});
