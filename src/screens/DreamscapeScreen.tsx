import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuest } from "../state/quest-context";
import {
  siteTypeDescription,
  siteTypeIcon,
  siteTypeName,
} from "../atlas/atlas-generator";
import { dreamscapeSceneUrl } from "../atlas/atlas-display";
import { draftSitePickCount } from "../draft/draft-site-config";
import {
  DreamscapeMotes,
  DreamscapeSiteNode,
  DreamscapeSitePopover,
  type DreamscapeSiteModel,
} from "../components/DreamscapeSiteNode";
import { scatterSites, seedFromString } from "./dreamscape-scatter";
import { logEvent } from "../logging";
import "./dreamscape.css";

/** Diameter, in px, of a wayside site disc (battle guardians scale up from here). */
const NODE_SIZE = 60;

/** Default accent for an ordinary site node, as a `#rrggbb` hex. */
const DEFAULT_ACCENT = "#a855f7";

/** Battle label by completion level: final boss or a plain battle. */
function battleLabel(completionLevel: number): string {
  if (completionLevel === 6) return "Final Boss";
  return "Battle";
}

/** Battle accent (`#rrggbb`) by completion level + lock state. */
function battleAccent(completionLevel: number, isLocked: boolean): string {
  if (isLocked) return "#6b7280";
  if (completionLevel === 6) return "#fbbf24";
  return "#ef4444";
}

/**
 * The dreamscape detail screen. The dreamscape fills the viewport as its scene
 * art; each site floats in the scene as a circular node, and hovering a node
 * raises a frosted popover with its name and a one-line mechanic blurb. The
 * guardian battle is gated behind the dreamscape's other sites: while locked it
 * shows grey with a padlock.
 */
export function DreamscapeScreen() {
  const { state, mutations } = useQuest();
  const { currentDreamscape, completionLevel } = state;

  const node = currentDreamscape !== null ? state.atlas.nodes[currentDreamscape] : undefined;

  const remainingNonBattleSiteCount = useMemo(
    () =>
      node?.sites.filter((site) => site.type !== "Battle" && !site.isVisited).length ?? 0,
    [node],
  );

  const allNonBattleVisited = useMemo(() => {
    if (!node) return false;
    return node.sites.filter((s) => s.type !== "Battle").every((s) => s.isVisited);
  }, [node]);

  // Build the placed-site models: stable seeded scatter + per-site label,
  // blurb, accent, and interaction state. Battles are locked until every other
  // site in the dreamscape has been visited.
  const models = useMemo<DreamscapeSiteModel[]>(() => {
    if (!node) return [];
    const positions = scatterSites(node.sites.length, seedFromString(node.id));
    return node.sites.map((site, index) => {
      const isBattle = site.type === "Battle";
      const isLocked = isBattle && !allNonBattleVisited;
      const isInteractive = !site.isVisited && !isLocked;
      const label = isBattle
        ? battleLabel(completionLevel)
        : site.type === "Draft"
          ? `Draft ${String(draftSitePickCount(site))}x`
          : siteTypeName(site.type);
      const blurb = siteTypeDescription(site.type);
      const accent = isBattle
        ? battleAccent(completionLevel, isLocked)
        : DEFAULT_ACCENT;
      return {
        site,
        pos: positions[index] ?? { x: 50, y: 58 },
        index,
        isBattle,
        isLocked,
        isInteractive,
        label,
        blurb,
        icon: siteTypeIcon(site.type),
        accent,
      };
    });
  }, [node, allNonBattleVisited, completionLevel]);

  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Cross-fade the scene art in whenever the dreamscape changes.
  const dreamscapeId = node?.dreamscapeId ?? null;
  const [sceneShown, setSceneShown] = useState(false);
  useEffect(() => {
    setSceneShown(false);
    const id = setTimeout(() => setSceneShown(true), 30);
    return () => clearTimeout(id);
  }, [dreamscapeId]);

  // Reconstruction log: which dreamscape was presented, its guardian-unlock state,
  // and the exact seeded layout of every site node shown on the overview.
  useEffect(() => {
    if (!node) return;
    logEvent("dreamscape_overview_presented", {
      nodeId: node.id,
      dreamscapeId: node.dreamscapeId,
      biomeName: node.biomeName,
      completionLevel,
      layoutSeed: seedFromString(node.id),
      battleUnlocked: allNonBattleVisited,
      remainingNonBattleSiteCount,
      sites: models.map((m) => ({
        siteId: m.site.id,
        type: m.site.type,
        isEnhanced: m.site.isEnhanced,
        isVisited: m.site.isVisited,
        isLocked: m.isLocked,
        pos: m.pos,
      })),
    });
    // Re-log only when the presented dreamscape changes, not on hover.
  }, [node?.id]);

  const handleSiteClick = useCallback(
    (siteId: string) => {
      if (!node) return;
      const site = node.sites.find((s) => s.id === siteId);
      if (!site) return;

      logEvent("site_entered", {
        siteType: site.type,
        dreamscapeId: node.id,
        siteId: site.id,
        isEnhanced: site.isEnhanced,
      });

      mutations.setScreen({ type: "site", siteId });
    },
    [node, mutations],
  );

  if (!node) {
    return (
      <div className="dreamscape-detail" data-dreamscape-detail="">
        <p className="ds-empty">No dreamscape selected.</p>
      </div>
    );
  }

  const sceneUrl = dreamscapeId !== null ? dreamscapeSceneUrl(dreamscapeId) : null;
  const title = node.biomeName.length > 0 ? node.biomeName : "An Unknown Dream";
  const hoveredModel = hoveredIndex !== null ? (models[hoveredIndex] ?? null) : null;

  return (
    <div
      className="dreamscape-detail"
      data-dreamscape-detail=""
      data-dreamscape-id={dreamscapeId ?? undefined}
      data-battle-unlocked={allNonBattleVisited ? "true" : "false"}
    >
      <div className="ds-scene">
        {sceneUrl !== null && (
          <img
            key={dreamscapeId ?? "scene"}
            className={sceneShown ? "shown" : ""}
            src={sceneUrl}
            alt={title}
          />
        )}
      </div>

      <DreamscapeMotes on />
      <div className="ds-vignette" />
      <div className="ds-title-scrim" />

      <div className="ds-title-block">
        <h1 className="ds-name">{title}</h1>
      </div>

      {/* Visited sites are cleared from the scene; only the sites still to do
          remain placed. The seeded scatter keeps each remaining node's position
          stable as siblings are completed. */}
      {models
        .filter((model) => !model.site.isVisited)
        .map((model) => (
          <DreamscapeSiteNode
            key={model.site.id}
            model={model}
            size={NODE_SIZE}
            motion
            hovered={hoveredIndex === model.index}
            onHover={setHoveredIndex}
            onSelect={handleSiteClick}
          />
        ))}

      {hoveredModel !== null && <DreamscapeSitePopover model={hoveredModel} />}
    </div>
  );
}
