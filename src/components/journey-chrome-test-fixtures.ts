import { vi } from "vitest";
import { useJourney } from "../state/journey-context";

export function stubViewport(isDesktop: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes("min-width") ? isDesktop : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

export function mockJourneyState(state: unknown): void {
  vi.mocked(useJourney).mockReturnValue({
    state,
    mutations: {},
    cardDatabase: new Map(),
    journeyContent: {},
  } as ReturnType<typeof useJourney>);
}

export const MENU_BUTTON = '[data-testid="dreamscape-menu-button"]';
