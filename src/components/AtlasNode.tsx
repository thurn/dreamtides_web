import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { DreamscapeNode } from "../types/quest";
import { useQuest } from "../state/quest-context";
import {
  STARTING_DREAMSCAPE_ICON_CLASS,
  enhancedSiteDescription,
  revealedAtlasSite,
  siteTypeDescription,
  siteTypeIcon,
  siteTypeName,
} from "../atlas/atlas-generator";

const NODE_RADIUS_REGULAR = 28;
const NODE_RADIUS_STARTING = 34;

interface AtlasNodeProps {
  node: DreamscapeNode;
  isStarting: boolean;
  isBoss: boolean;
  onNodeClick: (nodeId: string) => void;
}

/**
 * Per-state visual treatment for a Dream Atlas node. Each of the five
 * {@link import("../types/quest").AtlasNodeState} values reads distinctly:
 *
 * - `unrevealed`: a hollow gray circle with no fill — an unknown future slot.
 * - `revealedLocked`: the dreamscape is visible but desaturated and slightly
 *   dim, since the player cannot travel there yet.
 * - `available`: a bright, glowing, fully saturated node — the reachable pick.
 * - `completed`: a desaturated, checkmarked node the player has already cleared.
 * - `forgone`: a heavily dimmed node on a branch the player can no longer take.
 */
interface NodeVisuals {
  /** Opacity applied to the whole node group. */
  groupOpacity: number;
  /** Circle fill colour. */
  fill: string;
  /** Circle fill opacity. */
  fillOpacity: number;
  /** Circle / ring stroke colour. */
  stroke: string;
  /** Centred site / flag icon colour. */
  iconColor: string;
  /** Whether the icon is drawn (unrevealed nodes show no site icon). */
  showIcon: boolean;
  /** Whether the animated reachable glow ring is drawn. */
  showGlow: boolean;
  /** Below-node label opacity. */
  labelOpacity: number;
  /** Whether a desaturating overlay (grayscale wash) is drawn. */
  desaturated: boolean;
}

function nodeVisuals(node: DreamscapeNode, isStarting: boolean): NodeVisuals {
  switch (node.state) {
    case "available":
      return {
        groupOpacity: 1,
        fill: node.biomeColor,
        fillOpacity: 0.3,
        stroke: "#f8fafc",
        iconColor: "#f8fafc",
        showIcon: true,
        showGlow: true,
        labelOpacity: 0.95,
        desaturated: false,
      };
    case "completed":
      return {
        groupOpacity: 0.7,
        fill: node.biomeColor,
        fillOpacity: 0.16,
        stroke: "#64748b",
        iconColor: "#94a3b8",
        showIcon: true,
        showGlow: false,
        labelOpacity: 0.6,
        desaturated: true,
      };
    case "revealedLocked":
      return {
        groupOpacity: 0.82,
        fill: node.biomeColor,
        fillOpacity: 0.18,
        stroke: "#8b7bb0",
        iconColor: "#cbd5e1",
        showIcon: true,
        showGlow: false,
        labelOpacity: 0.7,
        desaturated: false,
      };
    case "forgone":
      return {
        groupOpacity: 0.3,
        fill: "#2d2040",
        fillOpacity: 0.4,
        stroke: "#4a3860",
        iconColor: "#6b7280",
        showIcon: true,
        showGlow: false,
        labelOpacity: 0.35,
        desaturated: true,
      };
    case "unrevealed":
    default:
      return {
        groupOpacity: isStarting ? 1 : 0.55,
        fill: "#1c1430",
        fillOpacity: 0.5,
        stroke: "#4a3860",
        iconColor: "#6b7280",
        showIcon: false,
        showGlow: false,
        labelOpacity: 0.3,
        desaturated: false,
      };
  }
}

