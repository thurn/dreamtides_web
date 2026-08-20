import { assertLocalized } from "@trox/runtime";
import { useEffect, useState } from "react";
import {
  parseCardId,
  parseCardName,
  parseCardSubtype,
} from "../../../types/card-identity";
import type { CardData } from "../../../types/cards";
import {
  AtlasNode,
  type AtlasNodeModel,
} from "../../components/atlas/AtlasNode";
import { GameCard } from "../../components/card/CardView";
import { GlossaryTerm } from "../../components/card/GlossaryTerm";
import { richText } from "../../components/card/rich-text";
import { AvatarPortrait } from "../../components/hud/AvatarPortrait";
import { InfoCard } from "../../components/overlay/InfoCard";
import { artRef } from "../../primitives/art";
import { GLYPHS } from "../../primitives/glyph";
import { parseDreamscapeId } from "../../../types/identifiers";
import { parseAtlasNodeId } from "../../../types/identifiers";
import { parseArtAssetKey } from "../../../types/identifiers";
import { parseAvatarId } from "../../../types/identifiers";
import { parseDreamsignId } from "../../../types/identifiers";

const CARD_ID = parseCardId("11111111-1111-4111-8111-111111111111");
const BATTLE_CARD_ID = parseCardId("22222222-2222-4222-8222-222222222222");
const CONFORMANCE_CARD_IMAGE = 485518048;
const ATLAS_NODE_ID = parseAtlasNodeId("33333333-3333-4333-8333-333333333333");

const CARD: CardData = {
  id: CARD_ID,
  name: parseCardName("Conformance Sentry"),
  cardNumber: 1,
  cardType: "Character",
  subtype: parseCardSubtype("Guide"),
  isStarter: false,
  rarity: "Special",
  energyCost: 2,
  spark: 3,
  isFast: false,
  renderedText: "Awakened. ▸Dawn. Ephemeral. Reclaim. Foresee.",
  imageNumber: CONFORMANCE_CARD_IMAGE,
  artOwned: false,
};

const ATLAS_MODEL: AtlasNodeModel = {
  id: ATLAS_NODE_ID,
  name: assertLocalized("Conformance Veil"),
  state: "available",
  role: "regular",
  isReachable: true,
  iconRef: artRef.dreamscapeIcon(parseDreamscapeId("wilderveil")),
  siteBadgeGlyph: GLYPHS.water,
  unrevealedFrameRef: artRef.atlasAsset(parseArtAssetKey("fixture-frame.png")),
  knownDreamsignRef: artRef.dreamsign("runes.png"),
  primary: {
    sceneArt: artRef.dreamscapeScene(parseDreamscapeId("wilderveil")),
    figureArt: null,
    placeName: assertLocalized("Conformance Veil"),
    guideName: null,
    title: assertLocalized("Conformance Veil"),
    body: assertLocalized("A fixed Atlas fixture."),
  },
  dreamsign: {
    id: parseDreamsignId("44444444-4444-4444-8444-444444444444"),
    name: assertLocalized("Measured Sign"),
    art: null,
    rulesText: assertLocalized("The first vision is fixed."),
  },
  site: {
    name: assertLocalized("Measured Site"),
    blurb: assertLocalized("A fixed semantic site."),
    icon: GLYPHS.water,
  },
  affiliation: {
    title: assertLocalized("Fixture affiliation"),
    body: assertLocalized("Fixture cards are more likely here."),
  },
};

const BATTLE_CARD: CardData = {
  ...CARD,
  id: BATTLE_CARD_ID,
  name: parseCardName("Battle Conformance"),
  cardNumber: 2,
  energyCost: 1,
  spark: 2,
  isFast: true,
  renderedText: "Nightmare is a Bane.",
};
const GENERATED_BATTLE_CARD: CardData = {
  ...BATTLE_CARD,
  id: parseCardId("77777777-7777-4777-8777-777777777777"),
  name: parseCardName("Generated Conformance Figment"),
};
const TRUNCATION_CARD: CardData = {
  ...CARD,
  id: parseCardId("88888888-8888-4888-8888-888888888888"),
  name: parseCardName("Conformance Lexicon"),
  cardNumber: 8,
  renderedText:
    "Figment. Materialize. Rematerialize. Dissolve. Banish. Abandon. Score. Reclaim. Foresee. Discover. Erode. Fast. Awakened. Veil. Vengeful. Support. Challenger. Prevent. Offering. Phasing. Ephemeral. Transfigure. Purge. Duplicate. Bane. Essence. Enhanced.",
};
const AVATAR = {
  id: parseAvatarId("99999999-9999-4999-8999-999999999999"),
  name: assertLocalized("Conformance Guide"),
  title: assertLocalized("Keeper of Context"),
  imageNumber: "0071",
};

