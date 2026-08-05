import { useEffect, useState } from "react";
import { asCardId, asCardName } from "../../../types/card-identity";
import type { CardData } from "../../../types/cards";
import { LayerName } from "../../../types/layer-name";
import { AtlasNode, type AtlasNodeModel } from "../../components/atlas/AtlasNode";
import { GameCard } from "../../components/card/CardView";
import { GlossaryTerm } from "../../components/card/GlossaryTerm";
import { richText } from "../../components/card/rich-text";
import { DreamAvatarPortrait } from "../../components/hud/DreamAvatarPortrait";
import { InfoCard } from "../../components/overlay/InfoCard";
import { artRef } from "../../primitives/art";
import { GLYPHS } from "../../primitives/glyph";

const CARD_ID = asCardId("11111111-1111-4111-8111-111111111111");
const BATTLE_CARD_ID = asCardId("22222222-2222-4222-8222-222222222222");
const CONFORMANCE_CARD_IMAGE = 485518048;
const ATLAS_NODE_ID = "33333333-3333-4333-8333-333333333333";

const CARD: CardData = {
  id: CARD_ID, name: asCardName("Conformance Sentry"), cardNumber: 1,
  cardType: "Character", subtype: "Guide", isStarter: false, rarity: "Special",
  energyCost: 2, spark: 3, isFast: false,
  renderedText: "Awakened. ▸Dawn. Ephemeral. Reclaim. Foresee.", imageNumber: CONFORMANCE_CARD_IMAGE, artOwned: false,
};

const ATLAS_MODEL: AtlasNodeModel = {
  node: {
    id: ATLAS_NODE_ID, layer: LayerName.Two, indexInLayer: 0,
    dreamscapeId: "conformance-veil", biomeName: "Conformance Veil", biomeColor: "violet",
    sites: [], position: { x: 0, y: 0 }, state: "available", enhancedSiteType: null,
    forwardIds: [], backwardIds: [], knownDreamsignId: "44444444-4444-4444-8444-444444444444",
  },
  left: 92, top: 92, size: 112, isStarter: false, isBoss: false, isReachable: true,
  iconRef: artRef.dreamscapeIcon("wilderveil"), siteBadgeGlyph: GLYPHS.water,
  knownDreamsignRef: artRef.dreamsign("runes.png"),
  primary: { sceneArt: artRef.dreamscapeScene("wilderveil"), figureArt: null, placeName: "Conformance Veil", guideName: null, title: "Conformance Veil", body: "A fixed Atlas fixture." },
  dreamsign: { id: "44444444-4444-4444-8444-444444444444", name: "Measured Sign", art: null, rulesText: "The first vision is fixed." },
  site: { id: "55555555-5555-4555-8555-555555555555", name: "Measured Site", blurb: "A fixed semantic site.", icon: GLYPHS.water },
  affiliation: { id: "66666666-6666-4666-8666-666666666666", name: "Guides", cardTheme: "Guide" },
};

const BATTLE_CARD: CardData = {
  ...CARD,
  id: BATTLE_CARD_ID,
  name: asCardName("Battle Conformance"),
  cardNumber: 2,
  energyCost: 1,
  spark: 2,
  isFast: true,
  renderedText: "Nightmare is a Bane.",
};
const GENERATED_BATTLE_CARD: CardData = {
  ...BATTLE_CARD,
  id: asCardId("77777777-7777-4777-8777-777777777777"),
  name: asCardName("Generated Conformance Figment"),
};
const TRUNCATION_CARD: CardData = {
  ...CARD,
  id: asCardId("88888888-8888-4888-8888-888888888888"),
  name: asCardName("Conformance Lexicon"),
  cardNumber: 8,
  renderedText: "Figment. Materialize. Rematerialize. Dissolve. Banish. Abandon. Score. Reclaim. Foresee. Discover. Erode. Fast. Awakened. Preeminence. Veil. Vengeful. Support. Challenger. Prevent. Offering. Phasing. Ephemeral. Transfigure. Purge. Duplicate. Bane. Essence. Enhanced.",
};
const DREAM_AVATAR = { id: "99999999-9999-4999-8999-999999999999", name: "Conformance Guide", title: "Keeper of Context", imageNumber: "0071" };

const SCENARIOS = ["above", "side-fallback", "top-edge", "truncation", "best-effort", "safe-area", "reduced-motion"] as const;
type Scenario = (typeof SCENARIOS)[number];

