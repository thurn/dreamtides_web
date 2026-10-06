import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import { GameCard, type GameCardModel } from "../components/card/CardView";
import { CardPickerPanel } from "../components/card/CardPickerPanel";
import type { GravokGateId, StarwayStairsTierNumber } from "../../types/gamble";
import type { TransfigurationType } from "../../types/journey";
import type { DreamsignView } from "../components/hud/Dreamsign";
import type { FourSuitRepriseOutcome } from "../../data/four-suit-reprise";
import { blackjackHandTotal } from "../../data/blackjack";
import type { FourSuitRepriseGame } from "../../types/gamble-data";
import {
  PlayingCard,
  PlayingCardPrize,
  PLAYING_CARD_DESIGN,
  PlayingCardSuitMark,
  PLAYING_CARD_FLIP_DURATION_MS,
  type PlayingCardRank,
  type PlayingCardPrizeEmphasis,
  type PlayingCardSize,
  type PlayingCardSuit,
} from "../components/card/PlayingCard";
import { CARD_ASPECT_RATIO_VALUE } from "../components/card/card-aspect";
import { GlassButton } from "../components/controls/GlassButton";
import { IconButton } from "../components/controls/IconButton";
import { Dreamsign } from "../components/hud/Dreamsign";
import { EssenceValue } from "../components/hud/EssenceValue";
import { GlassPanel } from "../components/overlay/GlassPanel";
import {
  RADIAL_ANNOUNCEMENT_EXTENDED_DURATION_MS,
  RadialAnnouncement,
} from "../components/status/RadialAnnouncement";
import type { ArtRef } from "../primitives/art";
import { GLYPHS } from "../primitives/glyph";
import { motionTimeSeconds } from "../primitives/motion-time";
import { token } from "../primitives/tokens";
import {
  DreamsignReplacementDialog,
  type DreamsignReplacementModel,
} from "../components/overlay/DreamsignReplacementDialog";
import {
  SiteLayout,
  type SiteLayoutGuideView,
} from "../components/layout/SiteLayout";
import { useIsDesktop } from "../primitives/use-is-desktop";
import type { TransfigurationCandidateView } from "./TransfigurationSiteScreen";
import { TransfigurationDetailPanel } from "../components/card/TransfigurationDetailPanel";
import type { SiteId } from "../../types/identifiers";
import type { DeckEntryId } from "../../types/identifiers";
import type { CardId } from "../../types/card-identity";
import type { DreamsignId } from "../../types/identifiers";
import type {
  GambleResultId,
  ShuffleCommitment,
} from "../../types/identifiers";
import type { DomTestId } from "../types/dom";
import { formatNumber } from "../../runtime/format-number";

export interface GambleGateView {
  /** Stable gate id used by the wager intent. */
  id: GravokGateId;
  /** Lowest rank in the inclusive winning range through Ace. */
  minimumWinningRank: PlayingCardRank;
  /** Exact winning probability. */
  chanceLabel: string;
  /** Winning cards in the standard deck. */
  oddsNumerator: number;
  /** Cards in the standard deck. */
  oddsDenominator: number;
  /** Essence paid on a win. */
  essenceReward: number;
  /** Locked jackpot Dreamsign, only present on the Jack Gate. */
  rewardDreamsign: DreamsignView | null;
  /** Whether the gate has every reward it needs. */
  available: boolean;
}

export interface GambleResultView {
  /** Stable result identity for animation replay. */
  id: GambleResultId;
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
  rewardDreamsign: DreamsignView | null;
  /** Whether a held Dreamsign must be replaced before leaving. */
  pendingDreamsignReplacement: boolean;
}

export interface GravokWagerSiteView {
  gameId: "gravok-three-gate-wager";
  /** Stable journey site id. */
  siteId: SiteId;
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
  /** Whether this resolved outcome may start another wager. */
  canPlayAgain: boolean;
  /** Committed card kept concealed until the result choreography begins. */
  card: {
    rank: PlayingCardRank;
    suit: PlayingCardSuit;
  };
  /** Three gate choices in ascending risk order. */
  gates: readonly GambleGateView[];
  /** Resident Dream Guide art and greeting. */
  guide: SiteLayoutGuideView;
  /** Resolved wager, or null before commitment. */
  result: GambleResultView | null;
  /** At-cap replacement content after a jackpot win. */
  replacement: Omit<
    DreamsignReplacementModel,
    "dismissLabel" | "closeLabel"
  > | null;
}

export interface LadderClimbResultView {
  /** Stable result identity for animation replay. */
  id: GambleResultId;
  /** One-based attempt that produced this card. */
  attemptNumber: number;
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
  siteId: SiteId;
  scene: ArtRef | null;
  isFarpoint: boolean;
  runtimeReady: boolean;
  /** Essence awarded alongside the locked Dreamsign on a win. */
  essenceReward: number;
  /** Locked Dreamsign shown as the prize from the opening state. */
  rewardDreamsign: DreamsignView;
  /** Only the currently unlocked attempt; future attempts stay undisclosed. */
  nextDraw: {
    attemptNumber: number;
    targetRank: PlayingCardRank;
    cost: number;
    canAfford: boolean;
    available: boolean;
  } | null;
  guide: SiteLayoutGuideView;
  result: LadderClimbResultView | null;
  replacement: Omit<
    DreamsignReplacementModel,
    "dismissLabel" | "closeLabel"
  > | null;
}

export interface StarwayStairsTierView {
  tierNumber: StarwayStairsTierNumber;
  minimumWinningRank: PlayingCardRank;
  essenceReward: number;
  state: "future" | "current" | "safe" | "bust";
  card: { rank: PlayingCardRank; suit: PlayingCardSuit } | null;
}

export interface StarwayStairsResultView {
  id: GambleResultId;
  tierNumber: StarwayStairsTierNumber;
  busted: boolean;
  resultSettled: boolean;
  prizeAtRisk: number;
}

export interface StarwayStairsSiteView {
  gameId: "starway-stairs";
  siteId: SiteId;
  scene: ArtRef | null;
  isFarpoint: boolean;
  runtimeReady: boolean;
  wagerAmount: number;
  canAffordWager: boolean;
  /** Whether this terminal outcome may start another round. */
  canPlayAgain: boolean;
  tiers: readonly StarwayStairsTierView[];
  currentTierNumber: StarwayStairsTierNumber | null;
  guide: SiteLayoutGuideView;
  result: StarwayStairsResultView | null;
  cashOutReward: number | null;
  terminalReason: "bust" | "cashed-out" | "top" | null;
  prizeAwarded: number;
}

export interface FourSuitRepriseCardView {
  entryId: DeckEntryId;
  cardId: CardId;
  model: GameCardModel;
}

export interface FourSuitRepriseResultView {
  id: GambleResultId;
  roundNumber: 1 | 2 | 3;
  card: { rank: PlayingCardRank; suit: PlayingCardSuit };
  outcome: FourSuitRepriseOutcome;
  resultRevealed: boolean;
  resultSettled: boolean;
  essenceGained: number;
  target: FourSuitRepriseCardView;
  transfigurationCandidate: TransfigurationCandidateView;
  chosenTransfiguration: TransfigurationType | null;
}

export interface FourSuitRepriseSiteView {
  gameId: "four-suit-reprise";
  siteId: SiteId;
  scene: ArtRef | null;
  isFarpoint: boolean;
  runtimeReady: boolean;
  drawCost: number;
  canAffordDraw: boolean;
  roundNumber: 1 | 2 | 3;
  maxRounds: number;
  essenceReward: number;
  outcomes: FourSuitRepriseGame["rules"]["outcomes"];
  phase: "choose" | "result";
  cards: readonly FourSuitRepriseCardView[];
  guide: SiteLayoutGuideView;
  result: FourSuitRepriseResultView | null;
  canPlayAgain: boolean;
}

export interface BlackjackSiteView {
  gameId: "blackjack";
  siteId: SiteId;
  /** Stable committed-shoe identity for one animated hand. */
  handId: ShuffleCommitment;
  scene: ArtRef | null;
  isFarpoint: boolean;
  runtimeReady: boolean;
  wagerCost: number;
  prizeEssence: number;
  attemptNumber: number;
  maxAttempts: number;
  target: number;
  canAffordWager: boolean;
  playerCards: readonly { rank: PlayingCardRank; suit: PlayingCardSuit }[];
  playerTotal: number | null;
  dealerCards: readonly { rank: PlayingCardRank; suit: PlayingCardSuit }[];
  dealerTotal: number | null;
  dealerRevealed: boolean;
  outcome: "player-win" | "dealer-win" | "push" | null;
  essenceAwarded: number;
  resultSettled: boolean;
  resultId: GambleResultId | null;
  /** Whether a settled push or eligible loss may start another paid hand. */
  canPlayAgain: boolean;
  guide: SiteLayoutGuideView;
}

export type GambleSiteView =
  | GravokWagerSiteView
  | LadderClimbSiteView
  | StarwayStairsSiteView
  | FourSuitRepriseSiteView
  | BlackjackSiteView;

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
  /** Reveal the current Starway Stairs tier. */
  onDrawStarway?: () => void;
  /** Settle a Starway Stairs result when its outcome appears. */
  onStarwayOutcomeShown?: () => void;
  /** Bank the latest safe Starway Stairs prize. */
  onCashOutStarway?: () => void;
  /** Prepare another Starway Stairs round after a terminal result. */
  onPlayAgainStarway?: () => void;
  /** Draw one suit against the selected Four-Suit Reprise target. */
  onDrawFourSuit?: (entryId: DeckEntryId) => void;
  /** Settle the visible Four-Suit Reprise result. */
  onFourSuitOutcomeShown?: () => void;
  /** Apply the free chosen form after a Spades result. */
  onChooseFourSuitTransfiguration?: (type: TransfigurationType) => void;
  /** Advance the shared visit to another distinct-card round. */
  onPlayAgainFourSuit?: () => void;
  /** Pay the wager and deal the player and dealer opening hands. */
  onDealBlackjack?: () => void;
  /** Reveal the next player card. */
  onHitBlackjack?: () => void;
  /** Finish the player turn and resolve the dealer. */
  onStandBlackjack?: () => void;
  /** Apply a terminal Blackjack reward after its announcement appears. */
  onBlackjackOutcomeShown?: () => void;
  /** Start a fresh Blackjack hand after a settled push or eligible loss. */
  onPlayAgainBlackjack?: () => void;
  /** Replace one UUID-identified held Dreamsign after a jackpot win. */
  onReplaceDreamsign: (dreamsignId: DreamsignId) => void;
}

function gambleActionLabel(
  key:
    | "bet"
    | "draw"
    | "climb"
    | "take"
    | "choose-another"
    | "deal"
    | "hit"
    | "stand",
): string {
  switch (key) {
    case "bet":
      return "Bet";
    case "draw":
      return "Draw";
    case "climb":
      return "Climb";
    case "take":
      return "Take";
    case "choose-another":
      return "Choose Another Card";
    case "deal":
      return "Deal";
    case "hit":
      return "Hit";
    case "stand":
      return "Stand";
  }
}

