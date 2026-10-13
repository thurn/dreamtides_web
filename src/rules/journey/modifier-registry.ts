import starBadge, { journeyEssenceEffect as starEffect } from "../../content/dreamsigns/star-badge-af92858a";
import pearlShell, { journeyEssenceEffect as pearlEffect } from "../../content/dreamsigns/pearl-shell-be59c0ba";
import bandedWorm, { journeyEssenceEffect as wormEffect } from "../../content/dreamsigns/banded-worm-95a162c1";
import { journeyEssence } from "./journey-essence";
import type { ReducerLogRecord } from "../../eventlog/types";
import type { AtlasNodeId, DreamsignId, SiteId } from "../../types/identifiers";
import { parseDreamsignId } from "../../types/identifiers";
import type { CardId } from "../../types/card-identity";
import rainbowMushroom, { journeySitesEffect as rainbowEffect } from "../../content/dreamsigns/rainbow-mushroom-58472ad2";
import curledTail, { journeySitesEffect as curledEffect } from "../../content/dreamsigns/curled-tail-3c0ced1a";
import { journeySites } from "./journey-sites";
import fruit, { journeyEssenceEffect as fruitEffect } from "../../content/dreamsigns/strange-fruit-f4df5a74";
import slug, { journeyPurgeEffect as slugEffect } from "../../content/dreamsigns/slug-108841ce";
import sickle, { journeyPurgeEffect as sickleEffect } from "../../content/dreamsigns/sickle-488bf436";
import { journeyPurge } from "./journey-purge";
import type { JourneyPurgeEffect, JourneyPurgeOccurrence, JourneyEssenceEffect, JourneySitesEffect, JourneyDraftEffect, JourneyState } from "../../types/journey";
import clamShell, { journeyDraftEffect as clamEffect } from "../../content/dreamsigns/clam-shell-2dcf92bf";
import seaUrchin, { journeyDraftEffect as urchinEffect } from "../../content/dreamsigns/sea-urchin-1c505034";
import rosemary, { journeySitesEffect as rosemaryEffect } from "../../content/dreamsigns/rosemary-cd81a49d";
import { journeyDraft } from "./journey-draft";
import tome, { journeyTransfigurationEffect as tomeEffect } from "../../content/dreamsigns/spell-tome-0c52e8c3";
import slime, { journeyTransfigurationEffect as slimeEffect } from "../../content/dreamsigns/green-slime-452b7cd6";
import ledger, { journeySitesEffect as ledgerEffect } from "../../content/dreamsigns/leaf-ledger-d9f0f7ff";
import { journeyTransfiguration } from "./journey-transfiguration";
import type { GameplayEventType } from "../events";

/**
 * A pure hook over a validated gameplay journey transition, separate from the
 * battle DSL. Administrative intents never reach a hook.
 */
export interface JourneyModifierDefinition {
  readonly dreamsignId: DreamsignId;
  readonly journeySites?: JourneySitesEffect;
  readonly journeyDraft?: JourneyDraftEffect;
  readonly journeyEssence?: JourneyEssenceEffect;
  readonly journeyPurge?: JourneyPurgeEffect;
  readonly journeyTransfiguration?: import("../../types/journey").JourneyTransfigurationEffect;
  /**
   * Return null when this transition does not apply the effect. Hooks must be
   * deterministic, must not mutate either input, and must not perform IO.
   * Specific primitive hooks extend this registry as their rules are implemented.
   */
  readonly afterJourneyEvent: (input: {
    /** The same fixed UUID registry supplied to this transition, with lookup only. */
    readonly lookup: JourneyModifierRegistry["lookup"];
    readonly before: Readonly<JourneyState>;
    readonly journey: Readonly<JourneyState>;
    readonly eventType: GameplayEventType;
    readonly heldIndex: number;
    readonly seq: number;
    readonly transfigurations: readonly import("../../types/journey").JourneyTransfigurationOccurrence[];
    readonly siteId: SiteId | null;
    readonly purges?: readonly JourneyPurgeOccurrence[];
  }) => {
    readonly journey: JourneyState;
    /** Numeric rule values only: catalog names and copy cannot enter diagnostics. */
    readonly before: Readonly<Record<string, number>>;
    readonly after: Readonly<Record<string, number>>;
    readonly target?: {
      readonly siteIds: readonly SiteId[];
      readonly nodeId?: AtlasNodeId;
      readonly beforeCardId?: CardId;
      readonly afterCardId?: CardId;
      readonly incomingDreamsignId?: DreamsignId;
      readonly purges?: readonly JourneyPurgeOccurrence[];
      readonly transfigurations?: readonly { readonly entryId: import("../../types/identifiers").DeckEntryId; readonly cardId: CardId; readonly type: import("../../types/journey").TransfigurationType }[];
      readonly copies?: readonly { readonly fromEntryId: import("../../types/identifiers").DeckEntryId; readonly entryId: import("../../types/identifiers").DeckEntryId; readonly cardId: CardId }[];
    };
  } | null;
}

