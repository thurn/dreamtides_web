/**
 * Runtime documents assembled from the content modules.
 *
 * Each runtime loader validates one document: a content payload plus its
 * `schemaVersion` and identity hashes. The hashes are SHA-256 digests of the
 * payload's canonical JSON (keys sorted), so any content edit changes them;
 * saved journeys and battle logs record them to identify the content they
 * were played against. `foldHash` uses the same digest as `contentHash`.
 * Documents are built on first use.
 */
import { sha256 } from "js-sha256";
import {
  parseContentHash,
  parseFoldHash,
  type ContentHash,
  type FoldHash,
} from "../types/content-hash";
import { AFFILIATIONS } from "./affiliations";
import { AI } from "./ai";
import { APOLLYON_INCARNATIONS } from "./apollyon";
import { ATLAS } from "./atlas";
import { AUGURY } from "./augury";
import { AVATARS } from "./avatars";
import { BATTLE } from "./battle";
import { CARDS } from "./cards";
import { DRAFT } from "./draft";
import { DREAMSCAPES } from "./dreamscapes";
import { DREAMSIGNS } from "./dreamsigns";
import { DREAMWELL_CARDS } from "./dreamwell";
import { DREAMWELL_RULES } from "./dreamwell-rules";
import { ECONOMY } from "./economy";
import { EXPLORATION } from "./exploration";
import { FIGMENTS } from "./figments";
import { GAMBLE } from "./gamble";
import { DREAM_GUIDES } from "./guides";
import { OPPONENTS } from "./opponents";
import { RESONANCE } from "./resonance";
import { SHOP } from "./shop";
import { SITES } from "./sites";
import { TIDES } from "./tides";
import { TRANSFIGURATION } from "./transfiguration";
import { TUTORIAL } from "./tutorial";

/** Serializes a value as JSON with object keys sorted at every level. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Identity hashes of a payload: SHA-256 of its canonical JSON. */
export function contentHashes(payload: unknown): {
  contentHash: ContentHash;
  foldHash: FoldHash;
} {
  const hex = sha256(canonicalJson(payload));
  return { contentHash: parseContentHash(hex), foldHash: parseFoldHash(hex) };
}

/** Memoizes a document so its hashes are computed on first use only. */
function lazy<T>(build: () => T): () => T {
  let value: T | undefined;
  return () => (value ??= build());
}

function hashed<T extends object, V extends number = 1>(
  payload: T,
  schemaVersion: V = 1 as V,
): T & { schemaVersion: V; contentHash: ContentHash; foldHash: FoldHash } {
  return { schemaVersion, ...payload, ...contentHashes(payload) };
}

function contentHashed<T extends object>(
  payload: T,
): T & { schemaVersion: 1; contentHash: ContentHash } {
  return {
    schemaVersion: 1,
    ...payload,
    contentHash: contentHashes(payload).contentHash,
  };
}

function hashesOnly<T extends object>(
  payload: T,
): T & { contentHash: ContentHash; foldHash: FoldHash } {
  return { ...payload, ...contentHashes(payload) };
}

/** Drops the authoring-only content status from an entity definition. */
function withoutStatus<T extends { pending?: true; vanilla?: true }>(
  entity: T,
): Omit<T, "pending" | "vanilla"> {
  const { pending: _pending, vanilla: _vanilla, ...rest } = entity;
  return rest;
}

export const cardsDocument = lazy(() => CARDS.map(withoutStatus));
export const dreamsignsDocument = lazy(() => DREAMSIGNS.map(withoutStatus));
export const avatarsDocument = lazy(() => AVATARS.map(withoutStatus));
export const dreamwellCardsDocument = lazy(() =>
  DREAMWELL_CARDS.map(withoutStatus),
);
export const figmentsDocument = lazy(() => FIGMENTS.map(withoutStatus));
export const affiliationsDocument = lazy(() => AFFILIATIONS);
export const apollyonIncarnationsDocument = lazy(() => APOLLYON_INCARNATIONS);
export const dreamscapesDocument = lazy(() => DREAMSCAPES);
export const atlasDocument = lazy(() => hashed(ATLAS));
export const auguryDocument = lazy(() => hashed(AUGURY));
export const draftDocument = lazy(() => hashed(DRAFT));
export const explorationDocument = lazy(() => hashed(EXPLORATION, 2));
export const gambleDocument = lazy(() => hashed(GAMBLE));
export const sitesDocument = lazy(() => hashed(SITES));
export const transfigurationDocument = lazy(() => hashed(TRANSFIGURATION));
export const tutorialDocument = lazy(() => hashesOnly(TUTORIAL));
export const dreamGuidesDocument = lazy(() =>
  contentHashed({ guides: DREAM_GUIDES }),
);
export const resonanceDocument = lazy(() =>
  contentHashed({ resonances: RESONANCE }),
);

export const opponentsDocument = lazy(() =>
  hashed({
    opponentDeckSize: OPPONENTS.opponentDeckSize,
    battle: BATTLE,
    dreamwell: DREAMWELL_RULES,
    progression: OPPONENTS.progression,
    ai: AI.ai,
  }),
);

export const economyDocument = lazy(() =>
  hashed({
    journey: ECONOMY,
    shop: SHOP,
    siteRewards: SITES.rewards,
    purge: SITES.purge,
    battleReward: BATTLE.reward,
  }),
);

/** The tides4 pool document: curated tides plus each Avatar's tide pool. */
export const tides4Document = lazy(() => ({
  version: 2 as const,
  ...TIDES,
  tidePoolByAvatar: Object.fromEntries(
    AVATARS.map((avatar) => [
      avatar.id,
      {
        starter: avatar.tidePool.starter ?? null,
        facets: avatar.tidePool.facets,
        neutral: avatar.tidePool.neutral,
      },
    ]),
  ),
}));

/** Card roles derived from the card catalog's `roles` fields. */
export const cardRoleDocument = lazy(() => {
  const nightmare = CARDS.find((card) => card.roles?.includes("nightmare"));
  if (nightmare === undefined) {
    throw new Error("No card carries the nightmare role.");
  }
  return hashed({
    starterDeckCardIds: CARDS.filter((card) =>
      card.roles?.includes("starter-deck"),
    ).map((card) => card.id),
    nightmare: {
      cardId: nightmare.id,
      historicalCardNumber: nightmare.cardNumber,
      displayName: nightmare.name,
    },
  });
});