function gambleOutcomeLabel(
  view: GambleSiteView,
  key:
    | "won"
    | "miss"
    | "safe"
    | "bust"
    | "prize-at-stake"
    | "transfiguration"
    | "essence"
    | "duplication"
    | "purge"
    | "player-win"
    | "dealer-win"
    | "push"
    | "wager-returned"
    | "wins",
): string {
  switch (key) {
    case "won":
      return view.gameId === "gravok-three-gate-wager" ? "Won!" : "Won";
    case "miss":
      return "Miss";
    case "safe":
      return "Safe!";
    case "bust":
      return "Bust!";
    case "prize-at-stake":
      return "Prize at stake";
    case "transfiguration":
      return "Transfigure";
    case "essence":
      return "Gained";
    case "duplication":
      return "Duplicated";
    case "purge":
      return "Purged";
    case "player-win":
      return "You Win!";
    case "dealer-win":
      return "Dealer Wins";
    case "push":
      return "Push";
    case "wager-returned":
      return "Wager Returned";
    case "wins":
      return "Wins";
  }
}

function gambleRulesDisclosure(gameId: GambleSiteView["gameId"]): string {
  switch (gameId) {
    case "gravok-three-gate-wager":
      return "Choose a gate, then draw. Higher gates are harder and pay more.";
    case "tidemark-ladder-climb":
      return "Draw against four successively easier targets. Each success gains essence.";
    case "starway-stairs":
      return "Climb for a larger prize, but a low draw loses the wager.";
    case "four-suit-reprise":
      return "Choose a card to wager";
    case "blackjack":
      return "Closest to 21 Without Going Over";
  }
}

function gambleTitle(gameId: GambleSiteView["gameId"]): string {
  switch (gameId) {
    case "gravok-three-gate-wager":
      return "Gravok's Three-Gate Wager";
    case "tidemark-ladder-climb":
      return "Tidemark Ladder Climb";
    case "starway-stairs":
      return "Starway Stairs";
    case "four-suit-reprise":
      return "Four-Suit Reprise";
    case "blackjack":
      return "Blackjack";
  }
}

function gambleAccessibilityDescription(
  gameId: GambleSiteView["gameId"],
): string {
  switch (gameId) {
    case "gravok-three-gate-wager":
      return "Choose one of three gates and draw a card to resolve the wager.";
    case "tidemark-ladder-climb":
      return "Draw a card on each rung of a four-step ladder.";
    case "starway-stairs":
      return "Choose whether to climb for a larger prize or take the current prize.";
    case "four-suit-reprise":
      return "Choose a card to wager, then draw one of four suit outcomes.";
    case "blackjack":
      return "Deal, hit, or stand against the dealer without going over 21.";
  }
}

function gravokBetAccessibilityLabel(
  gateId: GravokGateId,
  essenceCost: number,
): string {
  switch (gateId) {
    case "six":
      return `Bet on Six Gate for ${formatNumber(essenceCost)} Essence`;
    case "nine":
      return `Bet on Nine Gate for ${formatNumber(essenceCost)} Essence`;
    case "jack":
      return `Bet on Jack Gate for ${formatNumber(essenceCost)} Essence`;
  }
}

function fourSuitOutcomeAccessibilityLabel(
  suit: PlayingCardSuit,
  outcome: FourSuitRepriseOutcome,
): string {
  switch (outcome) {
    case "transfiguration":
      return `${suit}: Transfigure`;
    case "essence":
      return `${suit}: Gained`;
    case "duplication":
      return `${suit}: Duplicated`;
    case "purge":
      return `${suit}: Purged`;
  }
}

const DESKTOP_GAMBLE_REGION_MAX_WIDTH = 650;
const BET_SETTLE_DELAY_MS = 250;
const REDUCED_MOTION_DELAY_MS = 80;
const FADE_DURATION_SECONDS = motionTimeSeconds("--dur-slow");
const LADDER_DREAMSIGN_READING_SECONDS = motionTimeSeconds("--dur-slow") * 4;
const LADDER_DREAMSIGN_TRAVEL_SECONDS = motionTimeSeconds("--dur-slow") * 2;
const LADDER_DREAMSIGN_DESKTOP_SIZE = 240;
const LADDER_DREAMSIGN_MOBILE_SIZE = 180;
const DREAM_EASE = [0.22, 0.61, 0.36, 1] as const;
const FOUR_SUIT_STAGE_MAX_WIDTH = 720;
const FOUR_SUIT_TARGET_WIDTH = { desktop: 164, mobile: 104 } as const;
const FOUR_SUIT_REWARD_PANEL_WIDTH = { desktop: 220, mobile: 216 } as const;
const FOUR_SUIT_DUPLICATE_OFFSET = { desktop: 74, mobile: 44 } as const;
const FOUR_SUIT_CARD_OUTCOME_SECONDS = motionTimeSeconds("--dur-slow") * 6;
const FOUR_SUIT_CARD_OUTCOME_MS = FOUR_SUIT_CARD_OUTCOME_SECONDS * 1_000;
// GlassPanel contributes a one-pixel rim on each edge. The grid receives the
// remaining measured height so the complete panel matches the 5:7 GameCard.
const FOUR_SUIT_PANEL_RIM_HEIGHT = 2;
const BLACKJACK_CARD_ARRIVAL_SECONDS = FADE_DURATION_SECONDS * 1.5;
const BLACKJACK_CARD_ARRIVAL_MS = BLACKJACK_CARD_ARRIVAL_SECONDS * 1_000;
const BLACKJACK_DEPARTURE_FADE_MS = FADE_DURATION_SECONDS * 1_000;
const BLACKJACK_CARD_READING_MS = PLAYING_CARD_FLIP_DURATION_MS * 0.75;
const BLACKJACK_CONCEALED_READING_MS = PLAYING_CARD_FLIP_DURATION_MS;
const BLACKJACK_TURN_READING_MS = PLAYING_CARD_FLIP_DURATION_MS;
const BLACKJACK_OUTCOME_READING_MS = PLAYING_CARD_FLIP_DURATION_MS * 1.5;
// The three fixed rows keep the middle reward panel immovable while each hand
// reflows within its own row. Framer layout motion carries dealt cards into
// their new positions when the hand grows.
const BLACKJACK_TABLE_HEIGHT = { desktop: 436, mobile: 396 } as const;
const BLACKJACK_HAND_MAX_WIDTH = { desktop: 618, mobile: 330 } as const;
const BLACKJACK_TOTAL_SIZE = { desktop: 60, mobile: 52 } as const;
const BLACKJACK_HAND_GAP_PX = 8;
const BLACKJACK_REWARD_PANEL_WIDTH = { desktop: 280, mobile: 260 } as const;

function fourSuitRewardPanelBodyHeight(layout: "mobile" | "desktop"): number {
  return (
    FOUR_SUIT_TARGET_WIDTH[layout] / CARD_ASPECT_RATIO_VALUE -
    FOUR_SUIT_PANEL_RIM_HEIGHT
  );
}

type FourSuitCardOutcomePhase = "idle" | "animating" | "complete";

function FourSuitOutcomeCard({
  result,
  layout,
  reduceMotion,
  essenceReward,
}: {
  readonly result: FourSuitRepriseResultView;
  readonly layout: "mobile" | "desktop";
  readonly reduceMotion: boolean;
  readonly essenceReward: number;
}) {
  const exitTransition = {
    duration: reduceMotion ? 0 : FOUR_SUIT_CARD_OUTCOME_SECONDS,
    times: reduceMotion ? undefined : [0, 0.72, 1],
    ease: DREAM_EASE,
  };
  const cardStyle = {
    position: "absolute" as const,
    inset: 0,
    transformOrigin: "center bottom",
  };

  if (result.outcome === "duplication") {
    const offset = FOUR_SUIT_DUPLICATE_OFFSET[layout];
    return (
      <div
        data-four-suit-card-outcome="duplication"
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: CARD_ASPECT_RATIO_VALUE,
        }}
      >
        <motion.div
          data-four-suit-duplicate-card="original"
          initial={false}
          animate={
            reduceMotion
              ? { opacity: 0 }
              : {
                  x: [0, -offset, -offset],
                  y: [0, 0, token("--space-l")],
                  rotate: [0, -4, -4],
                  scale: [1, 1, 0.64],
                  opacity: [1, 1, 0],
                }
          }
          transition={exitTransition}
          style={{ ...cardStyle, zIndex: 2 }}
        >
          <GameCard model={result.target.model} selection="reward" />
        </motion.div>
        <motion.div
          data-four-suit-duplicate-card="copy"
          initial={false}
          animate={
            reduceMotion
              ? { opacity: 0 }
              : {
                  x: [0, offset, offset],
                  y: [0, 0, token("--space-l")],
                  rotate: [0, 4, 4],
                  scale: [0.9, 1, 0.64],
                  opacity: [0, 1, 0],
                }
          }
          transition={exitTransition}
          style={{ ...cardStyle, zIndex: 1 }}
        >
          <GameCard model={result.target.model} selection="copied" />
        </motion.div>
      </div>
    );
  }

  if (result.outcome === "transfiguration") {
    return (
      <motion.div
        data-four-suit-card-outcome="transfiguration"
        initial={false}
        animate={
          reduceMotion
            ? { opacity: 0 }
            : {
                y: [0, 0, token("--space-l")],
                scale: [1, 1.04, 0.64],
                opacity: [1, 1, 0],
              }
        }
        transition={exitTransition}
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: CARD_ASPECT_RATIO_VALUE,
          perspective: 1200,
        }}
      >
        <motion.div
          data-four-suit-transfiguration-flip=""
          initial={false}
          animate={{ rotateY: reduceMotion ? 180 : [0, 180, 180] }}
          transition={{
            duration: reduceMotion ? 0 : FOUR_SUIT_CARD_OUTCOME_SECONDS,
            times: reduceMotion ? undefined : [0, 0.58, 1],
            ease: DREAM_EASE,
          }}
          style={{
            position: "absolute",
            inset: 0,
            transformStyle: "preserve-3d",
          }}
        >
          <div
            data-four-suit-transfiguration-face="original"
            style={{
              position: "absolute",
              inset: 0,
              backfaceVisibility: "hidden",
            }}
          >
            <GameCard model={result.transfigurationCandidate.model} />
          </div>
          <div
            data-four-suit-transfiguration-face="transfigured"
            style={{
              position: "absolute",
              inset: 0,
              transform: "rotateY(180deg)",
              backfaceVisibility: "hidden",
            }}
          >
            <GameCard model={result.target.model} selection="transfigured" />
          </div>
        </motion.div>
      </motion.div>
    );
  }

  if (result.outcome === "essence") {
    return (
      <motion.div
        data-four-suit-card-outcome="essence"
        initial={false}
        animate={
          reduceMotion
            ? { opacity: 0 }
            : {
                y: [0, 0, token("--space-l")],
                scale: [1, 1.04, 0.64],
                opacity: [1, 1, 0],
              }
        }
        transition={exitTransition}
        style={{
          position: "relative",
          width: "100%",
          aspectRatio: CARD_ASPECT_RATIO_VALUE,
        }}
      >
        <GameCard model={result.target.model} selection="reward" />
        <motion.div
          data-four-suit-essence-badge=""
          initial={false}
          animate={
            reduceMotion
              ? { opacity: 0 }
              : {
                  opacity: [0, 1, 1, 0],
                  scale: [0.72, 1, 1, 0.82],
                }
          }
          transition={{
            duration: FOUR_SUIT_CARD_OUTCOME_SECONDS,
            times: [0, 0.2, 0.72, 1],
            ease: DREAM_EASE,
          }}
          style={{
            position: "absolute",
            right: `calc(-1 * ${token("--space-xs")})`,
            bottom: `calc(-1 * ${token("--space-xs")})`,
            borderRadius: token("--radius-pill"),
            boxShadow: token("--shadow-md"),
          }}
        >
          <EssenceValue
            amount={`+${String(essenceReward)}`}
            tone="mark"
            variant="rewardBadge"
          />
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      data-four-suit-card-outcome="purge"
      initial={false}
      animate={
        reduceMotion
          ? { opacity: 0 }
          : {
              y: [0, 0, token("--space-2xl")],
              rotate: [0, -2, 8],
              scale: [1, 1.04, 0.24],
              opacity: [1, 1, 0],
            }
      }
      transition={exitTransition}
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: CARD_ASPECT_RATIO_VALUE,
      }}
    >
      <GameCard model={result.target.model} selection="danger" />
    </motion.div>
  );
}

