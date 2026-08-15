import {
  parseImageCategory,
  parseImageFileName,
  parseImageNumber,
  type ImageCategory,
  type ImageFileName,
  type ImageManifest,
  type ImageNumber,
} from "./types";
import { parseCardName, parseCardSubtype } from "../types/card-identity";

function recordFromUnknown(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Image manifest entry must be an object.");
  }
  return value as Record<string, unknown>;
}

function stringFromUnknown(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new Error(`Image manifest ${field} must be a string.`);
  }
  return value;
}

function booleanFromUnknown(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`Image manifest ${field} must be a boolean.`);
  }
  return value;
}

function stringArrayFromUnknown(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Image manifest ${field} must be an array.`);
  }
  return value.map((entry) => stringFromUnknown(entry, field));
}

function parseImageManifest(value: unknown): ImageManifest {
  const manifest = recordFromUnknown(value);
  if (!Array.isArray(manifest.images)) {
    throw new Error("Image manifest images must be an array.");
  }
  return {
    categories: stringArrayFromUnknown(manifest.categories, "categories").map(
      parseImageCategory,
    ),
    genericSubdirs: stringArrayFromUnknown(
      manifest.genericSubdirs,
      "genericSubdirs",
    ).map(parseImageCategory),
    images: manifest.images.map((rawEntry) => {
      const entry = recordFromUnknown(rawEntry);
      const cardName =
        entry.cardName === null
          ? null
          : parseCardName(entry.cardName);
      const subtype =
        entry.subtype === null
          ? null
          : parseCardSubtype(entry.subtype);
      return {
        category: parseImageCategory(entry.category),
        filename: parseImageFileName(entry.filename),
        imageNumber: parseImageNumber(entry.imageNumber),
        used: booleanFromUnknown(entry.used, "used"),
        favorite: booleanFromUnknown(entry.favorite, "favorite"),
        manuallyUsed: booleanFromUnknown(entry.manuallyUsed, "manuallyUsed"),
        cardName,
        narrative:
          entry.narrative === null
            ? null
            : stringFromUnknown(entry.narrative, "narrative"),
        subtype,
        cardNames: stringArrayFromUnknown(entry.cardNames, "cardNames").map(
          parseCardName,
        ),
      };
    }),
  };
}

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

  return parseImageManifest(await response.json());
}

/** Build the dev-server URL that streams a single candidate image. */
export function imageFileUrl(
  category: ImageCategory,
  filename: ImageFileName,
): string {
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
  imageNumber: ImageNumber,
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

/** Mark or unmark an image number as a favorite in tracked editor state. */
export async function setFavorite(
  imageNumber: ImageNumber,
  favorite: boolean,
): Promise<void> {
  const response = await fetch("/api/images/favorite", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ imageNumber, favorite }),
  });
  if (!response.ok) {
    throw new Error(
      await mutationErrorMessage(response, "Failed to update the favorite."),
    );
  }
}

/**
 * Move an image to a different category subdirectory, returning its new
 * `{ category, filename }` (the filename is preserved).
 */
export async function moveImageCategory(
  category: ImageCategory,
  filename: ImageFileName,
  targetCategory: ImageCategory,
): Promise<{ category: ImageCategory; filename: ImageFileName }> {
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
  const result = recordFromUnknown(await response.json());
  return {
    category: parseImageCategory(result.category),
    filename: parseImageFileName(result.filename),
  };
}
