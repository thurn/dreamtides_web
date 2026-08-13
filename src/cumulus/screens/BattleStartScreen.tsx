// BattleStartScreen — the pure Cumulus opponent preview. Desktop and mobile
// share one complete opponent dossier; only its placement and object scale
// respond to the viewport.

import { useEffect, useRef, type ReactNode } from "react";
import type { GameCardModel } from "../components/card/CardView";
import { GameCard } from "../components/card/CardView";
import { RulesText } from "../components/card/RulesText";
import { GlassButton } from "../components/controls/GlassButton";
import { InlineGlyph } from "../components/typography/InlineGlyph";
import { DreamAvatarStage } from "../components/hud/DreamAvatarStage";
import { Dreamsign } from "../components/hud/Dreamsign";
import { EssenceValue } from "../components/hud/EssenceValue";
import { JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE } from "../components/hud/JourneyStatusBar";
import { GlassPanel } from "../components/overlay/GlassPanel";
import { CharacterDialogue } from "../components/overlay/CharacterDialogue";
import type { ArtRef } from "../primitives/art";
import { resolveArtRef } from "../primitives/art";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
import type { LocalizedDreamsign } from "../components/hud/Dreamsign";
import {
  GUIDE_GALLERY_MOBILE_GUIDE_HEIGHT,
  GUIDE_GALLERY_MOBILE_GUIDE_LEFT,
  GUIDE_GALLERY_MOBILE_GUIDE_WIDTH,
  GUIDE_GALLERY_MOBILE_PANEL_WIDTH,
} from "./guide-gallery-geometry";
import { useIsDesktop } from "./use-is-desktop";
import type { TutorialSpeechBubbleView } from "./tutorial-speech-bubble-view";
import { useDelayedTutorialSpeechBubbleVisibility } from "./use-delayed-tutorial-speech-bubble-visibility";
import { meaning, opaque, txa, tx, type LocalizedString } from "@trox/runtime";
import { useLocalizer } from "../../runtime/localization/use-localizer";

export interface BattleStartDreamAvatarView {
  id: string;
  name: LocalizedString;
  title: LocalizedString;
  imageNumber: string;
  ability: LocalizedString;
  abilityActive: boolean;
}

export interface BattleStartSignatureCardView {
  cardId: string;
  model: GameCardModel;
}

export interface BattleStartView {
  battleId: string;
  scene: ArtRef | null;
  dreamAvatar: BattleStartDreamAvatarView;
  dreamsigns: readonly LocalizedDreamsign[];
  signatureCards: readonly BattleStartSignatureCardView[];
  pointsToWin: number;
  essenceReward: number;
  guideDialogue?: TutorialSpeechBubbleView;
}

export interface BattleStartScreenProps {
  view: BattleStartView;
  onBegin: () => void;
  onGuideDialogueShown?: () => void;
}

type PanelDensity = "standard" | "compact";

/** Desktop dossier width and opponent-stage width are composition measures. */
const PANEL_MAX_WIDTH = 660;
const CHARACTER_STAGE_MAX_WIDTH = 760;
/** Semantic game objects shrink together in the compact mobile dossier. */
const SIGNATURE_CARD_WIDTH = 116;
const DREAMSIGN_SIZE = 62;
const COMPACT_SIGNATURE_CARD_WIDTH = 64;
const COMPACT_DREAMSIGN_SIZE = 52;
/** Enlarges the feet-anchored mobile opponent behind the bottom dossier. */
const MOBILE_OPPONENT_SCALE = 3;