interface LadderDreamsignTrajectory {
  readonly source: DOMRect;
  readonly target: DOMRect;
}

function ladderHudDreamsignTarget(
  dreamsignId: DreamsignId,
): HTMLElement | null {
  const candidates = document.querySelectorAll<HTMLElement>(
    "[data-dreamsign-id]",
  );
  for (const candidate of candidates) {
    if (
      candidate.dataset.dreamsignId === dreamsignId &&
      candidate.closest("[data-gamble-wager-region]") === null &&
      candidate.closest("[data-ladder-dreamsign-flight]") === null
    ) {
      return candidate;
    }
  }
  return null;
}

function LadderDreamsignReward({
  active,
  dreamsign,
  layout,
  reduceMotion,
}: {
  readonly active: boolean;
  readonly dreamsign: DreamsignView;
  readonly layout: "mobile" | "desktop";
  readonly reduceMotion: boolean;
}) {
  const sourceRef = useRef<HTMLDivElement>(null);
  const hiddenTargetRef = useRef<{
    element: HTMLElement;
    visibility: string;
  } | null>(null);
  const [trajectory, setTrajectory] =
    useState<LadderDreamsignTrajectory | null>(null);
  const [complete, setComplete] = useState(false);
  const dreamsignId = dreamsign.id;
  const size =
    layout === "desktop"
      ? LADDER_DREAMSIGN_DESKTOP_SIZE
      : LADDER_DREAMSIGN_MOBILE_SIZE;

  const restoreHudTarget = useCallback((): void => {
    const hiddenTarget = hiddenTargetRef.current;
    if (hiddenTarget === null) return;
    hiddenTarget.element.style.visibility = hiddenTarget.visibility;
    hiddenTargetRef.current = null;
  }, []);

  useLayoutEffect(() => {
    setTrajectory(null);
    setComplete(false);
    if (!active || reduceMotion) {
      restoreHudTarget();
      return;
    }
    let animationFrame = 0;
    const hideHudTarget = (): void => {
      const target = ladderHudDreamsignTarget(dreamsignId);
      if (target === null) {
        animationFrame = window.requestAnimationFrame(hideHudTarget);
        return;
      }
      if (hiddenTargetRef.current === null) {
        hiddenTargetRef.current = {
          element: target,
          visibility: target.style.visibility,
        };
        target.style.visibility = "hidden";
      }
    };
    animationFrame = window.requestAnimationFrame(hideHudTarget);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      restoreHudTarget();
    };
  }, [active, dreamsignId, reduceMotion, restoreHudTarget]);

  useEffect(() => {
    if (!active || complete) return;
    if (reduceMotion) {
      setComplete(true);
      return;
    }

    let animationFrame = 0;
    const readingTimer = window.setTimeout(() => {
      const measureTrajectory = (): void => {
        const source = sourceRef.current?.getBoundingClientRect();
        const target = ladderHudDreamsignTarget(dreamsignId);
        const targetRect = target?.getBoundingClientRect();
        if (
          source === undefined ||
          source.width <= 0 ||
          source.height <= 0 ||
          target === null ||
          targetRect === undefined ||
          targetRect.width <= 0 ||
          targetRect.height <= 0
        ) {
          animationFrame = window.requestAnimationFrame(measureTrajectory);
          return;
        }
        if (hiddenTargetRef.current === null) {
          hiddenTargetRef.current = {
            element: target,
            visibility: target.style.visibility,
          };
          target.style.visibility = "hidden";
        }
        setTrajectory({ source, target: targetRect });
      };
      measureTrajectory();
    }, LADDER_DREAMSIGN_READING_SECONDS * 1_000);

    return () => {
      window.clearTimeout(readingTimer);
      window.cancelAnimationFrame(animationFrame);
      restoreHudTarget();
    };
  }, [active, complete, dreamsignId, reduceMotion, restoreHudTarget]);

  if (!active || complete) return null;

  if (trajectory !== null) {
    const scale = Math.min(
      trajectory.target.width / trajectory.source.width,
      trajectory.target.height / trajectory.source.height,
    );
    return (
      <motion.div
        data-ladder-dreamsign-flight=""
        data-ladder-dreamsign-destination="journey-dreamsign"
        initial={{
          x: trajectory.source.left,
          y: trajectory.source.top,
          scale: 1,
          opacity: 1,
        }}
        animate={{
          x: trajectory.target.left,
          y: trajectory.target.top,
          scale,
          opacity: 1,
        }}
        transition={{
          duration: LADDER_DREAMSIGN_TRAVEL_SECONDS,
          ease: DREAM_EASE,
        }}
        onAnimationComplete={() => {
          restoreHudTarget();
          setComplete(true);
        }}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          zIndex: 42,
          width: trajectory.source.width,
          height: trajectory.source.height,
          transformOrigin: "top left",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            width: trajectory.source.width,
            height: trajectory.source.width,
          }}
        >
          <Dreamsign dreamsign={dreamsign} variant="revelation" unavailable />
        </div>
      </motion.div>
    );
  }

  return (
    <div
      data-ladder-dreamsign-reward=""
      style={{
        position: "relative",
        gridColumn: 3,
        gridRow: 1,
        width: "100%",
        height: "100%",
        minWidth: 0,
        minHeight: 0,
        pointerEvents: "none",
      }}
    >
      <motion.div
        ref={sourceRef}
        data-ladder-dreamsign-source=""
        initial={{ opacity: 0, scale: 0.68 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{
          duration: FADE_DURATION_SECONDS,
          ease: DREAM_EASE,
        }}
        style={{
          position: "absolute",
          top: "50%",
          left:
            layout === "desktop"
              ? "50%"
              : `calc(50% - ${token("--space-3xl")})`,
          width: size,
          height: size,
          marginTop: -size / 2,
          marginLeft: -size / 2,
          transformOrigin: "center",
        }}
      >
        <Dreamsign dreamsign={dreamsign} variant="revelation" unavailable />
      </motion.div>
    </div>
  );
}

type WagerPrizeCardId =
  | GravokGateId
  | "ladder-climb"
  | "starway-1"
  | "starway-2"
  | "starway-3"
  | "blackjack";

interface WagerPrizeCardProps {
  prizeId: WagerPrizeCardId;
  minimumWinningRank: PlayingCardRank;
  size?: PlayingCardSize;
  drawnCard: { rank: PlayingCardRank; suit: PlayingCardSuit } | null;
  revealDrawnCard?: boolean;
  dreamsignTestId?: DomTestId;
  emphasis?: PlayingCardPrizeEmphasis;
  essenceReward: number;
  rewardDreamsign: DreamsignView | null;
}

/** Gamble-owned rules copy composed onto the generic playing-card prize face. */
function WagerPrizeCard({
  prizeId,
  minimumWinningRank,
  essenceReward,
  rewardDreamsign,
  drawnCard,
  revealDrawnCard,
  dreamsignTestId,
  emphasis,
  size,
}: WagerPrizeCardProps) {
  const title = `Draw ${minimumWinningRank}-A`;
  const description =
    rewardDreamsign === null
      ? `Win ${formatNumber(essenceReward)} Essence.`
      : `Win ${formatNumber(essenceReward)} Essence and ${rewardDreamsign.name}.`;
  const accessibilityLabel =
    rewardDreamsign === null
      ? `Draw ${minimumWinningRank}-A. Win ${formatNumber(essenceReward)} Essence.`
      : `Draw ${minimumWinningRank}-A. Win ${formatNumber(essenceReward)} Essence and ${rewardDreamsign.name}.`;
  const showingDrawnCard = revealDrawnCard === true && drawnCard !== null;
  return (
    <div
      data-wager-prize-card={prizeId}
      data-wager-prize-card-state={showingDrawnCard ? "drawn" : "prize"}
      data-wager-prize-target={`${minimumWinningRank}-A`}
      data-wager-prize-essence-reward={essenceReward}
      style={{ display: "contents" }}
    >
      <PlayingCardPrize
        objectId={prizeId}
        title={title}
        description={description}
        accessibilityLabel={accessibilityLabel}
        size={size}
        drawnCard={drawnCard}
        revealDrawnCard={revealDrawnCard}
        relatedDreamsignTestId={dreamsignTestId}
        emphasis={emphasis}
        relatedDreamsign={rewardDreamsign}
      />
    </div>
  );
}

