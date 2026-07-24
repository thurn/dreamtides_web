import { Reorder, motion, useDragControls } from "framer-motion";
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
} from "react";
import { GlowIcon } from "../components/controls/GlowIcon";
import { GlassButton } from "../components/controls/GlassButton";
import { IconButton } from "../components/controls/IconButton";
import { NumberStepper } from "../components/controls/NumberStepper";
import { Select } from "../components/controls/Select";
import { TextArea } from "../components/controls/TextArea";
import { TextField } from "../components/controls/TextField";
import { DeveloperRail } from "../components/overlay/DeveloperRail";
import { GlassDialog } from "../components/overlay/GlassDialog";
import { Pressable } from "../primitives/Pressable";
import { GLYPHS } from "../primitives/glyph";
import { token } from "../primitives/tokens";
import type {
  TutorialAction,
  TutorialActionName,
  TutorialDreamcallerOwner,
  TutorialEditorSaveStatus,
  TutorialHowToPlayCompanion,
  TutorialHowToPlayTrigger,
  TutorialSpeechBubbleSpeaker,
} from "../../types/tutorial";
import { isCardId } from "../../types/card-identity";
import {
  TUTORIAL_DREAMWELL_CARD_ID,
  TUTORIAL_OPPONENT_CARD_ID,
  TUTORIAL_PLAYER_CARD_ID,
} from "../../data/tutorial-opponent-card";

export interface TutorialEditorRailProps {
  readonly actions: readonly TutorialAction[];
  readonly saveStatus: TutorialEditorSaveStatus;
  readonly saveError: string | null;
  readonly onActionsChange: (
    actions: readonly TutorialAction[],
    persist: boolean,
  ) => void;
  readonly onReplay: () => void;
  readonly onPlayFromAction: (actionId: string) => void;
  readonly onClose: () => void;
}

const TUTORIAL_TAIL_ACTION_COUNT = 5;
const DEFAULT_HOW_TO_PLAY_TEXT =
  "Play characters and [yellow]challenge[/yellow] with them to score points (⍟) equal to their spark (✦).\n\nScore 10 ⍟ to win this dream battle.";

const ACTION_OPTIONS = [
  { value: "display-speech-bubble", label: "Display Speech Bubble" },
  { value: "display-how-to-play", label: "Display How to Play" },
  {
    value: "animate-dreamcaller-portrait",
    label: "Animate Dreamcaller Portrait",
  },
  { value: "draw-opponent-card", label: "Draw Opponent Card" },
  {
    value: "reveal-and-play-opponent-card",
    label: "Reveal & Play Opponent Card",
  },
  {
    value: "reposition-opponent-character",
    label: "Reposition Opponent Character",
  },
  {
    value: "reposition-player-character",
    label: "Reposition Player Character",
  },
  { value: "draw-dreamwell-card", label: "Draw Dreamwell Card" },
  { value: "end-turn", label: "End Turn" },
] satisfies readonly { value: TutorialActionName; label: string }[];

const DREAMCALLER_OWNER_OPTIONS = [
  { value: "player", label: "Player" },
  { value: "enemy", label: "Opponent" },
] satisfies readonly { value: TutorialDreamcallerOwner; label: string }[];

const SPEECH_BUBBLE_SPEAKER_OPTIONS = [
  { value: "mira", label: "Mira" },
  { value: "player", label: "Player Dreamcaller" },
  { value: "enemy", label: "Opposing Dreamcaller" },
] satisfies readonly { value: TutorialSpeechBubbleSpeaker; label: string }[];

const HOW_TO_PLAY_TRIGGER_OPTIONS = [
  { value: "immediate", label: "Immediately" },
  {
    value: "player-turn-announcement-complete",
    label: "After Player Turn Announcement",
  },
  {
    value: "enemy-turn-announcement-complete",
    label: "After Opponent Turn Announcement",
  },
] satisfies readonly { value: TutorialHowToPlayTrigger; label: string }[];

const HOW_TO_PLAY_COMPANION_OPTIONS = [
  { value: "none", label: "No Companion" },
  { value: "dreamwell-card", label: "Current Dreamwell Card" },
] satisfies readonly {
  value: TutorialHowToPlayCompanion | "none";
  label: string;
}[];

