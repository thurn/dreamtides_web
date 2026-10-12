import { expect, it } from "vitest";
import { createEngine } from "../engine";
import type { EngineCardDefinition } from "../catalog";
import { cycleHash, loopSignature } from "../loops/signature";
import { createFoldAdapter, type BattleSlice } from "../fold/slice";
import { addFloating } from "../rules/floating";
import { drawCard } from "../rules/resources";
import { shuffleDeck } from "../rules/shuffle";
import { ceaseToExist, dissolve, materialize, moveInstance } from "../rules/zones";
import { cloneState } from "../state/clone";
import { deserializeState, serializeState, stateHash } from "../state/hash";
import { battleSeed, opponent, SIDES, type InstanceId, type Side } from "../state/ids";
import type { BattleState } from "../state/types";
import { Context } from "../steps/context";
import { NO_PROMPTS } from "../steps/sources";
import { boardState } from "../testing/board";
import { comparableView, determinizationDivergences } from "../testing/determinization-fidelity";
import { redactionViolations, strings } from "../testing/redaction";
import { SYNTHETIC, syntheticId, testCatalog } from "../testing/synthetic-cards";
import { NO_DECK_MODS } from "../dsl/types";
import { variantOf } from "../state/create";
import { keyword } from "../dsl/builders";
import type { ChooseNumberPrompt } from "../prompts/types";
import { view } from "./view";
import { rememberKnownCards } from "./knowledge";
import type { Decklists } from "./determinize";

const veiled: EngineCardDefinition = { ...SYNTHETIC.vanilla2, id: syntheticId(0x436), abilities: () => [keyword("veil")] };
const engine = createEngine(testCatalog([veiled]));
const context = (state: BattleState) => new Context(state, engine.catalog, NO_PROMPTS);
function decklists(state: BattleState): Decklists {
  const entries = (side: Side) => Object.values(state.instances).flatMap((card) =>
    card.owner === side && card.printing.kind === "card" && !card.status.created ? [{ cardId: card.printing.cardId, ...card.variant }] : []);
  return { player: entries("player"), enemy: entries("enemy") };
}
function hiddenFixture(owner: Side = "enemy") {
  const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", [owner]: {
    back: [veiled.id, veiled.id], deck: [veiled.id],
  } });
  const target = ids[owner].back[0]!;
  const ctx = context(state);
  state.instances[target].status.gainedSpark = 4;
  state.instances[target].status.playedViaReclaim = true;
  dissolve(ctx, target, opponent(owner));
  const lists = decklists(state);
  moveInstance(ctx, target, "deck");
  shuffleDeck(state, owner);
  return { state, target, sibling: ids[owner].back[1]!, lists, owner };
}
function findBuff(state: BattleState): InstanceId {
  const card = Object.values(state.instances).find((instance) => instance.status.gainedSpark === 4);
  if (card === undefined) throw new Error("missing observed status");
  return card.id;
}

it.each(SIDES)("keeps observed permanent spark, played-Reclaim status and lost Veil through %s hidden draw/materialize", (owner) => {
  const { state, target, lists } = hiddenFixture(owner);
  const seen = engine.view(state, "player");
  expect(seen.hiddenCards?.[owner]).toHaveLength(1);
  expect(redactionViolations(state, engine.catalog)).toEqual([]);
  expect(strings(seen).has(target)).toBe(false);
  const sampled = engine.determinize(seen, lists, () => 0.31);
  expect(comparableView(view(sampled, "player", engine.catalog))).toEqual(comparableView(seen));
  const buff = findBuff(sampled);
  const copied = sampled.instances[buff];
  expect(copied.status.playedViaReclaim).toBe(true);
  expect(copied.status.exhausted).toBe(false);
  // Move every anonymous slot through the ordinary draw path; the owner learns
  // each dealt card and the permanent record remains attached to its stand-in.
  const ctx = context(sampled);
  while (sampled.sides[owner].deck.length > 0) drawCard(ctx, owner);
  expect(copied.zone).toBe("hand");
  expect(materialize(ctx, buff, owner)).toBe(true);
  const publicCard = view(sampled, "player", engine.catalog).instances[buff];
  expect(publicCard.characteristics.spark).toBe(6);
  expect(publicCard.characteristics.keywords).not.toContain("veil");
  expect(publicCard.status.playedViaReclaim).toBe(true);
  const effect = sampled.floating.find((entry) => entry.change.kind === "keyword" && entry.change.instance === buff);
  expect(effect?.source).toBe(buff);
  expect(view(sampled, "player", engine.catalog).floating.find((entry) => entry.id === effect?.id)?.source).toBe(buff);
});

