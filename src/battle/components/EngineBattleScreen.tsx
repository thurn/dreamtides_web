// The journey battle screen over the engine battle (Phase 4.2). It renders
// `engine.view` for the human through the existing battle screen, drives
// highlights and drop targets from the engine's legal actions, and writes
// the human's intents (`battleAction`, `answer`, `cancel`) through the
// session's action facade. The enemy is the AI host's (`useEngineAi`).
//
// Game flow lives in the fold: whether the human may act comes from the
// engine's pending decision and prompt, never from React state. Local state
// here is presentation only: the card being dragged, an ability chooser,
// an open zone browser, and a dismissed result.
//
// Every intent carries an intent key naming the decision or prompt it
// answers, so a second submission for the same decision (a drag and a tap,
// a double click) is applied at most once by the log. A stale intent
// bounces in the fold and the screen re-renders from the fold.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BattleForeseeEditor } from "../../cumulus/components/battle/BattleForeseeEditor";
import type { MobileBattleResultAction } from "../../cumulus/screens/BattleResultSurface";
import { CardZoneBrowserOverlay } from "../../cumulus/screens/CardZoneBrowserOverlay";
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
import { PAGE_ENEMY_POLICY } from "../../runtime/runtime-config";
import { enginePromptOptionLabel } from "../../runtime/battle-prompt-messages";
import { buildBattleAvatarStatus } from "../../screens/cumulus_adapters/mobile-battle-view-model";
import {
  buildEngineBattleScreenModel,
  figmentMergeTargets,
  handPlayAction,
  repositionForDrop,
} from "../../screens/cumulus_adapters/engine-battle-view-model";
import {
  foreseeAnswer,
  pickerAnswer,
  targetAnswer,
  type PendingEnginePrompt,
} from "../../screens/cumulus_adapters/engine-battle-prompt-view-model";
import { useActions, useGameState } from "../../session/hooks";
import { useJourney } from "../../state/journey-context";
import { parseCardId, type CardId } from "../../types/card-identity";
import type { CardData } from "../../types/cards";
import {
  parseBattleCardId,
  parseIntentKey,
  type BattleCardId,
} from "../../types/identifiers";
import { useEngineAi } from "../engine-ai/use-engine-ai";
import { LEGIONNAIRE_FIGMENT_ID, lookupFigmentCatalogEntryById } from "../state/figment-catalog";
import { createEngineCardModels } from "../ui/engine-card-model";
import { resolveEnemyAvatarSummary } from "./enemy-avatar-summary";

/** The side the local player plays in a journey battle. */
const HUMAN: Side = "player";

type Drag = { readonly id: BattleCardId; readonly source: "near-hand" | "battlefield" };
type BrowsedZone = { readonly side: Side; readonly zone: "void" | "banished" };

export function EngineBattleScreen({ engine }: { readonly engine: Engine }) {
  const battle = useGameState().battle;
  const actions = useActions();
  const { cardDatabase, journeyContent } = useJourney();
  const isDesktop = useIsDesktop();
  useEngineAi(PAGE_ENEMY_POLICY);

  const [drag, setDrag] = useState<Drag | null>(null);
  const [abilityChooser, setAbilityChooser] = useState<BattleCardId | null>(null);
  const [browsed, setBrowsed] = useState<BrowsedZone | null>(null);
  const [resultDismissed, setResultDismissed] = useState(false);

  const fold = battle?.engine;
  if (battle === null || fold === undefined) {
    throw new Error("EngineBattleScreen requires a journey battle with an engine battle");
  }
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

  // Everything the engine derives is memoized on the slice, which changes
  // only when an engine intent applies.
  const derived = useMemo(() => {
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
      legal: canAct ? engine.legalActions(slice.committed, HUMAN) : [],
      decisionKey: `${String(slice.committed.version)}:${String(slice.attempt)}:decision`,
    };
    // `battle` changes with every fold; the engine battle only with its slice.
  }, [engine, slice]);

  const model = useMemo(
    () =>
      buildEngineBattleScreenModel({
        battleId,
        human: HUMAN,
        view: derived.view,
        legal: derived.legal,
        prompt: derived.prompt,
        playing: derived.playing,
        cards,
        avatars,
        opponentName: init.enemyDescriptor.name,
        essenceReward: init.essenceReward,
        resultDismissed,
      }),
    [avatars, battleId, cards, derived, init, resultDismissed],
  );
  const { affordances, prompt: surface } = model;
  const prompt = derived.prompt;

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

  const activations = abilityChooser === null ? [] : (affordances.activations.get(abilityChooser) ?? []);
  const chooser: MobileBattleChoicePromptView | null =
    activations.length === 0
      ? null
      : {
          // A local chooser, not an engine prompt: no prompt id names it.
          key: 0,
          label: "Choose an ability",
          options: [
            ...activations.map((_activation, index) => ({
              label: enginePromptOptionLabel({ kind: "mode", index }),
            })),
            { label: "Cancel" },
          ],
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
    targetSelectionPrompt: surface.kind === "targets" ? "legal-target" : null,
    targetableCardIds: surface.kind === "targets" ? surface.targetIds : [],
    onHandCardActivate: (id) => playHandCard(id, undefined, "hand-tap"),
    onHandCardDrop: (target) => {
      if (drag?.source !== "near-hand") return;
      playHandCard(drag.id, target, "hand-drag");
    },
    onBattlefieldCardActivate: (id) => {
      if (surface.kind === "targets") {
        if (prompt !== null) submitAnswer(targetAnswer(prompt, model.engine, id), "board-target");
        return;
      }
      const options = affordances.activations.get(id) ?? [];
      if (options.length === 1) submitAction(options[0], "battlefield-tap");
      else if (options.length > 1) setAbilityChooser(id);
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
      if (zone !== "deck") setBrowsed({ side: owner, zone });
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
        const activation = activations[index];
        setAbilityChooser(null);
        if (activation !== undefined) submitAction(activation, "ability-chooser");
        return;
      }
      if (surface.kind === "choice") submitAnswer(surface.answers[index] ?? null, "choice-prompt");
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
        inspectorDefault="collapsed"
        inspectorVisibility="hidden"
        phaseNavigation={derived.view.stack.length > 0 ? "pass" : "next-phase"}
      />
      {surface.kind === "foresee" && prompt !== null ? (
        <BattleForeseeEditor
          key={prompt.id}
          model={surface.model}
          onConfirm={(resolution) =>
            submitAnswer(foreseeAnswer(prompt, model.engine, resolution), "foresee-editor")
          }
        />
      ) : null}
      {browsed === null ? null : (
        <CardZoneBrowserOverlay<BattleCardId>
          owner={browsed.side === HUMAN ? "viewer" : "opponent"}
          zone={browsed.zone}
          cards={browsedCards}
          onClose={() => setBrowsed(null)}
        />
      )}
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
