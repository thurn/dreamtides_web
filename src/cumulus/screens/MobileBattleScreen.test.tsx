// @vitest-environment jsdom

// MobileBattleScreen: the board, hands, and piles, and how cards on them
// are presented. Controls and prompts have their own
// MobileBattleScreen.*.test.tsx.
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  parseBattleCardId as cardId,
  parseBattleSlotViewId,
  type BattleCardId,
} from "../../types/identifiers";
import type { MobileBattleSideView } from "./MobileBattleScreen";
import {
  makeCard,
  makeView,
  mount,
  query,
  rerender,
  roots,
} from "./MobileBattleScreen.fixtures";

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((media: string) => ({
    matches: false,
    media,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
  }));
});

afterEach(() => {
  act(() => roots.splice(0).forEach((root) => root.unmount()));
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("MobileBattleScreen", () => {
  it("renders only the identified top face, reuses the pile play ring, and clears it for a stale snapshot", () => {
    const view = makeView();
    const top = { ...makeCard(31, view.player.deckCardIds[0]), showPlayableOutline: true };
    const player = { ...view.player, knownDeckTop: top };
    const onZoneOpen = vi.fn();
    const container = mount({ ...view, player, near: player }, { onZoneOpen });
    const pile = query(container, '[data-testid="player-battle-deck"]');
    expect(pile.dataset.pileSelection).toBe("playable");
    expect([...pile.querySelectorAll('[data-card-pile-layer]')].map((layer) => layer.getAttribute("data-card-face"))).toEqual(["up", "down"]);
    act(() => pile.click());
    expect(onZoneOpen).toHaveBeenCalledWith({ owner: "player", zone: "deck" });
    const stale = { ...player, deckCardIds: [...player.deckCardIds].reverse() };
    rerender(container, { ...view, player: stale, near: stale });
    expect(query(container, '[data-testid="player-battle-deck"]').dataset.pileSelection).toBeUndefined();
  });
  it("renders both battlefields, hands, and piles, outlining only the playable cards", () => {
    const view = makeView();
    const playable = view.playerHand[1];
    const container = mount({
      ...view,
      playerHand: view.playerHand.map((card) => (card === playable ? { ...card, showPlayableOutline: true } : card)),
    });

    for (const rank of ["enemy-back", "enemy-front", "player-front", "player-back"]) query(container, `[data-battle-rank="${rank}"]`);
    const farHand = query(container, '[data-battle-mobile-row="far-hand"]');
    const nearHand = query(container, '[data-battle-mobile-row="near-hand"]');
    expect(farHand.dataset.battleHandCount).toBe("8");
    expect(nearHand.querySelectorAll('[data-battle-card-zone="near-hand"]')).toHaveLength(4);
    const outlined = container.querySelectorAll("[data-battle-card-playable] [data-battle-card-id]");
    expect([...outlined].map((element) => element.getAttribute("data-battle-card-id"))).toEqual([playable.id]);
  });

  it("rings a void pile while any card in it is playable", () => {
    const view = makeView();
    const playable = { ...makeCard(30, cardId("player-void-under")), showPlayableOutline: true };
    const player = { ...view.player, voidCards: [...view.player.voidCards, playable] };
    const ringed = (container: HTMLElement) =>
      (["player", "enemy"] as const).map(
        (owner) => query(container, `[data-testid="${owner}-battle-void"]`).dataset.pileSelection ?? null,
      );

    expect(ringed(mount(view))).toEqual([null, null]);
    expect(ringed(mount({ ...view, player, near: player }))).toEqual(["playable", null]);
  });

  it("presents the opponent's play at reading size and badges lasting statuses, marking the actionable ones", () => {
    const view = makeView();
    const [empty, filled, secondEmpty] = view.player.backRank;
    if (empty === undefined || filled?.card == null || secondEmpty === undefined) throw new Error("fixture has no back rank");
    const statuses = [{ kind: "duration", label: "a" }, { kind: "payable", label: "c", actionable: true }] as const;
    const badged = { ...filled, card: { ...filled.card, statuses } };
    const player = {
      ...view.player,
      backRank: [empty, badged, secondEmpty],
      status: { ...view.player.status, statuses: [{ kind: "costModifier", label: "b" }] },
    } satisfies MobileBattleSideView;
    const played = makeCard(90, cardId("enemy-played"));
    const container = mount({ ...view, player, near: player, playReveal: { card: played, from: "hand" } });

    expect(query(container, "[data-battle-play-reveal]").querySelector(`[data-battle-card-id="${played.id}"]`)).not.toBeNull();
    expect(
      query(container, `[data-battle-rank="player-back"] [data-battle-card-id="${badged.card.id}"]`).querySelector(
        '[data-battle-status-badge="duration"]',
      ),
    ).not.toBeNull();
    expect(
      [...container.querySelectorAll("[data-battle-status-badge-actionable]")].map((badge) =>
        badge.getAttribute("data-battle-status-badge"),
      ),
    ).toEqual(["payable"]);
    expect(query(container, '[data-testid="player-battle-status"]').querySelector('[data-battle-status-badge="costModifier"]')).not.toBeNull();
    expect(query(container, '[data-testid="enemy-battle-status"]').querySelector("[data-battle-status-badges]")).toBeNull();
  });

  it("shows on mobile the front lanes on both sides of every occupied back-rank position", () => {
    const view = makeView();
    const canonical = (rank: "B" | "F", count: number, filled: readonly number[]) =>
      Array.from({ length: count }, (_unused, index) => ({
        id: parseBattleSlotViewId(`${rank}${String(index)}`),
        card: filled.includes(index) ? makeCard(70 + index, cardId(`player-${rank}${String(index)}`)) : null,
      }));
    const player = { ...view.player, backRank: canonical("B", 10, [0, 4, 6]), frontRank: canonical("F", 9, []) };
    const enemy = { ...view.enemy, backRank: canonical("B", 10, []), frontRank: canonical("F", 9, []) };
    const container = mount({ ...view, player, near: player, enemy, far: enemy });
    const shown = (rank: string) =>
      [...query(container, `[data-battle-rank="${rank}"]`).querySelectorAll("[data-battle-slot-id]")].map((slot) =>
        slot.getAttribute("data-battle-slot-id"),
      );

    expect(shown("player-front")).toEqual(expect.arrayContaining(["F0", "F3", "F4", "F5", "F6"]));
    expect(shown("player-back")).toEqual(expect.arrayContaining(["B0", "B4", "B6"]));
  });

  it("fans the mobile hand symmetrically about the row's centre at every hand size", () => {
    for (let count = 1; count <= 8; count += 1) {
      const view = makeView();
      const cards = Array.from({ length: count }, (_unused, index) =>
        makeCard(40 + index, cardId(`player-hand-${String(index)}`)),
      );
      const container = mount({
        ...view,
        playerHand: cards,
        nearHand: { ...view.nearHand, cardIds: cards.map((card) => card.id), cards },
      });
      const fan = [
        ...query(container, '[data-battle-mobile-row="near-hand"]').querySelectorAll<HTMLElement>(":scope > div"),
      ].map((wrapper) => ({
        left: Number.parseFloat(wrapper.style.left),
        rotation: Number.parseFloat(/rotate\((-?[\d.]+)deg\)/u.exec(wrapper.style.transform)?.[1] ?? "NaN"),
      }));

      expect(fan, String(count)).toHaveLength(count);
      fan.forEach((card, index) => {
        const mirror = fan[count - 1 - index];
        expect(card.left + (mirror?.left ?? Number.NaN), `${String(count)}:${String(index)}`).toBeCloseTo(100);
        expect(card.rotation + (mirror?.rotation ?? Number.NaN), `${String(count)}:${String(index)}`).toBeCloseTo(0);
      });
    }
  });

  it("rings the stack's chosen targets until they leave the stack, yielding to a legal-target choice", () => {
    const view = makeView();
    const [target, other] = [view.enemy.backRank[1]?.card, view.player.frontRank[0]?.card];
    if (target == null || other == null) throw new Error("fixture has no battlefield cards");
    const ring = (container: HTMLElement, id: BattleCardId) =>
      [...query(container, `[data-battle-card-id="${id}"]`).querySelectorAll<HTMLElement>("*")]
        .map((element) => element.style.boxShadow)
        .filter((shadow) => shadow !== "")
        .join(" / ");
    const marked = (container: HTMLElement) =>
      [...container.querySelectorAll("[data-battle-stack-target] [data-battle-card-id]")].map((element) =>
        element.getAttribute("data-battle-card-id"),
      );

    const container = mount(view, { canInteract: false });
    const [plainTarget, plainOther] = [ring(container, target.id), ring(container, other.id)];
    expect(marked(container)).toEqual([]);
    expect(plainTarget).toBe(plainOther);

    rerender(container, view, { canInteract: false, stackTargetCardIds: [target.id] });
    expect(marked(container)).toEqual([target.id]);
    expect(ring(container, target.id)).not.toBe(plainTarget);
    expect(ring(container, other.id)).toBe(plainOther);

    rerender(container, view, { canInteract: false, stackTargetCardIds: [target.id], targetableCardIds: [target.id, other.id] });
    expect(ring(container, target.id)).toBe(ring(container, other.id));

    rerender(container, view, { canInteract: false, stackTargetCardIds: [] });
    expect(marked(container)).toEqual([]);
    expect(ring(container, target.id)).toBe(plainTarget);
  });
});
