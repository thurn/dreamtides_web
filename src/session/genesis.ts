// Genesis of a local game: the seed, reducer protocol, and pinned content
// configuration a new game is created with, and the check that a stored game
// can still be folded by this build.

import { CURRENT_REDUCER_VERSION, isReducerVersionCompatible } from "./reducer-version";
import type {
  ContentConfig,
  PinnedContentConfig,
  PinnedGenesis,
  StoredGenesis,
} from "../eventlog/types";
import type { FrontDoorPhase } from "../rules/fold-state";
import { isFoldableGenesis } from "../eventlog/wire";
import { contentConfigsEqual } from "../runtime/runtime-config";
import { parseJourneySeed, type JourneySeed } from "../types/journey-seed";

/** The front-door scene a new game starts on; journeys omit it. */
export type FrontDoorEntry = Exclude<FrontDoorPhase, "mainExiting" | "journey">;

function freshSeed(): JourneySeed {
  const cryptoSource = globalThis.crypto;
  if (typeof cryptoSource?.randomUUID === "function") {
    return parseJourneySeed(cryptoSource.randomUUID());
  }
  const bytes = new Uint8Array(16);
  cryptoSource.getRandomValues(bytes);
  return parseJourneySeed(
    Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(""),
  );
}

/**
 * The genesis of a new game: a fresh seed, the current reducer protocol, now,
 * and the fold-relevant content configuration of this build.
 */
export function createFreshGenesis(
  contentConfig: PinnedContentConfig,
  frontDoorEntry?: FrontDoorEntry,
): PinnedGenesis {
  return {
    seed: freshSeed(),
    reducerVersion: CURRENT_REDUCER_VERSION,
    createdAt: Date.now(),
    contentConfig,
    ...(frontDoorEntry === undefined ? {} : { frontDoorEntry }),
  };
}

export function hasPinnedContentConfig(
  genesis: StoredGenesis,
): genesis is PinnedGenesis {
  if (!isFoldableGenesis(genesis)) return false;
  const config = genesis.contentConfig;
  return (
    typeof config.atlasFoldHash === "string" &&
    typeof config.sitesFoldHash === "string" &&
    typeof config.draftFoldHash === "string" &&
    typeof config.cardRolesFoldHash === "string" &&
    typeof config.economyFoldHash === "string" &&
    typeof config.gambleFoldHash === "string" &&
    typeof config.transfigurationFoldHash === "string" &&
    typeof config.rewardSelectionFoldHash === "string" &&
    typeof config.auguryFoldHash === "string" &&
    typeof config.explorationFoldHash === "string" &&
    typeof config.tutorialFoldHash === "string" &&
    typeof config.opponentsFoldHash === "string"
  );
}

/**
 * Whether this build can fold a stored game: an incompatible reducer protocol
 * is checked first, then the pinned content configuration, which must be
 * complete and equal to this build's.
 */
export function genesisCompatibility(
  genesis: StoredGenesis,
  localContentConfig: ContentConfig,
): "ready" | "versionGate" | "configGate" {
  if (!isReducerVersionCompatible(genesis.reducerVersion)) {
    return "versionGate";
  }
  if (
    !hasPinnedContentConfig(genesis) ||
    !contentConfigsEqual(genesis.contentConfig, localContentConfig)
  ) {
    return "configGate";
  }
  return "ready";
}
