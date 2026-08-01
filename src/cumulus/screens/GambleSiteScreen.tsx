import { useEffect, useState } from "react";
import { useReducedMotion } from "framer-motion";
import type { GravokGateId } from "../../types/gamble";
import type { Dreamsign as DreamsignData } from "../../types/journey";
import { PlayingCard } from "../components/card/PlayingCard";
import { GlassButton } from "../components/controls/GlassButton";
import { Dreamsign } from "../components/hud/Dreamsign";
import { EssenceValue } from "../components/hud/EssenceValue";
import { GlassPanel } from "../components/overlay/GlassPanel";
import {
  RADIAL_ANNOUNCEMENT_DURATION_MS,
  RadialAnnouncement,
} from "../components/status/RadialAnnouncement";
import type { ArtRef } from "../primitives/art";
import { token } from "../primitives/tokens";
import { DreamsignReplacementDialog } from "./DreamsignReplacementDialog";
import type { DreamsignReplacementView } from "./DreamsignReplacementDialog";
import {
  GuideGallerySiteLayout,
  type GuideGalleryGuideView,
} from "./GuideGallerySiteLayout";
import { useIsDesktop } from "./use-is-desktop";

export interface GambleGateView {
  /** Stable gate id used by the wager intent. */
  id: GravokGateId;
  /** Literary gate name used in accessible labels. */
  name: string;
  /** Inclusive minimum rank shown as compact card notation. */
  targetLabel: string;
  /** Exact winning probability. */
  chanceLabel: string;
  /** Winning cards in the standard deck. */
  oddsNumerator: number;
  /** Cards in the standard deck. */
  oddsDenominator: number;
  /** Essence paid on a win. */
  essenceReward: number;
  /** Locked jackpot Dreamsign, only present on the Jack Gate. */
  rewardDreamsign: DreamsignData | null;
  /** Whether the gate has every reward it needs. */
  available: boolean;
}

export interface GambleResultView {
  /** Stable result identity for animation replay. */
  id: string;
  /** Gate chosen by the player. */
  gateId: GravokGateId;
  /** Whether the revealed rank crossed the chosen threshold. */
  won: boolean;
  /** Essence granted by the result. */
  essenceGained: number;
  /** Jackpot Dreamsign shown in the reward announcement. */
  rewardDreamsign: DreamsignData | null;
  /** Whether a held Dreamsign must be replaced before leaving. */
  pendingDreamsignReplacement: boolean;
}

export interface GambleSiteView {
  /** Stable journey site id. */
  siteId: string;
  /** Current dreamscape scene art behind the site, if resolved. */
  scene: ArtRef | null;
  /** Whether Farpoint Station's free-wager rule applies. */
  isFarpoint: boolean;
  /** Shared runtime has locked its card and jackpot reward. */
  runtimeReady: boolean;
  /** Essence charged by every gate on this visit. */
  wagerCost: number;
  /** Whether the player can pay the wager cost. */
  canAfford: boolean;
  /** Face-down commitment or revealed result card. */
  card: {
    rank: Parameters<typeof PlayingCard>[0]["rank"];
    suit: Parameters<typeof PlayingCard>[0]["suit"];
    face: Parameters<typeof PlayingCard>[0]["face"];
  };
  /** Three gate choices in ascending risk order. */
  gates: readonly GambleGateView[];
  /** Resident Dream Guide art and greeting. */
  guide: GuideGalleryGuideView;
  /** Resolved wager, or null before commitment. */
  result: GambleResultView | null;
  /** At-cap replacement content after a jackpot win. */
  replacement: DreamsignReplacementView | null;
}

export interface GambleSiteScreenProps {
  /** View-model rendered by the pure screen. */
  view: GambleSiteView;
  /** Commit one gate choice. */
  onChooseGate: (gateId: GravokGateId) => void;
  /** Leave before committing a wager. */
  onLeave: () => void;
  /** Complete the site after the result animation. */
  onOutcomeComplete: () => void;
  /** Replace one UUID-identified held Dreamsign after a jackpot win. */
  onReplaceDreamsign: (dreamsignId: string) => void;
}

const DESKTOP_GAMBLE_REGION_MAX_WIDTH = 650;
const DESKTOP_GATE_HEIGHT = 210;
const MOBILE_GATE_HEIGHT = 134;
const DESKTOP_DREAMSIGN_SIZE = 58;
const MOBILE_DREAMSIGN_SIZE = 38;
const CARD_REVEAL_DELAY_MS = 480;
const REDUCED_MOTION_DELAY_MS = 80;

