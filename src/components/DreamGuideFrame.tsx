import { useEffect, useMemo, useState } from "react";
import type { CSSProperties } from "react";
import { useQuest } from "../state/quest-context";
import { guideForSiteType } from "../data/dreamscapes";
import type { SiteState, SiteType } from "../types/quest";
import { logEvent } from "../logging";

/** Props for {@link DreamGuideFrame}. */
interface DreamGuideFrameProps {
  /**
   * The site being visited. The guide is resolved from `site.type` (a guide
   * tends exactly one site type), and the home specialty is surfaced when
   * `site.isEnhanced` is set.
   */
  site: SiteState;
}

/**
 * Tracks whether the viewport is in portrait orientation. Portrait stacks the
 * guide as a top frame; landscape docks it as a side frame. Returns `false`
 * (landscape) during SSR / before the media query resolves.
 */
function useIsPortrait(): boolean {
  const [portrait, setPortrait] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || window.matchMedia === undefined) {
      return;
    }
    const query = window.matchMedia("(orientation: portrait)");
    const update = () => setPortrait(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return portrait;
}

/** Accent colour used across the guide frame. */
const GUIDE_ACCENT = "#c084fc";

/**
 * Derives an avatar initial from a guide name, stripping surrounding quotes and
 * leading punctuation so display-only handles (e.g. `"Layaway"`) yield a letter.
 */
function avatarInitial(name: string): string {
  const cleaned = name.replace(/[^\p{L}\p{N}]/gu, "");
  return cleaned.length > 0 ? cleaned[0].toUpperCase() : "?";
}

/** Resolves the guide that tends `siteType` from the loaded guide content. */
function useSiteGuide(siteType: SiteType) {
  const { questContent } = useQuest();
  return useMemo(
    () => guideForSiteType(questContent.guides, siteType),
    [questContent.guides, siteType],
  );
}

/**
 * Presents the Dream Guide resident at a guide-bearing site: a placeholder
 * portrait (an initial avatar — the guides carry no art), the guide's name, a
 * line of their dialog, and, when the site is the guide's enhanced home site,
 * the guide's home specialty text. The frame docks to the top of the screen in
 * portrait and to the left side in landscape so it brackets the site content
 * without overlapping it. Renders nothing when no guide tends the site type
 * (e.g. Battle, Draft, Essence, Dreamsign Reward).
 */
export function DreamGuideFrame({ site }: DreamGuideFrameProps) {
  const guide = useSiteGuide(site.type);
  const isPortrait = useIsPortrait();

  useEffect(() => {
    if (guide === null) return;
    logEvent("dream_guide_presented", {
      guideId: guide.id,
      siteType: site.type,
      isEnhanced: site.isEnhanced,
      showsHomeSpecialty: site.isEnhanced,
    });
  }, [guide, site.type, site.isEnhanced]);

  // A guide greets the player at every instance of their site type, but the
  // dialog line shown rotates per visit so repeat visits feel less canned.
  const dialogLine = useMemo(() => {
    if (guide === null || guide.dialog.length === 0) return null;
    const index = Math.floor(Math.random() * guide.dialog.length);
    return guide.dialog[index];
  }, [guide]);

  if (guide === null) {
    return null;
  }

  // Portrait: a top frame in the normal flow (a guide bar above the content).
  // Landscape: a side frame docked to the left edge, vertically centred and
  // out of the content flow so it brackets the screen without reflowing it.
  const containerStyle: CSSProperties = isPortrait
    ? {
        position: "relative",
        flexDirection: "row",
        alignItems: "center",
        gap: "0.75rem",
        width: "100%",
        maxWidth: "640px",
        margin: "0 auto 1rem auto",
        zIndex: 5,
      }
    : {
        position: "fixed",
        left: "0.75rem",
        top: "50%",
        transform: "translateY(-50%)",
        flexDirection: "column",
        alignItems: "center",
        gap: "0.75rem",
        width: "176px",
        zIndex: 20,
      };

  return (
    <div
      data-dream-guide-frame=""
      data-guide-id={guide.id}
      data-guide-enhanced={site.isEnhanced ? "true" : "false"}
      data-guide-orientation={isPortrait ? "portrait" : "landscape"}
      className="flex rounded-xl p-3"
      style={{
        background: "rgba(20, 14, 32, 0.85)",
        border: `1px solid ${GUIDE_ACCENT}40`,
        boxShadow: `0 0 14px ${GUIDE_ACCENT}1a`,
        ...containerStyle,
      }}
    >
      {/* Placeholder portrait: an initial avatar (the guides carry no art). */}
      <div
        aria-hidden="true"
        className="flex shrink-0 items-center justify-center rounded-full font-bold"
        style={{
          width: "56px",
          height: "56px",
          background: `linear-gradient(135deg, ${GUIDE_ACCENT} 0%, #7c3aed 100%)`,
          color: "#1a1026",
          fontSize: "1.5rem",
          boxShadow: `0 0 10px ${GUIDE_ACCENT}55`,
        }}
      >
        {avatarInitial(guide.name)}
      </div>

      <div
        className="flex min-w-0 flex-col gap-1"
        style={{ textAlign: isPortrait ? "left" : "center" }}
      >
        <span
          className="text-base font-bold leading-tight"
          style={{ color: GUIDE_ACCENT }}
        >
          {guide.name}
        </span>
        {dialogLine !== null && (
          <span className="text-sm italic leading-snug opacity-80">
            {`“${dialogLine}”`}
          </span>
        )}
        {site.isEnhanced && (
          <span
            className="mt-1 rounded-md px-2 py-1 text-xs font-medium leading-snug"
            data-guide-home-specialty=""
            style={{
              background: `${GUIDE_ACCENT}1f`,
              border: `1px solid ${GUIDE_ACCENT}45`,
              color: GUIDE_ACCENT,
            }}
          >
            {`⭐ Home specialty: ${guide.homeSpecialty}`}
          </span>
        )}
      </div>
    </div>
  );
}
