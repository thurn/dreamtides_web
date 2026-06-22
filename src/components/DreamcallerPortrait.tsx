import { useState, type CSSProperties } from "react";
import { assetUrl } from "../runtime/asset-url";

interface DreamcallerVisual {
  imageNumber: string;
  name: string;
  title: string;
}

interface DreamcallerPortraitProps {
  dreamcaller: DreamcallerVisual;
  variant?: "hero" | "panel" | "thumb";
  style?: CSSProperties;
}

function frameStyle(
  variant: NonNullable<DreamcallerPortraitProps["variant"]>,
): CSSProperties {
  switch (variant) {
    case "hero":
      return {
        overflow: "hidden",
        borderRadius: 18,
        background: "#020617",
        border: "1px solid rgba(255, 255, 255, 0.14)",
        boxShadow: "0 18px 34px rgba(0, 0, 0, 0.34)",
      };
    case "panel":
      return {
        overflow: "hidden",
        borderRadius: 14,
        aspectRatio: "1 / 1",
        background: "#020617",
        border: "1px solid rgba(255, 255, 255, 0.12)",
      };
    case "thumb":
      return {
        overflow: "hidden",
        borderRadius: 10,
        aspectRatio: "1 / 1",
        background: "#020617",
        border: "1px solid rgba(255, 255, 255, 0.14)",
      };
  }
}

function imageStyle(
  variant: NonNullable<DreamcallerPortraitProps["variant"]>,
): CSSProperties {
  switch (variant) {
    case "hero":
      return {
        width: "100%",
        height: "auto",
        display: "block",
        transform: "scale(2)",
        transformOrigin: "50% 15%",
      };
    case "panel":
      return {
        width: "100%",
        height: "100%",
        display: "block",
        objectFit: "cover",
        objectPosition: "50% 24%",
        transform: "scale(1.18)",
        transformOrigin: "50% 18%",
      };
    case "thumb":
      return {
        width: "100%",
        height: "100%",
        display: "block",
        objectFit: "cover",
        objectPosition: "50% 22%",
        transform: "scale(1.22)",
        transformOrigin: "50% 18%",
      };
  }
}

function fallbackStyle(
  variant: NonNullable<DreamcallerPortraitProps["variant"]>,
): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    minHeight: variant === "hero" ? 220 : undefined,
    height: variant === "hero" ? undefined : "100%",
    aspectRatio: variant === "hero" ? undefined : "1 / 1",
    background:
      "radial-gradient(circle at 50% 20%, rgba(251, 191, 36, 0.24) 0%, rgba(88, 28, 135, 0.24) 38%, rgba(2, 6, 23, 1) 100%)",
    color: "#f8fafc",
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  };
}

export function dreamcallerImageSrc(imageNumber: string): string {
  return assetUrl(`/dreamcallers/${imageNumber}.png`);
}

export function DreamcallerPortrait({
  dreamcaller,
  variant = "panel",
  style,
}: DreamcallerPortraitProps) {
  const [broken, setBroken] = useState(false);
  const alt = `${dreamcaller.name}, ${dreamcaller.title}`;

  return (
    <div style={{ ...frameStyle(variant), ...style }}>
      {broken ? (
        <div style={fallbackStyle(variant)}>
          <span
            style={{
              fontSize: variant === "thumb" ? 12 : variant === "panel" ? 22 : 42,
            }}
          >
            {dreamcaller.name.charAt(0)}
          </span>
        </div>
      ) : (
        <img
          src={dreamcallerImageSrc(dreamcaller.imageNumber)}
          alt={alt}
          style={imageStyle(variant)}
          onError={() => {
            setBroken(true);
          }}
        />
      )}
    </div>
  );
}