/** Renders a Boxicons glyph centred at (0, `centerY`) inside the SVG node. */
function NodeIcon({
  iconClass,
  size,
  centerY,
  color,
  opacity,
}: {
  iconClass: string;
  size: number;
  centerY: number;
  color: string;
  opacity: number;
}) {
  return (
    <foreignObject
      x={-size / 2}
      y={centerY - size / 2}
      width={size}
      height={size}
      style={{ overflow: "visible", pointerEvents: "none" }}
    >
      <div
        style={{
          display: "flex",
          width: `${String(size)}px`,
          height: `${String(size)}px`,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <i
          className={iconClass}
          aria-hidden="true"
          style={{
            fontSize: `${String(size)}px`,
            lineHeight: 1,
            color,
            opacity,
          }}
        />
      </div>
    </foreignObject>
  );
}

/**
 * Preview content for a node's hover / long-press card: the guide who tends the
 * dreamscape, its thematic affiliation, the guide's home specialty, and any
 * pre-revealed known dreamsign. Fields that cannot be resolved (the starter and
 * unrevealed nodes carry no guide; only some nodes carry a known dreamsign) are
 * left `null` so the preview renders just what is known.
 */
interface NodePreview {
  guideName: string | null;
  affiliationName: string | null;
  homeSpecialty: string | null;
  knownDreamsignName: string | null;
  knownDreamsignEffect: string | null;
}

/** Renders a single node on the Dream Atlas graph. */
export function AtlasNode({
  node,
  isStarting,
  isBoss,
  onNodeClick,
}: AtlasNodeProps) {
  const { questContent } = useQuest();
  const [isHovered, setIsHovered] = useState(false);

  const radius = isStarting || isBoss ? NODE_RADIUS_STARTING : NODE_RADIUS_REGULAR;
  const isAvailable = node.state === "available";
  const isCompleted = node.state === "completed";
  const isUnrevealed = node.state === "unrevealed";

  const visuals = nodeVisuals(node, isStarting);

  const handleClick = () => {
    if (isAvailable) {
      onNodeClick(node.id);
    }
  };

  // The single site revealed inside the dreamscape circle. The starting
  // dreamscape instead shows its own flag glyph, because it is special: it is
  // where the run begins and never carries an enhanced site. Unrevealed nodes
  // show no site icon at all (the slot's contents are unknown). The Battle site
  // is intentionally never revealed elsewhere — the player should know a battle
  // is coming but not always know what surrounds it.
  const revealedSite = revealedAtlasSite(node);
  const iconClass = isStarting
    ? STARTING_DREAMSCAPE_ICON_CLASS
    : isUnrevealed
      ? null
      : revealedSite
        ? siteTypeIcon(revealedSite.type)
        : null;

  // Resolve the rich preview from loaded content. The node references its
  // dreamscape by id; the dreamscape references its guide and affiliation by id;
  // the node may reference a known dreamsign by id. Each lookup is defensive so a
  // legacy/partial node never throws while the atlas renders.
  const preview = useMemo<NodePreview>(() => {
    const dreamscape =
      node.dreamscapeId !== null
        ? questContent.dreamscapes.find((d) => d.id === node.dreamscapeId)
        : undefined;
    const guide =
      dreamscape?.guideId != null
        ? questContent.guides.find((g) => g.id === dreamscape.guideId)
        : undefined;
    const affiliation =
      dreamscape?.affiliationId != null
        ? questContent.affiliations.find((a) => a.id === dreamscape.affiliationId)
        : undefined;
    const dreamsign =
      node.knownDreamsignId !== null
        ? questContent.dreamsignTemplates.find(
            (t) => t.id === node.knownDreamsignId,
          )
        : undefined;
    return {
      guideName: guide?.name ?? null,
      affiliationName: affiliation?.name ?? null,
      homeSpecialty: guide?.homeSpecialty ?? null,
      knownDreamsignName: dreamsign?.name ?? null,
      knownDreamsignEffect: dreamsign?.effectDescription ?? null,
    };
  }, [
    node.dreamscapeId,
    node.knownDreamsignId,
    questContent.dreamscapes,
    questContent.guides,
    questContent.affiliations,
    questContent.dreamsignTemplates,
  ]);

  const hasKnownDreamsign = node.knownDreamsignId !== null;

  // Tooltip header: name what is special about this dreamscape (its enhanced
  // property) where one is revealed.
  const enhancedSite = revealedSite?.isEnhanced ? revealedSite : null;
  const tooltipTitle = isStarting
    ? "Starting Dreamscape"
    : isBoss
      ? "Final Boss"
      : enhancedSite
        ? `Enhanced ${siteTypeName(enhancedSite.type)}`
        : revealedSite
          ? siteTypeName(revealedSite.type)
          : isUnrevealed
            ? "Unrevealed Dreamscape"
            : node.biomeName;
  const tooltipDescription = isStarting
    ? "Where your journey began. No enhanced site."
    : isUnrevealed
      ? "Travel onward to reveal what lies here."
      : enhancedSite
        ? enhancedSiteDescription(enhancedSite.type)
        : revealedSite
          ? siteTypeDescription(revealedSite.type)
          : "";

  const tooltipWidth = 244;
  const tooltipOffsetY = radius + 14;

  const displayName =
    node.biomeName === "" ? (isBoss ? "Boss" : "Unrevealed") : node.biomeName;
  const ariaLabel = `${displayName} dreamscape - ${node.state}${
    isStarting ? " - starting dreamscape" : ""
  }${isBoss ? " - final boss" : ""}${
    hasKnownDreamsign ? " - known dreamsign here" : ""
  }${revealedSite ? ` - ${siteTypeName(revealedSite.type)} revealed` : ""}`;

  const headerColor = node.biomeColor === "" ? "#a855f7" : node.biomeColor;

  return (
    <g
      transform={`translate(${String(node.position.x)}, ${String(node.position.y)})`}
      style={{ cursor: isAvailable ? "pointer" : "default" }}
      onClick={handleClick}
      onMouseEnter={() => {
        setIsHovered(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
      }}
      role={isAvailable ? "button" : undefined}
      aria-label={ariaLabel}
      data-node-state={node.state}
      data-node-boss={isBoss ? "true" : undefined}
      data-node-starting={isStarting ? "true" : undefined}
      data-node-known-dreamsign={hasKnownDreamsign ? "true" : undefined}
    >
      {/* The node's own visuals are dimmed by status, but the hover tooltip is
          rendered outside this group so it always stays fully legible — even for
          forgone or unrevealed dreamscapes the player cannot reach. */}
      <g style={{ opacity: visuals.groupOpacity }}>
        {/* Animated glow ring for the single reachable (available) node. */}
        {visuals.showGlow && (
          <motion.circle
            cx={0}
            cy={0}
            r={radius + 9}
            fill="none"
            stroke={headerColor}
            strokeWidth={2.5}
            initial={{ opacity: 0.35 }}
            animate={{ opacity: [0.35, 0.9, 0.35], scale: [1, 1.05, 1] }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        )}

        {/* Slowly rotating "you are here" ring on the starting dreamscape. */}
        {isStarting && (
          <motion.circle
            cx={0}
            cy={0}
            r={radius + 15}
            fill="none"
            stroke="#a855f7"
            strokeWidth={1.5}
            strokeDasharray="4 4"
            initial={{ opacity: 0.3, rotate: 0 }}
            animate={{ opacity: [0.3, 0.6, 0.3], rotate: 360 }}
            transition={{
              opacity: { duration: 2.5, repeat: Infinity, ease: "easeInOut" },
              rotate: { duration: 24, repeat: Infinity, ease: "linear" },
            }}
          />
        )}

        {/* The boss node is always revealed; a steady amber ring marks the run's
            destination so the player can always see where they are headed. */}
        {isBoss && (
          <circle
            cx={0}
            cy={0}
            r={radius + 7}
            fill="none"
            stroke="#fbbf24"
            strokeWidth={2}
            strokeDasharray="2 5"
            opacity={0.75}
          />
        )}

        {/* Main node circle. Unrevealed nodes read as a hollow gray ring. */}
        <circle
          cx={0}
          cy={0}
          r={radius}
          fill={visuals.fill}
          fillOpacity={visuals.fillOpacity}
          stroke={visuals.stroke}
          strokeWidth={isStarting || isBoss ? 3 : 2}
          strokeDasharray={isUnrevealed ? "3 4" : undefined}
        />

        {/* A faint inner wash desaturates completed and forgone nodes so they
            recede behind the live, fully-coloured available node. */}
        {visuals.desaturated && (
          <circle
            cx={0}
            cy={0}
            r={radius - 1}
            fill="#0b0814"
            fillOpacity={0.35}
            stroke="none"
          />
        )}

        {/* Revealed site (or starting flag, or boss skull) icon centred in the
            dreamscape circle. Completed nodes nudge the icon up so the checkmark
            sits below it without overlapping. */}
        {visuals.showIcon && iconClass !== null && !(isBoss && !isStarting) && (
          <NodeIcon
            iconClass={iconClass}
            size={radius * 1.0}
            centerY={isCompleted ? -radius * 0.34 : 0}
            color={visuals.iconColor}
            opacity={isCompleted ? 0.6 : 1}
          />
        )}

        {/* Boss node uses a dedicated crown glyph regardless of its sites, until
            it is completed (then the checkmark takes over). */}
        {isBoss && !isStarting && !isCompleted && (
          <NodeIcon
            iconClass="bx bx-crown"
            size={radius * 0.95}
            centerY={0}
            color="#fbbf24"
            opacity={1}
          />
        )}

        {/* Checkmark for completed nodes. */}
        {isCompleted && (
          <NodeIcon
            iconClass="bx bx-check"
            size={radius * 0.9}
            centerY={radius * 0.34}
            color="#10b981"
            opacity={1}
          />
        )}

        {/* Biome name below the node. */}
        <text
          x={0}
          y={radius + 16}
          textAnchor="middle"
          fill="#e2e8f0"
          fontSize={10}
          opacity={visuals.labelOpacity}
          style={{ pointerEvents: "none" }}
        >
          {isUnrevealed ? "" : node.biomeName}
        </text>
        {isStarting && (
          <text
            x={0}
            y={radius + 30}
            textAnchor="middle"
            fill="#a855f7"
            fontSize={9}
            fontWeight="bold"
            letterSpacing={1.5}
            opacity={0.95}
            style={{ pointerEvents: "none" }}
          >
            YOU STARTED HERE
          </text>
        )}
      </g>

      {/* Known-dreamsign corner badge: a small star pip at the top-right of the
          node, drawn outside the dimming group so it stays legible even on a
          revealed-locked carrier the player is planning a route toward. */}
      {hasKnownDreamsign && (
        <g
          transform={`translate(${String(radius * 0.72)}, ${String(-radius * 0.72)})`}
          style={{ pointerEvents: "none" }}
        >
          <circle r={9} fill="#1a1025" stroke="#fbbf24" strokeWidth={1.5} />
          <NodeIcon
            iconClass="bxs bx-star"
            size={11}
            centerY={0}
            color="#fbbf24"
            opacity={1}
          />
        </g>
      )}

      {/* Hover / focus preview describing this dreamscape: its enhanced property,
          resident guide, affiliation, home specialty, and any known dreamsign.
          Shown for every node, including ones the player cannot reach yet, so
          they can plan a route. Sized to its content via auto height. */}
      {isHovered && (
        <foreignObject
          x={-tooltipWidth / 2}
          y={tooltipOffsetY}
          width={tooltipWidth}
          height={1}
          style={{ overflow: "visible", pointerEvents: "none" }}
        >
          <div
            style={{
              boxSizing: "border-box",
              width: `${String(tooltipWidth)}px`,
              padding: "9px 12px",
              borderRadius: "8px",
              background: "#15101f",
              border: `1px solid ${headerColor}`,
              boxShadow: "0 6px 18px rgba(0,0,0,0.55)",
              color: "#e2e8f0",
              display: "flex",
              flexDirection: "column",
              gap: "4px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                color: headerColor,
                fontSize: "11px",
                fontWeight: 700,
              }}
            >
              {displayName}
            </div>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "6px",
                fontSize: "11px",
                fontWeight: 700,
              }}
            >
              <i
                className={iconClass ?? STARTING_DREAMSCAPE_ICON_CLASS}
                aria-hidden="true"
                style={{ fontSize: "14px", lineHeight: 1 }}
              />
              <span>{tooltipTitle}</span>
            </div>
            {tooltipDescription !== "" && (
              <div style={{ fontSize: "9px", color: "#cbd5e1", opacity: 0.9 }}>
                {tooltipDescription}
              </div>
            )}

            {(preview.guideName !== null ||
              preview.affiliationName !== null) && (
              <div
                style={{
                  marginTop: "2px",
                  paddingTop: "5px",
                  borderTop: "1px solid rgba(148,163,184,0.18)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "2px",
                }}
              >
                {preview.guideName !== null && (
                  <div style={{ fontSize: "9px", color: "#cbd5e1" }}>
                    <span style={{ opacity: 0.6 }}>{"Guide: "}</span>
                    <span style={{ fontWeight: 700, color: "#c084fc" }}>
                      {preview.guideName}
                    </span>
                  </div>
                )}
                {preview.affiliationName !== null && (
                  <div style={{ fontSize: "9px", color: "#cbd5e1" }}>
                    <span style={{ opacity: 0.6 }}>{"Affiliation: "}</span>
                    <span style={{ fontWeight: 700 }}>
                      {preview.affiliationName}
                    </span>
                  </div>
                )}
                {preview.homeSpecialty !== null && (
                  <div
                    style={{
                      fontSize: "9px",
                      color: "#c084fc",
                      opacity: 0.95,
                    }}
                  >
                    {`⭐ ${preview.homeSpecialty}`}
                  </div>
                )}
              </div>
            )}

            {preview.knownDreamsignName !== null && (
              <div
                style={{
                  marginTop: "2px",
                  paddingTop: "5px",
                  borderTop: "1px solid rgba(251,191,36,0.25)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "2px",
                }}
              >
                <div
                  style={{
                    fontSize: "9px",
                    fontWeight: 700,
                    color: "#fbbf24",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "4px",
                  }}
                >
                  <i
                    className="bxs bx-star"
                    aria-hidden="true"
                    style={{ fontSize: "11px", lineHeight: 1 }}
                  />
                  <span>{`Known Dreamsign: ${preview.knownDreamsignName}`}</span>
                </div>
                {preview.knownDreamsignEffect !== null && (
                  <div
                    style={{ fontSize: "9px", color: "#e2d4a0", opacity: 0.9 }}
                  >
                    {preview.knownDreamsignEffect}
                  </div>
                )}
              </div>
            )}

            {isStarting && (
              <div
                style={{
                  marginTop: "2px",
                  color: "#a855f7",
                  fontSize: "9px",
                  fontWeight: 700,
                  letterSpacing: "1.5px",
                }}
              >
                YOUR STARTING DREAMSCAPE
              </div>
            )}
          </div>
        </foreignObject>
      )}
    </g>
  );
}