function GateReward({
  gate,
  layout,
}: {
  gate: GambleGateView;
  layout: "mobile" | "desktop";
}) {
  const dreamsignSize =
    layout === "desktop" ? DESKTOP_DREAMSIGN_SIZE : MOBILE_DREAMSIGN_SIZE;
  return (
    <div
      data-gamble-gate-reward={gate.id}
      style={{
        flex: "1 1 auto",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: layout === "desktop" ? token("--space-3") : token("--space-1"),
        padding:
          layout === "desktop" ? token("--space-4") : token("--space-2"),
        textAlign: "center",
      }}
    >
      <span
        style={{
          font:
            layout === "desktop" ? token("--t-title-sm") : token("--t-body"),
          color: token("--text-on-glass"),
        }}
      >
        <EssenceValue amount={gate.essenceReward} tone="inherit" />
      </span>
      {gate.id === "jack" && gate.rewardDreamsign !== null && (
        <Dreamsign
          dreamsign={gate.rewardDreamsign}
          sizePx={dreamsignSize}
          testid="gamble-jackpot-dreamsign"
          variant="hud"
        />
      )}
      {gate.id === "jack" && gate.rewardDreamsign === null && (
        <span
          data-gamble-jackpot-unavailable=""
          style={{
            font: token("--t-body-sm"),
            color: token("--text-on-glass-muted"),
          }}
        >
          Dreamsign unavailable
        </span>
      )}
    </div>
  );
}

function GambleGatePanel({
  gate,
  layout,
}: {
  gate: GambleGateView;
  layout: "mobile" | "desktop";
}) {
  return (
    <div
      data-gamble-gate={gate.id}
      style={{
        width: "100%",
        height:
          layout === "desktop" ? DESKTOP_GATE_HEIGHT : MOBILE_GATE_HEIGHT,
      }}
    >
      <GlassPanel radius="panel" testId={`gamble-gate-${gate.id}`}>
        <GateReward gate={gate} layout={layout} />
        <div
          style={{
            flex: "0 0 auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: token("--space-1"),
            padding:
              layout === "desktop"
                ? `${token("--space-4")} ${token("--space-3")}`
                : `${token("--space-2")} ${token("--space-1")}`,
            borderTop: `1px solid ${token("--border-strong")}`,
            textAlign: "center",
          }}
        >
          <span
            style={{
              font:
                layout === "desktop"
                  ? token("--t-title")
                  : token("--t-title-sm"),
              color: token("--text-on-glass"),
            }}
          >
            {gate.targetLabel}
          </span>
          <span
            style={{
              font: token("--t-eyebrow"),
              color: token("--text-on-glass-muted"),
              letterSpacing: token("--tracking-eyebrow"),
              textTransform: "uppercase",
            }}
          >
            {gate.chanceLabel} chance
          </span>
        </div>
      </GlassPanel>
    </div>
  );
}

function GambleOutcome({
  result,
  layout,
}: {
  result: GambleResultView;
  layout: "mobile" | "desktop";
}) {
  return (
    <RadialAnnouncement
      announcementId={result.id}
      headline={result.won ? "Won!" : "Bust!"}
      detail={result.won ? result.rewardDreamsign?.name : undefined}
      essenceGained={result.won ? result.essenceGained : undefined}
      tone={result.won ? "reward" : "danger"}
      size={layout === "desktop" ? "standard" : "compact"}
    />
  );
}

