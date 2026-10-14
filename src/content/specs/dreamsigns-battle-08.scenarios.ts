/** D20: a held emblem resolves effective departure spark after the subject leaves or ceases. */
import { expect } from "vitest";
import { contentDreamsignDefinitions } from "../../engine/content-catalog";
import { all, characterYouControl, event, keyword, staticAbility } from "../../engine/dsl/builders";
import { triggered, triggeringCard, whenGainsSpark } from "../../engine/dsl/triggers";
import { abandon, gainAdditionalSpark, gainSpark, sequence, sparkModifier } from "../../engine/effects/primitives";
import { createEngine } from "../../engine/engine";
import type { EngineEvent } from "../../engine/events";
import { effectiveSpark } from "../../engine/rules/spark";
import { deserializeState, serializeState, stateHash } from "../../engine/state/hash";
import { opponent, type Side } from "../../engine/state/ids";
import { ScriptedSource } from "../../engine/steps/sources";
import { boardState } from "../../engine/testing/board";
import type { NamedScenario, ScenarioModule, ScenarioResult, ScenarioSpec } from "../../engine/testing/scenario";
import { SYNTHETIC as v, syntheticId, testCatalog } from "../../engine/testing/synthetic-cards";
import { parseDreamsignId } from "../../types/identifiers";
import { SYNTHETIC_ABANDONER } from "./abandonment-fixture";

const BLACK = parseDreamsignId("73efd845-6009-4686-860c-01c7f5b1c074");
const GOLD = parseDreamsignId("adc23870-55f8-4f23-b973-a358fc257414");
const RUNE = parseDreamsignId("dec81fa2-7865-448c-95bc-622b884cea9e");
const warriors = all(characterYouControl({ subtype: "Warrior" }));
const recipient = { ...v.vanilla1, id: syntheticId(0x24501), subtype: "Mage" as const,
  abilities: () => [keyword("cannotBeTargeted"), staticAbility(sparkModifier(warriors, 4))] };
const zeroRecipient = { ...recipient, id: syntheticId(0x24502), abilities: () => [keyword("cannotBeTargeted"),
  staticAbility(sparkModifier(warriors, -20)), triggered(whenGainsSpark(), gainAdditionalSpark(triggeringCard(), 1))] };
const boosted = { ...v.event0, id: syntheticId(0x24503), abilities: () => [event(sequence(gainSpark(warriors, 3), abandon("you", { subtype: "Warrior" })))] };
const zero = { ...v.event0, id: syntheticId(0x24504), abilities: () => [event(abandon("you", { subtype: "Warrior" }))] };
const local = createEngine(testCatalog([recipient, zeroRecipient, boosted, zero], {
  dreamsigns: contentDreamsignDefinitions().filter((entry) => [BLACK, GOLD, RUNE].includes(entry.id)),
}));
const deck = [v.event0.id, v.event0.id];
const gains = (events: readonly EngineEvent[]) => events.filter((e): e is Extract<EngineEvent, { kind: "sparkGained" }> => e.kind === "sparkGained");
const resolved = (events: readonly EngineEvent[], side: Side) => events.filter((e): e is Extract<EngineEvent, { kind: "triggerResolved" }> => e.kind === "triggerResolved" &&
  typeof e.source === "object" && e.source !== null && e.source.kind === "dreamsign" && e.source.side === side);