export function BattleStartScreen({
  view,
  onBegin,
  onGuideDialogueShown,
}: BattleStartScreenProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneUrl = view.scene !== null ? resolveArtRef(view.scene) : null;
  const isDesktop = useIsDesktop();
  const guideDialogueVisible = useDelayedTutorialSpeechBubbleVisibility(
    view.guideDialogue?.id,
    view.guideDialogue?.delaySeconds ?? 0,
  );
  useEffect(() => {
    if (guideDialogueVisible) onGuideDialogueShown?.();
  }, [guideDialogueVisible, onGuideDialogueShown]);

  return (
    <div
      ref={stageRef}
      className="cumulus"
      data-testid="cumulus-battle-start-screen"
      data-battle-id={view.battleId}
      style={{
        position: "fixed",
        inset: 0,
        minHeight: "100dvh",
        overflow: "hidden",
        background: token("--bg-app"),
        color: token("--text-on-glass"),
      }}
    >
      {sceneUrl !== null && (
        <img
          src={sceneUrl}
          alt=""
          draggable={false}
          data-testid="cumulus-battle-start-scene"
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "50% 58%",
            userSelect: "none",
          }}
        />
      )}

      {isDesktop ? (
        <DesktopBattleStartLayout view={view} onBegin={onBegin} />
      ) : (
        <MobileBattleStartLayout view={view} onBegin={onBegin} />
      )}

      {view.guideDialogue !== undefined && (
        <div
          data-battle-start-guide-dialogue-placement=""
          style={{
            position: "absolute",
            zIndex: token("--layer-reveal"),
            top: `calc(${token("--safe-top")} + ${token("--space-s")})`,
            left: "50%",
            width: `${String(view.guideDialogue.bubbleWidth)}px`,
            maxWidth: `calc(100vw - 2 * ${token("--gutter")})`,
            transform: `translate(calc(-50% + ${String(view.guideDialogue.horizontalOffset)}px), ${String(view.guideDialogue.verticalOffset)}px)`,
            pointerEvents: "none",
          }}
        >
          <CharacterDialogue
            dialogue={view.guideDialogue.model}
            visible={guideDialogueVisible}
            size={isDesktop ? "wide" : "compact"}
            testId="battle-start-tutorial-dialogue"
          />
        </div>
      )}
    </div>
  );
}

function DesktopBattleStartLayout({ view, onBegin }: BattleStartScreenProps) {
  return (
    <main
      data-battle-start-layout="desktop"
      style={{
        position: "absolute",
        inset: `max(var(--safe-area-inset-top), ${token("--space-2xl")}) max(var(--safe-area-inset-right), ${token("--space-4xl")}) max(var(--safe-area-inset-bottom), ${token("--space-2xl")}) max(var(--safe-area-inset-left), ${token("--space-4xl")})`,
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(520px, 0.9fr)",
        gap: token("--space-6xl"),
        alignItems: "center",
        justifyItems: "center",
      }}
    >
      <section
        data-battle-start-opponent={view.dreamAvatar.id}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: CHARACTER_STAGE_MAX_WIDTH,
          height: "100%",
          minHeight: 0,
          alignSelf: "stretch",
        }}
      >
        <OpponentPortrait dreamAvatar={view.dreamAvatar} />
      </section>

      <BattleStartPanel view={view} onBegin={onBegin} density="standard" />
    </main>
  );
}

function MobileBattleStartLayout({ view, onBegin }: BattleStartScreenProps) {
  return (
    <main
      data-battle-start-layout="mobile"
      style={{ position: "absolute", inset: 0 }}
    >
      <section
        data-battle-start-opponent={view.dreamAvatar.id}
        data-battle-start-opponent-framing="cutout"
        style={{
          position: "absolute",
          left: GUIDE_GALLERY_MOBILE_GUIDE_LEFT,
          bottom: JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE,
          width: GUIDE_GALLERY_MOBILE_GUIDE_WIDTH,
          height: GUIDE_GALLERY_MOBILE_GUIDE_HEIGHT,
          transform: `scale(${String(MOBILE_OPPONENT_SCALE)})`,
          transformOrigin: "50% 100%",
          zIndex: 1,
        }}
      >
        <OpponentPortrait dreamAvatar={view.dreamAvatar} />
      </section>

      <BattleStartPanel view={view} onBegin={onBegin} density="compact" />
    </main>
  );
}

function OpponentPortrait({
  dreamAvatar,
}: {
  readonly dreamAvatar: BattleStartDreamAvatarView;
}) {
  return (
    <DreamAvatarStage
      dreamAvatar={{
        imageNumber: dreamAvatar.imageNumber,
        name: dreamAvatar.name,
        title: dreamAvatar.title,
      }}
      variant="cutout"
    />
  );
}

