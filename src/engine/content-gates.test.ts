/**
 * The content gates (engine-design § Content gates): the sanctioned
 * data-to-engine contract test. Every catalog entity is pending, vanilla, or
 * authored; authored abilities build for both variants from registered
 * primitives; and each authored entity's verifiedText matches its text.
 */
import { describe, expect, it } from "vitest";
import { AVATARS } from "../content/avatars";
import { CARDS } from "../content/cards";
import type { ContentStatus, Uuid } from "../content/define";
import { DREAMSIGNS } from "../content/dreamsigns";
import { DREAMWELL_CARDS } from "../content/dreamwell";
import { FIGMENTS } from "../content/figments";
import type { Ability } from "./dsl/types";
import { expectedVerifiedText } from "./dsl/verified-text";
import { engineCardFromContent } from "./content-catalog";
import { everyNode } from "./effects/interpreter";

interface Entity {
  readonly kind: string;
  readonly id: Uuid;
  readonly text: string;
  readonly amplifiedText?: string;
  readonly status: ContentStatus;
}

const ENTITIES: readonly Entity[] = [
  ...CARDS.map((card) => ({ kind: "card", id: card.id, text: card.renderedText, amplifiedText: card.amplifiedText, status: card })),
  ...DREAMSIGNS.map((sign) => ({ kind: "dreamsign", id: sign.id, text: sign.effectDescription, status: sign })),
  ...AVATARS.map((avatar) => ({ kind: "avatar", id: avatar.id, text: avatar.renderedText, status: avatar })),
  ...DREAMWELL_CARDS.map((card) => ({ kind: "dreamwell", id: card.id, text: card.renderedText, status: card })),
  ...FIGMENTS.map((figment) => ({ kind: "figment", id: figment.id, text: figment.renderedText, status: figment })),
];

describe("content gates", () => {
  it("gives every entity exactly one of pending, vanilla, or authored abilities", () => {
    for (const entity of ENTITIES) {
      const flags = [entity.status.pending === true, entity.status.vanilla === true, entity.status.abilities !== undefined];
      expect(flags.filter(Boolean), `${entity.kind} ${entity.id}`).toHaveLength(1);
    }
  });

  it("matches every authored entity's verifiedText to its printed and amplified text", () => {
    const stale = ENTITIES.filter(
      (entity) =>
        entity.status.abilities !== undefined &&
        entity.status.verifiedText !== expectedVerifiedText(entity.text, entity.amplifiedText),
    ).map((entity) => `${entity.kind} ${entity.id}`);
    expect(stale).toEqual([]);
  });

  it("builds every authored entity's abilities for both variants from registered primitives", () => {
    for (const entity of ENTITIES) {
      const abilities = entity.status.abilities;
      if (abilities === undefined) continue;
      for (const amplified of [false, true]) {
        const built: readonly Ability[] = abilities({ amplified });
        for (const ability of built) {
          // Every node, every mode of a modal node included, is a registered primitive.
          if (ability.kind === "event" || ability.kind === "activated" || ability.kind === "triggered") {
            expect(() => everyNode(ability.effect)).not.toThrow();
          }
        }
      }
    }
  });

  it("reads every card's printed energy cost orbs into its engine costs", () => {
    for (const card of CARDS) {
      expect(() => engineCardFromContent(card), card.id).not.toThrow();
    }
  });

  it("changes the verifiedText hash when either text changes", () => {
    const base = expectedVerifiedText("Draw a card.", "Draw 2 cards.");
    expect(expectedVerifiedText("Draw a card.", "Draw 2 cards.")).toBe(base);
    expect(expectedVerifiedText("Draw two cards.", "Draw 2 cards.")).not.toBe(base);
    expect(expectedVerifiedText("Draw a card.", "Draw 3 cards.")).not.toBe(base);
    expect(expectedVerifiedText("Draw a card.")).not.toBe(base);
  });
});
