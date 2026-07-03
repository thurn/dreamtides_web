import { useEffect, useMemo, useState } from "react";
import "./battle-start.css";
import type { BattleInit } from "../types";
import type { CardData } from "../../types/cards";
import { CardView } from "../../tango/components/CardView";
import { RulesText } from "../../tango/components/RulesText";
import { EssenceValue } from "../../tango/components/EssenceValue";
import { dreamcallerImageSrc } from "../../tango/components/DreamcallerPortrait";
import { dreamscapeSceneUrl } from "../../tango/components/atlas-display";
import { assetUrl } from "../../runtime/asset-url";
import {
  opponentCarriesDreamsign,
  resolveRunLayerCount,
} from "../integration/opponent-deck";
import { logEvent, logEventOnce } from "../../logging";

/** The fixed authoring canvas the Battle Start composition is laid out against. */
const CANVAS_WIDTH = 1920;
const CANVAS_HEIGHT = 1080;

/**
 * Ambient drifting motes scattered over the dream wash. Positions and timings
 * are derived from the index so the field is deterministic (no `Math.random`)
 * and stable across re-renders.
 */
const MOTES = Array.from({ length: 24 }, (_unused, i) => ({
  left: (i * 53) % 100,
  top: (i * 71) % 100,
  size: 1.5 + ((i * 7) % 5) * 0.7,
  duration: 13 + ((i * 11) % 12),
  delay: -((i * 3) % 18),
}));

/**
 * A single dreamsign in the rail: its artwork (or a glyph fallback when the
 * image is missing) with a hover/focus tooltip carrying the name and effect. A
 * bane dreamsign desaturates and takes a red accent so the warning reads first.
 */
function DreamsignIcon({
  name,
  effect,
  imageName,
  imageAlt,
  isBane,
}: {
  name: string;
  effect: string;
  imageName: string | undefined;
  imageAlt: string | undefined;
  isBane: boolean;
}) {
  const [imageBroken, setImageBroken] = useState(false);
  const showImage = imageName !== undefined && imageName !== "" && !imageBroken;
  return (
    <div className={"bs-sign" + (isBane ? " bane" : "")} tabIndex={0}>
      {showImage ? (
        <img
          className="bs-sign-img"
          src={assetUrl(`/dreamsigns/${imageName}`)}
          alt={imageAlt ?? name}
          onError={() => {
            setImageBroken(true);
          }}
        />
      ) : (
        <div className="bs-sign-fallback" aria-hidden="true">
          {isBane ? "☠" : "✦"}
        </div>
      )}
      <div className="bs-sign-pop">
        <div className="bs-sign-name">{name}</div>
        <div className="bs-sign-rule">{effect}</div>
      </div>
    </div>
  );
}

/**
 * The Battle Start screen: the opposing Dreamcaller revealed after the player
 * clicks a battle site and before hands are dealt. The Dreamcaller render is the
 * hero of the composition on the left; everything else — name, ability,
 * dreamsigns, signature cards, the battle objective (points to win, essence
 * reward), and "Begin Battle" — lives in one compact rail on the right.
 * Dreamsigns and signature cards are quiet thumbnails that reveal their detail
 * on hover. "Begin Battle" hands off to the playable battle.
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

  const hasAbility = enemy.abilityText.trim() !== "";
  // The opponent's Dreamcaller ability comes online from the run midpoint on —
  // the same gate that grants its dreamsign. Before that point it lies dormant,
  // so the Battle Start screen labels the ability as inactive.
  const dreamcallerAbilityActive = opponentCarriesDreamsign(
    init.completionLevelAtStart,
    resolveRunLayerCount(init.atlasSnapshot.layers),
  );
  const hasDreamsigns = dreamsigns.length > 0;
  const hasSignatureCards = signatureCards.length > 0;
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

        {/* the Dreamcaller render — left */}
        <div className="bs-figure-wrap">
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
        </div>

        <div className="bs-scrim" />

        {/* everything else — right rail */}
        <div className="bs-rail">
          {/* who they are */}
          <div className="bs-headline">
            <h1 className="bs-name">{enemy.name}</h1>
            {enemy.subtitle ? (
              <div className="bs-title">{enemy.subtitle}</div>
            ) : null}
          </div>

          {/* the Dreamcaller's ability — its own titled block */}
          {hasAbility && <div className="bs-rule" />}
          {hasAbility && (
            <div className="bs-ability">
              <div className="bs-caption">Ability</div>
              {dreamcallerAbilityActive ? (
                <div className="bs-ability-txt">
                  <RulesText text={enemy.abilityText} />
                </div>
              ) : (
                <div className="bs-ability-inactive">
                  Opponent dreamcaller ability is not active.
                </div>
              )}
            </div>
          )}

          {/* what they bring — dreamsigns (omitted when the opponent carries none) */}
          {hasDreamsigns && <div className="bs-rule" />}
          {hasDreamsigns && (
            <div className="bs-signgroup">
              <div className="bs-caption">Dreamsigns</div>
              <div className="bs-signs">
                {dreamsigns.map((sign, i) => (
                  <DreamsignIcon
                    key={i}
                    name={sign.name}
                    effect={sign.effectDescription}
                    imageName={sign.imageName}
                    imageAlt={sign.imageAlt}
                    isBane={sign.isBane}
                  />
                ))}
              </div>
            </div>
          )}

          {/* signature cards (omitted for a starter-deck opponent with none) */}
          {hasSignatureCards && <div className="bs-rule" />}
          {hasSignatureCards && (
            <div className="bs-cardgroup">
              <div className="bs-caption">Signature Cards</div>
              <div className="bs-cards">
                {signatureCards.map((card) => (
                  <div className="bs-card" key={card.id}>
                    <div className="bs-card-thumb">
                      <CardView card={card} suppressHoverHelp />
                    </div>
                    <div className="bs-card-pop">
                      <CardView card={card} suppressHoverHelp />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* the terms of this battle + the action */}
          <div className="bs-rule" />

          <div className="bs-foot">
            <div className="bs-objective">
              <div className="bs-stat">
                <span className="bs-stat-val">
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>
                    {init.scoreToWin}
                  </span>
                  <i
                    className="bxf bx-star-circle bs-sym score"
                    aria-hidden="true"
                  />
                </span>
                <span className="bs-stat-lbl">to win</span>
              </div>
              <div className="bs-obj-div" />
              <div className="bs-stat">
                <span className="bs-stat-essence" data-battle-start-essence="">
                  <EssenceValue amount={init.essenceReward} />
                </span>
                <span className="bs-stat-lbl">reward</span>
              </div>
            </div>
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
    </div>
  );
}
