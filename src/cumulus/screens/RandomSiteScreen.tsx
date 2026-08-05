import { motion, useReducedMotion } from "framer-motion";
import { useCallback, useRef, useState } from "react";
import type { RandomSiteDestinationType, SiteState } from "../../types/journey";
import type { ArtRef } from "../primitives/art";
import { token } from "../primitives/tokens";
import type { Glyph } from "../primitives/glyph";
import { GlassPanel } from "../components/overlay/GlassPanel";
import { SiteNode, type DreamscapeSiteModel } from "../components/dreamscape/SiteNode";
import { GuideGallerySiteLayout, type GuideGalleryGuideView } from "./GuideGallerySiteLayout";
import { GUIDE_GALLERY_MOBILE_PANEL_WIDTH } from "./guide-gallery-geometry";

export interface RandomSiteChoiceView {
  siteType: RandomSiteDestinationType;
  label: string;
  blurb: string;
  icon: Glyph;
}

export interface RandomSiteView {
  siteId: string;
  scene: ArtRef | null;
  guide: GuideGalleryGuideView;
  choices: readonly RandomSiteChoiceView[];
}

export function RandomSiteScreen({
  view,
  onChoose,
}: {
  view: RandomSiteView;
  onChoose: (siteType: RandomSiteDestinationType) => void;
}) {
  const reduceMotion = useReducedMotion();
  const [selected, setSelected] = useState<RandomSiteDestinationType | null>(null);
  const committed = useRef(false);
  const choose = useCallback((siteType: RandomSiteDestinationType) => {
    if (committed.current) return;
    committed.current = true;
    setSelected(siteType);
    if (reduceMotion === true) {
      onChoose(siteType);
      return;
    }
    window.setTimeout(() => onChoose(siteType), 420);
  }, [onChoose, reduceMotion]);

  return (
    <GuideGallerySiteLayout
      siteId={view.siteId}
      scene={view.scene}
      guide={view.guide}
      desktopComposition="showcase"
      mobileComposition="revelation"
      screenTestId="cumulus-random-site-screen"
      guideArtTestId="cumulus-random-site-guide-art"
      renderGallery={(layout) => (
        <motion.section
          data-random-site-choice-panel=""
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: reduceMotion === true ? 0 : 0.28, duration: reduceMotion === true ? 0 : 0.32 }}
          style={{
            position: "relative",
            zIndex: 10,
            width: layout === "desktop" ? "min(760px, 100%)" : GUIDE_GALLERY_MOBILE_PANEL_WIDTH,
            height: layout === "desktop" ? 330 : "100%",
            maxHeight: "100%",
            pointerEvents: "auto",
            alignSelf: "center",
            justifySelf: "center",
          }}
        >
          <GlassPanel headerDivider={false} testId="cumulus-random-site-panel">
            <div
              style={{
                minHeight: 260,
                height: "100%",
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                alignItems: "center",
                gap: token("--space-7"),
                padding: token("--space-8"),
              }}
            >
              {view.choices.map((choice, index) => {
                const choiceSite: SiteState = {
                  id: `${view.siteId}:random:${choice.siteType}`,
                  type: choice.siteType,
                  isEnhanced: true,
                  isVisited: false,
                  guideIdOverride: "maddox",
                };
                const model: DreamscapeSiteModel = {
                  site: choiceSite,
                  pos: { x: 50, y: 50 },
                  index,
                  isBattle: false,
                  isLocked: false,
                  isInteractive: selected === null,
                  label: choice.label,
                  blurb: choice.blurb,
                  icon: choice.icon,
                };
                return (
                  <motion.div
                    key={choice.siteType}
                    data-random-site-choice={choice.siteType}
                    animate={selected === null
                      ? { opacity: 1, scale: 1, y: 0 }
                      : selected === choice.siteType
                        ? { opacity: 1, scale: 1.45, y: -20 }
                        : { opacity: 0, scale: 0.72, y: 12 }}
                    transition={{ duration: reduceMotion === true ? 0 : 0.38, ease: [0.22, 0.61, 0.36, 1] }}
                    style={{
                      position: "relative",
                      width: "100%",
                      height: 150,
                    }}
                  >
                    <SiteNode
                      model={model}
                      motion={selected === null}
                      presentation="choice"
                      onSelect={() => choose(choice.siteType)}
                    />
                  </motion.div>
                );
              })}
            </div>
          </GlassPanel>
        </motion.section>
      )}
    />
  );
}
