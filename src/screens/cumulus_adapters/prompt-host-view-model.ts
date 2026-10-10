// The prompt host's view model (engine-design § UI contract): the decision
// pending for the human, whatever raised it, mapped onto one surface per
// prompt kind. Each surface arm carries the answer its selection gives, so
// a selection maps back onto an engine answer without re-reading the prompt.
// Pure and React-free.
//
// | kind | surface |
// | --- | --- |
// | chooseTargets | `targets`: on-board highlighting (one target among characters in play, with Skip when it may be none), else `picker` |
// | chooseCards | `picker`: the card picker (on the board for hand and battlefield cards, else the gallery) |
// | chooseMode, confirm, payOrDecline | `choice`: the choice buttons of the control row |
// | arrange | `arrange`: the Foresee editor (back on top in any order, or into the void), else the arrangement editor |
// | chooseNumber | `number`: the prompt host's number picker |
//
// Besides prompts, the host shows the human's response window (`respond`;
// P1: a `respond` decision only exists while the human holds a legal
// response), its heading over the opponent's card at reading size and the
// control row's Pass, and the presentation's notices. While the opponent
// answers, the human sees only a waiting notice (`waiting`): "choosing" for
// a private prompt (`privateTo`), "acting" for any other prompt or decision.
// A prompt or response window shows only once the presentation has finished
// every event before it ("present, then ask"); until then the prompt is
// `held` and only its notice shows.
//
// `promptViewFields` is the one projection of a host model onto the battle
// screen's prompt fields.
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
  MobileBattlePromptKey,
  MobileBattlePromptNoticeView,
  MobileBattleView,
} from "../../cumulus/screens/MobileBattleScreen";
import type { Action, BattleView, Decision, InstanceId, InstanceView, Prompt, Side } from "../../engine";
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
  /** Every instance of `view` by the battle card id the screen names it with. */
  readonly instances: ReadonlyMap<BattleCardId, InstanceView>;
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

/** What one choice button of the control row does when chosen. */
export type ChoiceSelection =
  /** Answers the pending prompt. */
  | { readonly kind: "answer"; readonly answer: Answer }
  /** Takes a top-level action: an ability chooser's activation, Reclaim play, or payment. */
  | { readonly kind: "action"; readonly action: Action }
  /** Opens the human's void in the zone browser. */
  | { readonly kind: "browseVoid" }
  /** Closes an ability chooser without acting. */
  | { readonly kind: "close" };

export interface PromptChoiceOption {
  readonly label: string;
  readonly select: ChoiceSelection;
}

/** The control row's choice buttons: what they ask, and each option with what it does. */
export interface PromptChoices {
  readonly key: MobileBattlePromptKey;
  readonly label: string;
  readonly options: readonly PromptChoiceOption[];
}

/** The surface the human answers the pending decision on, with the answer each selection gives. */
export type PromptSurface =
  /** Nothing to answer: no prompt, or the human's own top-level decision. */
  | { readonly kind: "none" }
  /** The opponent answers a prompt or decision. */
  | { readonly kind: "waiting"; readonly notice: MobileBattlePromptNoticeView }
  /** The human's prompt waits for the presentation of the events before it. */
  | { readonly kind: "held" }
  /** The human's response window: Pass, or a response from the board. */
  | { readonly kind: "respond" }
  /**
   * Characters a tap answers a one-target prompt with (`ids`, the legal
   * ones); an "up to one" prompt also offers Skip as a choice button.
   */
  | {
      readonly kind: "targets";
      readonly ids: readonly BattleCardId[];
      readonly skip: PromptChoices | null;
      readonly answer: (id: BattleCardId) => Answer | null;
    }
  | {
      readonly kind: "picker";
      readonly picker: MobileBattleCardPickerView;
      readonly answer: (ids: readonly BattleCardId[]) => Answer | null;
    }
  | ({ readonly kind: "choice" } & PromptChoices)
  | { readonly kind: "number"; readonly answer: (value: number) => Answer | null }
  | {
      readonly kind: "arrange";
      readonly editor: BattlePromptArrangeView["surface"];
      readonly answer: (result: BattleForeseeResult) => Answer | null;
    };

export interface PromptHostModel {
  /** The prompt host's banner, editors, loop offer, and notice, or `null` when it shows none. */
  readonly host: BattlePromptHostView | null;
  readonly surface: PromptSurface;
  /** The card that asks, or the opponent's card the response window answers, at reading size. */
  readonly sourceCard: MobileBattleCardView | null;
}

/** The choice buttons a surface offers in the control row, or `null`. */
export function surfaceChoices(surface: PromptSurface): PromptChoices | null {
  switch (surface.kind) {
    case "choice":
      return surface;
    case "targets":
      return surface.skip;
    default:
      return null;
  }
}