function nextActionId(
  actionName: TutorialActionName,
  actions: readonly TutorialAction[],
): string {
  const ids = new Set(actions.map((action) => action.id));
  if (!ids.has(actionName)) return actionName;
  let suffix = 2;
  while (ids.has(`${actionName}-${String(suffix)}`)) suffix += 1;
  return `${actionName}-${String(suffix)}`;
}

function defaultAction(
  actionName: TutorialActionName,
  actions: readonly TutorialAction[],
): TutorialAction {
  const id = nextActionId(actionName, actions);
  if (actionName === "display-speech-bubble") {
    return {
      id,
      action: "display-speech-bubble",
      speaker: "mira",
      verticalOffset: 0,
      text: "New tutorial message.",
      wait: 3,
    };
  }
  if (actionName === "display-how-to-play") {
    return {
      id,
      action: "display-how-to-play",
      trigger: "immediate",
      text: DEFAULT_HOW_TO_PLAY_TEXT,
      wait: 0,
    };
  }
  if (actionName === "animate-dreamcaller-portrait") {
    return {
      id,
      action: "animate-dreamcaller-portrait",
      owner: "player",
      pause: 1,
      duration: 0.6,
      wait: 0,
    };
  }
  if (actionName === "reveal-and-play-opponent-card") {
    return {
      id,
      action: "reveal-and-play-opponent-card",
      revealDuration: 2,
      wait: 0,
    };
  }
  if (actionName === "draw-dreamwell-card") {
    return {
      id,
      action: "draw-dreamwell-card",
      owner: "enemy",
      cardId: TUTORIAL_DREAMWELL_CARD_ID,
      wait: 0,
    };
  }
  if (actionName === "reposition-opponent-character") {
    return {
      id,
      action: "reposition-opponent-character",
      cardId: TUTORIAL_OPPONENT_CARD_ID,
      wait: 0,
    };
  }
  if (actionName === "reposition-player-character") {
    return {
      id,
      action: "reposition-player-character",
      cardId: TUTORIAL_PLAYER_CARD_ID,
      opposingCardId: TUTORIAL_OPPONENT_CARD_ID,
      wait: 0,
    };
  }
  if (actionName === "end-turn") {
    return { id, action: "end-turn", wait: 0 };
  }
  return { id, action: "draw-opponent-card", wait: 0 };
}

function changedActionType(
  action: TutorialAction,
  actionName: TutorialActionName,
): TutorialAction {
  if (actionName === "display-speech-bubble") {
    return {
      id: action.id,
      action: actionName,
      speaker:
        action.action === "display-speech-bubble"
          ? (action.speaker ?? "mira")
          : "mira",
      verticalOffset:
        action.action === "display-speech-bubble"
          ? (action.verticalOffset ?? 0)
          : 0,
      text:
        action.action === "display-speech-bubble"
          ? action.text
          : "New tutorial message.",
      wait: action.wait,
    };
  }
  if (actionName === "display-how-to-play") {
    return {
      id: action.id,
      action: actionName,
      text:
        action.action === "display-how-to-play"
          ? action.text
          : DEFAULT_HOW_TO_PLAY_TEXT,
      trigger:
        action.action === "display-how-to-play"
          ? (action.trigger ?? "player-turn-announcement-complete")
          : "immediate",
      ...(action.action === "display-how-to-play" &&
      action.companion !== undefined
        ? { companion: action.companion }
        : {}),
      wait: action.wait,
    };
  }
  if (actionName === "draw-opponent-card") {
    return { id: action.id, action: actionName, wait: action.wait };
  }
  if (actionName === "reposition-opponent-character") {
    return {
      id: action.id,
      action: actionName,
      cardId:
        action.action === "reposition-opponent-character"
          ? action.cardId
          : TUTORIAL_OPPONENT_CARD_ID,
      wait: action.wait,
    };
  }
  if (actionName === "reposition-player-character") {
    return {
      id: action.id,
      action: actionName,
      cardId:
        action.action === "reposition-player-character"
          ? action.cardId
          : TUTORIAL_PLAYER_CARD_ID,
      opposingCardId:
        action.action === "reposition-player-character"
          ? action.opposingCardId
          : TUTORIAL_OPPONENT_CARD_ID,
      wait: action.wait,
    };
  }
  if (actionName === "end-turn") {
    return { id: action.id, action: actionName, wait: action.wait };
  }
  if (actionName === "reveal-and-play-opponent-card") {
    return {
      id: action.id,
      action: actionName,
      revealDuration:
        action.action === "reveal-and-play-opponent-card"
          ? action.revealDuration
          : 2,
      wait: action.wait,
    };
  }
  if (actionName === "draw-dreamwell-card") {
    return {
      id: action.id,
      action: actionName,
      owner:
        action.action === "draw-dreamwell-card" ? action.owner : "enemy",
      cardId:
        action.action === "draw-dreamwell-card"
          ? action.cardId
          : TUTORIAL_DREAMWELL_CARD_ID,
      wait: action.wait,
    };
  }
  return {
    id: action.id,
    action: actionName,
    owner:
      action.action === "animate-dreamcaller-portrait"
        ? action.owner
        : "player",
    pause: action.action === "animate-dreamcaller-portrait" ? action.pause : 1,
    duration:
      action.action === "animate-dreamcaller-portrait" ? action.duration : 0.6,
    wait: action.wait,
  };
}

