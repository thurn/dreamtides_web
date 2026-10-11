// What the battle screen model shows while presentation items play:
// reveals, scores and turns, notices, the Dreamwell card, and status badges.
import { describe, expect, it } from "vitest";
import {
  presentationItems,
  promptPresentable,
  type PresentationItem,
} from "../../battle/components/presentation-items";
import { createEngine, type BattleState, type Engine, type InstanceView } from "../../engine";
import { createCatalog } from "../../engine/catalog";
import { event as eventAbility } from "../../engine/dsl/builders";
import { discard, discover, sequence } from "../../engine/effects/primitives";
import { SYNTHETIC, syntheticId } from "../../engine/testing/synthetic-cards";
import { LAB, PROMPT_LAB_DEFINITIONS } from "../../engine/testing/prompt-lab";
import { engineBattleNoticeCopy } from "../../runtime/battle-prompt-messages";
import {
  parseBattleId,
  parseDreamwellCardId,
  parsePresentationId as pid,
} from "../../types/identifiers";
import {
  buildEngineBattleScreenModel,
  enginePrintedKeywords,
  engineStatuses,
  type EngineBattleScreenModel,
} from "./engine-battle-view-model";
import { cards, labEngine, observedBoard, steps } from "./engine-battle-presentation.fixtures";

/** The human's screen of `state` while `visual` is presented (`null`: everything presented). */
function labModel(
  state: BattleState,
  visual: PresentationItem["visual"],
  extra: Partial<Parameters<typeof buildEngineBattleScreenModel>[0]> = {},
  on: Engine = labEngine,
): EngineBattleScreenModel {
  return buildEngineBattleScreenModel({
    battleId: parseBattleId("battle-presentation-fixture"),
    human: "player",
    view: on.view(state, "player"),
    legal: [],
    prompt: null,
    playing: null,
    decision: null,
    presented: visual === null,
    notice: null,
    cards,
    printedKeywords: enginePrintedKeywords(on.catalog),
    avatars: { player: { avatar: null }, enemy: { avatar: null } },
    opponentName: "Fixture Opponent",
    essenceReward: 100,
    resultDismissed: false,
    visual: visual === null ? null : { key: pid("visual-key"), visual },
    ...extra,
  });
}

const boardIds = (model: EngineBattleScreenModel) =>
  [model.view.far, model.view.near].flatMap((side) => [
    ...side.backRank.flatMap((slot) => (slot.card === null ? [] : [slot.card.id])),
    ...side.frontRank.flatMap((slot) => (slot.card === null ? [] : [slot.card.id])),
    ...side.voidCards.map((card) => card.id),
  ]);

