// The battle screen model's affordances from the human's legal actions:
// plays, passes, repositions, merges, Reclaim, activations, paying to end
// an effect, and loops.
import { describe, expect, it } from "vitest";
import { type Action, type InstanceId } from "../../engine";
import { placeFigment } from "../../engine/testing/board";
import { DSL } from "../../engine/testing/dsl-cards";
import { LOOP } from "../../engine/testing/loop-cards";
import { SYNTHETIC } from "../../engine/testing/synthetic-cards";
import { ZONE, ZONE_FIGMENT } from "../../engine/testing/zone-cards";
import { NO_PROMPTS } from "../../engine/steps/sources";
import { parseBattleSlotViewId, type BattleCardId } from "../../types/identifiers";
import {
  figmentMergeTargets,
  handPlayAction,
  repositionForDrop,
  voidBrowserCards,
  withChooser,
  type EngineBattleScreenModel,
  type EngineChooser,
} from "./engine-battle-view-model";
import { engineBattleLogText, engineStatusLabel, type EngineStatusCopy } from "../../runtime/battle-prompt-messages";
import { board, cards, engine, id, labScreen, labSlice, screenOf, selections } from "./engine-battle-view-model.fixtures";

const outlined = (model: EngineBattleScreenModel) =>
  model.view.playerHand.filter((card) => card.showPlayableOutline).map((card) => card.id);

const slot = (rank: "back" | "front", position: string) =>
  ({ owner: "player", rank, slotId: parseBattleSlotViewId(position) }) as const;

