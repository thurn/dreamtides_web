import { battleSeed, type Side } from "../../src/engine/state/ids";
import type { DreamwellCardId } from "../../src/types/identifiers";
import { parseGameId } from "../../src/types/identifiers";
import { PolicyRandom } from "../../src/engine/policy/random";
import type { DeckPool, MatchSpec, TournamentConfig, PoolDeck } from "./types";

/** Each pair keeps deck seats and first seat fixed, exchanging only policy assignments. */
export function schedule(config: TournamentConfig, pool: DeckPool, dreamwell: readonly DreamwellCardId[], scoreTargets: readonly number[]): MatchSpec[] {
  if (!Number.isSafeInteger(config.games) || config.games <= 0 || config.games % 2 !== 0) throw new Error("Games must be a positive even integer");
  const layers = [...new Set(pool.decks.map((deck) => deck.layer))].sort((a, b) => a - b);
  return Array.from({ length: config.games }, (_, ordinal): MatchSpec => {
    const pair = Math.floor(ordinal / 2);
    const leg = ordinal % 2 === 0 ? 0 : 1;
    const layer = layers[pair % layers.length];
    const candidates = pool.decks.filter((deck) => deck.layer === layer);
    if (candidates.length < 2) throw new Error("Every selected layer requires two decks");
    const seed = battleSeed(`${config.seed}|battle|${String(pair)}`);
    const random = new PolicyRandom(battleSeed(`${config.seed}|pairing|${String(pair)}`));
    const player = random.pick(candidates);
    const enemy = random.pick(candidates.filter((deck) => deck.id !== player.id));
    const decks = { player, enemy };
    const policies = leg === 0 ? { player: config.a, enemy: config.b } : { player: config.b, enemy: config.a };
    const startingSide: Side = pair % 2 === 0 ? "player" : "enemy";
    const scoreToWin = scoreTargets[Math.min(layer ?? 0, scoreTargets.length - 1)];
    if (scoreToWin === undefined || !Number.isSafeInteger(scoreToWin) || scoreToWin <= 0) throw new Error("Invalid score target catalog");
    const avatar = (deck: PoolDeck) => deck.abilityActive ? deck.avatarId : undefined;
    return { ordinal, gameId: parseGameId(`${config.seed}|game|${String(ordinal)}`), pair, leg, decks, policies,
      init: { seed, scoreToWin, startingSide,
        decks: { player: player.cards.map((cardId) => ({ cardId })), enemy: enemy.cards.map((cardId) => ({ cardId })) },
        avatars: { ...(avatar(player) === undefined ? {} : { player: player.avatarId }), ...(avatar(enemy) === undefined ? {} : { enemy: enemy.avatarId }) },
        dreamsigns: { player: player.dreamsigns, enemy: enemy.dreamsigns }, dreamwell,
      },
    };
  });
}
