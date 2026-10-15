// The prompt host's view model (engine-design § UI contract): the decision
// pending for the human, whatever raised it, mapped onto one surface per
// prompt kind. Each surface arm carries the answer its selection gives, so
// a selection maps back onto an engine answer without re-reading the prompt.
// Pure and React-free.
//
// | kind | surface |
// | --- | --- |
// | chooseTargets | `targets`: on-board highlighting (one target among characters in play, with Skip when it may be none), else `picker` |
// | chooseCards | `picker`: the card picker (on the board for the human's hand and battlefield cards, else the gallery) |
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
import type { DreamwellCardModel } from "../../cumulus/components/battle/DreamwellCard";
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
  MobileBattleStatusView,
  MobileBattleView,
} from "../../cumulus/screens/MobileBattleScreen";
import type { Action, BattleView, Decision, InstanceId, InstanceView, Prompt, Side } from "../../engine";
import { isLegalAnswer, legalAnswers } from "../../engine/prompts/answers";
import type { Answer, ArrangeAnswer, ArrangeDestination } from "../../engine/prompts/types";
import {
  engineArrangeDestinationLabel,
  enginePromptHeading,
  engineMovementPromptHeading,
  enginePromptModeTexts,
  enginePromptOptionLabel,
  engineNumberPickerLabel,
  engineResponseWindowHeading,
  type EnginePromptOptionCopy,
} from "../../runtime/battle-prompt-messages";
import { parseBattleCardId, type BattleCardId, type DreamwellCardId, type PromptId } from "../../types/identifiers";

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
  /** Current replay draws, used only for visible own-hand discard emphasis. */
  readonly drawnForDiscard?: readonly InstanceId[];
  /** The committed state's top-level decision, when no step is in flight. */
  readonly decision: Decision | null;
  /** The presentation has finished every event before the prompt. */
  readonly presented: boolean;
  readonly notice: BattlePromptNoticeView | null;
  /** The loop on offer to the human, with the most repetitions one request may ask for. */
  readonly loopOffer: { readonly maxCount: number } | null;
  readonly cardView: EngineCardViewBuilder;
  /** Resolves the pinned public source UUID immediately before its prompt is shown. */
  readonly dreamwellCard?: (id: DreamwellCardId) => DreamwellCardModel | null;
  /** Public portrait metadata, identified by the Avatar source's side and exact UUID. */
  readonly avatars?: Readonly<Record<Side, Pick<MobileBattleStatusView, "avatar" | "avatarProfile">>>;
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
  /** Local actions, multi-route payments and the Offering payment pair use the existing choice panel. */
  readonly presentation?: "chooser";
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
export function promptViewFields(model: PromptHostModel): MobileBattleView["prompt"] {
  const {surface} = model;
  const choices = surfaceChoices(surface);
  return {host:model.host,surface:surface.kind === "waiting" ? {kind:"waiting",notice:surface.notice} : surface.kind === "picker" ? {kind:"picker",picker:surface.picker} : choices !== null ? {kind:"choice",choice:{key:choices.key,label:choices.label,options:choices.options.map(option=>({label:option.label})),canResolve:true,...(choices.presentation === undefined ? {} : {presentation:choices.presentation})}} : {kind:"none"}};
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
  const origin = prompt.purpose.source;
  const dreamwellSource = origin !== null && typeof origin !== "string" && origin.kind === "dreamwell"
    ? input.dreamwellCard?.(origin.id) ?? null
    : null;
  const avatarOrigin = origin !== null && typeof origin !== "string" && origin.kind === "avatar" ? origin : null;
  const avatar = avatarOrigin === null ? undefined : input.avatars?.[avatarOrigin.side];
  const avatarSource = avatar?.avatar !== null && avatar?.avatarProfile !== undefined &&
    avatar.avatarProfile.id === avatarOrigin?.id &&
    avatar.avatarProfile.unavailable !== true ? avatar : null;
  const sourceName = dreamwellSource?.displaySnapshot.name ?? sourceCard?.model.displaySnapshot.name ?? avatarSource?.avatar?.name ?? null;
  const sourceText = dreamwellSource?.displaySnapshot.renderedText ?? sourceCard?.model.displaySnapshot.renderedText ?? avatarSource?.avatarProfile?.ability ?? null;
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
        sourceName,
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
      const drawn = new Set(prompt.kind === "chooseCards" && prompt.purpose.role === "discard" && prompt.side === human
        ? input.drawnForDiscard ?? [] : []);
      const pickerCandidates = candidates.map(
        (instance): MobileBattleCardPickerCandidateView => ({
          instanceId: parseBattleCardId(instance.id),
          cardUuid: cardView(instance).model.cardId,
          owner: instance.controller,
          zone: candidateZone(instance, view),
          card: cardView(instance),
          highlighted: instance.controller === human && instance.zone === "hand" && drawn.has(instance.id) &&
            (prompt.allowed === undefined || prompt.allowed.some(answer => answer.includes(instance.id))),
        }),
      );
      const onBoard = pickerCandidates.every(
        (candidate) =>
          (candidate.zone === "hand" && candidate.owner === human) ||
          candidate.zone === "backRank" ||
          candidate.zone === "frontRank",
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
            selection: {min,max},
            canResolve: true,
            presentation: onBoard ? "board" : "gallery",
            // A current draw has selective emphasis; otherwise every legal candidate is ringed.
            ringCandidates: !pickerCandidates.some(candidate => candidate.highlighted),
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
        sourceName,
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
    case "chooseSlot":
      return choice(
        prompt,
        prompt.slots.map((slot, index) => ({
          copy: { kind: "position", rank: slot.rank, index: slot.index },
          answer: index,
        })),
        host({ heading: engineMovementPromptHeading(prompt.fieldSide, human, sourceName) }),
        sourceCard,
      );
    case "chooseMode": {
      const texts =
        prompt.purpose.role === "chooseOne" && sourceText !== null
          ? enginePromptModeTexts(sourceText, prompt.options.length)
          : null;
      return choice(
        prompt,
        prompt.options.map((option) => ({
          copy:
            option.route !== undefined ? { kind: "playRoute", route: option.route, ...(option.costs === undefined ? {} : { costs: option.costs }) } : prompt.purpose.role === "playRoute"
              ? { kind: "route", index: option.mode }
              : prompt.purpose.role === "voidRoute"
                ? { kind: "voidRoute", index: option.mode }
                : prompt.purpose.role === "choosePlayer"
                  ? { kind: "player", index: option.mode }
                  : prompt.purpose.role === "chooseCost"
                    ? { kind: "cost", index: option.mode, costs: prompt.costOptions?.[option.mode] ?? null }
                    : prompt.purpose.role === "chooseSubtype"
                      ? { kind: "subtype", index: option.mode, subtype: prompt.subtypes?.[option.mode] ?? null }
                      : { kind: "mode", index: option.mode, text: texts?.[option.mode] ?? null },
          answer: option.mode,
        })),
        host({}),
        sourceCard,
      );
    }
    case "confirm":
      return choice(
        prompt,
        prompt.purpose.role === "preventUnlessAbandons"
          ? [{ copy: { kind: "abandon" }, answer: true }, { copy: { kind: "decline" }, answer: false }]
          : [{ copy: { kind: "yes" }, answer: true }, { copy: { kind: "no" }, answer: false }],
        host({}),
        sourceCard,
      );
    case "payOrDecline":
      return choice(
        prompt,
        [{ copy: { kind: "pay", energy: prompt.energy }, answer: true }, { copy: { kind: "decline" }, answer: false }],
        host({}),
        sourceCard,
      );
  }
}

/** This exact Offering payment pair has labels that need the existing wrapping choice panel. */
function offeringPaymentChoice(prompt: PendingEnginePrompt): boolean {
  if (prompt.kind !== "chooseMode" || prompt.purpose.role !== "chooseCost" || prompt.costOptions?.length !== 2 ||
    prompt.options.length !== 2 || !prompt.options.every((option, index) => option.legal && option.mode === index)) return false;
  const [banish, discard] = prompt.costOptions;
  if (banish.length !== 1 || discard.length !== 1) return false;
  const first = banish[0], second = discard[0];
  return first.cost === "banishFromHand" && first.count === 1 && second.cost === "discard" && second.count === 1 &&
    Object.keys(second.filter).length === 0 && !("captureCost" in second && second.captureCost === true);
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
      ...((prompt.kind === "chooseMode" && (prompt.purpose.role === "playRoute" || prompt.purpose.role === "voidRoute") &&
        prompt.options.filter(option => option.legal && option.route !== undefined).length >= 3) || offeringPaymentChoice(prompt)
        ? { presentation: "chooser" as const } : {}),
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
