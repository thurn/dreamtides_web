// Typed crop values for strict Cumulus media APIs.

/**
 * How a media image is cropped within its frame, as a named `object-position`.
 * `top` biases toward the upper part of the art (faces / headers); `center`
 * centers it.
 */
export type ImageCrop = "top" | "center";

const IMAGE_CROP_POSITIONS: Record<ImageCrop, string> = {
  top: "50% 6%",
  center: "50% 50%",
};

/** Resolve an {@link ImageCrop} to its CSS `object-position` string. */
export function resolveImageCrop(crop: ImageCrop): string {
  return IMAGE_CROP_POSITIONS[crop];
}
