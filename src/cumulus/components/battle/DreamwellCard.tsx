import { useEffect, useState, type CSSProperties } from "react";
import {
  cardIdenticonUri,
  cardImageUrl,
  hasAssignedImage,
} from "../../../data/card-database";
import type { DreamwellCardId } from "../../../types/identifiers";
import type { DomTestId } from "../../types/dom";
import type { ArtCrop } from "../../../types/cards";
import { token } from "../../primitives/tokens";
import { CardStatOrb } from "../card/CardStatOrb";
import { RulesText } from "../card/RulesText";
import { rulesTextDefinitionCards } from "../card/rules-text-reveal";
import { useRevealSource } from "../../internal/reveal/context";
import { revealEntityId } from "../../internal/reveal/identity";
import { Pressable } from "../../primitives/Pressable";
import "./dreamwell-card.css";
import { txa, opaque, type LocalizedString } from "@trox/runtime";
import { useLocalizer } from "../../../runtime/localization/use-localizer";

/** The complete resolved display data for one Dreamwell card. */
export interface DreamwellCardDisplaySnapshot {
  /** Stable Dreamwell card UUID. */
  readonly id: DreamwellCardId;
  /** Display name resolved at the final render boundary. */
  readonly name: LocalizedString;
  /** Rules copy with the shared Dreamtides symbol markup. */
  readonly renderedText: LocalizedString;
  /** Maximum energy this Dreamwell card adds. */
  readonly energyAdded: number;
  /** Hosted card-art key. */
  readonly imageNumber: number;
  /** Optional authored art framing. */
  readonly art?: ArtCrop;
}

/** UUID identity and complete resolved snapshot for a Dreamwell card. */
export interface DreamwellCardModel {
  /** Canonical Dreamwell card UUID. */
  readonly cardId: DreamwellCardId;
  /** Complete presentation data whose `id` matches `cardId`. */
  readonly displaySnapshot: DreamwellCardDisplaySnapshot;
}

export interface DreamwellCardProps {
  /** Canonical Dreamwell card semantics and resolved display snapshot. */
  readonly model: DreamwellCardModel;
  /** Optional stable test id for the complete card. */
  readonly testId?: DomTestId;
}

const DEFAULT_ART_CROP: ArtCrop = { x: 0, y: 0, scale: 1 };

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function artStyle(art: ArtCrop): CSSProperties {
  const x = 50 + clamp(art.x, -1, 1) * 35;
  const y = 50 + clamp(art.y, -1, 1) * 35;
  return {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    maxWidth: "none",
    objectFit: "cover",
    objectPosition: `${String(x)}% ${String(y)}%`,
    transform: `scale(${String(Math.max(1, art.scale))})`,
    transformOrigin: `${String(x)}% ${String(y)}%`,
  };
}

/**
 * The canonical static Dreamwell card: a readable 3:2 landscape object with
 * UUID-keyed art, its energy grant, name, and complete rules text. The caller
 * owns its width and placement; the component performs no entrance, exit, or
 * idle animation.
 */
export function DreamwellCard({ model, testId }: DreamwellCardProps) {
  const resolve = useLocalizer();
  const card = model.displaySnapshot;
  const [artErrored, setArtErrored] = useState(false);

  useEffect(() => {
    setArtErrored(false);
  }, [model.cardId, card.imageNumber]);

  const hasArt = hasAssignedImage(card.imageNumber) && !artErrored;
  const artUrl = hasArt
    ? cardImageUrl(card.imageNumber)
    : cardIdenticonUri(model.cardId);
  const definitions = rulesTextDefinitionCards(card.renderedText, "card");
  const binding = useRevealSource({
    identity: {
      entityType: "dreamwell-card",
      entityId: revealEntityId("dreamwell-card", model.cardId),
    },
    spec: {
      primary: {
        kind: "source",
        description: txa(
          "{card_name}. {rules_text}",
          {
            card_name: opaque(card.name),
            rules_text: opaque(card.renderedText),
          },
          "[accessibility] [battle] Reveal description for a Dreamwell card. card_name is the canonical card display name with unknown grammatical gender; rules_text is its complete authored rules text.",
        ),
      },
      secondaries: definitions,
    },
    feedback: "stationary",
  });
  const hasDefinitions = definitions.length > 0;

  return (
    <Pressable
      as="article"
      ref={hasDefinitions ? binding.ref : undefined}
      {...(hasDefinitions ? binding.sourceProps : {})}
      hoverFeedback="stationary"
      pressFeedback="stationary"
      role="group"
      tabIndex={hasDefinitions ? 0 : undefined}
      ariaLabelMessage={txa(
        "{card_name}: adds {energy_amount} Energy",
        { card_name: opaque(card.name), energy_amount: card.energyAdded },
        "[accessibility] [battle] Name for a Dreamwell card. card_name is its canonical display name with unknown grammatical gender; energy_amount is the non-negative Energy the card adds when drawn.",
      )}
      data-cumulus-dreamwell-card=""
      data-dreamwell-card={model.cardId}
      data-testid={testId}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: "3 / 2",
        overflow: "hidden",
        containerType: "inline-size",
        border: `${token("--space-xxs")} solid ${token("--border-mid")}`,
        borderRadius: token("--radius-panel"),
        background: token("--surface-card"),
        boxShadow: token("--shadow-card"),
        color: token("--text-on-card"),
        userSelect: "none",
        animation: "none",
        transition: "none",
      }}
    >
      <img
        src={artUrl}
        alt=""
        aria-hidden="true"
        draggable={false}
        style={artStyle(card.art ?? DEFAULT_ART_CROP)}
        onError={hasArt ? () => setArtErrored(true) : undefined}
      />
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: `linear-gradient(to bottom, transparent 20%, transparent 44%, ${token("--surface-card")} 78%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: token("--space-s"),
          right: token("--space-s"),
          filter: `drop-shadow(${token("--shadow-sm")})`,
        }}
      >
        <CardStatOrb
          variant="dreamwellEnergy"
          value={String(card.energyAdded)}
          sizeVar="14cqw"
          numberSizeVar="8cqw"
          numberCapPx={72}
          ariaLabel={txa(
            "{energy_amount} Energy added",
            { energy_amount: card.energyAdded },
            "[accessibility] [battle] Description of the Energy amount added by a Dreamwell card. energy_amount is a non-negative integer.",
          )}
        />
      </div>
      <div
        style={{
          position: "absolute",
          right: token("--space-s"),
          bottom: token("--space-s"),
          left: token("--space-s"),
          display: "grid",
          gap: token("--space-xs"),
          padding: token("--space-s"),
          border: `${token("--space-xxs")} solid ${token("--border-soft")}`,
          borderRadius: token("--radius-panel"),
          background: token("--surface-card"),
          boxShadow: token("--shadow-md"),
        }}
      >
        <strong
          data-dreamwell-card-name=""
          style={{
            minWidth: 0,
            paddingRight: "12cqw",
            color: token("--text-on-card"),
            font: token("--t-title-sm"),
            textShadow: token("--text-outline-media"),
          }}
        >
          {resolve(card.name)}
        </strong>
        <div
          data-dreamwell-card-rules=""
          style={{
            color: token("--text-on-card"),
            font: token("--t-rules"),
          }}
        >
          <RulesText
            text={card.renderedText}
            owner={{ kind: "dreamwellCard", id: model.cardId }}
            glossaryInteraction="delegated"
          />
        </div>
      </div>
    </Pressable>
  );
}
