// BattleStartScreen — the pure Cumulus opponent preview. Desktop and mobile
// share one complete opponent dossier; only its placement and object scale
// respond to the viewport.

import { useRef, type ReactNode } from "react";
import type { GameCardModel } from "../components/card/CardView";
import { GameCard } from "../components/card/CardView";
import { RulesText } from "../components/card/RulesText";
import { GlassButton } from "../components/controls/GlassButton";
import { GlowIcon } from "../components/controls/GlowIcon";
import { DreamcallerPortrait } from "../components/hud/DreamcallerPortrait";
import { Dreamsign } from "../components/hud/Dreamsign";
import { EssenceValue } from "../components/hud/EssenceValue";
import { QUEST_STATUS_BAR_FLOATING_PANEL_CLEARANCE } from "../components/hud/QuestStatusBar";
import { GlassPanel } from "../components/overlay/GlassPanel";
import type { ArtRef } from "../primitives/art";
import { resolveArtRef } from "../primitives/art";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
import type { Dreamsign as DreamsignData } from "../../types/quest";
import {
  GUIDE_GALLERY_MOBILE_GUIDE_HEIGHT,
  GUIDE_GALLERY_MOBILE_GUIDE_LEFT,
  GUIDE_GALLERY_MOBILE_GUIDE_WIDTH,
  GUIDE_GALLERY_MOBILE_PANEL_WIDTH,
} from "./guide-gallery-geometry";
import { useIsDesktop } from "./use-is-desktop";

export interface BattleStartDreamcallerView {
  id: string;
  name: string;
  title: string;
  imageNumber: string;
  ability: string;
  abilityActive: boolean;
}

export interface BattleStartSignatureCardView {
  cardId: string;
  model: GameCardModel;
}

export interface BattleStartView {
  battleId: string;
  scene: ArtRef | null;
  dreamcaller: BattleStartDreamcallerView;
  dreamsigns: readonly DreamsignData[];
  signatureCards: readonly BattleStartSignatureCardView[];
  pointsToWin: number;
  essenceReward: number;
}

export interface BattleStartScreenProps {
  view: BattleStartView;
  onBegin: () => void;
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

export function BattleStartScreen({ view, onBegin }: BattleStartScreenProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneUrl = view.scene !== null ? resolveArtRef(view.scene) : null;
  const isDesktop = useIsDesktop();

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
    </div>
  );
}

function DesktopBattleStartLayout({ view, onBegin }: BattleStartScreenProps) {
  return (
    <main
      data-battle-start-layout="desktop"
      style={{
        position: "absolute",
        inset: `max(var(--safe-area-inset-top), ${token("--space-8")}) max(var(--safe-area-inset-right), ${token("--space-10")}) max(var(--safe-area-inset-bottom), ${token("--space-8")}) max(var(--safe-area-inset-left), ${token("--space-10")})`,
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) minmax(520px, 0.9fr)",
        gap: token("--space-12"),
        alignItems: "center",
        justifyItems: "center",
      }}
    >
      <section
        data-battle-start-opponent={view.dreamcaller.id}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: CHARACTER_STAGE_MAX_WIDTH,
          height: "100%",
          minHeight: 0,
          alignSelf: "stretch",
        }}
      >
        <OpponentPortrait dreamcaller={view.dreamcaller} />
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
        data-battle-start-opponent={view.dreamcaller.id}
        data-battle-start-opponent-framing="cutout"
        style={{
          position: "absolute",
          left: GUIDE_GALLERY_MOBILE_GUIDE_LEFT,
          bottom: QUEST_STATUS_BAR_FLOATING_PANEL_CLEARANCE,
          width: GUIDE_GALLERY_MOBILE_GUIDE_WIDTH,
          height: GUIDE_GALLERY_MOBILE_GUIDE_HEIGHT,
          transform: `scale(${String(MOBILE_OPPONENT_SCALE)})`,
          transformOrigin: "50% 100%",
          zIndex: 1,
        }}
      >
        <OpponentPortrait dreamcaller={view.dreamcaller} />
      </section>

      <BattleStartPanel view={view} onBegin={onBegin} density="compact" />
    </main>
  );
}

