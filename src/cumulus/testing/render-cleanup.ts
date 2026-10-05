/**
 * Teardown registry for test renders. Kept free of React and Cumulus imports
 * so the shared setup file can drain it after every test without loading the
 * component tree into non-DOM test files.
 */
const cleanups = new Set<() => void>();

/** Registers a teardown to run after the current test; returns its remover. */
export function registerRenderCleanup(cleanup: () => void): () => void {
  cleanups.add(cleanup);
  return () => {
    cleanups.delete(cleanup);
  };
}

/** Runs and forgets every registered teardown. */
export function runRenderCleanups(): void {
  for (const cleanup of [...cleanups]) cleanup();
  cleanups.clear();
}
