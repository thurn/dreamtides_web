// The pure view-model builder for the Cumulus dreamscape screen. Every mapping
// rule between journey domain data and `DreamscapeScreen`'s view types lives here
// as plain, unit-testable functions — no React, no state hooks, no effects.
// `DreamscapeScreenAdapter` acquires live state and calls `buildDreamscapeView`;
// this module never acquires anything itself.

import {
  siteTypeDescription,
  siteTypeIcon,
  siteTypeName,
} from "../../data/sites-data";
import { requireDreamsignId } from "../../data/dreamsigns";
import { draftSitePickCount } from "../../draft/draft-site-config";
import {
  scatterSites,
  seedFromString,
} from "../../cumulus/components/dreamscape/dreamscape-scatter";
import type {
  DreamscapeSiteLabel,
  DreamscapeSiteModel,
} from "../../cumulus/components/dreamscape/SiteNode";
import type {
  QsbDreamAvatar,
  QsbDreamsign,
} from "../../cumulus/components/hud/JourneyStatusBar";
import { artRef, type ArtRef } from "../../cumulus/primitives/art";
import { glyph } from "../../cumulus/primitives/glyph";
import type {
  DreamscapeGuideDialogueView,
  DreamscapeView,
  InlineRewardView,
} from "../../cumulus/screens/DreamscapeScreen";
import type { DreamsignReplacementView } from "../../cumulus/screens/DreamsignReplacementDialog";
import type {
  DreamAvatar,
  Dreamsign,
  DreamscapeNode,
  JourneyState,
} from "../../types/journey";
import type { SitesData } from "../../types/sites-data";
import type { TutorialDreamscapeConfiguration } from "../../types/tutorial";
import { tutorialSpeechBubbleDelaySeconds } from "../../data/tutorial-speech-bubble";

/** The completion level at which the guardian battle is the final boss. */
const FINAL_BOSS_COMPLETION_LEVEL = 6;

/** Fallback scatter point when a site index has no seeded position. */
const FALLBACK_POS = { x: 50, y: 58 } as const;

/** App-shell data consumed once by CumulusJourneyChrome for every product screen. */
export interface JourneyChromeHudView {
  essence: number;
  deck: number;
  dreamAvatar?: QsbDreamAvatar;
  dreamsigns: QsbDreamsign[];
}

/** The deterministic scatter seed for a dreamscape node, exposed so the adapter
 * can record it in the reconstruction log without reaching into Cumulus. */
export function dreamscapeLayoutSeed(node: DreamscapeNode): number {
  return seedFromString(node.id);
}

/** Reconstruction fields for one presented dreamscape overview. */
export function buildDreamscapeOverviewLog(
  node: DreamscapeNode,
  view: DreamscapeView,
  completionLevel: number,
): Record<string, unknown> {
  return {
    nodeId: node.id,
    dreamscapeId: node.dreamscapeId,
    biomeName: node.biomeName,
    completionLevel,
    layoutSeed: dreamscapeLayoutSeed(node),
    sites: view.sites.map((model) => ({
      siteId: model.site.id,
      type: model.site.type,
      isEnhanced: model.site.isEnhanced,
      isVisited: model.site.isVisited,
      isLocked: model.isLocked,
      pos: model.pos,
    })),
  };
}

/** Resolves a site click to the live site and its reconstruction fields. */
export function resolveDreamscapeSiteSelection(
  node: DreamscapeNode,
  siteId: string,
  essence: number,
) {
  const site = node.sites.find((candidate) => candidate.id === siteId);
  if (site === undefined) return null;
  return {
    site,
    fields: {
      siteType: site.type,
      dreamscapeId: node.id,
      siteId: site.id,
      isEnhanced: site.isEnhanced,
      essenceBefore: essence,
    },
  };
}

/** Battle label by completion level: the final boss or a plain battle. */
export function battleLabel(completionLevel: number): DreamscapeSiteLabel {
  return {
    kind: "battle",
    isFinalBoss: completionLevel === FINAL_BOSS_COMPLETION_LEVEL,
  };
}

/**
 * The placed-site models for a dreamscape node: a stable seeded scatter plus
 * each site's label, blurb, glyph, and interaction state. The guardian battle
 * is locked until every other site in the dreamscape has been visited.
 */
