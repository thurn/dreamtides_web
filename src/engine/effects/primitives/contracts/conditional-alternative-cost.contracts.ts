/** Conditional replacement routes and captured entry-only readiness through actual public play. */
import { describe, expect, it } from "vitest";
import { activated, additionalCost, all, anyCharacter, characterYouControl, conditionalAlternativeCost, energy, energyX, event, playCondition, reclaim, self, sourceWasAlternativePlayed, sourceWasReclaimed, stackItem, staticAbility } from "../../../dsl/builders";
import { triggered, whenHandBecomesEmpty } from "../../../dsl/triggers";
import { playPermission } from "../../../continuous/permissions";
import { canPlay, canPlayImmediately, playRoutes } from "../../../rules/timing";
import { SIDES, opponent } from "../../../state/ids";
import { cloneState } from "../../../state/clone";
import { Context } from "../../../steps/context";
import { NO_PROMPTS } from "../../../steps/sources";
import { invariantViolations } from "../../../testing/invariants";
import { SYNTHETIC as v, syntheticId } from "../../../testing/synthetic-cards";
import { passUntil } from "../../../testing/trigger-harness";
import { revealToBoth } from "../../../view/knowledge";
import { costModifier } from "../cost-modifier";
import { costSetter } from "../cost-setter";
import { copyCard } from "../copy-card";
import { disableTriggers } from "../disable-triggers";
import { gainPoints } from "../gain-points";
import { playFromZone, playSelfFromZone } from "../play-from-zone";
import { playImmediately } from "../play-immediately";
import { prevent } from "../prevent";
import { returnToHand } from "../return-to-hand";
import { reclaimNotBanished } from "../reclaim-not-banished";
import { sequence } from "../sequence";
import { abandonCost } from "../../../dsl/builders";
import { materialize, moveToHand } from "../../../rules/zones";
import { conditionalAnswers, conditionalCard, conditionalFixture, survivor, survivorCondition } from "./conditional-alternative-cost-support";
import { testCardSubtype } from "../../../../types/test-identities";

