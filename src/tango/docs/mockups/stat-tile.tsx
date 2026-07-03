// Full-screen mockup for StatTile — a run-summary screen composing several
// tiles into a stats grid. Labels name real persistent-run fields from
// `src/types/quest.ts` (`essence`, `essenceCap`, `deck` length, `layer` — the
// Dream Atlas's 0-6 depth counter, `visitedSites` length); the figures shown
// are illustrative (a run snapshot), matching how the QuestStatusBar mockup
// already treats its own essence/deck numbers.

import { dreamscapeSceneUrl } from "../../components/atlas-display";
import { StatTile } from "../../components/StatTile";
import { token } from "../../primitives/tokens";
import { SceneCaption, sceneRoot } from "./scene";

export function StatTileMockup() {
  return (
    <div
      style={{
        ...sceneRoot,
        background:
          "radial-gradient(130% 90% at 50% 10%, #2c2450 0%, #160f2a 50%, #080512 100%)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: token("--space-9"),
        padding: token("--space-9"),
        boxSizing: "border-box",
      }}
    >
      {/* A small real-scene thumbnail — the last dreamscape visited — grounds
          the summary in a concrete run without fabricating a card/character. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: token("--space-6"),
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 84,
            height: 84,
            borderRadius: token("--r-lg"),
            border: `1px solid ${token("--border-accent")}`,
            backgroundImage: `url(${dreamscapeSceneUrl("rust_expanse")})`,
            backgroundSize: "cover",
            backgroundPosition: "center",
            boxShadow: token("--glow-accent-soft"),
            flex: "0 0 auto",
          }}
        />
        <div>
          <p
            style={{
              font: token("--t-eyebrow"),
              letterSpacing: token("--tracking-eyebrow"),
              textTransform: "uppercase",
              color: token("--accent-bright"),
              margin: 0,
            }}
          >
            Dream Complete
          </p>
          <h1 style={{ font: token("--t-display"), margin: `${token("--space-2")} 0 0`, color: token("--text-primary") }}>
            The Rust Expanse
          </h1>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
          gap: token("--space-5"),
          width: "min(760px, 92vw)",
        }}
      >
        <StatTile label="Essence" value="240" sub="on hand" accent="var(--essence)" />
        <StatTile label="Essence Cap" value="300" sub="maximum held" />
        <StatTile label="Deck" value="23" sub="cards" />
        <StatTile label="Layer" value="4 / 6" sub="atlas depth" accent="var(--accent-bright)" />
        <StatTile label="Sites Visited" value="11" sub="this run" />
        <StatTile label="Spark" value="12" sub="total" accent="var(--spark)" />
      </div>

      <SceneCaption
        eyebrow="Stat Tile"
        title="A run-summary grid — labels name real persistent-run fields (essence, deck, layer, visited sites)."
        corner="bottom-left"
      />
    </div>
  );
}
