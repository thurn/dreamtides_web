/**
 * Synthetic primitive and DSL contracts, discovered without a module registry.
 * Contract modules use real engine code and synthetic fixtures, without vi.mock
 * or vi.doMock: this shared runner is not a module-mock isolation boundary.
 */
import.meta.glob("./contracts/*.contracts.ts", { eager: true });
