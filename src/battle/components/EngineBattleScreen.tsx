// The journey battle screen over the engine battle (Phase 4.2). It renders
// `engine.view` for the human through the existing battle screen, drives
// highlights and drop targets from the engine's legal actions, and writes
// the human's intents (`battleAction`, `answer`, `cancel`) through the
// session's action facade. The enemy is the AI host's (`useEngineAi`).
//
// Game flow lives in the fold: whether the human may act comes from the
// engine's pending decision and prompt, never from React state. Local state
// here is presentation only: the card being dragged, an ability chooser,
// an open zone browser or battle log, a dismissed result, and the
// presentation queue (`battle-presentation.ts`). While the queue presents a
// batch older than the fold, the board shows that batch's state and takes no
// input; a prompt waits until the queue is idle.
//
// Every prompt reaches the human through the prompt host
// (`prompt-host-view-model.ts`, `BattlePromptHost`): its surfaces answer
// with exactly one intent keyed by the prompt's id, and Cancel only while
// the prompt is cancellable.
//
// Every intent carries an intent key naming the decision or prompt it
// answers, so a second submission for the same decision (a drag and a tap,
// a double click) is applied at most once by the log. A stale intent
// bounces in the fold and the screen re-renders from the fold.

import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MobileBattleResultAction } from "../../cumulus/screens/BattleResultSurface";
import { CardZoneBrowserOverlay } from "../../cumulus/screens/CardZoneBrowserOverlay";
import { BattleEventLogOverlay } from "../../cumulus/screens/battle-overlays/BattleEventLogOverlay";
import {
  MobileBattleScreen,
  type MobileBattleInteractions,
  type MobileBattleSlotTarget,
  type MobileBattleView,
} from "../../cumulus/screens/MobileBattleScreen";
import { DOUBLE_TAP_WINDOW_MS } from "../../cumulus/primitives/pointer-gesture";
import { useIsDesktop } from "../../cumulus/primitives/use-is-desktop";
import type { Action, Answer, Engine, InstanceId, Side } from "../../engine";
import { promptView } from "../../engine";
import { decisionKeyOf, sidePending, type DecisionKey } from "../../engine/fold/slice";
import { logEvent, logEventOnce } from "../../logging";
import { pendingEnginePrompt } from "../../rules/battle/engine-battle";
import { journeyBattleOf } from "../../rules/battle/fold";
import { PAGE_DEBUG_PANEL, PAGE_ENEMY_POLICY } from "../../runtime/runtime-config";
import { ENGINE_BATTLE_LOG_COPY, engineBattleNoticeCopy } from "../../runtime/battle-prompt-messages";
import {
  battleLogTurns,
  engineBattleLog,
  warmEngineBattleLog,
} from "../../screens/cumulus_adapters/engine-battle-log-view-model";
import { buildBattleAvatarStatus } from "../../screens/cumulus_adapters/mobile-battle-view-model";
import {
  buildEngineBattleScreenModel,
  figmentMergeTargets,
  handPlayAction,
  repositionForDrop,
  withChooser,
  type EngineChooser,
  type EngineEmblemNamer,
} from "../../screens/cumulus_adapters/engine-battle-view-model";
import {
  surfaceChoices,
  type ChoiceSelection,
  type PendingEnginePrompt,
} from "../../screens/cumulus_adapters/prompt-host-view-model";
import { useActions, useGameEvents, useGameState } from "../../session/hooks";
import { useJourney } from "../../state/journey-context";
import { parseCardId, type CardId } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import { parseBattleCardId, type BattleCardId, type DreamwellCardId } from "../../types/identifiers";
import { engineIntentKey } from "../engine-ai/engine-ai-driver";
import { useEngineAi } from "../engine-ai/use-engine-ai";
import { dreamwellCardDefinition } from "../integration/create-battle-init";
import { LEGIONNAIRE_FIGMENT_ID, lookupFigmentCatalogEntryById } from "../state/figment-catalog";
import { dreamwellCardModel } from "../ui/dreamwell-card-model";
import { createEngineCardModels } from "../ui/engine-card-model";
import { usePresentationQueue, usePublishedEngineEvents } from "./battle-presentation";
import { resolveEnemyAvatarSummary } from "./enemy-avatar-summary";
import { presentationItems, sliceKey } from "./presentation-items";

