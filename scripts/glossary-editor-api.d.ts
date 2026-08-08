export type GlossaryEditorApiNext = () => void;

export const GLOSSARY_SOURCE_PATH: string;
export const GLOSSARY_OUTPUT_PATH: string;
export const GLOSSARY_EDITOR_SOURCE_PATHS: readonly string[];

export function createGlossaryEditorApiMiddleware(options?: {
  rootDir?: string;
  loadEntries?: (rootDir: string) => unknown[];
  revision?: (rootDir: string, sourcePaths: readonly string[]) => string;
  publishEdit?: (request: unknown) => Promise<{
    changed: readonly string[];
    sourceRevision: string;
  }>;
  onChanged?: () => void;
}): (req: unknown, res: unknown, next: GlossaryEditorApiNext) => Promise<void>;