export interface JourneyModifierRegistry {
  lookup(dreamsignId: DreamsignId): JourneyModifierDefinition | undefined;
  apply(input: {
    before: JourneyState;
    journey: JourneyState;
    eventType: GameplayEventType;
    seq: number;
    transfigurations: readonly import("../../types/journey").JourneyTransfigurationOccurrence[];
    siteId: SiteId | null;
    purges?: readonly JourneyPurgeOccurrence[];
  }): { journey: JourneyState; logRecords: readonly ReducerLogRecord[] };
}

function snapshot(values: Readonly<Record<string, number>>): Record<string, number> {
  if (Object.values(values).some((value) => !Number.isFinite(value))) {
    throw new Error("Journey modifier diagnostics require finite numeric values.");
  }
  return { ...values };
}

/**
 * Build a fixed UUID-keyed registry. Duplicate registrations are programmer
 * errors; the copied definitions cannot change when the caller edits its list.
 */
export function createJourneyModifierRegistry(
  definitions: readonly JourneyModifierDefinition[],
): JourneyModifierRegistry {
  const byId = new Map<DreamsignId, JourneyModifierDefinition>();
  for (const definition of definitions) {
    const dreamsignId = parseDreamsignId(definition.dreamsignId);
    if (byId.has(dreamsignId)) {
      throw new Error(`Duplicate journey modifier registration: ${dreamsignId}`);
    }
    byId.set(dreamsignId, Object.freeze({ ...definition, dreamsignId }));
  }
  const lookup = (dreamsignId: DreamsignId) => byId.get(dreamsignId);
  return Object.freeze({
    lookup,
    apply({ before, journey, eventType, seq, transfigurations, siteId, purges }) {
      const logRecords: ReducerLogRecord[] = [];
      let next = journey;
      // Snapshot the post-domain holdings: hooks run in held order, once per
      // copy held after the event, so a Dreamsign the event gains applies to
      // it and one the event removes does not (docs/design.md § Dreamsign
      // journey effects). A hook changing the holdings does not alter this
      // iteration.
      for (const [heldIndex, { id }] of journey.dreamsigns.entries()) {
        const definition = byId.get(id);
        const applied = definition?.afterJourneyEvent({ lookup, before, journey: next, eventType, heldIndex, seq, transfigurations, siteId, ...(purges === undefined ? {} : { purges }) });
        if (applied == null) continue;
        logRecords.push({
          event: "journey_modifier_applied",
          fields: {
            dreamsignId: id,
            hook: "after_journey_event",
            eventType,
            siteId,
            heldIndex,
            before: snapshot(applied.before),
            after: snapshot(applied.after),
            ...(applied.target === undefined ? {} : { target: applied.target }),
          },
        });
        next = applied.journey;
      }
      return { journey: next, logRecords };
    },
  } satisfies JourneyModifierRegistry);
}

/** The production registry's fixed catalog registrations. */
export const journeyModifierRegistry = createJourneyModifierRegistry([
  journeyEssence(parseDreamsignId(starBadge.id), starEffect),
  journeyEssence(parseDreamsignId(pearlShell.id), pearlEffect),
  journeyEssence(parseDreamsignId(bandedWorm.id), wormEffect),
  journeySites(parseDreamsignId(rainbowMushroom.id), rainbowEffect),
  journeySites(parseDreamsignId(curledTail.id), curledEffect),
  journeyEssence(parseDreamsignId(fruit.id), fruitEffect),
  journeyPurge(parseDreamsignId(slug.id), slugEffect),
  journeyPurge(parseDreamsignId(sickle.id), sickleEffect),
  journeyDraft(parseDreamsignId(clamShell.id), clamEffect),
  journeyDraft(parseDreamsignId(seaUrchin.id), urchinEffect),
  journeySites(parseDreamsignId(rosemary.id), rosemaryEffect),
  journeyTransfiguration(parseDreamsignId(tome.id), tomeEffect),
  journeyTransfiguration(parseDreamsignId(slime.id), slimeEffect),
  journeySites(parseDreamsignId(ledger.id), ledgerEffect),
]);