it("keeps hidden ordering and later private status/effect changes out of both view and sample", () => {
  const { state, lists, target, owner } = hiddenFixture();
  const seen = engine.view(state, "player");
  const altered = cloneState(state);
  altered.sides[owner].deck.reverse();
  altered.instances[target].status.gainedSpark = 99;
  altered.instances[target].status.ephemeral = true;
  addFloating(context(altered), { controller: owner, source: target, expiry: { at: "never" },
    change: { kind: "keyword", instance: target, keyword: "vengeful", gains: true } });
  rememberKnownCards(altered);
  expect(engine.view(altered, "player")).toEqual(seen);
  expect(stateHash(engine.determinize(engine.view(altered, "player"), lists, () => 0.31)))
    .toBe(stateHash(engine.determinize(seen, lists, () => 0.31)));
  expect(determinizationDivergences(engine, altered, lists, battleSeed("private-status"), 0)).toEqual([]);
});

it("assigns duplicate printing/variant descriptors once and gives captured cohorts their corresponding statuses", () => {
  const { state, target, sibling, lists } = hiddenFixture();
  state.instances[sibling].status.gainedSpark = 7;
  moveInstance(context(state), sibling, "deck");
  shuffleDeck(state, "enemy");
  state.floating.push({ id: "e80", controller: "player", source: { kind: "avatar", side: "player" }, timestamp: state.clock,
    expiry: { at: "never" }, change: { kind: "trigger", once: true,
      ref: { origin: { kind: "card", cardId: veiled.id, variant: { amplified: false } }, ability: 0, node: 0 }, captured: [sibling, target, sibling] } });
  state.nextEffect = 81;
  const seen = engine.view(state, "player");
  const sampled = engine.determinize(seen, lists, () => 0.7);
  const capture = sampled.floating.find((entry) => entry.id === "e80")?.change;
  if (capture?.kind !== "trigger") throw new Error("missing captured trigger");
  const [first, second, repeated] = capture.captured ?? [];
  expect(first).toBe(repeated);
  expect(first).not.toBe(second);
  expect(sampled.instances[first].status.gainedSpark).toBe(7);
  expect(sampled.instances[second].status.gainedSpark).toBe(4);
  expect(comparableView(view(sampled, "player", engine.catalog))).toEqual(comparableView(seen));
  expect(determinizationDivergences(engine, state, lists, battleSeed("duplicates"), 0)).toEqual([]);
});

it("assigns observed status to the exact deck-entry variant among duplicate printings", () => {
  const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", enemy: { back: [veiled.id, veiled.id], deck: [veiled.id] } });
  const [base, amplified] = ids.enemy.back as InstanceId[];
  state.instances[base].status.gainedSpark = 4;
  state.instances[amplified] = { ...state.instances[amplified], variant: { amplified: true } };
  state.instances[amplified].status.gainedSpark = 7;
  const lists = decklists(state);
  const ctx = context(state);
  moveInstance(ctx, base, "deck");
  moveInstance(ctx, amplified, "deck");
  shuffleDeck(state, "enemy");
  const sampled = engine.determinize(engine.view(state, "player"), lists, () => 0.7);
  expect(findBuff(sampled)).toBeDefined();
  expect(sampled.instances[findBuff(sampled)].variant.amplified).toBe(false);
  expect(Object.values(sampled.instances).find((card) => card.variant.amplified)?.status.gainedSpark).toBe(7);
  expect(determinizationDivergences(engine, state, lists, battleSeed("variant-observation"), 0)).toEqual([]);
});

it.each(["status", "effect", "memory"] as const)("fidelity detects a raw sampled %s drop independently of its stored descriptor", (drop) => {
  const { state, lists } = hiddenFixture();
  const lossy = { ...engine, determinize: (...args: Parameters<typeof engine.determinize>) => {
    const sampled = engine.determinize(...args);
    if (drop === "status") sampled.instances[findBuff(sampled)].status.gainedSpark = 0;
    if (drop === "effect") sampled.floating = sampled.floating.filter((entry) => entry.change.kind !== "keyword");
    if (drop === "memory") delete sampled.rememberedCards;
    return sampled;
  } };
  expect(determinizationDivergences(lossy, state, lists, battleSeed("raw-loss"), 0)
    .some((problem) => problem.startsWith("player's") && problem.includes("anonymous card descriptors"))).toBe(true);
});