/** The engine debug panel (`?debug=1`, D4); a production build compiles it out (P7). */
const EngineDebugPanel = import.meta.env.DEV ? lazy(() => import("./EngineDebugPanel")) : null;

/** The side the local player plays in a journey battle. */
const HUMAN: Side = "player";

type Drag = { readonly id: BattleCardId; readonly source: "near-hand" | "battlefield" };
type BrowsedZone = { readonly side: Side; readonly zone: "void" | "banished" };

/** The board handlers this screen supplies. */
type BoardHandlers = Required<
  Pick<
    MobileBattleInteractions,
    | "onHandCardActivate"
    | "onHandCardDrop"
    | "onBattlefieldCardActivate"
    | "onStatusActivate"
    | "onCardDragStart"
    | "onCardDragEnd"
    | "onSlotDrop"
    | "onFigmentMerge"
    | "onBattlefieldDropRejected"
    | "onZoneDrop"
    | "onZoneOpen"
    | "onNextPhase"
    | "onPromptCancel"
    | "onPromptNumberSubmit"
    | "onPromptArrangeSubmit"
    | "onPromptNoticeDismiss"
    | "onBattleLogOpen"
    | "onAllForward"
    | "onAllBack"
    | "onRepeatLoop"
    | "onCardPickerSubmit"
    | "onCardPickerSkip"
    | "onChoicePromptChoose"
    | "onResultAction"
  >
>;

/** No target: one array, so the board's memoized regions see an unchanged prop. */
const NO_TARGETS: readonly BattleCardId[] = [];