export function buildSiteModels(
  node: DreamscapeNode,
  completionLevel: number,
  sitesData: SitesData,
  defaultDraftPickCount: number,
): DreamscapeSiteModel[] {
  const allNonBattleVisited = node.sites
    .filter((site) => site.type !== "Battle")
    .every((site) => site.isVisited);
  const positions = scatterSites(node.sites.length, seedFromString(node.id));
  return node.sites.map((site, index) => {
    const isBattle = site.type === "Battle";
    const isLocked = isBattle && !allNonBattleVisited;
    const isInteractive = !site.isVisited && !isLocked;
    const label: DreamscapeSiteLabel = isBattle
      ? battleLabel(completionLevel)
      : site.type === "Draft"
        ? {
            kind: "draft",
            pickCount: draftSitePickCount(site, defaultDraftPickCount),
          }
        : { kind: "authored", name: siteTypeName(sitesData, site.type) };
    return {
      site,
      pos: positions[index] ?? FALLBACK_POS,
      index,
      isBattle,
      isLocked,
      isInteractive,
      label,
      blurb: siteTypeDescription(sitesData, site.type),
      icon: glyph(siteTypeIcon(sitesData, site.type)),
    };
  });
}

/** Map the active DreamAvatar to the bust the JourneyStatusBar docks. */
export function toQsbDreamAvatar(
  dreamAvatar: DreamAvatar | null,
): QsbDreamAvatar | undefined {
  if (dreamAvatar === null) {
    return undefined;
  }
  return {
    id: dreamAvatar.id,
    name: dreamAvatar.name,
    epithet: dreamAvatar.title,
    portrait: artRef.dreamAvatar(dreamAvatar.imageNumber),
    portraitFocus: dreamAvatar.portraitFocus,
    ability: dreamAvatar.renderedText,
  };
}

/**
 * Map the run's owned dreamsigns to their docked HUD objects, resolved by
 * `imageName` (never by name). A dreamsign without art is dropped rather than
 * docked as a broken tile.
 */
export function toQsbDreamsigns(
  dreamsigns: readonly Dreamsign[],
): QsbDreamsign[] {
  const docked: QsbDreamsign[] = [];
  dreamsigns.forEach((sign) => {
    if (sign.imageName === undefined) {
      return;
    }
    docked.push({
      id: requireDreamsignId(sign, "JourneyStatusBar docked"),
      name: sign.name,
      imageName: sign.imageName,
      imageAlt: sign.imageAlt,
      effectDescription: sign.effectDescription,
    });
  });
  return docked;
}

/** The bottom-HUD slice of the view-model, from live run state. */
export function buildDreamscapeHudView(
  state: JourneyState,
): JourneyChromeHudView {
  const activeRuntime =
    state.screen.type === "site"
      ? state.siteRuntime[state.screen.siteId]
      : undefined;
  const pendingExplorationEssence =
    activeRuntime?.kind === "exploration"
      ? (activeRuntime.resolution?.essenceGained ?? 0)
      : 0;
  return {
    essence: Math.max(0, state.essence - pendingExplorationEssence),
    deck: state.deck.length,
    dreamAvatar: toQsbDreamAvatar(state.dreamAvatar),
    dreamsigns: toQsbDreamsigns(state.dreamsigns),
  };
}

/** The scene art reference for a dreamscape node, or null while unrevealed. */
export function dreamscapeSceneRef(node: DreamscapeNode): ArtRef | null {
  return node.dreamscapeId !== null
    ? artRef.dreamscapeScene(node.dreamscapeId)
    : null;
}

/** The dreamscape's display title, with a fallback for an unrevealed dream. */
export function dreamscapeTitle(node: DreamscapeNode): string {
  return node.biomeName.length > 0 ? node.biomeName : "An Unknown Dream";
}

/**
 * The full view-model for the dreamscape screen: the scene and its placed site
 * nodes. Persistent journey chrome is derived once by the router-owned wrapper.
 */