it.each(["visible", "hidden", "ceased"] as const)("preserves a previously observed external %s source when its target becomes hidden and returns public", (sourceState) => {
  const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", enemy: {
    back: [veiled.id, SYNTHETIC.vanilla1.id], deck: [veiled.id],
  } });
  const [target, source] = ids.enemy.back as InstanceId[];
  const ctx = context(state);
  addFloating(ctx, { controller: "enemy", source, expiry: { at: "never" },
    change: { kind: "keyword", instance: target, keyword: "veil", gains: false } });
  let lists = decklists(state);
  addFloating(ctx, { controller: "enemy", source, expiry: { at: "never" },
    change: { kind: "cardCost", instance: target, mode: "increase", amount: 1 } });
  if (sourceState === "hidden") {
    moveInstance(ctx, source, "deck");
    shuffleDeck(state, "enemy");
  } else if (sourceState === "ceased") {
    ceaseToExist(ctx, source);
    // The decklist still identifies cards originally dealt but ceased cards
    // are absent from the current inventory, so trim the fixture remainder.
    lists = { ...lists, enemy: lists.enemy.filter((entry) => entry.cardId !== SYNTHETIC.vanilla1.id) };
  }
  ctx.emit({ kind: "sparkGained", instance: target, amount: 0, expiry: { at: "never" }, additional: false });
  moveInstance(ctx, target, "deck");
  shuffleDeck(state, "enemy");
  const seen = engine.view(state, "player");
  const sampled = engine.determinize(seen, lists, () => 0.6);
  expect(comparableView(view(sampled, "player", engine.catalog))).toEqual(comparableView(seen));
  const change = sampled.floating.find((entry) => entry.change.kind === "keyword");
  if (change === undefined || !("instance" in change.change) || change.change.instance === null) throw new Error("missing permanent change");
  expect(materialize(context(sampled), change.change.instance, "enemy")).toBe(true);
  const targetState = cloneState(sampled);
  const targetPublic = view(sampled, "player", engine.catalog);
  const targetRoundtrip = engine.determinize(targetPublic, lists, () => 0.6);
  expect(comparableView(view(targetRoundtrip, "player", engine.catalog))).toEqual(comparableView(targetPublic));
  expect(view(targetRoundtrip, "player", engine.catalog).instances[change.change.instance].characteristics.keywords).not.toContain("veil");
  if (typeof change.source !== "string") throw new Error("expected card source provenance");
  if (sourceState === "visible") expect(change.source).toBe(source);
  else if (sourceState === "hidden") {
    expect(typeof change.source).toBe("string");
    const restoredSource = sampled.instances[change.source];
    expect(restoredSource.printing).toEqual({ kind: "card", cardId: SYNTHETIC.vanilla1.id });
    expect(materialize(context(sampled), restoredSource.id, "enemy")).toBe(true);
    expect(view(sampled, "player", engine.catalog).floating.find((entry) => entry.id === change.id)?.source).toBe(restoredSource.id);
  } else {
    expect(sampled.instances[change.source]).toBeUndefined();
    expect(view(sampled, "player", engine.catalog).floating.find((entry) => entry.change.kind === "cardCost")?.source).toBeNull();
    expect(Number((change.source).slice(1))).toBeLessThan(sampled.nextInstance);
  }
  const returned = view(sampled, "player", engine.catalog);
  expect(returned.instances[change.change.instance].characteristics.keywords).not.toContain("veil");
  const again = engine.determinize(returned, lists, () => 0.6);
  expect(comparableView(view(again, "player", engine.catalog))).toEqual(comparableView(returned));
  expect(view(again, "player", engine.catalog).instances[change.change.instance].characteristics.keywords).not.toContain("veil");
  expect(determinizationDivergences(engine, cloneState(sampled), lists, battleSeed("public-return"), 0)).toEqual([]);
  const lossy = { ...engine, determinize: (...args: Parameters<typeof engine.determinize>) => {
    const copy = engine.determinize(...args);
    copy.floating = copy.floating.filter((entry) => entry.id !== change.id);
    return copy;
  } };
  expect(determinizationDivergences(lossy, cloneState(sampled), lists, battleSeed("public-effect-loss"), 0)
    .some((problem) => problem.startsWith("player's") && problem.includes(`floating effect ${change.id} missing`))).toBe(true);
  if (sourceState !== "visible") {
    const fabricated = { ...engine, determinize: (...args: Parameters<typeof engine.determinize>) => {
      const copy = engine.determinize(...args);
      copy.floating = copy.floating.map((effect) => effect.id === change.id ? { ...effect, source: { kind: "avatar", side: "enemy" } } : effect);
      return copy;
    } };
    expect(determinizationDivergences(fabricated, targetState, lists, battleSeed("fabricated-source"), 0)
      .some((problem) => problem.startsWith("player's") && problem.includes("observed fixed effects"))).toBe(true);
    const reversed = { ...engine, determinize: (...args: Parameters<typeof engine.determinize>) => {
      const copy = engine.determinize(...args);
      copy.floating.reverse();
      return copy;
    } };
    expect(determinizationDivergences(reversed, targetState, lists, battleSeed("reordered-effects"), 0)
      .some((problem) => problem.startsWith("player's") && problem.includes("observed fixed effects"))).toBe(true);
  }
  if (sourceState === "ceased") expect(returned.floating.find((entry) => entry.id === change.id)?.source).toBeNull();
});

