/**
 * Public surface of the journeys module.
 *
 * Only two exports:
 * - JourneyScreen: React component for the dream journey UI
 * - journeySeedForSite: Function to generate seeds for journey generation
 */

export { JourneyScreen } from "./ui/JourneyScreen";
export { journeySeedForSite } from "./adapter/seed";
