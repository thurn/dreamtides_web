import bone, { journeyEssenceEffect as boneEffect } from "../../content/dreamsigns/carved-bone-427c71e3";
import skull, { journeyEssenceEffect as skullEffect } from "../../content/dreamsigns/mortal-skull-eb55b141";
import teeth, { journeyOnGainEffect as teethEffect } from "../../content/dreamsigns/paired-teeth-1328e611";
import jellyfish, { journeyOnGainEffect as jellyfishEffect } from "../../content/dreamsigns/rainbow-jellyfish-e7d23bf7";
import { applyJourneyBattleEssence } from "./journey-battle-essence";
import spider, { journeyDuplicationEffect as spiderEffect } from "../../content/dreamsigns/spider-025ce7f1";
import mirror, { journeyDuplicationEffect as mirrorEffect } from "../../content/dreamsigns/cracked-mirror-1cf06f9b";
import shell, { journeyDuplicationEffect as shellEffect } from "../../content/dreamsigns/spiral-shell-da7e4b45";
import { journeyDuplication } from "./journey-duplication";
import witchCoin, { journeyShopEffect as witchCoinEffect } from "../../content/dreamsigns/witch-coin-8a2c7b32";
import crackedOrb, { journeyShopEffect as crackedOrbEffect } from "../../content/dreamsigns/cracked-orb-8408b8c2";
import redShard, { journeyShopEffect as redShardEffect } from "../../content/dreamsigns/red-shard-10bd78de";
import { journeyShop } from "./journey-shop";
import red, { journeyOnGainEffect as redEffect } from "../../content/dreamsigns/red-cheese-7e8c86cc";
import rat, { journeyOnGainEffect as ratEffect } from "../../content/dreamsigns/white-rat-ab1da9d3";
import doll, { journeyOnGainEffect as dollEffect } from "../../content/dreamsigns/voodoo-doll-0df9d72c";
import { journeyOnGain, prepareJourneyOnGain, finishJourneyAcquisition } from "./journey-on-gain";
import raven, { journeyDeckEntryEffect as ravenEffect } from "../../content/dreamsigns/raven-skull-31df4c62";
import acorn, { journeyDeckEntryEffect as acornEffect } from "../../content/dreamsigns/brown-acorn-9f34b5f6";
import crystal, { journeyDeckEntryEffect as crystalEffect } from "../../content/dreamsigns/blue-crystal-c2af5460";
import { journeyDeckEntry, journeyDeckEntryGains } from "./journey-deck-entry";
import { journeyTransfigurationOccurrences } from "./journey-transfiguration";
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
import mushroomCaps, { journeyDraftEffect as mushroomCapsEffect } from "../../content/dreamsigns/mushroom-caps-6b95d6bd";
import twistedHerbs, { journeyOnGainEffect as twistedHerbsEffect } from "../../content/dreamsigns/twisted-herbs-1cd25b9a";

/**
 * A pure hook over a validated gameplay journey transition, separate from the
 * battle DSL. Administrative intents never reach a hook.
 */
export interface JourneyModifierDefinition {
  readonly journeyDuplication?: import("../../types/journey").JourneyDuplicationEffect;
  readonly journeyShop?: import("../../types/journey").JourneyShopEffect;
  readonly dreamsignId: DreamsignId;
  readonly journeyOnGain?: import("../../types/journey").JourneyOnGainEffect;
  readonly journeyDeckEntry?: import("../../types/journey").JourneyDeckEntryEffect;
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
    readonly gains: readonly import("../../types/journey").JourneyDeckEntryGain[];
    readonly random: () => { readonly value: number; readonly drawIndex: number };
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
      readonly shopReplacements?: readonly import("../../types/journey").JourneyShopSlotReplacement[];
      readonly prevented?: readonly import("../../types/journey").PreventedNightmareGain[];
      readonly sparkChanges?: readonly { readonly entryId: import("../../types/identifiers").DeckEntryId; readonly cardId: CardId; readonly before: number; readonly after: number }[];
      readonly nodeId?: AtlasNodeId;
      readonly beforeCardId?: CardId;
      readonly afterCardId?: CardId;
      readonly offeredDreamsignIds?: readonly DreamsignId[];
      readonly drawIndices?: readonly number[];
      readonly incomingDreamsignId?: DreamsignId;
      readonly purges?: readonly JourneyPurgeOccurrence[];
      readonly transfigurations?: readonly { readonly entryId: import("../../types/identifiers").DeckEntryId; readonly cardId: CardId; readonly type: import("../../types/journey").TransfigurationType }[];
      readonly copies?: readonly { readonly fromEntryId: import("../../types/identifiers").DeckEntryId; readonly entryId: import("../../types/identifiers").DeckEntryId; readonly cardId: CardId }[];
    };
  } | null;
}