it("samples serialized observed printing and variant data independently of object key order", () => {
  const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", enemy: { back: [veiled.id, veiled.id, SYNTHETIC.vanilla1.id], deck: [veiled.id] } });
  const target = ids.enemy.back[0]!;
  state.instances[target] = { ...state.instances[target], variant: variantOf({ cardId: veiled.id, deckMods: { ...NO_DECK_MODS, sparkBonus: 1 } }) };
  const visible = ids.enemy.back[1]!;
  state.instances[visible] = { ...state.instances[visible], variant: variantOf({ cardId: veiled.id, deckMods: { ...NO_DECK_MODS, sparkBonus: 2 } }) };
  state.instances[target].status.gainedSpark = 4;
  const source = ids.enemy.back[2]!;
  addFloating(context(state), { controller: "enemy", source, expiry: { at: "never" },
    change: { kind: "keyword", instance: target, keyword: "veil", gains: false } });
  addFloating(context(state), { controller: "enemy", source: { kind: "avatar", side: "enemy" }, expiry: { at: "never" },
    change: { kind: "keyword", instance: target, keyword: "awakened", gains: true } });
  ceaseToExist(context(state), source);
  const lists = decklists(state);
  moveInstance(context(state), target, "deck");
  shuffleDeck(state, "enemy");
  const reverseObjects = (value: unknown): unknown => Array.isArray(value) ? value.map(reverseObjects)
    : value !== null && typeof value === "object" ? Object.fromEntries(Object.entries(value).reverse().map(([key, entry]) => [key, reverseObjects(entry)])) : value;
  const reordered = deserializeState(JSON.stringify(state, (key: string, value: unknown) => key === "rememberedCards" ? reverseObjects(value) : value));
  const seen = view(reordered, "player", engine.catalog);
  const sampled = engine.determinize(seen, lists, () => 0.7);
  expect(comparableView(view(sampled, "player", engine.catalog))).toEqual(comparableView(seen));
  expect(determinizationDivergences(engine, reordered, lists, battleSeed("reordered-observations"), 0)).toEqual([]);
  expect(materialize(context(reordered), target, "enemy")).toBe(true);
  expect(determinizationDivergences(engine, cloneState(reordered), lists, battleSeed("reordered-public-effects"), 0)).toEqual([]);
  const returned = view(reordered, "player", engine.catalog);
  const again = engine.determinize(returned, lists, () => 0.7);
  expect(comparableView(view(again, "player", engine.catalog))).toEqual(comparableView(returned));
  const changedAvatar = { ...engine, determinize: (...args: Parameters<typeof engine.determinize>) => {
    const copy = engine.determinize(...args);
    copy.floating = copy.floating.map((effect) => typeof effect.source !== "string" && effect.source.kind === "avatar"
      ? { ...effect, source: { kind: "avatar", side: opponent(effect.source.side) } } : effect);
    return copy;
  } };
  expect(determinizationDivergences(changedAvatar, cloneState(reordered), lists, battleSeed("changed-avatar"), 0)
    .some((problem) => problem.includes("floating effect e2"))).toBe(true);
});

