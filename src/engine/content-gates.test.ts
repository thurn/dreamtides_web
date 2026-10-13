/**
 * The content gates (engine-design § Content gates): the sanctioned
 * data-to-engine contract test. Every catalog entity is pending, vanilla, or
 * authored; authored abilities build for both variants from registered
 * primitives, hold static-only primitives only as a static ability's whole
 * effect, declare every play-time target they hold, and keep play-time
 * targets, triggering-card references, and resolving source-spark reads out of static abilities; each
 * authored entity's verifiedText matches its text; and every figment has a
 * unique UUID and a non-negative integer base spark. Each check collects its
 * failures as `${kind} ${id}: message`, so a failing gate names every
 * offending entity.
 */
import { describe, expect, it } from "vitest";
import { AVATARS } from "../content/avatars";
import { APOLLYON_INCARNATIONS } from "../content/apollyon";
import { APOLLYON_DESIGNS } from "../content/apollyon/design";
import { TIDES } from "../content/tides";
import { parseCardId } from "../types/card-identity";
import { parseApollyonIncarnationId, parseAvatarId, parseDreamsignId, parseTideId } from "../types/identifiers";
import { apollyonRecipeFailures } from "./testing/apollyon-audit";
import type { ApollyonRecipeInput } from "./testing/apollyon-audit";
import { CARDS } from "../content/cards";
import type { ContentStatus, Uuid } from "../content/define";
import { DREAMSIGNS } from "../content/dreamsigns";
import { DREAMWELL_CARDS } from "../content/dreamwell";
import { FIGMENTS } from "../content/figments";
import { abilityEffect } from "./dsl/abilities";
import {
  activated,
  all,
  cardsMovedBy,
  characterYouControl,
  conditionCardCounts,
  controls,
  costOf,
  energy,
  event,
  fromVoid,
  highestSpark,
  staticAbility,
  target,
} from "./dsl/builders";
import { onMaterialized, triggered, triggeringCard, whenDraw } from "./dsl/triggers";
import type { Ability } from "./dsl/types";
import { thisCharacterSpark } from "./dsl/values";
import { expectedVerifiedText } from "./dsl/verified-text";
import { engineCardFromContent } from "./content-catalog";
import { everyNode } from "./effects/interpreter";
import { createCopyInHand } from "./effects/primitives/create-copy-in-hand";
import { chooseOne } from "./effects/primitives/choose-one";
import { choosePlayer } from "./effects/primitives/choose-player";
import { discard } from "./effects/primitives/discard";
import { discover } from "./effects/primitives/discover";
import { draw } from "./effects/primitives/draw";
import { eachPlayer } from "./effects/primitives/each-player";
import { floating } from "./effects/primitives/floating-trigger";
import { forDuration } from "./effects/primitives/for-duration";
import { gainPoints } from "./effects/primitives/gain-points";
import { cardsIn, grantCardKeyword } from "./effects/primitives/grant-card-keyword";
import { ifThen } from "./effects/primitives/if-then";
import { optional } from "./effects/primitives/optional";
import { repeat } from "./effects/primitives/repeat";
import { sequence } from "./effects/primitives/sequence";
import { sparkModifier } from "./effects/primitives/spark-modifier";
import { primitiveDefinition, type Effect } from "./effects/registry";
import { misplacedMovedCardReads } from "./testing/moved-card-audit";
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
  ...APOLLYON_INCARNATIONS.map(({ aspect }) => ({ kind: "apollyonAspect", id: aspect.id, text: aspect.renderedText, status: aspect })),
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
 * is a registered primitive; a static ability holds a continuous primitive,
 * which the layer evaluation applies; and a static-only primitive, which
 * never resolves, is held only as a static ability's whole effect, never in
 * an event, trigger, or activation or nested in another node.
 */
function primitiveFailures(abilities: readonly Ability[]): string[] {
  return abilities.flatMap((ability, index) => {
    const effect = abilityEffect(ability);
    if (effect === null) return [];
    return attempt(() => {
      const nodes = everyNode(effect);
      const failures =
        ability.kind === "static" && primitiveDefinition(effect.op).continuous === undefined
          ? [`static ${effect.op} is not a continuous primitive`]
          : [];
      for (const node of nodes) {
        if (primitiveDefinition(node.op).staticOnly === true && (ability.kind !== "static" || node !== effect)) {
          failures.push(`${ability.kind} ability holds the static-only ${node.op} outside a static ability's whole effect`);
        }
      }
      return failures;
    }).map((message) => `ability ${String(index)}: ${message}`);
  });
}