/** Deterministic browser-QA surface for the public named entity vocabulary. */
export function EntityRevealConformanceDemo() {
  const [scenario, setScenario] = useState<Scenario>("above");
  const [activationCount, setActivationCount] = useState(0);
  const topEdge = scenario === "top-edge" || scenario === "safe-area";
  const viewportEdge = topEdge || scenario === "best-effort";
  useEffect(() => {
    if (scenario !== "safe-area") return undefined;
    const root = document.documentElement;
    const previous = root.style.getPropertyValue("--safe-area-inset-top");
    root.style.setProperty("--safe-area-inset-top", "52px");
    return () => {
      if (previous === "") root.style.removeProperty("--safe-area-inset-top");
      else root.style.setProperty("--safe-area-inset-top", previous);
    };
  }, [scenario]);
  useEffect(() => {
    const root = document.documentElement;
    const previous = root.dataset.cumulusReducedMotion;
    if (scenario === "reduced-motion") root.dataset.cumulusReducedMotion = "reduce";
    else delete root.dataset.cumulusReducedMotion;
    return () => {
      if (previous === undefined) delete root.dataset.cumulusReducedMotion;
      else root.dataset.cumulusReducedMotion = previous;
    };
  }, [scenario]);
  return (
    <main
      className="cumulus"
      data-entity-reveal-conformance=""
      data-active-conformance-scenario={scenario}
      style={{ minHeight: "100vh", padding: topEdge ? "4px 24px 40px" : "72px 24px 40px", color: "var(--text-primary)", background: "#100c19", boxSizing: "border-box", ...(scenario === "safe-area" ? { "--safe-area-inset-top": "52px", paddingTop: "52px" } : {}) }}
    >
      <h1 style={{ font: "var(--t-title)", margin: "0 0 12px" }}>Entity reveal conformance</h1>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}>
        {SCENARIOS.map((value) => (
          <button key={value} type="button" data-conformance-scenario={value} aria-pressed={scenario === value} onClick={() => setScenario(value)}>{value}</button>
        ))}
      </div>
      <section data-conformance-scenario-stage="" style={{ position: "relative", height: 560, marginBottom: 24, border: "1px dashed var(--border-soft)", overflow: "hidden" }}>
        <h2 style={{ margin: 8 }}>Deterministic scenario: {scenario}</h2>
        <div
          data-conformance-scenario-source={scenario}
          style={{
            position: viewportEdge ? "fixed" : "absolute",
            zIndex: viewportEdge ? 1 : undefined,
            width: scenario === "above" || scenario === "best-effort" || scenario === "safe-area" ? 120 : 160,
            left: scenario === "side-fallback" || scenario === "truncation" ? undefined : scenario === "best-effort" || scenario === "safe-area" ? "calc(50% - 60px)" : 96,
            right: scenario === "side-fallback" || scenario === "truncation" ? 0 : undefined,
            top: scenario === "safe-area" ? "var(--safe-area-inset-top)" : viewportEdge ? 0 : scenario === "above" ? 390 : 180,
          }}
        >
          {scenario === "above" ? (
            <DreamAvatarPortrait dreamAvatar={DREAM_AVATAR} variant="thumb" size={120} profile={{ id: DREAM_AVATAR.id, ability: "Nightmare is a Bane. Discover. Ephemeral." }} />
          ) : (
            <GameCard model={{ cardId: TRUNCATION_CARD.id, displaySnapshot: TRUNCATION_CARD }} onActivate={() => setActivationCount((count) => count + 1)} />
          )}
        </div>
      </section>
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 24, alignItems: "start" }}>
        <article data-conformance-card-id={CARD_ID} data-activation-count={activationCount} style={{ width: 160 }}><h2>GameCard popup</h2><GameCard model={{ cardId: CARD_ID, displaySnapshot: CARD }} onActivate={() => setActivationCount((count) => count + 1)} /></article>
        <article data-conformance-press-in-place="" style={{ width: 360 }}><h2>GameCard press in place</h2><GameCard model={{ cardId: CARD_ID, displaySnapshot: CARD }} /></article>
        <article data-conformance-unavailable="" style={{ width: 160 }}><h2>Unavailable</h2><GameCard model={{ cardId: CARD_ID, displaySnapshot: CARD }} unavailable /></article>
        <article><h2>InfoCard</h2><InfoCard variant="text" title="Primary only" body={richText.plain("Strict visual content.")} /></article>
        <article data-conformance-info-secondaries=""><h2>InfoCard group source</h2><DreamAvatarPortrait dreamAvatar={DREAM_AVATAR} variant="thumb" size={120} profile={{ id: DREAM_AVATAR.id, ability: "Nightmare is a Bane. Discover. Ephemeral." }} /></article>
        <article><h2>Inline</h2><p>Resolve <GlossaryTerm entry={{ term: "Bane", definition: "The Nightmare card, a penalty card forced into your deck." }} text="Bane" /> here.</p></article>
        <article style={{ position: "relative", width: 184, height: 184 }}><h2>Atlas</h2><AtlasNode model={ATLAS_MODEL} onActivate={() => undefined} /></article>
        <article data-conformance-battle-fixture="" style={{ width: 160 }}><h2>Battle</h2><GameCard model={{ cardId: BATTLE_CARD.id, displaySnapshot: BATTLE_CARD }} /></article>
        <article data-conformance-generated-battle-fixture="" style={{ width: 160 }}><h2>Generated battle figment</h2><GameCard model={{ cardId: GENERATED_BATTLE_CARD.id, displaySnapshot: GENERATED_BATTLE_CARD }} figment /></article>
      </section>
    </main>
  );
}