function reorderedActions(
  actions: readonly TutorialAction[],
  orderedIds: readonly string[],
): readonly TutorialAction[] {
  const byId = new Map(actions.map((action) => [action.id, action]));
  return orderedIds.flatMap((id) => {
    const action = byId.get(id);
    return action === undefined ? [] : [action];
  });
}

function withAction(
  actions: readonly TutorialAction[],
  nextAction: TutorialAction,
): readonly TutorialAction[] {
  return actions.map((action) =>
    action.id === nextAction.id ? nextAction : action,
  );
}

function waitLabel(wait: number): string {
  return Number.isInteger(wait) ? String(wait) : wait.toFixed(1);
}

function TutorialActionRow({
  action,
  index,
  actions,
  onActionsChange,
  onPlayFromAction,
}: {
  readonly action: TutorialAction;
  readonly index: number;
  readonly actions: readonly TutorialAction[];
  readonly onActionsChange: TutorialEditorRailProps["onActionsChange"];
  readonly onPlayFromAction: TutorialEditorRailProps["onPlayFromAction"];
}): ReactElement {
  const controls = useDragControls();
  const update = (nextAction: TutorialAction, persist: boolean): void =>
    onActionsChange(withAction(actions, nextAction), persist);
  const move = (from: number, to: number): void => {
    const next = [...actions];
    const [moved] = next.splice(from, 1);
    if (moved === undefined) return;
    next.splice(to, 0, moved);
    onActionsChange(next, true);
  };

  return (
    <Reorder.Item
      as="li"
      value={action.id}
      dragListener={false}
      dragControls={controls}
      onDragEnd={() => onActionsChange(actions, true)}
      data-tutorial-action-id={action.id}
      style={{ listStyle: "none" }}
    >
      <article
        style={{
          display: "grid",
          gap: token("--space-4"),
          padding: token("--space-4"),
          border: `1px solid ${token("--border-strong")}`,
          borderRadius: token("--radius-control"),
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "auto minmax(0, 1fr) auto auto",
            alignItems: "center",
            gap: token("--space-2"),
          }}
        >
          <Pressable
            as="button"
            aria-label={`Drag action ${String(index + 1)}`}
            onPointerDown={(event: PointerEvent<HTMLButtonElement>) =>
              controls.start(event)
            }
            onKeyDown={(event: KeyboardEvent<HTMLButtonElement>) => {
              if (event.key === "ArrowUp" && index > 0) {
                event.preventDefault();
                move(index, index - 1);
              }
              if (event.key === "ArrowDown" && index < actions.length - 1) {
                event.preventDefault();
                move(index, index + 1);
              }
            }}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: token("--touch-min"),
              height: token("--touch-min"),
              padding: 0,
              border: "none",
              background: "transparent",
              color: token("--text-on-glass-muted"),
              cursor: "grab",
              touchAction: "none",
            }}
          >
            <GlowIcon
              iconClass={GLYPHS.dragHandle}
              color="text-secondary"
              size="1.4em"
            />
          </Pressable>
          <div style={{ minWidth: 0 }}>
            <Select
              full
              size="sm"
              ariaLabel={`Action ${String(index + 1)} type`}
              options={[...ACTION_OPTIONS]}
              value={action.action}
              onChange={(value) => {
                if (
                  value !== "display-speech-bubble" &&
                  value !== "display-how-to-play" &&
                  value !== "animate-dreamcaller-portrait" &&
                  value !== "draw-opponent-card" &&
                  value !== "reveal-and-play-opponent-card" &&
                  value !== "reposition-opponent-character" &&
                  value !== "reposition-player-character" &&
                  value !== "draw-dreamwell-card" &&
                  value !== "end-turn"
                ) {
                  return;
                }
                update(changedActionType(action, value), true);
              }}
            />
          </div>
          <IconButton
            glyph={GLYPHS.play}
            size="sm"
            placement="onGlass"
            label={`Play tutorial from action ${String(index + 1)}`}
            testId={`tutorial-action-play-${action.id}`}
            onPress={() => onPlayFromAction(action.id)}
          />
          <IconButton
            glyph={GLYPHS.trash}
            size="sm"
            placement="onGlass"
            label={`Delete action ${String(index + 1)}`}
            onPress={() =>
              onActionsChange(
                actions.filter((candidate) => candidate.id !== action.id),
                true,
              )
            }
          />
        </div>

        {action.action === "display-speech-bubble" ? (
          <>
            <Select
              full
              size="sm"
              ariaLabel={`Speech bubble speaker for action ${String(index + 1)}`}
              options={[...SPEECH_BUBBLE_SPEAKER_OPTIONS]}
              value={action.speaker ?? "mira"}
              onChange={(speaker) => {
                if (
                  speaker !== "mira" &&
                  speaker !== "player" &&
                  speaker !== "enemy"
                ) {
                  return;
                }
                update({ ...action, speaker }, true);
              }}
            />
            <TextArea
              label="Text"
              value={action.text}
              error={
                action.text.trim().length === 0
                  ? "Text cannot be blank."
                  : undefined
              }
              testId={`tutorial-action-text-${action.id}`}
              onChange={(text) => update({ ...action, text }, false)}
              onCommit={(text) => update({ ...action, text }, true)}
            />
            {(action.speaker ?? "mira") === "mira" ? (
              <NumberStepper
                label="Vertical Offset"
                value={action.verticalOffset ?? 0}
                displayValue={`${waitLabel(action.verticalOffset ?? 0)}px`}
                size="sm"
                decrementLabel={`Move Mira speech up for action ${String(index + 1)}`}
                incrementLabel={`Move Mira speech down for action ${String(index + 1)}`}
                onDecrement={() =>
                  update(
                    {
                      ...action,
                      verticalOffset: (action.verticalOffset ?? 0) - 10,
                    },
                    true,
                  )
                }
                onIncrement={() =>
                  update(
                    {
                      ...action,
                      verticalOffset: (action.verticalOffset ?? 0) + 10,
                    },
                    true,
                  )
                }
              />
            ) : null}
          </>
        ) : null}

        {action.action === "display-how-to-play" ? (
          <>
            <Select
              full
              size="sm"
              ariaLabel={`How to Play trigger for action ${String(index + 1)}`}
              options={[...HOW_TO_PLAY_TRIGGER_OPTIONS]}
              value={action.trigger ?? "player-turn-announcement-complete"}
              onChange={(trigger) => {
                if (
                  trigger !== "immediate" &&
                  trigger !== "player-turn-announcement-complete" &&
                  trigger !== "enemy-turn-announcement-complete"
                ) {
                  return;
                }
                update({ ...action, trigger }, true);
              }}
            />
            <Select
              full
              size="sm"
              ariaLabel={`How to Play companion for action ${String(index + 1)}`}
              options={[...HOW_TO_PLAY_COMPANION_OPTIONS]}
              value={action.companion ?? "none"}
              onChange={(companion) => {
                if (companion === "dreamwell-card") {
                  update({ ...action, companion }, true);
                  return;
                }
                if (companion !== "none") return;
                update(
                  {
                    id: action.id,
                    action: action.action,
                    trigger: action.trigger,
                    text: action.text,
                    wait: action.wait,
                  },
                  true,
                );
              }}
            />
            <TextArea
              label="Instruction Text"
              value={action.text}
              supportingText="Use a blank line between paragraphs. [yellow]copy[/yellow] highlights an exact run; ⍟ renders points; ✦ renders spark."
              error={
                action.text.trim().length === 0
                  ? "Text cannot be blank."
                  : undefined
              }
              testId={`tutorial-action-text-${action.id}`}
              onChange={(text) => update({ ...action, text }, false)}
              onCommit={(text) => update({ ...action, text }, true)}
            />
          </>
        ) : null}

        {action.action === "animate-dreamcaller-portrait" ? (
          <>
            <Select
              full
              size="sm"
              ariaLabel={`Dreamcaller owner for action ${String(index + 1)}`}
              options={[...DREAMCALLER_OWNER_OPTIONS]}
              value={action.owner}
              onChange={(owner) => {
                if (owner !== "player" && owner !== "enemy") return;
                update({ ...action, owner }, true);
              }}
            />
            <NumberStepper
              label="Large Portrait Pause"
              value={action.pause}
              displayValue={`${waitLabel(action.pause)}s`}
              size="sm"
              decrementLabel={`Decrease large portrait pause for action ${String(index + 1)}`}
              incrementLabel={`Increase large portrait pause for action ${String(index + 1)}`}
              decrementDisabled={action.pause <= 0}
              onDecrement={() =>
                update(
                  {
                    ...action,
                    pause: Math.max(
                      0,
                      Math.round((action.pause - 0.5) * 10) / 10,
                    ),
                  },
                  true,
                )
              }
              onIncrement={() =>
                update(
                  {
                    ...action,
                    pause: Math.round((action.pause + 0.5) * 10) / 10,
                  },
                  true,
                )
              }
            />
            <NumberStepper
              label="Scale & Travel Duration"
              value={action.duration}
              displayValue={`${waitLabel(action.duration)}s`}
              size="sm"
              decrementLabel={`Decrease scale and travel duration for action ${String(index + 1)}`}
              incrementLabel={`Increase scale and travel duration for action ${String(index + 1)}`}
              decrementDisabled={action.duration <= 0}
              onDecrement={() =>
                update(
                  {
                    ...action,
                    duration: Math.max(
                      0,
                      Math.round((action.duration - 0.1) * 10) / 10,
                    ),
                  },
                  true,
                )
              }
              onIncrement={() =>
                update(
                  {
                    ...action,
                    duration: Math.round((action.duration + 0.1) * 10) / 10,
                  },
                  true,
                )
              }
            />
          </>
        ) : null}

        {action.action === "reveal-and-play-opponent-card" ? (
          <NumberStepper
            label="Face-Up Reading Time"
            value={action.revealDuration}
            displayValue={`${waitLabel(action.revealDuration)}s`}
            size="sm"
            decrementLabel={`Decrease face-up reading time for action ${String(index + 1)}`}
            incrementLabel={`Increase face-up reading time for action ${String(index + 1)}`}
            decrementDisabled={action.revealDuration <= 0}
            onDecrement={() =>
              update(
                {
                  ...action,
                  revealDuration: Math.max(
                    0,
                    Math.round((action.revealDuration - 0.5) * 10) / 10,
                  ),
                },
                true,
              )
            }
            onIncrement={() =>
              update(
                {
                  ...action,
                  revealDuration:
                    Math.round((action.revealDuration + 0.5) * 10) / 10,
                },
                true,
              )
            }
          />
        ) : null}

        {action.action === "draw-dreamwell-card" ? (
          <>
            <Select
              full
              size="sm"
              ariaLabel={`Dreamwell owner for action ${String(index + 1)}`}
              options={[...DREAMCALLER_OWNER_OPTIONS]}
              value={action.owner}
              onChange={(owner) => {
                if (owner !== "player" && owner !== "enemy") return;
                update({ ...action, owner }, true);
              }}
            />
            <TextField
              label="Dreamwell Card UUID"
              value={action.cardId}
              error={
                isCardId(action.cardId)
                  ? undefined
                  : "Enter a Dreamwell card UUID."
              }
              testId={`tutorial-action-card-id-${action.id}`}
              onChange={(cardId) =>
                update({ ...action, cardId }, isCardId(cardId))
              }
            />
          </>
        ) : null}

        {action.action === "reposition-opponent-character" ? (
          <TextField
            label="Opponent Character UUID"
            value={action.cardId}
            error={
              isCardId(action.cardId)
                ? undefined
                : "Enter an opponent character UUID."
            }
            testId={`tutorial-action-card-id-${action.id}`}
            onChange={(cardId) =>
              update({ ...action, cardId }, isCardId(cardId))
            }
          />
        ) : null}

        {action.action === "reposition-player-character" ? (
          <>
            <TextField
              label="Player Character UUID"
              value={action.cardId}
              error={
                isCardId(action.cardId)
                  ? undefined
                  : "Enter a player character UUID."
              }
              testId={`tutorial-action-card-id-${action.id}`}
              onChange={(cardId) =>
                update({ ...action, cardId }, isCardId(cardId))
              }
            />
            <TextField
              label="Opposing Character UUID"
              value={action.opposingCardId}
              error={
                isCardId(action.opposingCardId)
                  ? undefined
                  : "Enter an opposing character UUID."
              }
              testId={`tutorial-action-opposing-card-id-${action.id}`}
              onChange={(opposingCardId) =>
                update(
                  { ...action, opposingCardId },
                  isCardId(opposingCardId),
                )
              }
            />
          </>
        ) : null}

        <NumberStepper
          label="Wait"
          value={action.wait}
          displayValue={`${waitLabel(action.wait)}s`}
          size="sm"
          decrementLabel={`Decrease wait for action ${String(index + 1)}`}
          incrementLabel={`Increase wait for action ${String(index + 1)}`}
          decrementDisabled={action.wait <= 0}
          onDecrement={() =>
            update(
              {
                ...action,
                wait: Math.max(0, Math.round((action.wait - 0.5) * 10) / 10),
              },
              true,
            )
          }
          onIncrement={() =>
            update(
              { ...action, wait: Math.round((action.wait + 0.5) * 10) / 10 },
              true,
            )
          }
        />
      </article>
    </Reorder.Item>
  );
}