type GambleGatePresentation = "available" | "selected" | "revealed" | "faded";

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
      minimumWinningRank={gate.minimumWinningRank}
      essenceReward={gate.essenceReward}
      rewardDreamsign={gate.rewardDreamsign}
      size={layout === "desktop" ? "standard" : "compact"}
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
      label={gambleActionLabel("bet")}
      accessibilityLabel={gravokBetAccessibilityLabel(gate.id, view.wagerCost)}
      essenceCost={view.wagerCost}
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
      <div data-gamble-bet={gate.id} data-gamble-bet-presentation="available">
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
  view,
  result,
  layout,
}: {
  view: GravokWagerSiteView;
  result: GambleResultView;
  layout: "mobile" | "desktop";
}) {
  return (
    <RadialAnnouncement
      announcementId={result.id}
      headline={gambleOutcomeLabel(view, result.won ? "won" : "bust")}
      detail={
        result.won && result.rewardDreamsign != null
          ? result.rewardDreamsign.name
          : undefined
      }
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
  onDrawStarway = () => undefined,
  onStarwayOutcomeShown = () => undefined,
  onCashOutStarway = () => undefined,
  onPlayAgainStarway = () => undefined,
  onDrawFourSuit = () => undefined,
  onFourSuitOutcomeShown = () => undefined,
  onChooseFourSuitTransfiguration = () => undefined,
  onPlayAgainFourSuit = () => undefined,
  onDealBlackjack = () => undefined,
  onHitBlackjack = () => undefined,
  onStandBlackjack = () => undefined,
  onBlackjackOutcomeShown = () => undefined,
  onPlayAgainBlackjack = () => undefined,
  onReplaceDreamsign,
}: GambleSiteScreenProps) {
  if (view.gameId === "blackjack") {
    return (
      <BlackjackScreen
        view={view}
        onDeal={onDealBlackjack}
        onHit={onHitBlackjack}
        onStand={onStandBlackjack}
        onLeave={onLeave}
        onOutcomeShown={onBlackjackOutcomeShown}
        onPlayAgain={onPlayAgainBlackjack}
      />
    );
  }
  if (view.gameId === "four-suit-reprise") {
    return (
      <FourSuitRepriseScreen
        view={view}
        onDraw={onDrawFourSuit}
        onLeave={onLeave}
        onOutcomeShown={onFourSuitOutcomeShown}
        onChooseTransfiguration={onChooseFourSuitTransfiguration}
        onPlayAgain={onPlayAgainFourSuit}
      />
    );
  }
  if (view.gameId === "starway-stairs") {
    return (
      <StarwayStairsScreen
        view={view}
        onDraw={onDrawStarway}
        onLeave={onLeave}
        onOutcomeShown={onStarwayOutcomeShown}
        onCashOut={onCashOutStarway}
        onPlayAgain={onPlayAgainStarway}
      />
    );
  }
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
}: {
  view: GravokWagerSiteView;
  onChooseGate: (gateId: GravokGateId) => void;
  onLeave: () => void;
  onOutcomeShown: () => void;
  onPlayAgain: () => void;
  onReplaceDreamsign: (dreamsignId: DreamsignId) => void;
}) {
  const reduceMotion = useReducedMotion() === true;
  const layout = useIsDesktop() ? "desktop" : "mobile";
  const [revealStarted, setRevealStarted] = useState(false);
  const [outcomeVisible, setOutcomeVisible] = useState(false);
  const [replacementVisible, setReplacementVisible] = useState(false);
  const [roundActionsVisible, setRoundActionsVisible] = useState(false);
  const onOutcomeShownRef = useRef(onOutcomeShown);
  const settledResultIdRef = useRef<GambleResultId | undefined>(undefined);
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
    const timeout = window.setTimeout(() => {
      setOutcomeVisible(false);
      if (pendingDreamsignReplacement) {
        setReplacementVisible(true);
      } else {
        setRoundActionsVisible(true);
      }
    }, RADIAL_ANNOUNCEMENT_EXTENDED_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [essenceSettled, outcomeVisible, pendingDreamsignReplacement, resultId]);

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
    <div
      data-testid="cumulus-gamble-site-screen"
      style={{ position: "fixed", inset: 0 }}
    >
      <SiteLayout
        siteId={view.siteId}
        scene={view.scene}
        moteTint="warm"
        guide={{ ...view.guide, presence: "speaking" }}
        composition="balanced-gallery"
      >
        {(() => {
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
                    ? token("--space-s")
                    : token("--space-xs"),
                boxSizing: "border-box",
                padding:
                  layout === "desktop"
                    ? token("--space-l")
                    : token("--space-xs"),
                pointerEvents: "auto",
              }}
            >
              <section
                aria-label={gambleAccessibilityDescription(view.gameId)}
                data-gamble-gates=""
                style={{
                  position: "relative",
                  width: "100%",
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap:
                    layout === "desktop"
                      ? token("--space-s")
                      : token("--space-xs"),
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
                        view={view}
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
                      ? token("--space-s")
                      : token("--space-xs"),
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
                          ? token("--space-s")
                          : token("--space-xs"),
                    }}
                  >
                    {view.canPlayAgain && (
                      <GlassButton
                        label={"Play Again"}
                        variant="accent"
                        testId="gamble-play-again"
                        onPress={onPlayAgain}
                      />
                    )}
                    <GlassButton
                      label={"Leave"}
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
                    label={"Leave"}
                    testId="gamble-leave"
                    onPress={onLeave}
                  />
                </div>
              )}
              {view.result?.pendingDreamsignReplacement === true &&
                !replacementVisible &&
                !outcomeVisible && (
                  <GlassButton
                    label={"Choose Replacement"}
                    variant="accent"
                    testId="gamble-open-replacement"
                    onPress={() => setReplacementVisible(true)}
                  />
                )}
            </main>
          );
        })()}
      </SiteLayout>
      {replacementVisible && view.replacement !== null && (
        <DreamsignReplacementDialog
          model={{
            ...view.replacement,
            dismissLabel: "Not Yet",
            closeLabel: "Close replacement choice",
          }}
          onDismiss={() => setReplacementVisible(false)}
          onDreamsignPress={onReplaceDreamsign}
        />
      )}
    </div>
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
  onReplaceDreamsign: (dreamsignId: DreamsignId) => void;
}) {
  const reduceMotion = useReducedMotion() === true;
  const layout = useIsDesktop() ? "desktop" : "mobile";
  const [revealedResultId, setRevealedResultId] =
    useState<GambleResultId | null>(null);
  const [outcomeResultId, setOutcomeResultId] = useState<GambleResultId | null>(
    null,
  );
  const [rewardResultId, setRewardResultId] = useState<GambleResultId | null>(
    null,
  );
  const [roundActionsVisible, setRoundActionsVisible] = useState(false);
  const [replacementVisible, setReplacementVisible] = useState(false);
  const settledResultIdRef = useRef<GambleResultId | undefined>(undefined);
  const onOutcomeShownRef = useRef(onOutcomeShown);
  const resultId = view.result?.id;

  useEffect(() => {
    onOutcomeShownRef.current = onOutcomeShown;
  }, [onOutcomeShown]);

  useEffect(() => {
    setRoundActionsVisible(false);
    setReplacementVisible(false);
    setRewardResultId(null);
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
      result !== null &&
      result.won &&
      result.resultSettled &&
      outcomeResultId === result.id
    ) {
      setRewardResultId(result.id);
    }
  }, [outcomeResultId, view.result]);

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
    <div
      data-testid="cumulus-gamble-site-screen"
      style={{ position: "fixed", inset: 0 }}
    >
      <SiteLayout
        siteId={view.siteId}
        scene={view.scene}
        moteTint="warm"
        guide={{ ...view.guide, presence: "speaking" }}
        composition="balanced-gallery"
      >
        {(() => {
          const result = view.result;
          const resultRevealed =
            result !== null && revealedResultId === result.id;
          const outcomeVisible =
            result !== null && outcomeResultId === result.id;
          const cardSize = layout === "desktop" ? "standard" : "compact";
          const showNextTarget = roundActionsVisible && view.nextDraw !== null;
          const targetRank =
            showNextTarget && view.nextDraw !== null
              ? view.nextDraw.targetRank
              : (result?.targetRank ?? view.nextDraw?.targetRank ?? "Q");
          const actionsVisible = result === null || roundActionsVisible;
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
                    ? token("--space-s")
                    : token("--space-xs"),
                boxSizing: "border-box",
                padding:
                  layout === "desktop"
                    ? token("--space-l")
                    : token("--space-xs"),
                pointerEvents: "auto",
              }}
            >
              <section
                aria-label={gambleAccessibilityDescription(view.gameId)}
                data-ladder-climb-stage=""
                style={{
                  position: "relative",
                  width: "100%",
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap:
                    layout === "desktop"
                      ? token("--space-s")
                      : token("--space-xs"),
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
                      headline={gambleOutcomeLabel(
                        view,
                        result.won ? "won" : "miss",
                      )}
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
                    minimumWinningRank={targetRank}
                    essenceReward={view.essenceReward}
                    rewardDreamsign={view.rewardDreamsign}
                    drawnCard={result?.card ?? null}
                    size={cardSize}
                    revealDrawnCard={resultRevealed && !showNextTarget}
                    dreamsignTestId="gamble-ladder-dreamsign-name"
                  />
                </div>
                <LadderDreamsignReward
                  active={
                    result?.won === true &&
                    result.resultSettled &&
                    rewardResultId === result.id
                  }
                  dreamsign={view.rewardDreamsign}
                  layout={layout}
                  reduceMotion={reduceMotion}
                />
              </section>

              <div
                data-ladder-actions={actionsVisible ? "visible" : "hidden"}
                style={{
                  width: "100%",
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap:
                    layout === "desktop"
                      ? token("--space-s")
                      : token("--space-xs"),
                  justifyItems: "center",
                }}
              >
                <motion.div
                  data-ladder-round-action-group=""
                  aria-hidden={!actionsVisible || undefined}
                  inert={actionsVisible ? undefined : true}
                  initial={false}
                  animate={{ opacity: actionsVisible ? 1 : 0 }}
                  transition={{
                    duration: FADE_DURATION_SECONDS,
                    ease: "easeOut",
                  }}
                  style={{
                    gridColumn: "1 / span 3",
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap:
                      layout === "desktop"
                        ? token("--space-s")
                        : token("--space-xs"),
                    pointerEvents: actionsVisible ? "auto" : "none",
                  }}
                >
                  {view.nextDraw !== null && (
                    <GlassButton
                      label={gambleActionLabel("draw")}
                      accessibilityLabel={`Draw attempt ${formatNumber(view.nextDraw.attemptNumber)} for ${formatNumber(view.nextDraw.cost)} Essence`}
                      essenceCost={view.nextDraw.cost}
                      variant="accent"
                      disabled={
                        !view.runtimeReady ||
                        !view.nextDraw.available ||
                        !view.nextDraw.canAfford
                      }
                      testId={
                        result === null
                          ? "gamble-ladder-climb"
                          : "gamble-ladder-climb-again"
                      }
                      onPress={onDraw}
                    />
                  )}
                  <GlassButton
                    label={"Leave"}
                    testId={
                      result === null
                        ? "gamble-ladder-leave"
                        : "gamble-ladder-leave-after-draw"
                    }
                    onPress={onLeave}
                  />
                </motion.div>
              </div>
              {result?.pendingDreamsignReplacement === true &&
                !replacementVisible &&
                !outcomeVisible && (
                  <GlassButton
                    label={"Choose Replacement"}
                    variant="accent"
                    testId="gamble-ladder-open-replacement"
                    onPress={() => setReplacementVisible(true)}
                  />
                )}
            </main>
          );
        })()}
      </SiteLayout>
      {replacementVisible && view.replacement !== null && (
        <DreamsignReplacementDialog
          model={{
            ...view.replacement,
            dismissLabel: "Not Yet",
            closeLabel: "Close replacement choice",
          }}
          onDismiss={() => setReplacementVisible(false)}
          onDreamsignPress={onReplaceDreamsign}
        />
      )}
    </div>
  );
}

