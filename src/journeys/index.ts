/**
 * Public surface of the journeys module.
 *
 * Exports:
 * - JourneyScreen: React component for the dream journey UI
 * - journeySeedForSite: Function to generate seeds for journey generation
 * - buildJourneyContext / buildJourneyContentBundle: Adapter entry points the
 *   quest prototype's screen router uses to translate live quest state and
 *   content into the `JourneyContext` shape `JourneyScreen` consumes.
 */

export { JourneyScreen } from "./ui/JourneyScreen";
export { journeySeedForSite } from "./adapter/seed";
export { buildJourneyContext } from "./adapter/buildContext";
export { buildJourneyContentBundle } from "./adapter/content-bridge";
