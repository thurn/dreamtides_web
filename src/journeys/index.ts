/**
 * Public surface of the journeys module.
 *
 * Exports:
 * - JourneyScreen: React component for the dream journey UI
 * - JourneyMutations: type of the effect-application API the screen consumes
 * - createJourneyMutations: adapter from `QuestMutations` to `JourneyMutations`
 * - journeySeedForSite: Function to generate seeds for journey generation
 * - buildJourneyContext / buildJourneyContentBundle: Adapter entry points the
 *   quest prototype's screen router uses to translate live quest state and
 *   content into the `JourneyContext` shape `JourneyScreen` consumes.
 *
 * `applyOption` / `applyBranch` are intentionally not re-exported — they are
 * called only inside `JourneyScreen`, which already owns the meta argument
 * and the chooser plumbing.
 */

export { JourneyScreen } from "./ui/JourneyScreen";
export type { JourneyMutations } from "./apply/JourneyMutations";
export { createJourneyMutations } from "./adapter/journeyMutations";
export { journeySeedForSite } from "./adapter/seed";
export { buildJourneyContext } from "./adapter/buildContext";
export { buildJourneyContentBundle } from "./adapter/content-bridge";
export type { JourneyDebugForcing } from "./journey/debugHarness";
