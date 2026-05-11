import { useState } from "react";
import { motion } from "framer-motion";
import type { DreamscapeNode } from "../types/quest";
import {
  revealedAtlasSite,
  siteTypeDescription,
  siteTypeIcon,
  siteTypeName,
} from "../atlas/atlas-generator";

const NODE_RADIUS_REGULAR = 28;
const NODE_RADIUS_NEXUS = 40;

interface AtlasNodeProps {
  node: DreamscapeNode;
  isNexus: boolean;
  onNodeClick: (nodeId: string) => void;
}

/** Renders a single node on the Dream Atlas graph. */
export function AtlasNode({ node, isNexus, onNodeClick }: AtlasNodeProps) {
  const [isHovered, setIsHovered] = useState(false);

  const radius = isNexus ? NODE_RADIUS_NEXUS : NODE_RADIUS_REGULAR;
  const isAvailable = node.status === "available";
  const isCompleted = node.status === "completed";
  const isUnavailable = node.status === "unavailable";

  const handleClick = () => {
    if (isAvailable) {
      onNodeClick(node.id);
    }
  };

  // Node opacity
  let opacity = 1;
  if (isUnavailable) {
    opacity = 0.35;
  } else if (isCompleted && !isNexus) {
    opacity = 0.6;
  }

  // Node color
  let fillColor = node.biomeColor;
  if (isNexus) {
    fillColor = "#7c3aed";
  } else if (isUnavailable) {
    fillColor = "#2d2040";
  }

  // Border color
  let strokeColor = node.biomeColor;
  if (isNexus) {
    strokeColor = "#a855f7";
  } else if (isAvailable) {
    strokeColor = "#e2e8f0";
  } else if (isUnavailable) {
    strokeColor = "#4a3860";
  } else {
    strokeColor = "#6b7280";
  }

  // The one site we reveal inside the dreamscape circle. The Battle site is
  // intentionally never revealed — the player should know a battle is coming
  // but not always know what surrounds it. The remaining sites (including
  // Battle) show as "?" placeholders in the hover popover.
  const revealedSite = isNexus ? null : revealedAtlasSite(node);
  const hiddenSiteCount = revealedSite
    ? Math.max(node.sites.length - 1, 0)
    : node.sites.length;

  // Tooltip dimensions
  const tooltipWidth = 240;
  const tooltipHeight = 88;
  const tooltipOffsetY = radius + 12;

  return (
    <g
      transform={`translate(${String(node.position.x)}, ${String(node.position.y)})`}
      style={{
        cursor: isAvailable ? "pointer" : "default",
        opacity,
      }}
      onClick={handleClick}
      onMouseEnter={() => { setIsHovered(true); }}
      onMouseLeave={() => { setIsHovered(false); }}
      role={isAvailable ? "button" : undefined}
      aria-label={
        isNexus
          ? "Nexus"
          : `${node.biomeName} dreamscape - ${node.status}${
              revealedSite ? ` - ${siteTypeName(revealedSite.type)} revealed` : ""
            }`
      }
    >
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

      {/* Main node circle */}
      <circle
        cx={0}
        cy={0}
        r={radius}
        fill={fillColor}
        fillOpacity={isNexus ? 0.4 : 0.25}
        stroke={strokeColor}
        strokeWidth={isNexus ? 3 : 2}
      />

      {/* Inner circle for nexus */}
      {isNexus && (
        <circle
          cx={0}
          cy={0}
          r={radius * 0.6}
          fill="#7c3aed"
          fillOpacity={0.6}
          stroke="#a855f7"
          strokeWidth={1}
        />
      )}

      {/* Revealed site icon centered inside the dreamscape circle. Completed
          nodes overlay the checkmark on top, but we still show the icon as a
          dim reminder of what the dreamscape contained. */}
      {!isNexus && revealedSite && (
        <text
          x={0}
          y={radius * 0.28}
          textAnchor="middle"
          fontSize={radius * 0.95}
          opacity={isCompleted ? 0.35 : 1}
          style={{ pointerEvents: "none" }}
        >
          {siteTypeIcon(revealedSite.type)}
        </text>
      )}

      {/* Checkmark for completed nodes */}
      {isCompleted && !isNexus && (
        <text
          x={0}
          y={4}
          textAnchor="middle"
          fill="#10b981"
          fontSize={radius * 0.8}
          fontWeight="bold"
          style={{ pointerEvents: "none" }}
        >
          {"✓"}
        </text>
      )}

      {/* Nexus label */}
      {isNexus && (
        <text
          x={0}
          y={5}
          textAnchor="middle"
          fill="#e2e8f0"
          fontSize={14}
          fontWeight="bold"
          style={{ pointerEvents: "none" }}
        >
          N
        </text>
      )}

      {/* Biome name below node (non-nexus) */}
      {!isNexus && (
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
      )}

      {/* Hover tooltip */}
      {isHovered && (isAvailable || isCompleted) && !isNexus && revealedSite && (
        <g transform={`translate(0, ${String(tooltipOffsetY)})`}>
          <rect
            x={-tooltipWidth / 2}
            y={0}
            width={tooltipWidth}
            height={tooltipHeight}
            rx={8}
            fill="#1a1025"
            stroke={node.biomeColor}
            strokeWidth={1}
            opacity={0.95}
          />
          {/* Biome name in tooltip */}
          <text
            x={0}
            y={16}
            textAnchor="middle"
            fill={node.biomeColor}
            fontSize={11}
            fontWeight="bold"
          >
            {node.biomeName}
          </text>
          {/* Revealed site name */}
          <text
            x={0}
            y={34}
            textAnchor="middle"
            fill="#e2e8f0"
            fontSize={11}
            fontWeight="bold"
          >
            {siteTypeIcon(revealedSite.type)} {siteTypeName(revealedSite.type)}
            {revealedSite.isEnhanced ? " ★" : ""}
          </text>
          {/* Revealed site description */}
          <text
            x={0}
            y={50}
            textAnchor="middle"
            fill="#cbd5e1"
            fontSize={9}
            opacity={0.85}
          >
            {siteTypeDescription(revealedSite.type)}
          </text>
          {/* "?" placeholders for the remaining hidden sites */}
          {hiddenSiteCount > 0 && (
            <text
              x={0}
              y={72}
              textAnchor="middle"
              fill="#94a3b8"
              fontSize={11}
              letterSpacing={4}
            >
              {Array.from({ length: hiddenSiteCount }, () => "?").join(" ")}
            </text>
          )}
        </g>
      )}
    </g>
  );
}
