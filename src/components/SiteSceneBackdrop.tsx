import { useEffect, useState } from "react";
import { useQuest } from "../state/quest-context";
import { dreamscapeSceneUrl } from "../tango/components/atlas-display";
import "./site-scene-backdrop.css";

/**
 * Full-bleed dreamscape scene art behind a site visit, dimmed by a heavy dark
 * overlay so the site's offer content reads clearly while the dreamscape stays
 * present behind it. Shared by every dreamscape site screen so the immersive
 * scene-with-dim treatment is consistent across all sites; the visited site's
 * dreamscape is resolved from `state.currentDreamscape`, which persists for the
 * duration of the visit.
 */
export function SiteSceneBackdrop() {
  const { state } = useQuest();
  const { atlas, currentDreamscape } = state;
  const node =
    currentDreamscape !== null ? atlas.nodes[currentDreamscape] : undefined;
  const dreamscapeId = node?.dreamscapeId ?? null;

  // Cross-fade the scene art in whenever the dreamscape changes, matching the
  // dreamscape overview screen.
  const [shown, setShown] = useState(false);
  useEffect(() => {
    setShown(false);
    const id = setTimeout(() => setShown(true), 30);
    return () => clearTimeout(id);
  }, [dreamscapeId]);

  return (
    <div className="site-scene-backdrop" aria-hidden="true" data-site-scene-backdrop="">
      {dreamscapeId !== null && (
        <img
          key={dreamscapeId}
          className={shown ? "shown" : ""}
          src={dreamscapeSceneUrl(dreamscapeId)}
          alt=""
        />
      )}
      <div className="site-scene-dim" />
    </div>
  );
}