describe("buildEngineBattleScreenModel", () => {
  it("outlines exactly the hand cards with a legal play and offers the pass", () => {
    const { state, ids } = board({ player: { hand: [SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla3.id], energy: 1 } });
    const model = screenOf(state);

    expect(model.affordances.canAct).toBe(true);
    expect(model.affordances.pass).toEqual({ kind: "pass" });
    expect(outlined(model)).toEqual([id(ids.player.hand[0])]);
    expect([...model.affordances.plays.keys()]).toEqual([id(ids.player.hand[0])]);
    expect(handPlayAction(model, "player", id(ids.player.hand[1]))).toBeNull();
  });

  it("offers no action, outline, or shortcut while the opponent owns the decision", () => {
    const { state } = board({
      active: "enemy",
      player: { hand: [SYNTHETIC.vanilla1.id], back: [SYNTHETIC.vanilla1.id], energy: 5 },
    });
    const model = screenOf(state);

    expect(model.affordances.canAct).toBe(false);
    expect(model.affordances.pass).toBeNull();
    expect(outlined(model)).toEqual([]);
    expect(model.view.rankShortcuts).toBeNull();
    expect(model.view.promptNotice).toEqual({ promptSide: "enemy", reason: "opponent-acting" });
  });

  it("names the open back-rank position a dropped character enters", () => {
    const { state, ids } = board({ player: { hand: [SYNTHETIC.vanilla1.id, DSL.drawTwo.id], energy: 5 } });
    const model = screenOf(state);
    const [character, event] = ids.player.hand.map(id);
    const played = { kind: "play", card: ids.player.hand[0], from: "hand" };

    expect(handPlayAction(model, "player", character, slot("back", "B4"))).toEqual({ ...played, slot: { rank: "back", index: 4 } });
    expect(handPlayAction(model, "player", character, { ...slot("back", "B4"), owner: "enemy" })).toEqual(played);
    expect(handPlayAction(model, "player", event, slot("back", "B4"))?.slot).toBeUndefined();
  });

  it("repositions only to legal destinations and plans All Forward and All Back", () => {
    const { state, ids } = board({
      player: {
        back: [SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla2.id, SYNTHETIC.vanilla3.id],
        front: [null, SYNTHETIC.vanilla5.id],
      },
    });
    const [ready, exhausted, readyToo] = ids.player.back;
    if (exhausted == null) throw new Error("missing card");
    state.instances[exhausted].status.exhausted = true;
    const model = screenOf(state);
    const targetsOf = (instance: InstanceId | null) =>
      (model.affordances.repositions.get(id(instance)) ?? []).map((move) => `${move.target.slotId}`);
    const move = (card: InstanceId | null, rank: "back" | "front", index: number) => ({ kind: "reposition", card, to: { rank, index } });

    expect(targetsOf(exhausted).some((slotId) => slotId.startsWith("F"))).toBe(false);
    expect(targetsOf(ready)).toContain("F0");
    expect(repositionForDrop(model, id(exhausted), slot("front", "F0"))).toBeNull();
    expect(repositionForDrop(model, id(ready), slot("front", "F0"))).toEqual(move(ready, "front", 0));
    expect(model.affordances.allForward).toEqual([move(ready, "front", 0), move(readyToo, "front", 2)]);
    expect(model.affordances.allBack).toEqual([move(ids.player.front[1], "back", 3)]);
    expect(model.view.rankShortcuts).toEqual({ allForward: true, allBack: true });
  });

  it("marks figment merges, blocks a merge across exhaustion, and asks for confirmation where told", () => {
    const { state } = board({});
    const warrior = { kind: "figment" as const, figment: ZONE_FIGMENT.warrior.id, spark: 1 };
    const source = placeFigment(state, "player", { rank: "back", index: 0 }, warrior);
    const same = placeFigment(state, "player", { rank: "back", index: 1 }, warrior);
    const tired = placeFigment(state, "player", { rank: "back", index: 2 }, warrior);
    placeFigment(state, "player", { rank: "back", index: 3 }, { ...warrior, figment: ZONE_FIGMENT.ethereal.id });
    state.instances[tired].status.exhausted = true;
    const model = screenOf(state);
    const targets = figmentMergeTargets(model, "player", id(source), (figment) => figment.id === source);

    expect(targets.map((target) => [target.destinationBattleCardId, target.status, target.requiresConfirmation])).toEqual([
      [id(same), "eligible", true],
      [id(tired), "blocked-exhaustion", false],
    ]);
    expect(figmentMergeTargets(model, "player", id(source), () => false)[0]?.addedSpark).toBe(1);
  });

  it("offers Reclaim plays and Avatar and Dreamsign activations from their choosers", () => {
    const { model } = labScreen("reclaim");
    const chooser = (opened: EngineChooser | null) => withChooser(model, opened, cards, () => null);
    const actions = (offered: Iterable<Action>) => [...offered].map((action) => ({ kind: "action", action }));

    expect(model.affordances.voidPlays.size).toBe(1);
    const emblems = model.affordances.emblemActivations.map((action) => (typeof action.source === "string" ? null : action.source.kind));
    expect(emblems).toEqual(["avatar", "dreamsign"]);
    expect(chooser(null)).toBe(model);
    expect(selections(chooser({ kind: "void" }))).toEqual([...actions(model.affordances.voidPlays.values()), { kind: "browseVoid" }, { kind: "close" }]);
    expect(selections(chooser({ kind: "emblems" }))).toEqual([...actions(model.affordances.emblemActivations), { kind: "close" }]);
  });

  it("rings the human's void cards it may play by Reclaim, and badges and logs a granted Reclaim with its stated cost", () => {
    const { state, ids } = board({
      player: { void: [ZONE.reclaimDraw.id, SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla2.id], energy: 1 },
      enemy: { void: [ZONE.reclaimDraw.id], energy: 5 },
    });
    const [printed, granted, plain] = ids.player.void;
    if (printed === undefined || granted === undefined || plain === undefined) throw new Error("missing cards");
    const free = [{ cost: "energy", amount: 0 }] as const;
    const effect = {
      id: "e901",
      controller: "player",
      source: printed,
      timestamp: 0,
      expiry: { at: "never" },
      change: { kind: "keyword", instance: granted, keyword: "reclaim", gains: true, reclaimCosts: free },
    } as const;
    state.floating.push(effect);
    const model = screenOf(state);
    const ringed = (cards: readonly { readonly id: BattleCardId; readonly showPlayableOutline: boolean }[]) =>
      cards.filter((card) => card.showPlayableOutline).map((card) => card.id).sort();
    const gain: EngineStatusCopy = { kind: "keyword", keyword: "reclaim", gains: true, expiry: effect.expiry };
    const costed = engineStatusLabel({ ...gain, reclaimCosts: free }, "player");
    const browsed = voidBrowserCards(model.view.player);

    expect([...model.affordances.voidPlays.keys()].sort()).toEqual([id(printed), id(granted)].sort());
    expect(ringed(model.view.player.voidCards)).toEqual([id(printed), id(granted)].sort());
    expect(ringed(model.view.enemy.voidCards)).toEqual([]);
    expect(model.view.player.voidCards.find((card) => card.id === id(granted))?.statuses).toEqual([{ kind: "keyword", label: costed }]);
    expect(costed).not.toBe(engineStatusLabel(gain, "player"));
    expect(browsed.map((card) => [card.entryId, card.selection ?? null, card.statuses?.map((badge) => badge.label) ?? []])).toEqual([
      [id(printed), "playable", []],
      [id(granted), "playable", [costed]],
      [id(plain), null, []],
    ]);
    expect(voidBrowserCards(model.view.enemy).map((card) => card.selection ?? null)).toEqual([null]);
    expect(engineBattleLogText({ kind: "effectStarted", effect: effect.id, controller: "player", source: printed, expiry: effect.expiry, change: effect.change }, {
      human: "player",
      card: () => null,
      dreamwell: () => null,
    })).toContain(costed);
  });

  it("offers paying to end an effect on each character it changes, from the status display when it changes none, and only while affordable", () => {
    const state = labSlice("pay-to-end").committed;
    const [effect] = state.payable;
    if (effect === undefined) throw new Error("no payable effect");
    const action: Action = { kind: "payToEnd", effect: effect.id };
    const affected = effect.affects.map(id);
    const model = screenOf(state);
    const poor = structuredClone(state);
    poor.sides.player.currentEnergy = effect.cost - 1;
    const unattached = structuredClone(state);
    unattached.payable = [{ ...effect, affects: [] }];
    /** Each affected near character's outline and whether its payable badge (which it must show) is actionable. */
    const shown = (screen: EngineBattleScreenModel) =>
      screen.view.near.backRank.flatMap(({ card }) => {
        if (card === null || !affected.includes(card.id)) return [];
        const badge = card.statuses?.find((status) => status.kind === "payable");
        return [[card.showPlayableOutline, badge === undefined ? "no badge" : badge.actionable === true]];
      });

    expect([...model.affordances.payToEnd.keys()].sort()).toEqual([...affected].sort());
    expect([...model.affordances.payToEnd.values()]).toEqual(affected.map(() => [action]));
    expect(model.affordances.statusPayToEnd).toEqual([]);
    expect(shown(model)).toEqual(affected.map(() => [true, true]));
    expect(selections(withChooser(model, { kind: "card", id: affected[0] }, cards, () => null))).toEqual([{ kind: "action", action }, { kind: "close" }]);
    expect(screenOf(poor).affordances.payToEnd.size).toBe(0);
    expect(shown(screenOf(poor))).toEqual(affected.map(() => [false, false]));
    expect(screenOf(unattached).affordances.statusPayToEnd).toEqual([action]);
    expect(screenOf(unattached).affordances.payToEnd.size).toBe(0);
  });

  it("offers the loop on offer with the iteration cap", () => {
    const { state, ids } = board({ player: { back: [LOOP.freePoints.id] } });
    const source = ids.player.back[0];
    if (source == null) throw new Error("missing source");
    const once = engine.apply(state, "player", { kind: "activate", source, ability: 0 }, NO_PROMPTS).state;
    const model = screenOf(once);

    expect(model.affordances.loop?.loop).toBe(once.loops.candidate?.id);
    expect(model.view.promptHost?.loopOffer).toEqual({ maxCount: once.config.loopIterationCap });
  });
});
