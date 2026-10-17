// D97DialoguePanel — a conversation with an overworld character: the
// speaker's current line in a CharacterDialogue (an Avatar character, with a
// portrait) or a SpeechBubble whose tail points at the speaker's pixel bust
// (everyone else), then what an offered quest pays and the player's choices
// as glass buttons. Barks are conversations with no choices. It floats above
// the control bar over the world, which ignores input while it is open.
// PURE: it renders from a view model and reports Continue, the chosen
// choice's index, and Close; the adapter owns the conversation's position.

import { useEffect, type ReactElement } from "react";
import { GlassButton } from "../../components/controls/GlassButton";
import {
  CharacterDialogue,
  type CharacterDialoguePortraitArt,
} from "../../components/overlay/CharacterDialogue";
import { SpeechBubble } from "../../components/overlay/SpeechBubble";
import { safeAreaInsetAtLeast } from "../../primitives/safe-area";
import { token } from "../../primitives/tokens";
import { useIsDesktop } from "../../primitives/use-is-desktop";
import type { D97CharacterId, D97DialogueId, D97DialogueNodeId } from "../../../types/identifiers";
import { D97CharacterPortrait } from "./D97CharacterPortrait";
import { D97RewardLine, type D97RewardView } from "./D97RewardLine";

export interface D97DialogueChoiceView {
  /** The choice's index in its node. */
  readonly index: number;
  readonly label: string;
}

export interface D97DialogueView {
  readonly dialogueId: D97DialogueId;
  readonly nodeId: D97DialogueNodeId;
  readonly speakerName: string;
  /** An Avatar character's portrait; null shows a bare speech bubble. */
  readonly portrait: CharacterDialoguePortraitArt | null;
  /** The speaking character, whose bust the speech bubble points at; null shows none. */
  readonly characterId: D97CharacterId | null;
  readonly portraitAlt: string;
  /** The line showing. */
  readonly line: string;
  readonly lineIndex: number;
  readonly lineCount: number;
  /** The choices, shown after the last line. */
  readonly choices: readonly D97DialogueChoiceView[];
  /** What a quest this node offers pays, shown with the choices. */
  readonly reward: D97RewardView | null;
  readonly rewardLabel: string;
  readonly continueLabel: string;
  readonly closeLabel: string;
}

export interface D97DialoguePanelProps {
  readonly view: D97DialogueView;
  /** Show the next line. */
  readonly onContinue: () => void;
  /** Take the choice at `index` in the node. */
  readonly onChoose: (index: number) => void;
  /** End the conversation. */
  readonly onClose: () => void;
}

/** The panel's widest measure: CharacterDialogue's wide size. */
const PANEL_MAX_WIDTH_PX = 700;

export function D97DialoguePanel({ view, onContinue, onChoose, onClose }: D97DialoguePanelProps): ReactElement {
  const isDesktop = useIsDesktop();
  const lastLine = view.lineIndex >= view.lineCount - 1;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const bottom = `calc(${safeAreaInsetAtLeast("bottom", "--space-l")} + ${token("--touch-min")} + ${token("--space-l")})`;
  return (
    <section
      aria-label={view.speakerName}
      data-d97-dialogue={view.dialogueId}
      data-d97-dialogue-node={view.nodeId}
      data-d97-dialogue-line={String(view.lineIndex)}
      data-d97-dialogue-last-line={String(lastLine)}
      data-d97-dialogue-portrait={String(view.portrait !== null)}
      style={{
        position: "absolute",
        left: "50%",
        bottom,
        transform: "translateX(-50%)",
        width: `min(${String(PANEL_MAX_WIDTH_PX)}px, calc(100% - 2 * ${token("--gutter")}))`,
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-start",
        gap: token("--space-m"),
      }}
    >
      {view.portrait === null ? (
        <div data-d97-dialogue-speaker="" style={{ display: "flex", alignItems: "flex-end", gap: token("--space-s"), width: "100%" }}>
          {view.characterId !== null && <D97CharacterPortrait characterId={view.characterId} alt={view.portraitAlt} />}
          <div style={{ flex: "1 1 auto", minWidth: 0, display: "flex" }}>
            <SpeechBubble speakerName={view.speakerName} text={view.line} />
          </div>
        </div>
      ) : (
        <CharacterDialogue
          dialogue={{
            portrait: view.portrait,
            portraitAlt: view.portraitAlt,
            speakerName: view.speakerName,
            text: view.line,
          }}
          visible
          size={isDesktop ? "wide" : "compact"}
        />
      )}
      {lastLine && view.reward !== null && (
        <div data-d97-dialogue-reward="" style={{ alignSelf: "flex-end" }}>
          <D97RewardLine label={view.rewardLabel} reward={view.reward} surface="media" />
        </div>
      )}
      <div
        data-d97-dialogue-choices=""
        style={{ display: "flex", flexWrap: "wrap", gap: token("--space-s"), alignSelf: "flex-end" }}
      >
        {!lastLine && (
          <GlassButton label={view.continueLabel} variant="accent" testId="d97-dialogue-continue" onPress={onContinue} />
        )}
        {lastLine &&
          view.choices.map((choice) => (
            <GlassButton
              key={choice.index}
              label={choice.label}
              testId={`d97-dialogue-choice-${String(choice.index)}`}
              onPress={() => onChoose(choice.index)}
            />
          ))}
        {lastLine && view.choices.length === 0 && (
          <GlassButton label={view.closeLabel} testId="d97-dialogue-close" onPress={onClose} />
        )}
      </div>
    </section>
  );
}
