import { useRef, type CSSProperties, type ReactElement } from "react";
import type { LocalizedString } from "@trox/runtime";
import { useLocalizer } from "../../../runtime/localization/use-localizer";
import { useRevealSource } from "../../internal/reveal/context";
import { revealEntityId } from "../../internal/reveal/identity";
import { token } from "../../primitives/tokens";
import { renderRulesSymbolsInline } from "../card/RulesText";
import { Pressable } from "../../primitives/Pressable";
import { gameCardRevealSpec, type GameCardModel } from "../card/CardView";
import { dreamsignRevealSpec, type LocalizedDreamsign } from "../hud/Dreamsign";
import type { DeckEntryId } from "../../../types/identifiers";
import type {
  DreamsignId,
  ExplorationActionId,
} from "../../../types/identifiers";
import type { CardId } from "../../../types/card-identity";

/** Shared presentation fields for a revealable Exploration entity. */
interface ExplorationChoiceEntityBase {
  /** Stable deck-entry UUID when the entity is a concrete deck object. */
  readonly entryId?: DeckEntryId;
  /** Number of identical UUID-resolved copies represented by the entity. */
  readonly copies?: number;
  /** Localized inline label shown in the authored description. */
  readonly label: LocalizedString;
}

/** Closed presentation-only entity union supported by Exploration choices. */
export type ExplorationChoiceEntity =
  | (ExplorationChoiceEntityBase & {
      /** Reveals a complete game-card presentation. */
      readonly kind: "card";
      /** Stable canonical card UUID. */
      readonly id: CardId;
      /** Complete resolved card model used by the reveal coordinator. */
      readonly card: GameCardModel;
    })
  | (ExplorationChoiceEntityBase & {
      /** Reveals a complete Dreamsign presentation. */
      readonly kind: "dreamsign";
      /** Stable canonical Dreamsign UUID. */
      readonly id: DreamsignId;
      /** Complete localized Dreamsign used by the reveal coordinator. */
      readonly dreamsign: LocalizedDreamsign;
    });

/** One authored unit in an ordered Exploration action description. */
export type ExplorationChoicePart =
  | {
      /** Plain localized prose. */
      readonly kind: "text";
      /** Complete localized prose fragment. */
      readonly value: LocalizedString;
    }
  | {
      /** Localized rules text whose semantic glyphs should render inline. */
      readonly kind: "rules";
      /** Complete localized rules fragment. */
      readonly value: LocalizedString;
    }
  | {
      /** Revealable inline entity. */
      readonly kind: "entity";
      /** Complete presentation-only entity model. */
      readonly entity: ExplorationChoiceEntity;
    };

/** Complete prepared presentation for one Exploration action. */
export interface ExplorationChoiceModel {
  /** Stable authored action UUID emitted by activation. */
  readonly actionId: ExplorationActionId;
  /** Localized primary action label. */
  readonly label: LocalizedString;
  /** Ordered authored description parts prepared by the builder. */
  readonly description: readonly ExplorationChoicePart[];
  /** Optional complete localized disclosure appended to the description. */
  readonly disclosure?: LocalizedString;
  /** Prepared activation availability; unavailable choices remain readable. */
  readonly availability: "available" | "unavailable";
  /** Optional entity revealed by holding or focusing the complete choice. */
  readonly preview?: ExplorationChoiceEntity;
}

export interface ExplorationChoiceProps {
  /** Complete prepared action presentation. */
  readonly model: ExplorationChoiceModel;
  /** Reports the exact authored action UUID after activation. */
  readonly onPress: (actionId: ExplorationActionId) => void;
}

function choiceStyle(
  available: boolean,
  revealStyle?: CSSProperties,
): CSSProperties {
  return {
    ...revealStyle,
    width: "100%",
    minHeight: token("--touch-min"),
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    alignItems: "center",
    gap: token("--space-s"),
    padding: token("--space-s"),
    border: `1px solid ${token("--border-soft")}`,
    borderRadius: token("--radius-control"),
    background: token("--glass-on-glass-fill"),
    color: token("--text-on-glass"),
    textAlign: "left",
    opacity: available ? 1 : 0.46,
  };
}

function EntityLabel({
  entity,
}: {
  readonly entity: ExplorationChoiceEntity;
}): ReactElement {
  const resolve = useLocalizer();
  const registration = entityRevealRegistration(entity);
  const binding = useRevealSource(registration);
  return (
    <span
      ref={binding.ref}
      {...binding.sourceProps}
      data-exploration-entity-label={entity.kind}
      data-entity-id={entity.id}
      data-exploration-deck-entry-id={entity.entryId}
      data-entity-copies={entity.copies ?? 1}
      style={{ ...binding.sourceProps.style, textDecoration: "underline" }}
      tabIndex={0}
    >
      {resolve(entity.label)}
    </span>
  );
}

