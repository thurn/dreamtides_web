import { assertLocalized, type LocalizedString } from "@trox/runtime";
import { Reorder, motion, useDragControls } from "framer-motion";
import {
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
} from "react";
import { StandaloneGlyph } from "../components/controls/StandaloneGlyph";
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
  TutorialDreamAvatarOwner,
  TutorialEditorSaveStatus,
  TutorialHowToPlayCompanion,
  TutorialHowToPlayTrigger,
  TutorialSpeechBubble,
  TutorialSpeechBubbleSpeaker,
  TutorialCardConstants,
} from "../../types/tutorial";
import { isCardId } from "../../types/card-identity";
import { useLocalizer } from "../../runtime/localization/use-localizer";
import { asTutorialActionId } from "../../types/identifiers";
import { asCardId } from "../../types/card-identity";
import type { TutorialActionId } from "../../types/identifiers";
import { asDreamwellCardId } from "../../types/identifiers";

export interface TutorialEditorRailProps {
  readonly actions: readonly TutorialAction[];
  readonly saveStatus: TutorialEditorSaveStatus;
  readonly saveError: LocalizedString | null;
  readonly tutorialCardConstants: TutorialCardConstants;
  readonly onActionsChange: (
    actions: readonly TutorialAction[],
    persist: boolean,
  ) => void;
  readonly onReplay: () => void;
  readonly onPlayFromAction: (actionId: TutorialActionId) => void;
  readonly onClose: () => void;
}

const TUTORIAL_TAIL_ACTION_COUNT = 6;
const DEFAULT_GUIDE_SPEECH_BUBBLE_WIDTH = 700;
const MINIMUM_SPEECH_BUBBLE_WIDTH = 300;
const MAXIMUM_SPEECH_BUBBLE_WIDTH = 700;
const SPEECH_BUBBLE_WIDTH_STEP = 50;
const DEFAULT_HOW_TO_PLAY_CARD_WIDTH = 500;
const MINIMUM_HOW_TO_PLAY_CARD_WIDTH = 300;
const HOW_TO_PLAY_CARD_WIDTH_STEP = 50;
const DEFAULT_HOW_TO_PLAY_TEXT =
  "Play characters and [yellow]challenge[/yellow] with them to score points (⍟) equal to their spark (✦).\n\nScore 10⍟ to win this dream battle.";
const DEFAULT_SPEECH_BUBBLE: TutorialSpeechBubble = {
  speaker: "mira",
  duration: 3,
  horizontalOffset: 0,
  verticalOffset: 0,
  bubbleWidth: DEFAULT_GUIDE_SPEECH_BUBBLE_WIDTH,
  text: "New tutorial message.",
};

const ACTION_OPTIONS = [
  { value: "display-speech-bubble", label: "Display Speech Bubble" },
  { value: "display-how-to-play", label: "Display How to Play" },
  {
    value: "animate-dream-avatar-portrait",
    label: "Animate Avatar Portrait",
  },
  { value: "draw-card", label: "Draw Card" },
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
  { value: "resolve-challenge", label: "Resolve Challenge" },
  { value: "draw-dreamwell-card", label: "Draw Dreamwell Card" },
  { value: "end-turn", label: "End Turn" },
] satisfies readonly { value: TutorialActionName; label: string }[];

const DREAM_AVATAR_OWNER_OPTIONS = [
  { value: "player", label: "Player" },
  { value: "enemy", label: "Opponent" },
] satisfies readonly { value: TutorialDreamAvatarOwner; label: string }[];

const SPEECH_BUBBLE_SPEAKER_OPTIONS = [
  { value: "mira", label: "Mira" },
  { value: "player", label: "Player Avatar" },
  { value: "enemy", label: "Opposing Avatar" },
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
  _actionName: TutorialActionName,
  _actions: readonly TutorialAction[],
): string {
  return crypto.randomUUID();
}

