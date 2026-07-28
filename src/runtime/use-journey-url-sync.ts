import { useEffect } from "react";
import { useJourney } from "../state/journey-context";
import { logEvent } from "../logging";
import { screenToJourneyPath } from "./screen-url";

/**
 * Reflects the current journey screen into the address-bar path (e.g.
 * `/dreamscape/ember-wood/purge`) so the URL always shows where the player is.
 *
 * Uses `history.replaceState` — not `pushState` — so screen changes do not pile
 * up back-button history entries: the path is a passive reflection of
 * authoritative, Firebase-synced journey state, not a navigable route. The query
 * string (`?game=<roomId>`, `?realtime=1`, `?goto=`, …) and any hash are
 * preserved untouched, keeping the room id as the real resume key. See
 * `screenToJourneyPath` for the path grammar and the reflection rationale.
 *
 * A `journey_url_synced` log event is emitted on each path change, recording the
 * screen the player moved to and the path a bug report would show — one entry
 * per navigation, so a production run's screen-by-screen path history is
 * reconstructable from `logs/journey-log.jsonl`.
 */
export function useJourneyUrlSync(): void {
  const { state } = useJourney();
  const path = screenToJourneyPath(state);
  const screenType = state.screen.type;
  const siteId = state.screen.type === "site" ? state.screen.siteId : null;

  useEffect(() => {
    if (window.location.pathname === path) return;

    const nextUrl = `${path}${window.location.search}${window.location.hash}`;
    window.history.replaceState(window.history.state, "", nextUrl);
    logEvent("journey_url_synced", {
      path,
      screenType,
      siteId,
    });
  }, [path, screenType, siteId]);
}