describe("presentation items", () => {
  it("reveals the opponent's play over the board before it, then holds the card off the board after it until it travels", () => {
    const [registered] = steps("present-opponent");
    const reveal = registered?.items[0];
    if (registered === undefined || reveal?.visual?.kind !== "reveal") throw new Error("no reveal");
    const played = registered.published.find((event) => event.kind === "cardPlayed");

    expect(reveal.presentation).toBe("reveal");
    expect(reveal.visual.instance).toBe(played?.kind === "cardPlayed" ? played.instance : null);
    expect(reveal.batch.state).toBe(registered.before);
    expect(reveal.batch.key).not.toBe(registered.batch.key);
    const revealedCard: InstanceView | null = labEngine.view(reveal.visual.after, "player").instances[reveal.visual.instance] ?? null;
    const during = labModel(registered.after, reveal.visual, { revealedCard });
    expect(during.view.playReveal?.card.id).toBe(reveal.visual.instance);
    expect(boardIds(during)).not.toContain(reveal.visual.instance);
    expect(boardIds(labModel(registered.after, null))).toContain(reveal.visual.instance);
  });

  it("travels the human's own play, and the opponent's draws without the cards drawn", () => {
    const [play, answer] = steps("present-zones");
    const dissolve = [...(play?.items ?? []), ...(answer?.items ?? [])];
    const challenge = steps("present-challenge")[1];
    if (challenge === undefined) throw new Error("no challenge");
    const draws = challenge.published.filter((event) => event.kind === "cardDrawn" && event.side === "enemy");
    const drawn = draws.flatMap((event) => (event.kind === "cardDrawn" && event.instance !== null ? [event.instance] : []));
    const enemyBatch = { key: pid("draws"), state: challenge.after };
    const shown = presentationItems(draws, "player", enemyBatch, challenge.before, () => null);
    const identified = new Set(shown.flatMap((item) => Object.keys(labEngine.view(item.batch.state, "player").instances)));

    expect(dissolve.some((item) => item.presentation === "reveal")).toBe(false);
    expect(dissolve[0]?.presentation).toBe("travel");
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn).toHaveLength(draws.length);
    expect(shown.map((item) => ({ presentation: item.presentation, visual: item.visual }))).toEqual(
      draws.map(() => ({ presentation: "travel", visual: null })),
    );
    expect(drawn.filter((id) => identified.has(id))).toEqual([]);
    expect(presentationItems(draws, "enemy", enemyBatch, challenge.before, () => null).length).toBe(draws.length);
  });

  it("scores a challenger in the turn it happens, then announces the new turn", () => {
    const challenge = steps("present-challenge")[1];
    if (challenge === undefined) throw new Error("no challenge");
    const scoreAt = challenge.items.findIndex((item) => item.presentation === "score");
    const turnAt = challenge.items.findIndex((item) => item.presentation === "turn");
    const score = challenge.items[scoreAt];
    const turn = challenge.items[turnAt];
    if (score?.visual?.kind !== "score" || turn === undefined) throw new Error("no score or turn");
    const during = labModel(score.batch.state, score.visual);

    expect(scoreAt).toBeLessThan(turnAt);
    expect(challenge.before.turn.active).toBe("player");
    expect(challenge.after.turn.active).toBe("enemy");
    expect(score.batch.key).not.toBe(challenge.batch.key);
    expect(during.view.activeSide).toBe("player");
    expect(during.cardOverlay).toMatchObject({ kind: "points-scored", battleCardId: score.visual.instance, points: score.visual.points });
    expect(turn.batch).toBe(challenge.batch);
    expect(labModel(turn.batch.state, null).view.activeSide).toBe("enemy");
  });

  it("notices the human's automatic answers and a trigger with no legal target, and never the opponent's", () => {
    const notices = (human: "player" | "enemy") =>
      steps("auto-target", human).flatMap((step) => step.items.flatMap((item) => (item.notice === null ? [] : [item.notice])));
    const noTarget = steps("present-zones")[1]?.items.find((item) => item.notice?.kind === "noLegalTarget");

    expect(notices("player")).toEqual([expect.objectContaining({ kind: "autoAnswered", prompt: "chooseTargets", role: "target" })]);
    expect(notices("enemy")).toEqual([]);
    expect(noTarget?.presentation).toBe("notice");
  });

  it("names the purpose of an automatic answer, and holds the next prompt until its notice clears", () => {
    // "Discard a card, then discover a character": one other hand card forces the discard, and the offer follows.
    const discardThenDiscover = {
      ...LAB.drawTwoThenDiscard,
      id: syntheticId(0x5103),
      abilities: () => [eventAbility(sequence(discard(1), discover({ cardType: "character" })))],
    };
    const engine = createEngine(createCatalog([...PROMPT_LAB_DEFINITIONS.cards, discardThenDiscover], [], PROMPT_LAB_DEFINITIONS.emblems, PROMPT_LAB_DEFINITIONS.figments));
    const fixture = observedBoard(
      {
        active: "player",
        phase: "day",
        player: { hand: [discardThenDiscover.id, SYNTHETIC.vanilla1.id], energy: 2, deck: [SYNTHETIC.vanilla1.id, SYNTHETIC.vanilla2.id, SYNTHETIC.vanilla3.id] },
      },
      engine,
    );
    const shown = fixture.apply({ kind: "battleAction", side: "player", action: { kind: "play", card: fixture.ids.player.hand[0], from: "hand" } });
    const pending = fixture.adapter.pending(fixture.slice());
    if (pending === null) throw new Error("no discover offer");
    const item = shown.items.find((entry) => entry.notice?.kind === "autoAnswered");
    const notice = item?.notice;
    if (item === undefined || notice?.kind !== "autoAnswered") throw new Error("no automatic answer notice");
    const offerNotice = { ...notice, role: pending.prompt.purpose.role };
    const screen = (presented: boolean, shownNotice: typeof notice | null) =>
      labModel(
        pending.display,
        null,
        {
          prompt: pending.prompt,
          presented,
          notice: shownNotice === null ? null : { key: item.key, ...engineBattleNoticeCopy(shownNotice) },
        },
        engine,
      );
    const whileNotice = screen(promptPresentable(null, { notice }), notice);
    const afterNotice = screen(promptPresentable(null, null), null);

    expect(pending.prompt.purpose.role).toBe("discover");
    expect(notice).toEqual(expect.objectContaining({ prompt: pending.prompt.kind, role: "discard" }));
    expect(engineBattleNoticeCopy(notice).message).not.toBe(engineBattleNoticeCopy(offerNotice).message);
    expect(promptPresentable(item, null)).toBe(false);
    expect(whileNotice.prompt.surface.kind).toBe("held");
    expect(whileNotice.prompt.host?.key ?? null).toBeNull();
    expect(whileNotice.prompt.host?.heading ?? null).toBeNull();
    expect(whileNotice.prompt.host?.notice?.key).toBe(item.key);
    expect(afterNotice.prompt.surface.kind).not.toBe("held");
    expect(afterNotice.prompt.host?.notice ?? null).toBeNull();
  });

  it("shows a Dreamwell card beside its side while its reveal is presented", () => {
    const [first] = steps("present-zones");
    if (first === undefined) throw new Error("no step");
    const card = parseDreamwellCardId("00000000-0000-4000-8000-00000000d001");
    const dreamwell = {
      cardId: card,
      displaySnapshot: { id: card, name: "Fixture Dreamwell", renderedText: "", energyAdded: 1, imageNumber: 1 },
    };
    const model = labModel(first.after, { kind: "dreamwell", side: "enemy", card }, {
      dreamwellCard: (requested) => (requested === card ? dreamwell : null),
    });

    expect(model.view.dreamwell).toEqual({ side: "enemy", model: dreamwell });
  });

  it("marks durations, keywords, disabled triggers, payable effects, and side statuses, and clears them as they end", () => {
    const status = steps("present-status");
    const played = status[status.length - 2];
    const ended = status[status.length - 1];
    const exiled = steps("present-zones")[5];
    const reclaim = steps("reclaim")[0];
    if (played === undefined || ended === undefined || exiled === undefined || reclaim === undefined) throw new Error("no steps");
    const kinds = (state: BattleState) => {
      const marks = engineStatuses(labEngine.view(state, "player"), "player", enginePrintedKeywords(labEngine.catalog));
      return {
        cards: [...new Set([...marks.cards.values()].flat().map((badge) => badge.kind))].sort(),
        player: marks.sides.player.map((badge) => badge.kind),
        enemy: marks.sides.enemy.map((badge) => badge.kind),
        labels: [...marks.cards.values(), marks.sides.player, marks.sides.enemy].flat().every((badge) => badge.label.length > 0),
      };
    };

    expect(kinds(played.after)).toMatchObject({
      cards: ["duration", "keyword", "payable", "triggersDisabled"],
      player: ["delayedTrigger"],
      labels: true,
    });
    expect(kinds(ended.after)).toMatchObject({ cards: ["duration", "payable"], player: [] });
    expect(kinds(exiled.after).enemy).toEqual(["returns"]);
    expect(kinds(reclaim.after).player).toEqual(["exhausted"]);
  });
});