function defaultAction(
  actionName: TutorialActionName,
  actions: readonly TutorialAction[],
  tutorialCardConstants: TutorialCardConstants,
): TutorialAction {
  const id = nextActionId(actionName, actions);
  if (actionName === "display-speech-bubble") {
    return {
      id: asTutorialActionId(id),
      action: "display-speech-bubble",
      speechBubble: DEFAULT_SPEECH_BUBBLE,
      wait: 0,
    };
  }
  if (actionName === "display-how-to-play") {
    return {
      id: asTutorialActionId(id),
      action: "display-how-to-play",
      trigger: "immediate",
      cardWidth: DEFAULT_HOW_TO_PLAY_CARD_WIDTH,
      text: DEFAULT_HOW_TO_PLAY_TEXT,
      wait: 0,
    };
  }
  if (actionName === "animate-dream-avatar-portrait") {
    return {
      id: asTutorialActionId(id),
      action: "animate-dream-avatar-portrait",
      owner: "player",
      pause: 1,
      duration: 0.6,
      wait: 0,
    };
  }
  if (actionName === "reveal-and-play-opponent-card") {
    return {
      id: asTutorialActionId(id),
      action: "reveal-and-play-opponent-card",
      cardId: tutorialCardConstants.tutorialOpponentCharacterCardId,
      revealDuration: 2,
      wait: 0,
    };
  }
  if (actionName === "draw-card") {
    return {
      id: asTutorialActionId(id),
      action: "draw-card",
      owner: "player",
      cardId: tutorialCardConstants.tutorialPlayerCharacterCardId,
      reason: "dreamwell-effect",
      wait: 0,
    };
  }
  if (actionName === "draw-dreamwell-card") {
    return {
      id: asTutorialActionId(id),
      action: "draw-dreamwell-card",
      owner: "enemy",
      cardId: tutorialCardConstants.tutorialDreamwellCardId,
      wait: 0,
    };
  }
  if (actionName === "reposition-opponent-character") {
    return {
      id: asTutorialActionId(id),
      action: "reposition-opponent-character",
      cardId: tutorialCardConstants.tutorialOpponentCharacterCardId,
      wait: 0,
    };
  }
  if (actionName === "reposition-player-character") {
    return {
      id: asTutorialActionId(id),
      action: "reposition-player-character",
      cardId: tutorialCardConstants.tutorialPlayerCharacterCardId,
      opposingCardId: tutorialCardConstants.tutorialOpponentCharacterCardId,
      wait: 0,
    };
  }
  if (actionName === "resolve-challenge") {
    return {
      id: asTutorialActionId(id),
      action: "resolve-challenge",
      challengerCardId: tutorialCardConstants.tutorialOpponentCharacterCardId,
      blockerCardId: tutorialCardConstants.tutorialPlayerCharacterCardId,
      wait: 0,
    };
  }
  if (actionName === "end-turn") {
    return { id: asTutorialActionId(id), action: "end-turn", wait: 0 };
  }
  return {
    id: asTutorialActionId(id),
    action: "draw-opponent-card",
    cardId: tutorialCardConstants.tutorialOpponentCharacterCardId,
    wait: 0,
  };
}

function changedActionType(
  action: TutorialAction,
  actionName: TutorialActionName,
  tutorialCardConstants: TutorialCardConstants,
): TutorialAction {
  if (actionName === "display-speech-bubble") {
    return {
      id: action.id,
      action: actionName,
      speechBubble:
        action.action === "display-speech-bubble" ||
        action.action === "reveal-and-play-opponent-card" ||
        action.action === "end-turn"
          ? (action.speechBubble ?? DEFAULT_SPEECH_BUBBLE)
          : DEFAULT_SPEECH_BUBBLE,
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
      ...(action.action === "display-how-to-play" &&
      action.cardWidth !== undefined
        ? { cardWidth: action.cardWidth }
        : {}),
      wait: action.wait,
    };
  }
  if (actionName === "draw-opponent-card") {
    return {
      id: action.id,
      action: actionName,
      cardId:
        action.action === "draw-opponent-card"
          ? action.cardId
          : tutorialCardConstants.tutorialOpponentCharacterCardId,
      wait: action.wait,
    };
  }
  if (actionName === "draw-card") {
    return {
      id: action.id,
      action: actionName,
      owner: action.action === "draw-card" ? action.owner : "player",
      cardId:
        action.action === "draw-card"
          ? action.cardId
          : tutorialCardConstants.tutorialPlayerCharacterCardId,
      reason:
        action.action === "draw-card" ? action.reason : "dreamwell-effect",
      wait: action.wait,
    };
  }
  if (actionName === "reposition-opponent-character") {
    return {
      id: action.id,
      action: actionName,
      cardId:
        action.action === "reposition-opponent-character"
          ? action.cardId
          : tutorialCardConstants.tutorialOpponentCharacterCardId,
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
          : tutorialCardConstants.tutorialPlayerCharacterCardId,
      opposingCardId:
        action.action === "reposition-player-character"
          ? action.opposingCardId
          : tutorialCardConstants.tutorialOpponentCharacterCardId,
      wait: action.wait,
    };
  }
  if (actionName === "resolve-challenge") {
    return {
      id: action.id,
      action: actionName,
      challengerCardId:
        action.action === "resolve-challenge"
          ? action.challengerCardId
          : tutorialCardConstants.tutorialOpponentCharacterCardId,
      blockerCardId:
        action.action === "resolve-challenge"
          ? action.blockerCardId
          : tutorialCardConstants.tutorialPlayerCharacterCardId,
      wait: action.wait,
    };
  }
  if (actionName === "end-turn") {
    return {
      id: action.id,
      action: actionName,
      ...(action.action === "display-speech-bubble" ||
      action.action === "reveal-and-play-opponent-card" ||
      action.action === "end-turn"
        ? action.speechBubble === undefined
          ? {}
          : { speechBubble: action.speechBubble }
        : {}),
      wait: action.wait,
    };
  }
  if (actionName === "reveal-and-play-opponent-card") {
    return {
      id: action.id,
      action: actionName,
      cardId:
        action.action === "reveal-and-play-opponent-card"
          ? action.cardId
          : tutorialCardConstants.tutorialOpponentCharacterCardId,
      revealDuration:
        action.action === "reveal-and-play-opponent-card"
          ? action.revealDuration
          : 2,
      ...(action.action === "display-speech-bubble" ||
      action.action === "reveal-and-play-opponent-card" ||
      action.action === "end-turn"
        ? action.speechBubble === undefined
          ? {}
          : { speechBubble: action.speechBubble }
        : {}),
      wait: action.wait,
    };
  }
  if (actionName === "draw-dreamwell-card") {
    return {
      id: action.id,
      action: actionName,
      owner: action.action === "draw-dreamwell-card" ? action.owner : "enemy",
      cardId: asDreamwellCardId(
        action.action === "draw-dreamwell-card"
          ? action.cardId
          : tutorialCardConstants.tutorialDreamwellCardId,
      ),
      ...(action.action === "draw-dreamwell-card" &&
      action.revealDuration !== undefined
        ? { revealDuration: action.revealDuration }
        : {}),
      wait: action.wait,
    };
  }
  return {
    id: action.id,
    action: actionName,
    owner:
      action.action === "animate-dream-avatar-portrait"
        ? action.owner
        : "player",
    pause: action.action === "animate-dream-avatar-portrait" ? action.pause : 1,
    duration:
      action.action === "animate-dream-avatar-portrait" ? action.duration : 0.6,
    wait: action.wait,
  };
}

