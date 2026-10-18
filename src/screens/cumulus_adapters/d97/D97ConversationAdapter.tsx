// Adapter for one conversation with an overworld character: it opens on the
// dialogue's first entry that holds, keeps the node and line showing as view
// state, records a chosen choice's effect as its intent (a challenge opens the
// encounter preview, which records its own preview intent), and logs openings,
// quest offers shown and choices (UUIDs only). While another panel stands in
// front of it (`suspended`: a card-choice reward the turn-in opened) it stays
// mounted and draws nothing, so the conversation resumes at the turn-in
// choice's next node. Wiring only.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { D97DialogueModule } from "../../../content/d97/dialogue/schema";
import { D97_QUESTS } from "../../../content/d97/quests";
import { D97DialoguePanel } from "../../../cumulus/screens/d97/D97DialoguePanel";
import type { D97DialogueContext } from "../../../d97/dialogue/conditions";
import { effectIntent } from "../../../d97/dialogue/effects";
import { dialogueNode, openingNode, visibleChoices } from "../../../d97/dialogue/runtime";
import { logEvent } from "../../../logging";
import { useActions } from "../../../session/hooks";
import type { AvatarContent } from "../../../types/content";
import type { D97CharacterId, D97DialogueNodeId, DreamAnchorId } from "../../../types/identifiers";
import { buildD97DialogueView } from "./d97-quest-view-model";

function reportFailure(error: unknown): void {
  console.error("D97 dialogue intent failed", error);
}

export function D97ConversationAdapter({
  module,
  anchorId,
  characterId,
  context,
  avatars,
  onChallenge,
  onOpenShop,
  onClose,
  suspended = false,
}: {
  readonly module: D97DialogueModule;
  readonly anchorId: DreamAnchorId;
  /** The character speaking, for their bust. */
  readonly characterId: D97CharacterId | null;
  readonly context: D97DialogueContext;
  readonly avatars: readonly AvatarContent[];
  /** Hands the conversation to the speaker's encounter preview. */
  readonly onChallenge: (anchorId: DreamAnchorId) => void;
  /** Hands the conversation to the speaker's shop, which records its own open intent. */
  readonly onOpenShop: (anchorId: DreamAnchorId) => void;
  readonly onClose: () => void;
  /** Another panel stands in front: keep the position, draw nothing. */
  readonly suspended?: boolean;
}) {
  const actions = useActions();
  const [position, setPosition] = useState<{ nodeId: D97DialogueNodeId | null; line: number }>(() => ({
    nodeId: openingNode(module, context)?.id ?? null,
    line: 0,
  }));
  const node = position.nodeId === null ? null : dialogueNode(module, position.nodeId);
  const view = useMemo(
    () =>
      node === null
        ? null
        : buildD97DialogueView({ module, node, lineIndex: position.line, context, avatars, tuning: D97_QUESTS, characterId }),
    [avatars, characterId, context, module, node, position.line],
  );
  const loggedNodes = useRef(new Set<string>());

  useEffect(() => {
    if (suspended) return;
    if (node === null) {
      onClose();
      return;
    }
    if (loggedNodes.current.has(node.id)) return;
    loggedNodes.current.add(node.id);
    logEvent("d97_dialogue_node_shown", { dialogueId: module.id, anchorId, nodeId: node.id });
    for (const { choice } of visibleChoices(node, context)) {
      if (choice.effect?.kind === "offerQuest") {
        logEvent("d97_quest_offer_shown", { dialogueId: module.id, anchorId, questId: choice.effect.questId });
      }
    }
  }, [anchorId, context, module.id, node, onClose, suspended]);

  const onContinue = useCallback(() => setPosition((current) => ({ ...current, line: current.line + 1 })), []);
  const onChoose = useCallback(
    (index: number) => {
      const choice = node?.choices[index];
      if (node === null || choice === undefined) return;
      logEvent("d97_dialogue_choice", {
        dialogueId: module.id,
        anchorId,
        nodeId: node.id,
        choiceIndex: index,
        effect: choice.effect?.kind ?? null,
      });
      if (choice.effect?.kind === "startChallenge") {
        // The encounter flow records its own preview intent and opens its panel.
        onClose();
        onChallenge(anchorId);
        return;
      }
      if (choice.effect?.kind === "openShop") {
        onClose();
        onOpenShop(anchorId);
        return;
      }
      if (choice.effect !== undefined) void actions.d97(effectIntent(choice.effect, anchorId)).catch(reportFailure);
      if (choice.next === null) onClose();
      else setPosition({ nodeId: choice.next, line: 0 });
    },
    [actions, anchorId, module.id, node, onChallenge, onClose, onOpenShop],
  );

  if (view === null || suspended) return null;
  return <D97DialoguePanel view={view} onContinue={onContinue} onChoose={onChoose} onClose={onClose} />;
}
