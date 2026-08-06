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
  /** Whether the shared wager event has applied its payout. */
  essenceSettled: boolean;
  /** Jackpot Dreamsign shown in the reward announcement. */
  rewardDreamsign: DreamsignData | null;
  /** Whether a held Dreamsign must be replaced before leaving. */
  pendingDreamsignReplacement: boolean;
}

export interface GravokWagerSiteView {
  gameId: "gravok-three-gate-wager";
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

export interface LadderClimbResultView {
  /** Stable result identity for animation replay. */
  id: string;
  /** One-based attempt that produced this card. */
  attemptNumber: 1 | 2 | 3 | 4;
  /** Inclusive rank target shown before this attempt was drawn. */
  targetRank: PlayingCardRank;
  card: {
    rank: PlayingCardRank;
    suit: PlayingCardSuit;
  };
  won: boolean;
  resultSettled: boolean;
  terminal: boolean;
  pendingDreamsignReplacement: boolean;
}

export interface LadderClimbSiteView {
  gameId: "tidemark-ladder-climb";
  siteId: string;
  scene: ArtRef | null;
  isFarpoint: boolean;
  runtimeReady: boolean;
  /** Locked Dreamsign shown as the prize from the opening state. */
  rewardDreamsign: DreamsignData;
  /** Only the currently unlocked attempt; future attempts stay undisclosed. */
  nextDraw: {
    attemptNumber: 1 | 2 | 3 | 4;
    targetRank: PlayingCardRank;
    cost: number;
    canAfford: boolean;
    available: boolean;
  } | null;
  guide: GuideGalleryGuideView;
  result: LadderClimbResultView | null;
  replacement: DreamsignReplacementView | null;
}

export type GambleSiteView = GravokWagerSiteView | LadderClimbSiteView;

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
  /** Buy and reveal the next Ladder Climb attempt. */
  onDrawLadder: () => void;
  /** Settle a Ladder Climb result when its outcome appears. */
  onLadderOutcomeShown: () => void;
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
  drawnCard: GravokWagerSiteView["card"];
  gridColumn: number;
}) {
  const prizeCard = (
    <WagerPrizeCard
      prizeId={gate.id}
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
  view: GravokWagerSiteView;
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
  onDrawLadder,
  onLadderOutcomeShown,
  onReplaceDreamsign,
}: GambleSiteScreenProps) {
  if (view.gameId === "tidemark-ladder-climb") {
    return (
      <LadderClimbScreen
        view={view}
        onDraw={onDrawLadder}
        onLeave={onLeave}
        onOutcomeShown={onLadderOutcomeShown}
        onReplaceDreamsign={onReplaceDreamsign}
      />
    );
  }
  return (
    <GravokWagerScreen
      view={view}
      onChooseGate={onChooseGate}
      onLeave={onLeave}
      onOutcomeShown={onOutcomeShown}
      onPlayAgain={onPlayAgain}
      onReplaceDreamsign={onReplaceDreamsign}
    />
  );
}

