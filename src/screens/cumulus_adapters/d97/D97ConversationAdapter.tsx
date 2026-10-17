// Adapter for one conversation with an overworld character: it opens on the
// dialogue's first entry that holds, keeps the node and line showing as view
// state, records a chosen choice's effect as its intent (a challenge opens the
// encounter preview, which records its own preview intent), and logs openings,
// quest offers shown and choices (UUIDs only). Wiring only.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { D97DialogueModule } from "../../../content/d97/dialogue/schema";
import { D97_QUESTS } from "../../../content/d97/quests";
import { D97DialoguePanel } from "../../../cumulus/screens/d97/D97DialoguePanel";
import type { D97DialogueContext } from "../../../d97/dialogue/conditions";
import { effectIntent, type D97DialogueIntent } from "../../../d97/dialogue/effects";
import { dialogueNode, openingNode, visibleChoices } from "../../../d97/dialogue/runtime";
import { logEvent } from "../../../logging";
import type { GameActions } from "../../../session/actions";
import { useActions } from "../../../session/hooks";
import type { AvatarContent } from "../../../types/content";
import type { D97CharacterId, D97DialogueNodeId, DreamAnchorId } from "../../../types/identifiers";
import { buildD97DialogueView } from "./d97-quest-view-model";

/** Record `intent` through its action creator. */
function recordIntent(actions: GameActions, intent: D97DialogueIntent): Promise<number> {
  switch (intent.type) {
    case "D97_ACCEPT_QUEST":
      return actions.d97AcceptQuest(intent.payload.questId, intent.payload.anchorId);
    case "D97_ADVANCE_QUEST":
      return actions.d97AdvanceQuest(intent.payload.questId, intent.payload.stepId, intent.payload.anchorId);
    case "D97_COMPLETE_QUEST":
      return actions.d97CompleteQuest(intent.payload.questId, intent.payload.anchorId);
    case "D97_GIVE_ITEM":
      return actions.d97GiveItem(intent.payload.itemId, intent.payload.anchorId);
    case "D97_TAKE_ITEM":
      return actions.d97TakeItem(intent.payload.itemId, intent.payload.anchorId);
    case "D97_OPEN_SHOP":
      return actions.d97OpenShop(intent.payload.anchorId);
    case "D97_OPEN_SERVICE":
      return actions.d97OpenService(intent.payload.anchorId, intent.payload.service);
    case "D97_SET_FLAG":
      return actions.d97SetFlag(intent.payload.flagId, intent.payload.value, intent.payload.anchorId);
    case "D97_PREVIEW_ENCOUNTER":
      return actions.d97PreviewEncounter(intent.payload.anchorId);
  }
}

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
  }, [anchorId, context, module.id, node, onClose]);

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
      if (choice.effect !== undefined) void recordIntent(actions, effectIntent(choice.effect, anchorId)).catch(reportFailure);
      if (choice.next === null) onClose();
      else setPosition({ nodeId: choice.next, line: 0 });
    },
    [actions, anchorId, module.id, node, onChallenge, onClose, onOpenShop],
  );

  if (view === null) return null;
  return <D97DialoguePanel view={view} onContinue={onContinue} onChoose={onChoose} onClose={onClose} />;
}
