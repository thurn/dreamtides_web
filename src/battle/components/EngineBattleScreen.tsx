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

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MobileBattleResultAction } from "../../cumulus/screens/BattleResultSurface";
import { CardZoneBrowserOverlay } from "../../cumulus/screens/CardZoneBrowserOverlay";
import { BattleEventLogOverlay } from "../../cumulus/screens/battle-overlays/BattleEventLogOverlay";
import {
  MobileBattleScreen,
  type MobileBattleChoicePromptView,
  type MobileBattleInteractions,
  type MobileBattleSlotTarget,
  type MobileBattleView,
} from "../../cumulus/screens/MobileBattleScreen";
import { DOUBLE_TAP_WINDOW_MS } from "../../cumulus/primitives/pointer-gesture";
import { useIsDesktop } from "../../cumulus/primitives/use-is-desktop";
import type { Action, Answer, Engine, InstanceId, Side } from "../../engine";
import { promptView } from "../../engine";
import { logEvent, logEventOnce } from "../../logging";
import { pendingEnginePrompt } from "../../rules/battle/engine-battle";
import { journeyBattleOf } from "../../rules/battle/fold";
import { PAGE_DEBUG_PANEL, PAGE_ENEMY_POLICY } from "../../runtime/runtime-config";
import {
  ENGINE_ABILITY_CHOOSER_TITLE,
  ENGINE_BATTLE_LOG_COPY,
  engineAbilityOptionLabel,
  engineBattleNoticeCopy,
  type EngineAbilityOption,
} from "../../runtime/battle-prompt-messages";
import { battleLogEntries, battleLogTurns } from "../../screens/cumulus_adapters/engine-battle-log-view-model";
import { buildBattleAvatarStatus } from "../../screens/cumulus_adapters/mobile-battle-view-model";
import {
  buildEngineBattleScreenModel,
  figmentMergeTargets,
  handPlayAction,
  repositionForDrop,
  type EngineBattleScreenModel,
} from "../../screens/cumulus_adapters/engine-battle-view-model";
import {
  arrangeAnswer,
  numberAnswer,
  pickerAnswer,
  targetAnswer,
  type PendingEnginePrompt,
} from "../../screens/cumulus_adapters/prompt-host-view-model";
import { useActions, useGameState } from "../../session/hooks";
import { useJourney } from "../../state/journey-context";
import { parseCardId, type CardId } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import {
  parseBattleCardId,
  parseIntentKey,
  type AvatarId,
  type BattleCardId,
  type DreamsignId,
  type DreamwellCardId,
} from "../../types/identifiers";
import { useEngineAi } from "../engine-ai/use-engine-ai";
import { LEGIONNAIRE_FIGMENT_ID, lookupFigmentCatalogEntryById } from "../state/figment-catalog";
import { dreamwellCardModel } from "../ui/dreamwell-card-model";
import { createEngineCardModels, type EngineCardModels } from "../ui/engine-card-model";
import {
  battleLogStore,
  presentationItems,
  sliceKey,
  useBattleLog,
  usePresentationQueue,
  usePublishedEngineEvents,
} from "./battle-presentation";
import { resolveEnemyAvatarSummary } from "./enemy-avatar-summary";

/** The engine debug panel (`?debug=1`, D4); a production build compiles it out (P7). */
const EngineDebugPanel = import.meta.env.DEV ? lazy(() => import("./EngineDebugPanel")) : null;

/** The side the local player plays in a journey battle. */
const HUMAN: Side = "player";

type Drag = { readonly id: BattleCardId; readonly source: "near-hand" | "battlefield" };
type BrowsedZone = { readonly side: Side; readonly zone: "void" | "banished" };
/** A chooser the human opened: a character's abilities, the void's Reclaim plays, or the emblems' abilities. */
type Chooser = { readonly kind: "card"; readonly id: BattleCardId } | { readonly kind: "void" } | { readonly kind: "emblems" };
type ChooserOption = { readonly copy: EngineAbilityOption; readonly action: Action | "browseVoid" | null };

