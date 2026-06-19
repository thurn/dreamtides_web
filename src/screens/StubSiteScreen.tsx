import { useCallback, useEffect } from "react";
import { motion } from "framer-motion";
import type { SiteState } from "../types/quest";
import { useQuest } from "../state/quest-context";
import { siteTypeName } from "../atlas/atlas-generator";
import { SiteGuide } from "../components/SiteGuide";
import { logEvent } from "../logging";

/** Props for the StubSiteScreen component. */
interface StubSiteScreenProps {
  site: SiteState;
}

/**
 * Placeholder screen for site types whose full mechanics arrive in a later
 * task (Tempting Offer, Gamble, Temporal Fork). It presents the site's Dream
 * Guide via {@link SiteGuide}, frames the site by name, shows a short
 * "coming soon" body, and a Continue button that completes the site and returns
 * to the dreamscape so the player can keep traveling.
 */
export function StubSiteScreen({ site }: StubSiteScreenProps) {
  const { mutations } = useQuest();
  const siteName = siteTypeName(site.type);

  useEffect(() => {
    logEvent("site_entered", {
      siteType: site.type,
      isEnhanced: site.isEnhanced,
      stub: true,
    });
  }, [site.type, site.isEnhanced]);

  const handleContinue = useCallback(() => {
    logEvent("site_completed", {
      siteType: site.type,
      outcome: "stub_continue",
    });
    mutations.completeSite(site.id, "stub_site_continue");
  }, [mutations, site.id, site.type]);

  return (
    <motion.div
      className="flex min-h-full flex-col items-center justify-center gap-4 p-8"
      data-stub-site-screen=""
      data-stub-site-type={site.type}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
    >
      <SiteGuide siteType={site.type} isEnhanced={site.isEnhanced} />
      <h2 className="text-2xl font-bold md:text-3xl" style={{ color: "#a855f7" }}>
        {siteName}
      </h2>
      {site.isEnhanced && (
        <span
          className="rounded-full px-3 py-1 text-sm font-bold"
          style={{
            background: "rgba(168, 85, 247, 0.15)",
            color: "#c084fc",
            border: "1px solid rgba(168, 85, 247, 0.3)",
          }}
        >
          {"⭐"} Enhanced
        </span>
      )}
      <p className="max-w-md text-center opacity-60">
        This part of the dream is still taking shape. Travel on for now — its
        full encounter arrives soon.
      </p>
      <button
        type="button"
        className="rounded-lg px-6 py-2.5 font-medium text-white"
        style={{ backgroundColor: "#7c3aed" }}
        data-stub-site-continue=""
        onClick={handleContinue}
      >
        Continue
      </button>
    </motion.div>
  );
}