function SaveStatus({
  status,
  error,
}: {
  readonly status: TutorialEditorSaveStatus;
  readonly error: string | null;
}): ReactElement | null {
  if (status === "idle") return null;
  const label =
    status === "saving"
      ? "Saving tutorial"
      : status === "saved"
        ? "Tutorial saved"
        : status === "error"
          ? `Tutorial save failed${error === null ? "" : `: ${error}`}`
          : "Tutorial changes are saved";
  const glyph =
    status === "error"
      ? GLYPHS.warning
      : status === "saved"
        ? GLYPHS.check
        : GLYPHS.save;
  return (
    <motion.span
      role="status"
      aria-label={label}
      title={label}
      animate={
        status === "saving" ? { opacity: [0.4, 1, 0.4] } : { opacity: 1 }
      }
      transition={
        status === "saving" ? { repeat: Infinity, duration: 1.2 } : undefined
      }
      style={{ display: "inline-flex" }}
    >
      <GlowIcon
        iconClass={glyph}
        color={status === "error" ? "danger" : "text-secondary"}
        size="1.25em"
      />
    </motion.span>
  );
}

function TutorialEditorContent({
  actions,
  onActionsChange,
  onReplay,
  onPlayFromAction,
}: Pick<
  TutorialEditorRailProps,
  "actions" | "onActionsChange" | "onReplay" | "onPlayFromAction"
>): ReactElement {
  const tailStartAction =
    actions[Math.max(0, actions.length - TUTORIAL_TAIL_ACTION_COUNT)];
  const tailActionCount = Math.min(TUTORIAL_TAIL_ACTION_COUNT, actions.length);
  return (
    <div style={{ display: "grid", gap: token("--space-5") }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: token("--space-3"),
        }}
      >
        <GlassButton
          glyph={GLYPHS.play}
          label="Replay All"
          placement="onGlass"
          disabled={actions.length === 0}
          testId="tutorial-editor-replay-all"
          onPress={onReplay}
        />
        <GlassButton
          glyph={GLYPHS.play}
          label={`Replay Last ${String(tailActionCount)}`}
          placement="onGlass"
          variant="accent"
          disabled={tailStartAction === undefined}
          testId="tutorial-editor-replay-tail"
          onPress={() => {
            if (tailStartAction !== undefined) {
              onPlayFromAction(tailStartAction.id);
            }
          }}
        />
      </div>
      <Reorder.Group
        as="ol"
        axis="y"
        values={actions.map((action) => action.id)}
        onReorder={(orderedIds: string[]) => {
          const next = reorderedActions(actions, orderedIds);
          onActionsChange(next, false);
        }}
        style={{
          display: "grid",
          gap: token("--space-4"),
          margin: 0,
          padding: 0,
        }}
      >
        {actions.map((action, index) => (
          <TutorialActionRow
            key={action.id}
            action={action}
            index={index}
            actions={actions}
            onActionsChange={onActionsChange}
            onPlayFromAction={onPlayFromAction}
          />
        ))}
      </Reorder.Group>
      <Select
        full
        ariaLabel="Add an action"
        placeholder="Add an Action"
        options={[...ACTION_OPTIONS]}
        value=""
        onChange={(value) => {
          if (
            value !== "display-speech-bubble" &&
            value !== "display-how-to-play" &&
            value !== "animate-dreamcaller-portrait" &&
            value !== "draw-opponent-card" &&
            value !== "reveal-and-play-opponent-card" &&
            value !== "reposition-opponent-character" &&
            value !== "reposition-player-character" &&
            value !== "draw-dreamwell-card" &&
            value !== "end-turn"
          ) {
            return;
          }
          onActionsChange([...actions, defaultAction(value, actions)], true);
        }}
      />
    </div>
  );
}

