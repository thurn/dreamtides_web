// BattleStartScreen — the pure Tango desktop opponent preview. The live scene
// remains untouched; the opponent stands over it at left while a single dense
// liquid-glass panel at right carries every decision-relevant detail.

import { useRef, type ReactNode } from "react";
import type { GameCardModel } from "../components/card/CardView";
import { GameCard } from "../components/card/CardView";
import { RulesText } from "../components/card/RulesText";
import { GlassButton } from "../components/controls/GlassButton";
import { DreamcallerPortrait } from "../components/hud/DreamcallerPortrait";
import { Dreamsign } from "../components/hud/Dreamsign";
import { EssenceValue } from "../components/hud/EssenceValue";
import { GlowIcon } from "../components/controls/GlowIcon";
import { glassSurfaceStyle } from "../internal/glass-surface";
import type { ArtRef } from "../primitives/art";
import { resolveArtRef } from "../primitives/art";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
import type { Dreamsign as DreamsignData } from "../../types/quest";

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

const PANEL_MAX_WIDTH = 660;
const CHARACTER_STAGE_MAX_WIDTH = 760;
const SIGNATURE_CARD_WIDTH = 116;
const DREAMSIGN_SIZE = 62;

export function BattleStartScreen({ view, onBegin }: BattleStartScreenProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneUrl = view.scene !== null ? resolveArtRef(view.scene) : null;

  return (
    <div
      ref={stageRef}
      className="tango"
      data-testid="tango-battle-start-screen"
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
          data-testid="tango-battle-start-scene"
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
          <DreamcallerPortrait
            dreamcaller={{
              imageNumber: view.dreamcaller.imageNumber,
              name: view.dreamcaller.name,
              title: view.dreamcaller.title,
            }}
            variant="cutout"
          />
        </section>

        <section
          data-battle-start-panel=""
          style={{
            ...glassSurfaceStyle({ radius: token("--radius-panel") }),
            width: "100%",
            maxWidth: PANEL_MAX_WIDTH,
            maxHeight: "100%",
            boxSizing: "border-box",
            padding: token("--space-9"),
            display: "flex",
            flexDirection: "column",
            gap: token("--space-7"),
            color: token("--text-on-glass"),
          }}
        >
          <header style={{ display: "grid", gap: token("--space-3") }}>
            <h1 style={{ margin: 0, font: token("--t-hero") }}>
              {view.dreamcaller.name}
            </h1>
            {view.dreamcaller.title !== "" && (
              <p
                style={{
                  margin: 0,
                  font: token("--t-hero-epithet"),
                  fontStyle: "italic",
                  color: token("--text-on-glass-muted"),
                }}
              >
                {view.dreamcaller.title}
              </p>
            )}
          </header>

          {view.dreamcaller.ability !== "" && (
            <PanelSection label="Ability">
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

          {view.signatureCards.length > 0 && (
            <PanelSection label="Signature Cards">
              <div
                data-battle-start-signature-cards=""
                style={{
                  display: "flex",
                  gap: token("--space-6"),
                  alignItems: "flex-start",
                }}
              >
                {view.signatureCards.map((card) => (
                  <div
                    key={card.cardId}
                    data-signature-card-id={card.cardId}
                    style={{ width: SIGNATURE_CARD_WIDTH, flex: "none" }}
                  >
                    <GameCard model={card.model} hideRulesText />
                  </div>
                ))}
              </div>
            </PanelSection>
          )}

          {view.dreamsigns.length > 0 && (
            <PanelSection label="Dreamsigns">
              <div style={{ display: "flex", gap: token("--space-6") }}>
                {view.dreamsigns.map((dreamsign) => (
                  <Dreamsign
                    key={dreamsign.id}
                    dreamsign={dreamsign}
                    sizePx={DREAMSIGN_SIZE}
                    testid={`tango-battle-start-dreamsign-${String(dreamsign.id)}`}
                  />
                ))}
              </div>
            </PanelSection>
          )}

          <footer
            style={{
              paddingTop: token("--space-6"),
              borderTop: `1px solid ${token("--glass-rim")}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: token("--space-8"),
            }}
          >
            <div
              data-battle-start-stakes=""
              style={{ display: "flex", gap: token("--space-8") }}
            >
              <Stake label="To Win">
                <span>{view.pointsToWin}</span>
                <GlowIcon iconClass={GLYPHS.points} color="white" size="1em" />
              </Stake>
              <Stake label="Reward">
                <EssenceValue amount={view.essenceReward} tone="inherit" />
              </Stake>
            </div>
            <GlassButton
              label="Begin Battle"
              placement="onGlass"
              onPress={onBegin}
              testId="tango-battle-start-begin"
            />
          </footer>
        </section>
      </main>
    </div>
  );
}

function PanelSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section
      style={{
        paddingTop: token("--space-6"),
        borderTop: `1px solid ${token("--glass-rim")}`,
        display: "grid",
        gap: token("--space-5"),
      }}
    >
      <h2
        style={{
          margin: 0,
          font: token("--t-eyebrow"),
          letterSpacing: "0.14em",
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

function Stake({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div
      data-battle-start-stake={label}
      style={{ display: "grid", gap: token("--space-3") }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: token("--space-3"),
          font: token("--t-title-sm"),
          color: token("--text-on-glass"),
        }}
      >
        {children}
      </div>
      <span
        style={{
          font: token("--t-eyebrow"),
          letterSpacing: "0.1em",
          textTransform: "uppercase",
          color: token("--text-on-glass-muted"),
        }}
      >
        {label}
      </span>
    </div>
  );
}
