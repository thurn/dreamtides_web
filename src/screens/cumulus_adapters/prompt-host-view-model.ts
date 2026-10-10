// The prompt host's view model (engine-design § UI contract): the decision
// pending for the human, whatever raised it, mapped onto one surface per
// prompt kind, and each surface's selection mapped back onto an engine
// answer. Pure and React-free.
//
// | kind | surface |
// | --- | --- |
// | chooseTargets | on-board highlighting (one target among characters in play, with Skip when it may be none), else the card picker |
// | chooseCards | the card picker (on the board for hand and battlefield cards, else the gallery) |
// | chooseMode, confirm, payOrDecline | the choice buttons of the control row |
// | arrange | the Foresee editor (back on top in any order, or into the void), else the arrangement editor |
// | chooseNumber | the prompt host's number picker |
//
// Besides prompts, the host shows the human's response window (P1: a
// `respond` decision only exists while the human holds a legal response),
// its heading over the opponent's card at reading size and the control
// row's Pass, and the presentation's notices. While the opponent answers,
// the human sees only a waiting notice: "choosing" for a private prompt
// (`privateTo`), "acting" for any other prompt or decision. A prompt or
// response window shows only once the presentation has finished every
// event before it ("present, then ask"); until then only its notice shows.
//
// Every answer is checked against the prompt the engine raised before it is
// submitted; the fold checks it again and bounces a stale or illegal one.

import type { BattleForeseeResult } from "../../cumulus/components/battle/BattleForeseeEditor";
import type {
  BattlePromptArrangeView,
  BattlePromptHostView,
  BattlePromptNoticeView,
} from "../../cumulus/screens/battle-overlays/BattlePromptHost";
import type {
  MobileBattleCardPickerCandidateView,
  MobileBattleCardPickerView,
  MobileBattleCardView,
  MobileBattleChoicePromptView,
  MobileBattlePromptNoticeView,
} from "../../cumulus/screens/MobileBattleScreen";
import type { BattleView, Decision, InstanceId, InstanceView, Prompt, Side } from "../../engine";
import { isLegalAnswer, legalAnswers } from "../../engine/prompts/answers";
import type { Answer, ArrangeAnswer, ArrangeDestination } from "../../engine/prompts/types";
import {
  engineArrangeDestinationLabel,
  enginePromptHeading,
  enginePromptModeTexts,
  enginePromptOptionLabel,
  engineNumberPickerLabel,
  engineResponseWindowHeading,
  type EnginePromptOptionCopy,
} from "../../runtime/battle-prompt-messages";
import { parseBattleCardId, type BattleCardId, type PromptId } from "../../types/identifiers";

/** A prompt the fold has pending, with its id, as the human may see it. */
export type PendingEnginePrompt = Prompt & { readonly id: PromptId };

/** Builds the card view of an instance the human can see. */
export type EngineCardViewBuilder = (instance: InstanceView) => MobileBattleCardView;

export interface PromptHostInput {
  readonly human: Side;
  readonly view: BattleView;
  readonly prompt: PendingEnginePrompt | null;
  /** The committed state's top-level decision, when no step is in flight. */
  readonly decision: Decision | null;
  /** The presentation has finished every event before the prompt. */
  readonly presented: boolean;
  readonly notice: BattlePromptNoticeView | null;
  /** The loop on offer to the human, with the most repetitions one request may ask for. */
  readonly loopOffer: { readonly maxCount: number } | null;
  readonly cardView: EngineCardViewBuilder;
}

export interface PromptHostModel {
  readonly host: BattlePromptHostView | null;
  readonly cardPicker: MobileBattleCardPickerView | null;
  readonly choicePrompt: MobileBattleChoicePromptView | null;
  /** The answer each choice button submits, by option index. */
  readonly choiceAnswers: readonly Answer[];
  readonly promptNotice: MobileBattlePromptNoticeView | null;
  /** Characters a tap answers a one-target prompt with; an "up to one" prompt also offers Skip as a choice button. */
  readonly targetIds: readonly BattleCardId[];
  /** The card that asks, or the opponent's card the response window answers, at reading size. */
  readonly sourceCard: MobileBattleCardView | null;
}

const EMPTY_HOST: BattlePromptHostView = {
  key: null,
  heading: null,
  cancellable: false,
  number: null,
  arrange: null,
  loopOffer: null,
  notice: null,
};

