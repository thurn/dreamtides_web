// Full-screen mockup for RulesText — a card-detail / rules-reference panel. The
// featured card (a curated real card, resolved by UUID) is shown large beside a
// panel that renders its authored rules text through RulesText: energy/spark
// glyphs become inline pips, `▸`/`❖` markers become caret/bolt icons, and the
// curated keyword set is emphasized in spark amber. Below it, a short reference
// list renders several other real cards' authored text so the keyword
// highlighting variety is visible at once. All rules strings come from the live
// card database (`renderedText`), never hardcoded, so the panel tracks the TOML.

import { useEffect, useState } from "react";
import type { CardData } from "../../../types/cards";
import { loadCardDatabase } from "../../../data/card-database";
import { GameCard } from "../../components/CardView";
import { RulesText } from "../../components/RulesText";
import { token } from "../../primitives/tokens";
import { sceneRoot } from "./scene";

// The featured card and a few reference cards, all real UUIDs from
// data/tabula/cards_v2.toml. The featured card carries multi-ability rules text
// with keyword highlighting; the reference set spans other keyword treatments.
const FEATURED_CARD_ID = "1268a899-b209-46bb-bce4-6def1dcd0404";
const REFERENCE_CARD_IDS = [
  "7be2e6d7-abff-4c44-a0c3-35460da1693c",
  "161482b6-af07-4d9e-822d-8c738672beb9",
  "b56ef7e8-c634-4d40-ac08-fab591dfbc4a",
] as const;

interface Resolved {
  featured: CardData | null;
  reference: CardData[];
}

function resolve(database: Map<number, CardData>): Resolved {
  const byId = new Map<string, CardData>();
  for (const card of database.values()) {
    byId.set(card.id, card);
  }
  return {
    featured: byId.get(FEATURED_CARD_ID) ?? null,
    reference: REFERENCE_CARD_IDS.map((id) => byId.get(id)).filter(
      (card): card is CardData => card !== undefined,
    ),
  };
}

const panelStyle = {
  background: token("--surface-card"),
  border: `1px solid ${token("--border-soft")}`,
  borderRadius: token("--radius-panel"),
  padding: token("--space-6"),
} as const;

export function RulesTextMockup() {
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

  const resolved = database ? resolve(database) : null;

  return (
    <div
      style={{
        ...sceneRoot,
        overflowY: "auto",
        background:
          "radial-gradient(120% 80% at 20% 0%, #241a3c 0%, #140e26 50%, #080511 100%)",
      }}
    >
      <div
        style={{
          minHeight: "100%",
          boxSizing: "border-box",
          display: "flex",
          flexWrap: "wrap",
          gap: token("--space-8"),
          alignItems: "flex-start",
          justifyContent: "center",
          padding: `${token("--space-11")} ${token("--space-8")} ${token("--space-9")}`,
        }}
      >
        {error !== null ? (
          <div style={{ margin: "auto", color: token("--text-secondary"), font: token("--t-lead") }}>
            Failed to load card data: {error}
          </div>
        ) : resolved === null ? (
          <div style={{ margin: "auto", color: token("--text-muted"), font: token("--t-lead") }}>
            Loading cards…
          </div>
        ) : (
          <>
            {resolved.featured !== null && (
              <div style={{ width: "clamp(180px, 30vw, 260px)", flex: "0 0 auto" }}>
                <GameCard card={resolved.featured} large suppressHoverHelp />
              </div>
            )}

            <div style={{ flex: "1 1 340px", maxWidth: 560, display: "flex", flexDirection: "column", gap: token("--space-6") }}>
              {resolved.featured !== null && (
                <div style={panelStyle}>
                  <p
                    style={{
                      font: token("--t-eyebrow"),
                      letterSpacing: token("--tracking-eyebrow"),
                      textTransform: "uppercase",
                      color: token("--accent-bright"),
                      margin: 0,
                    }}
                  >
                    Rules Text
                  </p>
                  {/* Card name resolved here, at the display boundary only. */}
                  <h2 style={{ font: token("--t-title-sm"), margin: `${token("--space-2")} 0 ${token("--space-5")}` }}>
                    {resolved.featured.name}
                  </h2>
                  <div style={{ font: token("--t-rules") }}>
                    <RulesText text={resolved.featured.renderedText} />
                  </div>
                </div>
              )}

              <div style={panelStyle}>
                <p
                  style={{
                    font: token("--t-eyebrow"),
                    letterSpacing: token("--tracking-eyebrow"),
                    textTransform: "uppercase",
                    color: token("--text-muted"),
                    margin: `0 0 ${token("--space-5")}`,
                  }}
                >
                  Keyword reference
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: token("--space-5") }}>
                  {resolved.reference.map((card) => (
                    <div key={card.id}>
                      <div style={{ font: token("--t-caption"), color: token("--text-muted"), marginBottom: token("--space-2") }}>
                        {card.name}
                      </div>
                      <div style={{ font: token("--t-rules") }}>
                        <RulesText text={card.renderedText} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

    </div>
  );
}