function TutorialEditorSaveFooter({
  saveStatus,
  saveError,
}: Pick<TutorialEditorRailProps, "saveStatus" | "saveError">): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        minHeight: token("--touch-min"),
        paddingInline: token("--space-5"),
        borderTop: `1px solid ${token("--border-strong")}`,
      }}
    >
      <SaveStatus status={saveStatus} error={saveError} />
    </div>
  );
}

/** Draggable, autosaving action list for the local Tutorial Editor. */
export function TutorialEditorRail({
  actions,
  saveStatus,
  saveError,
  onActionsChange,
  onReplay,
  onPlayFromAction,
  onClose,
}: TutorialEditorRailProps): ReactElement {
  return (
    <DeveloperRail
      id="cumulus-tutorial-editor"
      side="left"
      title="Tutorial Editor"
      subtitle={`${String(actions.length)} ${actions.length === 1 ? "action" : "actions"}`}
      onClose={onClose}
      footer={
        <TutorialEditorSaveFooter
          saveStatus={saveStatus}
          saveError={saveError}
        />
      }
    >
      <TutorialEditorContent
        actions={actions}
        onActionsChange={onActionsChange}
        onReplay={onReplay}
        onPlayFromAction={onPlayFromAction}
      />
    </DeveloperRail>
  );
}

/** Full-screen Tutorial Editor used below the docked-rail breakpoint. */
export function TutorialEditorTakeover({
  actions,
  saveStatus,
  saveError,
  onActionsChange,
  onReplay,
  onPlayFromAction,
  onClose,
}: TutorialEditorRailProps): ReactElement {
  return (
    <GlassDialog
      title="Tutorial Editor"
      subtitle={`Developer Tools · ${String(actions.length)} ${actions.length === 1 ? "action" : "actions"}`}
      closeLabel="Close tutorial editor"
      cutoutAwareClose
      fullScreen
      onClose={onClose}
    >
      <div
        id="cumulus-tutorial-editor"
        data-tutorial-editor="takeover"
        style={{
          display: "grid",
          gap: token("--space-5"),
          width: "100%",
          maxWidth: 720,
          marginInline: "auto",
        }}
      >
        <TutorialEditorContent
          actions={actions}
          onActionsChange={onActionsChange}
          onReplay={onReplay}
          onPlayFromAction={onPlayFromAction}
        />
        <TutorialEditorSaveFooter
          saveStatus={saveStatus}
          saveError={saveError}
        />
      </div>
    </GlassDialog>
  );
}
