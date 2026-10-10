// Core battle setup rules shared by player and opponent controllers.

export const BATTLE = {
  // Minimum number of cards prepared battle decks must contain. Short player
  // decks repeat their whole deck; short opponent decks add distinct cards.
  minimumDeckSize: 25,
  // Number of cards dealt to the player at the start of a battle, before any
  // active journey modifiers adjust the player's hand.
  playerOpeningHandSize: 5,
  // Number of cards dealt to the opponent at the start of a battle.
  enemyOpeningHandSize: 5,
  // Points needed to win at each zero-indexed Atlas completion level. Battles
  // beyond the last listed level continue using the final target.
  scoreTargets: [10, 25],
  // Highest numbered battle round. Advancing beyond it without a winner ends
  // the battle in a draw.
  turnLimit: 50,
  // Maximum energy available to either side under the standard energy ramp.
  energyCap: 10,
  // Maximum cards a side keeps when end-of-turn automation discards excess
  // cards from its hand.
  handLimit: 10,
  // Consecutive automatic game actions after which a battle that no player can
  // stop ends in a draw (rules § Mandatory Loops).
  resolutionCap: 100000,
  // Consecutive automatic game actions after which the engine starts checking
  // whether the battle has returned to exactly a state it passed through,
  // which ends it in a draw (rules § Mandatory Loops). Shorter runs are never
  // checked, which keeps ordinary turns fast.
  mandatoryLoopCheckFrom: 64,
  // Longest repeating sequence of automatic game actions the engine checks
  // for: a battle that returns to a state it passed through no more than this
  // many actions earlier ends in a draw within about twice this many actions
  // of entering the loop. A longer loop ends at the resolution cap, also a
  // draw (rules § Mandatory Loops).
  mandatoryLoopWindow: 4096,
  // Iterations after which an accepted loop shortcut (Repeat ×N or Repeat
  // until victory) stops and returns control to its player (rules § Optional
  // Loops).
  loopIterationCap: 10000,
  // Top-level actions within one main window that loop detection remembers;
  // a loop longer than this is not offered as a shortcut.
  loopHistoryActions: 100,
  // Most dry runs of a play or activation's choices that its feasibility
  // search makes, legality and every play-time prompt together, along the
  // path of answers its player gives. Legality searches the answer paths of
  // every possible play for one that reaches the commit point with payable
  // costs, and each play-time prompt offers only answers from which such a
  // path exists, searching with what earlier prompts left. A search that
  // runs out finds nothing: the play is not offered, or the answer is
  // withheld and a feasibilityBounded event records it.
  feasibilitySearchRuns: 256,
  // Whether a prompt with exactly one legal answer (a forced choice) is
  // answered automatically instead of being asked; the answer is recorded.
  autoAnswerForcedPrompts: true,
  // The battle screen's presentation of engine events ("present, then
  // ask"). Each presented event holds back the next prompt and the board's
  // next change for its dwell: a card's travel between zones or a notice
  // (`eventDwellMs`); the opponent's play at reading size before it travels
  // to its destination (`opponentPlayRevealDwellMs`, the tutorial's reveal
  // pacing); a character's scored points (`scoreDwellMs`, four slow motion
  // steps of its announcement); a Dreamwell card's reveal
  // (`dreamwellRevealDwellMs`); and a new turn's announcement
  // (`turnAnnouncementDwellMs`, the announcement's display time). A backlog
  // of travels longer than `maxBacklogMs` drops its oldest ones, and one of
  // more than `maxQueuedReveals` opponent plays drops its oldest reveals, so
  // a long loop never stalls the next prompt. The battle log keeps the
  // newest `logEntryCap` entries of a battle.
  presentation: {
    eventDwellMs: 450,
    maxBacklogMs: 2700,
    opponentPlayRevealDwellMs: 2000,
    scoreDwellMs: 1680,
    dreamwellRevealDwellMs: 2000,
    turnAnnouncementDwellMs: 2100,
    maxQueuedReveals: 4,
    logEntryCap: 400,
  },
  // Side that takes the first turn. Valid values are `Player` and `Enemy`.
  startingSide: "player",
  // Whether the player omits the normal Draw phase on their first turn.
  skipPlayerOpeningDraw: true,
  // Number of representative opponent deck cards featured on the Battle Start
  // screen as that Avatar's signature cards.
  opponentSignatureCardCount: 3,
  reward: {
    baseEssence: 100,
    essencePerCompletionLevel: 50,
    minimumEssence: 0,
  },
};
