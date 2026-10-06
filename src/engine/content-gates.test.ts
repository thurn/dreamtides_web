/**
 * The content gates (engine-design § Content gates): the sanctioned
 * data-to-engine contract test. Every catalog entity is pending, vanilla, or
 * authored; authored abilities build for both variants from registered
 * primitives, declare every play-time target they hold, and keep play-time
 * targets and triggering-card references out of static abilities; each
 * authored entity's verifiedText matches its text; and every figment has a
 * unique UUID and a non-negative integer base spark. Each check collects its
 * failures as `${kind} ${id}: message`, so a failing gate names every
 * offending entity.
 */
import { describe, expect, it } from "vitest";
import { AVATARS } from "../content/avatars";
import { CARDS } from "../content/cards";
import type { ContentStatus, Uuid } from "../content/define";
import { DREAMSIGNS } from "../content/dreamsigns";
import { DREAMWELL_CARDS } from "../content/dreamwell";
import { FIGMENTS } from "../content/figments";
import { abilityEffect } from "./dsl/abilities";
import { all, characterYouControl, staticAbility, target } from "./dsl/builders";
import { triggeringCard } from "./dsl/triggers";
import type { Ability } from "./dsl/types";
import { expectedVerifiedText } from "./dsl/verified-text";
import { engineCardFromContent } from "./content-catalog";
import { everyNode } from "./effects/interpreter";
import { sparkModifier } from "./effects/primitives/spark-modifier";
import { primitiveDefinition } from "./effects/registry";
import { undeclaredAbilityTargets } from "./testing/target-audit";

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

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** The messages `check` reports, or the error it throws, as a list. */
function attempt(check: () => readonly string[]): readonly string[] {
  try {
    return check();
  } catch (error) {
    return [messageOf(error)];
  }
}

/**
 * Every failure `check` reports for any authored entity's abilities, built
 * for both variants, as `${kind} ${id}: message`. A build that throws is a
 * failure of its own.
 */
function authoredFailures(check: (abilities: readonly Ability[]) => readonly string[]): string[] {
  return ENTITIES.flatMap((entity) => {
    const abilities = entity.status.abilities;
    if (abilities === undefined) return [];
    return [false, true].flatMap((amplified) =>
      attempt(() => check(abilities({ amplified }))).map(
        (message) => `${entity.kind} ${entity.id}: ${amplified ? "amplified" : "base"}: ${message}`,
      ),
    );
  });
}

/**
 * Every node of each ability's effect, every mode of a modal node included,
 * is a registered primitive, and a static ability holds a continuous
 * primitive, which the layer evaluation applies.
 */
function primitiveFailures(abilities: readonly Ability[]): string[] {
  return abilities.flatMap((ability, index) => {
    const effect = abilityEffect(ability);
    if (effect === null) return [];
    return attempt(() => {
      everyNode(effect);
      return ability.kind === "static" && primitiveDefinition(effect.op).continuous === undefined
        ? [`static ${effect.op} is not a continuous primitive`]
        : [];
    }).map((message) => `ability ${String(index)}: ${message}`);
  });
}

const PLAY_TIME_REFERENCES: readonly unknown[] = ["target", "stackTarget", "subject"];

/**
 * The play-time target and triggering-card references a static ability's
 * effect holds anywhere in its tree. The layer evaluation has no target
 * chosen and no triggering event to read, so each covers no character and
 * that part of the static ability affects nothing.
 */
function staticReferenceFailures(abilities: readonly Ability[]): string[] {
  return abilities.flatMap((ability, index) => {
    if (ability.kind !== "static") return [];
    const seen = new Set<object>();
    const kinds: string[] = [];
    const visit = (value: unknown): void => {
      if (typeof value !== "object" || value === null || seen.has(value)) return;
      seen.add(value);
      if ("kind" in value && PLAY_TIME_REFERENCES.includes(value.kind)) kinds.push(String(value.kind));
      for (const field of Object.values(value)) visit(field);
    };
    visit(ability.effect);
    return kinds.map((kind) => `ability ${String(index)}: static ${ability.effect.op} holds a ${kind} reference`);
  });
}

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
    expect(authoredFailures(primitiveFailures)).toEqual([]);
  });

  it("declares every play-time target each authored entity's primitives hold", () => {
    expect(
      authoredFailures((abilities) => undeclaredAbilityTargets(abilities).map(({ op, spec }) => `${op} does not declare its ${spec.kind}`)),
    ).toEqual([]);
  });

  it("keeps play-time targets and triggering-card references out of every authored static ability", () => {
    expect(authoredFailures(staticReferenceFailures)).toEqual([]);
  });

  it("rejects a static ability that holds a target or a triggering-card reference", () => {
    expect(staticReferenceFailures([staticAbility(sparkModifier(all(characterYouControl()), 1))])).toEqual([]);
    expect(staticReferenceFailures([staticAbility(sparkModifier(target(characterYouControl()), 1))])).toHaveLength(1);
    expect(staticReferenceFailures([staticAbility(sparkModifier(triggeringCard(), 1))])).toHaveLength(1);
  });

  it("gives every figment a unique UUID and a non-negative integer base spark", () => {
    expect(new Set(FIGMENTS.map((figment) => figment.id)).size).toBe(FIGMENTS.length);
    for (const figment of FIGMENTS) {
      expect(Number.isInteger(figment.spark) && figment.spark >= 0, figment.id).toBe(true);
    }
  });

  it("reads every card's printed energy cost orbs into its engine costs", () => {
    const failures = CARDS.flatMap((card) =>
      attempt(() => {
        engineCardFromContent(card);
        return [];
      }).map((message) => `card ${card.id}: ${message}`),
    );
    expect(failures).toEqual([]);
  });

  it("changes the verifiedText hash when either text changes", () => {
    const base = expectedVerifiedText("Draw a card.", "Draw 2 cards.");
    expect(expectedVerifiedText("Draw a card.", "Draw 2 cards.")).toBe(base);
    expect(expectedVerifiedText("Draw two cards.", "Draw 2 cards.")).not.toBe(base);
    expect(expectedVerifiedText("Draw a card.", "Draw 3 cards.")).not.toBe(base);
    expect(expectedVerifiedText("Draw a card.")).not.toBe(base);
  });
});
