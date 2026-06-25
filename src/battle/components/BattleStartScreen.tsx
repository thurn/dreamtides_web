import { useEffect, useMemo, useState } from "react";
import "./battle-start.css";
import type { BattleInit } from "../types";
import type { CardData } from "../../types/cards";
import { CardView } from "../../components/CardView";
import { formatTypeLine } from "../../components/card-text";
import { RulesText } from "../../components/RulesText";
import { EssenceValue } from "../../components/EssenceValue";
import { dreamcallerImageSrc } from "../../components/DreamcallerPortrait";
import { dreamscapeSceneUrl } from "../../atlas/atlas-display";
import { logEvent, logEventOnce } from "../../logging";

/** The fixed authoring canvas the Battle Start composition is laid out against. */
const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;

/**
 * Ambient drifting motes scattered over the dream wash. Positions and timings
 * are derived from the index so the field is deterministic (no `Math.random`)
 * and stable across re-renders.
 */
const MOTES = Array.from({ length: 26 }, (_unused, i) => ({
  left: (i * 53) % 100,
  top: (i * 71) % 100,
  size: 1.5 + ((i * 7) % 5) * 0.7,
  duration: 13 + ((i * 11) % 12),
  delay: -((i * 3) % 18),
}));

/**
 * The Battle Start screen: the opposing Dreamcaller revealed after the player
 * clicks a battle site and before hands are dealt. The enemy portrait is the
 * hero of the composition; the objectives (points to win, essence reward), the
 * Dreamcaller's ability, its signature cards, and — when it carries any — its
 * dreamsigns float around it as frosted plum chrome. "Begin Battle" hands off to
 * the playable battle.
 *
 * The whole composition is authored against a fixed {@link CANVAS_WIDTH} ×
 * {@link CANVAS_HEIGHT} canvas and uniformly scaled to fit the viewport, so the
 * layout stays coherent at any window size.
 */
