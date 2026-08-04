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

export interface EntityReferenceDisplayDetails {
  /** Canonical UUID used for QA and logging. */
  readonly id: string;
  /** Display name resolved from the canonical entity object. */
  readonly name: string;
}

/** Resolve canonical display details for an entity reference. */
export function entityReferenceDisplayDetails(
  entity: EntityReferenceModel,
): EntityReferenceDisplayDetails {
  return entity.kind === "card"
    ? { id: entity.card.id, name: entity.card.name }
    : {
        id: requireDreamsignId(entity.dreamsign, "Entity reference"),
        name: entity.dreamsign.name,
      };
}

function entityReferenceRevealDetails(
  entity: EntityReferenceModel,
) {
  if (entity.kind === "card") {
    return {
      id: entity.card.id,
      name: entity.card.name,
      identity: { entityType: "game-card", entityId: entity.card.id },
      spec: gameCardRevealSpec({
        cardId: entity.card.id,
        displaySnapshot: entity.card,
      }),
    };
  }

  const id = requireDreamsignId(entity.dreamsign, "Entity reference");
  return {
    id,
    name: entity.dreamsign.name,
    identity: {
      entityType: "dreamsign",
      entityId: revealEntityId("dreamsign", id),
    },
    spec: dreamsignRevealSpec(
      entity.dreamsign,
      Boolean(entity.dreamsign.imageName),
    ),
  };
}

export interface UseEntityReferenceRevealSourceOptions {
  /** Action fired for a quick touch, mouse click, or keyboard activation. */
  readonly onActivate?: () => void;
  /** Source feedback policy; inline reading copy remains stationary. */
  readonly feedback?: "scale" | "stationary";
}

/** Bind an enclosing control to the canonical reveal for one UUID-backed entity. */
export function useEntityReferenceRevealSource(
  entity: EntityReferenceModel,
  options: UseEntityReferenceRevealSourceOptions = {},
) {
  const details = entityReferenceRevealDetails(entity);
  const binding = useRevealSource({
    identity: details.identity,
    spec: details.spec,
    onActivate: options.onActivate,
    feedback: options.feedback,
  });
  return { details, binding };
}

/**
 * An underlined inline card or Dreamsign name. Hover, keyboard focus, and a
 * touch hold reveal the entity through the shared Cumulus coordinator.
 */
export function EntityReference({
  entity,
  testId,
}: EntityReferenceProps) {
  const { details, binding } = useEntityReferenceRevealSource(entity, {
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
      aria-label={`${entity.kind === "card" ? "Card" : "Dreamsign"}: ${details.name}`}
      data-entity-reference={entity.kind}
      data-entity-reference-id={details.id}
      data-testid={testId}
      style={{
        ...binding.sourceProps.style,
        cursor: "default",
        font: "inherit",
        textDecoration: "underline",
      }}
    >
      {details.name}
    </Pressable>
  );
}
