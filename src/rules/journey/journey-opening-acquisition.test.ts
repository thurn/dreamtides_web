import { afterEach, describe, expect, it, vi } from "vitest";
import { clearGameProviders } from "../../session/providers/register-game-providers";
import { parseDeckEntryId } from "../../types/identifiers";
import type { FoldState } from "../fold-state";
import { journeyOpeningHandGuarantees } from "./journey-battle-init";
import { journeyModifierRegistry } from "./modifier-registry";
import { REGISTERED_MUG as MUG, REGISTERED_DOLL as DOLL, REGISTERED_STARTER as STARTER, MASK, TOAD, OTHER,
  openingCards, openingSign, openingEntry, productionOpeningInitial, openingAccepted, openingApply, openingPayload, openingTypePayload, openingBundle } from "./journey-battle-init-fixtures";

afterEach(clearGameProviders);
function copy(state: FoldState, targetHeldIndex: number) {
  const screen = state.journey.screen;
  if (screen.type !== "journeyDreamsign" || screen.choice.kind !== "copy") throw new Error("Expected copy permission");
  const choice = screen.choice, source = choice.sources[choice.index];
  return openingAccepted(state, "RESOLVE_DREAMSIGN_COPY", { sourceDreamsignId: source.dreamsignId, heldIndex: source.heldIndex,
    choiceIndex: choice.index, permissionSeq: choice.permissionSeq, targetHeldIndex, expectedTargetDreamsignId: state.journey.dreamsigns[targetHeldIndex].id });
}
function starter(state: FoldState, entryIds = [] as ReturnType<typeof parseDeckEntryId>[]) {
  const screen = state.journey.screen;
  if (screen.type !== "journeyStarterPurge") throw new Error("Expected starter permission");
  const choice = screen.choice, source = choice.sources[choice.index];
  return openingAccepted(state, "RESOLVE_STARTER_PURGE", { dreamsignId: source.dreamsignId, heldIndex: source.heldIndex,
    choiceIndex: choice.index, permissionSeq: choice.permissionSeq, entryIds });
}

