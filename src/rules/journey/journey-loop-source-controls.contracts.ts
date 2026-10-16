import { TRANSFIGURATION_RULES } from "../../content/transfiguration";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as contentCatalog from "../../engine/content-catalog";
import { ENGINE_TRANSFIGURATIONS } from "../../engine/transfigurations";
import { activated, energy } from "../../engine/dsl/builders";
import type { AbilityList } from "../../engine/dsl/types";
import type { CardDefinition } from "../../content/define";
import { createJourneyTransfigurationProvider } from "../../session/providers/journey-transfiguration-provider";
import { clearGameProviders } from "../../session/providers/register-game-providers";
import { registerReplayFixtureProviders } from "../replay/fixture-providers";
import { createJourneyModifierRegistry } from "./modifier-registry";
import { journeyOnGain } from "./journey-on-gain";
import { journeyPurge } from "./journey-purge";
import { journeyDraft } from "./journey-draft";
import { journeyDeckEntry } from "./journey-deck-entry";
import { journeyTransfiguration } from "./journey-transfiguration";
import { testDreamsignId } from "../../types/test-identities";
import { registerJourneyTransfigurationProvider } from "./journey-transfiguration";
import { accept, apply, afterBattle, CARD_ID, ENTRY_ID, fixture, LOOP, requestLoop, resolveWindow } from "./journey-loop.fixtures";
import { parseCardSubtype } from "../../types/card-identity";
import type { CardData } from "../../types/cards";