function StarwayStairsScreen({
  view,
  onDraw,
  onLeave,
  onOutcomeShown,
  onCashOut,
  onPlayAgain,
}: {
  view: StarwayStairsSiteView;
  onDraw: () => void;
  onLeave: () => void;
  onOutcomeShown: () => void;
  onCashOut: () => void;
  onPlayAgain: () => void;
}) {
  const reduceMotion = useReducedMotion() === true;
  const layout = useIsDesktop() ? "desktop" : "mobile";
  const [revealedResultId, setRevealedResultId] =
    useState<GambleResultId | null>(null);
  const [outcomeResultId, setOutcomeResultId] = useState<GambleResultId | null>(
    null,
  );
  const [actionsVisible, setActionsVisible] = useState(view.result === null);
  const [decisionPending, setDecisionPending] = useState(false);
  const [emphasisTierNumber, setEmphasisTierNumber] =
    useState<StarwayStairsTierNumber | null>(
      view.result?.tierNumber ?? view.currentTierNumber,
    );
  const settledResultIdRef = useRef<GambleResultId | undefined>(undefined);
  const onOutcomeShownRef = useRef(onOutcomeShown);
  const resultId = view.result?.id;
  const emphasisTierForResult =
    view.result?.tierNumber ?? view.currentTierNumber;
  const currentTier =
    view.tiers.find((tier) => tier.tierNumber === view.currentTierNumber) ??
    null;

  useEffect(() => {
    onOutcomeShownRef.current = onOutcomeShown;
  }, [onOutcomeShown]);

  useEffect(() => {
    setDecisionPending(false);
  }, [resultId, view.currentTierNumber, view.terminalReason]);

  useEffect(() => {
    if (resultId === undefined) {
      setRevealedResultId(null);
      setOutcomeResultId(null);
      setActionsVisible(true);
      setEmphasisTierNumber(emphasisTierForResult);
      return;
    }
    setEmphasisTierNumber(emphasisTierForResult);
    setActionsVisible(false);
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
  }, [emphasisTierForResult, reduceMotion, resultId]);

  useEffect(() => {
    if (
      view.result === null ||
      !view.result.resultSettled ||
      outcomeResultId !== view.result.id
    ) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setOutcomeResultId(null);
      setEmphasisTierNumber(view.currentTierNumber);
      setActionsVisible(true);
    }, RADIAL_ANNOUNCEMENT_EXTENDED_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [outcomeResultId, view.currentTierNumber, view.result]);

  return (
    <div data-testid="cumulus-gamble-site-screen">
      <SiteLayout
        siteId={view.siteId}
        scene={view.scene}
        moteTint="warm"
        guide={{ ...view.guide, presence: "speaking" }}
        composition="balanced-gallery"
      >
        {(() => {
          const outcomeVisible =
            view.result !== null && outcomeResultId === view.result.id;
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
                    ? token("--space-s")
                    : token("--space-xs"),
                boxSizing: "border-box",
                padding:
                  layout === "desktop"
                    ? token("--space-l")
                    : token("--space-xs"),
                pointerEvents: "auto",
              }}
            >
              <section
                aria-label={gambleAccessibilityDescription(view.gameId)}
                data-starway-stairs-tiers=""
                style={{
                  position: "relative",
                  width: "100%",
                  display: "grid",
                  gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                  gap:
                    layout === "desktop"
                      ? token("--space-s")
                      : token("--space-xs"),
                  alignItems: "start",
                  justifyItems: "center",
                }}
              >
                {/* Gamble tiles reserve immutable grid slots: result overlays are
                  absolute so drawing and announcements never move the wager objects. */}
                {view.tiers.map((tier) => {
                  const isLatestResult =
                    view.result?.tierNumber === tier.tierNumber;
                  const revealDrawnCard =
                    tier.card !== null &&
                    (!isLatestResult || revealedResultId === view.result?.id);
                  return (
                    <div
                      key={tier.tierNumber}
                      data-starway-tier={tier.tierNumber}
                      data-starway-tier-state={tier.state}
                      style={{
                        position: "relative",
                        width: "100%",
                        minWidth: 0,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap:
                          layout === "desktop"
                            ? token("--space-s")
                            : token("--space-xs"),
                      }}
                    >
                      <WagerPrizeCard
                        prizeId={
                          `starway-${String(tier.tierNumber)}` as
                            "starway-1" | "starway-2" | "starway-3"
                        }
                        minimumWinningRank={tier.minimumWinningRank}
                        essenceReward={tier.essenceReward}
                        rewardDreamsign={null}
                        size={layout === "desktop" ? "standard" : "compact"}
                        drawnCard={tier.card}
                        revealDrawnCard={revealDrawnCard}
                        emphasis={
                          tier.tierNumber === emphasisTierNumber
                            ? "current"
                            : "muted"
                        }
                      />
                      {outcomeVisible &&
                        isLatestResult &&
                        view.result !== null && (
                          <div
                            data-starway-outcome=""
                            style={{
                              position: "absolute",
                              inset: 0,
                              display: "grid",
                              placeItems: "center",
                              pointerEvents: "none",
                              zIndex: 2,
                            }}
                          >
                            <RadialAnnouncement
                              announcementId={view.result.id}
                              headline={gambleOutcomeLabel(
                                view,
                                view.result.busted ? "bust" : "safe",
                              )}
                              detail={
                                view.result.busted
                                  ? undefined
                                  : gambleOutcomeLabel(view, "prize-at-stake")
                              }
                              essenceGained={
                                !view.result.busted &&
                                view.result.tierNumber === view.tiers.length
                                  ? view.result.prizeAtRisk
                                  : undefined
                              }
                              tone={view.result.busted ? "danger" : "reward"}
                              size={layout === "mobile" ? "mini" : "wager"}
                              duration="extended"
                            />
                          </div>
                        )}
                    </div>
                  );
                })}
              </section>

              <div
                data-starway-actions=""
                aria-hidden={!actionsVisible || undefined}
                style={{
                  minHeight: token("--touch-min"),
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: token("--space-xs"),
                  flexWrap: "nowrap",
                  visibility: actionsVisible ? "visible" : "hidden",
                  pointerEvents: actionsVisible ? "auto" : "none",
                }}
              >
                {currentTier !== null && (
                  <div data-starway-tier-button={currentTier.tierNumber}>
                    <GlassButton
                      label={gambleActionLabel(
                        currentTier.tierNumber === 1 ? "bet" : "climb",
                      )}
                      accessibilityLabel={
                        currentTier.tierNumber === 1
                          ? `Bet ${formatNumber(view.wagerAmount)} Essence on Starway Stairs`
                          : `Climb to tier ${formatNumber(currentTier.tierNumber)} for ${formatNumber(view.wagerAmount)} Essence`
                      }
                      essenceValue={view.wagerAmount}
                      size={layout === "mobile" ? "compact" : "standard"}
                      variant="accent"
                      disabled={
                        decisionPending ||
                        !view.runtimeReady ||
                        !view.canAffordWager
                      }
                      testId={`gamble-starway-tier-${String(currentTier.tierNumber)}`}
                      onPress={() => {
                        setDecisionPending(true);
                        onDraw();
                      }}
                    />
                  </div>
                )}
                {view.cashOutReward !== null && (
                  <GlassButton
                    label={gambleActionLabel("take")}
                    accessibilityLabel={`Take ${formatNumber(view.cashOutReward)} Essence`}
                    essenceValue={view.cashOutReward}
                    size={layout === "mobile" ? "compact" : "standard"}
                    disabled={decisionPending}
                    testId="gamble-starway-cash-out"
                    onPress={() => {
                      setDecisionPending(true);
                      setEmphasisTierNumber(null);
                      onCashOut();
                    }}
                  />
                )}
                {view.terminalReason !== null ? (
                  <>
                    {view.canPlayAgain && (
                      <GlassButton
                        label={"Play Again"}
                        size={layout === "mobile" ? "compact" : "standard"}
                        variant="accent"
                        disabled={decisionPending}
                        testId="gamble-starway-play-again"
                        onPress={() => {
                          setDecisionPending(true);
                          onPlayAgain();
                        }}
                      />
                    )}
                    <GlassButton
                      label={"Leave"}
                      size={layout === "mobile" ? "compact" : "standard"}
                      testId="gamble-starway-leave-after-result"
                      onPress={onLeave}
                    />
                  </>
                ) : view.result === null && currentTier?.tierNumber === 1 ? (
                  <GlassButton
                    label={"Leave"}
                    size={layout === "mobile" ? "compact" : "standard"}
                    testId="gamble-starway-leave"
                    onPress={onLeave}
                  />
                ) : null}
              </div>
            </main>
          );
        })()}
      </SiteLayout>
    </div>
  );
}

type BlackjackHandOwner = "dealer" | "player";
type BlackjackDeparturePhase = "idle" | "concealing" | "departing";

interface BlackjackPresentationState {
  readonly playerCardCount: number;
  readonly dealerCardCount: number;
  readonly revealedCardKeys: readonly BlackjackCardKey[];
  readonly departurePhase: BlackjackDeparturePhase;
  readonly outcomeResultId: GambleResultId | null;
  readonly actionsVisible: boolean;
}

type BlackjackCardKey =
  `${BlackjackHandOwner}:${number}:${PlayingCardRank}:${PlayingCardSuit}`;

function blackjackCardKey(
  owner: BlackjackHandOwner,
  index: number,
  card: BlackjackSiteView["playerCards"][number],
): BlackjackCardKey {
  return `${owner}:${index}:${card.rank}:${card.suit}`;
}

function blackjackCardDisplaySize(
  cardCount: number,
  layout: "desktop" | "mobile",
): number {
  if (cardCount === 0) return PLAYING_CARD_DESIGN.sizes.compact.square;
  const totalGapCount = cardCount;
  const roomForCards =
    BLACKJACK_HAND_MAX_WIDTH[layout] -
    BLACKJACK_TOTAL_SIZE[layout] -
    totalGapCount * BLACKJACK_HAND_GAP_PX;
  return Math.max(
    48,
    Math.min(
      PLAYING_CARD_DESIGN.sizes.compact.square,
      Math.floor(roomForCards / cardCount),
    ),
  );
}

