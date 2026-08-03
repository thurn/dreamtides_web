import type { FrozenCardData } from "../../../types/cards";
import type { Dreamsign } from "../../../types/journey";
import { requireDreamsignId } from "../../../data/dreamsigns";
import { useRevealSource } from "../../internal/reveal/context";
import { revealEntityId } from "../../internal/reveal/identity";
import { Pressable } from "../../primitives/Pressable";
import { gameCardRevealSpec } from "./CardView";
import { dreamsignRevealSpec } from "../hud/Dreamsign";

export type EntityReferenceModel =
  | {
      /** Show the complete canonical card reading copy. */
      readonly kind: "card";
      /** Complete card data resolved by UUID immediately before display. */
      readonly card: FrozenCardData;
    }
  | {
      /** Show the canonical Dreamsign object InfoCard. */
      readonly kind: "dreamsign";
      /** Complete Dreamsign data resolved by UUID immediately before display. */
      readonly dreamsign: Dreamsign;
    };

export interface EntityReferenceProps {
  /** The UUID-backed card or Dreamsign named by the surrounding sentence. */
  readonly entity: EntityReferenceModel;
  /** Optional stable selector for the semantic source. */
  readonly testId?: string;
}

/**
 * An underlined inline card or Dreamsign name. Hover, keyboard focus, and a
 * touch hold reveal the entity through the shared Cumulus coordinator.
 */
export function EntityReference({
  entity,
  testId,
}: EntityReferenceProps) {
  const isCard = entity.kind === "card";
  const id = isCard
    ? entity.card.id
    : requireDreamsignId(entity.dreamsign, "Entity reference");
  const name = isCard ? entity.card.name : entity.dreamsign.name;
  const binding = useRevealSource({
    identity: isCard
      ? { entityType: "game-card", entityId: entity.card.id }
      : {
          entityType: "dreamsign",
          entityId: revealEntityId("dreamsign", id),
        },
    spec: isCard
      ? gameCardRevealSpec({
          cardId: entity.card.id,
          displaySnapshot: entity.card,
        })
      : dreamsignRevealSpec(
          entity.dreamsign,
          Boolean(entity.dreamsign.imageName),
        ),
    feedback: "stationary",
  });

  return (
    <Pressable
      as="span"
      ref={binding.ref}
      {...binding.sourceProps}
      pressFeedback="stationary"
      hoverFeedback="stationary"
      tabIndex={0}
      aria-label={`${isCard ? "Card" : "Dreamsign"}: ${name}`}
      data-entity-reference={entity.kind}
      data-entity-reference-id={id}
      data-testid={testId}
      style={{
        ...binding.sourceProps.style,
        cursor: "default",
        font: "inherit",
        textDecoration: "underline",
      }}
    >
      {name}
    </Pressable>
  );
}
