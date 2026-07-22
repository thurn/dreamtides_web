export type GlossaryEditorApiNext = () => void;

export interface GlossaryEditorApiFileSystem {
  mkdirSync(path: string, options?: { recursive?: boolean }): unknown;
  readFileSync(path: string, encoding: "utf8"): string;
  renameSync(oldPath: string, newPath: string): void;
  unlinkSync(path: string): void;
  writeFileSync(path: string, data: string): void;
}

export function createGlossaryEditorApiMiddleware(options?: {
  rootDir?: string;
  fileSystem?: GlossaryEditorApiFileSystem;
}): (req: unknown, res: unknown, next: GlossaryEditorApiNext) => Promise<void>;