function BlackjackScreen({
  view,
  onDeal,
  onHit,
  onStand,
  onLeave,
  onOutcomeShown,
  onPlayAgain,
}: {
  view: BlackjackSiteView;
  onDeal: () => void;
  onHit: () => void;
  onStand: () => void;
  onLeave: () => void;
  onOutcomeShown: () => void;
  onPlayAgain: () => void;
}) {
  const reduceMotion = useReducedMotion() === true;
  const layout = useIsDesktop() ? "desktop" : "mobile";

  const [presentation, setPresentation] = useState<BlackjackPresentationState>({
    playerCardCount: 0,
    dealerCardCount: 0,
    revealedCardKeys: [],
    departurePhase: "idle",
    outcomeResultId: null,
    actionsVisible: view.playerCards.length === 0,
  });
  const presentationRef = useRef(presentation);
  const lastHandIdRef = useRef(view.handId);
  const [decisionPending, setDecisionPending] = useState(false);
  const settledResultIdRef = useRef<GambleResultId | null>(null);
  const onOutcomeShownRef = useRef(onOutcomeShown);
  const playAgainTimeoutsRef = useRef<number[]>([]);

  const commitPresentation = useCallback((next: BlackjackPresentationState) => {
    presentationRef.current = next;
    setPresentation(next);
  }, []);

  useEffect(() => {
    onOutcomeShownRef.current = onOutcomeShown;
  }, [onOutcomeShown]);

  useEffect(
    () => () => {
      for (const timeout of playAgainTimeoutsRef.current) {
        window.clearTimeout(timeout);
      }
    },
    [],
  );

  const playerCardSignature = view.playerCards
    .map((card) => `${card.rank}:${card.suit}`)
    .join("|");
  const dealerCardSignature = view.dealerCards
    .map((card) => `${card.rank}:${card.suit}`)
    .join("|");

  useLayoutEffect(() => {
    const handChanged = lastHandIdRef.current !== view.handId;
    lastHandIdRef.current = view.handId;
    const initial: BlackjackPresentationState = handChanged
      ? {
          playerCardCount: 0,
          dealerCardCount: 0,
          revealedCardKeys: [],
          departurePhase: "idle",
          outcomeResultId: null,
          actionsVisible: view.playerCards.length === 0,
        }
      : presentationRef.current;
    if (handChanged) commitPresentation(initial);

    const timers: number[] = [];
    const schedule = (delay: number, callback: () => void) => {
      timers.push(window.setTimeout(callback, delay));
    };
    const patchPresentation = (patch: Partial<BlackjackPresentationState>) => {
      commitPresentation({ ...presentationRef.current, ...patch });
    };
    const arrivalMs = reduceMotion
      ? REDUCED_MOTION_DELAY_MS
      : BLACKJACK_CARD_ARRIVAL_MS;
    const flipMs = reduceMotion
      ? REDUCED_MOTION_DELAY_MS
      : PLAYING_CARD_FLIP_DURATION_MS;
    const cardReadingMs = reduceMotion
      ? REDUCED_MOTION_DELAY_MS
      : BLACKJACK_CARD_READING_MS;
    const concealedReadingMs = reduceMotion
      ? REDUCED_MOTION_DELAY_MS
      : BLACKJACK_CONCEALED_READING_MS;
    const turnReadingMs = reduceMotion
      ? REDUCED_MOTION_DELAY_MS
      : BLACKJACK_TURN_READING_MS;
    const outcomeReadingMs = reduceMotion
      ? REDUCED_MOTION_DELAY_MS
      : BLACKJACK_OUTCOME_READING_MS;
    let cursor = reduceMotion ? 0 : BET_SETTLE_DELAY_MS;
    let plannedPlayerCount = initial.playerCardCount;
    let plannedDealerCount = initial.dealerCardCount;
    const plannedRevealedKeys = new Set(initial.revealedCardKeys);
    let timelineHasWork = false;

    const planCardArrival = (
      owner: BlackjackHandOwner,
      index: number,
      revealAfterArrival: boolean,
    ) => {
      const cards = owner === "player" ? view.playerCards : view.dealerCards;
      const card = cards[index];
      if (card === undefined) return;
      timelineHasWork = true;
      if (owner === "player") plannedPlayerCount = index + 1;
      else plannedDealerCount = index + 1;
      const nextCount = index + 1;
      schedule(cursor, () => {
        patchPresentation(
          owner === "player"
            ? { playerCardCount: nextCount }
            : { dealerCardCount: nextCount },
        );
      });
      cursor += arrivalMs;
      if (revealAfterArrival) {
        const key = blackjackCardKey(owner, index, card);
        plannedRevealedKeys.add(key);
        schedule(cursor, () => {
          patchPresentation({
            revealedCardKeys: [
              ...new Set([...presentationRef.current.revealedCardKeys, key]),
            ],
          });
        });
        cursor += flipMs + cardReadingMs;
      } else {
        cursor += concealedReadingMs;
      }
    };

    const openingOrder = [
      ["player", 0, true],
      ["dealer", 0, true],
      ["player", 1, true],
      ["dealer", 1, false],
    ] as const;
    for (const [owner, index, revealAfterArrival] of openingOrder) {
      const count =
        owner === "player" ? plannedPlayerCount : plannedDealerCount;
      if (count <= index) planCardArrival(owner, index, revealAfterArrival);
    }
    while (plannedPlayerCount < view.playerCards.length) {
      planCardArrival("player", plannedPlayerCount, true);
    }

    const holeCard = view.dealerCards[1];
    if (view.dealerRevealed && holeCard !== undefined) {
      const holeCardKey = blackjackCardKey("dealer", 1, holeCard);
      if (!plannedRevealedKeys.has(holeCardKey)) {
        timelineHasWork = true;
        plannedRevealedKeys.add(holeCardKey);
        schedule(cursor, () => {
          patchPresentation({
            revealedCardKeys: [
              ...new Set([
                ...presentationRef.current.revealedCardKeys,
                holeCardKey,
              ]),
            ],
          });
        });
        cursor += flipMs + cardReadingMs;
      }
    }
    while (plannedDealerCount < view.dealerCards.length) {
      planCardArrival("dealer", plannedDealerCount, true);
    }

    const outcomeNeedsPresentation =
      view.resultId !== null && initial.outcomeResultId !== view.resultId;
    if (timelineHasWork || outcomeNeedsPresentation) {
      patchPresentation({
        actionsVisible: false,
        outcomeResultId: null,
      });
    }

    if (view.resultId !== null && outcomeNeedsPresentation) {
      const resultId = view.resultId;
      cursor += outcomeReadingMs;
      schedule(cursor, () => {
        patchPresentation({
          outcomeResultId: resultId,
        });
        setDecisionPending(false);
        if (!view.resultSettled && settledResultIdRef.current !== resultId) {
          settledResultIdRef.current = resultId;
          onOutcomeShownRef.current();
        }
      });
    } else if (view.resultId === null && (timelineHasWork || handChanged)) {
      cursor += turnReadingMs;
      schedule(cursor, () => {
        patchPresentation({
          actionsVisible: true,
        });
        setDecisionPending(false);
      });
    } else if (view.playerCards.length === 0) {
      patchPresentation({ actionsVisible: true, outcomeResultId: null });
      setDecisionPending(false);
    }

    return () => {
      for (const timer of timers) window.clearTimeout(timer);
    };
  }, [
    commitPresentation,
    dealerCardSignature,
    playerCardSignature,
    reduceMotion,
    view.dealerCards,
    view.dealerRevealed,
    view.handId,
    view.playerCards,
    view.resultId,
    view.resultSettled,
  ]);

  useEffect(() => {
    if (
      view.resultId === null ||
      presentation.outcomeResultId !== view.resultId ||
      !view.resultSettled
    ) {
      return;
    }
    const timeout = window.setTimeout(() => {
      commitPresentation({
        ...presentationRef.current,
        outcomeResultId: null,
        actionsVisible: true,
      });
    }, RADIAL_ANNOUNCEMENT_EXTENDED_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [
    commitPresentation,
    presentation.outcomeResultId,
    view.resultId,
    view.resultSettled,
  ]);

  const beginPlayAgain = () => {
    if (decisionPending) return;
    setDecisionPending(true);
    commitPresentation({
      ...presentationRef.current,
      actionsVisible: false,
      departurePhase: "concealing",
    });
    const concealDurationMs = reduceMotion
      ? REDUCED_MOTION_DELAY_MS
      : PLAYING_CARD_FLIP_DURATION_MS;
    const departureDurationMs = reduceMotion
      ? REDUCED_MOTION_DELAY_MS
      : BLACKJACK_DEPARTURE_FADE_MS;
    playAgainTimeoutsRef.current = [
      window.setTimeout(() => {
        commitPresentation({
          ...presentationRef.current,
          departurePhase: "departing",
        });
      }, concealDurationMs),
      window.setTimeout(() => {
        playAgainTimeoutsRef.current = [];
        onPlayAgain();
      }, concealDurationMs + departureDurationMs),
    ];
  };

  const renderHand = (
    cards: BlackjackSiteView["playerCards"],
    owner: BlackjackHandOwner,
    layout: "desktop" | "mobile",
  ) => {
    const visibleCardCount =
      owner === "player"
        ? presentation.playerCardCount
        : presentation.dealerCardCount;
    const visibleCards = cards.slice(0, visibleCardCount);
    const revealedKeys = new Set(presentation.revealedCardKeys);
    const faceUpCards = visibleCards.filter((card, index) =>
      revealedKeys.has(blackjackCardKey(owner, index, card)),
    );
    const total =
      faceUpCards.length === 0
        ? null
        : blackjackHandTotal(faceUpCards, view.target);
    const visibleTotal = total;
    const cardDisplaySize = blackjackCardDisplaySize(
      visibleCards.length,
      layout,
    );
    const cardScale =
      cardDisplaySize / PLAYING_CARD_DESIGN.sizes.compact.square;
    return (
      <section
        aria-label={owner === "dealer" ? "Dealer hand" : "Player hand"}
        data-blackjack-side={owner}
        style={{
          position: "absolute",
          top: owner === "dealer" ? 0 : undefined,
          bottom: owner === "player" ? 0 : undefined,
          height: PLAYING_CARD_DESIGN.sizes.compact.square,
          width: "100%",
          display: "flex",
          justifyContent: "center",
        }}
      >
        <motion.div
          layout
          data-blackjack-hand={owner}
          data-blackjack-hand-departure-phase={presentation.departurePhase}
          initial={false}
          animate={{
            opacity: presentation.departurePhase === "departing" ? 0 : 1,
          }}
          transition={{
            duration: reduceMotion ? 0 : FADE_DURATION_SECONDS,
            ease: DREAM_EASE,
            layout: {
              duration: reduceMotion ? 0 : BLACKJACK_CARD_ARRIVAL_SECONDS,
              ease: DREAM_EASE,
            },
          }}
          style={{
            width: "100%",
            maxWidth: BLACKJACK_HAND_MAX_WIDTH[layout],
            height: PLAYING_CARD_DESIGN.sizes.compact.square,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: BLACKJACK_HAND_GAP_PX,
          }}
        >
          {visibleCards.map((card, index) => {
            const key = blackjackCardKey(owner, index, card);
            const revealed =
              revealedKeys.has(key) && presentation.departurePhase === "idle";
            return (
              <motion.div
                key={key}
                layout
                data-blackjack-card={`${owner}:${String(index)}`}
                data-blackjack-card-revealed={revealed ? "true" : "false"}
                data-blackjack-card-display-size={cardDisplaySize}
                data-blackjack-card-departure-phase={
                  presentation.departurePhase
                }
                initial={
                  reduceMotion
                    ? false
                    : {
                        y: token("--space-5xl"),
                        scale: 0.78,
                      }
                }
                animate={{ y: 0, scale: 1 }}
                transition={{
                  duration: reduceMotion ? 0 : BLACKJACK_CARD_ARRIVAL_SECONDS,
                  ease: DREAM_EASE,
                  layout: {
                    duration: reduceMotion ? 0 : BLACKJACK_CARD_ARRIVAL_SECONDS,
                    ease: DREAM_EASE,
                  },
                }}
                style={{
                  position: "relative",
                  width: cardDisplaySize,
                  height: cardDisplaySize,
                  flex: "0 0 auto",
                }}
              >
                <motion.div
                  initial={false}
                  animate={{ scale: cardScale }}
                  transition={{
                    duration: reduceMotion ? 0 : BLACKJACK_CARD_ARRIVAL_SECONDS,
                    ease: DREAM_EASE,
                  }}
                  style={{
                    position: "absolute",
                    top: "50%",
                    left: "50%",
                    width: PLAYING_CARD_DESIGN.sizes.compact.square,
                    height: PLAYING_CARD_DESIGN.sizes.compact.square,
                    translate: "-50% -50%",
                  }}
                >
                  <PlayingCard
                    variant="faceDown"
                    drawnCard={card}
                    revealDrawnCard={revealed}
                    size="compact"
                  />
                </motion.div>
              </motion.div>
            );
          })}
          <motion.div
            layout
            aria-hidden={visibleTotal === null ? true : undefined}
            data-blackjack-total={owner}
            data-blackjack-total-value={visibleTotal ?? undefined}
            data-blackjack-total-slot={owner}
            data-blackjack-total-departure-phase={presentation.departurePhase}
            style={{
              width: BLACKJACK_TOTAL_SIZE[layout],
              height: BLACKJACK_TOTAL_SIZE[layout],
              flex: "0 0 auto",
              display: "grid",
              placeItems: "center",
            }}
            transition={{
              layout: {
                duration: reduceMotion ? 0 : BLACKJACK_CARD_ARRIVAL_SECONDS,
                ease: DREAM_EASE,
              },
            }}
          >
            {visibleTotal !== null && (
              <RadialAnnouncement
                variant="hand-total"
                total={visibleTotal}
                owner={owner}
                size={layout === "mobile" ? "mini" : "compact"}
                announcementId={`${view.handId ?? "undealt"}:${owner}:${String(visibleTotal)}`}
              />
            )}
          </motion.div>
        </motion.div>
      </section>
    );
  };

  return (
    <div data-testid="cumulus-gamble-site-screen">
      <SiteLayout
        siteId={view.siteId}
        scene={view.scene}
        moteTint="warm"
        guide={{ ...view.guide, presence: "speaking" }}
        composition="balanced-gallery"
      >
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
              layout === "desktop" ? token("--space-s") : token("--space-xs"),
            boxSizing: "border-box",
            padding:
              layout === "desktop" ? token("--space-l") : token("--space-xs"),
            pointerEvents: "auto",
          }}
        >
          <div
            data-blackjack-table=""
            data-blackjack-departure-phase={presentation.departurePhase}
            style={{
              position: "relative",
              width: "100%",
              height: BLACKJACK_TABLE_HEIGHT[layout],
              flex: "0 0 auto",
            }}
          >
            {renderHand(view.dealerCards, "dealer", layout)}
            <div
              data-blackjack-prize=""
              style={{
                position: "absolute",
                top: "50%",
                left: "50%",
                width: BLACKJACK_REWARD_PANEL_WIDTH[layout],
                transform: "translate(-50%, -50%)",
              }}
            >
              <GlassPanel radius="control" testId="blackjack-reward-panel">
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: token("--space-xxs"),
                    padding: `${token("--space-s")} ${token("--space-m")}`,
                    textAlign: "center",
                  }}
                >
                  <h2 style={{ margin: 0, font: token("--t-title-sm") }}>
                    {gambleRulesDisclosure(view.gameId)}
                  </h2>
                  <p style={{ margin: 0, font: token("--t-body-sm") }}>
                    {gambleOutcomeLabel(view, "wins")}{" "}
                    <EssenceValue amount={view.prizeEssence} tone="inherit" />
                  </p>
                </div>
              </GlassPanel>
            </div>
            {renderHand(view.playerCards, "player", layout)}
          </div>
          <div
            data-blackjack-outcome-region=""
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
          >
            {view.resultId !== null &&
              presentation.outcomeResultId === view.resultId && (
                <div
                  data-blackjack-outcome=""
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "grid",
                    placeItems: "center",
                    pointerEvents: "none",
                    zIndex: 2,
                  }}
                >
                  <RadialAnnouncement
                    announcementId={view.resultId}
                    headline={gambleOutcomeLabel(
                      view,
                      view.outcome === "player-win"
                        ? "player-win"
                        : view.outcome === "push"
                          ? "push"
                          : (view.playerTotal ?? 0) > 21
                            ? "bust"
                            : "dealer-win",
                    )}
                    detail={
                      view.outcome === "push"
                        ? gambleOutcomeLabel(view, "wager-returned")
                        : undefined
                    }
                    essenceGained={
                      view.essenceAwarded > 0 ? view.essenceAwarded : undefined
                    }
                    tone={
                      view.outcome === "player-win"
                        ? "reward"
                        : view.outcome === "push"
                          ? "accent"
                          : "danger"
                    }
                    size={layout === "mobile" ? "mini" : "wager"}
                    duration="extended"
                  />
                </div>
              )}
          </div>
          <motion.div
            data-blackjack-actions=""
            data-blackjack-actions-visible={
              presentation.actionsVisible ? "true" : "false"
            }
            aria-hidden={!presentation.actionsVisible || undefined}
            initial={reduceMotion ? false : { opacity: 0 }}
            animate={{ opacity: presentation.actionsVisible ? 1 : 0 }}
            transition={{
              duration: reduceMotion ? 0 : FADE_DURATION_SECONDS,
              ease: DREAM_EASE,
            }}
            style={{
              minHeight: token("--touch-min"),
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: token("--space-xs"),
              visibility: presentation.actionsVisible ? "visible" : "hidden",
              pointerEvents: presentation.actionsVisible ? "auto" : "none",
            }}
          >
            {!view.playerCards.length ? (
              <>
                <GlassButton
                  label={gambleActionLabel("deal")}
                  essenceCost={view.wagerCost}
                  variant="accent"
                  disabled={
                    decisionPending ||
                    !view.runtimeReady ||
                    !view.canAffordWager
                  }
                  testId="gamble-blackjack-deal"
                  onPress={() => {
                    setDecisionPending(true);
                    onDeal();
                  }}
                />
                <GlassButton
                  label={"Leave"}
                  testId="gamble-blackjack-leave"
                  onPress={onLeave}
                />
              </>
            ) : view.outcome === null ? (
              <>
                <GlassButton
                  label={gambleActionLabel("hit")}
                  variant="accent"
                  disabled={decisionPending}
                  testId="gamble-blackjack-hit"
                  onPress={() => {
                    setDecisionPending(true);
                    onHit();
                  }}
                />
                <GlassButton
                  label={gambleActionLabel("stand")}
                  testId="gamble-blackjack-stand"
                  disabled={decisionPending}
                  onPress={() => {
                    setDecisionPending(true);
                    onStand();
                  }}
                />
              </>
            ) : (
              <>
                {view.canPlayAgain && (
                  <GlassButton
                    label={"Play Again"}
                    variant="accent"
                    disabled={decisionPending || !view.canPlayAgain}
                    testId="gamble-blackjack-play-again"
                    onPress={beginPlayAgain}
                  />
                )}
                <GlassButton
                  label={"Leave"}
                  disabled={decisionPending}
                  testId="gamble-blackjack-leave-after-result"
                  onPress={onLeave}
                />
              </>
            )}
          </motion.div>
        </main>
      </SiteLayout>
    </div>
  );
}