export interface JourneyModifierRegistry {
  applyBattleCommits(input: Omit<Parameters<typeof applyJourneyBattleEssence>[0], "lookup">): ReturnType<typeof applyJourneyBattleEssence>;
  lookup(dreamsignId: DreamsignId): JourneyModifierDefinition | undefined;
  apply(input: {
    dreamsignGains?: readonly import("../../types/journey").JourneyDreamsignGain[];
    battleBinding?: import("../../types/journey").JourneySuspendedBattle | null;
    before: JourneyState;
    journey: JourneyState;
    eventType: GameplayEventType;
    seq: number;
    random: () => { readonly value: number; readonly drawIndex: number };
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
    applyBattleCommits: (input) => applyJourneyBattleEssence({ ...input, lookup }),
    apply({ before, journey, eventType, seq, random, transfigurations, siteId, purges, dreamsignGains = [], battleBinding = null }) {
      const logRecords: ReducerLogRecord[] = [];
      let next = journey;
      // Fixed post-domain holdings; local physical occurrence cursors preserve
      // once-per-copy reactions without reconsidering an older failed threshold.
      const held = next.dreamsigns.map(({ id }, heldIndex) => ({ id, heldIndex, definition: byId.get(id) }));
      const entrySources = held.filter((source) => source.definition?.journeyDeckEntry !== undefined);
      const transformed = [...transfigurations];
      const consumed = new Map<number, Set<import("../../types/identifiers").DeckEntryId>>();
      const invoke = (source: typeof held[number], gains: readonly import("../../types/journey").JourneyDeckEntryGain[], occurrences = transfigurations, diagnostics = logRecords) => {
        const applied = source.definition?.afterJourneyEvent({ lookup, before, journey: next, eventType,
          heldIndex: source.heldIndex, seq, random, gains, transfigurations: occurrences, siteId, ...(purges === undefined ? {} : { purges }) });
        if (applied == null) return false;
        diagnostics.push({ event: "journey_modifier_applied", fields: {
          dreamsignId: source.id, hook: "after_journey_event", eventType, siteId, heldIndex: source.heldIndex,
          before: snapshot(applied.before), after: snapshot(applied.after),
          ...(applied.target === undefined ? {} : { target: applied.target }),
        } });
        next = applied.journey;
        return true;
      };
      // Prohibited initial additions are excluded before acquisition effects
      // measure the deck. Positive observers retain their ordinary wave order.
      const initialProhibitions = entrySources.filter((item) => item.definition!.journeyDeckEntry!.kind === "preventNightmare");
      if (initialProhibitions.length > 0 && eventType !== "START_JOURNEY") {
        const initialGains = journeyDeckEntryGains(before, next);
        for (const source of initialProhibitions) invoke(source, initialGains);
      }
      const acquisition = prepareJourneyOnGain({ before, journey: next, gains: dreamsignGains, lookup, seq, random, siteId,
        excludeAcquisitionAdditions(previous, tentative) {
          const diagnostics: ReducerLogRecord[] = [];
          next = tentative;
          if (initialProhibitions.length > 0) {
            const gains = journeyDeckEntryGains(previous, next);
            for (const source of initialProhibitions) invoke(source, gains, transfigurations, diagnostics);
          }
          return { journey: next, logRecords: diagnostics };
        },
      });
      next = acquisition.journey;
      logRecords.push(...acquisition.logRecords);
      transformed.push(...acquisition.transfigurations);
      const gainWave = (previous: JourneyState) => {
        if (entrySources.length === 0 || eventType === "START_JOURNEY") return;
        const gains = journeyDeckEntryGains(previous, next);
        if (gains.length === 0) return;
        for (const source of entrySources.filter((item) => item.definition!.journeyDeckEntry!.kind === "preventNightmare")) invoke(source, gains);
        for (const source of entrySources.filter((item) => item.definition!.journeyDeckEntry!.kind !== "preventNightmare")) {
          const prior = next;
          if (invoke(source, gains) && source.definition!.journeyDeckEntry!.kind === "randomTransfiguration") transformed.push(...journeyTransfigurationOccurrences(prior, next));
        }
      };
      const reactCopy = (source: typeof held[number]) => {
        const seen = consumed.get(source.heldIndex) ?? new Set<import("../../types/identifiers").DeckEntryId>();
        consumed.set(source.heldIndex, seen);
        const fresh = transformed.filter((item) => !seen.has(item.entry.entryId));
        for (const item of fresh) seen.add(item.entry.entryId);
        if (fresh.length === 0) return false;
        const previous = next;
        const changed = invoke(source, [], fresh);
        if (changed) gainWave(previous);
        return changed;
      };
      gainWave(before);
      for (const source of held) {
        if (source.definition?.journeyDeckEntry !== undefined) continue;
        if (source.definition?.journeyTransfiguration?.kind === "copyTransfiguredEvent") { reactCopy(source); continue; }
        const previous = next;
        if (invoke(source, [])) {
          if (source.definition?.journeyDraft?.kind === "firstDraftEventTransfiguration") transformed.push(...journeyTransfigurationOccurrences(previous, next));
          gainWave(previous);
        }
      }
      // A Crystal form can appear after an earlier held Tome. Each concrete
      // transformation is consumed once by each Tome; preformed copies supply
      // no further transformation occurrence, so this finite drain terminates.
      let copied: boolean;
      do {
        copied = false;
        for (const source of held.filter((item) => item.definition?.journeyTransfiguration?.kind === "copyTransfiguredEvent")) copied = reactCopy(source) || copied;
      } while (copied);
      return { journey: finishJourneyAcquisition(next, acquisition.copySources, acquisition.starterSources, seq, battleBinding), logRecords };
    },
  } satisfies JourneyModifierRegistry);
}

