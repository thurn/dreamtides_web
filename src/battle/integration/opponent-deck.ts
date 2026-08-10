// Opponent descriptor primitives for the Battle site. Every battle uses
// this module's helpers —
// `selectOpponentDreamAvatar`, `buildOpponentDreamsigns`,
// `resolveBattleAffiliation`, and the run-scaling helpers — to assemble the
// enemy DreamAvatar, its dreamsigns (none in early battles; one from the run
// midpoint onward), and the affiliation the deck leans toward.
import type {
  AffiliationContent,
  DreamAvatarContent,
  DreamscapeContent,
  DreamsignTemplate,
} from "../../types/content";
import type { DreamscapeNode } from "../../types/journey";
import { resolveNodeAffiliation } from "../../affiliations/affiliation-weights";
import type { BattleRng } from "../random";

/**
 * Whether the opposing DreamAvatar's ability is active at this run layer.
 * The opening battle is the sole dormant layer.
 */
export function opponentAbilityIsActive(
  completionLevel: number,
  abilityActiveFromLayer: number,
): boolean {
  return completionLevel >= abilityActiveFromLayer;
}

/**
 * The run length for `state.atlas`: the number of authored layers and therefore
 * the number of battles in the run. An empty synthetic test atlas has one
 * effective layer.
 */
export function resolveRunLayerCount(layers: readonly unknown[]): number {
  return Math.max(1, layers.length);
}

/**
 * Whether an opponent at `completionLevel` carries a Dreamsign under the
 * authored zero-indexed unlock layer.
 */
export function opponentCarriesDreamsign(
  completionLevel: number,
  dreamsignsFromLayer: number,
): boolean {
  return completionLevel >= dreamsignsFromLayer;
}

/**
 * Deterministically selects the opponent DreamAvatar for a battle from the run's
 * `dreamAvatars`. The choice is pinned to the battle seed so it is reproducible
 * per battle entry, and the player's own DreamAvatar is excluded when another
 * candidate exists (the player should face a different rival each battle). Returns
 * `null` only when there are no DreamAvatars at all.
 *
 * When `eligibleDreamAvatarIds` is supplied and non-empty the candidate pool is
 * first narrowed to that set — the resident DreamAvatars of a dreamscape, so the
 * opponent faced in a dreamscape is one of its own residents. The ids are matched
 * case-insensitively. An empty or absent list (e.g. the starter dreamscape, which
 * has no residents) imposes no restriction and the full roster is used. If the
 * restriction would empty the pool it is ignored, so a non-empty roster always
 * yields a DreamAvatar.
 */
export function selectOpponentDreamAvatar(
  dreamAvatars: readonly DreamAvatarContent[],
  playerDreamAvatarId: string | null,
  rng: BattleRng,
  eligibleDreamAvatarIds?: readonly string[] | null,
): DreamAvatarContent | null {
  if (dreamAvatars.length === 0) {
    return null;
  }
  let roster = dreamAvatars;
  if (eligibleDreamAvatarIds != null && eligibleDreamAvatarIds.length > 0) {
    const eligible = new Set(
      eligibleDreamAvatarIds.map((id) => id.toLowerCase()),
    );
    const resident = dreamAvatars.filter((dreamAvatar) =>
      eligible.has(dreamAvatar.id.toLowerCase()),
    );
    if (resident.length > 0) roster = resident;
  }
  const candidates = roster.filter(
    (dreamAvatar) => dreamAvatar.id !== playerDreamAvatarId,
  );
  const pool = candidates.length > 0 ? candidates : roster;
  return pool[rng.nextInt(pool.length)];
}

/**
 * The single dreamsign an opponent brings from the run midpoint onward, drawn
 * deterministically from `dreamsignTemplates` via the battle RNG. Returns an
 * empty list before the midpoint, or when no templates are available.
 */
export function buildOpponentDreamsigns(
  completionLevel: number,
  dreamsignsFromLayer: number,
  dreamsignTemplates: readonly DreamsignTemplate[],
  rng: BattleRng,
): DreamsignTemplate[] {
  if (!opponentCarriesDreamsign(completionLevel, dreamsignsFromLayer)) {
    return [];
  }
  if (dreamsignTemplates.length === 0) {
    return [];
  }
  return [dreamsignTemplates[rng.nextInt(dreamsignTemplates.length)]];
}

/**
 * Resolves the affiliation backing the dreamscape the battle takes place in, or
 * `null` when the battle is in a neutral / starter dreamscape or the affiliation
 * is unknown.
 */
export function resolveBattleAffiliation(
  node: DreamscapeNode | null | undefined,
  dreamscapes: readonly DreamscapeContent[],
  affiliations: readonly AffiliationContent[],
): AffiliationContent | null {
  return resolveNodeAffiliation(node, dreamscapes, affiliations);
}
