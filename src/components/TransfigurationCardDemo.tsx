import { useEffect, useMemo, useState } from "react";
import type { CardData } from "../types/cards";
import type { TransfigurationType } from "../types/quest";
import { loadCardsV2Database } from "../data/cards-v2-database";
import {
  buildTransfigurationDisplay,
  describeTransfiguration,
  eligibleTransfigurations,
  TRANSFIGURATION_COLORS,
  TRANSFIGURATION_ICONS,
} from "../transfiguration/transfiguration-logic";
import { CardDisplay } from "./CardDisplay";

/**
 * Standalone browser-QA harness for the transfigured-card treatment. Mount with
 * `?demo=transfiguration` to see, for every transfiguration type, an eligible
 * card rendered both as printed and as transfigured: the transfiguration's icon
 * follows the name, the changed stat orb takes the tint, and only the added or
 * changed rules text is painted in the transfiguration's light color.
 *
 * Picks the first eligible card for each type from the bundled card pool, so it
 * shows real cards without depending on any particular card existing.
 */

const TYPE_ORDER: readonly TransfigurationType[] = [
  "Empowered",
  "Amplified",
  "Kindled",
  "Inspired",
  "Enduring",
  "Resonant",
  "Attuned",
  "Perfected",
];

/** Finds a readable example card eligible for the given transfiguration type. */
function pickExample(
  cards: CardData[],
  type: TransfigurationType,
): CardData | null {
  const eligible = cards.filter(
    (card) =>
      eligibleTransfigurations(card).includes(type) &&
      card.renderedText.trim().length > 0 &&
      card.renderedText.length <= 140,
  );
  // Prefer a card with a little rules text so the tinted change reads clearly,
  // but fall back to any eligible card.
  const withText = eligible.filter(
    (card) => card.renderedText.length >= 20,
  );
  const pool = withText.length > 0 ? withText : eligible;
  return pool.length > 0 ? pool[0] : null;
}

export function TransfigurationCardDemo() {
  const [cards, setCards] = useState<CardData[] | null>(null);

  useEffect(() => {
    let active = true;
    void loadCardsV2Database().then((db) => {
      if (active) {
        setCards([...db.values()]);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const panels = useMemo(() => {
    if (cards === null) return [];
    return TYPE_ORDER.map((type) => {
      const example = pickExample(cards, type);
      if (example === null) return null;
      const built = buildTransfigurationDisplay(example, type);
      return {
        type,
        original: example,
        transfigured: built,
        description: describeTransfiguration(example, type),
      };
    }).filter((p): p is NonNullable<typeof p> => p !== null);
  }, [cards]);

  return (
    <div
      style={{
        minHeight: "100vh",
        background:
          "radial-gradient(circle at 30% 0%, #241a33 0%, #120c1c 55%, #0b0712 100%)",
        color: "#e7e2f0",
        padding: "40px 32px 56px",
        fontFamily: '"Inter", system-ui, sans-serif',
      }}
    >
      <div style={{ maxWidth: 1280, margin: "0 auto" }}>
        <h1
          style={{
            fontSize: 30,
            fontWeight: 700,
            letterSpacing: "0.01em",
            marginBottom: 6,
          }}
        >
          Transfigured Cards
        </h1>
        <p style={{ opacity: 0.65, fontSize: 14, marginBottom: 32 }}>
          Each pair shows a card as printed (left) and transfigured (right): the
          transfiguration's icon follows the name, the changed stat is tinted,
          and only the added or changed rules text is painted in the
          transfiguration color.
        </p>

        {cards === null ? (
          <p style={{ opacity: 0.6 }}>Loading cards…</p>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(520px, 1fr))",
              gap: 28,
            }}
          >
            {panels.map((panel) => {
              const color = TRANSFIGURATION_COLORS[panel.type];
              return (
                <div
                  key={panel.type}
                  style={{
                    borderRadius: 16,
                    padding: 18,
                    background: "rgba(255, 255, 255, 0.03)",
                    border: `1px solid ${color}33`,
                    boxShadow: `0 0 22px ${color}14`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginBottom: 14,
                    }}
                  >
                    <i
                      className={`bxf ${TRANSFIGURATION_ICONS[panel.type]}`}
                      style={{
                        fontSize: 18,
                        lineHeight: 1,
                        color,
                        textShadow: `0 0 8px ${color}`,
                      }}
                    />
                    <span
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.08em",
                        color,
                      }}
                    >
                      {panel.type}
                    </span>
                    <span style={{ fontSize: 13, opacity: 0.7 }}>
                      {panel.description}
                    </span>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 14,
                      alignItems: "start",
                    }}
                  >
                    <CardDisplay card={panel.original} />
                    <CardDisplay
                      card={panel.transfigured.card}
                      transfiguration={panel.transfigured.display}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
