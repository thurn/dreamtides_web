/** A single optional character play during an effect, with the ordinary planning and payment contracts. */
import { cardMatchesFilter } from "../continuous/characteristics";
import type { CardFilter } from "../dsl/types";
import { promptFingerprint } from "../prompts/fingerprint";
import type { AnswerFor, ChooseCardsPrompt, Prompt, PromptPurpose, PromptSpec } from "../prompts/types";
import { cloneState } from "../state/clone";
import type { InstanceId, Side } from "../state/ids";
import { planFeasibility } from "../steps/feasibility";
import { commitCardPlay, planCardPlay, type PreparedPlay } from "../steps/kinds/play";
import type { RecordedAnswer, StepContext } from "../steps/types";
import { purposeView } from "../view/view";
import { canPlayImmediately, immediatePlayRoutes } from "./timing";

export function playCharacterImmediately(ctx: StepContext, side: Side, filter: CardFilter, purpose: PromptPurpose): void {
  const prepare = (work: StepContext): { readonly card: InstanceId; readonly prepared: PreparedPlay } | null => {
    const candidates = work.state.sides[side].void.filter((id) =>
      cardMatchesFilter(work.state, work.catalog, id, filter) && canPlayImmediately(work.state, work.catalog, side, id));
    const [card] = candidates.length === 0 ? [] : work.choose<ChooseCardsPrompt>({
      kind: "chooseCards", side, purpose, candidates, min: 0, max: 1,
    });
    const selected = card === undefined ? null : { card, prepared: planCardPlay(work, card, immediatePlayRoutes(work.state, work.catalog, card), "void") };
    work.commitPoint();
    return selected;
  };
  const guard = planFeasibility(cloneState(ctx.state), ctx.catalog, (work) => { prepare(work); });
  const prefix: RecordedAnswer[] = [];
  // All actual decisions and observations pass through the enclosing native context. Only this plan's prefix is local.
  const guarded: StepContext = {
    ...ctx,
    observeEvent: ctx.observeEvent,
    choose<P extends Prompt>(spec: PromptSpec<P>, proof?: { readonly allAnswersPayable: true }): AnswerFor<P> {
      const raw = { ...spec, cancellable: false } as Prompt;
      const narrowed = guard.narrow(raw, prefix, proof?.allAnswersPayable);
      if (narrowed.unproven > 0 || narrowed.truncated) ctx.emit({ kind: "feasibilityBounded", side: raw.side,
        purpose: purposeView(raw.purpose, raw.side, ctx.state), unproven: narrowed.unproven, truncated: narrowed.truncated });
      if (narrowed.prompt.kind !== spec.kind) throw new Error("A play guard changed the prompt kind");
      const answer = ctx.choose(narrowed.prompt);
      prefix.push({ fingerprint: promptFingerprint(raw), value: answer });
      return answer as AnswerFor<P>;
    },
    commitPoint: () => ctx.commitPoint(),
    disclose: (who, cards) => ctx.disclose(who, cards),
    emit: (event) => ctx.emit(event),
    settlingKnowledge: (settle, run) => ctx.settlingKnowledge(settle, run),
    random: (stream) => ctx.random(stream),
    adopt: (state, events) => ctx.adopt(state, events),
  };
  const selected = prepare(guarded);
  if (selected !== null) commitCardPlay(ctx, selected.card, selected.prepared);
}
