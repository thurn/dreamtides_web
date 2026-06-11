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

/** Read the error message from a failed image-viewer mutation response. */
async function mutationErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    if (typeof body.error?.message === "string") {
      return body.error.message;
    }
  } catch {
    // Fall through to the supplied fallback.
  }
  return fallback;
}

/** Mark or unmark an image number as manually used, persisting the change. */
export async function setManualUsed(
  imageNumber: string,
  used: boolean,
): Promise<void> {
  const response = await fetch("/api/images/manual-used", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ imageNumber, used }),
  });
  if (!response.ok) {
    throw new Error(
      await mutationErrorMessage(response, "Failed to update the used mark."),
    );
  }
}

/**
 * Move an image to a different category subdirectory, returning its new
 * `{ category, filename }` (the filename is preserved).
 */
export async function moveImageCategory(
  category: string,
  filename: string,
  targetCategory: string,
): Promise<{ category: string; filename: string }> {
  const response = await fetch("/api/images/category", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ category, filename, targetCategory }),
  });
  if (!response.ok) {
    throw new Error(
      await mutationErrorMessage(response, "Failed to change the category."),
    );
  }
  return (await response.json()) as { category: string; filename: string };
}