const scenarios: NamedScenario[] = [];
type Mode = "ordinary" | "copy" | "zero";
function signs(mode: Mode) { return mode === "copy" ? [BLACK, BLACK, GOLD, RUNE] : [BLACK]; }
function witness(side: Side, mode: Mode): ScenarioSpec {
  return { board: { active: side, phase: "day", [side]: { dreamsigns: signs(mode), front: [mode === "zero" ? v.vanilla0.id : v.vanilla2.id],
    back: [SYNTHETIC_ABANDONER.id, v.vanilla1.id], deck }, [opponent(side)]: { dreamsigns: [BLACK], back: [v.vanilla8.id], deck } },
    steps: (ids) => [{ side, action: { kind: "activate", source: ids[side].back[0]!, ability: 0 } }],
    answers: (ids) => [[ids[side].front[0]!]],
  };
}
function depart(side: Side, mode: Mode) {
  const initial = boardState(local.catalog, { active: side, phase: "day", [side]: { dreamsigns: signs(mode),
    back: [mode === "zero" ? zeroRecipient.id : recipient.id], hand: [mode === "zero" ? zero.id : boosted.id], deck,
    ...(mode === "copy" ? { figments: [{ slot: { rank: "front" as const, index: 0 },
      printing: { kind: "figmentCopy" as const, cardId: v.vanilla2.id, spark: 5 } }] } : { front: [v.vanilla2.id] }),
  }, [opponent(side)]: { dreamsigns: [BLACK], back: [v.vanilla8.id], deck } });
  const subject = initial.ids[side].front[0]!, target = initial.ids[side].back[0]!;
  const source = new ScriptedSource([[subject]]);
  const result = local.apply({ ...initial.state, config: { ...initial.state.config, autoAnswerForcedPrompts: false } }, side,
    { kind: "play", card: initial.ids[side].hand[0], from: "hand" }, source);
  source.assertExhausted();
  return { ...result, subject, target, other: initial.ids[opponent(side)].back[0]! };
}
for (const side of ["player", "enemy"] as const) {
  for (const mode of ["ordinary", "copy", "zero"] as const) {
    scenarios.push({ name: `${BLACK} ${side} ${mode} retained departure spark`, spec: witness(side, mode), check: (shared: ScenarioResult) => {
      expect(gains(shared.events).map((e) => e.amount).sort((a, b) => a - b)).toEqual(mode === "copy" ? [1, 2, 2] : [mode === "zero" ? 0 : 2]);
      expect(shared.state.instances[shared.ids[side].front[0]!].zone).toBe("void");
      expect(resolved(shared.events, opponent(side))).toEqual([]);
      const r = depart(side, mode);
      const expected = mode === "ordinary" ? 9 : mode === "copy" ? 13 : 0;
      expect(r.events).toContainEqual(expect.objectContaining({ kind: "leftPlay", instance: r.subject, spark: expected }));
      const recipientGains = gains(r.events).filter((e) => e.instance === r.target);
      expect(recipientGains.map((e) => e.amount).sort((a, b) => a - b)).toEqual(mode === "copy" ? [1, 13, 13] : [expected]);
      expect(recipientGains.every((e) => e.expiry.at === "never" && !e.additional)).toBe(true);
      expect(resolved(r.events, side)).toHaveLength(mode === "copy" ? 3 : 1);
      expect(resolved(r.events, opponent(side))).toEqual([]);
      expect(r.state.instances[r.other].status.gainedSpark).toBe(0);
      expect(effectiveSpark(r.state, local.catalog, r.target)).toBe(mode === "copy" ? 28 : 1 + expected);
      if (mode === "copy") {
        expect(r.events).toContainEqual(expect.objectContaining({ kind: "ceasedToExist", instance: r.subject }));
        expect(r.state.instances[r.subject]).toBeUndefined();
      } else if (mode === "ordinary") {
        expect(r.state.instances[r.subject].zone).toBe("void");
        expect(effectiveSpark(r.state, local.catalog, r.subject)).toBe(5);
        const loaded = deserializeState(serializeState(r.state));
        expect(stateHash(loaded)).toBe(stateHash(r.state));
        expect(loaded.instances[r.target].status.gainedSpark).toBe(9);
      } else {
        expect(gains(r.events).filter((e) => e.additional)).toEqual([]);
        expect(r.state.instances[r.target].status.gainedSpark).toBe(0);
      }
    } });
  }
}
export default { slug: "dreamsigns-battle-08", scenarios } satisfies ScenarioModule;
