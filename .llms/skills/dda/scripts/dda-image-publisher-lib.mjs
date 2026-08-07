import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_BUCKET = "redacted-firebase-project.firebasestorage.app";
export const PUBLIC_ORIGIN = "https://storage.googleapis.com";
export const ESSAY_SEGMENT_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
export const ALT_TEXT_MIN_LENGTH = 10;
export const ALT_TEXT_MAX_LENGTH = 59;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const GENERIC_ALT_TEXT = /^(?:image|screenshot|picture|photo)[.!]?$/i;
const MAX_IMAGE_BYTES = 25 * 1024 * 1024;

function validateSingleLine(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required`);
  }
  if (/\r|\n/.test(value)) {
    throw new Error(`${label} must fit on one logical line`);
  }
  return value.trim();
}

function validateEssay(value) {
  const normalized = validateSingleLine(value, "essay");
  if (!ESSAY_SEGMENT_PATTERN.test(normalized)) {
    throw new Error("essay must use lowercase words separated by underscores");
  }
  return normalized;
}

function validateSlug(value) {
  const normalized = validateSingleLine(value, "slug");
  if (!SLUG.test(normalized) || normalized.length > 40) {
    throw new Error(
      "slug must be at most 40 lowercase characters separated by hyphens",
    );
  }
  return normalized;
}

function detectImage(bytes) {
  if (
    bytes.length >= 8 &&
    bytes
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return { contentType: "image/png", extension: "png" };
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return { contentType: "image/jpeg", extension: "jpg" };
  }
  if (
    bytes.length >= 12 &&
    bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
    bytes.subarray(8, 12).toString("ascii") === "WEBP"
  ) {
    return { contentType: "image/webp", extension: "webp" };
  }
  throw new Error("image must contain PNG, JPEG, or WebP data");
}

function validateAltText(value) {
  const altText = validateSingleLine(value, "alt text");
  if (!isUsefulAltText(altText)) {
    throw new Error(
      `alt text must describe visible evidence in ${ALT_TEXT_MIN_LENGTH}-${ALT_TEXT_MAX_LENGTH} characters without brackets`,
    );
  }
  return altText;
}

export function isUsefulAltText(value) {
  return (
    typeof value === "string" &&
    value.length >= ALT_TEXT_MIN_LENGTH &&
    value.length <= ALT_TEXT_MAX_LENGTH &&
    !/[\[\]]/.test(value) &&
    !GENERIC_ALT_TEXT.test(value)
  );
}

function validateCaption(value) {
  const caption = validateSingleLine(value, "caption");
  if (caption.length > 78 || /[*_]/.test(caption)) {
    throw new Error(
      "caption must be at most 78 characters without Markdown emphasis",
    );
  }
  return caption;
}

function validateBucket(value) {
  const bucket = validateSingleLine(value, "bucket");
  if (!/^[a-z0-9][a-z0-9._-]+[a-z0-9]$/.test(bucket)) {
    throw new Error("bucket is not a valid Google Cloud Storage bucket name");
  }
  return bucket;
}

export async function buildImagePublication({
  alt,
  bucket = DEFAULT_BUCKET,
  caption,
  essay,
  file,
  slug,
}) {
  const absoluteFile = path.resolve(validateSingleLine(file, "file"));
  const fileStat = await stat(absoluteFile);
  if (!fileStat.isFile()) {
    throw new Error(`image is not a regular file: ${absoluteFile}`);
  }
  if (fileStat.size === 0 || fileStat.size > MAX_IMAGE_BYTES) {
    throw new Error("image must be between 1 byte and 25 MiB");
  }

  const bytes = await readFile(absoluteFile);
  const image = detectImage(bytes);
  const sourceExtension = path.extname(absoluteFile).slice(1).toLowerCase();
  const acceptedExtensions =
    image.extension === "jpg"
      ? new Set(["jpg", "jpeg"])
      : new Set([image.extension]);
  if (!acceptedExtensions.has(sourceExtension)) {
    throw new Error(
      `file extension .${sourceExtension || "(none)"} does not match ${image.contentType}`,
    );
  }

  const normalizedEssay = validateEssay(essay);
  const normalizedSlug = validateSlug(slug);
  const normalizedBucket = validateBucket(bucket);
  const altText = validateAltText(alt);
  const normalizedCaption = validateCaption(caption);
  const digest = createHash("sha256").update(bytes).digest("hex").slice(0, 12);
  const objectName = [
    "dda",
    normalizedEssay,
    `${normalizedSlug}-${digest}.${image.extension}`,
  ].join("/");
  const url = `${PUBLIC_ORIGIN}/${normalizedBucket}/${objectName}`;
  const reference = `img-${digest}`;
  const markdown = [
    `![${altText}][${reference}]`,
    "",
    `_${normalizedCaption}_`,
    "",
    `[${reference}]: ${url}`,
  ].join("\n");

  return {
    absoluteFile,
    bucket: normalizedBucket,
    byteLength: bytes.length,
    contentType: image.contentType,
    digest,
    gcsUri: `gs://${normalizedBucket}/${objectName}`,
    markdown,
    objectName,
    url,
  };
}
