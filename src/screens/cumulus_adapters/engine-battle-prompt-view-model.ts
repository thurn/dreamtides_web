// Maps the engine prompt pending for the human onto the battle screen's
// existing prompt surfaces (engine-design § UI contract), and the surfaces'
// selections back onto engine answers.
//
// Boundary: this module is the whole prompt mapping of the top-level action
// UI (Phase 4.2). Phase 4.3's PromptHost replaces it: per-kind surfaces
// with their own copy, a number picker, and the loop and response-window
// treatments. Until then:
// - chooseTargets with one target among characters in play: on-board
//   legal-target highlighting, answered by tapping a highlighted card;
// - any other chooseTargets and every chooseCards: the card picker, which
//   submits exactly `max` cards, or none when `min` is 0;
// - chooseMode, chooseNumber, confirm, payOrDecline: the choice prompt, one
//   button per legal answer;
// - arrange over the top of the deck and the void: the Foresee editor;
//   any other arrangement: one Continue button for its first legal answer.
// Every answer is checked against the prompt the engine raised before it is
// submitted; the fold checks it again.

import type { BattleForeseeEditorModel, BattleForeseeResult } from "../../cumulus/components/battle/BattleForeseeEditor";
import type {
  MobileBattleCardPickerCandidateView,
  MobileBattleCardPickerView,
  MobileBattleCardView,
  MobileBattleChoicePromptView,
  MobileBattlePromptBannerView,
} from "../../cumulus/screens/MobileBattleScreen";
import type { BattleView, InstanceId, InstanceView, Prompt, Side } from "../../engine";
import { firstLegalAnswer, isLegalAnswer, legalAnswers } from "../../engine/prompts/answers";
import type { Answer, ArrangeAnswer } from "../../engine/prompts/types";
import {
  enginePromptHeading,
  enginePromptOptionLabel,
  type EnginePromptOptionCopy,
} from "../../runtime/battle-prompt-messages";
import { parseBattleCardId, type BattleCardId, type PromptId } from "../../types/identifiers";

/** A prompt the fold has pending, with its id. */
export type PendingEnginePrompt = Prompt & { readonly id: PromptId };

/** The surface that shows the pending prompt to the human. */
export type EnginePromptSurface =
  | { readonly kind: "none" }
  /** The opponent answers; the human waits. */
  | { readonly kind: "waiting"; readonly side: Side }
  | {
      readonly kind: "targets";
      readonly banner: MobileBattlePromptBannerView;
      readonly targetIds: readonly BattleCardId[];
    }
  | {
      readonly kind: "picker";
      readonly banner: MobileBattlePromptBannerView | null;
      readonly picker: MobileBattleCardPickerView;
    }
  | {
      readonly kind: "choice";
      readonly banner: MobileBattlePromptBannerView | null;
      readonly choice: MobileBattleChoicePromptView;
      /** The answer each option submits, by option index. */
      readonly answers: readonly Answer[];
    }
  | {
      readonly kind: "foresee";
      readonly banner: MobileBattlePromptBannerView | null;
      readonly model: BattleForeseeEditorModel;
    };

/** Builds the card view of an instance the human can see. */
export type EngineCardViewBuilder = (instance: InstanceView) => MobileBattleCardView;

const NO_PROMPT: EnginePromptSurface = { kind: "none" };

function banner(prompt: PendingEnginePrompt): MobileBattlePromptBannerView {
  return { key: prompt.id, label: enginePromptHeading(prompt.purpose.role), cancellable: prompt.cancellable };
}

/** The banner of a surface that shows its own heading: only to offer Cancel. */
function cancelBanner(prompt: PendingEnginePrompt): MobileBattlePromptBannerView | null {
  return prompt.cancellable ? banner(prompt) : null;
}

/** The instance a battle card id names in `view`, or `null`. */
export function instanceIdIn(view: BattleView, id: BattleCardId): InstanceId | null {
  const instance = Object.values(view.instances).find((candidate) => candidate.id === id);
  return instance === undefined ? null : instance.id;
}

function candidateZone(instance: InstanceView, view: BattleView): MobileBattleCardPickerCandidateView["zone"] {
  if (instance.zone !== "play") return instance.zone;
  return view.sides[instance.controller].frontRank.includes(instance.id) ? "frontRank" : "backRank";
}

