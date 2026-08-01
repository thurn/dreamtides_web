import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { GravokGateId } from "../../types/gamble";
import type { Dreamsign as DreamsignData } from "../../types/journey";
import {
  PLAYING_CARD_FLIP_DURATION_MS,
  WagerPrizeCard,
  type PlayingCardRank,
  type PlayingCardSuit,
} from "../components/card/PlayingCard";
import { GlassButton } from "../components/controls/GlassButton";
import {
  RADIAL_ANNOUNCEMENT_EXTENDED_DURATION_MS,
  RadialAnnouncement,
} from "../components/status/RadialAnnouncement";
import type { ArtRef } from "../primitives/art";
import { motionTimeSeconds } from "../primitives/motion-time";
import { token } from "../primitives/tokens";
import { DreamsignReplacementDialog } from "./DreamsignReplacementDialog";
import type { DreamsignReplacementView } from "./DreamsignReplacementDialog";
import {
  GuideGallerySiteLayout,
  type GuideGalleryGuideView,
} from "./GuideGallerySiteLayout";

export interface GambleGateView {
  /** Stable gate id used by the wager intent. */
  id: GravokGateId;
  /** Literary gate name used in accessible labels. */
  name: string;
  /** Inclusive winning rank range shown as compact card notation. */
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
  /** Non-selected gate whose prize object turns into the drawn card. */
  revealGateId: GravokGateId;
  /** Whether the revealed rank crossed the chosen threshold. */
  won: boolean;
  /** Essence granted by the result. */
  essenceGained: number;
  /** Whether the shared wager event has applied its net Essence. */
  essenceSettled: boolean;
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
  /** Whether another wager remains within this visit's retry limit. */
  canPlayAgain: boolean;
  /** Committed card kept concealed until the result choreography begins. */
  card: {
    rank: PlayingCardRank;
    suit: PlayingCardSuit;
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
  /** Settle the wager as its result announcement enters. */
  onOutcomeShown: () => void;
  /** Prepare a fresh committed draw after the result animation. */
  onPlayAgain: () => void;
  /** Replace one UUID-identified held Dreamsign after a jackpot win. */
  onReplaceDreamsign: (dreamsignId: string) => void;
}

const DESKTOP_GAMBLE_REGION_MAX_WIDTH = 650;
const BET_SETTLE_DELAY_MS = 250;
const REDUCED_MOTION_DELAY_MS = 80;
const FADE_DURATION_SECONDS = motionTimeSeconds("--dur-slow");

type GambleGatePresentation =
  | "available"
  | "selected"
  | "revealed"
  | "faded";

function GambleGateCard({
  gate,
  layout,
  presentation,
  revealStarted,
  drawnCard,
  gridColumn,
}: {
  gate: GambleGateView;
  layout: "mobile" | "desktop";
  presentation: GambleGatePresentation;
  revealStarted: boolean;
  drawnCard: GambleSiteView["card"];
  gridColumn: number;
}) {
  const prizeCard = (
    <WagerPrizeCard
      gateId={gate.id}
      targetLabel={gate.targetLabel}
      essenceReward={gate.essenceReward}
      rewardDreamsign={gate.rewardDreamsign}
      size={layout === "desktop" ? "wager" : "wagerCompact"}
      drawnCard={presentation === "revealed" ? drawnCard : null}
      revealDrawnCard={presentation === "revealed" && revealStarted}
      dreamsignTestId={
        gate.id === "jack" ? "gamble-jackpot-dreamsign-name" : undefined
      }
    />
  );

  if (presentation !== "faded") {
    return (
      <div
        data-gamble-gate={gate.id}
        data-gamble-gate-presentation={presentation}
        style={{ gridColumn, gridRow: 1 }}
      >
        {prizeCard}
      </div>
    );
  }

  return (
    <motion.div
      data-gamble-gate={gate.id}
      data-gamble-gate-presentation={presentation}
      aria-hidden={revealStarted || undefined}
      initial={false}
      animate={{ opacity: revealStarted ? 0 : 1 }}
      transition={{
        duration: FADE_DURATION_SECONDS,
        ease: "easeOut",
      }}
      style={{
        gridColumn,
        gridRow: 1,
        pointerEvents: revealStarted ? "none" : "auto",
      }}
    >
      {prizeCard}
    </motion.div>
  );
}

function GambleBetButton({
  gate,
  view,
  layout,
  wagerLocked,
  selected,
  onChooseGate,
}: {
  gate: GambleGateView;
  view: GambleSiteView;
  layout: "mobile" | "desktop";
  wagerLocked: boolean;
  selected: boolean;
  onChooseGate: (gateId: GravokGateId) => void;
}) {
  const button = (
    <GlassButton
      label="Bet"
      accessibilityLabel={`Bet on ${gate.name} for ${String(view.wagerCost)} Essence`}
      essenceCost={view.wagerCost}
      essenceCostStyle="separated"
      size={layout === "mobile" ? "compact" : "standard"}
      variant="accent"
      disabled={
        !wagerLocked &&
        (!view.runtimeReady || !view.canAfford || !gate.available)
      }
      testId={`gamble-choose-${gate.id}`}
      onPress={() => onChooseGate(gate.id)}
    />
  );

  if (!wagerLocked) {
    return (
      <div
        data-gamble-bet={gate.id}
        data-gamble-bet-presentation="available"
      >
        {button}
      </div>
    );
  }

  return (
    <motion.div
      data-gamble-bet={gate.id}
      data-gamble-bet-presentation="faded"
      data-gamble-bet-selected={selected ? "true" : "false"}
      aria-hidden="true"
      inert
      initial={{ opacity: 1 }}
      animate={{
        opacity: 0,
        transitionEnd: { visibility: "hidden" },
      }}
      transition={{ duration: FADE_DURATION_SECONDS, ease: "linear" }}
      style={{ pointerEvents: "none" }}
    >
      {button}
    </motion.div>
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
      size={layout === "mobile" ? "mini" : "wager"}
      duration="extended"
    />
  );
}

export function GambleSiteScreen({
  view,
  onChooseGate,
  onLeave,
  onOutcomeShown,
  onPlayAgain,
  onReplaceDreamsign,
}: GambleSiteScreenProps) {
  const reduceMotion = useReducedMotion() === true;
  const [revealStarted, setRevealStarted] = useState(false);
  const [outcomeVisible, setOutcomeVisible] = useState(false);
  const [replacementVisible, setReplacementVisible] = useState(false);
  const [roundActionsVisible, setRoundActionsVisible] = useState(false);
  const onOutcomeShownRef = useRef(onOutcomeShown);
  const settledResultIdRef = useRef<string | undefined>(undefined);
  const resultId = view.result?.id;
  const pendingDreamsignReplacement =
    view.result?.pendingDreamsignReplacement === true;
  const essenceSettled = view.result?.essenceSettled === true;

  useEffect(() => {
    onOutcomeShownRef.current = onOutcomeShown;
  }, [onOutcomeShown]);

  useEffect(() => {
    setOutcomeVisible(false);
    setReplacementVisible(false);
    setRoundActionsVisible(false);
    setRevealStarted(false);
    if (resultId === undefined) return;
    const revealDelay = reduceMotion
      ? REDUCED_MOTION_DELAY_MS
      : BET_SETTLE_DELAY_MS;
    const outcomeDelay = reduceMotion
      ? REDUCED_MOTION_DELAY_MS
      : BET_SETTLE_DELAY_MS + PLAYING_CARD_FLIP_DURATION_MS;
    const revealTimeout = window.setTimeout(
      () => setRevealStarted(true),
      revealDelay,
    );
    const outcomeTimeout = window.setTimeout(() => {
      setOutcomeVisible(true);
      if (settledResultIdRef.current !== resultId) {
        settledResultIdRef.current = resultId;
        onOutcomeShownRef.current();
      }
    }, outcomeDelay);
    return () => {
      window.clearTimeout(revealTimeout);
      window.clearTimeout(outcomeTimeout);
    };
  }, [reduceMotion, resultId]);

  useEffect(() => {
    if (!outcomeVisible || resultId === undefined || !essenceSettled) return;
    const timeout = window.setTimeout(
      () => {
        setOutcomeVisible(false);
        if (pendingDreamsignReplacement) {
          setReplacementVisible(true);
        } else {
          setRoundActionsVisible(true);
        }
      },
      RADIAL_ANNOUNCEMENT_EXTENDED_DURATION_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [
    essenceSettled,
    outcomeVisible,
    pendingDreamsignReplacement,
    resultId,
  ]);

  useEffect(() => {
    if (
      !replacementVisible ||
      view.result === null ||
      view.replacement !== null ||
      view.result.pendingDreamsignReplacement ||
      !view.result.essenceSettled
    ) {
      return;
    }
    setReplacementVisible(false);
    setRoundActionsVisible(true);
  }, [replacementVisible, view.replacement, view.result]);

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
        const outcomeGateIndex =
          view.result === null
            ? -1
            : view.gates.findIndex(
                (gate) =>
                  gate.id !== view.result?.gateId &&
                  gate.id !== view.result?.revealGateId,
              );
        const outcomeGate = view.gates[outcomeGateIndex];
        const selectedGateIndex =
          view.result === null
            ? -1
            : view.gates.findIndex((gate) => gate.id === view.result?.gateId);
        const revealGateIndex =
          view.result === null
            ? -1
            : view.gates.findIndex(
                (gate) => gate.id === view.result?.revealGateId,
              );
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
            <section
              aria-label="Three wager gates"
              data-gamble-gates=""
              style={{
                position: "relative",
                width: "100%",
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap:
                  layout === "desktop"
                    ? token("--space-4")
                    : token("--space-2"),
                alignItems: "center",
                justifyItems: "center",
              }}
            >
              {view.gates.map((gate, gateIndex) => {
                const presentation: GambleGatePresentation =
                  view.result === null
                    ? "available"
                    : gate.id === view.result.gateId
                      ? "selected"
                      : gate.id === view.result.revealGateId
                        ? "revealed"
                        : "faded";
                return (
                  <GambleGateCard
                    key={gate.id}
                    gate={gate}
                    layout={layout}
                    presentation={presentation}
                    revealStarted={revealStarted}
                    drawnCard={view.card}
                    gridColumn={gateIndex + 1}
                  />
                );
              })}
              {outcomeVisible &&
                view.result !== null &&
                outcomeGate !== undefined && (
                  <div
                    data-gamble-outcome-slot={outcomeGate.id}
                    style={{
                      position: "relative",
                      gridColumn: outcomeGateIndex + 1,
                      gridRow: 1,
                      width: "100%",
                      height: "100%",
                      alignSelf: "stretch",
                      justifySelf: "stretch",
                      pointerEvents: "none",
                    }}
                  >
                    <GambleOutcome
                      key={view.result.id}
                      result={view.result}
                      layout={layout}
                    />
                  </div>
                )}
            </section>

            <div
              data-gamble-choice-buttons=""
              data-gamble-round-actions={
                roundActionsVisible ? "visible" : "hidden"
              }
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
              {roundActionsVisible ? (
                <>
                  {view.canPlayAgain && (
                    <div
                      data-gamble-round-action="play-again"
                      style={{
                        gridColumn: selectedGateIndex + 1,
                        width: "100%",
                        display: "flex",
                        justifyContent: "center",
                      }}
                    >
                      <GlassButton
                        label="Play Again"
                        variant="accent"
                        testId="gamble-play-again"
                        onPress={onPlayAgain}
                      />
                    </div>
                  )}
                  <div
                    data-gamble-round-action="leave"
                    style={{
                      gridColumn: revealGateIndex + 1,
                      width: "100%",
                      display: "flex",
                      justifyContent: "center",
                    }}
                  >
                    <GlassButton
                      label="Leave"
                      testId="gamble-leave-after-round"
                      onPress={onLeave}
                    />
                  </div>
                </>
              ) : (
                view.gates.map((gate) => (
                  <GambleBetButton
                    key={gate.id}
                    gate={gate}
                    view={view}
                    layout={layout}
                    wagerLocked={wagerLocked}
                    selected={view.result?.gateId === gate.id}
                    onChooseGate={onChooseGate}
                  />
                ))
              )}
            </div>

            {!wagerLocked && (
              <div
                data-gamble-leave-slot=""
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <GlassButton
                  label="Leave"
                  testId="gamble-leave"
                  onPress={onLeave}
                />
              </div>
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
