import { useState } from "react";
import { motion } from "framer-motion";
import type { DreamscapeNode } from "../types/quest";
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
  onNodeClick: (nodeId: string) => void;
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

/** Renders a single node on the Dream Atlas graph. */
export function AtlasNode({ node, isStarting, onNodeClick }: AtlasNodeProps) {
  const [isHovered, setIsHovered] = useState(false);

  const radius = isStarting ? NODE_RADIUS_STARTING : NODE_RADIUS_REGULAR;
  const isAvailable = node.state === "available";
  const isCompleted = node.state === "completed";
  // Revealed-but-locked, forgone, and unrevealed nodes are all rendered dimmed
  // for now; the full per-state visual treatment is a later task.
  const isUnavailable = !isAvailable && !isCompleted;

  const handleClick = () => {
    if (isAvailable) {
      onNodeClick(node.id);
    }
  };

  // Node opacity
  let opacity = 1;
  if (isUnavailable) {
    opacity = 0.35;
  } else if (isCompleted) {
    opacity = 0.6;
  }

  // Node color
  let fillColor = node.biomeColor;
  if (isUnavailable) {
    fillColor = "#2d2040";
  }

  // Border color
  let strokeColor: string;
  if (isAvailable) {
    strokeColor = "#e2e8f0";
  } else if (isUnavailable) {
    strokeColor = "#4a3860";
  } else {
    strokeColor = "#6b7280";
  }

  // The single site revealed inside the dreamscape circle. The starting
  // dreamscape instead shows its own flag glyph, because it is special: it is
  // where the run begins and never carries an enhanced site. The Battle site is
  // intentionally never revealed elsewhere — the player should know a battle is
  // coming but not always know what surrounds it.
  const revealedSite = revealedAtlasSite(node);
  const iconClass = isStarting
    ? STARTING_DREAMSCAPE_ICON_CLASS
    : revealedSite
      ? siteTypeIcon(revealedSite.type)
      : null;
  const iconColor = isCompleted ? "#94a3b8" : "#f8fafc";

  // Tooltip: describe what is special about this dreamscape (its enhanced
  // property) on hover.
  const enhancedSite = revealedSite?.isEnhanced ? revealedSite : null;
  const tooltipTitle = isStarting
    ? "Starting Dreamscape"
    : enhancedSite
      ? `Enhanced ${siteTypeName(enhancedSite.type)}`
      : revealedSite
        ? siteTypeName(revealedSite.type)
        : node.biomeName;
  const tooltipDescription = isStarting
    ? "Where your journey began. No enhanced site."
    : enhancedSite
      ? enhancedSiteDescription(enhancedSite.type)
      : revealedSite
        ? siteTypeDescription(revealedSite.type)
        : "";

  const tooltipWidth = 230;
  const tooltipHeight = 92;
  const tooltipOffsetY = radius + 14;

  const displayName = node.biomeName === "" ? "Unrevealed" : node.biomeName;
  const ariaLabel = `${displayName} dreamscape - ${node.state}${
    isStarting ? " - starting dreamscape" : ""
  }${revealedSite ? ` - ${siteTypeName(revealedSite.type)} revealed` : ""}`;

  return (
    <g
      transform={`translate(${String(node.position.x)}, ${String(node.position.y)})`}
      style={{ cursor: isAvailable ? "pointer" : "default" }}
      onClick={handleClick}
      onMouseEnter={() => { setIsHovered(true); }}
      onMouseLeave={() => { setIsHovered(false); }}
      role={isAvailable ? "button" : undefined}
      aria-label={ariaLabel}
    >
      {/* The node's own visuals are dimmed by status (unavailable dreamscapes
          are faded back, completed ones slightly), but the hover tooltip is
          rendered outside this group so it always stays fully legible — even for
          unavailable dreamscapes the player cannot reach yet. */}
      <g style={{ opacity }}>
      {/* Glow effect for available nodes */}
      {isAvailable && (
        <motion.circle
          cx={0}
          cy={0}
          r={radius + 8}
          fill="none"
          stroke={strokeColor}
          strokeWidth={2}
          initial={{ opacity: 0.3 }}
          animate={{ opacity: [0.3, 0.8, 0.3] }}
          transition={{
            duration: 2,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      )}

      {/* Subtle pulsing ring for the starting dreamscape to call out
          "you are here" without competing with the available-node glow. */}
      {isStarting && (
        <motion.circle
          cx={0}
          cy={0}
          r={radius + 14}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          initial={{ opacity: 0.25, rotate: 0 }}
          animate={{ opacity: [0.25, 0.55, 0.25], rotate: 360 }}
          transition={{
            opacity: { duration: 2.5, repeat: Infinity, ease: "easeInOut" },
            rotate: { duration: 24, repeat: Infinity, ease: "linear" },
          }}
        />
      )}

      {/* Main node circle */}
      <circle
        cx={0}
        cy={0}
        r={radius}
        fill={fillColor}
        fillOpacity={0.25}
        stroke={strokeColor}
        strokeWidth={isStarting ? 3 : 2}
      />

      {/* Revealed site (or starting flag) icon centred in the dreamscape circle.
          Completed nodes overlay the checkmark on top, but the icon stays as a
          dim reminder of what the dreamscape contained. */}
      {iconClass !== null && (
        <NodeIcon
          iconClass={iconClass}
          size={radius * 1.0}
          centerY={isCompleted ? -radius * 0.34 : 0}
          color={iconColor}
          opacity={isCompleted ? 0.5 : 1}
        />
      )}

      {/* Checkmark for completed nodes */}
      {isCompleted && (
        <NodeIcon
          iconClass="bx bx-check"
          size={radius * 0.9}
          centerY={radius * 0.34}
          color="#10b981"
          opacity={1}
        />
      )}

      {/* Biome name (with starting marker) below the node */}
      <text
        x={0}
        y={radius + 16}
        textAnchor="middle"
        fill="#e2e8f0"
        fontSize={10}
        opacity={isUnavailable ? 0.4 : 0.8}
        style={{ pointerEvents: "none" }}
      >
        {node.biomeName}
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
          opacity={0.9}
          style={{ pointerEvents: "none" }}
        >
          YOU STARTED HERE
        </text>
      )}
      </g>

      {/* Hover tooltip describing this dreamscape's enhanced property. Shown for
          every dreamscape, including unavailable ones the player cannot reach
          yet, so they can preview what is special about each one. */}
      {isHovered && (
        <foreignObject
          x={-tooltipWidth / 2}
          y={tooltipOffsetY}
          width={tooltipWidth}
          height={tooltipHeight}
          style={{ overflow: "visible", pointerEvents: "none" }}
        >
          <div
            style={{
              boxSizing: "border-box",
              width: `${String(tooltipWidth)}px`,
              padding: "8px 12px",
              borderRadius: "8px",
              background: "#1a1025",
              border: `1px solid ${node.biomeColor}`,
              color: "#e2e8f0",
              display: "flex",
              flexDirection: "column",
              gap: "3px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                color: node.biomeColor,
                fontSize: "11px",
                fontWeight: 700,
              }}
            >
              {node.biomeName}
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
            <div style={{ fontSize: "9px", color: "#cbd5e1", opacity: 0.9 }}>
              {tooltipDescription}
            </div>
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