const ready = (f: ReturnType<typeof conditionalFixture>, state: typeof f.state) => passUntil(f.engine, state, s => s.stack.length === 0).state;
describe.each(SIDES)("conditional alternative payment by %s", side => {
  const other = opponent(side);
  it("qualifies only the alternative, using the actual controller's public characters", () => {
    for (const qualifies of [false, true]) {
      const f = conditionalFixture(side, undefined, { back: qualifies ? [survivor.id] : [] }, { back: [survivor.id] });
      expect(playRoutes(f.state, f.engine.catalog, f.id, "hand")).toEqual(qualifies ? ["hand", "alternativeCost"] : ["hand"]);
      expect(canPlay(f.state, f.engine.catalog, side, f.id, "hand")).toBe(true);
      const paid = f.engine.apply(f.state, side, f.action, conditionalAnswers(qualifies ? "alternativeCost" : "normal").source);
      expect(paid.state.sides[side].currentEnergy).toBe(qualifies ? 9 : 6);
      expect(paid.state.instances[f.id].status.playedViaAlternativeCost).toBe(qualifies);
      expect(ready(f, paid.state).instances[f.id].status.exhausted).toBe(!qualifies);
      expect(invariantViolations(paid.state, f.engine.catalog)).toEqual([]);
    }
  });
  it("does not offer a denied replacement when only it would be affordable", () => {
    const f = conditionalFixture(side, undefined, { back: [], energy: 1 });
    expect(canPlay(f.state, f.engine.catalog, side, f.id, "hand")).toBe(false);
    expect(f.engine.legalActions(f.state, side).some(a => a.kind === "play" && a.card === f.id)).toBe(false);
  });
  it("requires independent void access, naming the exact physical source and its variant", () => {
    const c = conditionalCard(10, { fields: { abilities: variant => [conditionalAlternativeCost(survivorCondition, [energy(1)]),
      ...(variant.amplified ? [staticAbility(playSelfFromZone("void"), { zone: "void", while: survivorCondition })] : [])] } });
    const f = conditionalFixture(side, c, { void: [c.id, c.id] }, {}, [], "void");
    const actual = cloneState(f.state); actual.instances[f.id] = { ...actual.instances[f.id], variant: { amplified: true } };
    expect(playPermission(actual, f.engine.catalog, f.id, side)).not.toBeNull();
    expect(playPermission(actual, f.engine.catalog, f.ids[side].void[1], side)).toBeNull();
    expect(canPlay(actual, f.engine.catalog, side, f.id, "void")).toBe(true);
    expect(canPlay(actual, f.engine.catalog, side, f.ids[side].void[1], "void")).toBe(false);
    const entered = ready(f, f.engine.apply(actual, side, f.action, conditionalAnswers().source).state);
    expect(entered.instances[f.id].zone).toBe("play"); expect(entered.instances[f.id].status.playedViaAlternativeCost).toBe(true);
    const denied = conditionalFixture(side, undefined, { back: [] }, {}, [], "void");
    expect(canPlay(denied.state, denied.engine.catalog, side, denied.id, "void")).toBe(false);
  });
  it("uses a foreign owner's hand card for its actual holder's qualification and payment", () => {
    const f = conditionalFixture(side, undefined, { hand: [], back: [survivor.id] }, { hand: [conditionalCard().id, v.interruptEvent.id] });
    const actual = cloneState(f.state); const id = f.ids[other].hand[0];
    moveToHand(new Context(actual, f.engine.catalog, NO_PROMPTS), id, side);
    expect(actual.instances[id].owner).toBe(other);
    expect(playRoutes(actual, f.engine.catalog, id, "hand")).toEqual(["hand", "alternativeCost"]);
    const paid = f.engine.apply(actual, side, { kind: "play", card: id, from: "hand" }, conditionalAnswers().source);
    expect(paid.state.sides[side].currentEnergy).toBe(9); expect(paid.state.sides[other].currentEnergy).toBe(10);
    expect(paid.state.instances[id].controller).toBe(side);
  });
  it("permits only the identified owned deck top and never supplies deck access itself", () => {
    const c = conditionalCard(12, { permission: false });
    const provider = { ...survivor, id: syntheticId(0x698120), abilities: () => [staticAbility(playFromZone("deck", { cardType: "character" }))] };
    const f = conditionalFixture(side, c, { back: [provider.id] }, {}, [provider], "deck");
    const known = cloneState(f.state); revealToBoth(known, [f.id]);
    expect(canPlay(known, f.engine.catalog, side, f.id, "deck")).toBe(true);
    expect(canPlay(known, f.engine.catalog, other, f.id, "deck")).toBe(false);
    expect(canPlay(f.state, f.engine.catalog, side, f.id, "deck")).toBe(false);
    expect(f.engine.apply(known, side, f.action, conditionalAnswers().source).state.sides[side].currentEnergy).toBe(9);
  });
  it("keeps global requirements, timing and reserved capacity effective", () => {
    const c = conditionalCard(13, { extras: [playCondition({ cond: "energyAtLeast", amount: 11 })] });
    const denied = conditionalFixture(side, c); expect(canPlay(denied.state, denied.engine.catalog, side, denied.id, "hand")).toBe(false);
    const full = conditionalFixture(side, undefined, { back: Array.from({ length: 10 }, () => survivor.id) });
    expect(canPlay(full.state, full.engine.catalog, side, full.id, "hand")).toBe(false);
    const wrong = cloneState(full.state); wrong.turn.phase = "night";
    expect(canPlay(wrong, full.engine.catalog, side, full.id, "hand")).toBe(false);
  });
  it("captures entry readiness without granting a keyword, including a payment consuming qualification", () => {
    const c = conditionalCard(14, { extras: [additionalCost(abandonCost())] });
    const f = conditionalFixture(side, c); const paid = f.engine.apply(f.state, side, f.action, conditionalAnswers().source);
    expect(paid.state.instances[f.ids[side].back[0]!].zone).toBe("void");
    expect(paid.state.stack[0]).toMatchObject({ instance: f.id, materializesAwakened: true });
    const entered = ready(f, paid.state); expect(entered.instances[f.id].status.exhausted).toBe(false);
    expect(f.engine.view(entered, side).instances[f.id].characteristics.keywords).not.toContain("awakened");
  });
  it("uses the selected entry option after a copiable-definition fixture change, never a later declaration", () => {
    for (const selected of [false, true]) {
      const c = conditionalCard(15, { entry: selected }); const replacement = conditionalCard(16, { entry: !selected });
      const f = conditionalFixture(side, c, {}, {}, [replacement]); const paid = f.engine.apply(f.state, side, f.action, conditionalAnswers().source).state;
      const changed = cloneState(paid); changed.instances[f.id] = { ...changed.instances[f.id], printing: { kind: "card", cardId: replacement.id } };
      const entered = ready(f, changed); expect(entered.instances[f.id].status.exhausted).toBe(!selected);
      expect(f.engine.view(entered, side).instances[f.id].characteristics.keywords).not.toContain("awakened");
    }
  });
  it("preserves latest play history on effect-only reentry without applying an old entry option", () => {
    const f = conditionalFixture(side); const entered = ready(f, f.engine.apply(f.state, side, f.action, conditionalAnswers().source).state);
    const actual = cloneState(entered); const ctx = new Context(actual, f.engine.catalog, NO_PROMPTS);
    moveToHand(ctx, f.id, side); expect(materialize(ctx, f.id, side)).toBe(true);
    expect(actual.instances[f.id].status).toMatchObject({ exhausted: true, playedViaAlternativeCost: true });
  });
  it("retains selected X/additional/tax composition while excluding the normal base setter", () => {
    const c = conditionalCard(17, { printed: [energy(4), energyX()], extras: [additionalCost(energy(1))] });
    const provider = { ...survivor, id: syntheticId(0x698121), abilities: () => [staticAbility(costSetter("you", { cardType: "character" }, 0)), staticAbility(costModifier("you", { cardType: "character" }, 2))] };
    const f = conditionalFixture(side, c, { back: [provider.id] }, {}, [provider]);
    const paid = f.engine.apply(f.state, side, f.action, conditionalAnswers().source);
    expect(paid.state.sides[side].currentEnergy).toBe(6); expect(paid.state.stack[0].x).toBe(0);
  });
  it("gives a real stack copy neither an alternative play history nor the chosen entry option", () => {
    const copier = { ...v.interruptEvent, id: syntheticId(0x698122), abilities: () => [event(copyCard({ kind: "stackTarget" as const, selector: stackItem({ cardType: "character" }) }))] };
    const f = conditionalFixture(side, undefined, {}, { hand: [copier.id] }, [copier]);
    const paid = f.engine.apply(f.state, side, f.action, conditionalAnswers().source);
    const copied = f.engine.apply(paid.state, other, { kind: "play", card: f.ids[other].hand[0], from: "hand" }, conditionalAnswers().source);
    const record = copied.events.find(e => e.kind === "cardCopied"); if (record?.kind !== "cardCopied") throw new Error("Missing copy");
    expect(copied.state.instances[record.copy].status).toMatchObject({ playedViaAlternativeCost: false, exhausted: true });
    expect(copied.events.filter(e => e.kind === "cardPlayed" && e.instance === record.copy)).toEqual([]);
  });
  it("keeps payment but produces no entry when an actual Interrupt prevents the chosen play", () => {
    const stopper = { ...v.interruptEvent, id: syntheticId(0x698123), abilities: () => [event(prevent({ kind: "stackItem" as const, controller: "opponent" as const }))] };
    const f = conditionalFixture(side, undefined, {}, { hand: [stopper.id] }, [stopper]);
    const paid = f.engine.apply(f.state, side, f.action, conditionalAnswers().source);
    const reply = f.engine.apply(paid.state, other, { kind: "play", card: f.ids[other].hand[0], from: "hand" }, conditionalAnswers().source);
    const done = ready(f, reply.state); expect(done.instances[f.id].zone).toBe("void");
    expect(done.sides[side].currentEnergy).toBe(9); expect(done.instances[f.id].status.playedViaAlternativeCost).toBe(true);
  });
  it("supplies only owned void access during an immediate play, using that actual payer's condition", () => {
    const c = conditionalCard(18, { permission: false });
    const source = { ...v.event0, id: syntheticId(0x698124), abilities: () => [event(playImmediately("void"))] };
    for (const qualifies of [false, true]) {
      const f = conditionalFixture(side, c, { hand: [source.id], void: [c.id], back: qualifies ? [survivor.id] : [], energy: 5 }, { back: [survivor.id], void: [c.id] }, [source], "void");
      expect(canPlayImmediately(f.state, f.engine.catalog, other, f.id)).toBe(false);
      const cast = f.engine.apply(f.state, side, { kind: "play", card: f.ids[side].hand[0], from: "hand" }, NO_PROMPTS);
      const played = f.engine.apply(cast.state, other, { kind: "pass" }, conditionalAnswers("alternativeCost", { target: [f.id] }).source);
      expect(played.state.sides[side].currentEnergy).toBe(qualifies ? 4 : 1);
      expect(played.state.instances[f.id].status.playedViaAlternativeCost).toBe(qualifies);
      expect(played.state.instances[f.ids[other].void[0]].zone).toBe("void");
      expect(ready(f, played.state).instances[f.id].status.exhausted).toBe(!qualifies);
    }
  });
  it("records the committed replacement method at the empty hand admission boundary", () => {
    const watcher = { ...v.vanilla1, id: syntheticId(0x698125), abilities: () => [triggered(whenHandBecomesEmpty(), gainPoints(1))] };
    const c = conditionalCard(19, { extras: [activated([], sequence(disableTriggers(all(anyCharacter()), "permanent", sourceWasAlternativePlayed()), returnToHand(self())))] });
    const f = conditionalFixture(side, c, { back: [survivor.id, watcher.id] }, {}, [watcher]);
    const entered = ready(f, f.engine.apply(f.state, side, f.action, conditionalAnswers().source).state);
    const activation = f.engine.apply(entered, side, { kind: "activate", source: f.id, ability: 2 }, NO_PROMPTS);
    const returned = ready(f, activation.state); expect(returned.instances[f.id].zone).toBe("hand");
    const before = returned.sides[side].score;
    const normal = f.engine.apply(returned, side, f.action, conditionalAnswers("normal").source);
    expect(normal.state.instances[f.id].status.playedViaAlternativeCost).toBe(false);
    expect(normal.state.sides[side].score - before).toBe(1);
  });
  it.each(["normal", "alternativeCost"] as const)("records a coherent Reclaim and alternative method pair before a later %s play empties the hand", route => {
    const oldType = testCardSubtype("Reclaim watcher"), newType = testCardSubtype("Alternative watcher");
    const keeper = { ...survivor, id: syntheticId(0x698180), abilities: () => [staticAbility(reclaimNotBanished())] };
    const oldWatcher = { ...v.vanilla1, id: syntheticId(0x698181), subtype: oldType,
      abilities: () => [triggered(whenHandBecomesEmpty(), gainPoints(1))] };
    const newWatcher = { ...v.vanilla1, id: syntheticId(0x698182), subtype: newType,
      abilities: () => [triggered(whenHandBecomesEmpty(), gainPoints(2))] };
    const c = conditionalCard(20, { extras: [reclaim(energy(0)), activated([], sequence(
      disableTriggers(all(characterYouControl({ subtype: oldType })), "permanent", sourceWasReclaimed()),
      disableTriggers(all(characterYouControl({ subtype: newType })), "permanent", sourceWasAlternativePlayed()), returnToHand(self())))] });
    const f = conditionalFixture(side, c, { back: [keeper.id, oldWatcher.id, newWatcher.id] }, {}, [keeper, oldWatcher, newWatcher], "void");
    const mode = playRoutes(f.state, f.engine.catalog, f.id, "void").indexOf("reclaim"); expect(mode).toBeGreaterThanOrEqual(0);
    const entered = ready(f, f.engine.apply(f.state, side, f.action, conditionalAnswers("normal", { voidRoute: mode }).source).state);
    expect(entered.instances[f.id].status).toMatchObject({ reclaimed: true, playedViaReclaim: true, playedViaAlternativeCost: false });
    const activation = f.engine.apply(entered, side, { kind: "activate", source: f.id, ability: 3 }, NO_PROMPTS);
    const returned = ready(f, activation.state);
    expect(returned.instances[f.id].zone).toBe("hand"); expect(returned.sides[side].hand).toEqual([f.id]);
    expect(returned.instances[f.id].status).toMatchObject({ reclaimed: false, playedViaReclaim: true, playedViaAlternativeCost: false });
    const before = returned.sides[side].score;
    const replayed = f.engine.apply(returned, side, { kind: "play", card: f.id, from: "hand" }, conditionalAnswers(route).source);
    expect(replayed.state.instances[f.id].status).toMatchObject({ reclaimed: false, playedViaReclaim: false, playedViaAlternativeCost: route === "alternativeCost" });
    expect(replayed.state.sides[side].currentEnergy).toBe(route === "alternativeCost" ? 9 : 6);
    expect(replayed.events.filter(event => event.kind === "handEmptied" && event.side === side)).toHaveLength(1);
    expect(replayed.state.sides[side].score - before).toBe(route === "alternativeCost" ? 1 : 3);
  });
});
