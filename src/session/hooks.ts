// The local game's React face. `LocalGameProvider` exposes one open
// `LocalGame<FoldState>` to the game UI; the hooks read its fold and append
// intents to its log. Every append commits synchronously, so the displayed
// state and the committed state are the same fold.
//
// The single local player is the controller of every game: `useClientId` is
// that player's id, and the provider keeps that player in control of the
// fold's single-controller phases (src/session/single-controller.ts).

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { BounceToast, bounceMessageForReason } from "../components/BounceToast";
import { makeActions, type AppendFn, type GameActions } from "./actions";
import type { EventDraft } from "../eventlog/local-log";
import type { EventOutcome, GameEvent } from "../eventlog/types";
import type { FoldState } from "../rules/fold-state";
import { tutorialBattleOf } from "../rules/battle/fold";
import type { ClientId } from "../types/identifiers";
import {
  LocalGameControlsContext,
  type LocalGameControls,
} from "./game-controls";
import type { LocalGame } from "./local-game";
import { keepLocalPlayerInControl } from "./single-controller";
import { logEvent } from "../logging";
import {
  clearEngineLogRecords,
  takeEngineLogRecords,
} from "../rules/battle/engine-battle";

/** A committed event's outcome, delivered to `useEventOutcomes` subscribers. */
export type OutcomeListener = (
  event: GameEvent,
  seq: number,
  outcome: EventOutcome,
) => void;

interface LocalGameContextValue {
  game: LocalGame<FoldState>;
  actions: GameActions;
}

const LocalGameContext = createContext<LocalGameContextValue | null>(null);

function useLocalGameContext(): LocalGameContextValue {
  const value = useContext(LocalGameContext);
  if (value === null) {
    throw new Error("Game hooks must be used within a LocalGameProvider");
  }
  return value;
}

/** How long the bounce toast stays up before auto-dismissing. */
const BOUNCE_TOAST_MS = 4000;

/**
 * Provides `game` to the game hooks, and its `controls` to
 * `useLocalGameControls`, keeps the local player in control of the game, and
 * shows a toast when an intent bounces. `claimUnownedBattle` also claims a
 * battle nobody controls (a direct tutorial-battle entry).
 */
export function LocalGameProvider({
  game,
  controls = null,
  claimUnownedBattle = false,
  children,
}: {
  game: LocalGame<FoldState>;
  controls?: LocalGameControls | null;
  claimUnownedBattle?: boolean;
  children: ReactNode;
}): ReactNode {
  const [bounce, setBounce] = useState<{ token: number; message: string }>({
    token: 0,
    message: bounceMessageForReason(undefined),
  });
  const [showBounce, setShowBounce] = useState(false);

  useEffect(
    () =>
      game.log.subscribe((record) => {
        if (record.outcome !== "bounced") return;
        setBounce((previous) => ({
          token: previous.token + 1,
          message: bounceMessageForReason(record.bounceReason),
        }));
      }),
    [game],
  );

  useEffect(() => {
    // Records the open replay kept were logged when their events committed.
    clearEngineLogRecords();
    return game.log.subscribe((record) => {
      // Each engine log record of an applied event is logged once, as its
      // event commits; a replay on reload logs none again.
      const records = takeEngineLogRecords(record.seq);
      if (record.outcome !== "applied") return;
      for (const { event, ...fields } of records) logEvent(event, fields);
    });
  }, [game]);

  useEffect(
    () => keepLocalPlayerInControl(game, { claimUnownedBattle }),
    [claimUnownedBattle, game],
  );

  useEffect(() => {
    if (bounce.token === 0) return undefined;
    setShowBounce(true);
    const timer = setTimeout(() => setShowBounce(false), BOUNCE_TOAST_MS);
    return () => clearTimeout(timer);
  }, [bounce.token]);

  const append = useCallback<AppendFn>(
    (draft: EventDraft) => Promise.resolve(game.log.append(draft)),
    [game],
  );
  const value = useMemo<LocalGameContextValue>(
    () => ({
      game,
      actions: makeActions(append),
    }),
    [append, game],
  );

  return createElement(
    LocalGameControlsContext.Provider,
    { value: controls },
    createElement(
      LocalGameContext.Provider,
      { value },
      children,
      showBounce
        ? createElement(BounceToast, {
            key: "game-bounce-toast",
            message: bounce.message,
            onDismiss: () => setShowBounce(false),
          })
        : null,
    ),
  );
}

function useLogSnapshot<T>(read: (game: LocalGame<FoldState>) => T): T {
  const { game } = useLocalGameContext();
  const subscribe = useCallback(
    (onChange: () => void) => game.log.subscribe(onChange),
    [game],
  );
  return useSyncExternalStore(subscribe, () => read(game));
}

/** The fold of every committed event. */
export function useGameState(): FoldState {
  return useLogSnapshot((game) => game.log.state());
}

/** The fold of every committed event; identical to `useGameState`. */
export function useConfirmedGameState(): FoldState {
  return useGameState();
}

/** Seq of the newest committed event; 0 for a new game. */
export function useConfirmedHead(): number | null {
  return useLogSnapshot((game) => game.log.head());
}

/** The local player's id: the default actor of every intent and the controller. */
export function useClientId(): ClientId {
  return useLocalGameContext().game.localPlayerId;
}

/** The named action facade, bound to the game log. */
export function useActions(): GameActions {
  return useLocalGameContext().actions;
}

/** Subscribe to committed event outcomes for the lifetime of the caller. */
export function useEventOutcomes(listener: OutcomeListener): void {
  const { game } = useLocalGameContext();
  const listenerRef = useRef(listener);
  listenerRef.current = listener;
  useEffect(
    () =>
      game.log.subscribe((record) =>
        listenerRef.current(record.event, record.seq, record.outcome),
      ),
    [game],
  );
}

/** The tutorial battle's open prompt id, or null when no prompt is open. */
export function useConfirmedPromptId(): number | null {
  return tutorialBattleOf(useGameState().battle)?.pendingPrompt?.promptId ?? null;
}