describe("registered opening acquisition", () => {
  it("selects exactly one physical Event, logs UUIDs, and rejects an empty completion while a target exists", () => {
    const before = productionOpeningInitial(), rng = vi.fn(() => 0);
    const acquired = openingApply(before, "ADD_DREAMSIGN", { dreamsignId: MUG }, { rng });
    expect(acquired.outcome).toBe("applied");
    const pending = acquired.state, selected = pending.journey.deck[1];
    expect(openingApply(pending, "RESOLVE_OPENING_HAND_ENTRY", openingPayload(pending, null)).state).toBe(pending);
    const result = openingApply(pending, "RESOLVE_OPENING_HAND_ENTRY", openingPayload(pending, selected.entryId), { rng });
    expect(result.outcome).toBe("applied");
    expect(result.state.journey.dreamsigns[0].openingHandEntryId).toBe(selected.entryId);
    expect(result.state.journey.deck).toBe(before.journey.deck);
    expect(result.state.journey.screen).toEqual(before.journey.screen);
    expect(acquired.logRecords?.[0].fields).toMatchObject({ dreamsignId: MUG, heldIndex: 0, outcome: "prepared",
      eligibleEntries: before.journey.deck.slice(0, 2).map(entry => ({ entryId: entry.entryId, cardId: openingCards[0].id })) });
    expect(result.logRecords?.[0].fields).toMatchObject({ dreamsignId: MUG, heldIndex: 0, entryId: selected.entryId, selected: 1 });
    expect(rng).not.toHaveBeenCalled();
  });

  it("logs an initial limited result without a cursor and reacquires without an inherited binding", () => {
    const empty = productionOpeningInitial({ deck: [openingEntry("only-character", 2)] });
    const limited = openingApply(empty, "ADD_DREAMSIGN", { dreamsignId: MUG });
    expect(limited.outcome).toBe("applied"); expect(limited.state.journey.screen).toEqual(empty.journey.screen);
    expect(limited.logRecords?.[0].fields).toMatchObject({ outcome: "limited", eligibleEntries: [], choicePrepared: false });
    const before = productionOpeningInitial({ dreamsigns: [{ ...openingSign(MUG), openingHandEntryId: parseDeckEntryId("opening-second") }] });
    const acquired = openingAccepted(before, "ADD_DREAMSIGN", { dreamsignId: MUG, purgeIndex: 0 });
    expect(acquired.journey.dreamsigns[0].openingHandEntryId).toBeUndefined();
    const selected = openingAccepted(acquired, "RESOLVE_OPENING_HAND_ENTRY", openingPayload(acquired));
    expect(selected.journey.dreamsigns[0].openingHandEntryId).toBe(selected.journey.deck[0].entryId);
    const lost = openingAccepted(selected, "REMOVE_DREAMSIGN", { dreamsignId: MUG });
    const gained = openingAccepted(lost, "ADD_DREAMSIGN", { dreamsignId: MUG });
    expect(gained.journey.dreamsigns[0].openingHandEntryId).toBeUndefined();
    expect(gained.journey.screen).toMatchObject({ type: "journeyDreamsign", choice: { kind: "openingHand" } });
  });

  it.each([[MUG, DOLL], [DOLL, MUG]])("keeps full-record copying at its actual position in the acquired cursor: %s/%s", (...ids) => {
    const { before, result } = openingBundle(ids, { dreamsigns: [openingSign(OTHER)] });
    expect(result.outcome).toBe("applied"); let state = result.state;
    if (ids[0] === DOLL) {
      state = copy(state, 2);
      expect(state.journey.dreamsigns[1].openingHandEntryId).toBeUndefined();
      state = openingAccepted(state, "RESOLVE_OPENING_HAND_ENTRY", openingPayload(state));
      expect(state.journey.dreamsigns[1].openingHandEntryId).toBeUndefined();
      expect(state.journey.dreamsigns[2].openingHandEntryId).toBe(state.journey.deck[0].entryId);
    } else {
      state = openingAccepted(state, "RESOLVE_OPENING_HAND_ENTRY", openingPayload(state));
      state = copy(state, 1);
      expect(state.journey.dreamsigns[1]).toEqual(state.journey.dreamsigns[2]);
      expect(state.journey.dreamsigns[1].openingHandEntryId).toBe(state.journey.deck[0].entryId);
    }
    expect(state.journey.screen).toEqual(before.journey.screen);
  });

  it("earns two physical same-UUID sources, draws one declared entry with both attributions, and keeps a new copy distinct", () => {
    let state = openingBundle([MUG, MUG]).result.state;
    const target = state.journey.deck[1].entryId;
    state = openingAccepted(state, "RESOLVE_OPENING_HAND_ENTRY", openingPayload(state, target));
    state = openingAccepted(state, "RESOLVE_OPENING_HAND_ENTRY", openingPayload(state, target));
    expect(journeyOpeningHandGuarantees(state.journey, id => journeyModifierRegistry.lookup(id))).toEqual([
      { deckIndex: 1, entryId: target, dreamsignId: MUG, heldIndex: 0 }, { deckIndex: 1, entryId: target, dreamsignId: MUG, heldIndex: 1 },
    ]);
    const copied = { ...state.journey, deck: [openingEntry("new-copy"), ...state.journey.deck] };
    expect(journeyOpeningHandGuarantees(copied, id => journeyModifierRegistry.lookup(id)).map(source => source.deckIndex)).toEqual([2, 2]);
  });

  it("finishes starter purges first and allows only a null completion when their sole Event is gone", () => {
    const { before, result } = openingBundle([MUG, STARTER], { deck: [openingEntry("sole-event")] });
    expect(result.outcome).toBe("applied");
    expect(openingApply(result.state, "REMOVE_DREAMSIGN", { dreamsignId: MUG }).state).toBe(result.state);
    const pending = starter(result.state, [result.state.journey.deck[0].entryId]);
    expect(pending.journey.deck).toEqual([]);
    expect(openingApply(pending, "RESOLVE_OPENING_HAND_ENTRY", openingPayload(pending, before.journey.deck[0].entryId)).state).toBe(pending);
    const done = openingAccepted(pending, "RESOLVE_OPENING_HAND_ENTRY", openingPayload(pending, null));
    expect(done.journey.screen).toEqual(before.journey.screen);
    expect(done.journey.dreamsigns[0].openingHandEntryId).toBeUndefined();
  });

  it("retains the C12-only outer wrapper and exact starter/mandatory continuation", () => {
    const { before, result } = openingBundle([MUG, MASK, STARTER, DOLL], { dreamsigns: [openingSign(OTHER)] });
    let state = result.state;
    expect(state.journey.screen).toMatchObject({ type: "journeyDreamsign", choice: { kind: "typeRemap" } });
    state = openingAccepted(state, "RESOLVE_TYPE_REMAP", openingTypePayload(state));
    state = starter(state);
    state = openingAccepted(state, "RESOLVE_OPENING_HAND_ENTRY", openingPayload(state));
    state = copy(state, 1);
    expect(state.journey.typeRemap).toBe("Mage"); expect(state.journey.screen).toEqual(before.journey.screen);
  });

  it("carries an earned Mug through source-ordered Toad/C12 pauses and then the starter and Doll/Mug cursor", () => {
    const { before, result } = openingBundle([MUG, TOAD, MASK, MUG, STARTER, DOLL], { dreamsigns: [openingSign(OTHER)] });
    let state = result.state;
    expect(state.journey.screen).toMatchObject({ type: "journeyDreamsign", choice: { kind: "subtype", resume: {
      sourceIndex: 1, openingHandAcquisitions: [{ dreamsignId: MUG, heldIndex: 1, outcome: "prepared" }],
    } } });
    state = openingAccepted(state, "RESOLVE_JOURNEY_SUBTYPE", openingTypePayload(state));
    expect(state.journey.screen).toMatchObject({ type: "journeyDreamsign", choice: { kind: "subtype", current: { kind: "typeRemap" }, resume: { sourceIndex: 2 } } });
    state = openingAccepted(state, "RESOLVE_JOURNEY_SUBTYPE", openingTypePayload(state));
    state = starter(state);
    for (const heldIndex of [1, 4]) {
      expect(openingPayload(state).heldIndex).toBe(heldIndex);
      state = openingAccepted(state, "RESOLVE_OPENING_HAND_ENTRY", openingPayload(state));
    }
    state = copy(state, 1);
    expect(state.journey.screen).toEqual(before.journey.screen);
    expect(state.journey.typeRemap).toBe("Mage");
    expect(state.journey.deck.find(entry => entry.cardNumber === 2)?.typeChange?.subtype).toBe("Mage");
  });
});
