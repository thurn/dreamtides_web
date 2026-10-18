// Adapter for the overworld's quest surfaces: an open conversation, the
// quest log with its free Abandon, and a pending card-choice reward, which
// shows whenever the run holds one (it is state, not view state). Every
// abandon and pick is recorded as an intent. Wiring only.

import { useCallback, useMemo } from "react";
import { D97_QUESTS } from "../../../content/d97/quests";
import { D97QuestLogPanel } from "../../../cumulus/screens/d97/D97QuestLogPanel";
import { D97QuestRewardPanel, type D97QuestRewardSlot } from "../../../cumulus/screens/d97/D97QuestRewardPanel";
import type { D97DialogueCatalog } from "../../../d97/dialogue/catalog";
import type { OverworldOccupants } from "../../../d97/overworld/occupants";
import { d97RunAct, type D97Run } from "../../../rules/d97/d97-state";
import { useActions } from "../../../session/hooks";
import type { CardId } from "../../../types/card-identity";
import type { CardData } from "../../../types/cards";
import type { AvatarContent } from "../../../types/content";
import type { D97QuestId, DreamAnchorId } from "../../../types/identifiers";
import { D97ConversationAdapter } from "./D97ConversationAdapter";
import {
  buildD97DialogueContext,
  buildD97QuestLogView,
  buildD97QuestRewardView,
  rewardSlotCard,
} from "./d97-quest-view-model";

function reportFailure(error: unknown): void {
  console.error("D97 quest intent failed", error);
}

export function D97QuestSurfacesAdapter({
  run,
  catalog,
  occupants,
  cards,
  avatars,
  conversationAnchorId,
  questLogOpen,
  onChallenge,
  onOpenShop,
  onClose,
}: {
  readonly run: D97Run;
  readonly catalog: D97DialogueCatalog;
  readonly occupants: OverworldOccupants;
  readonly cards: ReadonlyMap<CardId, CardData>;
  readonly avatars: readonly AvatarContent[];
  /** The anchor whose character the player is talking with, if any. */
  readonly conversationAnchorId: DreamAnchorId | null;
  readonly questLogOpen: boolean;
  /** Opens the encounter preview of the speaker at an anchor. */
  readonly onChallenge: (anchorId: DreamAnchorId) => void;
  /** Opens the shop of the speaker at an anchor. */
  readonly onOpenShop: (anchorId: DreamAnchorId) => void;
  readonly onClose: () => void;
}) {
  const actions = useActions();
  const context = useMemo(
    () => buildD97DialogueContext(run, catalog.quests, cards, d97RunAct(run)),
    [run, catalog.quests, cards],
  );
  const speakerAt = useCallback(
    (anchorId: DreamAnchorId) => {
      const dialogue = occupants.get(anchorId)?.dialogue;
      return dialogue === undefined || dialogue === null ? null : (catalog.dialogues.get(dialogue)?.speaker.name ?? null);
    },
    [catalog.dialogues, occupants],
  );
  const act = d97RunAct(run);
  const logView = useMemo(
    () => buildD97QuestLogView(run.quests, catalog, speakerAt, D97_QUESTS, act),
    [act, catalog, run.quests, speakerAt],
  );
  const rewardView = useMemo(() => buildD97QuestRewardView(run.quests, catalog, cards), [cards, catalog, run.quests]);
  const abandon = useCallback(
    (questId: D97QuestId) => void actions.d97({ type: "D97_ABANDON_QUEST", payload: { questId } }).catch(reportFailure),
    [actions],
  );
  const choose = useCallback(
    (slot: D97QuestRewardSlot) => {
      const cardId = rewardSlotCard(run.quests, slot);
      const pending = run.quests.pendingReward;
      if (cardId !== null && pending !== null) void actions.d97({ type: "D97_CHOOSE_QUEST_REWARD", payload: { questId: pending.questId, cardId } }).catch(reportFailure);
    },
    [actions, run.quests],
  );

  const dialogueId = conversationAnchorId === null ? null : (occupants.get(conversationAnchorId)?.dialogue ?? null);
  const module = dialogueId === null ? undefined : catalog.dialogues.get(dialogueId);
  // A pending card choice stands in front of the conversation that turned the
  // quest in; the conversation stays mounted underneath and resumes after it.
  return (
    <>
      {rewardView !== null && <D97QuestRewardPanel view={rewardView} onChoose={choose} />}
      {conversationAnchorId !== null && module !== undefined && (
        <D97ConversationAdapter
          key={conversationAnchorId}
          module={module}
          anchorId={conversationAnchorId}
          characterId={occupants.get(conversationAnchorId)?.character ?? null}
          context={context}
          avatars={avatars}
          onChallenge={onChallenge}
          onOpenShop={onOpenShop}
          onClose={onClose}
          suspended={rewardView !== null}
        />
      )}
      {rewardView === null && questLogOpen && <D97QuestLogPanel view={logView} onAbandon={abandon} onClose={onClose} />}
    </>
  );
}