export function EngineBattleScreen({ engine }: { readonly engine: Engine }) {
  const battle = journeyBattleOf(useGameState().battle);
  const actions = useActions();
  const { cardDatabase, journeyContent } = useJourney();
  const isDesktop = useIsDesktop();
  useEngineAi(PAGE_ENEMY_POLICY);

  const [drag, setDrag] = useState<Drag | null>(null);
  const [abilityChooser, setAbilityChooser] = useState<Chooser | null>(null);
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
      definitions: [...init.playerDeckOrder, ...init.enemyDeckDefinition],
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
    const byId = new Map(init.dreamwellDeck.map((definition) => [definition.id, definition]));
    return (card: DreamwellCardId) => byId.get(card) ?? null;
  }, [init]);

  // The board shows the batch being presented while it is older than the
  // fold: the opponent's plays arrive one at a time.
  const head = presentation.head;
  const presentedState = head !== null && head.batch.key !== sliceKey(slice) ? head.batch.state : null;

  // Everything the engine derives is memoized on the slice, which changes
  // only when an engine intent applies, and on the batch being presented.
  const derived = useMemo(() => {
    if (presentedState !== null) {
      const view = engine.view(presentedState, HUMAN);
      return { view, prompt: null, playing: null, decision: null, legal: [], decisionKey: "" };
    }
    const pending = pendingEnginePrompt(battle, engine);
    const display = pending?.display ?? slice.committed;
    const decision = engine.decision(slice.committed);
    const canAct = slice.inFlight === null && decision?.side === HUMAN;
    const prompt: PendingEnginePrompt | null =
      pending === null
        ? null
        : pending.prompt.side === HUMAN
          ? pending.prompt
          : { ...promptView(pending.prompt, HUMAN, pending.display), id: pending.prompt.id };
    const step = slice.inFlight?.step;
    const view = engine.view(display, HUMAN);
    const playing =
      step?.kind === "play" && view.instances[step.card]?.controller === HUMAN ? step.card : null;
    return {
      view,
      prompt,
      playing,
      decision: slice.inFlight === null ? decision : null,
      legal: canAct ? engine.legalActions(slice.committed, HUMAN) : [],
      decisionKey: `${String(slice.committed.version)}:${String(slice.attempt)}:decision`,
    };
    // `battle` changes with every fold; the engine battle only with its slice.
  }, [engine, slice, presentedState]);

  // Each applied intent's events join the presentation queue; the prompt
  // after them shows once the queue is idle ("present, then ask").
  // Each batch also joins the battle log.
  usePublishedEngineEvents(engine, slice, ({ events, batch, before, seq }) => {
    const view = engine.view(batch.state, HUMAN);
    const items = presentationItems(events, HUMAN, batch, before, (source) => {
      const instance = typeof source === "string" ? view.instances[source] : undefined;
      return instance === undefined ? null : cards(instance).displaySnapshot.name;
    });
    presentation.enqueue(items);
    battleLogStore(battleId).append(
      battleLogEntries(events, HUMAN, batch.state, view, engine.view(before, HUMAN), `${battleId}:${String(seq)}`),
    );
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
  const logEntries = useBattleLog(battleId);
  const logTurns = useMemo(
    () => (logOpen ? battleLogTurns(logEntries, HUMAN, cards, (event) => dreamwell(event.card)?.name ?? null) : []),
    [cards, dreamwell, logEntries, logOpen],
  );
  const noticeView = useMemo(
    () =>
      presentation.notice === null
        ? null
        : { key: presentation.notice.key, ...engineBattleNoticeCopy(presentation.notice.notice) },
    [presentation.notice],
  );

  const model = useMemo(
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
  const { affordances, prompt: surface } = model;
  const prompt = derived.prompt;
  const promptShown = surface.host?.key ?? null;
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
    (action: Action, surface: string, key = derived.decisionKey): void => {
      logEvent("battle_engine_intent_requested", {
        battleId,
        intent: "battleAction",
        action,
        decisionKey: derived.decisionKey,
        surface,
      });
      void actions.battleAction(HUMAN, action, undefined, parseIntentKey(`engine-player:${battleId}:${key}`));
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
        parseIntentKey(`engine-player:${battleId}:${prompt.id}`),
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

  const chooserOptions = chooserOptionsFor(abilityChooser, affordances, model.engine, cards, (emblem, id) =>
    emblem === "avatar"
      ? (journeyContent.avatars.find((avatar) => avatar.id === id)?.name ?? null)
      : (journeyContent.dreamsignTemplates.find((dreamsign) => dreamsign.id === id)?.name ?? null),
  );
  const chooser: MobileBattleChoicePromptView | null =
    chooserOptions.length === 0
      ? null
      : {
          // A local chooser, not an engine prompt: no prompt id names it.
          key: 0,
          label: ENGINE_ABILITY_CHOOSER_TITLE,
          options: chooserOptions.map((option) => ({ label: engineAbilityOptionLabel(option.copy) })),
          canResolve: true,
        };

  const repositionShortcut = useCallback(
    (plan: readonly Action[], shortcut: string): void => {
      plan.forEach((action, index) =>
        submitAction(action, shortcut, `${derived.decisionKey}:${shortcut}:${String(index)}`),
      );
    },
    [derived.decisionKey, submitAction],
  );

  const draggedCard = drag?.source === "battlefield" ? drag.id : null;
  const interactions: MobileBattleInteractions = {
    canInteract: affordances.canAct && result === null,
    nearSide: HUMAN,
    pendingCardId: drag?.id ?? null,
    pendingCardSource: drag?.source ?? null,
    pendingCardOwner: drag === null ? null : HUMAN,
    ...(draggedCard === null
      ? {}
      : {
          eligibleSlotTargets: (affordances.repositions.get(draggedCard) ?? []).map((move) => move.target),
          sourceSlotTarget: sourceSlotOf(model.view, draggedCard),
          figmentMergeTargets: figmentMergeTargets(model, HUMAN, draggedCard, (figment) =>
            figment.printing.kind === "figment" && parseCardId(figment.printing.figment) === LEGIONNAIRE_FIGMENT_ID,
          ),
        }),
    targetSelectionCardId: derived.playing === null ? null : parseBattleCardId(derived.playing),
    canPrompt: prompt !== null && prompt.side === HUMAN && result === null,
    targetSelectionPrompt: surface.targetIds.length > 0 ? "legal-target" : null,
    targetableCardIds: surface.targetIds,
    onHandCardActivate: (id) => playHandCard(id, undefined, "hand-tap"),
    onHandCardDrop: (target) => {
      if (drag?.source !== "near-hand") return;
      playHandCard(drag.id, target, "hand-drag");
    },
    onBattlefieldCardActivate: (id) => {
      if (surface.targetIds.length > 0) {
        if (prompt !== null) submitAnswer(targetAnswer(prompt, model.engine, id), "board-target");
        return;
      }
      const options = affordances.activations.get(id) ?? [];
      if (options.length === 1) submitAction(options[0], "battlefield-tap");
      else if (options.length > 1) setAbilityChooser({ kind: "card", id });
    },
    activatableStatusOwner: affordances.emblemActivations.length > 0 ? HUMAN : null,
    onStatusActivate: (owner) => {
      if (owner === HUMAN && affordances.emblemActivations.length > 0) setAbilityChooser({ kind: "emblems" });
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
      if (prompt !== null) submitAnswer(numberAnswer(prompt, value), "number-picker");
    },
    onPromptArrangeSubmit: (resolution) => {
      const editor = surface.host?.arrange?.surface === "arrangement" ? "arrangement-editor" : "foresee-editor";
      if (prompt !== null) submitAnswer(arrangeAnswer(prompt, model.engine, resolution), editor);
    },
    onPromptNoticeDismiss: presentation.dismissNotice,
    onBattleLogOpen: () => {
      logEvent("battle_engine_log_opened", { battleId, entries: logEntries.length });
      setLogOpen(true);
    },
    onAllForward: () => repositionShortcut(affordances.allForward, "all-forward"),
    onAllBack: () => repositionShortcut(affordances.allBack, "all-back"),
    onRepeatLoop: (count) => {
      if (affordances.loop !== null) {
        submitAction({ kind: "repeatLoop", loop: affordances.loop.loop, count }, "loop-offer");
      }
    },
    onCardPickerSubmit: (ids) => {
      if (prompt !== null) submitAnswer(pickerAnswer(prompt, model.engine, ids), "card-picker");
    },
    onCardPickerSkip: () => {
      if (prompt !== null) submitAnswer(pickerAnswer(prompt, model.engine, []), "card-picker-skip");
    },
    onChoicePromptChoose: (index) => {
      if (chooser !== null) {
        const option = chooserOptions[index];
        setAbilityChooser(null);
        if (option?.action === "browseVoid") setBrowsed({ side: HUMAN, zone: "void" });
        else if (option !== undefined && option.action !== null) submitAction(option.action, "ability-chooser");
        return;
      }
      submitAnswer(surface.choiceAnswers[index] ?? null, "choice-prompt");
    },
    onResultAction: (action) => handleResultAction(action),
  };

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

  const view: MobileBattleView =
    chooser === null ? model.view : { ...model.view, choicePrompt: chooser };
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
        view={view}
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

/** The options of the chooser the human opened, each with the action it takes; empty when none is open. */
function chooserOptionsFor(
  chooser: Chooser | null,
  affordances: EngineBattleScreenModel["affordances"],
  view: EngineBattleScreenModel["engine"],
  cards: EngineCardModels,
  emblemName: (emblem: "avatar" | "dreamsign", id: AvatarId | DreamsignId) => string | null,
): ChooserOption[] {
  if (chooser === null) return [];
  const cancel: ChooserOption = { copy: { kind: "cancel" }, action: null };
  if (chooser.kind === "card") {
    const activations = affordances.activations.get(chooser.id) ?? [];
    if (activations.length === 0) return [];
    return [...activations.map((action, index): ChooserOption => ({ copy: { kind: "ability", index }, action })), cancel];
  }
  if (chooser.kind === "void") {
    const plays = [...affordances.voidPlays.values()].flatMap((action): ChooserOption[] => {
      const instance = view.instances[action.card];
      return instance === undefined
        ? []
        : [{ copy: { kind: "reclaim", name: cards(instance).displaySnapshot.name }, action }];
    });
    if (plays.length === 0) return [];
    return [...plays, { copy: { kind: "browseVoid" }, action: "browseVoid" }, cancel];
  }
  const options = affordances.emblemActivations.flatMap((action, _index, all): ChooserOption[] => {
    const source = action.source;
    if (typeof source === "string") return [];
    const siblings = all.filter((other) => JSON.stringify(other.source) === JSON.stringify(source));
    const side = view.sides[source.side];
    const id = source.kind === "avatar" ? side.avatar?.id : side.dreamsigns[source.index]?.id;
    return [
      {
        copy: {
          kind: "emblem",
          emblem: source.kind,
          name: id === undefined ? null : emblemName(source.kind, id),
          index: siblings.indexOf(action),
          count: siblings.length,
        },
        action,
      },
    ];
  });
  return options.length === 0 ? [] : [...options, cancel];
}

function sourceSlotOf(view: MobileBattleView, id: BattleCardId): MobileBattleSlotTarget | null {
  for (const rank of ["back", "front"] as const) {
    const slot = (rank === "back" ? view.near.backRank : view.near.frontRank).find((cell) => cell.card?.id === id);
    if (slot !== undefined) return { owner: view.near.owner, rank, slotId: slot.id };
  }
  return null;
}
