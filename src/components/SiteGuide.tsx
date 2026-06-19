import { useEffect, useMemo, useState } from "react";
import { useQuest } from "../state/quest-context";
import { guideForSiteType } from "../data/dreamscapes";
import { guidePortraitUrl } from "../atlas/atlas-display";
import { logEvent } from "../logging";
import type { SiteType } from "../types/quest";
import "./site-guide.css";

/** Props for {@link SiteGuide}. */
interface SiteGuideProps {
  /**
   * The site type whose resident guide should greet the player. Each guide
   * tends exactly one site type, so this resolves the guide unambiguously.
   */
  siteType: SiteType;
  /**
   * Whether the visited site is the guide's enhanced home site. Used only for
   * the `dream_guide_presented` log entry so analytics can tell home visits
   * apart from fill visits; the presentation itself does not change.
   */
  isEnhanced?: boolean;
}

/**
 * The resident Dream Guide for a site, presented as a character portrait with a
 * speech bubble docked to the lower-left of the scene. This is the single,
 * shared guide presentation every dreamscape site uses, so the guide looks
 * identical across the Shop, Purge, Duplication, Transfiguration, Dream Augury,
 * Dreamsign Revelation, and the not-yet-built sites.
 *
 * The guide is resolved from `siteType` and a dialog line is chosen per visit so
 * repeat visits feel less canned. It is decorative chrome layered over the
 * feature UI (`aria-hidden`); on narrow viewports it is hidden via CSS so the
 * feature takes the full stage. Renders nothing when no guide tends the site
 * type (e.g. Draft, Essence, Dreamsign Draft).
 */
export function SiteGuide({ siteType, isEnhanced = false }: SiteGuideProps) {
  const { questContent } = useQuest();

  const guide = useMemo(
    () => guideForSiteType(questContent.guides, siteType),
    [questContent.guides, siteType],
  );
  const guideLine = useMemo(() => {
    if (guide === null || guide.dialog.length === 0) return null;
    return guide.dialog[Math.floor(Math.random() * guide.dialog.length)];
  }, [guide]);

  // Entrance animation: the portrait slides in and the bubble fades up once the
  // component mounts, matching the Dreamsign Revelation reveal.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setMounted(true), 20);
    return () => window.clearTimeout(id);
  }, []);

  const [imageBroken, setImageBroken] = useState(false);

  useEffect(() => {
    if (guide === null) return;
    logEvent("dream_guide_presented", {
      guideId: guide.id,
      siteType,
      isEnhanced,
    });
  }, [guide, siteType, isEnhanced]);

  if (guide === null) {
    return null;
  }

  return (
    <div
      className={`site-guide${mounted ? " mounted" : ""}`}
      data-site-guide=""
      data-guide-id={guide.id}
      data-guide-enhanced={isEnhanced ? "true" : "false"}
      aria-hidden="true"
    >
      <div className="site-guide-bubble">
        <span className="site-guide-name">{guide.name}</span>
        {guideLine !== null && <p>{`“${guideLine}”`}</p>}
      </div>
      {!imageBroken && (
        <img
          className="site-guide-portrait"
          src={guidePortraitUrl(guide.id)}
          alt={guide.name}
          onError={() => setImageBroken(true)}
        />
      )}
    </div>
  );
}