/** The production registry's fixed catalog registrations. */
export const journeyModifierRegistry = createJourneyModifierRegistry([
  journeyDraft(parseDreamsignId(mushroomCaps.id), mushroomCapsEffect),
  journeyOnGain(parseDreamsignId(twistedHerbs.id), twistedHerbsEffect),
  journeyEssence(parseDreamsignId(bone.id), boneEffect),
  journeyEssence(parseDreamsignId(skull.id), skullEffect),
  journeyOnGain(parseDreamsignId(teeth.id), teethEffect),
  journeyOnGain(parseDreamsignId(jellyfish.id), jellyfishEffect),
  journeyDuplication(parseDreamsignId(spider.id), spiderEffect),
  journeyDuplication(parseDreamsignId(mirror.id), mirrorEffect),
  journeyDuplication(parseDreamsignId(shell.id), shellEffect),
  journeyShop(parseDreamsignId(witchCoin.id), witchCoinEffect),
  journeyShop(parseDreamsignId(crackedOrb.id), crackedOrbEffect),
  journeyShop(parseDreamsignId(redShard.id), redShardEffect),
  journeyOnGain(parseDreamsignId(red.id), redEffect),
  journeyOnGain(parseDreamsignId(rat.id), ratEffect),
  journeyOnGain(parseDreamsignId(doll.id), dollEffect),
  journeyDeckEntry(parseDreamsignId(raven.id), ravenEffect),
  journeyDeckEntry(parseDreamsignId(acorn.id), acornEffect),
  journeyDeckEntry(parseDreamsignId(crystal.id), crystalEffect),
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