const SCENARIOS = [
  "above",
  "side-fallback",
  "top-edge",
  "truncation",
  "best-effort",
  "safe-area",
  "reduced-motion",
] as const;
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
    if (scenario === "reduced-motion")
      root.dataset.cumulusReducedMotion = "reduce";
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
      style={{
        minHeight: "100vh",
        padding: topEdge ? "4px 24px 40px" : "72px 24px 40px",
        color: "var(--text-primary)",
        background: "#100c19",
        boxSizing: "border-box",
        ...(scenario === "safe-area"
          ? { "--safe-area-inset-top": "52px", paddingTop: "52px" }
          : {}),
      }}
    >
      <h1 style={{ font: "var(--t-title)", margin: "0 0 12px" }}>
        Entity reveal conformance
      </h1>
      <div
        style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 }}
      >
        {SCENARIOS.map((value) => (
          <button
            key={value}
            type="button"
            data-conformance-scenario={value}
            aria-pressed={scenario === value}
            onClick={() => setScenario(value)}
          >
            {value}
          </button>
        ))}
      </div>
      <section
        data-conformance-scenario-stage=""
        style={{
          position: "relative",
          height: 560,
          marginBottom: 24,
          border: "1px dashed var(--border-soft)",
          overflow: "hidden",
        }}
      >
        <h2 style={{ margin: 8 }}>Deterministic scenario: {scenario}</h2>
        <div
          data-conformance-scenario-source={scenario}
          style={{
            position: viewportEdge ? "fixed" : "absolute",
            zIndex: viewportEdge ? 1 : undefined,
            width:
              scenario === "above" ||
              scenario === "best-effort" ||
              scenario === "safe-area"
                ? 120
                : 160,
            left:
              scenario === "side-fallback" || scenario === "truncation"
                ? undefined
                : scenario === "best-effort" || scenario === "safe-area"
                  ? "calc(50% - 60px)"
                  : 96,
            right:
              scenario === "side-fallback" || scenario === "truncation"
                ? 0
                : undefined,
            top:
              scenario === "safe-area"
                ? "var(--safe-area-inset-top)"
                : viewportEdge
                  ? 0
                  : scenario === "above"
                    ? 390
                    : 180,
          }}
        >
          {scenario === "above" ? (
            <AvatarPortrait
              avatar={AVATAR}
              variant="thumb"
              profile={{
                id: AVATAR.id,
                ability: assertLocalized(
                  "Nightmare is a Bane. Discover. Ephemeral.",
                ),
              }}
            />
          ) : (
            <GameCard
              model={{
                cardId: TRUNCATION_CARD.id,
                displaySnapshot: TRUNCATION_CARD,
              }}
              onPress={() => setActivationCount((count) => count + 1)}
            />
          )}
        </div>
      </section>
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
          gap: 24,
          alignItems: "start",
        }}
      >
        <article
          data-conformance-card-id={CARD_ID}
          data-activation-count={activationCount}
          style={{ width: 160 }}
        >
          <h2>GameCard popup</h2>
          <GameCard
            model={{ cardId: CARD_ID, displaySnapshot: CARD }}
            onPress={() => setActivationCount((count) => count + 1)}
          />
        </article>
        <article data-conformance-press-in-place="" style={{ width: 360 }}>
          <h2>GameCard press in place</h2>
          <GameCard model={{ cardId: CARD_ID, displaySnapshot: CARD }} />
        </article>
        <article data-conformance-unavailable="" style={{ width: 160 }}>
          <h2>Unavailable</h2>
          <GameCard
            model={{ cardId: CARD_ID, displaySnapshot: CARD }}
            unavailable
          />
        </article>
        <article>
          <h2>InfoCard</h2>
          <InfoCard
            variant="text"
            title={assertLocalized("Primary only")}
            body={richText.plain(assertLocalized("Strict visual content."))}
          />
        </article>
        <article data-conformance-info-secondaries="" style={{ width: 120 }}>
          <h2>InfoCard group source</h2>
          <AvatarPortrait
            avatar={AVATAR}
            variant="thumb"
            profile={{
              id: AVATAR.id,
              ability: assertLocalized(
                "Nightmare is a Bane. Discover. Ephemeral.",
              ),
            }}
          />
        </article>
        <article>
          <h2>Inline</h2>
          <p>
            Resolve{" "}
            <GlossaryTerm
              entry={{
                term: "Bane",
                definition:
                  "The Nightmare card, a penalty card forced into your deck.",
              }}
              text={assertLocalized("Bane")}
            />{" "}
            here.
          </p>
        </article>
        <article style={{ position: "relative", width: 184, height: 184 }}>
          <h2>Atlas</h2>
          <div style={{ width: 112, height: 112 }}>
            <AtlasNode model={ATLAS_MODEL} onPress={() => undefined} />
          </div>
        </article>
        <article data-conformance-battle-fixture="" style={{ width: 160 }}>
          <h2>Battle</h2>
          <GameCard
            model={{ cardId: BATTLE_CARD.id, displaySnapshot: BATTLE_CARD }}
          />
        </article>
        <article
          data-conformance-generated-battle-fixture=""
          style={{ width: 160 }}
        >
          <h2>Generated battle figment</h2>
          <GameCard
            model={{
              cardId: GENERATED_BATTLE_CARD.id,
              displaySnapshot: GENERATED_BATTLE_CARD,
            }}
            figment
          />
        </article>
      </section>
    </main>
  );
}