function BattleStartPanel({
  view,
  onBegin,
  density,
}: BattleStartScreenProps & { readonly density: PanelDensity }) {
  const resolve = useLocalizer();
  const compact = density === "compact";
  const cardWidth = compact
    ? COMPACT_SIGNATURE_CARD_WIDTH
    : SIGNATURE_CARD_WIDTH;
  const dreamsignSize = compact ? COMPACT_DREAMSIGN_SIZE : DREAMSIGN_SIZE;
  const signatureCards = view.signatureCards.map((card) => (
    <div
      key={card.cardId}
      data-signature-card-id={card.cardId}
      style={{ width: cardWidth, flex: "none" }}
    >
      <GameCard model={card.model} />
    </div>
  ));
  const dreamsigns = view.dreamsigns.map((dreamsign) => (
    <div
      key={dreamsign.id}
      style={{ width: dreamsignSize, height: dreamsignSize, flex: "none" }}
    >
      <Dreamsign
        dreamsign={dreamsign}
        testid={`cumulus-battle-start-dreamsign-${String(dreamsign.id)}`}
      />
    </div>
  ));

  return (
    <section
      data-battle-start-panel=""
      data-battle-start-panel-density={density}
      style={{
        position: compact ? "absolute" : "relative",
        top: undefined,
        right: undefined,
        bottom: compact
          ? JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE
          : undefined,
        left: compact ? token("--space-s") : undefined,
        zIndex: compact ? 4 : undefined,
        width: compact ? GUIDE_GALLERY_MOBILE_PANEL_WIDTH : "100%",
        maxWidth: compact ? undefined : PANEL_MAX_WIDTH,
        maxHeight: compact
          ? `calc(100dvh - ${JOURNEY_STATUS_BAR_FLOATING_PANEL_CLEARANCE} - ${token("--space-s")})`
          : "100%",
        alignSelf: undefined,
        justifySelf: undefined,
        boxSizing: "border-box",
      }}
    >
      <GlassPanel
        testId="cumulus-battle-start-glass-panel"
        overflow={compact ? "hidden" : "visible"}
      >
        <div
          data-battle-start-panel-content=""
          style={{
            maxHeight: "100%",
            boxSizing: "border-box",
            padding: compact ? token("--space-l") : token("--space-3xl"),
            display: "flex",
            flexDirection: "column",
            gap: compact ? token("--space-l") : token("--space-xl"),
            overflowY: compact ? "auto" : undefined,
            overscrollBehavior: compact ? "contain" : undefined,
          }}
        >
          <header
            style={{ display: "grid", gap: compact ? 0 : token("--space-xs") }}
          >
            <h1
              style={{
                margin: 0,
                font: compact ? token("--t-title-sm") : token("--t-hero"),
              }}
            >
              {resolve(
                txa(
                  "Battle vs. {avatar_name}",
                  { avatar_name: opaque(view.dreamAvatar.name) },
                  "Player-facing message for the battle start title interface state.",
                ),
              )}
            </h1>
            {resolve(view.dreamAvatar.title) !== "" && (
              <p
                style={{
                  margin: 0,
                  font: compact ? token("--t-body") : token("--t-hero-epithet"),
                  fontStyle: "italic",
                  color: token("--text-on-glass-muted"),
                }}
              >
                {resolve(view.dreamAvatar.title)}
              </p>
            )}
          </header>

          {resolve(view.dreamAvatar.ability) !== "" && (
            <PanelSection
              section="ability"
              label={tx(
                meaning("battle-avatar-ability-label", "Ability"),
                "Player-facing message for the battle start ability label interface state.",
              )}
              density={density}
            >
              <div style={{ font: token("--t-rules") }}>
                {view.dreamAvatar.abilityActive ? (
                  <RulesText
                    text={view.dreamAvatar.ability}
                    owner={{ kind: "dreamAvatar", id: view.dreamAvatar.id }}
                  />
                ) : (
                  <span style={{ color: token("--text-on-glass-muted") }}>
                    {resolve(
                      tx(
                        "Opponent avatar ability is not active.",
                        "Unavailable-state description for an opponent Dream Avatar whose ability is disabled during a tutorial battle.",
                      ),
                    )}
                  </span>
                )}
              </div>
            </PanelSection>
          )}

          {compact &&
            (view.signatureCards.length > 0 || view.dreamsigns.length > 0) && (
              <PanelSection
                section="signature-objects"
                label={
                  view.dreamsigns.length > 0
                    ? tx(
                        "Signature Cards & Dreamsigns",
                        "Player-facing message for the battle start signature cards and dreamsigns label interface state.",
                      )
                    : tx(
                        "Signature Cards",
                        "Visible collection label for the active Dream Avatar's authored signature cards.",
                      )
                }
                density={density}
              >
                <div
                  data-battle-start-signature-objects=""
                  style={{
                    display: "flex",
                    gap: token("--space-s"),
                    alignItems: "center",
                  }}
                >
                  {signatureCards}
                  {dreamsigns}
                </div>
              </PanelSection>
            )}

          {!compact && view.signatureCards.length > 0 && (
            <PanelSection
              section="signature-cards"
              label={tx(
                "Signature Cards",
                "Visible collection label for the active Dream Avatar's authored signature cards.",
              )}
              density={density}
            >
              <div
                data-battle-start-signature-cards=""
                style={{
                  display: "flex",
                  gap: compact ? token("--space-xs") : token("--space-l"),
                  alignItems: "flex-start",
                }}
              >
                {signatureCards}
              </div>
            </PanelSection>
          )}

          {!compact && view.dreamsigns.length > 0 && (
            <PanelSection
              section="dreamsigns"
              label={tx(
                "Dreamsigns",
                "Section label for the player’s collected Dreamsigns.",
              )}
              density={density}
            >
              <div
                style={{
                  display: "flex",
                  gap: compact ? token("--space-xs") : token("--space-l"),
                }}
              >
                {dreamsigns}
              </div>
            </PanelSection>
          )}

          <footer
            style={{
              paddingTop: compact ? token("--space-m") : token("--space-l"),
              borderTop: `1px solid ${token("--glass-rim")}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: compact ? token("--space-s") : token("--space-2xl"),
              marginTop: compact ? undefined : "auto",
            }}
          >
            <div
              data-battle-start-stakes=""
              style={{
                display: "flex",
                gap: compact ? token("--space-m") : token("--space-2xl"),
              }}
            >
              <Stake
                stake="points"
                label={tx(
                  "To Win",
                  "Player-facing message for the battle start to win label interface state.",
                )}
                density={density}
              >
                <span>{view.pointsToWin}</span>
                <InlineGlyph glyph={GLYPHS.points} color="white" />
              </Stake>
              <Stake
                stake="reward"
                label={tx(
                  "Reward",
                  "Player-facing message for the battle start reward label interface state.",
                )}
                density={density}
              >
                <EssenceValue amount={view.essenceReward} tone="inherit" />
              </Stake>
            </div>
            <GlassButton
              label={tx(
                "Begin Battle",
                "Player-facing message for the battle start action interface state.",
              )}
              variant="accent"
              placement="onGlass"
              onPress={onBegin}
              testId="cumulus-battle-start-begin"
            />
          </footer>
        </div>
      </GlassPanel>
    </section>
  );
}

function PanelSection({
  section,
  label,
  density,
  children,
}: {
  readonly section:
    "ability" | "signature-objects" | "signature-cards" | "dreamsigns";
  readonly label: LocalizedString;
  readonly density: PanelDensity;
  readonly children: ReactNode;
}) {
  const compact = density === "compact";
  const resolve = useLocalizer();
  return (
    <section
      data-battle-start-panel-section={section}
      style={{
        paddingTop: compact ? token("--space-m") : token("--space-l"),
        borderTop: `1px solid ${token("--glass-rim")}`,
        display: "grid",
        gap: compact ? token("--space-s") : token("--space-m"),
      }}
    >
      <h2
        style={{
          margin: 0,
          font: token("--t-eyebrow"),
          letterSpacing: token("--tracking-eyebrow"),
          textTransform: "uppercase",
          color: token("--text-on-glass-muted"),
        }}
      >
        {resolve(label)}
      </h2>
      {children}
    </section>
  );
}

function Stake({
  stake,
  label,
  density,
  children,
}: {
  readonly stake: "points" | "reward";
  readonly label: LocalizedString;
  readonly density: PanelDensity;
  readonly children: ReactNode;
}) {
  const compact = density === "compact";
  const resolve = useLocalizer();
  return (
    <div
      data-battle-start-stake={stake}
      style={{ display: "grid", gap: compact ? 0 : token("--space-xs") }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: compact ? token("--space-xs") : token("--space-s"),
          font: compact ? token("--t-body") : token("--t-title-sm"),
          color: token("--text-on-glass"),
        }}
      >
        {children}
      </div>
      <span
        style={{
          font: token("--t-eyebrow"),
          letterSpacing: token("--tracking-eyebrow"),
          textTransform: "uppercase",
          color: token("--text-on-glass-muted"),
        }}
      >
        {resolve(label)}
      </span>
    </div>
  );
}