it("a remembered source does not authorize a newly private fixed effect on an independently observed target", () => {
  const { state, ids } = boardState(engine.catalog, { active: "player", phase: "day", enemy: { back: [veiled.id, SYNTHETIC.vanilla1.id] } });
  const [target, source] = ids.enemy.back as InstanceId[];
  const ctx = context(state);
  moveInstance(ctx, source, "deck");
  shuffleDeck(state, "enemy");
  const withoutPrivateChange = cloneState(state);
  addFloating(ctx, { controller: "enemy", source, expiry: { at: "never" },
    change: { kind: "keyword", instance: target, keyword: "veil", gains: false } });
  expect(view(state, "player", engine.catalog).floating).toEqual([]);
  moveInstance(ctx, target, "deck");
  shuffleDeck(state, "enemy");
  moveInstance(context(withoutPrivateChange), target, "deck");
  shuffleDeck(withoutPrivateChange, "enemy");
  expect(view(state, "player", engine.catalog)).toEqual(view(withoutPrivateChange, "player", engine.catalog));
});

it("deeply clones and serializes observed records, keeps legacy memory conservative, and leaves loop/cycle positions neutral", () => {
  const { state, lists } = hiddenFixture();
  const copy = cloneState(state);
  expect(copy).toEqual(deserializeState(serializeState(state)));
  const before = engine.view(state, "player");
  copy.rememberedCards!.player[0].status.gainedSpark += 10;
  expect(engine.view(state, "player")).toEqual(before);
  expect(stateHash(copy)).not.toBe(stateHash(state));
  const legacy = cloneState(state);
  delete legacy.rememberedCards;
  expect(engine.view(legacy, "player").hiddenCards).toBeUndefined();
  expect(Object.values(engine.determinize(engine.view(legacy, "player"), lists, () => 0.4).instances)
    .some((card) => card.status.gainedSpark !== 0)).toBe(false);
  expect(loopSignature(legacy)).toBe(loopSignature(state));
  expect(cycleHash(legacy)).toBe(cycleHash(state));
});

it("keeps suspended/cancelled and failing branch snapshots isolated from committed observed status", () => {
  let failing = false;
  const speculative: EngineCardDefinition = { ...SYNTHETIC.event0, id: syntheticId(0x437), synthetic: {
    play: (ctx) => {
      const target = ctx.state.sides.player.backRank[0];
      if (target === null) throw new Error("missing fixture target");
      ctx.state.instances[target].status.gainedSpark += 10;
      ctx.emit({ kind: "sparkGained", instance: target, amount: 10, expiry: { at: "never" }, additional: false });
      ctx.choose<ChooseNumberPrompt>({ kind: "chooseNumber", side: "player", min: 0, max: 1,
        purpose: { source: target, cardId: null, ability: 0, role: "chooseX" } });
      if (failing) throw new Error("synthetic branch failure");
      return {};
    },
  } };
  const current = createEngine(testCatalog([speculative]));
  const { state, ids } = boardState(current.catalog, { active: "player", phase: "day", player: { hand: [speculative.id], back: [SYNTHETIC.vanilla1.id] } });
  rememberKnownCards(state);
  const hash = stateHash(state);
  const fold = createFoldAdapter(current);
  const start: BattleSlice = { committed: state, inFlight: null, attempt: 0, publishedEvents: 0 };
  const played = fold.reduce(start, { kind: "battleAction", side: "player", action: { kind: "play", card: ids.player.hand[0], from: "hand" } });
  if (played.kind !== "applied") throw new Error("play bounced");
  const pending = fold.pending(played.slice);
  if (pending === null) throw new Error("no cancellable prompt");
  expect(stateHash(state)).toBe(hash);
  expect(pending.display.instances[ids.player.back[0]!].status.gainedSpark).toBe(10);
  const cancelled = fold.reduce(played.slice, { kind: "cancel", side: "player", promptId: pending.prompt.id });
  if (cancelled.kind !== "applied") throw new Error("cancel bounced");
  expect(cancelled.slice.committed.rememberedCards).toEqual(state.rememberedCards);
  expect(cancelled.slice.committed.instances[ids.player.back[0]!].status.gainedSpark).toBe(0);
  failing = true;
  const failed = fold.reduce(played.slice, { kind: "answer", side: "player", promptId: pending.prompt.id, value: 0 });
  if (failed.kind !== "applied") throw new Error("answer bounced");
  expect(failed.error).not.toBeNull();
  expect(failed.slice.committed.rememberedCards).toEqual(state.rememberedCards);
  expect(stateHash(state)).toBe(hash);
});
