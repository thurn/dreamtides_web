import type { CardData } from "../../../types/cards";
import { cardImageUrl } from "../../../data/card-database";
import { useRevealSource } from "../../internal/reveal/context";
import { Pressable } from "../../primitives/Pressable";
import { token } from "../../primitives/tokens";
import { PipBadge } from "../controls/PipBadge";
import { rulesTextDefinitionCards } from "./rules-text-reveal";

export interface CompactGameCardRowProps {
  /** Canonical UUID-backed card semantics. */
  card: CardData;
  /** Display copy count, already formatted for the surface. */
  count: string;
  /** Stable row test id. */
  testId: string;
  /** Stable reading-copy test id. */
  revealTestId: string;
  /** Comma-separated stable deck entry UUIDs represented by the row. */
  entryIds: string;
}

/** Compact deck-list entity with the canonical complete GameCard reveal. */
export function CompactGameCardRow({ card, count, testId, revealTestId, entryIds }: CompactGameCardRowProps) {
  const binding = useRevealSource({
    identity: { entityType: "game-card", entityId: card.id },
    spec: {
      primary: { kind: "gameCard", cardId: card.id, displaySnapshot: card },
      secondaries: rulesTextDefinitionCards(card.renderedText),
    },
  });
  const accentColor = card.cardType === "Event" ? "#c084fc" : "#facc15";
  return (
    <Pressable
      as="div"
      ref={binding.ref}
      {...binding.sourceProps}
      data-testid={testId}
      data-reveal-testid={revealTestId}
      data-card-number={String(card.cardNumber)}
      data-entry-ids={entryIds}
      tabIndex={0}
      aria-label={`Deck card: ${card.name}${count === "1" ? "" : ` (${count} copies)`}`}
      style={{
        ...binding.sourceProps.style,
        height: "36px", display: "flex", alignItems: "center", gap: token("--space-s"), overflow: "hidden",
        borderRadius: token("--radius-compact"), padding: `0 ${token("--space-s")}`,
        backgroundImage: `linear-gradient(90deg, rgba(10, 6, 18, 0.85) 0%, rgba(10, 6, 18, 0.35) 35%, rgba(10, 6, 18, 0.05) 65%, rgba(10, 6, 18, 0.45) 100%), url("${cardImageUrl(card.imageNumber)}")`,
        backgroundSize: "cover", backgroundPosition: "center 25%", backgroundRepeat: "no-repeat",
        border: `1px solid ${accentColor}55`,
      }}
    >
      <PipBadge variant="energy" value={card.energyCost !== null ? String(card.energyCost) : "X"} size="sm" />
      <span style={{ minWidth: 0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "#ffffff", fontSize: "14px", fontWeight: 700, textShadow: "0 1px 2px rgba(0, 0, 0, 0.95), 0 0 4px rgba(0, 0, 0, 0.85), 1px 1px 0 rgba(0, 0, 0, 0.9)" }}>{card.name}</span>
      {count !== "1" ? <span data-testid={`draft-deck-row-count-${String(card.cardNumber)}`} style={{ color: "#fbbf24", fontSize: "14px", fontWeight: 700, textShadow: "0 1px 2px rgba(0,0,0,.95)" }}>{count}x</span> : null}
    </Pressable>
  );
}
