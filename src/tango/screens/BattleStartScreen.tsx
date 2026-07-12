// BattleStartScreen — the pure Tango opponent preview. Desktop keeps the
// opponent-and-dossier composition; mobile gives the opponent the upper scene
// and condenses the decision-critical briefing into a bottom glass sheet.

import { useRef, useState, type ReactNode } from "react";
import type { GameCardModel } from "../components/card/CardView";
import { GameCard } from "../components/card/CardView";
import { RulesText } from "../components/card/RulesText";
import { Button } from "../components/controls/Button";
import { GlassButton } from "../components/controls/GlassButton";
import { GroupPanel } from "../components/controls/GroupPanel";
import { DreamcallerPortrait } from "../components/hud/DreamcallerPortrait";
import { Dreamsign } from "../components/hud/Dreamsign";
import { EssenceValue } from "../components/hud/EssenceValue";
import { QUEST_STATUS_BAR_CLEARANCE_OP } from "../components/hud/QuestStatusBar";
import { GlowIcon } from "../components/controls/GlowIcon";
import { glassSurfaceStyle } from "../internal/glass-surface";
import type { ArtRef } from "../primitives/art";
import { resolveArtRef } from "../primitives/art";
import { GLYPHS } from "../primitives/glyph";
import { Pressable } from "../primitives/Pressable";
import { token } from "../primitives/tokens";
import type { Dreamsign as DreamsignData } from "../../types/quest";
import { AbilityReveal, ConsoleDivider } from "./quest-start-shared";
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

const PANEL_MAX_WIDTH = 660;
const CHARACTER_STAGE_MAX_WIDTH = 760;
const SIGNATURE_CARD_WIDTH = 116;
const DREAMSIGN_SIZE = 62;
const MOBILE_SIGNATURE_CARD_WIDTH = 64;
const MOBILE_DREAMSIGN_SIZE = 48;

export function BattleStartScreen({ view, onBegin }: BattleStartScreenProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const sceneUrl = view.scene !== null ? resolveArtRef(view.scene) : null;
  const isDesktop = useIsDesktop();

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
  );
}

function MobileBattleStartLayout({ view, onBegin }: BattleStartScreenProps) {
  return (
    <main
      data-battle-start-layout="mobile"
      style={{
        position: "absolute",
        inset: 0,
      }}
    >
      <section
        data-battle-start-opponent={view.dreamcaller.id}
        data-battle-start-opponent-framing="standing"
        style={{
          position: "absolute",
          top: `calc(${token("--safe-top")} + ${token("--space-12")} + (${token("--space-10")} * 2))`,
          left: 0,
          right: 0,
          bottom: `calc(${QUEST_STATUS_BAR_CLEARANCE_OP})`,
        }}
      >
        <DreamcallerPortrait
          dreamcaller={{
            imageNumber: view.dreamcaller.imageNumber,
            name: view.dreamcaller.name,
            title: view.dreamcaller.title,
          }}
          variant="standing"
        />
      </section>

      <MobileBattleStartTitle dreamcaller={view.dreamcaller} />

      <div
        data-battle-start-panel=""
        data-battle-start-console=""
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: `calc(${QUEST_STATUS_BAR_CLEARANCE_OP} + ${token("--space-4")})`,
          zIndex: 4,
          padding: `0 max(var(--safe-area-inset-right), ${token("--gutter")}) 0 max(var(--safe-area-inset-left), ${token("--gutter")})`,
        }}
      >
        <MobileBattleConsole view={view} onBegin={onBegin} />
      </div>
    </main>
  );
}

function MobileBattleStartTitle({
  dreamcaller,
}: {
  readonly dreamcaller: BattleStartDreamcallerView;
}) {
  return (
    <div
      data-battle-start-title=""
      style={{
        position: "absolute",
        top: token("--safe-top"),
        left: 0,
        right: 0,
        padding: `${token("--space-10")} ${token("--gutter")} 0`,
        zIndex: 4,
        textAlign: "center",
        pointerEvents: "none",
      }}
    >
      <h1 style={{ margin: 0 }}>
        <span
          style={{
            display: "block",
            font: token("--t-hero"),
            color: token("--text-primary"),
            textShadow: token("--text-outline-media"),
          }}
        >
          {dreamcaller.name}
        </span>
        {dreamcaller.title !== "" && (
          <span
            style={{
              display: "block",
              marginTop: token("--space-1"),
              font: token("--t-hero-epithet"),
              color: token("--text-primary"),
              textShadow: token("--text-outline-media"),
            }}
          >
            {dreamcaller.title}
          </span>
        )}
      </h1>
    </div>
  );
}

