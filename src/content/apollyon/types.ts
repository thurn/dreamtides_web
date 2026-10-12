import type { AbilityList } from "../../engine/dsl/types";
import type { CardId } from "../../types/card-identity";
import type { ApollyonIncarnationId, AvatarId, DreamsignId, TideId } from "../../types/identifiers";
import type { ContentStatus, Uuid } from "../define";
import type { DisplayText } from "../../runtime/text";

/** A genuine permanent emblem occupying the engine's Avatar slot. */
export type ApollyonAspect<Id = AvatarId> = {
  readonly id: Id;
  readonly renderedText: string;
  /** Provisional design specification; the engine reads only authored `abilities`. */
  readonly proposedAbilities: AbilityList;
} & ContentStatus;

/** The real roster pool provides variety; typed tides bias its curated fill. */
export interface ApollyonDeckRecipe<A = AvatarId, T = TideId, C = CardId> {
  readonly poolAvatarId: A;
  readonly archetypeTideIds: readonly T[];
  readonly signatureCardIds: readonly C[];
}

export interface ApollyonDesign<A = AvatarId, T = TideId, C = CardId, D = DreamsignId> {
  readonly aspect: ApollyonAspect<A>;
  readonly deckRecipe: ApollyonDeckRecipe<A, T, C>;
  readonly dreamsignIds: readonly [D] | readonly [D, D];
}

/** Literal authoring data is branded when the incarnation catalog loads. */
export interface ApollyonIncarnationDefinition extends ApollyonDesign<Uuid, Uuid, Uuid, Uuid> {
  readonly id: Uuid;
  readonly title: string;
  readonly description: string;
  readonly deckType: DisplayText;
}

export interface ApollyonBattleConfig<Incarnation extends { readonly id: ApollyonIncarnationId }> {
  readonly incarnations: readonly Incarnation[];
  readonly legacyDefaultIncarnationId: ApollyonIncarnationId;
}