function GravokWagerScreen({
  view,
  onChooseGate,
  onLeave,
  onOutcomeShown,
  onPlayAgain,
  onReplaceDreamsign,
}: Omit<
  GambleSiteScreenProps,
  "view" | "onDrawLadder" | "onLadderOutcomeShown"
> & { view: GravokWagerSiteView }) {
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
        const roundActionGridColumn =
          Math.abs(selectedGateIndex - revealGateIndex) === 2
            ? "1 / span 3"
            : `${Math.min(selectedGateIndex, revealGateIndex) + 1} / span 2`;
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
                <div
                  data-gamble-round-action-group=""
                  style={{
                    gridColumn: roundActionGridColumn,
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap:
                      layout === "desktop"
                        ? token("--space-4")
                        : token("--space-2"),
                  }}
                >
                  {view.canPlayAgain && (
                    <GlassButton
                      label="Play Again"
                      variant="accent"
                      testId="gamble-play-again"
                      onPress={onPlayAgain}
                    />
                  )}
                  <GlassButton
                    label="Leave"
                    testId="gamble-leave-after-round"
                    onPress={onLeave}
                  />
                </div>
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

function LadderClimbScreen({
  view,
  onDraw,
  onLeave,
  onOutcomeShown,
  onReplaceDreamsign,
}: {
  view: LadderClimbSiteView;
  onDraw: () => void;
  onLeave: () => void;
  onOutcomeShown: () => void;
  onReplaceDreamsign: (dreamsignId: string) => void;
}) {
  const reduceMotion = useReducedMotion() === true;
  const [revealedResultId, setRevealedResultId] = useState<string | null>(null);
  const [outcomeResultId, setOutcomeResultId] = useState<string | null>(null);
  const [roundActionsVisible, setRoundActionsVisible] = useState(false);
  const [replacementVisible, setReplacementVisible] = useState(false);
  const settledResultIdRef = useRef<string | undefined>(undefined);
  const onOutcomeShownRef = useRef(onOutcomeShown);
  const resultId = view.result?.id;

  useEffect(() => {
    onOutcomeShownRef.current = onOutcomeShown;
  }, [onOutcomeShown]);

  useEffect(() => {
    setRoundActionsVisible(false);
    setReplacementVisible(false);
    if (resultId === undefined) {
      setRevealedResultId(null);
      setOutcomeResultId(null);
      return;
    }
    const revealDelay = reduceMotion
      ? REDUCED_MOTION_DELAY_MS
      : BET_SETTLE_DELAY_MS;
    const outcomeDelay = reduceMotion
      ? REDUCED_MOTION_DELAY_MS
      : BET_SETTLE_DELAY_MS + PLAYING_CARD_FLIP_DURATION_MS;
    const revealTimeout = window.setTimeout(
      () => setRevealedResultId(resultId),
      revealDelay,
    );
    const outcomeTimeout = window.setTimeout(() => {
      setOutcomeResultId(resultId);
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
    const result = view.result;
    if (
      result === null ||
      outcomeResultId !== result.id ||
      !result.resultSettled
    ) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setOutcomeResultId(null);
      if (result.pendingDreamsignReplacement) {
        setReplacementVisible(true);
      } else {
        setRoundActionsVisible(true);
      }
    }, RADIAL_ANNOUNCEMENT_EXTENDED_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [outcomeResultId, view.result]);

  useEffect(() => {
    if (
      !replacementVisible ||
      view.result === null ||
      view.replacement !== null ||
      view.result.pendingDreamsignReplacement ||
      !view.result.resultSettled
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
      mobileComposition="dialog"
      screenTestId="cumulus-gamble-site-screen"
      guideArtTestId="cumulus-gamble-guide-art"
      speechAnchorTestId="cumulus-gamble-speech-anchor"
      speechBubbleTestId="cumulus-gamble-speech-bubble"
      renderGallery={(layout) => {
        const result = view.result;
        const resultRevealed =
          result !== null && revealedResultId === result.id;
        const outcomeVisible =
          result !== null && outcomeResultId === result.id;
        const cardSize = layout === "desktop" ? "wager" : "wagerCompact";
        const showNextTarget =
          roundActionsVisible && view.nextDraw !== null;
        const targetRank = showNextTarget && view.nextDraw !== null
          ? view.nextDraw.targetRank
          : result?.targetRank ?? view.nextDraw?.targetRank ?? "Q";
        return (
          <main
            data-gamble-wager-region=""
            data-gamble-game={view.gameId}
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
              aria-label="Ladder climb"
              data-ladder-climb-stage=""
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
              {outcomeVisible && result !== null && (
                <div
                  data-ladder-outcome=""
                  style={{
                    position: "relative",
                    gridColumn: 1,
                    gridRow: 1,
                    width: "100%",
                    height: "100%",
                    pointerEvents: "none",
                  }}
                >
                  <RadialAnnouncement
                    announcementId={result.id}
                    headline={result.won ? "Won" : "Miss"}
                    tone={result.won ? "reward" : "danger"}
                    size={layout === "mobile" ? "mini" : "wager"}
                    duration="extended"
                  />
                </div>
              )}
              <div
                data-ladder-climb-card=""
                style={{ gridColumn: 2, gridRow: 1 }}
              >
                <WagerPrizeCard
                  prizeId="ladder-climb"
                  targetLabel={`${targetRank}-A`}
                  essenceReward={null}
                  rewardDreamsign={view.rewardDreamsign}
                  drawnCard={result?.card ?? null}
                  size={cardSize}
                  revealDrawnCard={resultRevealed && !showNextTarget}
                  dreamsignTestId="gamble-ladder-dreamsign-name"
                />
              </div>
            </section>

            <div
              data-ladder-actions={
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
              {result === null && view.nextDraw !== null ? (
                <div style={{ gridColumn: 2 }}>
                  <GlassButton
                    label="Draw"
                    accessibilityLabel={`Draw attempt ${String(view.nextDraw.attemptNumber)} for ${String(view.nextDraw.cost)} Essence`}
                    essenceCost={view.nextDraw.cost}
                    essenceCostStyle="separated"
                    variant="accent"
                    disabled={
                      !view.runtimeReady ||
                      !view.nextDraw.available ||
                      !view.nextDraw.canAfford
                    }
                    testId="gamble-ladder-climb"
                    onPress={onDraw}
                  />
                </div>
              ) : roundActionsVisible ? (
                <div
                  data-ladder-round-action-group=""
                  style={{
                    gridColumn: "1 / span 3",
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap:
                      layout === "desktop"
                        ? token("--space-4")
                        : token("--space-2"),
                  }}
                >
                  {view.nextDraw !== null && (
                    <GlassButton
                      label="Draw"
                      accessibilityLabel={`Draw attempt ${String(view.nextDraw.attemptNumber)} for ${String(view.nextDraw.cost)} Essence`}
                      essenceCost={view.nextDraw.cost}
                      essenceCostStyle="separated"
                      variant="accent"
                      disabled={
                        !view.nextDraw.available || !view.nextDraw.canAfford
                      }
                      testId="gamble-ladder-climb-again"
                      onPress={onDraw}
                    />
                  )}
                  <GlassButton
                    label="Leave"
                    testId="gamble-ladder-leave-after-draw"
                    onPress={onLeave}
                  />
                </div>
              ) : null}
            </div>

            {result === null && (
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
                  testId="gamble-ladder-leave"
                  onPress={onLeave}
                />
              </div>
            )}
            {result?.pendingDreamsignReplacement === true &&
              !replacementVisible &&
              !outcomeVisible && (
                <GlassButton
                  label="Choose Replacement"
                  variant="accent"
                  testId="gamble-ladder-open-replacement"
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
