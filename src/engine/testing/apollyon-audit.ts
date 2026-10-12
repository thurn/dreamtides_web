/** Pure structural verifier for the sanctioned Apollyon data-to-engine gate. */
import type { ApollyonDeckRecipe } from "../../content/apollyon/types";
import type { CardId } from "../../types/card-identity";
import { parseAvatarId } from "../../types/identifiers";
import type { ApollyonIncarnationId, AvatarId, DreamsignId, TideId } from "../../types/identifiers";

export interface ApollyonRecipeInput {
  readonly id: ApollyonIncarnationId;
  readonly aspectId: AvatarId;
  readonly deckRecipe: ApollyonDeckRecipe;
  readonly dreamsignIds: readonly DreamsignId[];
}

interface ApollyonReferences {
  readonly incarnationIds: ReadonlySet<ApollyonIncarnationId>;
  readonly avatarIds: ReadonlySet<AvatarId>;
  readonly tideIds: ReadonlySet<TideId>;
  readonly cardIds: ReadonlySet<CardId>;
  readonly dreamsignIds: ReadonlySet<DreamsignId>;
}

/** Collects every identity, reference and cardinality failure, without changing inputs. */
export function apollyonRecipeFailures(
  incarnations: readonly ApollyonRecipeInput[],
  refs: ApollyonReferences,
): string[] {
  const failures: string[] = [];
  const seen = new Set<ApollyonIncarnationId>();
  const aspects = new Set<AvatarId>();
  // Decode only for cross-domain UUID comparison, never for an engine definition.
  const incarnationUuids = new Set([...refs.incarnationIds, ...incarnations.map(({ id }) => id)].map(parseAvatarId));
  for (const { id, aspectId, deckRecipe, dreamsignIds } of incarnations) {
    const report = (message: string): void => { failures.push(`apollyon ${id}: ${message}`); };
    if (!refs.incarnationIds.has(id)) report("unknown incarnation");
    if (seen.has(id)) report("duplicate incarnation");
    seen.add(id);
    if (aspects.has(aspectId)) report(`duplicate aspect ${aspectId}`);
    aspects.add(aspectId);
    if (refs.avatarIds.has(aspectId)) report(`aspect collides with avatar ${aspectId}`);
    if (incarnationUuids.has(aspectId)) report(`aspect collides with incarnation ${aspectId}`);
    if (!refs.avatarIds.has(deckRecipe.poolAvatarId)) report(`unknown pool avatar ${deckRecipe.poolAvatarId}`);
    if (deckRecipe.archetypeTideIds.length === 0) report("empty archetype tides");
    if (deckRecipe.signatureCardIds.length > 10) report("signature cardinality exceeds 10");
    if (dreamsignIds.length < 1 || dreamsignIds.length > 2) report("dreamsign cardinality outside 1–2");
    const check = <Id extends CardId | TideId | DreamsignId>(
      ids: readonly Id[], known: ReadonlySet<Id>, category: string,
    ): void => {
      const unique = new Set<Id>();
      for (const ref of ids) {
        if (!known.has(ref)) report(`unknown ${category} ${ref}`);
        if (unique.has(ref)) report(`duplicate ${category} ${ref}`);
        unique.add(ref);
      }
    };
    check(deckRecipe.archetypeTideIds, refs.tideIds, "archetype tide");
    check(deckRecipe.signatureCardIds, refs.cardIds, "signature card");
    check(dreamsignIds, refs.dreamsignIds, "dreamsign");
  }
  for (const id of refs.incarnationIds) {
    if (!seen.has(id)) failures.push(`apollyon ${id}: missing incarnation`);
  }
  return failures;
}