describe("journey loop source authority controls", () => {
  afterEach(() => { vi.restoreAllMocks(); clearGameProviders(); registerReplayFixtureProviders(); });
  it.each(["replacement", "removal"] as const)("keeps the actual captured UUID/number mapping after content map %s", operation => {
    const f = fixture({ authored: true });
    const map: Map<number, CardData> = f.content.cardDatabase;
    if (operation === "removal") map.delete(f.base.cardNumber);
    else map.set(f.base.cardNumber, { ...f.neighbor, cardNumber: f.base.cardNumber, renderedText: "Opaque changed source" });
    const out = accept(f);
    expect(out.outcome).toBe("applied"); expect(out.state.journey).toHaveProperty("journeyDraw.cause.cardId", CARD_ID);
    expect(f.provider.resolve(out.state.journey.deck[0])?.cardId).toBe(CARD_ID);
  });
  it.each(["resolve", "apply", "validateRecord"] as const)("does not retain a proof over replaced provider.%s", method => {
    const f = fixture();
    const changed = Reflect.set(f.provider, method, () => null);
    const out = accept(f);
    if (changed) { expect(requestLoop(f.provider)?.ok).toBe(false); expect(out.state.journey).not.toHaveProperty("journeyDraw"); }
    else expect(out.state.journey).toHaveProperty("journeyDraw.result", "draw");
  });
  it("does not use a captured capability after the currently consumed provider is swapped", () => {
    const f = fixture();
    registerJourneyTransfigurationProvider({ ...f.provider });
    const out = accept(f);
    expect(out.outcome).toBe("applied"); expect(out.state.journey.essence).toBe(23);
    expect(out.state.journey).not.toHaveProperty("journeyDraw");
  });
  it("settles an earned child finitely after a compatible public provider swap", () => {
    const f = afterBattle(fixture()), first = resolveWindow(f, f.state);
    expect(first.state.journey).toHaveProperty("pendingJourneyLoop");
    registerJourneyTransfigurationProvider({ ...f.provider });
    const out = resolveWindow(f, first.state, []);
    expect(out.outcome).toBe("applied"); expect(out.state.journey.deck[0].transfigurationApplications).toHaveLength(2);
    expect(out.state.journey).not.toHaveProperty("journeyDraw");
  });
  it("refuses a factory callback copied into an incompatible definition", () => {
    const f = fixture(), definition = f.registry.lookup(LOOP)!;
    expect(() => createJourneyModifierRegistry([{ ...definition, journeyDeckEntry: { kind: "warriorSpark", amount: 2 } }])).toThrow(RangeError);
    expect(() => createJourneyModifierRegistry([{ ...definition, dreamsignId: f.state.journey.dreamsigns[0].id, journeyLoopContinuation: { kind: "mandatoryOriginalTransfiguration", cardId: f.neighbor.id } }])).toThrow(RangeError);
  });
  it("rejects arbitrary held callbacks before constructing a closed registry", () => {
    const f = fixture(), loop = f.registry.lookup(LOOP)!, id = testDreamsignId("loop-opaque-sibling");
    let calls = 0;
    const opaque = { dreamsignId: id, afterJourneyEvent: () => { calls++; return null; } };
    expect(() => createJourneyModifierRegistry([loop, opaque])).toThrow(RangeError);
    expect(() => createJourneyModifierRegistry([opaque])).not.toThrow(); expect(calls).toBe(0);
  });
  it("accepts actual canonical producers and rejects mutable descriptor replacements or accessors", () => {
    const f = fixture(), loop = f.registry.lookup(LOOP)!, id = testDreamsignId("loop-canonical-sibling");
    const definitions = [journeyOnGain(id, { kind: "copyOwnedDreamsignOnGain" }), journeyPurge(id, { kind: "beforeBattlePurge", minimumDeckSize: 1 }),
      journeyDraft(id, { kind: "fewerDraftChoices", fewerCards: 1 }), journeyDeckEntry(id, { kind: "warriorSpark", amount: 1 }), journeyTransfiguration(id, { kind: "copyTransfiguredEvent" })];
    const keys = ["journeyOnGain", "journeyPurge", "journeyDraft", "journeyDeckEntry", "journeyTransfiguration"] as const;
    definitions.forEach((definition, index) => {
      expect(() => createJourneyModifierRegistry([loop, { ...definition }])).not.toThrow();
      const forged = { ...definition }, descriptor: unknown = Reflect.get(definition, keys[index]);
      if (typeof descriptor !== "object" || descriptor === null) throw new Error("Canonical descriptor missing");
      Reflect.set(forged, keys[index], { ...descriptor });
      expect(() => createJourneyModifierRegistry([loop, forged])).toThrow(RangeError);
      const accessor = { ...definition }; let calls = 0;
      Object.defineProperty(accessor, keys[index], { enumerable: true, get: () => { calls++; return descriptor; } });
      expect(() => createJourneyModifierRegistry([loop, accessor])).toThrow(RangeError); expect(calls).toBe(0);
      const callback = { ...definition, afterJourneyEvent: () => null };
      expect(() => createJourneyModifierRegistry([loop, callback])).toThrow(RangeError);
    });
  });
  it("refuses changed compiled form callbacks while preserving an ordinary valid application", () => {
    const f = fixture(), form = ENGINE_TRANSFIGURATIONS.find(form => form.id === "Kindled")!;
    const transform = form.transform;
    try {
      Reflect.set(form, "transform", (card: Parameters<typeof transform>[0]) => card);
      expect(requestLoop(f.provider)?.ok).toBe(false);
      const out = accept(f); expect(out.outcome).toBe("applied"); expect(out.state.journey).not.toHaveProperty("journeyDraw");
    } finally { Reflect.set(form, "transform", transform); }
  });
  it("refuses changed shared rule primitives before claiming a draw", () => {
    const f = fixture(), minimum = TRANSFIGURATION_RULES.perfected.minimumEligibleForms;
    try {
      Reflect.set(TRANSFIGURATION_RULES.perfected, "minimumEligibleForms", minimum + 1);
      expect(requestLoop(f.provider)?.ok).toBe(false);
      const out = accept(f); expect(out.outcome).toBe("applied"); expect(out.state.journey).not.toHaveProperty("journeyDraw");
    } finally { Reflect.set(TRANSFIGURATION_RULES.perfected, "minimumEligibleForms", minimum); }
  });
  it.each(["empty", "missing anchor"] as const)("refuses a %s executable choice catalog", mode => {
    const f = fixture(), content = { ...f.content, transfigurationData: { ...f.data, forms: mode === "empty" ? [] : f.data.forms.filter(form => form.id !== "Kindled") } };
    expect(requestLoop(createJourneyTransfigurationProvider(content))?.ok).toBe(false);
  });
  it.each(["Character", "Event"] as const)("executes every currently legal %s form and preserves its unexhausted anchor across growing histories", cardType => {
    const f = fixture({ authored: true, cardType }), entry = f.state.journey.deck[0], anchor = cardType === "Character" ? "Kindled" : "Inspired";
    const forms = f.provider.resolve(entry)!.applicableForms!;
    expect(forms).toContain("Perfected");
    for (const form of forms) {
      let result = f.provider.apply!(entry, form);
      expect(result.ok).toBe(true); if (!result.ok) throw new Error("Expected actual legal form");
      for (let index = 0; index < 5; index++) {
        expect(f.provider.resolve(result.value)?.applicableForms).toContain(anchor);
        result = f.provider.apply!(result.value, anchor);
        expect(result.ok).toBe(true); if (!result.ok) throw new Error("Expected actual anchor append");
      }
      expect(result.value.transfigurationApplications).toHaveLength(6);
    }
    expect(accept(f).state.journey).toHaveProperty("journeyDraw.proof.anchor", anchor);
  });
  it("executes the same immutable ability capture after the original producer and returned DSL are mutated", () => {
    const base = activated([energy(2)], { op: "draw", count: 1, player: "you" }, { oncePerTurn: true });
    let calls = 0, fail = false;
    const f = fixture({ authored: true, abilities: variant => { calls++; if (fail) throw new Error("Caller producer replaced"); return variant.amplified ? [] : [base]; } });
    const entry = f.state.journey.deck[0], before = f.provider.apply!(entry, "Resonant");
    expect(before.ok).toBe(true); expect(calls).toBe(2);
    Reflect.set(base, "oncePerTurn", false); fail = true;
    expect(f.provider.apply!(entry, "Resonant")).toEqual(before); expect(calls).toBe(2);
    expect(requestLoop(f.provider)?.ok).toBe(true); expect(accept(f).state.journey).toHaveProperty("journeyDraw.result", "draw"); expect(calls).toBe(2);
  });
  it.each(["forms", "rules"] as const)("refuses a producer that changes canonical %s during source capture", changed => {
    const form = ENGINE_TRANSFIGURATIONS.find(form => form.id === "Resonant")!, eligible = form.eligible;
    const minimum = TRANSFIGURATION_RULES.perfected.minimumEligibleForms;
    const base = activated([energy(2)], { op: "draw", count: 1, player: "you" }, { oncePerTurn: true });
    let mutating = true, f: ReturnType<typeof fixture> | undefined;
    try {
      f = fixture({ authored: true, unsupported: true, abilities: variant => {
        if (mutating) { if (changed === "forms") Reflect.set(form, "eligible", () => false); else Reflect.set(TRANSFIGURATION_RULES.perfected, "minimumEligibleForms", minimum + 1); }
        return variant.amplified || changed === "forms" ? [] : [base];
      } });
    } finally { mutating = false; Reflect.set(form, "eligible", eligible); Reflect.set(TRANSFIGURATION_RULES.perfected, "minimumEligibleForms", minimum); }
    if (f === undefined) throw new Error("Capture fixture failed");
    expect(requestLoop(f.provider)?.ok).toBe(false);
    const out = accept(f); expect(out.outcome).toBe("applied"); expect(out.state.journey).not.toHaveProperty("journeyDraw");
  });
  it("validates all literal Resonant restrictions with actual source execution", () => {
    const ability = () => activated([energy(2)], { op: "draw", count: 1, player: "you" }, { oncePerTurn: true });
    const f = fixture({ authored: true, renderedText: "2●: Draw a card. Once per turn.\n2●: Draw a card. Once per turn.", abilities: variant => variant.amplified ? [] : [ability(), ability()] });
    expect(requestLoop(f.provider)?.ok).toBe(true);
    const once = f.provider.apply!(f.state.journey.deck[0], "Resonant"); expect(once.ok).toBe(true); if (!once.ok) throw new Error("Resonant once");
    const twice = f.provider.apply!(once.value, "Resonant"); expect(twice.ok).toBe(true); if (!twice.ok) throw new Error("Resonant twice");
    expect(f.provider.resolve(twice.value)?.applicableForms).not.toContain("Resonant");
    expect(accept(f).state.journey).toHaveProperty("journeyDraw.result", "draw");
  });
  it.each(["mismatched restriction", "opaque payload"] as const)("refuses %s capture without bouncing an ordinary valid action", reason => {
    const opaque = { kind: "event", effect: { op: "draw", count: 1, player: "you" } } as const;
    Reflect.set(opaque.effect, "opaque", () => 1);
    const abilities: AbilityList = reason === "mismatched restriction" ? () => [] : () => [opaque];
    const f = fixture({ authored: true, abilities, unsupported: true });
    expect(requestLoop(f.provider)?.ok).toBe(false); expect(accept(f).outcome).toBe("applied");
  });
  it.each(["type", "subtype", "spark", "speed", "cost"] as const)("refuses a default constructor whose CardData %s disagrees with the executor", field => {
    const f = fixture();
    const authored: CardDefinition = { id: "e7550000-0000-4000-8000-000000000001", name: "Synthetic", mtgName: "Synthetic", cardNumber: 7551,
      cardType: "Character", subtype: "Warrior", rarity: "Common", energyCost: 6, spark: 3, isFast: false, isInterrupt: false,
      renderedText: "", isStarter: false, artOwned: true, imageNumber: 7551, tags: [], vanilla: true };
    const definition = contentCatalog.engineCardFromContent(authored);
    const base = { ...f.base, ...(field === "type" ? { cardType: "Event" as const, spark: null } : field === "subtype" ? { subtype: parseCardSubtype("Wizard") } : field === "spark" ? { spark: 4 } : field === "speed" ? { isFast: true } : { energyCost: 7 }) };
    const content = { ...f.content, cardDatabase: new Map([[base.cardNumber, base]]) };
    const spy = vi.spyOn(contentCatalog, "contentCardDefinitions").mockReturnValue([definition]);
    let provider;
    try { provider = createJourneyTransfigurationProvider(content); } finally { spy.mockRestore(); }
    expect(requestLoop(provider)?.ok).toBe(false);
  });
  it("keeps proof refusal separate from ordinary action validation", () => {
    const f = fixture({ held: [] });
    const out = apply(f, f.state, "ACCEPT_TRANSFIGURATION_CHOICE", { entryId: ENTRY_ID, siteId: "wrong" });
    expect(out.outcome).toBe("bounced"); expect(out.state).toBe(f.state);
  });
});
