import { useState } from "react";
import { assertLocalized } from "@trox/runtime";
import {
  SiteLayout,
  type SiteLayoutComposition,
} from "../../components/layout/SiteLayout";
import { artRef } from "../../primitives/art";
import { useIsDesktop } from "../../primitives/use-is-desktop";
import type { CumulusComponent } from "../registry";
import {
  DemoControls,
  DemoSelect,
  DemoToggle,
} from "./promotion-demo-controls";
import { asSiteId } from "../../../types/identifiers";
import { asDreamscapeId } from "../../../types/identifiers";
import { asGuideId } from "../../../types/identifiers";

const compositions: readonly SiteLayoutComposition[] = [
  "balanced-gallery",
  "content-led-gallery",
  "balanced-revelation",
  "content-led-revelation",
  "balanced-expanded-revelation",
  "content-led-expanded-revelation",
];

function Demo() {
  const desktop = useIsDesktop();
  const [composition, setComposition] =
    useState<SiteLayoutComposition>("balanced-gallery");
  const [presence, setPresence] = useState<"speaking" | "portrait-only">(
    "speaking",
  );
  const [sceneVisible, setSceneVisible] = useState(false);
  const [moteTint, setMoteTint] = useState<"warm" | "violet">("violet");
  const [content, setContent] = useState<"gallery" | "dialogue" | "revelation">(
    "gallery",
  );
  const preview = desktop
    ? { width: 1920, height: 1080, scale: 0.3 }
    : { width: 390, height: 844, scale: 0.68 };

  return (
    <div style={{ display: "grid", gap: 12, justifyItems: "center" }}>
      <DemoControls>
        <DemoSelect
          label="Composition"
          value={composition}
          values={compositions}
          onChange={(value) => setComposition(value as SiteLayoutComposition)}
        />
        <DemoSelect
          label="Guide"
          value={presence}
          values={["speaking", "portrait-only"]}
          onChange={(value) =>
            setPresence(value as "speaking" | "portrait-only")
          }
        />
        <DemoSelect
          label="Content"
          value={content}
          values={["gallery", "dialogue", "revelation"]}
          onChange={(value) =>
            setContent(value as "gallery" | "dialogue" | "revelation")
          }
        />
        <DemoSelect
          label="Mote tint"
          value={moteTint}
          values={["warm", "violet"]}
          onChange={(value) => setMoteTint(value as "warm" | "violet")}
        />
        <DemoToggle
          label="Scene art"
          checked={sceneVisible}
          onChange={setSceneVisible}
        />
      </DemoControls>
      <div
        style={{
          position: "relative",
          width: preview.width * preview.scale,
          maxWidth: "100%",
          height: preview.height * preview.scale,
          overflow: "hidden",
          borderRadius: 18,
        }}
      >
        <div
          style={{
            position: "relative",
            width: preview.width,
            height: preview.height,
            transform: `scale(${preview.scale})`,
            transformOrigin: "top left",
          }}
        >
          <SiteLayout
            siteId={asSiteId("catalog-site")}
            scene={
              sceneVisible
                ? artRef.dreamscapeScene(asDreamscapeId("wilderveil"))
                : null
            }
            moteTint={moteTint}
            guide={{
              id: "catalog-guide",
              name: assertLocalized("Dream Guide"),
              line: assertLocalized(
                "A complete site stage owns this composition.",
              ),
              art: artRef.dreamGuide(asGuideId("aldric")),
              presence,
            }}
            composition={composition}
          >
            <div
              data-demo-site-content={content}
              style={{
                alignSelf: "center",
                pointerEvents: "auto",
                width: content === "gallery" ? 780 : 520,
                maxWidth: "90vw",
                padding: content === "revelation" ? 0 : 24,
                borderRadius: content === "revelation" ? 0 : 18,
                background:
                  content === "revelation"
                    ? "transparent"
                    : content === "dialogue"
                      ? "rgba(38, 18, 30, .88)"
                      : "rgba(20, 12, 38, .78)",
                color: "white",
                textAlign: "center",
              }}
            >
              {content === "gallery"
                ? "Gallery body · floating glass hugs its cards"
                : content === "dialogue"
                  ? "Dialogue body · screen sequencing stays outside the layout"
                  : "Glass-free Revelation body"}
            </div>
          </SiteLayout>
        </div>
      </div>
    </div>
  );
}
export const siteLayoutDemo: CumulusComponent = {
  id: "site-layout",
  title: "Site Layout",
  blurb:
    "The responsive full-stage composition for routed character-led sites, with scene, mote tint, guide, speech, safe areas, and one site-body region.",
  callout:
    "Choose one named composition and let the site body choose its own material.",
  details: [
    "The stage preserves router-owned journey chrome and exposes stable composition and guide-presence diagnostics.",
    "Site content chooses its own material and floating panels should hug their content rather than fill the allocated region.",
  ],
  relatedSystems: ["journey-screen-host-chrome"],
  group: "Atlas & Sites",
  docName: "SiteLayout",
  Component: Demo,
  usage: [
    {
      code: `<SiteLayout siteId="shop" scene={scene} moteTint="warm" guide={guide} composition="balanced-gallery"><ShopGallery /></SiteLayout>`,
    },
  ],
  demo: { defaultArgs: {} },
};
