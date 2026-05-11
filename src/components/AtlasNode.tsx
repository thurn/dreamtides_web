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
const NODE_RADIUS_STARTING = 34;

interface AtlasNodeProps {
  node: DreamscapeNode;
  isStarting: boolean;
  onNodeClick: (nodeId: string) => void;
}

/** Renders a single node on the Dream Atlas graph. */
export function AtlasNode({ node, isStarting, onNodeClick }: AtlasNodeProps) {
  const [isHovered, setIsHovered] = useState(false);

  const radius = isStarting ? NODE_RADIUS_STARTING : NODE_RADIUS_REGULAR;
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

  // The one site we reveal inside the dreamscape circle. The Battle site is
  // intentionally never revealed — the player should know a battle is coming
  // but not always know what surrounds it. The remaining sites (including
  // Battle) show as "?" placeholders in the hover popover.
  const revealedSite = revealedAtlasSite(node);
  const hiddenSiteCount = revealedSite
    ? Math.max(node.sites.length - 1, 0)
    : node.sites.length;

  // Tooltip dimensions
  const tooltipWidth = 240;
  const tooltipHeight = isStarting ? 104 : 88;
  const tooltipOffsetY = radius + 12;

  const ariaLabel = `${node.biomeName} dreamscape - ${node.status}${
    isStarting ? " - starting dreamscape" : ""
  }${revealedSite ? ` - ${siteTypeName(revealedSite.type)} revealed` : ""}`;

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
      aria-label={ariaLabel}
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

      {/* Revealed site icon centered inside the dreamscape circle. Completed
          nodes overlay the checkmark on top, but we still show the icon as a
          dim reminder of what the dreamscape contained. */}
      {revealedSite && (
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
      {isCompleted && (
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

      {/* Hover tooltip */}
      {isHovered && (isAvailable || isCompleted) && revealedSite && (
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
          {isStarting && (
            <text
              x={0}
              y={tooltipHeight - 10}
              textAnchor="middle"
              fill="#a855f7"
              fontSize={9}
              fontWeight="bold"
              letterSpacing={1.5}
            >
              YOUR STARTING DREAMSCAPE
            </text>
          )}
        </g>
      )}
    </g>
  );
}
