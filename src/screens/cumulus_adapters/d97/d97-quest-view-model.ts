// The pure view-model builders for D97 dialogue and quests: the condition
// context a conversation reads, the dialogue panel, the quest log, the
// card-choice reward, and the overworld's quest marks (head icons and the
// object anchors shown only while their quest is held). Player-facing copy
// for these surfaces lives here; content copy comes from the dialogue
// catalog.

import type { CharacterDialoguePortraitArt } from "../../../cumulus/components/overlay/CharacterDialogue";
import type { D97DialogueChoiceView, D97DialogueView } from "../../../cumulus/screens/d97/D97DialoguePanel";
import type { D97QuestLogView } from "../../../cumulus/screens/d97/D97QuestLogPanel";
import type { D97QuestRewardView } from "../../../cumulus/screens/d97/D97QuestRewardPanel";
import type {
  D97DialogueModule,
  D97DialogueNode,
  D97QuestDefinition,
} from "../../../content/d97/dialogue/schema";
import type { D97QuestTuning } from "../../../content/d97/quests";
import type { D97DialogueContext } from "../../../d97/dialogue/conditions";
import type { D97DialogueCatalog } from "../../../d97/dialogue/catalog";
import { visibleChoices } from "../../../d97/dialogue/runtime";
import type { CompiledAnchor } from "../../../d97/map/compiled";
import type { BadgeKind } from "../../../d97/overworld/characters/badges";
import {
  currentStep,
  objectAnchorVisible,
  questBadges,
  questEssence,
  questStatus,
  type D97QuestCatalog,
} from "../../../d97/quests/quests";
import type { D97QuestState } from "../../../d97/quests/types";
import { d97BeatenAnchorIds, type D97Run } from "../../../rules/d97/d97-state";
import type { CardId } from "../../../types/card-identity";
import type { CardData } from "../../../types/cards";
import type { AvatarContent } from "../../../types/content";
import type { DreamAnchorId } from "../../../types/identifiers";

/** The condition context of `run` in `act`. */
export function buildD97DialogueContext(
  run: D97Run,
  quests: D97QuestCatalog,
  cards: ReadonlyMap<CardId, CardData>,
  act: number,
): D97DialogueContext {
  return {
    quests: run.quests,
    questCatalog: quests,
    flags: run.flags,
    act,
    beatenAnchorIds: d97BeatenAnchorIds(run),
    collection: run.collection,
    cardFacts: (cardId) => cards.get(cardId) ?? null,
  };
}

function portraitOf(
  module: D97DialogueModule,
  avatars: readonly AvatarContent[],
): CharacterDialoguePortraitArt | null {
  const avatar = avatars.find((candidate) => candidate.id === module.speaker.avatarId);
  return avatar === undefined ? null : { kind: "avatar", imageNumber: avatar.imageNumber };
}

/** The dialogue panel showing `node`'s line `lineIndex`. */
export function buildD97DialogueView(input: {
  readonly module: D97DialogueModule;
  readonly node: D97DialogueNode;
  readonly lineIndex: number;
  readonly context: D97DialogueContext;
  readonly avatars: readonly AvatarContent[];
  readonly tuning: D97QuestTuning;
}): D97DialogueView {
  const { module, node, context } = input;
  const lineIndex = Math.max(0, Math.min(input.lineIndex, node.lines.length - 1));
  let rewardNote: string | null = null;
  const choices: D97DialogueChoiceView[] = visibleChoices(node, context).map(({ index, choice }) => {
    const effect = choice.effect;
    const quest = effect?.kind === "offerQuest" ? context.questCatalog.get(effect.questId) : undefined;
    let essenceValue: number | null = null;
    if (quest !== undefined && quest.reward.kind === "essence") {
      essenceValue = questEssence(input.tuning.essenceReward[quest.kind], context.act);
    } else if (quest !== undefined) {
      rewardNote = `Reward: choose one of ${String(input.tuning.cardChoiceSize)} cards.`;
    }
    return { index, label: choice.label, essenceValue };
  });
  const portrait = portraitOf(module, input.avatars);
  return {
    dialogueId: module.id,
    nodeId: node.id,
    speakerName: module.speaker.name,
    portrait,
    portraitAlt: `${module.speaker.name}'s portrait`,
    line: node.lines[lineIndex] ?? "",
    lineIndex,
    lineCount: Math.max(1, node.lines.length),
    choices,
    rewardNote,
    continueLabel: "Continue",
    closeLabel: "Farewell",
  };
}

