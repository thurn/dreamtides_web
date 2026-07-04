// Full-screen mockup for GameCard — a Dreamtides battlefield: a row of committed
// characters on the board above the player's fanned hand, over a dark table wash.
// The cards are curated real cards resolved by UUID from the live card database
// (never by name — names are not unique). It exercises the card's real variety:
// keyword highlighting, trigger carets, fast/interrupt bolts, Character vs Event
// chrome, and the Legendary shimmer.

import { useEffect, useState } from "react";
import type { CardData } from "../../../types/cards";
import { loadCardDatabase } from "../../../data/card-database";
import { GameCard } from "../../components/card/CardView";
import { token } from "../../primitives/tokens";
import { sceneRoot } from "./scene";

// Curated real card UUIDs from data/tabula/cards_v2.toml (shared with the demo).
// Split into a small "board" set (played characters) and a "hand" set so the
// scene reads as an in-progress battle. Keyed and resolved by UUID only.
const BOARD_CARD_IDS = [
  // Character, 3●/3✦ — Support + Reclaim keyword highlighting.
  "1268a899-b209-46bb-bce4-6def1dcd0404",
  // Character, 3●/1✦ — a ▸Challenge trigger caret.
  "7be2e6d7-abff-4c44-a0c3-35460da1693c",
] as const;

const HAND_CARD_IDS = [
  // Character, 2●/2✦ — a Fast card (speed bolt before the name).
  "161482b6-af07-4d9e-822d-8c738672beb9",
  // Event, 4● — no spark orb, Fast; Event type-line chrome.
  "b56ef7e8-c634-4d40-ac08-fab591dfbc4a",
  // Event, 3● — Legendary rarity (the shimmer overlay).
  "a911ef71-799c-4240-ad13-8fabd3caeafa",
  // Character, 3●/3✦ — repeated to fill the hand fan.
  "1268a899-b209-46bb-bce4-6def1dcd0404",
] as const;

function resolveCards(database: Map<number, CardData>, ids: readonly string[]): CardData[] {
  const byId = new Map<string, CardData>();
  for (const card of database.values()) {
    byId.set(card.id, card);
  }
  return ids
    .map((id) => byId.get(id))
    .filter((card): card is CardData => card !== undefined);
}

export function GameCardMockup() {
  const [database, setDatabase] = useState<Map<number, CardData> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadCardDatabase()
      .then((db) => {
        if (!cancelled) {
          setDatabase(db);
        }
      })
      .catch((cause: unknown) => {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : String(cause));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const board = database ? resolveCards(database, BOARD_CARD_IDS) : [];
  const hand = database ? resolveCards(database, HAND_CARD_IDS) : [];

  return (
    <div
      style={{
        ...sceneRoot,
        display: "flex",
        flexDirection: "column",
        // A deep table wash so the cards' own material reads against a scene.
        background:
          "radial-gradient(130% 90% at 50% 8%, #241a3c 0%, #140e26 45%, #080511 100%)",
      }}
    >
      {error !== null ? (
        <div
          style={{
            margin: "auto",
            color: token("--text-secondary"),
            font: token("--t-lead"),
          }}
        >
          Failed to load card data: {error}
        </div>
      ) : database === null ? (
        <div
          style={{
            margin: "auto",
            color: token("--text-muted"),
            font: token("--t-lead"),
          }}
        >
          Loading cards…
        </div>
      ) : (
        <>
          {/* Opponent frontier: committed characters, larger. */}
          <div
            style={{
              flex: "1 1 0",
              display: "flex",
              flexWrap: "wrap",
              gap: token("--space-6"),
              alignItems: "center",
              justifyContent: "center",
              padding: `${token("--space-9")} ${token("--space-6")} ${token("--space-6")}`,
            }}
          >
            {board.map((card, index) => (
              <div
                key={`board-${String(index)}`}
                style={{ width: "clamp(120px, 20vw, 208px)", flex: "0 0 auto" }}
              >
                <GameCard card={card} suppressHoverHelp />
              </div>
            ))}
          </div>

          {/* Player hand: a slightly-overlapped fan hugging the bottom edge. */}
          <div
            style={{
              flex: "0 0 auto",
              display: "flex",
              flexWrap: "wrap",
              justifyContent: "center",
              alignItems: "flex-end",
              gap: token("--space-3"),
              padding: `${token("--space-4")} ${token("--space-4")} ${token("--space-8")}`,
            }}
          >
            {hand.map((card, index) => (
              <div
                key={`hand-${String(index)}`}
                style={{ width: "clamp(96px, 15vw, 156px)", flex: "0 0 auto" }}
              >
                <GameCard card={card} selected={index === 0} suppressHoverHelp />
              </div>
            ))}
          </div>
        </>
      )}

    </div>
  );
}