const NOTHING: Omit<PromptHostModel, "host" | "promptNotice" | "sourceCard"> = {
  cardPicker: null,
  choicePrompt: null,
  choiceAnswers: [],
  targetIds: [],
};

function visible(view: BattleView, ids: readonly InstanceId[]): InstanceView[] {
  return ids.flatMap((id) => {
    const instance = view.instances[id];
    return instance === undefined ? [] : [instance];
  });
}

function candidateZone(instance: InstanceView, view: BattleView): MobileBattleCardPickerCandidateView["zone"] {
  if (instance.zone !== "play") return instance.zone;
  return view.sides[instance.controller].frontRank.includes(instance.id) ? "frontRank" : "backRank";
}

/** The card instance a prompt's purpose names, when the human can see it. */
function sourceInstance(prompt: PendingEnginePrompt, view: BattleView): InstanceView | null {
  const source = prompt.purpose.source;
  return typeof source === "string" ? (view.instances[source] ?? null) : null;
}

function bounds(prompt: PendingEnginePrompt): { min: number; max: number } {
  return "min" in prompt && "max" in prompt ? { min: prompt.min, max: prompt.max } : { min: 1, max: 1 };
}

export function buildPromptHost(input: PromptHostInput): PromptHostModel {
  const { prompt, view, human, cardView } = input;
  const base = { ...EMPTY_HOST, notice: input.notice, loopOffer: input.loopOffer };
  const hostOf = (fields: Partial<BattlePromptHostView>): BattlePromptHostView | null => {
    const host = { ...base, ...fields };
    return host.heading === null && host.arrange === null && host.loopOffer === null && host.notice === null
      ? null
      : host;
  };
  if (prompt === null) {
    // The response window, with the opponent's card at reading size, opens
    // only for the human's own `respond` decision, once presented.
    const respond = input.decision?.kind === "respond" && input.decision.side === human && input.presented;
    const top = view.stack[view.stack.length - 1];
    const stackInstance = top?.kind === "card" ? view.instances[top.instance] : undefined;
    const stackCard = respond && stackInstance !== undefined ? cardView(stackInstance) : null;
    const waiting = input.decision !== null && input.decision.side !== human;
    return {
      ...NOTHING,
      host: hostOf(
        respond
          ? {
              heading: engineResponseWindowHeading(stackCard === null ? null : stackCard.model.displaySnapshot.name),
              loopOffer: null,
            }
          : { loopOffer: waiting ? null : input.loopOffer },
      ),
      promptNotice: waiting ? { promptSide: input.decision?.side ?? human, reason: "opponent-acting" } : null,
      sourceCard: stackCard,
    };
  }
  const source = sourceInstance(prompt, view);
  const sourceCard = source === null ? null : cardView(source);
  if (prompt.side !== human) {
    // The opponent answers; a private prompt's cards never reach this view,
    // and the human learns only that the opponent is choosing.
    return {
      ...NOTHING,
      host: hostOf({ loopOffer: null }),
      promptNotice: {
        promptSide: prompt.side,
        reason: prompt.privateTo === undefined ? "opponent-acting" : "opponent-choosing",
      },
      sourceCard: input.presented ? sourceCard : null,
    };
  }
  if (!input.presented) {
    return { ...NOTHING, host: hostOf({ loopOffer: null }), promptNotice: null, sourceCard: null };
  }
  const { min, max } = bounds(prompt);
  const host = (fields: Partial<BattlePromptHostView>) =>
    hostOf({
      key: prompt.id,
      heading: enginePromptHeading({
        kind: prompt.kind,
        role: prompt.purpose.role,
        min,
        max,
        sourceName: sourceCard?.model.displaySnapshot.name ?? null,
      }),
      cancellable: prompt.cancellable,
      loopOffer: null,
      ...fields,
    });
  const shown = { promptNotice: null, sourceCard };
  const modal = { promptNotice: null, sourceCard: null };
  switch (prompt.kind) {
    case "chooseTargets":
    case "chooseCards": {
      const candidates = visible(view, prompt.candidates);
      if (prompt.kind === "chooseTargets" && max === 1 && candidates.every((instance) => instance.zone === "play")) {
        // A tap on a highlighted character answers. "Up to one" may also
        // be answered with none: Skip, a choice button of the control row.
        const banner = host({});
        const skip = min === 0 && isLegalAnswer(prompt, []);
        return {
          ...NOTHING,
          ...shown,
          host: banner,
          targetIds: candidates
            .filter((instance) => isLegalAnswer(prompt, [instance.id]))
            .map((instance) => parseBattleCardId(instance.id)),
          ...(skip
            ? {
                choicePrompt: {
                  key: prompt.id,
                  label: banner?.heading?.title ?? "",
                  options: [{ label: enginePromptOptionLabel({ kind: "skip" }) }],
                  canResolve: true,
                },
                choiceAnswers: [[]],
              }
            : {}),
        };
      }
      const pickerCandidates = candidates.map(
        (instance): MobileBattleCardPickerCandidateView => ({
          instanceId: parseBattleCardId(instance.id),
          cardUuid: cardView(instance).model.cardId,
          owner: instance.controller,
          zone: candidateZone(instance, view),
          card: cardView(instance),
          highlighted: false,
        }),
      );
      const onBoard = pickerCandidates.every(
        (candidate) => candidate.zone === "hand" || candidate.zone === "backRank" || candidate.zone === "frontRank",
      );
      return {
        ...NOTHING,
        // The gallery is modal: it names its prompt and offers Cancel beside
        // its one answer control. With both Skip and Submit, the banner
        // above it offers Cancel instead.
        ...(onBoard ? shown : modal),
        host: onBoard || (prompt.cancellable && min === 0) ? host({}) : host({ heading: null, cancellable: false }),
        cardPicker: {
          key: prompt.id,
          label: enginePromptHeading({ kind: prompt.kind, role: prompt.purpose.role, min, max, sourceName: null }).title,
          side: human,
          candidateOwner: pickerCandidates[0]?.owner ?? null,
          candidates: pickerCandidates,
          candidateIds: pickerCandidates.map((candidate) => candidate.instanceId),
          count: max,
          minCount: min,
          optional: min === 0,
          canResolve: true,
          presentation: onBoard ? "board" : "gallery",
          cancellable: prompt.cancellable && min > 0,
        },
      };
    }
    case "arrange": {
      // Both editors are modal and carry their own heading and Cancel.
      const heading = enginePromptHeading({
        kind: prompt.kind,
        role: prompt.purpose.role,
        min,
        max,
        sourceName: sourceCard?.model.displaySnapshot.name ?? null,
      });
      return { ...NOTHING, ...modal, host: host({ heading: null, arrange: arrangeView(prompt, view, cardView, heading) }) };
    }
    case "chooseNumber":
      return {
        ...NOTHING,
        ...shown,
        host: host({
          number: {
            label: engineNumberPickerLabel(prompt.purpose.role),
            values: [...legalAnswers(prompt)].filter((answer): answer is number => typeof answer === "number"),
          },
        }),
      };
    case "chooseMode": {
      const texts =
        prompt.purpose.role === "chooseOne" && sourceCard !== null
          ? enginePromptModeTexts(sourceCard.model.displaySnapshot.renderedText, prompt.options.length)
          : null;
      return choice(
        prompt,
        prompt.options.map((option) => ({
          copy:
            prompt.purpose.role === "playRoute"
              ? { kind: "route", index: option.mode }
              : { kind: "mode", index: option.mode, text: texts?.[option.mode] ?? null },
          answer: option.mode,
        })),
        host,
        shown,
      );
    }
    case "confirm":
      return choice(prompt, [{ copy: { kind: "yes" }, answer: true }, { copy: { kind: "no" }, answer: false }], host, shown);
    case "payOrDecline":
      return choice(
        prompt,
        [{ copy: { kind: "pay", energy: prompt.energy }, answer: true }, { copy: { kind: "decline" }, answer: false }],
        host,
        shown,
      );
  }
}