function OpponentPortrait({
  dreamcaller,
}: {
  readonly dreamcaller: BattleStartDreamcallerView;
}) {
  return (
    <DreamcallerPortrait
      dreamcaller={{
        imageNumber: dreamcaller.imageNumber,
        name: dreamcaller.name,
        title: dreamcaller.title,
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
    <Dreamsign
      key={dreamsign.id}
      dreamsign={dreamsign}
      sizePx={dreamsignSize}
      testid={`cumulus-battle-start-dreamsign-${String(dreamsign.id)}`}
    />
  ));

  return (
    <section
      data-battle-start-panel=""
      data-battle-start-panel-density={density}
      style={{
        position: compact ? "absolute" : "relative",
        top: undefined,
        right: undefined,
        bottom: compact ? QUEST_STATUS_BAR_FLOATING_PANEL_CLEARANCE : undefined,
        left: compact ? token("--space-4") : undefined,
        zIndex: compact ? 4 : undefined,
        width: compact ? GUIDE_GALLERY_MOBILE_PANEL_WIDTH : "100%",
        maxWidth: compact ? undefined : PANEL_MAX_WIDTH,
        maxHeight: compact
          ? `calc(100dvh - ${QUEST_STATUS_BAR_FLOATING_PANEL_CLEARANCE} - ${token("--space-4")})`
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
            padding: compact ? token("--space-6") : token("--space-9"),
            display: "flex",
            flexDirection: "column",
            gap: compact ? token("--space-6") : token("--space-7"),
            overflowY: compact ? "auto" : undefined,
            overscrollBehavior: compact ? "contain" : undefined,
          }}
        >
          <header
            style={{ display: "grid", gap: compact ? 0 : token("--space-3") }}
          >
            <h1
              style={{
                margin: 0,
                font: compact ? token("--t-title-sm") : token("--t-hero"),
              }}
            >
              {view.dreamcaller.name}
            </h1>
            {view.dreamcaller.title !== "" && (
              <p
                style={{
                  margin: 0,
                  font: compact ? token("--t-body") : token("--t-hero-epithet"),
                  fontStyle: "italic",
                  color: token("--text-on-glass-muted"),
                }}
              >
                {view.dreamcaller.title}
              </p>
            )}
          </header>

          {view.dreamcaller.ability !== "" && (
            <PanelSection label="Ability" density={density}>
              <div style={{ font: token("--t-rules") }}>
                {view.dreamcaller.abilityActive ? (
                  <RulesText text={view.dreamcaller.ability} />
                ) : (
                  <span style={{ color: token("--text-on-glass-muted") }}>
                    Opponent dreamcaller ability is not active.
                  </span>
                )}
              </div>
            </PanelSection>
          )}

          {compact &&
            (view.signatureCards.length > 0 || view.dreamsigns.length > 0) && (
              <PanelSection
                label={
                  view.dreamsigns.length > 0
                    ? "Signature Cards & Dreamsigns"
                    : "Signature Cards"
                }
                density={density}
              >
                <div
                  data-battle-start-signature-objects=""
                  style={{
                    display: "flex",
                    gap: token("--space-4"),
                    alignItems: "center",
                  }}
                >
                  {signatureCards}
                  {dreamsigns}
                </div>
              </PanelSection>
            )}

          {!compact && view.signatureCards.length > 0 && (
            <PanelSection label="Signature Cards" density={density}>
              <div
                data-battle-start-signature-cards=""
                style={{
                  display: "flex",
                  gap: compact ? token("--space-3") : token("--space-6"),
                  alignItems: "flex-start",
                }}
              >
                {signatureCards}
              </div>
            </PanelSection>
          )}

          {!compact && view.dreamsigns.length > 0 && (
            <PanelSection label="Dreamsigns" density={density}>
              <div
                style={{
                  display: "flex",
                  gap: compact ? token("--space-3") : token("--space-6"),
                }}
              >
                {dreamsigns}
              </div>
            </PanelSection>
          )}

          <footer
            style={{
              paddingTop: compact ? token("--space-5") : token("--space-6"),
              borderTop: `1px solid ${token("--glass-rim")}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: compact ? token("--space-4") : token("--space-8"),
              marginTop: compact ? undefined : "auto",
            }}
          >
            <div
              data-battle-start-stakes=""
              style={{
                display: "flex",
                gap: compact ? token("--space-5") : token("--space-8"),
              }}
            >
              <Stake label="To Win" density={density}>
                <span>{view.pointsToWin}</span>
                <GlowIcon iconClass={GLYPHS.points} color="white" size="1em" />
              </Stake>
              <Stake label="Reward" density={density}>
                <EssenceValue amount={view.essenceReward} tone="inherit" />
              </Stake>
            </div>
            <GlassButton
              label="Begin Battle"
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
  label,
  density,
  children,
}: {
  readonly label: string;
  readonly density: PanelDensity;
  readonly children: ReactNode;
}) {
  const compact = density === "compact";
  return (
    <section
      data-battle-start-panel-section={label}
      style={{
        paddingTop: compact ? token("--space-5") : token("--space-6"),
        borderTop: `1px solid ${token("--glass-rim")}`,
        display: "grid",
        gap: compact ? token("--space-4") : token("--space-5"),
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
        {label}
      </h2>
      {children}
    </section>
  );
}

function Stake({
  label,
  density,
  children,
}: {
  readonly label: string;
  readonly density: PanelDensity;
  readonly children: ReactNode;
}) {
  const compact = density === "compact";
  return (
    <div
      data-battle-start-stake={label}
      style={{ display: "grid", gap: compact ? 0 : token("--space-3") }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: compact ? token("--space-2") : token("--space-3"),
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
        {label}
      </span>
    </div>
  );
}