function turnInLine(quest: D97QuestDefinition, speakerAt: (anchorId: DreamAnchorId) => string | null): string {
  const name = speakerAt(quest.turnInAnchorId);
  return name === null ? "Return to collect your reward." : `Return to ${name} to collect your reward.`;
}

/** The quest log of `state`. `speakerAt` names the character at an anchor. */
export function buildD97QuestLogView(
  state: D97QuestState,
  catalog: D97DialogueCatalog,
  speakerAt: (anchorId: DreamAnchorId) => string | null,
): D97QuestLogView {
  const active = state.active;
  const quest = active === null ? undefined : catalog.quests.get(active.questId);
  const base = {
    title: "Quests",
    emptyLine: "You hold no quest. Speak with the dream's residents to find one.",
    itemsLabel: "Carrying:",
    abandonLabel: "Abandon",
  };
  if (quest === undefined) return { ...base, quest: null };
  const step = currentStep(state, quest);
  const status = questStatus(state, quest) === "ready" ? "ready" : "active";
  return {
    ...base,
    quest: {
      questId: quest.id,
      title: quest.title,
      status,
      stepLine: step === null ? turnInLine(quest, speakerAt) : step.description,
      items: state.items.flatMap((itemId) => {
        const item = catalog.items.get(itemId);
        return item === undefined ? [] : [item.name];
      }),
    },
  };
}

/** The pending card-choice reward of `state`, or null. Unknown cards are left out. */
export function buildD97QuestRewardView(
  state: D97QuestState,
  catalog: D97DialogueCatalog,
  cards: ReadonlyMap<CardId, CardData>,
): D97QuestRewardView | null {
  const pending = state.pendingReward;
  if (pending === null) return null;
  const quest = catalog.quests.get(pending.questId);
  return {
    questId: pending.questId,
    title: "Choose Your Reward",
    subtitle: quest === undefined ? "Take one card." : `${quest.title}: take one card.`,
    cards: pending.cardIds.flatMap((cardId, index) => {
      const card = cards.get(cardId);
      return card === undefined
        ? []
        : [{ slot: `slot-${index}` as const, model: { cardId: card.id, displaySnapshot: card } }];
    }),
  };
}

/** The card at a reward slot, or null. */
export function rewardSlotCard(state: D97QuestState, slot: string): CardId | null {
  const index = Number(slot.replace(/^slot-/u, ""));
  return state.pendingReward?.cardIds[index] ?? null;
}

export interface D97QuestMarks {
  /** Quest head icons, by anchor. */
  readonly badges: ReadonlyMap<DreamAnchorId, BadgeKind>;
  /** Object anchors hidden because their quest is not held. */
  readonly hiddenAnchorIds: ReadonlySet<DreamAnchorId>;
}

/** The overworld's quest marks for `state` over a dream's `anchors`. */
export function buildD97QuestMarks(
  state: D97QuestState,
  quests: D97QuestCatalog,
  anchors: readonly CompiledAnchor[],
): D97QuestMarks {
  const hiddenAnchorIds = new Set(
    anchors
      .filter((anchor) => anchor.kind === "object" && !objectAnchorVisible(state, quests, anchor.id))
      .map((anchor) => anchor.id),
  );
  return { badges: questBadges(state, quests), hiddenAnchorIds };
}
