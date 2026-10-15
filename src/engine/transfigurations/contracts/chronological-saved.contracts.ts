/** Each accepted typed retained tuple is paired with its semantic-corruption counterpart. */
import { describe, expect, it } from "vitest";
import { createCatalog } from "../../catalog";
import { engineCardFromContent } from "../../content-catalog";
import { createEngine } from "../../engine";
import { createFoldAdapter } from "../../fold/slice";
import type { EngineLogRecord } from "../../log";
import type { Variant } from "../../dsl/types";
import { NO_PROMPTS } from "../../steps/sources";
import { parseEngineBattleFold } from "../../../rules/battle/fold";
import { FORM_FILLER, formContent } from "./transfigurations-01.fixtures";
import { chronologicalInit } from "./chronological.fixtures";
import { appendEngineTransfiguration } from "../../transfigurations";

const valid: Variant = { amplified: false, transfigurationApplications: [{ form: "Inspired" }, { form: "Inspired" }] };
const forged: Variant = { amplified: false, transfigurationApplications: [{ form: "Perfected", constituents: ["Inspired", "Enduring"] }] };
for (const side of ["player", "enemy"] as const) describe(`${side} saved tuple source authority`, () => {
  it("validates every typed captured origin against its associated catalog source", () => {
    const card = engineCardFromContent(formContent()), catalog = createCatalog([card, FORM_FILLER], []), engine = createEngine(catalog);
    const init = chronologicalInit(side, { cardId: card.id }, { cardId: FORM_FILLER.id }), base = engine.createBattle(init, NO_PROMPTS).state;
    const source = base.sides[side].hand[0], recipient = base.sides[side].deck[0];
    const origin = (variant: Variant) => ({ kind: "card", cardId: card.id, variant });
    const tuple = (variant: Variant) => ({ printing: { kind: "card", cardId: card.id }, variant });
    const queue = (variant: Variant) => ({ source, controller: side, origin: origin(variant), ability: 0, node: null, subject: null });
    const stack = (variant: Variant) => ({ kind: "ability", source, controller: side, origin: origin(variant), ability: 0, x: null, optionalPaid: [], choices: { modes: [], targets: [] } });
    const floating = (change: unknown) => ({ id: "e1", source, controller: side, timestamp: 0, expiry: { at: "never" }, change });
    const cases: readonly [string, (variant: Variant) => object][] = [
      ["stack own origin", v => ({ ...base, stack: [stack(v)] })],
      ["stack gained source", v => ({ ...base, stack: [{ ...stack({ amplified: false }), origin: { ...origin({ amplified: false }), gained: [{ cardId: card.id, variant: v }] } }] })],
      ["queue own origin", v => ({ ...base, triggerQueue: [queue(v)] })],
      ["queue gained source", v => ({ ...base, triggerQueue: [{ ...queue({ amplified: false }), origin: { ...origin({ amplified: false }), gained: [{ cardId: card.id, variant: v }] } }] })],
      ["captured hand copy", v => ({ ...base, triggerQueue: [{ ...queue({ amplified: false }), subject: source, handCopy: { ...tuple(v), ephemeral: false, copier: side, originalHiddenFrom: [] } }] })],
      ["captured abandoned copy", v => ({ ...base, triggerQueue: [{ ...queue({ amplified: false }), subject: source, abandonedCopy: tuple(v) }] })],
      ["captured abandoned named origin", v => ({ ...base, triggerQueue: [{ ...queue({ amplified: false }), subject: source, abandonedNamed: { source, origin: origin(v), controller: side, observedBy: [side], entries: [] } }] })],
      ["nested causing occurrence", v => ({ ...base, triggerQueue: [{ ...queue({ amplified: false }), triggeringAbility: { named: "dawn", occurrence: queue(v) } }] })],
      ["floating gained source", v => ({ ...base,
        sides: { ...base.sides, [side]: { ...base.sides[side], deck: base.sides[side].deck.filter(id => id !== recipient), backRank: [recipient, ...Array.from({ length: 9 }, () => null)] } },
        instances: { ...base.instances, [recipient]: { ...base.instances[recipient], zone: "play", status: { ...base.instances[recipient].status, gainedAbilities: [{ cardId: card.id, variant: v }] } } },
        floating: [{ ...floating({ kind: "abilities", instance: recipient, cardId: card.id, variant: v }), source: recipient, expiry: { at: "sourceLeavesPlay", source: recipient } }] })],
      ["delayed source origin", v => ({ ...base, floating: [floating({ kind: "trigger", ref: { origin: origin(v), ability: 0, node: 0 }, once: true })] })],
      ["ceased played source", v => ({ ...base, nextInstance: 1000, firstEventHistory: { current: null, previous: null }, turnLog: { ...base.turnLog, played: { player: [], enemy: [], [side]: [{ instance: "i999", cardType: "event", subtype: "", allTypes: false, copiable: tuple(v) }] } } })],
      ["current first-event source", v => ({ ...base, nextInstance: 1000, firstEventHistory: { current: { player: null, enemy: null, [side]: { instance: "i999", ...tuple(v) } }, previous: null }, turnLog: { ...base.turnLog, played: { player: [], enemy: [], [side]: [{ instance: "i999", cardType: "event", subtype: "", allTypes: false, copiable: tuple(v) }] } } })],
      ["previous first-event source", v => ({ ...base, nextInstance: 1000, turn: { ...base.turn, turnNumber: 2 }, firstEventHistory: { current: null, previous: { player: null, enemy: null, [side]: { instance: "i999", ...tuple(v) } } } })],
    ];
    for (const [label, build] of cases) {
      const fold = (variant: Variant) => ({ init, slice: { committed: build(variant), inFlight: null, publishedEvents: 0, attempt: 0 } });
      expect(parseEngineBattleFold(fold(valid), catalog), label).not.toBeNull();
      const invalid = fold(forged), bytes = JSON.stringify(invalid);
      expect(parseEngineBattleFold(invalid, catalog), label).toBeNull();
      expect(JSON.stringify(invalid), label).toBe(bytes);
    }
  });
  it("logs exact initialized records and Perfected snapshots through the real fold callback", () => {
    const card = engineCardFromContent(formContent()), catalog = createCatalog([card, FORM_FILLER], []);
    const variant = appendEngineTransfiguration(card, valid, "Perfected");
    const init = chronologicalInit(side, { cardId: card.id, ...variant }, { cardId: FORM_FILLER.id });
    const records: EngineLogRecord[] = [], adapter = createFoldAdapter(createEngine(catalog), { log: record => records.push(record) });
    expect(adapter.start(init).kind).toBe("applied");
    const started = records.find(record => record.event === "engine.battleStarted");
    if (started?.event !== "engine.battleStarted") throw new Error("Missing initialized battle log");
    expect(JSON.parse(JSON.stringify(started.init))).toEqual(init);
    expect(started.init.decks[side][0].cardId).toBe(card.id);
    expect(started.init.decks[side][0].transfigurationApplications).toEqual(variant.transfigurationApplications);
  });
});