/** The battle screen's prompt fields for a prompt host model. */
export function promptViewFields(
  model: PromptHostModel,
): Pick<MobileBattleView, "promptNotice" | "cardPicker" | "choicePrompt" | "promptHost"> {
  const { surface } = model;
  const choices = surfaceChoices(surface);
  return {
    promptNotice: surface.kind === "waiting" ? surface.notice : null,
    cardPicker: surface.kind === "picker" ? surface.picker : null,
    choicePrompt:
      choices === null
        ? null
        : {
            key: choices.key,
            label: choices.label,
            options: choices.options.map((option) => ({ label: option.label })),
            canResolve: true,
          },
    promptHost: model.host,
  };
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

const NONE: PromptSurface = { kind: "none" };
const HELD: PromptSurface = { kind: "held" };
const RESPOND: PromptSurface = { kind: "respond" };

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
    const waiting = input.decision !== null && input.decision.side !== human ? input.decision.side : null;
    return {
      host: hostOf(
        respond
          ? {
              heading: engineResponseWindowHeading(stackCard === null ? null : stackCard.model.displaySnapshot.name),
              loopOffer: null,
            }
          : { loopOffer: waiting === null ? input.loopOffer : null },
      ),
      surface:
        waiting !== null
          ? { kind: "waiting", notice: { promptSide: waiting, reason: "opponent-acting" } }
          : respond
            ? RESPOND
            : NONE,
      sourceCard: stackCard,
    };
  }
  const source = sourceInstance(prompt, view);
  const sourceCard = source === null ? null : cardView(source);
  if (prompt.side !== human) {
    // The opponent answers; a private prompt's cards never reach this view,
    // and the human learns only that the opponent is choosing.
    return {
      host: hostOf({ loopOffer: null }),
      surface: {
        kind: "waiting",
        notice: {
          promptSide: prompt.side,
          reason: prompt.privateTo === undefined ? "opponent-acting" : "opponent-choosing",
        },
      },
      sourceCard: input.presented ? sourceCard : null,
    };
  }
  if (!input.presented) {
    return { host: hostOf({ loopOffer: null }), surface: HELD, sourceCard: null };
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
  const cardsAnswer = (ids: readonly BattleCardId[]): Answer | null => {
    const answer: InstanceId[] = [];
    for (const id of ids) {
      const instance = input.instances.get(id);
      if (instance === undefined) return null;
      answer.push(instance.id);
    }
    return isLegalAnswer(prompt, answer) ? answer : null;
  };
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
          host: banner,
          surface: {
            kind: "targets",
            ids: candidates
              .filter((instance) => isLegalAnswer(prompt, [instance.id]))
              .map((instance) => parseBattleCardId(instance.id)),
            skip: skip
              ? {
                  key: prompt.id,
                  label: banner?.heading?.title ?? "",
                  options: [{ label: enginePromptOptionLabel({ kind: "skip" }), select: { kind: "answer", answer: [] } }],
                }
              : null,
            answer: (id) => cardsAnswer([id]),
          },
          sourceCard,
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
        // The gallery is modal: it names its prompt and offers Cancel beside
        // its one answer control. With both Skip and Submit, the banner
        // above it offers Cancel instead.
        host: onBoard || (prompt.cancellable && min === 0) ? host({}) : host({ heading: null, cancellable: false }),
        surface: {
          kind: "picker",
          picker: {
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
          answer: cardsAnswer,
        },
        sourceCard: onBoard ? sourceCard : null,
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
      const arrange = arrangeView(prompt, view, cardView, heading);
      return {
        host: host({ heading: null, arrange }),
        surface: {
          kind: "arrange",
          editor: arrange.surface,
          answer: (result) => arrangeAnswer(prompt, input.instances, result),
        },
        sourceCard: null,
      };
    }
    case "chooseNumber":
      return {
        host: host({
          number: {
            label: engineNumberPickerLabel(prompt.purpose.role),
            values: [...legalAnswers(prompt)].filter((answer): answer is number => typeof answer === "number"),
          },
        }),
        surface: { kind: "number", answer: (value) => (isLegalAnswer(prompt, value) ? value : null) },
        sourceCard,
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
        host({}),
        sourceCard,
      );
    }
    case "confirm":
      return choice(prompt, [{ copy: { kind: "yes" }, answer: true }, { copy: { kind: "no" }, answer: false }], host({}), sourceCard);
    case "payOrDecline":
      return choice(
        prompt,
        [{ copy: { kind: "pay", energy: prompt.energy }, answer: true }, { copy: { kind: "decline" }, answer: false }],
        host({}),
        sourceCard,
      );
  }
}

function choice(
  prompt: PendingEnginePrompt,
  options: readonly { readonly copy: EnginePromptOptionCopy; readonly answer: Answer }[],
  host: BattlePromptHostView | null,
  sourceCard: MobileBattleCardView | null,
): PromptHostModel {
  return {
    host,
    surface: {
      kind: "choice",
      key: prompt.id,
      label: host?.heading?.title ?? "",
      options: options
        .filter((option) => isLegalAnswer(prompt, option.answer))
        .map((option) => ({ label: enginePromptOptionLabel(option.copy), select: { kind: "answer", answer: option.answer } })),
    },
    sourceCard,
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

/** The arrangement an arrangement editor's confirmation gives, or `null` when it is not legal. */
function arrangeAnswer(
  prompt: ArrangeEnginePrompt,
  instances: ReadonlyMap<BattleCardId, InstanceView>,
  result: BattleForeseeResult,
): Answer | null {
  const arrangement: { card: InstanceId; to: ArrangeDestination }[] = [];
  for (const [ids, to] of [
    [result.orderedCardIds, "top"],
    [result.bottomCardIds ?? [], "bottom"],
    [result.voidCardIds, "void"],
    [result.handCardIds ?? [], "hand"],
  ] as const) {
    for (const id of ids) {
      const card = instances.get(id);
      if (card === undefined) return null;
      arrangement.push({ card: card.id, to });
    }
  }
  const answer: ArrangeAnswer = arrangement;
  return isLegalAnswer(prompt, answer) ? answer : null;
}