const PLAY_TIME_REFERENCES: readonly unknown[] = ["target", "stackTarget", "subject", "highestSpark"];

/**
 * The play-time target, triggering-card and resolving source-spark references a static ability's
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
      if ("value" in value && value.value === "sourceSpark") kinds.push("sourceSpark");
      if ("kind" in value && PLAY_TIME_REFERENCES.includes(value.kind)) kinds.push(String(value.kind));
      if ("kind" in value && value.kind === "inZone" && "pick" in value && value.pick === "target") kinds.push("inZone target");
      for (const field of Object.values(value)) visit(field);
    };
    visit(ability.effect);
    visit(ability.while);
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

  it("reads every authored entity's moved cards only after their node resolves in the same resolution", () => {
    expect(
      authoredFailures((abilities) =>
        misplacedMovedCardReads(abilities).map(({ op, node, reason }) =>
          reason === "static" ? `static ${op} reads cards a ${node} node moved` : `${op} reads cards a ${node} node moved before it resolves`,
        ),
      ),
    ).toEqual([]);
  });

  it("rejects a moved-card read whose node is later, on another branch, unrelated, in another resolution, or read statically", () => {
    /** Each shape gets a fresh payment node and the value that reads it. */
    const shape = (build: (payment: Effect, read: Effect) => Effect): Effect => {
      const payment = discard(1);
      return build(payment, gainPoints(costOf(cardsMovedBy(payment))));
    };
    const accepted: readonly Effect[] = [
      shape((payment, read) => sequence(payment, read)),
      shape((payment, read) => sequence(draw(1), payment, draw(1), read)),
      shape((payment, read) => sequence(optional(payment), read)),
      shape((payment, read) => sequence(ifThen(conditionCardCounts("hand", 1), payment), ifThen(conditionCardCounts("hand", 1), read))),
      shape((payment, read) => sequence(sequence(draw(1), payment), sequence(draw(1), read))),
      shape((payment, read) => sequence(choosePlayer(() => payment), read)),
      shape((payment, read) => sequence(payment, choosePlayer(() => read))),
      shape((payment, read) => repeat(2, sequence(payment, read))),
      shape((payment, read) => eachPlayer(sequence(payment, read))),
      shape((payment) => forDuration("untilEndOfTurn", sequence(payment, sparkModifier(all(characterYouControl()), costOf(cardsMovedBy(payment)))))),
      shape((payment, read) => sequence(draw(1), floating(whenDraw(), sequence(payment, read)))),
      shape((payment) => ifThen(conditionCardCounts("hand", 1), optional(sequence(payment, discover({ cardType: "character" }, { costGreaterThan: costOf(cardsMovedBy(payment)) }))))),
    ];
    for (const effect of accepted) {
      expect(misplacedMovedCardReads([event(effect)]), JSON.stringify(effect)).toEqual([]);
      expect(misplacedMovedCardReads([triggered(onMaterialized(), effect)]), JSON.stringify(effect)).toEqual([]);
    }

    const rejected: readonly Effect[] = [
      shape((payment, read) => sequence(read, payment)),
      shape((payment, read) => sequence(sequence(read, draw(1)), payment)),
      shape((payment, read) => sequence(draw(1), sequence(read, payment))),
      shape((_payment, read) => sequence(discard(1), read)),
      shape((_payment, read) => read),
      shape((payment, read) => chooseOne(payment, read)),
      shape((payment, read) => ifThen(conditionCardCounts("hand", 1), payment, read)),
      shape((payment, read) => choosePlayer((player) => (player === "you" ? payment : read))),
      shape((payment, read) => sequence(payment, floating(whenDraw(), read))),
      shape((payment, read) => sequence(floating(whenDraw(), payment), read)),
      shape((payment, read) => optional(sequence(read, payment))),
    ];
    for (const effect of rejected) {
      expect(misplacedMovedCardReads([event(effect)]), JSON.stringify(effect)).toEqual([expect.objectContaining({ reason: "notBefore" })]);
    }

    const payment = discard(1);
    expect(misplacedMovedCardReads([staticAbility(sparkModifier(all(characterYouControl()), costOf(cardsMovedBy(payment))))])).toEqual([
      { op: "sparkModifier", node: "discard", reason: "static" },
    ]);
  });

  it("rejects a static ability that holds a target or a triggering-card reference", () => {
    expect(staticReferenceFailures([staticAbility(sparkModifier(all(characterYouControl()), 1))])).toEqual([]);
    expect(staticReferenceFailures([staticAbility(sparkModifier(target(characterYouControl()), 1))])).toHaveLength(1);
    expect(staticReferenceFailures([staticAbility(sparkModifier(triggeringCard(), 1))])).toHaveLength(1);
    expect(staticReferenceFailures([staticAbility(sparkModifier(highestSpark(), 1))])).toHaveLength(1);
    expect(staticReferenceFailures([staticAbility(createCopyInHand(fromVoid()))])).toHaveLength(1);
    expect(staticReferenceFailures([staticAbility(sparkModifier(all(characterYouControl()), thisCharacterSpark()))])).toHaveLength(1);
  });

  it("rejects resolving source-spark bounds nested in a static condition", () => {
    const selectors = [
      characterYouControl({ sparkAtMost: thisCharacterSpark() }),
      characterYouControl({ sparkAtLeast: thisCharacterSpark() }),
      characterYouControl({ costAtMost: thisCharacterSpark() }),
      characterYouControl({ costAtLeast: thisCharacterSpark() }),
    ];
    for (const selector of selectors) {
      const invalid = staticAbility(sparkModifier(all(characterYouControl()), 1), {
        // @ts-expect-error A static condition has no resolving source-spark reader.
        while: controls(selector),
      });
      expect(staticReferenceFailures([invalid])).toHaveLength(1);
    }
  });

  it("rejects a static-only primitive anywhere but as a static ability's whole effect", () => {
    const grant = grantCardKeyword(cardsIn("hand"), "offering");
    expect(primitiveFailures([staticAbility(grant), staticAbility(grant, { zone: "void" })])).toEqual([]);
    const misplaced: readonly Ability[] = [
      event(grant),
      event(sequence(draw(1), grant)),
      event(chooseOne(draw(1), grant)),
      triggered(onMaterialized(), grant),
      activated([energy(1)], grant),
    ];
    for (const ability of misplaced) expect(primitiveFailures([ability]), ability.kind).toHaveLength(1);
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


describe("Apollyon recipe gate", () => {
  const incarnationId = parseApollyonIncarnationId("00000000-0000-4000-8000-000000000001");
  const otherIncarnationId = parseApollyonIncarnationId("00000000-0000-4000-8000-000000000002");
  const aspectId = parseAvatarId("00000000-0000-4000-8000-000000000003");
  const avatarId = parseAvatarId("00000000-0000-4000-8000-000000000004");
  const tideId = parseTideId("00000000-0000-4000-8000-000000000005");
  const cardIds = Array.from({ length: 11 }, (_, index) => parseCardId(`00000000-0000-4000-8000-${String(index + 10).padStart(12, "0")}`));
  const dreamsignIds = [1, 2, 3].map((index) => parseDreamsignId(`00000000-0000-4000-8000-${String(index + 30).padStart(12, "0")}`));
  const refs = {
    incarnationIds: new Set([incarnationId]), avatarIds: new Set([avatarId]),
    tideIds: new Set([tideId]), cardIds: new Set(cardIds), dreamsignIds: new Set(dreamsignIds),
  };
  const valid: ApollyonRecipeInput = {
    id: incarnationId, aspectId,
    deckRecipe: { poolAvatarId: avatarId, archetypeTideIds: [tideId], signatureCardIds: [cardIds[0]] },
    dreamsignIds: [dreamsignIds[0]],
  };

  it("checks every canonical incarnation and its recipe against the UUID catalogs", () => {
    const inputs = APOLLYON_INCARNATIONS.map((incarnation): ApollyonRecipeInput => ({
      id: parseApollyonIncarnationId(incarnation.id), aspectId: parseAvatarId(incarnation.aspect.id),
      deckRecipe: {
        poolAvatarId: parseAvatarId(incarnation.deckRecipe.poolAvatarId),
        archetypeTideIds: incarnation.deckRecipe.archetypeTideIds.map(parseTideId),
        signatureCardIds: incarnation.deckRecipe.signatureCardIds.map(parseCardId),
      },
      dreamsignIds: incarnation.dreamsignIds.map(parseDreamsignId),
    }));
    expect(apollyonRecipeFailures(inputs, {
      incarnationIds: new Set(APOLLYON_DESIGNS.keys()),
      avatarIds: new Set(AVATARS.map(({ id }) => parseAvatarId(id))),
      tideIds: new Set(TIDES.tides.map(({ id }) => parseTideId(id))),
      cardIds: new Set(CARDS.map(({ id }) => parseCardId(id))),
      dreamsignIds: new Set(DREAMSIGNS.map(({ id }) => parseDreamsignId(id))),
    })).toEqual([]);
  });

  it("accepts the signature and Dreamsign cardinality boundaries deterministically without mutation", () => {
    for (const count of [0, 10]) {
      for (const signs of [1, 2]) {
        const input = { ...valid, deckRecipe: { ...valid.deckRecipe, signatureCardIds: cardIds.slice(0, count) }, dreamsignIds: dreamsignIds.slice(0, signs) };
        const before = JSON.stringify(input);
        expect(apollyonRecipeFailures([input], refs)).toEqual([]);
        expect(apollyonRecipeFailures([input], refs)).toEqual([]);
        expect(JSON.stringify(input)).toBe(before);
      }
    }
  });

  it("rejects missing, unknown and duplicate incarnations", () => {
    expect(apollyonRecipeFailures([], refs)).toEqual([`apollyon ${incarnationId}: missing incarnation`]);
    expect(apollyonRecipeFailures([{ ...valid, id: otherIncarnationId }], refs)).toContain(`apollyon ${otherIncarnationId}: unknown incarnation`);
    expect(apollyonRecipeFailures([valid, { ...valid, aspectId: parseAvatarId(otherIncarnationId) }], refs)).toContain(`apollyon ${incarnationId}: duplicate incarnation`);
  });

  it("rejects duplicate Aspects and collisions with roster or any incarnation UUID", () => {
    const two = { ...refs, incarnationIds: new Set([incarnationId, otherIncarnationId]) };
    const other = { ...valid, id: otherIncarnationId };
    expect(apollyonRecipeFailures([valid, other], two)).toContain(`apollyon ${otherIncarnationId}: duplicate aspect ${aspectId}`);
    expect(apollyonRecipeFailures([{ ...valid, aspectId: avatarId }], refs)).toContain(`apollyon ${incarnationId}: aspect collides with avatar ${avatarId}`);
    expect(apollyonRecipeFailures([{ ...valid, aspectId: parseAvatarId(otherIncarnationId) }, { ...other, aspectId }], two)).toContain(`apollyon ${incarnationId}: aspect collides with incarnation ${otherIncarnationId}`);
  });

  it("rejects references outside their respective catalogs and reports all failures", () => {
    const unknown = "00000000-0000-4000-8000-000000000099";
    const bad = { ...valid, deckRecipe: {
      poolAvatarId: parseAvatarId(unknown), archetypeTideIds: [parseTideId(unknown)], signatureCardIds: [parseCardId(unknown)],
    }, dreamsignIds: [parseDreamsignId(unknown)] };
    expect(apollyonRecipeFailures([bad], refs)).toEqual([
      `apollyon ${incarnationId}: unknown pool avatar ${unknown}`,
      `apollyon ${incarnationId}: unknown archetype tide ${unknown}`,
      `apollyon ${incarnationId}: unknown signature card ${unknown}`,
      `apollyon ${incarnationId}: unknown dreamsign ${unknown}`,
    ]);
  });

  it("rejects repeated recipe identities and empty archetype bias", () => {
    expect(apollyonRecipeFailures([{ ...valid, deckRecipe: {
      ...valid.deckRecipe, archetypeTideIds: [tideId, tideId], signatureCardIds: [cardIds[0], cardIds[0]],
    }, dreamsignIds: [dreamsignIds[0], dreamsignIds[0]] }], refs)).toEqual([
      `apollyon ${incarnationId}: duplicate archetype tide ${tideId}`,
      `apollyon ${incarnationId}: duplicate signature card ${cardIds[0]}`,
      `apollyon ${incarnationId}: duplicate dreamsign ${dreamsignIds[0]}`,
    ]);
    expect(apollyonRecipeFailures([{ ...valid, deckRecipe: { ...valid.deckRecipe, archetypeTideIds: [] } }], refs)).toContain(`apollyon ${incarnationId}: empty archetype tides`);
  });

  it("rejects excessive signatures and Dreamsign cardinalities outside 1–2", () => {
    expect(apollyonRecipeFailures([{ ...valid, deckRecipe: { ...valid.deckRecipe, signatureCardIds: cardIds } }], refs)).toContain(`apollyon ${incarnationId}: signature cardinality exceeds 10`);
    for (const signs of [[], dreamsignIds]) {
      expect(apollyonRecipeFailures([{ ...valid, dreamsignIds: signs }], refs)).toContain(`apollyon ${incarnationId}: dreamsign cardinality outside 1–2`);
    }
  });
});