function FourSuitRepriseScreen({
  view,
  onDraw,
  onLeave,
  onOutcomeShown,
  onChooseTransfiguration,
  onPlayAgain,
}: {
  view: FourSuitRepriseSiteView;
  onDraw: (entryId: DeckEntryId) => void;
  onLeave: () => void;
  onOutcomeShown: () => void;
  onChooseTransfiguration: (type: TransfigurationType) => void;
  onPlayAgain: () => void;
}) {
  const reduceMotion = useReducedMotion() === true;
  const layout = useIsDesktop() ? "desktop" : "mobile";
  const [selectedEntryId, setSelectedEntryId] = useState<DeckEntryId | null>(
    null,
  );
  const [revealedResultId, setRevealedResultId] =
    useState<GambleResultId | null>(null);
  const [outcomeResultId, setOutcomeResultId] = useState<GambleResultId | null>(
    null,
  );
  const [actionsVisible, setActionsVisible] = useState(false);
  const [transfigurationVisible, setTransfigurationVisible] = useState(false);
  const [selectedFormType, setSelectedFormType] =
    useState<TransfigurationType | null>(null);
  const [decisionPending, setDecisionPending] = useState(false);
  const [cardOutcomePhase, setCardOutcomePhase] =
    useState<FourSuitCardOutcomePhase>("idle");
  const settledResultIdRef = useRef<GambleResultId | undefined>(undefined);
  const onOutcomeShownRef = useRef(onOutcomeShown);
  const resultId = view.result?.id;

  useEffect(() => {
    onOutcomeShownRef.current = onOutcomeShown;
  }, [onOutcomeShown]);

  useEffect(() => {
    if (view.phase !== "choose") return;
    setSelectedEntryId(null);
    setDecisionPending(false);
    setActionsVisible(false);
    setTransfigurationVisible(false);
    setSelectedFormType(null);
    setCardOutcomePhase("idle");
  }, [view.phase, view.roundNumber]);

  useEffect(() => {
    setActionsVisible(false);
    setTransfigurationVisible(false);
    setSelectedFormType(null);
    setDecisionPending(false);
    setCardOutcomePhase("idle");
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
      result.outcome === "transfiguration" ||
      !result.resultRevealed ||
      outcomeResultId !== result.id ||
      cardOutcomePhase !== "idle"
    ) {
      return;
    }
    setCardOutcomePhase("animating");
  }, [cardOutcomePhase, outcomeResultId, view.result]);

  useEffect(() => {
    if (cardOutcomePhase !== "animating" || view.result === null) return;
    const outcome = view.result.outcome;
    const timeout = window.setTimeout(
      () => {
        setCardOutcomePhase("complete");
        if (outcome === "transfiguration") setActionsVisible(true);
      },
      reduceMotion ? REDUCED_MOTION_DELAY_MS : FOUR_SUIT_CARD_OUTCOME_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [cardOutcomePhase, reduceMotion, view.result]);

  useEffect(() => {
    const result = view.result;
    if (
      result === null ||
      !result.resultRevealed ||
      outcomeResultId !== result.id
    ) {
      return;
    }
    const timeout = window.setTimeout(() => {
      setOutcomeResultId(null);
      if (result.outcome === "transfiguration") {
        if (result.resultSettled) {
          setCardOutcomePhase("animating");
        } else {
          setTransfigurationVisible(true);
        }
      } else {
        setActionsVisible(true);
      }
    }, RADIAL_ANNOUNCEMENT_EXTENDED_DURATION_MS);
    return () => window.clearTimeout(timeout);
  }, [outcomeResultId, view.result]);

  useEffect(() => {
    if (!transfigurationVisible || view.result?.resultSettled !== true) return;
    setTransfigurationVisible(false);
    setDecisionPending(false);
    setCardOutcomePhase("animating");
  }, [transfigurationVisible, view.result]);

  return (
    <div data-testid="cumulus-gamble-site-screen">
      <SiteLayout
        siteId={view.siteId}
        scene={view.scene}
        moteTint="warm"
        guide={{ ...view.guide, presence: "speaking" }}
        composition="balanced-gallery"
      >
        {(() => {
          const selectedCard =
            view.cards.find((card) => card.entryId === selectedEntryId) ?? null;
          if (view.phase === "choose" && selectedCard === null) {
            return (
              <section
                data-four-suit-picker=""
                data-four-suit-layout={layout}
                style={{
                  position: "relative",
                  zIndex: 10,
                  minHeight: 0,
                  height: "100%",
                  maxHeight: "100%",
                  width:
                    layout === "desktop"
                      ? "100%"
                      : `calc(100vw - (${token("--space-s")} * 2))`,
                  boxSizing: "border-box",
                  pointerEvents: "auto",
                  display: "grid",
                  alignItems: "center",
                }}
              >
                <CardPickerPanel
                  title={gambleTitle(view.gameId)}
                  subtitle={gambleRulesDisclosure(view.gameId)}
                  footerActions={[
                    {
                      label: "Leave",
                      onPress: onLeave,
                      testId: "gamble-four-suit-leave",
                    },
                  ]}
                  cards={view.cards.map((card) => ({
                    entryId: card.entryId,
                    model: card.model,
                    testId: `gamble-four-suit-card-${card.entryId}`,
                  }))}
                  emptyLabel={"No eligible cards remain."}
                  testId="gamble-four-suit-card-gallery"
                  onCardPress={setSelectedEntryId}
                />
              </section>
            );
          }

          if (transfigurationVisible && view.result !== null) {
            return (
              <div
                data-four-suit-transfiguration=""
                style={{
                  position: "relative",
                  zIndex: 10,
                  width: "100%",
                  maxWidth: DESKTOP_GAMBLE_REGION_MAX_WIDTH,
                  minHeight: 0,
                  pointerEvents: "auto",
                }}
              >
                <TransfigurationDetailPanel
                  candidate={{
                    card: view.result.transfigurationCandidate.model,
                    forms: view.result.transfigurationCandidate.forms,
                  }}
                  value={selectedFormType}
                  status={decisionPending ? "submitting" : "idle"}
                  navigation={{ kind: "fixed" }}
                  onChange={(type) =>
                    setSelectedFormType((current) =>
                      current === type ? null : type,
                    )
                  }
                  onConfirm={(type) => {
                    setDecisionPending(true);
                    onChooseTransfiguration(type);
                  }}
                />
              </div>
            );
          }

          const activeResult = view.phase === "result" ? view.result : null;
          const target =
            view.phase === "choose"
              ? selectedCard
              : (activeResult?.target ?? null);
          const drawnCard = activeResult?.card ?? null;
          const drawnCardVisible =
            activeResult !== null && revealedResultId === activeResult.id;
          const outcomeVisible =
            activeResult !== null && outcomeResultId === activeResult.id;
          const showReselect = view.phase === "choose" && selectedCard !== null;
          const drawCardWidth =
            PLAYING_CARD_DESIGN.sizes[
              layout === "desktop" ? "standard" : "compact"
            ].square;
          const stageGridTemplateColumns =
            layout === "desktop"
              ? `${String(FOUR_SUIT_TARGET_WIDTH.desktop)}px ${String(drawCardWidth)}px ${String(FOUR_SUIT_REWARD_PANEL_WIDTH.desktop)}px`
              : `${String(FOUR_SUIT_TARGET_WIDTH.mobile)}px ${String(drawCardWidth)}px`;
          const stageColumnGap =
            layout === "desktop" ? token("--space-4xl") : token("--space-2xl");
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
                  layout === "desktop" ? FOUR_SUIT_STAGE_MAX_WIDTH : undefined,
                height: "100%",
                minHeight: 0,
                justifySelf: "center",
                alignSelf: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: token("--space-3xl"),
                boxSizing: "border-box",
                padding:
                  layout === "desktop"
                    ? token("--space-l")
                    : token("--space-xs"),
                pointerEvents: "auto",
              }}
            >
              <section
                aria-label={gambleAccessibilityDescription(view.gameId)}
                data-four-suit-stage=""
                style={{
                  position: "relative",
                  width: "max-content",
                  display: "grid",
                  gridTemplateColumns: stageGridTemplateColumns,
                  gridTemplateAreas:
                    layout === "desktop"
                      ? '"target draw rewards"'
                      : '"target draw" "rewards rewards"',
                  columnGap: stageColumnGap,
                  rowGap: layout === "desktop" ? undefined : stageColumnGap,
                  alignItems: "center",
                  justifyItems: "center",
                  justifyContent: "center",
                }}
              >
                {target !== null && (
                  <div
                    data-four-suit-target-slot=""
                    style={{
                      position: "relative",
                      gridArea: "target",
                      width: FOUR_SUIT_TARGET_WIDTH[layout],
                      height:
                        FOUR_SUIT_TARGET_WIDTH[layout] /
                        CARD_ASPECT_RATIO_VALUE,
                      minWidth: 0,
                    }}
                  >
                    {cardOutcomePhase !== "complete" && (
                      <div
                        data-four-suit-target={target.entryId}
                        data-four-suit-target-presentation={cardOutcomePhase}
                        style={{ position: "absolute", inset: 0 }}
                      >
                        {activeResult !== null &&
                        cardOutcomePhase === "animating" ? (
                          <FourSuitOutcomeCard
                            result={activeResult}
                            layout={layout}
                            reduceMotion={reduceMotion}
                            essenceReward={view.essenceReward}
                          />
                        ) : (
                          <GameCard
                            model={
                              activeResult?.outcome === "transfiguration"
                                ? activeResult.transfigurationCandidate.model
                                : target.model
                            }
                          />
                        )}
                      </div>
                    )}
                  </div>
                )}
                <div data-four-suit-draw-card="" style={{ gridArea: "draw" }}>
                  <PlayingCard
                    variant="fourSuit"
                    size={layout === "desktop" ? "standard" : "compact"}
                    drawnCard={drawnCard}
                    revealDrawnCard={drawnCardVisible}
                  />
                </div>
                <div
                  data-four-suit-prize=""
                  style={{
                    gridArea: "rewards",
                    width: FOUR_SUIT_REWARD_PANEL_WIDTH[layout],
                    minWidth: 0,
                  }}
                >
                  <GlassPanel testId="gamble-four-suit-outcome-panel">
                    <div
                      data-four-suit-outcomes=""
                      style={{
                        height: fourSuitRewardPanelBodyHeight(layout),
                        boxSizing: "border-box",
                        display: "grid",
                        gridTemplateRows: "repeat(4, minmax(0, 1fr))",
                        padding:
                          layout === "desktop"
                            ? token("--space-s")
                            : token("--space-xs"),
                      }}
                    >
                      {view.outcomes.map((outcome) => (
                        <div
                          key={outcome.suit}
                          data-four-suit-outcome={outcome.suit}
                          aria-label={fourSuitOutcomeAccessibilityLabel(
                            outcome.suit,
                            outcome.outcome,
                          )}
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              layout === "desktop"
                                ? "44px minmax(0, 1fr)"
                                : "40px minmax(0, 1fr)",
                            alignItems: "center",
                            gap:
                              layout === "desktop"
                                ? token("--space-s")
                                : token("--space-xs"),
                            font:
                              layout === "desktop"
                                ? token("--t-button-lg")
                                : token("--t-button"),
                          }}
                        >
                          <PlayingCardSuitMark
                            suit={outcome.suit}
                            size={
                              layout === "desktop" ? "reward" : "rewardCompact"
                            }
                          />
                          <span>
                            {outcome.outcome === "transfiguration"
                              ? gambleOutcomeLabel(view, "transfiguration")
                              : outcome.outcome === "essence"
                                ? `Gain ${formatNumber(view.essenceReward)} Essence`
                                : gambleOutcomeLabel(view, outcome.outcome)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </GlassPanel>
                </div>
                {outcomeVisible && activeResult !== null && (
                  <div
                    data-four-suit-announcement=""
                    style={{
                      position: "absolute",
                      inset: 0,
                      display: "grid",
                      placeItems: "center",
                      pointerEvents: "none",
                      zIndex: 2,
                    }}
                  >
                    <RadialAnnouncement
                      announcementId={activeResult.id}
                      headline={gambleOutcomeLabel(view, activeResult.outcome)}
                      essenceGained={
                        activeResult.essenceGained > 0
                          ? activeResult.essenceGained
                          : undefined
                      }
                      tone={
                        activeResult.outcome === "purge" ? "danger" : "reward"
                      }
                      size={layout === "mobile" ? "mini" : "wager"}
                      duration="extended"
                    />
                  </div>
                )}
              </section>

              <div
                data-four-suit-actions=""
                style={{
                  minHeight: token("--touch-min"),
                  width: "max-content",
                  display: "grid",
                  gridTemplateColumns: stageGridTemplateColumns,
                  columnGap: stageColumnGap,
                  alignItems: "center",
                  visibility:
                    view.phase === "choose" || actionsVisible
                      ? "visible"
                      : "hidden",
                  pointerEvents:
                    view.phase === "choose" || actionsVisible ? "auto" : "none",
                }}
              >
                {showReselect && (
                  <div
                    data-four-suit-reselect=""
                    style={{ gridColumn: "1", justifySelf: "start" }}
                  >
                    <IconButton
                      glyph={GLYPHS.refreshCcw}
                      label={gambleActionLabel("choose-another")}
                      size="sm"
                      disabled={decisionPending}
                      testId="gamble-four-suit-choose-again"
                      onPress={() => setSelectedEntryId(null)}
                    />
                  </div>
                )}
                <div
                  data-four-suit-primary-actions=""
                  style={{
                    gridColumn: layout === "desktop" ? "2 / 4" : "2",
                    justifySelf: layout === "desktop" ? "center" : "start",
                    display: "flex",
                    alignItems: "center",
                    gap: token("--space-s"),
                  }}
                >
                  {view.phase === "choose" && selectedCard !== null ? (
                    <>
                      <GlassButton
                        label={gambleActionLabel("draw")}
                        accessibilityLabel={`Draw for ${formatNumber(view.drawCost)} Essence`}
                        essenceCost={view.drawCost}
                        size={layout === "mobile" ? "compact" : "standard"}
                        variant="accent"
                        disabled={
                          decisionPending ||
                          !view.runtimeReady ||
                          !view.canAffordDraw
                        }
                        testId="gamble-four-suit-draw"
                        onPress={() => {
                          setDecisionPending(true);
                          onDraw(selectedCard.entryId);
                        }}
                      />
                      <GlassButton
                        label={"Leave"}
                        size={layout === "mobile" ? "compact" : "standard"}
                        disabled={decisionPending}
                        testId="gamble-four-suit-leave-selected"
                        onPress={onLeave}
                      />
                    </>
                  ) : actionsVisible ? (
                    <>
                      {view.canPlayAgain && !decisionPending && (
                        <GlassButton
                          label={"Play Again"}
                          size={layout === "mobile" ? "compact" : "standard"}
                          variant="accent"
                          disabled={decisionPending}
                          testId="gamble-four-suit-play-again"
                          onPress={() => {
                            setDecisionPending(true);
                            onPlayAgain();
                          }}
                        />
                      )}
                      <GlassButton
                        label={"Leave"}
                        size={layout === "mobile" ? "compact" : "standard"}
                        testId="gamble-four-suit-leave-after-result"
                        onPress={onLeave}
                      />
                    </>
                  ) : null}
                </div>
              </div>
            </main>
          );
        })()}
      </SiteLayout>
    </div>
  );
}