export function buildEnginePromptSurface(
  prompt: PendingEnginePrompt | null,
  human: Side,
  view: BattleView,
  cardView: EngineCardViewBuilder,
): EnginePromptSurface {
  if (prompt === null) return NO_PROMPT;
  if (prompt.side !== human) return { kind: "waiting", side: prompt.side };
  switch (prompt.kind) {
    case "chooseTargets":
    case "chooseCards": {
      const visible = prompt.candidates.flatMap((id) => {
        const instance = view.instances[id];
        return instance === undefined ? [] : [instance];
      });
      if (
        prompt.kind === "chooseTargets" &&
        prompt.max === 1 &&
        visible.every((instance) => instance.zone === "play")
      ) {
        return {
          kind: "targets",
          banner: banner(prompt),
          targetIds: visible
            .filter((instance) => isLegalAnswer(prompt, [instance.id]))
            .map((instance) => parseBattleCardId(instance.id)),
        };
      }
      const candidates = visible.map(
        (instance): MobileBattleCardPickerCandidateView => ({
          instanceId: parseBattleCardId(instance.id),
          cardUuid: cardView(instance).model.cardId,
          owner: instance.controller,
          zone: candidateZone(instance, view),
          card: cardView(instance),
          highlighted: false,
        }),
      );
      const onBoard = candidates.every(
        (candidate) =>
          candidate.zone === "hand" || candidate.zone === "backRank" || candidate.zone === "frontRank",
      );
      return {
        kind: "picker",
        banner: cancelBanner(prompt),
        picker: {
          key: prompt.id,
          label: enginePromptHeading(prompt.purpose.role),
          side: human,
          candidateOwner: candidates[0]?.owner ?? null,
          candidates,
          candidateIds: candidates.map((candidate) => candidate.instanceId),
          count: prompt.max,
          optional: prompt.min === 0,
          canResolve: true,
          presentation: onBoard ? "board" : "gallery",
        },
      };
    }
    case "arrange": {
      const destinations = prompt.destinations.map((slot) => slot.to);
      if (destinations.every((to) => to === "top" || to === "void")) {
        return {
          kind: "foresee",
          banner: cancelBanner(prompt),
          model: {
            initialCount: prompt.cards.length,
            allowedCounts: [prompt.cards.length],
            cards: prompt.cards.flatMap((id) => {
              const instance = view.instances[id];
              return instance === undefined
                ? []
                : [{ battleCardId: parseBattleCardId(id), card: cardView(instance).model }];
            }),
          },
        };
      }
      return choice(prompt, [{ copy: { kind: "continue" }, answer: firstLegalAnswer(prompt) }]);
    }
    case "chooseMode":
      return choice(
        prompt,
        prompt.options
          .filter((option) => option.legal)
          .map((option) => ({ copy: { kind: "mode", index: option.mode }, answer: option.mode })),
      );
    case "chooseNumber":
      return choice(
        prompt,
        [...legalAnswers(prompt)].flatMap((answer) =>
          typeof answer === "number" ? [{ copy: { kind: "number", value: answer }, answer }] : [],
        ),
      );
    case "confirm":
      return choice(prompt, [
        { copy: { kind: "yes" }, answer: true },
        { copy: { kind: "no" }, answer: false },
      ]);
    case "payOrDecline":
      return choice(prompt, [
        { copy: { kind: "pay", energy: prompt.energy }, answer: true },
        { copy: { kind: "decline" }, answer: false },
      ]);
  }
}

function choice(
  prompt: PendingEnginePrompt,
  options: readonly { readonly copy: EnginePromptOptionCopy; readonly answer: Answer }[],
): EnginePromptSurface {
  const legal = options.filter((option) => isLegalAnswer(prompt, option.answer));
  return {
    kind: "choice",
    banner: cancelBanner(prompt),
    choice: {
      key: prompt.id,
      label: enginePromptHeading(prompt.purpose.role),
      options: legal.map((option) => ({ label: enginePromptOptionLabel(option.copy) })),
      canResolve: true,
    },
    answers: legal.map((option) => option.answer),
  };
}

function cardsAnswer(prompt: PendingEnginePrompt, view: BattleView, ids: readonly BattleCardId[]): Answer | null {
  const answer: InstanceId[] = [];
  for (const id of ids) {
    const instance = instanceIdIn(view, id);
    if (instance === null) return null;
    answer.push(instance);
  }
  return isLegalAnswer(prompt, answer) ? answer : null;
}

/** The answer tapping `id` gives a board target prompt, or `null` when it is not a legal target. */
export function targetAnswer(prompt: PendingEnginePrompt, view: BattleView, id: BattleCardId): Answer | null {
  return prompt.kind === "chooseTargets" ? cardsAnswer(prompt, view, [id]) : null;
}

/** The answer a card-picker submission gives, or `null` when it is not legal. */
export function pickerAnswer(
  prompt: PendingEnginePrompt,
  view: BattleView,
  ids: readonly BattleCardId[],
): Answer | null {
  return prompt.kind === "chooseTargets" || prompt.kind === "chooseCards" ? cardsAnswer(prompt, view, ids) : null;
}

/** The arrangement a Foresee confirmation gives, or `null` when it is not legal. */
export function foreseeAnswer(
  prompt: PendingEnginePrompt,
  view: BattleView,
  result: BattleForeseeResult,
): Answer | null {
  if (prompt.kind !== "arrange") return null;
  const arrangement: { card: InstanceId; to: "top" | "void" }[] = [];
  for (const [ids, to] of [
    [result.orderedCardIds, "top"],
    [result.voidCardIds, "void"],
  ] as const) {
    for (const id of ids) {
      const card = instanceIdIn(view, id);
      if (card === null) return null;
      arrangement.push({ card, to });
    }
  }
  const answer: ArrangeAnswer = arrangement;
  return isLegalAnswer(prompt, answer) ? answer : null;
}
