import type { ImageManifest } from "./types";

/** Fetch the candidate-image manifest from the dev-server middleware. */
export async function loadImageManifest(
  signal?: AbortSignal,
): Promise<ImageManifest> {
  const response = await fetch("/api/images/manifest", {
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    let message = `Failed to load image manifest (${response.status})`;
    try {
      const body = (await response.json()) as {
        error?: { message?: string };
      };
      if (typeof body.error?.message === "string") {
        message = body.error.message;
      }
    } catch {
      // Fall through to the status-based message.
    }
    throw new Error(message);
  }

  return (await response.json()) as ImageManifest;
}

/** Build the dev-server URL that streams a single candidate image. */
export function imageFileUrl(category: string, filename: string): string {
  return `/api/images/file/${encodeURIComponent(category)}/${encodeURIComponent(filename)}`;
}