function reorderedActions(
  actions: readonly TutorialAction[],
  orderedIds: readonly string[],
): readonly TutorialAction[] {
  const byId = new Map(actions.map((action) => [action.id, action]));
  return orderedIds.flatMap((id) => {
    const action = byId.get(asTutorialActionId(id));
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

function withSpeechBubble(
  action: Extract<
    TutorialAction,
    {
      readonly action:
        "display-speech-bubble" | "reveal-and-play-opponent-card" | "end-turn";
    }
  >,
  speechBubble: TutorialSpeechBubble | undefined,
): TutorialAction {
  if (action.action === "display-speech-bubble") {
    return {
      ...action,
      speechBubble: speechBubble ?? action.speechBubble,
    };
  }
  if (action.action === "reveal-and-play-opponent-card") {
    return {
      id: action.id,
      action: action.action,
      cardId: action.cardId,
      revealDuration: action.revealDuration,
      ...(speechBubble === undefined ? {} : { speechBubble }),
      wait: action.wait,
    };
  }
  return {
    id: action.id,
    action: action.action,
    ...(speechBubble === undefined ? {} : { speechBubble }),
    wait: action.wait,
  };
}

function SpeechBubbleEditor({
  speechBubble,
  actionId,
  actionNumber,
  optional,
  onChange,
}: {
  readonly speechBubble: TutorialSpeechBubble | undefined;
  readonly actionId: TutorialActionId;
  readonly actionNumber: number;
  readonly optional: boolean;
  readonly onChange: (
    speechBubble: TutorialSpeechBubble | undefined,
    persist: boolean,
  ) => void;
}): ReactElement {
  if (speechBubble === undefined) {
    return (
      <GlassButton
        glyph={GLYPHS.plus}
        label={assertLocalized("Add Speech Bubble")}
        placement="onGlass"
        onPress={() => onChange(DEFAULT_SPEECH_BUBBLE, true)}
      />
    );
  }
  const appearanceDelay =
    typeof speechBubble.delay === "number" ? speechBubble.delay : 0;
  const visibleDuration = speechBubble.duration ?? 0;

  return (
    <div
      data-tutorial-speech-bubble-editor=""
      style={{ display: "grid", gap: token("--space-s") }}
    >
      <Select
        full
        size="sm"
        ariaLabel={assertLocalized(
          `Speech bubble speaker for action ${String(actionNumber)}`,
        )}
        options={[...SPEECH_BUBBLE_SPEAKER_OPTIONS].map((option) => ({
          ...option,
          label: assertLocalized(option.label),
          ...("triggerLabel" in option &&
          typeof option.triggerLabel === "string"
            ? { triggerLabel: assertLocalized(option.triggerLabel) }
            : {}),
        }))}
        value={speechBubble.speaker}
        onChange={(speaker) => {
          if (
            speaker !== "mira" &&
            speaker !== "player" &&
            speaker !== "enemy"
          ) {
            return;
          }
          onChange({ ...speechBubble, speaker }, true);
        }}
      />
      <TextArea
        label={assertLocalized("Speech Bubble Text")}
        value={speechBubble.text}
        supportingText={assertLocalized(
          "[yellow]copy[/yellow] uses yellow; [purple]copy[purple] uses bold high-contrast purple.",
        )}
        error={
          speechBubble.text.trim().length === 0
            ? assertLocalized("Text cannot be blank.")
            : undefined
        }
        testId={`tutorial-action-speech-bubble-text-${actionId}`}
        onChange={(text) => onChange({ ...speechBubble, text }, false)}
        onCommit={(text) => onChange({ ...speechBubble, text }, true)}
      />
      <NumberStepper
        label={assertLocalized("Appearance Delay")}
        value={appearanceDelay}
        displayValue={assertLocalized(`${waitLabel(appearanceDelay)}s`)}
        size="sm"
        decrementLabel={assertLocalized(
          `Decrease speech bubble delay for action ${String(actionNumber)}`,
        )}
        incrementLabel={assertLocalized(
          `Increase speech bubble delay for action ${String(actionNumber)}`,
        )}
        decrementDisabled={appearanceDelay <= 0}
        onDecrement={() =>
          onChange(
            {
              ...speechBubble,
              delay: Math.max(0, Math.round((appearanceDelay - 0.5) * 10) / 10),
            },
            true,
          )
        }
        onIncrement={() =>
          onChange(
            {
              ...speechBubble,
              delay: Math.round((appearanceDelay + 0.5) * 10) / 10,
            },
            true,
          )
        }
      />
      <NumberStepper
        label={assertLocalized("Visible Duration")}
        value={visibleDuration}
        displayValue={assertLocalized(`${waitLabel(visibleDuration)}s`)}
        size="sm"
        decrementLabel={assertLocalized(
          `Decrease speech bubble duration for action ${String(actionNumber)}`,
        )}
        incrementLabel={assertLocalized(
          `Increase speech bubble duration for action ${String(actionNumber)}`,
        )}
        decrementDisabled={visibleDuration <= 0}
        onDecrement={() =>
          onChange(
            {
              ...speechBubble,
              duration: Math.max(
                0,
                Math.round((visibleDuration - 0.5) * 10) / 10,
              ),
            },
            true,
          )
        }
        onIncrement={() =>
          onChange(
            {
              ...speechBubble,
              duration: Math.round((visibleDuration + 0.5) * 10) / 10,
            },
            true,
          )
        }
      />
      <NumberStepper
        label={assertLocalized("Bubble Width")}
        value={speechBubble.bubbleWidth}
        displayValue={assertLocalized(`${String(speechBubble.bubbleWidth)}px`)}
        size="sm"
        decrementLabel={assertLocalized(
          `Narrow speech bubble for action ${String(actionNumber)}`,
        )}
        incrementLabel={assertLocalized(
          `Widen speech bubble for action ${String(actionNumber)}`,
        )}
        decrementDisabled={
          speechBubble.bubbleWidth <= MINIMUM_SPEECH_BUBBLE_WIDTH
        }
        incrementDisabled={
          speechBubble.bubbleWidth >= MAXIMUM_SPEECH_BUBBLE_WIDTH
        }
        onDecrement={() =>
          onChange(
            {
              ...speechBubble,
              bubbleWidth: Math.max(
                MINIMUM_SPEECH_BUBBLE_WIDTH,
                speechBubble.bubbleWidth - SPEECH_BUBBLE_WIDTH_STEP,
              ),
            },
            true,
          )
        }
        onIncrement={() =>
          onChange(
            {
              ...speechBubble,
              bubbleWidth: Math.min(
                MAXIMUM_SPEECH_BUBBLE_WIDTH,
                speechBubble.bubbleWidth + SPEECH_BUBBLE_WIDTH_STEP,
              ),
            },
            true,
          )
        }
      />
      <NumberStepper
        label={assertLocalized("Horizontal Offset")}
        value={speechBubble.horizontalOffset}
        displayValue={assertLocalized(
          `${waitLabel(speechBubble.horizontalOffset)}px`,
        )}
        size="sm"
        decrementLabel={assertLocalized(
          `Move speech bubble left for action ${String(actionNumber)}`,
        )}
        incrementLabel={assertLocalized(
          `Move speech bubble right for action ${String(actionNumber)}`,
        )}
        onDecrement={() =>
          onChange(
            {
              ...speechBubble,
              horizontalOffset: speechBubble.horizontalOffset - 10,
            },
            true,
          )
        }
        onIncrement={() =>
          onChange(
            {
              ...speechBubble,
              horizontalOffset: speechBubble.horizontalOffset + 10,
            },
            true,
          )
        }
      />
      <NumberStepper
        label={assertLocalized("Vertical Offset")}
        value={speechBubble.verticalOffset}
        displayValue={assertLocalized(
          `${waitLabel(speechBubble.verticalOffset)}px`,
        )}
        size="sm"
        decrementLabel={assertLocalized(
          `Move speech bubble up for action ${String(actionNumber)}`,
        )}
        incrementLabel={assertLocalized(
          `Move speech bubble down for action ${String(actionNumber)}`,
        )}
        onDecrement={() =>
          onChange(
            {
              ...speechBubble,
              verticalOffset: speechBubble.verticalOffset - 10,
            },
            true,
          )
        }
        onIncrement={() =>
          onChange(
            {
              ...speechBubble,
              verticalOffset: speechBubble.verticalOffset + 10,
            },
            true,
          )
        }
      />
      {optional ? (
        <GlassButton
          glyph={GLYPHS.trash}
          label={assertLocalized("Remove Speech Bubble")}
          placement="onGlass"
          variant="danger"
          onPress={() => onChange(undefined, true)}
        />
      ) : null}
    </div>
  );
}

function TutorialActionRow({
  action,
  index,
  actions,
  tutorialCardConstants,
  onActionsChange,
  onPlayFromAction,
}: {
  readonly action: TutorialAction;
  readonly index: number;
  readonly actions: readonly TutorialAction[];
  readonly tutorialCardConstants: TutorialCardConstants;
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
          gap: token("--space-s"),
          padding: token("--space-s"),
          border: `1px solid ${token("--border-strong")}`,
          borderRadius: token("--radius-control"),
        }}
      >
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "auto minmax(0, 1fr) auto auto",
            alignItems: "center",
            gap: token("--space-xs"),
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
              fontSize: "1.4em",
              cursor: "grab",
              touchAction: "none",
            }}
          >
            <StandaloneGlyph glyph={GLYPHS.dragHandle} color="text-secondary" />
          </Pressable>
          <div style={{ minWidth: 0 }}>
            <Select
              full
              size="sm"
              ariaLabel={assertLocalized(`Action ${String(index + 1)} type`)}
              options={[...ACTION_OPTIONS].map((option) => ({
                ...option,
                label: assertLocalized(option.label),
                ...("triggerLabel" in option &&
                typeof option.triggerLabel === "string"
                  ? { triggerLabel: assertLocalized(option.triggerLabel) }
                  : {}),
              }))}
              value={action.action}
              onChange={(value) => {
                if (
                  value !== "display-speech-bubble" &&
                  value !== "display-how-to-play" &&
                  value !== "animate-dream-avatar-portrait" &&
                  value !== "draw-card" &&
                  value !== "draw-opponent-card" &&
                  value !== "reveal-and-play-opponent-card" &&
                  value !== "reposition-opponent-character" &&
                  value !== "reposition-player-character" &&
                  value !== "resolve-challenge" &&
                  value !== "draw-dreamwell-card" &&
                  value !== "end-turn"
                ) {
                  return;
                }
                update(
                  changedActionType(action, value, tutorialCardConstants),
                  true,
                );
              }}
            />
          </div>
          <IconButton
            glyph={GLYPHS.play}
            size="sm"
            placement="onGlass"
            label={assertLocalized(
              `Play tutorial from action ${String(index + 1)}`,
            )}
            testId={`tutorial-action-play-${action.id}`}
            onPress={() => onPlayFromAction(action.id)}
          />
          <IconButton
            glyph={GLYPHS.trash}
            size="sm"
            placement="onGlass"
            label={assertLocalized(`Delete action ${String(index + 1)}`)}
            onPress={() =>
              onActionsChange(
                actions.filter((candidate) => candidate.id !== action.id),
                true,
              )
            }
          />
        </div>

        {action.action === "display-speech-bubble" ? (
          <SpeechBubbleEditor
            speechBubble={action.speechBubble}
            actionId={action.id}
            actionNumber={index + 1}
            optional={false}
            onChange={(speechBubble, persist) =>
              update(withSpeechBubble(action, speechBubble), persist)
            }
          />
        ) : null}

        {action.action === "display-how-to-play" ? (
          <>
            <Select
              full
              size="sm"
              ariaLabel={assertLocalized(
                `How to Play trigger for action ${String(index + 1)}`,
              )}
              options={[...HOW_TO_PLAY_TRIGGER_OPTIONS].map((option) => ({
                ...option,
                label: assertLocalized(option.label),
                ...("triggerLabel" in option &&
                typeof option.triggerLabel === "string"
                  ? { triggerLabel: assertLocalized(option.triggerLabel) }
                  : {}),
              }))}
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
              ariaLabel={assertLocalized(
                `How to Play companion for action ${String(index + 1)}`,
              )}
              options={[...HOW_TO_PLAY_COMPANION_OPTIONS].map((option) => ({
                ...option,
                label: assertLocalized(option.label),
                ...("triggerLabel" in option &&
                typeof option.triggerLabel === "string"
                  ? { triggerLabel: assertLocalized(option.triggerLabel) }
                  : {}),
              }))}
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
                    ...(action.cardWidth === undefined
                      ? {}
                      : { cardWidth: action.cardWidth }),
                    text: action.text,
                    wait: action.wait,
                  },
                  true,
                );
              }}
            />
            <NumberStepper
              label={assertLocalized("Card Width")}
              value={action.cardWidth ?? DEFAULT_HOW_TO_PLAY_CARD_WIDTH}
              displayValue={assertLocalized(
                `${String(action.cardWidth ?? DEFAULT_HOW_TO_PLAY_CARD_WIDTH)}px`,
              )}
              size="sm"
              decrementLabel={assertLocalized(
                `Narrow How to Play card for action ${String(index + 1)}`,
              )}
              incrementLabel={assertLocalized(
                `Widen How to Play card for action ${String(index + 1)}`,
              )}
              decrementDisabled={
                (action.cardWidth ?? DEFAULT_HOW_TO_PLAY_CARD_WIDTH) <=
                MINIMUM_HOW_TO_PLAY_CARD_WIDTH
              }
              onDecrement={() =>
                update(
                  {
                    ...action,
                    cardWidth: Math.max(
                      MINIMUM_HOW_TO_PLAY_CARD_WIDTH,
                      (action.cardWidth ?? DEFAULT_HOW_TO_PLAY_CARD_WIDTH) -
                        HOW_TO_PLAY_CARD_WIDTH_STEP,
                    ),
                  },
                  true,
                )
              }
              onIncrement={() =>
                update(
                  {
                    ...action,
                    cardWidth:
                      (action.cardWidth ?? DEFAULT_HOW_TO_PLAY_CARD_WIDTH) +
                      HOW_TO_PLAY_CARD_WIDTH_STEP,
                  },
                  true,
                )
              }
            />
            <TextArea
              label={assertLocalized("Instruction Text")}
              value={action.text}
              supportingText={assertLocalized(
                "Use blank lines between paragraphs. [yellow]copy[/yellow] uses yellow; [purple]copy[purple] uses bold high-contrast purple; ⍟ renders points; ✦ renders spark.",
              )}
              error={
                action.text.trim().length === 0
                  ? assertLocalized("Text cannot be blank.")
                  : undefined
              }
              testId={`tutorial-action-text-${action.id}`}
              onChange={(text) => update({ ...action, text }, false)}
              onCommit={(text) => update({ ...action, text }, true)}
            />
          </>
        ) : null}

        {action.action === "animate-dream-avatar-portrait" ? (
          <>
            <Select
              full
              size="sm"
              ariaLabel={assertLocalized(
                `DreamAvatar owner for action ${String(index + 1)}`,
              )}
              options={[...DREAM_AVATAR_OWNER_OPTIONS].map((option) => ({
                ...option,
                label: assertLocalized(option.label),
                ...("triggerLabel" in option &&
                typeof option.triggerLabel === "string"
                  ? { triggerLabel: assertLocalized(option.triggerLabel) }
                  : {}),
              }))}
              value={action.owner}
              onChange={(owner) => {
                if (owner !== "player" && owner !== "enemy") return;
                update({ ...action, owner }, true);
              }}
            />
            <NumberStepper
              label={assertLocalized("Large Portrait Pause")}
              value={action.pause}
              displayValue={assertLocalized(`${waitLabel(action.pause)}s`)}
              size="sm"
              decrementLabel={assertLocalized(
                `Decrease large portrait pause for action ${String(index + 1)}`,
              )}
              incrementLabel={assertLocalized(
                `Increase large portrait pause for action ${String(index + 1)}`,
              )}
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
              label={assertLocalized("Scale & Travel Duration")}
              value={action.duration}
              displayValue={assertLocalized(`${waitLabel(action.duration)}s`)}
              size="sm"
              decrementLabel={assertLocalized(
                `Decrease scale and travel duration for action ${String(index + 1)}`,
              )}
              incrementLabel={assertLocalized(
                `Increase scale and travel duration for action ${String(index + 1)}`,
              )}
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

        {action.action === "draw-opponent-card" ? (
          <TextField
            label={assertLocalized("Drawn Opponent Card UUID")}
            value={action.cardId}
            error={
              isCardId(action.cardId)
                ? undefined
                : assertLocalized("Enter an opponent card UUID.")
            }
            testId={`tutorial-action-card-id-${action.id}`}
            onChange={(cardId) =>
              update({ ...action, cardId: asCardId(cardId) }, isCardId(cardId))
            }
          />
        ) : null}

        {action.action === "draw-card" ? (
          <>
            <Select
              full
              size="sm"
              ariaLabel={assertLocalized(
                `Card owner for action ${String(index + 1)}`,
              )}
              options={[...DREAM_AVATAR_OWNER_OPTIONS].map((option) => ({
                ...option,
                label: assertLocalized(option.label),
                ...("triggerLabel" in option &&
                typeof option.triggerLabel === "string"
                  ? { triggerLabel: assertLocalized(option.triggerLabel) }
                  : {}),
              }))}
              value={action.owner}
              onChange={(owner) => {
                if (owner !== "player" && owner !== "enemy") return;
                update({ ...action, owner }, true);
              }}
            />
            <Select
              full
              size="sm"
              ariaLabel={assertLocalized(
                `Draw reason for action ${String(index + 1)}`,
              )}
              options={[
                {
                  value: "dreamwell-effect",
                  label: assertLocalized("Dreamwell Effect"),
                },
                { value: "turn-draw", label: assertLocalized("Turn Draw") },
              ]}
              value={action.reason}
              onChange={(reason) => {
                if (reason !== "dreamwell-effect" && reason !== "turn-draw") {
                  return;
                }
                update({ ...action, reason }, true);
              }}
            />
            <TextField
              label={assertLocalized("Drawn Card UUID")}
              value={action.cardId}
              error={
                isCardId(action.cardId)
                  ? undefined
                  : assertLocalized("Enter a card UUID.")
              }
              testId={`tutorial-action-card-id-${action.id}`}
              onChange={(cardId) =>
                update(
                  { ...action, cardId: asCardId(cardId) },
                  isCardId(cardId),
                )
              }
            />
          </>
        ) : null}

        {action.action === "reveal-and-play-opponent-card" ? (
          <>
            <TextField
              label={assertLocalized("Revealed Opponent Card UUID")}
              value={action.cardId}
              error={
                isCardId(action.cardId)
                  ? undefined
                  : assertLocalized("Enter an opponent card UUID.")
              }
              testId={`tutorial-action-card-id-${action.id}`}
              onChange={(cardId) =>
                update(
                  { ...action, cardId: asCardId(cardId) },
                  isCardId(cardId),
                )
              }
            />
            <SpeechBubbleEditor
              speechBubble={action.speechBubble}
              actionId={action.id}
              actionNumber={index + 1}
              optional
              onChange={(speechBubble, persist) =>
                update(withSpeechBubble(action, speechBubble), persist)
              }
            />
            <NumberStepper
              label={assertLocalized("Face-Up Reading Time")}
              value={action.revealDuration}
              displayValue={assertLocalized(
                `${waitLabel(action.revealDuration)}s`,
              )}
              size="sm"
              decrementLabel={assertLocalized(
                `Decrease face-up reading time for action ${String(index + 1)}`,
              )}
              incrementLabel={assertLocalized(
                `Increase face-up reading time for action ${String(index + 1)}`,
              )}
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
          </>
        ) : null}

        {action.action === "draw-dreamwell-card" ? (
          <>
            <Select
              full
              size="sm"
              ariaLabel={assertLocalized(
                `Dreamwell owner for action ${String(index + 1)}`,
              )}
              options={[...DREAM_AVATAR_OWNER_OPTIONS].map((option) => ({
                ...option,
                label: assertLocalized(option.label),
                ...("triggerLabel" in option &&
                typeof option.triggerLabel === "string"
                  ? { triggerLabel: assertLocalized(option.triggerLabel) }
                  : {}),
              }))}
              value={action.owner}
              onChange={(owner) => {
                if (owner !== "player" && owner !== "enemy") return;
                update({ ...action, owner }, true);
              }}
            />
            <TextField
              label={assertLocalized("Dreamwell Card UUID")}
              value={action.cardId}
              error={
                isCardId(action.cardId)
                  ? undefined
                  : assertLocalized("Enter a Dreamwell card UUID.")
              }
              testId={`tutorial-action-card-id-${action.id}`}
              onChange={(cardId) =>
                update(
                  { ...action, cardId: asDreamwellCardId(cardId) },
                  isCardId(cardId),
                )
              }
            />
            <NumberStepper
              label={assertLocalized("Face-Up Reading Time")}
              value={action.revealDuration ?? 0}
              displayValue={assertLocalized(
                `${waitLabel(action.revealDuration ?? 0)}s`,
              )}
              size="sm"
              decrementLabel={assertLocalized(
                `Decrease Dreamwell reading time for action ${String(index + 1)}`,
              )}
              incrementLabel={assertLocalized(
                `Increase Dreamwell reading time for action ${String(index + 1)}`,
              )}
              decrementDisabled={(action.revealDuration ?? 0) <= 0}
              onDecrement={() => {
                const revealDuration = Math.max(
                  0,
                  Math.round(((action.revealDuration ?? 0) - 0.5) * 10) / 10,
                );
                update({ ...action, revealDuration }, true);
              }}
              onIncrement={() => {
                const revealDuration =
                  Math.round(((action.revealDuration ?? 0) + 0.5) * 10) / 10;
                update({ ...action, revealDuration }, true);
              }}
            />
          </>
        ) : null}

        {action.action === "reposition-opponent-character" ? (
          <TextField
            label={assertLocalized("Opponent Character UUID")}
            value={action.cardId}
            error={
              isCardId(action.cardId)
                ? undefined
                : assertLocalized("Enter an opponent character UUID.")
            }
            testId={`tutorial-action-card-id-${action.id}`}
            onChange={(cardId) =>
              update({ ...action, cardId: asCardId(cardId) }, isCardId(cardId))
            }
          />
        ) : null}

        {action.action === "reposition-player-character" ? (
          <>
            <TextField
              label={assertLocalized("Player Character UUID")}
              value={action.cardId}
              error={
                isCardId(action.cardId)
                  ? undefined
                  : assertLocalized("Enter a player character UUID.")
              }
              testId={`tutorial-action-card-id-${action.id}`}
              onChange={(cardId) =>
                update(
                  { ...action, cardId: asCardId(cardId) },
                  isCardId(cardId),
                )
              }
            />
            <TextField
              label={assertLocalized("Opposing Character UUID")}
              value={action.opposingCardId}
              error={
                isCardId(action.opposingCardId)
                  ? undefined
                  : assertLocalized("Enter an opposing character UUID.")
              }
              testId={`tutorial-action-opposing-card-id-${action.id}`}
              onChange={(opposingCardId) =>
                update(
                  { ...action, opposingCardId: asCardId(opposingCardId) },
                  isCardId(opposingCardId),
                )
              }
            />
          </>
        ) : null}

        {action.action === "resolve-challenge" ? (
          <>
            <TextField
              label={assertLocalized("Challenger UUID")}
              value={action.challengerCardId}
              error={
                isCardId(action.challengerCardId)
                  ? undefined
                  : assertLocalized("Enter a challenger UUID.")
              }
              testId={`tutorial-action-challenger-card-id-${action.id}`}
              onChange={(challengerCardId) =>
                update(
                  { ...action, challengerCardId: asCardId(challengerCardId) },
                  isCardId(challengerCardId) &&
                    challengerCardId !== action.blockerCardId,
                )
              }
            />
            <TextField
              label={assertLocalized("Blocker UUID")}
              value={action.blockerCardId}
              error={
                isCardId(action.blockerCardId)
                  ? undefined
                  : assertLocalized("Enter a blocker UUID.")
              }
              testId={`tutorial-action-blocker-card-id-${action.id}`}
              onChange={(blockerCardId) =>
                update(
                  { ...action, blockerCardId: asCardId(blockerCardId) },
                  isCardId(blockerCardId) &&
                    blockerCardId !== action.challengerCardId,
                )
              }
            />
          </>
        ) : null}

        {action.action === "end-turn" ? (
          <SpeechBubbleEditor
            speechBubble={action.speechBubble}
            actionId={action.id}
            actionNumber={index + 1}
            optional
            onChange={(speechBubble, persist) =>
              update(withSpeechBubble(action, speechBubble), persist)
            }
          />
        ) : null}

        <NumberStepper
          label={assertLocalized("Wait")}
          value={action.wait}
          displayValue={assertLocalized(`${waitLabel(action.wait)}s`)}
          size="sm"
          decrementLabel={assertLocalized(
            `Decrease wait for action ${String(index + 1)}`,
          )}
          incrementLabel={assertLocalized(
            `Increase wait for action ${String(index + 1)}`,
          )}
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
  readonly error: LocalizedString | null;
}): ReactElement | null {
  const resolve = useLocalizer();
  if (status === "idle") return null;
  const label =
    status === "saving"
      ? "Saving tutorial"
      : status === "saved"
        ? "Tutorial saved"
        : status === "error"
          ? `Tutorial save failed${error === null ? "" : `: ${resolve(error)}`}`
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
      style={{ display: "inline-flex", fontSize: "1.25em" }}
    >
      <StandaloneGlyph
        glyph={glyph}
        color={status === "error" ? "danger" : "text-secondary"}
      />
    </motion.span>
  );
}