function MobileBattleConsole({ view, onBegin }: BattleStartScreenProps) {
  const [showIntel, setShowIntel] = useState(false);
  const showsAbility =
    view.dreamcaller.ability !== "" && view.dreamcaller.abilityActive;

  return (
    <GroupPanel>
      {showsAbility && (
        <div data-battle-start-mobile-ability="">
          <AbilityReveal text={view.dreamcaller.ability} />
        </div>
      )}

      {showsAbility && (
        <div style={{ marginTop: token("--space-6") }}>
          <ConsoleDivider flush />
        </div>
      )}

      <div style={{ marginTop: showsAbility ? token("--space-5") : 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: token("--space-4"),
          }}
        >
          <h2
            style={{
              margin: 0,
              font: token("--t-eyebrow"),
              letterSpacing: token("--tracking-eyebrow"),
              textTransform: "uppercase",
              color: token("--text-secondary"),
            }}
          >
            {showIntel ? "Opponent Intel" : "Battle Stakes"}
          </h2>
          <Pressable
            as="button"
            data-testid="tango-battle-start-intel-toggle"
            aria-expanded={showIntel}
            onClick={() => setShowIntel((current) => !current)}
            style={{
              padding: token("--space-2"),
              margin: `calc(-1 * ${token("--space-2")})`,
              border: 0,
              background: "none",
              font: token("--t-body"),
              color: token("--text-primary"),
              textDecoration: "underline",
              whiteSpace: "nowrap",
            }}
          >
            {showIntel ? "View battle stakes" : "View opponent intel"}
          </Pressable>
        </div>

        <div style={{ marginTop: token("--space-4") }}>
          {showIntel ? (
            <MobileOpponentIntel view={view} />
          ) : (
            <MobileBattleStakes view={view} />
          )}
        </div>
      </div>

      <div
        data-testid="tango-battle-start-begin"
        style={{ marginTop: token("--space-6") }}
      >
        <Button label="Begin Battle" size="lg" full onClick={onBegin} />
      </div>
    </GroupPanel>
  );
}

function MobileBattleStakes({ view }: { readonly view: BattleStartView }) {
  return (
    <div
      data-battle-start-stakes=""
      style={{
        display: "flex",
        justifyContent: "space-around",
        gap: token("--space-6"),
      }}
    >
      <MobileStake label="To Win">
        <span>{view.pointsToWin}</span>
        <GlowIcon iconClass={GLYPHS.points} color="white" size="1em" />
      </MobileStake>
      <MobileStake label="Reward">
        <EssenceValue amount={view.essenceReward} tone="inherit" />
      </MobileStake>
    </div>
  );
}

function MobileOpponentIntel({ view }: { readonly view: BattleStartView }) {
  const hasSignatureCards = view.signatureCards.length > 0;
  const hasDreamsigns = view.dreamsigns.length > 0;
  return (
    <div
      data-battle-start-opponent-intel=""
      style={{
        display: "grid",
        gridTemplateColumns:
          hasSignatureCards && hasDreamsigns ? "minmax(0, 1fr) auto" : "1fr",
        gap: token("--space-5"),
        alignItems: "end",
      }}
    >
      {hasSignatureCards && (
        <IntelGroup label="Signature Cards">
          <div
            style={{
              display: "flex",
              gap: token("--space-3"),
              alignItems: "flex-start",
            }}
          >
            {view.signatureCards.map((card) => (
              <div
                key={card.cardId}
                data-signature-card-id={card.cardId}
                style={{ width: MOBILE_SIGNATURE_CARD_WIDTH, flex: "none" }}
              >
                <GameCard model={card.model} hideRulesText />
              </div>
            ))}
          </div>
        </IntelGroup>
      )}

      {hasDreamsigns && (
        <IntelGroup label="Dreamsigns">
          <div style={{ display: "flex", gap: token("--space-3") }}>
            {view.dreamsigns.map((dreamsign) => (
              <Dreamsign
                key={dreamsign.id}
                dreamsign={dreamsign}
                sizePx={MOBILE_DREAMSIGN_SIZE}
                testid={`tango-battle-start-dreamsign-${String(dreamsign.id)}`}
              />
            ))}
          </div>
        </IntelGroup>
      )}

      {!hasSignatureCards && !hasDreamsigns && (
        <p
          style={{
            margin: 0,
            font: token("--t-body"),
            color: token("--text-secondary"),
          }}
        >
          No additional opponent intel.
        </p>
      )}
    </div>
  );
}

function IntelGroup({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <section style={{ display: "grid", gap: token("--space-3") }}>
      <h3
        style={{
          margin: 0,
          font: token("--t-eyebrow"),
          letterSpacing: token("--tracking-eyebrow"),
          textTransform: "uppercase",
          color: token("--text-secondary"),
        }}
      >
        {label}
      </h3>
      {children}
    </section>
  );
}

function MobileStake({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
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
          color: token("--text-primary"),
        }}
      >
        {children}
      </div>
      <span
        style={{
          font: token("--t-eyebrow"),
          letterSpacing: token("--tracking-eyebrow"),
          textTransform: "uppercase",
          color: token("--text-secondary"),
        }}
      >
        {label}
      </span>
    </div>
  );
}

function PanelSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
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