function choice(
  prompt: PendingEnginePrompt,
  options: readonly { readonly copy: EnginePromptOptionCopy; readonly answer: Answer }[],
  host: (fields: Partial<BattlePromptHostView>) => BattlePromptHostView | null,
  shown: Pick<PromptHostModel, "promptNotice" | "sourceCard">,
): PromptHostModel {
  const legal = options.filter((option) => isLegalAnswer(prompt, option.answer));
  const view = host({});
  return {
    ...NOTHING,
    ...shown,
    host: view,
    choicePrompt: {
      key: prompt.id,
      label: view?.heading?.title ?? "",
      options: legal.map((option) => ({ label: enginePromptOptionLabel(option.copy) })),
      canResolve: true,
    },
    choiceAnswers: legal.map((option) => option.answer),
  };
}

type ArrangeEnginePrompt = Extract<PendingEnginePrompt, { kind: "arrange" }>;

/** Destinations whose order the player sets: the deck's top and bottom. */
const ORDERED_DESTINATIONS: readonly ArrangeDestination[] = ["top", "bottom"];

/** Whether an arrangement is Foresee's: any of the cards back on top in any order, the rest into the void. */
function isForeseeShape(prompt: ArrangeEnginePrompt): boolean {
  const total = prompt.cards.length;
  return (
    prompt.destinations.length === 2 &&
    (["top", "void"] as const).every((to) =>
      prompt.destinations.some((slot) => slot.to === to && slot.min === 0 && slot.max >= total),
    )
  );
}