function TutorialEditorContent({
  actions,
  tutorialCardConstants,
  onActionsChange,
  onReplay,
  onPlayFromAction,
}: Pick<
  TutorialEditorRailProps,
  | "actions"
  | "tutorialCardConstants"
  | "onActionsChange"
  | "onReplay"
  | "onPlayFromAction"
>): ReactElement {
  const tailStartAction =
    actions[Math.max(0, actions.length - TUTORIAL_TAIL_ACTION_COUNT)];
  const tailActionCount = Math.min(TUTORIAL_TAIL_ACTION_COUNT, actions.length);
  return (
    <div style={{ display: "grid", gap: token("--space-m") }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: token("--space-xs"),
        }}
      >
        <GlassButton
          glyph={GLYPHS.play}
          label={assertLocalized("Replay All")}
          placement="onGlass"
          disabled={actions.length === 0}
          testId="tutorial-editor-replay-all"
          onPress={onReplay}
        />
        <GlassButton
          glyph={GLYPHS.play}
          label={assertLocalized(`Replay Last ${String(tailActionCount)}`)}
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
          gap: token("--space-s"),
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
            tutorialCardConstants={tutorialCardConstants}
            onActionsChange={onActionsChange}
            onPlayFromAction={onPlayFromAction}
          />
        ))}
      </Reorder.Group>
      <Select
        full
        ariaLabel={assertLocalized("Add an action")}
        placeholder={assertLocalized("Add an Action")}
        options={[...ACTION_OPTIONS].map((option) => ({
          ...option,
          label: assertLocalized(option.label),
          ...("triggerLabel" in option &&
          typeof option.triggerLabel === "string"
            ? { triggerLabel: assertLocalized(option.triggerLabel) }
            : {}),
        }))}
        value=""
        onChange={(value) => {
          if (
            value !== "display-speech-bubble" &&
            value !== "display-how-to-play" &&
            value !== "animate-dream-avatar-portrait" &&
            value !== "draw-card" &&
            value !== "draw-opponent-card" &&
            value !== "reveal-and-play-opponent-card" &&
            value !== "reposition-opponent-character" &&
            value !== "reposition-player-character" &&
            value !== "resolve-challenge" &&
            value !== "draw-dreamwell-card" &&
            value !== "end-turn"
          ) {
            return;
          }
          onActionsChange(
            [...actions, defaultAction(value, actions, tutorialCardConstants)],
            true,
          );
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
        paddingInline: token("--space-m"),
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
  tutorialCardConstants,
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
      title={assertLocalized("Tutorial Editor")}
      subtitle={assertLocalized(
        `${String(actions.length)} ${actions.length === 1 ? "action" : "actions"}`,
      )}
      closeLabel={assertLocalized("Close tutorial editor")}
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
        tutorialCardConstants={tutorialCardConstants}
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
  tutorialCardConstants,
  saveStatus,
  saveError,
  onActionsChange,
  onReplay,
  onPlayFromAction,
  onClose,
}: TutorialEditorRailProps): ReactElement {
  return (
    <GlassDialog
      title={assertLocalized("Tutorial Editor")}
      subtitle={assertLocalized(
        `Developer Tools · ${String(actions.length)} ${actions.length === 1 ? "action" : "actions"}`,
      )}
      closeLabel={assertLocalized("Close tutorial editor")}
      cutoutAwareClose
      fullScreen
      onClose={onClose}
    >
      <div
        id="cumulus-tutorial-editor"
        data-tutorial-editor="takeover"
        style={{
          display: "grid",
          gap: token("--space-m"),
          width: "100%",
          maxWidth: 720,
          marginInline: "auto",
        }}
      >
        <TutorialEditorContent
          actions={actions}
          tutorialCardConstants={tutorialCardConstants}
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