function entityRevealRegistration(entity: ExplorationChoiceEntity) {
  if (entity.kind === "card") {
    const spec = gameCardRevealSpec(entity.card);
    return {
      identity: {
        entityType:
          (entity.copies ?? 1) === 1
            ? ("game-card" as const)
            : ("game-card-copies" as const),
        entityId: revealEntityId(
          (entity.copies ?? 1) === 1 ? "game-card" : "game-card-copies",
          entity.id,
        ),
      },
      spec:
        (entity.copies ?? 1) === 1
          ? spec
          : {
              ...spec,
              primary: { ...spec.primary, copies: entity.copies ?? 1 },
            },
    };
  }
  return {
    identity: {
      entityType: "dreamsign" as const,
      entityId: revealEntityId("dreamsign", entity.id),
    },
    spec: dreamsignRevealSpec(
      entity.dreamsign,
      Boolean(entity.dreamsign.imageName),
    ),
  };
}

function ChoiceContents({
  model,
}: {
  readonly model: ExplorationChoiceModel;
}): ReactElement {
  const resolve = useLocalizer();
  return (
    <>
      <span style={{ minWidth: 0, display: "grid", gap: token("--space-xxs") }}>
        <strong style={{ font: token("--t-button") }}>
          {renderRulesSymbolsInline(resolve(model.label))}
        </strong>
        <span
          data-exploration-choice-description=""
          style={{ font: token("--t-caption"), color: token("--text-muted") }}
        >
          {model.description.map((part, index) =>
            part.kind === "entity" ? (
              <EntityLabel
                key={`${part.entity.id}-${String(index)}`}
                entity={part.entity}
              />
            ) : (
              <span
                key={`${part.kind}-${String(index)}`}
                data-exploration-choice-part={part.kind}
              >
                {part.kind === "rules"
                  ? renderRulesSymbolsInline(resolve(part.value))
                  : resolve(part.value)}
              </span>
            ),
          )}
          {model.disclosure === undefined ? null : (
            <span> {resolve(model.disclosure)}</span>
          )}
        </span>
      </span>
      <span aria-hidden="true" style={{ font: token("--t-title") }}>
        ›
      </span>
    </>
  );
}

/** A semantic Exploration action that distinguishes quick activation from reveal intent. */
export function ExplorationChoice({
  model,
  onPress,
}: ExplorationChoiceProps): ReactElement {
  const available = model.availability === "available";
  const suppressCompatibilityClick = useRef(false);
  const previewRegistration =
    model.preview === undefined
      ? null
      : entityRevealRegistration(model.preview);
  const binding = useRevealSource({
    identity: previewRegistration?.identity ?? {
      entityType: "gallery-action",
      entityId: revealEntityId("gallery-action", model.actionId),
    },
    spec: previewRegistration?.spec ?? {
      primary: { kind: "source" as const, description: model.label },
      secondaries: [],
    },
    onActivate: available ? () => onPress(model.actionId) : undefined,
  });
  const pointerDown = binding.sourceProps.onPointerDown;

  return (
    <Pressable
      as="button"
      ref={binding.ref}
      {...binding.sourceProps}
      aria-disabled={available ? undefined : true}
      data-exploration-action-id={model.actionId}
      data-exploration-choice-availability={model.availability}
      data-exploration-entity-preview={model.preview?.kind}
      data-exploration-deck-entry-id={model.preview?.entryId}
      data-entity-id={model.preview?.id}
      data-entity-copies={
        model.preview?.copies ?? (model.preview ? 1 : undefined)
      }
      data-reveal-source-retain="true"
      onPointerDown={(event) => {
        suppressCompatibilityClick.current = event.pointerType === "touch";
        pointerDown?.(event);
      }}
      onClick={(event) => {
        if (!available) return;
        if (event.detail === 0) {
          suppressCompatibilityClick.current = false;
          onPress(model.actionId);
        } else if (suppressCompatibilityClick.current) {
          suppressCompatibilityClick.current = false;
        } else {
          onPress(model.actionId);
        }
      }}
      style={choiceStyle(available, binding.sourceProps.style)}
    >
      <ChoiceContents model={model} />
    </Pressable>
  );
}