export function GambleSiteScreen({
  view,
  onChooseGate,
  onLeave,
  onOutcomeComplete,
  onReplaceDreamsign,
}: GambleSiteScreenProps) {
  const reduceMotion = useReducedMotion() === true;
  const isDesktop = useIsDesktop();
  const [outcomeVisible, setOutcomeVisible] = useState(false);
  const [replacementVisible, setReplacementVisible] = useState(false);
  const resultId = view.result?.id;
  const pendingDreamsignReplacement =
    view.result?.pendingDreamsignReplacement === true;

  useEffect(() => {
    setOutcomeVisible(false);
    setReplacementVisible(false);
    if (resultId === undefined) return;
    const timeout = window.setTimeout(
      () => setOutcomeVisible(true),
      reduceMotion ? REDUCED_MOTION_DELAY_MS : CARD_REVEAL_DELAY_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [reduceMotion, resultId]);

  useEffect(() => {
    if (!outcomeVisible || resultId === undefined) return;
    const timeout = window.setTimeout(
      () => {
        setOutcomeVisible(false);
        if (pendingDreamsignReplacement) {
          setReplacementVisible(true);
        } else {
          onOutcomeComplete();
        }
      },
      reduceMotion
        ? REDUCED_MOTION_DELAY_MS
        : RADIAL_ANNOUNCEMENT_DURATION_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [
    onOutcomeComplete,
    outcomeVisible,
    pendingDreamsignReplacement,
    reduceMotion,
    resultId,
  ]);

  return (
    <GuideGallerySiteLayout
      siteId={view.siteId}
      scene={view.scene}
      guide={view.guide}
      screenTestId="cumulus-gamble-site-screen"
      guideArtTestId="cumulus-gamble-guide-art"
      speechAnchorTestId="cumulus-gamble-speech-anchor"
      speechBubbleTestId="cumulus-gamble-speech-bubble"
      renderGallery={(layout) => {
        const wagerLocked = view.result !== null;
        return (
          <main
            data-gamble-wager-region=""
            data-gamble-layout={layout}
            data-gamble-farpoint={view.isFarpoint ? "true" : "false"}
            style={{
              position: "relative",
              zIndex: 10,
              width: "100%",
              maxWidth:
                layout === "desktop"
                  ? DESKTOP_GAMBLE_REGION_MAX_WIDTH
                  : undefined,
              height: "100%",
              minHeight: 0,
              justifySelf: "center",
              alignSelf: "center",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap:
                layout === "desktop"
                  ? token("--space-4")
                  : token("--space-2"),
              boxSizing: "border-box",
              padding:
                layout === "desktop"
                  ? token("--space-6")
                  : token("--space-2"),
              pointerEvents: "auto",
            }}
          >
            <header
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: token("--space-1"),
                textAlign: "center",
                textShadow: token("--text-outline-media"),
              }}
            >
              <span
                style={{
                  font: token("--t-eyebrow"),
                  letterSpacing: token("--tracking-eyebrow"),
                  textTransform: "uppercase",
                  color: token("--text-secondary"),
                }}
              >
                Gravok’s Casino
              </span>
              <h1
                style={{
                  margin: 0,
                  font:
                    layout === "desktop"
                      ? token("--t-title")
                      : token("--t-title-sm"),
                  color: token("--text-primary"),
                }}
              >
                Three-Gate Wager
              </h1>
            </header>

            <div data-gamble-draw-card="">
              <PlayingCard
                rank={view.card.rank}
                suit={view.card.suit}
                face={view.card.face}
                size={layout === "desktop" ? "standard" : "compact"}
              />
            </div>

            <section
              aria-label="Three wager gates"
              data-gamble-gates=""
              style={{
                width: "100%",
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap:
                  layout === "desktop"
                    ? token("--space-4")
                    : token("--space-2"),
                alignItems: "center",
              }}
            >
              {view.gates.map((gate) => (
                <GambleGatePanel key={gate.id} gate={gate} layout={layout} />
              ))}
            </section>

            <div
              data-gamble-choice-buttons=""
              style={{
                width: "100%",
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap:
                  layout === "desktop"
                    ? token("--space-4")
                    : token("--space-2"),
                justifyItems: "center",
              }}
            >
              {view.gates.map((gate) => (
                <GlassButton
                  key={gate.id}
                  label="Choose"
                  accessibilityLabel={`Choose ${gate.name} for ${String(view.wagerCost)} Essence`}
                  essenceCost={view.wagerCost}
                  essenceCostStyle="separated"
                  size={layout === "mobile" ? "compact" : "standard"}
                  variant="accent"
                  disabled={
                    !view.runtimeReady ||
                    wagerLocked ||
                    !view.canAfford ||
                    !gate.available
                  }
                  testId={`gamble-choose-${gate.id}`}
                  onPress={() => onChooseGate(gate.id)}
                />
              ))}
            </div>

            {!wagerLocked && (
              <GlassButton
                label="Leave"
                testId="gamble-leave"
                onPress={onLeave}
              />
            )}
            {view.result?.pendingDreamsignReplacement === true &&
              !replacementVisible &&
              !outcomeVisible && (
                <GlassButton
                  label="Choose Replacement"
                  variant="accent"
                  testId="gamble-open-replacement"
                  onPress={() => setReplacementVisible(true)}
                />
              )}
          </main>
        );
      }}
    >
      {outcomeVisible && view.result !== null && (
        <GambleOutcome
          key={view.result.id}
          result={view.result}
          layout={isDesktop ? "desktop" : "mobile"}
        />
      )}
      {replacementVisible && view.replacement !== null && (
        <DreamsignReplacementDialog
          view={view.replacement}
          cancelLabel="Not Yet"
          closeLabel="Close replacement choice"
          onCancel={() => setReplacementVisible(false)}
          onReplace={onReplaceDreamsign}
        />
      )}
    </GuideGallerySiteLayout>
  );
}
