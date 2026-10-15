import { describe, expect, it } from "vitest";
import { deckModsFromUnknown } from "../../../engine/dsl/deck-mods";
import { cardLabFixture, cardLabBattle } from "../../../engine/testing/card-lab";
import { createEngine } from "../../../engine/engine";
import { SYNTHETIC, syntheticId, testCatalog } from "../../../engine/testing/synthetic-cards";
import { PolicyRandom } from "../../../engine/policy/random";
import { battleSeed } from "../../../engine/state/ids";
import { randomDeck, SYNTHETIC_FUZZ_POOL } from "../../../engine/testing/fuzz";
import { parseRuntimeConfig } from "../../../runtime/runtime-config";
import { buildQaScene, buildQaSceneBattle, findQaScene } from "../../../runtime/qa-scenes";
import { battleSceneContent, SCENE_OPTIONS } from "../../../runtime/qa-scenes.fixtures";
import { makeAuguryTestCard } from "../../../journey_v2/testing/fixtures";
import { createFoldAdapter } from "../../../engine/fold/slice";
import { withHistory } from "../../../engine/debug/debug-actions";
import { parseCardSubtype } from "../../../types/card-identity";

const mods = { sparkBonus: 2, costReduction: 1, fast: true, reclaim: 0, typeChange: { cardType: "character", subtype: "Mage:Prime" } };
const json = JSON.stringify(mods);
const sceneCardId = syntheticId(0x62901);

function scene(side: "player" | "enemy", raw = json, stage?: string, extra = "") {
  const card = makeAuguryTestCard({ id: sceneCardId, cardNumber: 62901, energyCost: 2, spark: 2 });
  const content = battleSceneContent();
  content.cardDatabase.set(card.cardNumber, card);
  const id = parseRuntimeConfig(`?goto=card-lab&card=${card.id}&as=${side}&mods=${encodeURIComponent(raw)}${stage === undefined ? "" : `&labStage=${encodeURIComponent(stage)}`}${extra}`).gotoScene;
  if (id == null) throw new Error("Lab URL did not parse");
  const journey = buildQaScene(id, content, SCENE_OPTIONS);
  if (journey === null) throw new Error("Lab scene did not build");
  const battle = buildQaSceneBattle(id, content, journey);
  return { id, content, journey, battle };
}

