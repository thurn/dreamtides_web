/** The normal opening deal, with selected original physical instances first. */
import type { InstanceId, Side } from "../state/ids";
import type { OpeningHandGuarantee } from "../state/types";
import type { StepContext } from "../steps/types";
import { drawCard } from "./resources";

export function drawGuaranteedOpeningHand(ctx: StepContext, side: Side, originalDeck: readonly InstanceId[], declarations: readonly OpeningHandGuarantee[]): void {
  const selected = new Map<InstanceId, OpeningHandGuarantee[]>();
  for (const declaration of declarations) {
    const instance = originalDeck[declaration.deckIndex];
    if (instance === undefined) throw new Error("Missing guaranteed original deck slot");
    const sources = selected.get(instance) ?? [];
    sources.push({ ...declaration });
    selected.set(instance, sources);
  }
  const deck = ctx.state.sides[side].deck;
  deck.splice(0, deck.length, ...selected.keys(), ...deck.filter(id => !selected.has(id)));
  // Forward through the native context so matching, observation and logging see one attributed event.
  const attributed: StepContext = {
    ...ctx,
    observeEvent: ctx.observeEvent,
    choose: (prompt, proof) => ctx.choose(prompt, proof),
    commitPoint: () => ctx.commitPoint(),
    disclose: (who, cards) => ctx.disclose(who, cards),
    emit(event) {
      const sources = event.kind === "cardDrawn" && event.instance !== null ? selected.get(event.instance) : undefined;
      if (event.kind === "cardDrawn" && event.instance !== null && sources !== undefined) {
        const printing = ctx.state.instances[event.instance]?.printing;
        if (printing?.kind !== "card") throw new Error("Guaranteed draw requires its original card printing");
        ctx.emit({ ...event, openingHandGuaranteed: { cardId: printing.cardId, sources } });
      } else ctx.emit(event);
    },
    settlingKnowledge: (settle, run) => ctx.settlingKnowledge(settle, run),
    random: stream => ctx.random(stream),
    adopt: (state, events) => ctx.adopt(state, events),
  };
  for (let count = 0; count < Math.max(ctx.state.config.openingHandSize[side], selected.size); count++) drawCard(attributed, side);
}
