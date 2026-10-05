// The local game's React face. `LocalGameProvider` exposes one open
// `LocalGame<FoldState>` to the game UI; the hooks read its fold and append
// intents to its log. Every append commits synchronously, so the displayed
// state and the committed state are the same fold.
//
// The single local player is the controller of every game: `useClientId` is
// that player's id, and the player is always the one connected client.

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
import { BounceToast, bounceMessageForReason } from "../coop/BounceToast";
import { makeActions, type AppendFn, type CoopActions } from "../coop/actions";
import { CURRENT_REDUCER_VERSION } from "../coop/reducer-version";
import type { EventDraft } from "../eventlog/local-log";
import type { EventOutcome, GameEvent } from "../eventlog/types";
import type { FoldState } from "../rules/fold-state";
import type { ClientId } from "../types/identifiers";
import {
  LocalGameControlsContext,
  type LocalGameControls,
} from "./game-controls";
import type { LocalGame } from "./local-game";

/** A committed event's outcome, delivered to `useEventOutcomes` subscribers. */
export type OutcomeListener = (
  event: GameEvent,
  seq: number,
  outcome: EventOutcome,
) => void;

interface LocalGameContextValue {
  game: LocalGame<FoldState>;
  append: AppendFn;
  actions: CoopActions;
  connectedClientIds: readonly ClientId[];
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
 * `useLocalGameControls`, and shows a toast when an intent bounces.
 */
export function LocalGameProvider({
  game,
  controls = null,
  children,
}: {
  game: LocalGame<FoldState>;
  controls?: LocalGameControls | null;
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
      append,
      actions: makeActions(append, {
        selectionRulesVersion:
          game.genesis.reducerVersion === CURRENT_REDUCER_VERSION
            ? undefined
            : null,
      }),
      connectedClientIds: [game.localPlayerId],
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

/** Appends one intent to the game log, resolving to its seq. */
export function useAppend(): AppendFn {
  return useLocalGameContext().append;
}

/** The named action facade, bound to the game log. */
export function useActions(): CoopActions {
  return useLocalGameContext().actions;
}

/** The number of connected players: the single local player. */
export function useConnectedCount(): number | null {
  return useLocalGameContext().connectedClientIds.length;
}

/** The connected players: the single local player. */
export function useConnectedClientIds(): readonly ClientId[] | null {
  return useLocalGameContext().connectedClientIds;
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

/** The open prompt's id, or null when no prompt is open. */
export function useConfirmedPromptId(): number | null {
  return useGameState().battle?.pendingPrompt?.promptId ?? null;
}