export function BattleStartScreen({
  init,
  cardDatabase,
  onBegin,
}: {
  init: BattleInit;
  cardDatabase: ReadonlyMap<number, CardData>;
  onBegin: () => void;
}) {
  const enemy = init.enemyDescriptor;
  // Firebase RTDB stores an empty array as an absent field, so a descriptor read
  // back from the shared battle state arrives with `signatureCards` / `dreamsigns`
  // undefined whenever the opponent has none (a starter-deck opponent has no
  // non-starter signature cards; most opponents carry no dreamsigns). Default
  // both to empty arrays before use.
  const signatureSummaries = enemy.signatureCards ?? [];
  const dreamsigns = enemy.dreamsigns ?? [];
  const [scale, setScale] = useState(1);
  const [portraitBroken, setPortraitBroken] = useState(false);
  const [sceneBroken, setSceneBroken] = useState(false);
  const [sceneShown, setSceneShown] = useState(false);

  // The dreamscape this battle takes place in, resolved through the battle's own
  // atlas snapshot: `init.dreamscapeId` is the atlas node id; the node carries
  // the dreamscape content id the scene art is keyed by.
  const sceneNode =
    init.dreamscapeId !== null
      ? init.atlasSnapshot.nodes[init.dreamscapeId]
      : undefined;
  const sceneContentId = sceneNode?.dreamscapeId ?? null;
  const sceneUrl =
    sceneContentId !== null ? dreamscapeSceneUrl(sceneContentId) : null;

  // Cross-fade the scene art in on mount, matching the dreamscape overview.
  useEffect(() => {
    const id = setTimeout(() => {
      setSceneShown(true);
    }, 40);
    return () => {
      clearTimeout(id);
    };
  }, []);

  useEffect(() => {
    function fit() {
      setScale(
        Math.min(
          window.innerWidth / CANVAS_WIDTH,
          window.innerHeight / CANVAS_HEIGHT,
        ),
      );
    }
    fit();
    window.addEventListener("resize", fit);
    return () => {
      window.removeEventListener("resize", fit);
    };
  }, []);

  useEffect(() => {
    logEventOnce(
      `battle_start_screen_opened:${init.battleId}`,
      "battle_start_screen_opened",
      {
        battleId: init.battleId,
        enemyId: enemy.id,
        enemyName: enemy.name,
        scoreToWin: init.scoreToWin,
        essenceReward: init.essenceReward,
        dreamsignCount: dreamsigns.length,
        signatureCardIds: signatureSummaries.map((card) => card.cardId),
      },
    );
  }, [init, enemy, dreamsigns, signatureSummaries]);

  // Resolve each signature card's full catalog data for rendering. The opponent
  // deck is built from the same database, so a lookup miss is not expected, but
  // a missing entry is filtered rather than crashing the reveal.
  const signatureCards = useMemo(
    () =>
      signatureSummaries
        .map((card) => cardDatabase.get(card.cardNumber))
        .filter((card): card is CardData => card !== undefined),
    [signatureSummaries, cardDatabase],
  );

  const hasDreamsigns = dreamsigns.length > 0;
  const portraitSrc = dreamcallerImageSrc(enemy.imageNumber ?? "001");

  function handleBegin() {
    logEvent("battle_start_screen_begin_clicked", {
      battleId: init.battleId,
      enemyId: enemy.id,
    });
    onBegin();
  }

  return (
    <div className="bs-root" data-battle-start-screen="">
      <div
        className="bs-canvas"
        style={{ transform: `translate(-50%, -50%) scale(${String(scale)})` }}
      >
        {/* background */}
        <div className="bs-bg">
          {sceneUrl !== null && !sceneBroken && (
            <div className={"bs-scene" + (sceneShown ? " shown" : "")}>
              <img
                src={sceneUrl}
                alt=""
                onError={() => {
                  setSceneBroken(true);
                }}
              />
            </div>
          )}
          <div className="bs-aura" />
        </div>

        <div className="bs-motes" aria-hidden="true">
          {MOTES.map((mote, i) => (
            <span
              key={i}
              style={{
                left: `${String(mote.left)}%`,
                top: `${String(mote.top)}%`,
                width: mote.size,
                height: mote.size,
                animationDuration: `${String(mote.duration)}s`,
                animationDelay: `${String(mote.delay)}s`,
              }}
            />
          ))}
        </div>

        {/* hero portrait */}
        {portraitBroken ? (
          <div className="bs-figure-fallback" aria-hidden="true">
            {enemy.name.charAt(0)}
          </div>
        ) : (
          <>
            <img
              className="bs-figure"
              src={portraitSrc}
              alt={enemy.name}
              onError={() => {
                setPortraitBroken(true);
              }}
            />
            <div className="bs-figure-tint" />
          </>
        )}

        <div className="bs-vignette" />

        {/* top: objectives */}
        <div className="bs-top">
          <div className="bs-eyebrow">
            <i className="bxf bx-skull" aria-hidden="true" /> Incoming Battle
          </div>
          <div className="bs-objectives">
            <div className="bs-obj">
              <span className="bs-obj-val">
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  {init.scoreToWin}
                </span>
                <i
                  className="bxf bx-star-circle bs-obj-sym score"
                  aria-hidden="true"
                />
              </span>
              <div className="bs-obj-lbl">Points to Win</div>
            </div>
            <div className="bs-obj">
              <EssenceValue
                amount={init.essenceReward}
                className="bs-obj-essence"
                data-battle-start-essence=""
              />
              <div className="bs-obj-lbl">Essence Reward</div>
            </div>
          </div>
        </div>

        {/* left: dreamsigns (omitted when the opponent carries none) */}
        {hasDreamsigns && (
          <div className="bs-col left">
            <div className="bs-col-head">
              <i className="bxf bx-moon" aria-hidden="true" /> Dreamsigns
            </div>
            <div className="bs-cards">
              {dreamsigns.map((sign, i) => (
                <div className="bs-sign" key={i}>
                  <div className="bs-sign-disc">
                    <div className="bs-sign-aura" />
                    <i className="bxf bx-star" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="bs-sign-name">{sign.name}</div>
                    <div className="bs-sign-rule">{sign.effectDescription}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* right: signature cards */}
        <div className="bs-col right">
          <div className="bs-col-head">
            <i className="bxf bx-layer" aria-hidden="true" /> Signature Cards
          </div>
          <div className="bs-cards">
            {signatureCards.map((card) => (
              <div className="bs-cardrow" key={card.id}>
                <div className="bs-card-art">
                  <CardView card={card} hideRulesText suppressHoverHelp />
                </div>
                <div className="bs-card-meta">
                  <div className="bs-card-name">{card.name}</div>
                  <div className="bs-card-type">
                    {formatTypeLine(card) || card.cardType}
                    {card.rarity === "Legendary" ? " · Legendary" : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* center name plate */}
        <div className="bs-plate">
          <h1 className="bs-name">{enemy.name}</h1>
          {enemy.subtitle ? <div className="bs-title">{enemy.subtitle}</div> : null}
          <div className="bs-ability">
            <i className="bxf bx-info-circle" aria-hidden="true" />
            <div className="bs-ability-txt">
              <RulesText text={enemy.abilityText} />
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="bs-cta">
          <button
            type="button"
            className="bs-begin"
            onClick={handleBegin}
            data-battle-start-begin=""
          >
            <i className="bxf bx-skull" aria-hidden="true" /> Begin Battle
          </button>
        </div>
      </div>
    </div>
  );
}