describe("deck modification preparation boundaries", () => {
  it("defaults absent fields, preserves signed additive values and clones nested input", () => {
    expect(deckModsFromUnknown({})).toEqual({ sparkBonus: 0, costReduction: 0, fast: false, reclaim: null, typeChange: null });
    const parsed = deckModsFromUnknown(mods);
    expect(parsed).toEqual(mods);
    expect(parsed.typeChange).not.toBe(mods.typeChange);
    expect(deckModsFromUnknown({ sparkBonus: -1 }).sparkBonus).toBe(-1);
  });

  it("rejects malformed direct requests before any fixture or input can change", () => {
    const engine = createEngine(testCatalog());
    const malformed: unknown[] = [null, [], 1, "{}", { unknown: 1 }, { fast: 1 }, { sparkBonus: 0.5 }, { sparkBonus: NaN }, { sparkBonus: Infinity }, { sparkBonus: Number.MAX_SAFE_INTEGER + 1 }, { sparkBonus: undefined }, { costReduction: -1 }, { reclaim: -1 }, { reclaim: undefined }, { typeChange: undefined }, { typeChange: { cardType: "Character", subtype: "Mage" } }, { typeChange: { cardType: "character", subtype: 1 } }, { typeChange: { cardType: "event", subtype: "", extra: 1 } }];
    for (const input of malformed) {
      expect(() => deckModsFromUnknown(input)).toThrow();
      const entry = { cardId: SYNTHETIC.vanilla2.id, deckMods: input as ReturnType<typeof deckModsFromUnknown> };
      const before = structuredClone(entry);
      expect(() => cardLabFixture(engine, { entry, side: "player", variant: "base" }, [SYNTHETIC.vanilla2])).toThrow();
      expect(entry).toEqual(before);
    }
  });

  it.each(["player", "enemy"] as const)("carries URL mods beside the declared stage to real physical %s instances and replay", side => {
    const built = scene(side, json, "{}");
    expect(findQaScene(built.id)?.cardLab).toMatchObject({ stage: "{}", mods: json });
    const subjectEntry = built.journey.deck.find(e => e.cardNumber === 62901);
    expect(subjectEntry).toMatchObject({ sparkBonus: 2, keywordModification: { energyCostReduction: 1, fast: true, setReclaim: 0 }, typeChange: { subtype: "Mage:Prime" } });
    const state = built.battle?.engine?.slice.committed;
    if (state === undefined) throw new Error("Missing real lab battle");
    const subject = Object.values(state.instances).find(i => i.owner === side && i.printing.kind === "card" && i.printing.cardId === sceneCardId);
    expect(subject).toMatchObject({ variant: { deckMods: mods }, controller: side, zone: "hand" });
    const report = (globalThis as { __cardLab?: unknown }).__cardLab;
    expect(report).toMatchObject({ status: "ready", requestedMods: json, deckMods: mods, cardType: "Character" });
    const engine = createEngine(testCatalog());
    const lab = cardLabBattle(engine, { entry: { cardId: SYNTHETIC.vanilla2.id, deckMods: deckModsFromUnknown(mods) }, variant: "base", side, stage: {} }, [SYNTHETIC.vanilla2]);
    const base = withHistory(lab.slice);
    const physical = base.committed.sides[side].hand[0];
    const adapter = createFoldAdapter(engine);
    const intent = { kind: "battleAction", side, action: { kind: "play", card: physical, from: "hand" } } as const;
    const wrong = adapter.reduce(base, { ...intent, side: side === "player" ? "enemy" : "player" });
    expect(wrong.kind).toBe("bounced");
    expect(adapter.reduce(JSON.parse(JSON.stringify(base)) as typeof base, intent)).toEqual(adapter.reduce(base, intent));
    expect(base.committed.instances[physical].variant.deckMods).toEqual(mods);
  });

  it("retains JSON case/colon bytes without a stage and refuses duplicate or malformed mods atomically", () => {
    const valid = scene("player");
    expect(findQaScene(valid.id)?.cardLab).toMatchObject({ mods: json });
    for (const [raw, extra] of [["{", ""], ["{}", "&mods=%7B%7D"], ['{"typeChange":{"cardType":"event","subtype":"","extra":1}}', ""]]) {
      const rejected = scene("player", raw, undefined, extra);
      expect(rejected.journey.deck.some(e => e.cardNumber === 62901)).toBe(false);
      expect((globalThis as { __cardLab?: unknown }).__cardLab).toMatchObject({ status: "rejected", reason: "invalidMods", deckMods: null });
    }
  });

  it("preserves explicit empty-stage refusal beside the absent-stage modifier slot", () => {
    const noMods = parseRuntimeConfig(`?goto=card-lab&card=${sceneCardId}&labStage=`).gotoScene;
    if (noMods == null) throw new Error("Empty-stage URL did not parse");
    expect(findQaScene(noMods)?.cardLab?.stage).toBe("");
    scene("player", json, "");
    expect((globalThis as { __cardLab?: unknown }).__cardLab).toMatchObject({ status: "rejected", reason: "invalidStage" });
  });

  it("generates typed random mods reproducibly without altering target UUIDs or the synthetic pool", () => {
    const before = SYNTHETIC_FUZZ_POOL.cards.map(card => ({ id: card.id, cardType: card.cardType, costs: card.costs, subtype: card.subtype }));
    const pool = { ...SYNTHETIC_FUZZ_POOL, weightedCardIds: [SYNTHETIC_FUZZ_POOL.cards[0].id] };
    const seed = battleSeed("deck-mods-preparation");
    const deck = randomDeck(new PolicyRandom(seed), pool);
    expect(randomDeck(new PolicyRandom(seed), pool)).toEqual(deck);
    expect(deck[0].cardId).toBe(pool.weightedCardIds[0]);
    for (const entry of deck) expect(deckModsFromUnknown(entry.deckMods)).toEqual(entry.deckMods);
    class Controlled extends PolicyRandom {
      override next() { return 0.75; }
      override pick<T>(values: readonly T[]): T { return values[values.length - 1]; }
    }
    const controlled = randomDeck(new Controlled(seed), pool);
    expect(controlled.every(entry => entry.deckMods?.sparkBonus === 2 && entry.deckMods.costReduction === 2 && entry.deckMods.reclaim === 2 && entry.deckMods.typeChange?.cardType === "event")).toBe(true);
    class FastControlled extends Controlled { override next() { return 0; } }
    expect(randomDeck(new FastControlled(seed), pool).every(entry => entry.deckMods?.fast === true)).toBe(true);
    expect(SYNTHETIC_FUZZ_POOL.cards.map(card => ({ id: card.id, cardType: card.cardType, costs: card.costs, subtype: card.subtype }))).toEqual(before);
    expect(parseCardSubtype("Mage:Prime")).toBe(mods.typeChange.subtype);
  });

});