export function buildDreamscapeView(
  node: DreamscapeNode,
  state: JourneyState,
  sitesData: SitesData,
  replacementSiteId: string | null = null,
  tutorialConfiguration?: TutorialDreamscapeConfiguration,
  defaultDraftPickCount?: number,
): DreamscapeView {
  if (defaultDraftPickCount === undefined) {
    throw new Error("Dreamscape view requires validated Draft data.");
  }
  const inlineRewards: Record<string, InlineRewardView> = {};
  node.sites.forEach((site) => {
    const runtime = state.siteRuntime?.[site.id];
    if (site.type === "Essence" && runtime?.kind === "essence") {
      inlineRewards[site.id] = { kind: "essence", amount: runtime.amount };
      return;
    }
    if (site.type !== "Reward" || runtime?.kind !== "reward") {
      return;
    }
    if (runtime.reward.rewardType === "dreamsign") {
      inlineRewards[site.id] = {
        kind: "dreamsign",
        dreamsign: runtime.reward.dreamsign,
        requiresReplacement: state.dreamsigns.length >= state.maxDreamsigns,
      };
      return;
    }
    inlineRewards[site.id] = {
      kind: "essence",
      amount: runtime.reward.essenceAmount,
    };
  });
  return {
    scene: dreamscapeSceneRef(node),
    title: dreamscapeTitle(node),
    sites: buildSiteModels(
      node,
      state.completionLevel,
      sitesData,
      defaultDraftPickCount,
    ),
    inlineRewards,
    replacement: buildDreamsignReplacementView(state, replacementSiteId),
    guideDialogue: buildDreamscapeGuideDialogue(
      node,
      state,
      tutorialConfiguration,
    ),
  };
}

/**
 * Build Mira's guidance only for the first visit to the tutorial dreamscape,
 * after the starter-deck modal closes.
 */
export function buildDreamscapeGuideDialogue(
  node: DreamscapeNode,
  state: JourneyState,
  configuration?: TutorialDreamscapeConfiguration,
): DreamscapeGuideDialogueView | undefined {
  const hasVisitedSite = node.sites.some((site) => site.isVisited);
  if (
    state.isTutorialJourney !== true ||
    state.completionLevel !== 0 ||
    !state.hasSeenStartingDeckPopup ||
    hasVisitedSite ||
    configuration === undefined
  ) {
    return undefined;
  }
  const speechBubble = configuration.speechBubble;
  return {
    id: `${state.runId ?? state.seed}:dreamscape-guidance`,
    model: {
      portrait: { kind: "character-portrait", characterId: "mira" },
      portraitAlt: "Mira",
      speakerName: "Mira",
      text: speechBubble.text,
    },
    delaySeconds: tutorialSpeechBubbleDelaySeconds(speechBubble),
    horizontalOffset: speechBubble.horizontalOffset,
    verticalOffset: speechBubble.verticalOffset,
    bubbleWidth: speechBubble.bubbleWidth,
  };
}

/** Reconstruction fields for the moment delayed dreamscape guidance appears. */
export function buildDreamscapeGuidanceLog(
  nodeId: string,
  state: JourneyState,
  dialogue: DreamscapeGuideDialogueView,
): {
  readonly key: string;
  readonly fields: Record<string, unknown>;
} {
  return {
    key: `tutorial-dreamscape-guidance:${state.runId ?? state.seed}:${nodeId}`,
    fields: {
      nodeId,
      delaySeconds: dialogue.delaySeconds,
      horizontalOffsetPx: dialogue.horizontalOffset,
      verticalOffsetPx: dialogue.verticalOffset,
      bubbleWidthPx: dialogue.bubbleWidth,
      text: dialogue.model.text,
    },
  };
}

/** Build the UUID-backed replacement choice for an at-cap Reward site. */
export function buildDreamsignReplacementView(
  state: JourneyState,
  siteId: string | null,
): DreamsignReplacementView | null {
  if (siteId === null || state.dreamsigns.length < state.maxDreamsigns) {
    return null;
  }
  const runtime = state.siteRuntime[siteId];
  if (
    runtime?.kind !== "reward" ||
    runtime.accepted ||
    runtime.reward.rewardType !== "dreamsign"
  ) {
    return null;
  }
  return {
    pendingDreamsign: runtime.reward.dreamsign,
    currentDreamsigns: state.dreamsigns,
    maxDreamsigns: state.maxDreamsigns,
  };
}