export function EngineBattleScreen({ engine }: { readonly engine: Engine }) {
  const battle = journeyBattleOf(useGameState().battle);
  const actions = useActions();
  const { cardDatabase, journeyContent } = useJourney();
  const isDesktop = useIsDesktop();
  useEngineAi(PAGE_ENEMY_POLICY);

  const [drag, setDrag] = useState<Drag | null>(null);
  const [abilityChooser, setAbilityChooser] = useState<EngineChooser | null>(null);
  const presentation = usePresentationQueue();
  const [browsed, setBrowsed] = useState<BrowsedZone | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [resultDismissed, setResultDismissed] = useState(false);

  if (battle === null) {
    throw new Error("EngineBattleScreen requires a journey battle");
  }
  const fold = battle.engine;
  const { init } = battle;
  const slice = fold.slice;
  const battleId = init.battleId;

  const cards = useMemo(() => {
    const byId = new Map<CardId, CardData>();
    for (const card of cardDatabase.values()) byId.set(card.id, card);
    return createEngineCardModels({
      definitions: init.cardDefinitions,
      cards: byId,
      figment: lookupFigmentCatalogEntryById,
    });
  }, [cardDatabase, init]);
  const avatars = useMemo(
    () => ({
      player: buildBattleAvatarStatus(init.avatarSummary, false),
      enemy: buildBattleAvatarStatus(
        resolveEnemyAvatarSummary(init.enemyDescriptor, journeyContent),
        !init.opponentAbilityActive,
      ),
    }),
    [init, journeyContent],
  );

  const dreamwell = useMemo(() => {
    const byId = new Map(journeyContent.dreamwellCards.map((card) => [card.id, dreamwellCardDefinition(card)]));
    return (card: DreamwellCardId) => byId.get(card) ?? null;
  }, [journeyContent]);

  // The board shows the batch being presented while it is older than the
  // fold: the opponent's plays arrive one at a time.
  const head = presentation.head;
  const presentedState = head !== null && head.batch.key !== sliceKey(slice) ? head.batch.state : null;

  // Everything the engine derives is memoized on the slice, which changes
  // only when an engine intent applies, and on the batch being presented.
  // What the human owes comes from `sidePending`, as the AI host's does.
  const derived = useMemo(() => {
    const decisionKey: DecisionKey = decisionKeyOf(slice);
    if (presentedState !== null) {
      const view = engine.view(presentedState, HUMAN);
      return { view, prompt: null, playing: null, decision: null, legal: [], decisionKey, unreplayable: false };
    }
    const pending = pendingEnginePrompt(battle, engine);
    const owed = sidePending(engine, slice, pending, HUMAN);
    const prompt: PendingEnginePrompt | null =
      owed.kind === "prompt"
        ? owed.prompt
        : owed.kind === "waiting" && owed.prompt !== null
          ? { ...promptView(owed.prompt.prompt, HUMAN, owed.prompt.display), id: owed.prompt.prompt.id }
          : null;
    const step = slice.inFlight?.step;
    const view = engine.view(pending?.display ?? slice.committed, HUMAN);
    const playing =
      step?.kind === "play" && view.instances[step.card]?.controller === HUMAN ? step.card : null;
    return {
      view,
      prompt,
      playing,
      decision: owed.kind === "topLevel" || owed.kind === "waiting" ? owed.decision : null,
      legal: owed.kind === "topLevel" ? owed.legal : [],
      decisionKey,
      unreplayable: owed.kind === "unreplayable",
    };
    // `battle` changes with every fold; the engine battle only with its slice.
  }, [engine, slice, presentedState]);
  // A step in flight that no longer replays to a prompt offers nothing until
  // the next intent clears it; it is logged once per attempt.
  const unreplayable = derived.unreplayable ? slice.inFlight : null;
  useEffect(() => {
    if (unreplayable === null) return;
    const { version } = slice.committed;
    logEventOnce(`battle_engine_step_unreplayable:${battleId}:${version}:${slice.attempt}`, "battle_engine_step_unreplayable", {
      battleId,
      version,
      attempt: slice.attempt,
      step: unreplayable.step,
      answers: unreplayable.answers.length,
    });
    // Logged once per in-flight attempt.
  }, [unreplayable]);

  // Each applied intent's events join the presentation queue; the prompt
  // after them shows once the queue is idle ("present, then ask").
  usePublishedEngineEvents(engine, slice, ({ events, batch, before, seq }) => {
    const view = engine.view(batch.state, HUMAN);
    const items = presentationItems(events, HUMAN, batch, before, (source) => {
      const instance = typeof source === "string" ? view.instances[source] : undefined;
      return instance === undefined ? null : cards(instance).displaySnapshot.name;
    });
    presentation.enqueue(items);
    if (items.length > 0) {
      logEvent("battle_engine_presentation_queued", {
        battleId,
        seq,
        batch: batch.key,
        items: items.map((item) => ({
          presentation: item.presentation,
          dwellMs: item.dwellMs,
          visual: item.visual?.kind ?? null,
          instance: item.visual !== null && "instance" in item.visual ? item.visual.instance : null,
        })),
      });
    }
  });
  // The battle log is rebuilt from the event log, so a reload or a debug
  // undo shows the entries of the fold's path. Its replay follows the fold
  // one intent per task, so opening the log only finishes it.
  const gameEvents = useGameEvents();
  const battleRef = useRef(battle);
  battleRef.current = battle;
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const warm = () => {
      timer = warmEngineBattleLog(engine, battleRef.current, gameEvents, HUMAN) ? setTimeout(warm, 0) : null;
    };
    timer = setTimeout(warm, 0);
    return () => {
      if (timer !== null) clearTimeout(timer);
    };
  }, [engine, gameEvents, slice]);
  const battleLog = useMemo(() => {
    if (!logOpen) return null;
    const started = performance.now();
    const log = engineBattleLog(engine, battle, gameEvents, HUMAN);
    return { log, ms: Math.round(performance.now() - started) };
    // `battle` changes with every applied event; the log only with the slice.
  }, [engine, gameEvents, logOpen, slice]);
  useEffect(() => {
    if (battleLog === null) return;
    const { log, ms } = battleLog;
    logEvent("battle_engine_log_built", {
      battleId,
      rebuilt: log !== null,
      startSeq: log?.startSeq ?? null,
      folded: log?.folded ?? null,
      entries: log?.entries.length ?? null,
      ms,
    });
  }, [battleId, battleLog]);
  const logTurns = useMemo(
    () =>
      battleLog?.log == null
        ? []
        : battleLogTurns(battleLog.log.entries, HUMAN, cards, (event) => dreamwell(event.card)?.name ?? null),
    [battleLog, cards, dreamwell],
  );
  const noticeView = useMemo(
    () =>
      presentation.notice === null
        ? null
        : { key: presentation.notice.key, ...engineBattleNoticeCopy(presentation.notice.notice) },
    [presentation.notice],
  );

  const board = useMemo(
    () =>
      buildEngineBattleScreenModel({
        battleId,
        human: HUMAN,
        view: derived.view,
        legal: derived.legal,
        prompt: derived.prompt,
        playing: derived.playing,
        decision: derived.decision,
        presented: head === null,
        notice: noticeView,
        cards,
        avatars,
        opponentName: init.enemyDescriptor.name,
        essenceReward: init.essenceReward,
        resultDismissed,
        visual: head?.visual == null ? null : { key: head.key, visual: head.visual },
        revealedCard:
          head?.visual?.kind === "reveal"
            ? (engine.view(head.visual.after, HUMAN).instances[head.visual.instance] ?? null)
            : null,
        dreamwellCard: (card) => {
          const definition = dreamwell(card);
          return definition === null ? null : dreamwellCardModel(definition);
        },
      }),
    [avatars, battleId, cards, derived, dreamwell, engine, head, init, noticeView, resultDismissed],
  );
  const emblemName = useCallback<EngineEmblemNamer>(
    (emblem, id) =>
      emblem === "avatar"
        ? (journeyContent.avatars.find((avatar) => avatar.id === id)?.name ?? null)
        : (journeyContent.dreamsignTemplates.find((dreamsign) => dreamsign.id === id)?.name ?? null),
    [journeyContent],
  );
  // An ability chooser the human opened is the prompt surface while it offers anything.
  const model = useMemo(
    () => withChooser(board, abilityChooser, cards, emblemName),
    [abilityChooser, board, cards, emblemName],
  );
  const { affordances } = model;
  const { surface } = model.prompt;
  const prompt = derived.prompt;
  const promptShown = model.prompt.host?.key ?? null;
  useEffect(() => {
    if (promptShown === null || prompt === null) return;
    logEventOnce(`battle_engine_prompt_shown:${battleId}:${prompt.id}`, "battle_engine_prompt_shown", {
      battleId,
      promptId: prompt.id,
      promptKind: prompt.kind,
      role: prompt.purpose.role,
      source: prompt.purpose.source,
      cardId: prompt.purpose.cardId,
      cancellable: prompt.cancellable,
      privateTo: prompt.privateTo ?? null,
    });
    // Logged once per prompt id, as the prompt host shows it.
  }, [promptShown]);
  const noticeKey = noticeView?.key ?? null;
  useEffect(() => {
    if (presentation.notice === null) return;
    logEventOnce(`battle_engine_notice_shown:${presentation.notice.key}`, "battle_engine_notice_shown", {
      battleId,
      key: presentation.notice.key,
      notice: presentation.notice.notice,
    });
    // Logged once per notice.
  }, [noticeKey]);

  const lastPassPress = useRef(Number.NEGATIVE_INFINITY);
  const openedRef = useRef(false);
  useEffect(() => {
    if (openedRef.current) return;
    openedRef.current = true;
    logEventOnce(`battle_engine_screen_opened:${battleId}`, "battle_engine_screen_opened", {
      battleId,
      layout: isDesktop ? "desktop" : "mobile",
      version: slice.committed.version,
    });
  }, [battleId, isDesktop, slice.committed.version]);

  const result = slice.committed.result;
  const committedRef = useRef(slice.committed);
  committedRef.current = slice.committed;
  useEffect(() => {
    if (result === null) return;
    const committed = committedRef.current;
    setDrag(null);
    setBrowsed(null);
    logEventOnce(`battle_engine_result_shown:${battleId}`, "battle_engine_result_shown", {
      battleId,
      result,
      playerScore: committed.sides.player.score,
      enemyScore: committed.sides.enemy.score,
      turnNumber: committed.turn.turnNumber,
    });
  }, [battleId, result]);

  // A chooser opened for one decision, or a drag the player may no longer
  // finish, closes when the fold moves on. Each reset runs only when there is
  // something to reset: a no-op state update would still re-render the board.
  const hasChooser = abilityChooser !== null;
  const hasDrag = drag !== null;
  useEffect(() => {
    if (hasChooser) setAbilityChooser(null);
    if (hasDrag && !affordances.canAct) setDrag(null);
    // Runs when the fold moves on, not when the chooser or drag opens.
  }, [affordances.canAct, slice]);

  const submitAction = useCallback(
    (action: Action, surface: string, ...parts: readonly string[]): void => {
      logEvent("battle_engine_intent_requested", {
        battleId,
        intent: "battleAction",
        action,
        decisionKey: derived.decisionKey,
        surface,
      });
      void actions.battleAction(
        HUMAN,
        action,
        undefined,
        engineIntentKey("engine-player", battleId, derived.decisionKey, ...parts),
      );
    },
    [actions, battleId, derived.decisionKey],
  );
  const submitAnswer = useCallback(
    (value: Answer | null, surface: string): void => {
      if (prompt === null || prompt.side !== HUMAN || value === null) return;
      logEvent("battle_engine_intent_requested", {
        battleId,
        intent: "answer",
        promptId: prompt.id,
        promptKind: prompt.kind,
        role: prompt.purpose.role,
        value,
        surface,
      });
      void actions.answerPrompt(
        HUMAN,
        prompt.id,
        value,
        undefined,
        engineIntentKey("engine-player", battleId, prompt.id),
      );
    },
    [actions, battleId, prompt],
  );
  const cancelPrompt = useCallback((): void => {
    if (prompt === null || prompt.side !== HUMAN || !prompt.cancellable) return;
    logEvent("battle_engine_intent_requested", {
      battleId,
      intent: "cancel",
      promptId: prompt.id,
      promptKind: prompt.kind,
      role: prompt.purpose.role,
      surface: "prompt-banner",
    });
    void actions.cancelPrompt(HUMAN, prompt.id);
  }, [actions, battleId, prompt]);

  const playHandCard = useCallback(
    (id: BattleCardId, target: MobileBattleSlotTarget | undefined, surface: string): void => {
      setDrag(null);
      const play = handPlayAction(model, HUMAN, id, target);
      if (play === null) {
        logEvent("battle_engine_play_refused", { battleId, card: id, surface, decisionKey: derived.decisionKey });
        return;
      }
      submitAction(play, surface);
    },
    [battleId, derived.decisionKey, model, submitAction],
  );

  const choose = (select: ChoiceSelection): void => {
    switch (select.kind) {
      case "answer":
        submitAnswer(select.answer, "choice-prompt");
        return;
      case "action":
        setAbilityChooser(null);
        submitAction(select.action, select.action.kind === "payToEnd" ? "pay-to-end-chooser" : "ability-chooser");
        return;
      case "browseVoid":
        setAbilityChooser(null);
        setBrowsed({ side: HUMAN, zone: "void" });
        return;
      case "close":
        setAbilityChooser(null);
        return;
    }
  };

  const repositionShortcut = useCallback(
    (plan: readonly Action[], shortcut: string): void => {
      plan.forEach((action, index) =>
        submitAction(action, shortcut, shortcut, String(index)),
      );
    },
    [submitAction],
  );

  const statusActionable = affordances.emblemActivations.length > 0 || affordances.statusPayToEnd.length > 0;
  const draggedCard = drag?.source === "battlefield" ? drag.id : null;
  const targetIds = surface.kind === "targets" ? surface.ids : NO_TARGETS;
  // The board's handlers keep one identity for the screen's life and run the
  // latest committed render's code, so the interactions below change only
  // with the values they carry and the board's memoized regions can skip.
  const handlers = useStableHandlers<BoardHandlers>({
    onHandCardActivate: (id) => playHandCard(id, undefined, "hand-tap"),
    onHandCardDrop: (target) => {
      if (drag?.source !== "near-hand") return;
      playHandCard(drag.id, target, "hand-drag");
    },
    onBattlefieldCardActivate: (id) => {
      if (surface.kind === "targets" && surface.ids.length > 0) {
        submitAnswer(surface.answer(id), "board-target");
        return;
      }
      // A payment to end an effect always opens the chooser, which names its price.
      const options = affordances.activations.get(id) ?? [];
      const payments = affordances.payToEnd.get(id) ?? [];
      if (options.length === 1 && payments.length === 0) submitAction(options[0], "battlefield-tap");
      else if (options.length + payments.length > 0) setAbilityChooser({ kind: "card", id });
    },
    onStatusActivate: (owner) => {
      if (owner === HUMAN && statusActionable) setAbilityChooser({ kind: "emblems" });
    },
    onCardDragStart: (id, source) => {
      if (affordances.canAct) setDrag({ id, source });
    },
    onCardDragEnd: () => setDrag(null),
    onSlotDrop: (target) => {
      setDrag(null);
      if (draggedCard === null) return;
      const move = repositionForDrop(model, draggedCard, target);
      if (move !== null) submitAction(move, "battlefield-drag");
    },
    onFigmentMerge: (source, target) => {
      setDrag(null);
      const move = repositionForDrop(model, source, target);
      if (move !== null) submitAction(move, "figment-merge");
    },
    onBattlefieldDropRejected: (rejection) => {
      logEvent("battle_engine_drop_rejected", { battleId, card: draggedCard, reason: rejection.reason });
    },
    onZoneDrop: () => setDrag(null),
    onZoneOpen: ({ owner, zone }) => {
      if (owner === HUMAN && zone === "void" && affordances.voidPlays.size > 0) setAbilityChooser({ kind: "void" });
      else if (zone !== "deck") setBrowsed({ side: owner, zone });
    },
    onNextPhase: () => {
      // A double click is one gesture: when the opponent answers within it,
      // its second press would otherwise pass the player's next window too.
      const now = performance.now();
      const repeated = now - lastPassPress.current < DOUBLE_TAP_WINDOW_MS;
      lastPassPress.current = now;
      if (repeated) {
        logEvent("battle_engine_pass_repeat_ignored", { battleId, decisionKey: derived.decisionKey });
        return;
      }
      if (affordances.pass !== null) submitAction(affordances.pass, "pass-control");
    },
    onPromptCancel: cancelPrompt,
    onPromptNumberSubmit: (value) => {
      if (surface.kind === "number") submitAnswer(surface.answer(value), "number-picker");
    },
    onPromptArrangeSubmit: (resolution) => {
      if (surface.kind === "arrange") submitAnswer(surface.answer(resolution), `${surface.editor}-editor`);
    },
    onPromptNoticeDismiss: presentation.dismissNotice,
    onBattleLogOpen: () => setLogOpen(true),
    onAllForward: () => repositionShortcut(affordances.allForward, "all-forward"),
    onAllBack: () => repositionShortcut(affordances.allBack, "all-back"),
    onRepeatLoop: (count) => {
      if (affordances.loop !== null) {
        submitAction({ kind: "repeatLoop", loop: affordances.loop.loop, count }, "loop-offer");
      }
    },
    onCardPickerSubmit: (ids) => {
      if (surface.kind === "picker") submitAnswer(surface.answer(ids), "card-picker");
    },
    onCardPickerSkip: () => {
      if (surface.kind === "picker") submitAnswer(surface.answer([]), "card-picker-skip");
    },
    onChoicePromptChoose: (index) => {
      const option = surfaceChoices(surface)?.options[index];
      if (option !== undefined) choose(option.select);
    },
    onResultAction: (action) => handleResultAction(action),
  });
  // A battlefield drag's destinations, recomputed only while one is under way.
  const dragTargets = useMemo(
    () =>
      draggedCard === null
        ? null
        : {
            eligibleSlotTargets: (affordances.repositions.get(draggedCard) ?? []).map((move) => move.target),
            sourceSlotTarget: sourceSlotOf(model.view, draggedCard),
            figmentMergeTargets: figmentMergeTargets(model, HUMAN, draggedCard, (figment) =>
              figment.printing.kind === "figment" && parseCardId(figment.printing.figment) === LEGIONNAIRE_FIGMENT_ID,
            ),
          },
    [affordances, draggedCard, model],
  );
  const canInteract = affordances.canAct && result === null;
  const targetSelectionCardId = derived.playing === null ? null : parseBattleCardId(derived.playing);
  const canPrompt = prompt !== null && prompt.side === HUMAN && result === null;
  const activatableStatusOwner = statusActionable ? HUMAN : null;
  const interactions = useMemo<MobileBattleInteractions>(
    () => ({
      canInteract,
      nearSide: HUMAN,
      pendingCardId: drag?.id ?? null,
      pendingCardSource: drag?.source ?? null,
      pendingCardOwner: drag === null ? null : HUMAN,
      ...dragTargets,
      targetSelectionCardId,
      canPrompt,
      targetSelectionPrompt: targetIds.length > 0 ? "legal-target" : null,
      targetableCardIds: targetIds,
      activatableStatusOwner,
      ...handlers,
    }),
    [activatableStatusOwner, canInteract, canPrompt, drag, dragTargets, handlers, targetIds, targetSelectionCardId],
  );

  function handleResultAction(action: MobileBattleResultAction): void {
    if (result === null) return;
    const won = result.kind === "victory" && result.winner === HUMAN;
    if (action === "continue" && won) {
      logEvent("battle_engine_reward_continued", { battleId, essenceReward: init.essenceReward });
      void actions.endBattle();
    } else if (action === "reset" && !won) {
      logEvent("battle_engine_defeat_continued", { battleId, result });
      void actions.endBattle();
    } else if (action === "reopen") {
      setResultDismissed(false);
    } else if (action === "dismiss") {
      setResultDismissed(true);
    }
  }

  const browsedCards =
    browsed === null
      ? []
      : model.engine.sides[browsed.side][browsed.zone].flatMap((id: InstanceId) => {
          const instance = model.engine.instances[id];
          return instance === undefined ? [] : [{ entryId: parseBattleCardId(id), model: cards(instance) }];
        });

  return (
    <>
      <MobileBattleScreen
        view={model.view}
        interactions={interactions}
        cardOverlay={model.cardOverlay}
        inspectorDefault="collapsed"
        inspectorVisibility="hidden"
        phaseNavigation={derived.view.stack.length > 0 ? "pass" : "next-phase"}
      />
      {browsed === null ? null : (
        <CardZoneBrowserOverlay<BattleCardId>
          owner={browsed.side === HUMAN ? "viewer" : "opponent"}
          zone={browsed.zone}
          cards={browsedCards}
          onClose={() => setBrowsed(null)}
        />
      )}
      {logOpen ? (
        <BattleEventLogOverlay
          title={ENGINE_BATTLE_LOG_COPY.title}
          subtitle={ENGINE_BATTLE_LOG_COPY.subtitle}
          closeLabel={ENGINE_BATTLE_LOG_COPY.close}
          emptyText={ENGINE_BATTLE_LOG_COPY.empty}
          turns={logTurns}
          onClose={() => setLogOpen(false)}
        />
      ) : null}
      {EngineDebugPanel !== null && PAGE_DEBUG_PANEL ? (
        <Suspense fallback={null}>
          <EngineDebugPanel engine={engine} battle={battle} battleId={battleId} />
        </Suspense>
      ) : null}
    </>
  );
}

function sourceSlotOf(view: MobileBattleView, id: BattleCardId): MobileBattleSlotTarget | null {
  for (const rank of ["back", "front"] as const) {
    const slot = (rank === "back" ? view.near.backRank : view.near.frontRank).find((cell) => cell.card?.id === id);
    if (slot !== undefined) return { owner: view.near.owner, rank, slotId: slot.id };
  }
  return null;
}

type Handler = (...args: never[]) => void;

/**
 * `handlers` with one identity for the component's life: each calls the
 * handler of the same name from the latest committed render, so it reads the
 * state of that render when it runs.
 */
function useStableHandlers<T extends Record<keyof T, Handler>>(handlers: T): T {
  const latest = useRef(handlers);
  useLayoutEffect(() => {
    latest.current = handlers;
  });
  return useMemo(() => {
    const stable: Record<string, Handler> = {};
    for (const key of Object.keys(latest.current)) {
      stable[key] = (...args: never[]) => (latest.current as Record<string, Handler>)[key](...args);
    }
    return stable as T;
  }, []);
}