/**
 * Where each card of an arrangement starts: each destination gets its
 * fewest cards in the effect's order, then each remaining card goes to the
 * first destination with room. That is legal whenever the prompt is.
 */
function initialPlacement(prompt: ArrangeEnginePrompt): InstanceId[][] {
  const lanes: InstanceId[][] = prompt.destinations.map(() => []);
  const cards = [...prompt.cards];
  prompt.destinations.forEach((slot, index) => {
    lanes[index]?.push(...cards.splice(0, slot.min));
  });
  for (const card of cards) {
    const index = prompt.destinations.findIndex((slot, at) => (lanes[at]?.length ?? 0) < slot.max);
    lanes[index === -1 ? 0 : index]?.push(card);
  }
  return lanes;
}

/** The surface of an arrange prompt the human answers. */
function arrangeView(
  prompt: ArrangeEnginePrompt,
  view: BattleView,
  cardView: EngineCardViewBuilder,
  heading: { readonly title: string; readonly detail: string | null },
): BattlePromptArrangeView {
  const cards = visible(view, prompt.cards).map((instance) => ({
    battleCardId: parseBattleCardId(instance.id),
    card: cardView(instance).model,
  }));
  if (isForeseeShape(prompt)) {
    return {
      surface: "foresee",
      model: { initialCount: prompt.cards.length, allowedCounts: [prompt.cards.length], cards },
    };
  }
  const placement = initialPlacement(prompt);
  return {
    surface: "arrangement",
    model: {
      title: heading.title,
      subtitle: heading.detail,
      cards,
      lanes: prompt.destinations.map((slot, index) => ({
        destination: slot.to,
        ...engineArrangeDestinationLabel(slot.to),
        min: slot.min,
        max: slot.max,
        ordered: ORDERED_DESTINATIONS.includes(slot.to),
        cardIds: (placement[index] ?? []).map((card) => parseBattleCardId(card)),
      })),
    },
  };
}

/** The instance a battle card id names in `view`, or `null`. */
export function instanceIdIn(view: BattleView, id: BattleCardId): InstanceId | null {
  const instance = Object.values(view.instances).find((candidate) => candidate.id === id);
  return instance === undefined ? null : instance.id;
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

/** The answer a card-picker submission gives, or `null` when it is not legal (outside the prompt's bounds). */
export function pickerAnswer(prompt: PendingEnginePrompt, view: BattleView, ids: readonly BattleCardId[]): Answer | null {
  return prompt.kind === "chooseTargets" || prompt.kind === "chooseCards" ? cardsAnswer(prompt, view, ids) : null;
}

/** The answer a number-picker submission gives, or `null` when it is not legal. */
export function numberAnswer(prompt: PendingEnginePrompt, value: number): Answer | null {
  return prompt.kind === "chooseNumber" && isLegalAnswer(prompt, value) ? value : null;
}

/** The arrangement an arrangement editor's confirmation gives, or `null` when it is not legal. */
export function arrangeAnswer(prompt: PendingEnginePrompt, view: BattleView, result: BattleForeseeResult): Answer | null {
  if (prompt.kind !== "arrange") return null;
  const arrangement: { card: InstanceId; to: ArrangeDestination }[] = [];
  for (const [ids, to] of [
    [result.orderedCardIds, "top"],
    [result.bottomCardIds ?? [], "bottom"],
    [result.voidCardIds, "void"],
    [result.handCardIds ?? [], "hand"],
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
