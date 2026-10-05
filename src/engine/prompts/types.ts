import type { CardId, InstanceId, Side } from "../state/ids";

/** Why a prompt was raised: its source and the role of the choice. */
export interface PromptPurpose {
  readonly source: InstanceId | null;
  readonly cardId: CardId | null;
  readonly ability: number | null;
  readonly role: string;
}

/** A suspended prompt's identity: `${committed.version}:${answers.length}`. */
export type PromptId = string & { readonly __brand: "PromptId" };

interface PromptBase {
  /** Assigned by the fold; absent in inline runs. */
  readonly id?: PromptId;
  /** The side that answers. */
  readonly side: Side;
  readonly purpose: PromptPurpose;
  /** Only before the commit point of the acting side's own play or activation. */
  readonly cancellable: boolean;
  /** Cards revealed only to the chooser. */
  readonly privateTo?: Side;
}

/** Choose between `min` and `max` of the listed instances. */
export interface ChooseCardsPrompt extends PromptBase {
  readonly kind: "chooseCards";
  readonly candidates: readonly InstanceId[];
  readonly min: number;
  readonly max: number;
}

export type Prompt = ChooseCardsPrompt;

export type Answer = readonly InstanceId[];

export type AnswerFor<P extends Prompt> = P extends ChooseCardsPrompt
  ? readonly InstanceId[]
  : never;
