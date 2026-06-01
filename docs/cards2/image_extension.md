# Technical Design: Web-Based Programmatic Image Extension for Card Art

## Overview

This document describes a deterministic web-based strategy for extending card art vertically, primarily at the bottom edge, when the source artwork does not match the required card aspect ratio.

The goal is to add approximately 50–100px of visually plausible continuation without using a flat color fill or generative AI. The extension should feel like the original artwork continues naturally into the added area, while remaining stable, fast, and suitable for batch processing.

The proposed approach uses a layered composition:

1. A mirrored crop from the bottom of the image
2. A vertically stretched edge strip
3. Gaussian blur on the generated extension layers
4. A seam feather between the original art and extension
5. A subtle darkening gradient
6. Optional low-opacity noise to reduce banding and synthetic smoothness

This is intended for use in a web application using HTML Canvas, OffscreenCanvas, or a worker-backed image processing pipeline.

---

# Goals

## Primary Goals

* Extend artwork downward by a configurable number of pixels.
* Preserve the original artwork unchanged above the extension region.
* Avoid obvious hard seams at the original bottom edge.
* Avoid the appearance of a flat color bar.
* Produce aesthetically pleasing results across a large batch of fantasy card art.
* Run entirely in the browser.
* Be deterministic and repeatable.
* Avoid dependency on AI-based outpainting.

## Secondary Goals

* Support previewing parameter changes interactively.
* Support batch export.
* Support high-resolution card art without blocking the main UI thread.
* Allow future extension to top, left, or right edges if needed.

---

# Non-Goals

* This system does not attempt semantic reconstruction of missing artwork.
* This system does not generate new objects, characters, landscapes, or foreground details.
* This system does not replace artist-authored crops for final key art.
* This system does not guarantee perfect results for images with important foreground subjects cut off at the bottom.

---

# Use Case

Card artwork may be slightly too short for the desired card frame or crop area. For example:

* Required art box: 768 × 1024
* Source art after fitting width: 768 × 940
* Missing bottom area: 84px

Instead of scaling or cropping the image destructively, the renderer creates an additional bottom extension region that visually borrows from the existing bottom of the artwork.

---

# Proposed Composition

The final output is created on a canvas with the target dimensions.

For a bottom extension, the composition order is:

1. Draw the original image aligned to the top.
2. Draw a blurred, vertically flipped crop from the bottom of the source into the extension region.
3. Draw a blurred stretched strip from the bottom edge over that.
4. Apply a feathered transition at the seam.
5. Apply a subtle vertical darkening gradient over the extension.
6. Apply subtle noise over the extension.

Conceptually:

```text
┌──────────────────────────────┐
│                              │
│        Original Image         │
│                              │
├──────────────────────────────┤ ← seam feather
│ Mirrored + blurred extension  │
│ Stretched edge + blur overlay │
│ Dark gradient + subtle noise  │
└──────────────────────────────┘
```

---

# Rendering Pipeline

## Inputs

```ts
interface ImageExtensionOptions {
  targetWidth: number;
  targetHeight: number;

  extensionSide: "bottom";

  mirrorSampleHeight?: number;
  edgeSampleHeight?: number;
  seamFeatherHeight?: number;

  mirrorBlurPx?: number;
  edgeBlurPx?: number;

  mirrorOpacity?: number;
  edgeOpacity?: number;

  darkenOpacity?: number;
  darkenStartOpacity?: number;
  darkenEndOpacity?: number;

  noiseOpacity?: number;
  noiseScale?: number;

  backgroundFallbackColor?: string;
}
```

Recommended defaults:

```ts
const defaultOptions: Required<ImageExtensionOptions> = {
  targetWidth: 768,
  targetHeight: 1024,

  extensionSide: "bottom",

  mirrorSampleHeight: 160,
  edgeSampleHeight: 12,
  seamFeatherHeight: 24,

  mirrorBlurPx: 12,
  edgeBlurPx: 20,

  mirrorOpacity: 1.0,
  edgeOpacity: 0.55,

  darkenOpacity: 0.18,
  darkenStartOpacity: 0.0,
  darkenEndOpacity: 1.0,

  noiseOpacity: 0.035,
  noiseScale: 1,

  backgroundFallbackColor: "#000000",
};
```

---

# Step 1: Determine Source Placement

The source image should be fitted to the target width while preserving aspect ratio.

```ts
const scale = targetWidth / sourceWidth;
const renderedWidth = targetWidth;
const renderedHeight = sourceHeight * scale;
```

The source image is drawn aligned to the top:

```ts
const sourceX = 0;
const sourceY = 0;
```

The required extension height is:

```ts
const extensionHeight = targetHeight - renderedHeight;
```

If `extensionHeight <= 0`, no extension is required. The image can be cropped or scaled according to the existing card art pipeline.

If `extensionHeight > 0`, the extension begins at:

```ts
const extensionY = renderedHeight;
```

Because canvas dimensions are integer pixels, round carefully:

```ts
const drawHeight = Math.round(renderedHeight);
const extensionY = drawHeight;
const extensionHeight = targetHeight - drawHeight;
```

---

# Step 2: Create Main Canvas

Create a canvas at final output size:

```ts
const canvas = new OffscreenCanvas(targetWidth, targetHeight);
const ctx = canvas.getContext("2d");
```

For main-thread rendering, use:

```ts
const canvas = document.createElement("canvas");
canvas.width = targetWidth;
canvas.height = targetHeight;
const ctx = canvas.getContext("2d");
```

Initialize the canvas with a fallback background color:

```ts
ctx.fillStyle = backgroundFallbackColor;
ctx.fillRect(0, 0, targetWidth, targetHeight);
```

Then draw the original image:

```ts
ctx.drawImage(
  image,
  0,
  0,
  sourceWidth,
  sourceHeight,
  0,
  0,
  targetWidth,
  drawHeight
);
```

---

# Step 3: Generate Mirrored Extension Layer

The mirrored layer provides visual structure. It is created by cropping a band from the bottom of the already-scaled image, flipping it vertically, stretching or cropping it into the extension area, and blurring it.

## Source Region

Use the bottom `mirrorSampleHeight` pixels from the rendered image:

```ts
const mirrorSampleHeight = Math.min(options.mirrorSampleHeight, drawHeight);
const sourceMirrorY = drawHeight - mirrorSampleHeight;
```

Since the source image is not actually scaled into a separate bitmap yet, there are two implementation options.

## Option A: Sample from the original image

Convert rendered-space coordinates back to source-space coordinates:

```ts
const sourceMirrorYInOriginal = sourceMirrorY / scale;
const sourceMirrorHeightInOriginal = mirrorSampleHeight / scale;
```

Then draw that crop into the extension layer.

## Option B: Draw the scaled image into an intermediate canvas

This is simpler and often less error-prone:

```ts
const scaledCanvas = new OffscreenCanvas(targetWidth, drawHeight);
const scaledCtx = scaledCanvas.getContext("2d");

scaledCtx.drawImage(
  image,
  0,
  0,
  sourceWidth,
  sourceHeight,
  0,
  0,
  targetWidth,
  drawHeight
);
```

Then all subsequent sampling happens from `scaledCanvas`.

This approach is recommended because it makes the rest of the pipeline operate in final output pixel space.

## Mirroring

Create an extension layer:

```ts
const mirrorCanvas = new OffscreenCanvas(targetWidth, extensionHeight);
const mirrorCtx = mirrorCanvas.getContext("2d");
```

Flip vertically:

```ts
mirrorCtx.save();
mirrorCtx.translate(0, extensionHeight);
mirrorCtx.scale(1, -1);

mirrorCtx.drawImage(
  scaledCanvas,
  0,
  drawHeight - mirrorSampleHeight,
  targetWidth,
  mirrorSampleHeight,
  0,
  0,
  targetWidth,
  extensionHeight
);

mirrorCtx.restore();
```

This takes the bottom sample and maps it into the extension area, reversed vertically.

## Blur

Apply blur when drawing the mirror layer into the final canvas:

```ts
ctx.save();
ctx.globalAlpha = mirrorOpacity;
ctx.filter = `blur(${mirrorBlurPx}px)`;

ctx.drawImage(
  mirrorCanvas,
  0,
  0,
  targetWidth,
  extensionHeight,
  0,
  extensionY,
  targetWidth,
  extensionHeight
);

ctx.restore();
```

Because blur samples outside the drawn bounds can create transparent edges, it is often better to create the mirror layer slightly larger than needed, or overdraw by the blur radius.

Recommended overdraw:

```ts
const overdraw = Math.ceil(mirrorBlurPx * 2);
```

---

# Step 4: Generate Stretched Edge Layer

The stretched edge layer makes the first pixels of the extension match the exact bottom colors of the original image.

This reduces the chance that the mirrored layer creates a visible seam.

Create a canvas for the edge layer:

```ts
const edgeCanvas = new OffscreenCanvas(targetWidth, extensionHeight);
const edgeCtx = edgeCanvas.getContext("2d");
```

Sample a very thin strip from the bottom of the scaled image:

```ts
const edgeSampleHeight = Math.min(options.edgeSampleHeight, drawHeight);
```

Draw that strip stretched vertically:

```ts
edgeCtx.drawImage(
  scaledCanvas,
  0,
  drawHeight - edgeSampleHeight,
  targetWidth,
  edgeSampleHeight,
  0,
  0,
  targetWidth,
  extensionHeight
);
```

Then draw it onto the final canvas with blur and partial opacity:

```ts
ctx.save();
ctx.globalAlpha = edgeOpacity;
ctx.filter = `blur(${edgeBlurPx}px)`;

ctx.drawImage(
  edgeCanvas,
  0,
  0,
  targetWidth,
  extensionHeight,
  0,
  extensionY,
  targetWidth,
  extensionHeight
);

ctx.restore();
```

The edge layer should usually be blurrier than the mirror layer.

Recommended values:

```ts
edgeSampleHeight = 8–16px
edgeBlurPx = 16–28px
edgeOpacity = 0.4–0.7
```

---

# Step 5: Apply Seam Feather

The seam feather blends the bottom of the original artwork into the generated extension.

The extension itself should begin under the original image, but a feather overlay should cover a small region above and below the seam.

A simple method is to redraw a small strip from the bottom of the original image over the seam with a vertical alpha gradient.

## Feather Region

```ts
const featherHeight = Math.min(options.seamFeatherHeight, drawHeight, extensionHeight);
const featherY = extensionY - featherHeight;
```

Create a feather layer:

```ts
const featherCanvas = new OffscreenCanvas(targetWidth, featherHeight * 2);
const featherCtx = featherCanvas.getContext("2d");
```

Draw the bottom part of the original image stretched slightly into the extension:

```ts
featherCtx.drawImage(
  scaledCanvas,
  0,
  drawHeight - featherHeight,
  targetWidth,
  featherHeight,
  0,
  0,
  targetWidth,
  featherHeight * 2
);
```

Apply an alpha mask that fades from visible at the top to transparent at the bottom.

Canvas does not have a direct alpha-mask API, but `globalCompositeOperation = "destination-in"` works well:

```ts
const gradient = featherCtx.createLinearGradient(0, 0, 0, featherHeight * 2);
gradient.addColorStop(0.0, "rgba(0,0,0,1)");
gradient.addColorStop(0.5, "rgba(0,0,0,0.7)");
gradient.addColorStop(1.0, "rgba(0,0,0,0)");

featherCtx.globalCompositeOperation = "destination-in";
featherCtx.fillStyle = gradient;
featherCtx.fillRect(0, 0, targetWidth, featherHeight * 2);
```

Then draw the feather layer:

```ts
ctx.drawImage(
  featherCanvas,
  0,
  0,
  targetWidth,
  featherHeight * 2,
  0,
  featherY,
  targetWidth,
  featherHeight * 2
);
```

This helps hide the seam where the original image meets the generated bottom.

---

# Step 6: Apply Darkening Gradient

A subtle darkening gradient can make the generated area feel intentional and can improve text or UI readability near the bottom of the card.

Create a gradient from transparent at the top of the extension to slightly darker at the bottom:

```ts
ctx.save();

const gradient = ctx.createLinearGradient(
  0,
  extensionY,
  0,
  targetHeight
);

gradient.addColorStop(
  0,
  `rgba(0, 0, 0, ${darkenOpacity * darkenStartOpacity})`
);

gradient.addColorStop(
  1,
  `rgba(0, 0, 0, ${darkenOpacity * darkenEndOpacity})`
);

ctx.fillStyle = gradient;
ctx.fillRect(0, extensionY, targetWidth, extensionHeight);

ctx.restore();
```

Recommended value:

```ts
darkenOpacity = 0.10–0.25
```

For card art, darkening is usually preferable to brightening because card frames, rules text, and icons often sit near the lower part of the image.

---

# Step 7: Add Subtle Noise

Blurred gradients can look synthetic or show visible banding. A small amount of noise can make the extension feel more painterly.

Generate random grayscale noise:

```ts
const noiseCanvas = new OffscreenCanvas(targetWidth, extensionHeight);
const noiseCtx = noiseCanvas.getContext("2d");
const imageData = noiseCtx.createImageData(targetWidth, extensionHeight);

for (let i = 0; i < imageData.data.length; i += 4) {
  const value = Math.floor(Math.random() * 255);

  imageData.data[i + 0] = value;
  imageData.data[i + 1] = value;
  imageData.data[i + 2] = value;
  imageData.data[i + 3] = Math.floor(255 * noiseOpacity);
}

noiseCtx.putImageData(imageData, 0, 0);
```

Then draw it over the extension:

```ts
ctx.save();
ctx.globalCompositeOperation = "overlay";
ctx.drawImage(noiseCanvas, 0, extensionY);
ctx.restore();
```

However, browser support and visual results for blend modes can vary. A safer option is normal alpha blending:

```ts
ctx.save();
ctx.globalAlpha = noiseOpacity;
ctx.drawImage(noiseCanvas, 0, extensionY);
ctx.restore();
```

For deterministic output, use a seeded pseudo-random number generator instead of `Math.random()`.

---

# Implementation API

Recommended public function:

```ts
export interface ExtendImageBottomOptions {
  targetWidth: number;
  targetHeight: number;

  mirrorSampleHeight?: number;
  edgeSampleHeight?: number;
  seamFeatherHeight?: number;

  mirrorBlurPx?: number;
  edgeBlurPx?: number;

  mirrorOpacity?: number;
  edgeOpacity?: number;

  darkenOpacity?: number;
  noiseOpacity?: number;

  seed?: number;
}

export async function extendImageBottom(
  source: HTMLImageElement | ImageBitmap | HTMLCanvasElement | OffscreenCanvas,
  options: ExtendImageBottomOptions
): Promise<Blob> {
  // Implementation returns PNG or WebP Blob.
}
```

Alternative return types:

```ts
Promise<ImageBitmap>
Promise<HTMLCanvasElement>
Promise<OffscreenCanvas>
Promise<string> // data URL
```

For batch processing, returning `Blob` is usually best.

---

# Recommended Architecture

## Main Thread

Responsible for:

* UI controls
* Preview display
* File selection
* Drag-and-drop
* Export buttons
* Creating jobs for image processing

## Web Worker

Responsible for:

* Decoding images where possible
* Running canvas composition
* Returning Blob or ImageBitmap results

## Why Use a Worker?

Canvas filters and high-resolution image processing can block the main UI thread, especially when processing many card images.

Recommended flow:

```text
Main Thread
  → receives image file
  → sends file or ImageBitmap to Worker
Worker
  → creates OffscreenCanvas
  → runs extension pipeline
  → returns Blob
Main Thread
  → displays preview or saves output
```

---

# Worker-Based Processing

## Main Thread Example

```ts
const worker = new Worker(new URL("./image-extension-worker.ts", import.meta.url), {
  type: "module",
});

const bitmap = await createImageBitmap(file);

worker.postMessage(
  {
    type: "extend-bottom",
    bitmap,
    options: {
      targetWidth: 768,
      targetHeight: 1024,
      mirrorSampleHeight: 160,
      edgeSampleHeight: 12,
      seamFeatherHeight: 24,
      mirrorBlurPx: 12,
      edgeBlurPx: 20,
      mirrorOpacity: 1.0,
      edgeOpacity: 0.55,
      darkenOpacity: 0.18,
      noiseOpacity: 0.035,
      seed: 12345,
    },
  },
  [bitmap]
);
```

## Worker Example

```ts
self.onmessage = async (event) => {
  const { type, bitmap, options } = event.data;

  if (type !== "extend-bottom") return;

  const resultCanvas = extendImageBottomToCanvas(bitmap, options);
  const blob = await resultCanvas.convertToBlob({
    type: "image/png",
  });

  self.postMessage(
    {
      type: "extend-bottom-result",
      blob,
    }
  );
};
```

---

# Core Rendering Function

```ts
export function extendImageBottomToCanvas(
  image: ImageBitmap,
  options: ExtendImageBottomOptions
): OffscreenCanvas {
  const opts = {
    mirrorSampleHeight: 160,
    edgeSampleHeight: 12,
    seamFeatherHeight: 24,
    mirrorBlurPx: 12,
    edgeBlurPx: 20,
    mirrorOpacity: 1.0,
    edgeOpacity: 0.55,
    darkenOpacity: 0.18,
    noiseOpacity: 0.035,
    seed: 1,
    ...options,
  };

  const targetWidth = opts.targetWidth;
  const targetHeight = opts.targetHeight;

  const sourceWidth = image.width;
  const sourceHeight = image.height;

  const scale = targetWidth / sourceWidth;
  const drawHeight = Math.round(sourceHeight * scale);

  const extensionHeight = targetHeight - drawHeight;

  const canvas = new OffscreenCanvas(targetWidth, targetHeight);
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Could not create 2D canvas context.");
  }

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, targetWidth, targetHeight);

  const scaledCanvas = new OffscreenCanvas(targetWidth, drawHeight);
  const scaledCtx = scaledCanvas.getContext("2d");

  if (!scaledCtx) {
    throw new Error("Could not create scaled canvas context.");
  }

  scaledCtx.drawImage(
    image,
    0,
    0,
    sourceWidth,
    sourceHeight,
    0,
    0,
    targetWidth,
    drawHeight
  );

  if (extensionHeight <= 0) {
    ctx.drawImage(
      scaledCanvas,
      0,
      0,
      targetWidth,
      targetHeight,
      0,
      0,
      targetWidth,
      targetHeight
    );

    return canvas;
  }

  const extensionY = drawHeight;

  ctx.drawImage(scaledCanvas, 0, 0);

  drawMirrorLayer(ctx, scaledCanvas, {
    targetWidth,
    drawHeight,
    extensionY,
    extensionHeight,
    sampleHeight: opts.mirrorSampleHeight,
    blurPx: opts.mirrorBlurPx,
    opacity: opts.mirrorOpacity,
  });

  drawEdgeStretchLayer(ctx, scaledCanvas, {
    targetWidth,
    drawHeight,
    extensionY,
    extensionHeight,
    sampleHeight: opts.edgeSampleHeight,
    blurPx: opts.edgeBlurPx,
    opacity: opts.edgeOpacity,
  });

  drawSeamFeather(ctx, scaledCanvas, {
    targetWidth,
    drawHeight,
    extensionY,
    extensionHeight,
    featherHeight: opts.seamFeatherHeight,
  });

  drawDarkenGradient(ctx, {
    targetWidth,
    targetHeight,
    extensionY,
    extensionHeight,
    opacity: opts.darkenOpacity,
  });

  drawNoise(ctx, {
    targetWidth,
    extensionY,
    extensionHeight,
    opacity: opts.noiseOpacity,
    seed: opts.seed,
  });

  return canvas;
}
```

---

# Helper: Mirror Layer

```ts
function drawMirrorLayer(
  ctx: OffscreenCanvasRenderingContext2D,
  scaledCanvas: OffscreenCanvas,
  params: {
    targetWidth: number;
    drawHeight: number;
    extensionY: number;
    extensionHeight: number;
    sampleHeight: number;
    blurPx: number;
    opacity: number;
  }
): void {
  const {
    targetWidth,
    drawHeight,
    extensionY,
    extensionHeight,
    sampleHeight,
    blurPx,
    opacity,
  } = params;

  const actualSampleHeight = Math.min(sampleHeight, drawHeight);

  const layer = new OffscreenCanvas(targetWidth, extensionHeight);
  const layerCtx = layer.getContext("2d");

  if (!layerCtx) {
    throw new Error("Could not create mirror layer context.");
  }

  layerCtx.save();
  layerCtx.translate(0, extensionHeight);
  layerCtx.scale(1, -1);

  layerCtx.drawImage(
    scaledCanvas,
    0,
    drawHeight - actualSampleHeight,
    targetWidth,
    actualSampleHeight,
    0,
    0,
    targetWidth,
    extensionHeight
  );

  layerCtx.restore();

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.filter = `blur(${blurPx}px)`;
  ctx.drawImage(layer, 0, extensionY);
  ctx.restore();
}
```

---

# Helper: Edge Stretch Layer

```ts
function drawEdgeStretchLayer(
  ctx: OffscreenCanvasRenderingContext2D,
  scaledCanvas: OffscreenCanvas,
  params: {
    targetWidth: number;
    drawHeight: number;
    extensionY: number;
    extensionHeight: number;
    sampleHeight: number;
    blurPx: number;
    opacity: number;
  }
): void {
  const {
    targetWidth,
    drawHeight,
    extensionY,
    extensionHeight,
    sampleHeight,
    blurPx,
    opacity,
  } = params;

  const actualSampleHeight = Math.min(sampleHeight, drawHeight);

  const layer = new OffscreenCanvas(targetWidth, extensionHeight);
  const layerCtx = layer.getContext("2d");

  if (!layerCtx) {
    throw new Error("Could not create edge layer context.");
  }

  layerCtx.drawImage(
    scaledCanvas,
    0,
    drawHeight - actualSampleHeight,
    targetWidth,
    actualSampleHeight,
    0,
    0,
    targetWidth,
    extensionHeight
  );

  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.filter = `blur(${blurPx}px)`;
  ctx.drawImage(layer, 0, extensionY);
  ctx.restore();
}
```

---

# Helper: Seam Feather

```ts
function drawSeamFeather(
  ctx: OffscreenCanvasRenderingContext2D,
  scaledCanvas: OffscreenCanvas,
  params: {
    targetWidth: number;
    drawHeight: number;
    extensionY: number;
    extensionHeight: number;
    featherHeight: number;
  }
): void {
  const {
    targetWidth,
    drawHeight,
    extensionY,
    extensionHeight,
    featherHeight,
  } = params;

  const actualFeatherHeight = Math.min(
    featherHeight,
    drawHeight,
    extensionHeight
  );

  if (actualFeatherHeight <= 0) return;

  const layerHeight = actualFeatherHeight * 2;
  const layer = new OffscreenCanvas(targetWidth, layerHeight);
  const layerCtx = layer.getContext("2d");

  if (!layerCtx) {
    throw new Error("Could not create feather layer context.");
  }

  layerCtx.drawImage(
    scaledCanvas,
    0,
    drawHeight - actualFeatherHeight,
    targetWidth,
    actualFeatherHeight,
    0,
    0,
    targetWidth,
    layerHeight
  );

  const gradient = layerCtx.createLinearGradient(0, 0, 0, layerHeight);
  gradient.addColorStop(0.0, "rgba(0,0,0,1)");
  gradient.addColorStop(0.45, "rgba(0,0,0,0.8)");
  gradient.addColorStop(1.0, "rgba(0,0,0,0)");

  layerCtx.globalCompositeOperation = "destination-in";
  layerCtx.fillStyle = gradient;
  layerCtx.fillRect(0, 0, targetWidth, layerHeight);

  ctx.drawImage(
    layer,
    0,
    extensionY - actualFeatherHeight
  );
}
```

---

# Helper: Darken Gradient

```ts
function drawDarkenGradient(
  ctx: OffscreenCanvasRenderingContext2D,
  params: {
    targetWidth: number;
    targetHeight: number;
    extensionY: number;
    extensionHeight: number;
    opacity: number;
  }
): void {
  const {
    targetWidth,
    targetHeight,
    extensionY,
    extensionHeight,
    opacity,
  } = params;

  if (opacity <= 0 || extensionHeight <= 0) return;

  const gradient = ctx.createLinearGradient(
    0,
    extensionY,
    0,
    targetHeight
  );

  gradient.addColorStop(0, `rgba(0,0,0,0)`);
  gradient.addColorStop(1, `rgba(0,0,0,${opacity})`);

  ctx.save();
  ctx.fillStyle = gradient;
  ctx.fillRect(0, extensionY, targetWidth, extensionHeight);
  ctx.restore();
}
```

---

# Helper: Seeded Noise

```ts
function drawNoise(
  ctx: OffscreenCanvasRenderingContext2D,
  params: {
    targetWidth: number;
    extensionY: number;
    extensionHeight: number;
    opacity: number;
    seed: number;
  }
): void {
  const {
    targetWidth,
    extensionY,
    extensionHeight,
    opacity,
    seed,
  } = params;

  if (opacity <= 0 || extensionHeight <= 0) return;

  const noiseCanvas = new OffscreenCanvas(targetWidth, extensionHeight);
  const noiseCtx = noiseCanvas.getContext("2d");

  if (!noiseCtx) {
    throw new Error("Could not create noise context.");
  }

  const imageData = noiseCtx.createImageData(targetWidth, extensionHeight);
  const data = imageData.data;

  let state = seed >>> 0;

  function random() {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) / 0xffffffff);
  }

  for (let i = 0; i < data.length; i += 4) {
    const value = Math.floor(random() * 255);

    data[i + 0] = value;
    data[i + 1] = value;
    data[i + 2] = value;
    data[i + 3] = Math.floor(255 * opacity);
  }

  noiseCtx.putImageData(imageData, 0, 0);

  ctx.save();
  ctx.globalCompositeOperation = "soft-light";
  ctx.drawImage(noiseCanvas, 0, extensionY);
  ctx.restore();
}
```

If `soft-light` gives inconsistent results across browsers, use normal alpha compositing instead:

```ts
ctx.save();
ctx.globalAlpha = opacity;
ctx.drawImage(noiseCanvas, 0, extensionY);
ctx.restore();
```

---

# Parameter Tuning

## Default Batch Preset

Use this for most card art:

```ts
{
  mirrorSampleHeight: 160,
  edgeSampleHeight: 12,
  seamFeatherHeight: 24,
  mirrorBlurPx: 12,
  edgeBlurPx: 20,
  mirrorOpacity: 1.0,
  edgeOpacity: 0.55,
  darkenOpacity: 0.18,
  noiseOpacity: 0.035
}
```

## Painterly / Abstract Art

For art with soft clouds, magic, fire, fog, smoke, or painterly backgrounds:

```ts
{
  mirrorSampleHeight: 120,
  edgeSampleHeight: 8,
  seamFeatherHeight: 32,
  mirrorBlurPx: 18,
  edgeBlurPx: 28,
  edgeOpacity: 0.65,
  darkenOpacity: 0.15,
  noiseOpacity: 0.025
}
```

## Detailed Landscape Art

For rocks, grass, forests, buildings, or terrain:

```ts
{
  mirrorSampleHeight: 220,
  edgeSampleHeight: 16,
  seamFeatherHeight: 20,
  mirrorBlurPx: 8,
  edgeBlurPx: 16,
  edgeOpacity: 0.45,
  darkenOpacity: 0.12,
  noiseOpacity: 0.04
}
```

## UI-Safe Dark Bottom

For images where text or icons will appear over the bottom:

```ts
{
  mirrorSampleHeight: 160,
  edgeSampleHeight: 12,
  seamFeatherHeight: 24,
  mirrorBlurPx: 14,
  edgeBlurPx: 24,
  edgeOpacity: 0.55,
  darkenOpacity: 0.28,
  noiseOpacity: 0.03
}
```

---

# Handling Edge Cases

## Extension Is Very Small

If the extension is less than 16px, use a simpler strategy:

* Stretch the bottom 4–8px
* Blur lightly
* Feather seam

The mirrored layer may be unnecessary.

## Extension Is Very Large

If the extension is more than 20–25% of the rendered image height, this method may become visibly synthetic.

Possible mitigations:

* Increase mirror sample height.
* Increase blur.
* Increase darkening.
* Warn the user that the source image is too short.
* Offer AI outpainting or manual crop adjustment as an optional high-quality path.

## Important Subject at Bottom Edge

If a character, face, hand, weapon, or text is cut off at the bottom, mirrored and stretched continuation may look bad.

Possible mitigations:

* Detect high edge detail using local contrast.
* Detect strong vertical/horizontal edges near the bottom.
* Use stronger blur and darkening.
* Prefer blurred background fill over mirror.
* Flag image for manual review.

## Transparent Images

If the source image has transparency:

* Composite it over a fallback color or card background before extension.
* Avoid sampling transparent pixels directly unless transparency is intentional.
* Optionally premultiply against a dominant bottom color.

## CORS Issues

When loading external images into Canvas, ensure the image source has correct CORS headers.

```ts
const img = new Image();
img.crossOrigin = "anonymous";
img.src = url;
```

Otherwise the canvas may become tainted and export will fail.

---

# Quality Heuristics

The system can compute simple metrics to choose parameters automatically.

## Bottom Detail Score

Use the bottom 10–20% of the image and estimate local contrast.

High contrast means detailed objects or hard edges are present. In that case:

* Reduce mirror opacity.
* Increase blur.
* Increase seam feather.
* Increase darkening slightly.

Low contrast means soft background. In that case:

* Edge stretching and blur will usually work well.

## Color Variance

If bottom color variance is low:

* Gradient continuation works well.
* Noise should be low.

If bottom color variance is high:

* Mirror layer should contribute more structure.
* Noise can be slightly higher.

## Seam Difference

After generating the extension, compare the bottom row of the original to the top row of the extension. If the color difference is large:

* Increase edge layer opacity.
* Increase seam feather height.
* Increase edge blur.

---

# Browser Compatibility

## Canvas 2D

Required:

* `drawImage`
* `createImageData`
* `putImageData`
* `globalAlpha`
* `globalCompositeOperation`
* `filter`

The `ctx.filter` API is widely available in modern browsers, but it should still be treated as a feature that may need fallback behavior.

## OffscreenCanvas

Recommended for worker-based processing.

Fallback:

* Use normal `HTMLCanvasElement` on the main thread.
* Process smaller previews interactively.
* Run final export after the user confirms settings.

## Export Formats

Recommended:

```ts
canvas.convertToBlob({ type: "image/png" })
```

or:

```ts
canvas.convertToBlob({ type: "image/webp", quality: 0.95 })
```

For `HTMLCanvasElement`:

```ts
canvas.toBlob(callback, "image/png");
```

---

# Performance Considerations

## Avoid Repeated Full-Resolution Processing During Slider Changes

For interactive tuning:

* Generate a smaller preview version first.
* Re-render full resolution only on export.
* Debounce parameter changes by 100–200ms.

## Cache Intermediate Scaled Canvas

If the user changes only extension parameters, the scaled source image does not need to be regenerated.

Cache:

* Decoded image bitmap
* Scaled canvas
* Bottom sample regions

## Use Workers for Batch Export

For processing many card images:

* Use a worker pool.
* Limit concurrency to avoid memory spikes.
* Revoke object URLs after use.
* Release `ImageBitmap` resources where possible.

```ts
bitmap.close();
```

## Memory Estimate

For a 1024 × 1536 RGBA canvas:

```text
1024 × 1536 × 4 = ~6 MB per canvas
```

Multiple intermediate canvases can quickly multiply memory usage. Prefer reusing canvases where practical.

---

# Testing Strategy

## Unit Tests

Test:

* Correct output dimensions.
* No crash when extension height is zero.
* No crash when extension height is very small.
* Deterministic noise for the same seed.
* Different noise for different seeds.
* Correct handling of transparent images.
* Correct behavior when source image is smaller than sample height.

## Visual Regression Tests

Use a fixed set of representative card art:

* Fire / smoke
* Water / mist
* Forest / foliage
* Snow / fog
* Desert / sand
* Character close-up
* Character full-body
* Dark image
* Bright image
* High-detail bottom edge
* Low-detail bottom edge

Generate outputs with fixed parameters and compare snapshots.

Because image processing can vary slightly by browser and GPU, visual regression should allow a small pixel tolerance.

## Manual Review Checklist

For each output, check:

* Is the seam visible?
* Does the extension look like a repeated mirror?
* Are there obvious vertical streaks?
* Is the bottom too blurry?
* Is the bottom too dark?
* Does the extension distract from the card frame?
* Does the extension improve or harm text readability?

---

# UX Recommendations

Provide presets rather than exposing every parameter initially.

Suggested UI:

```text
Extension Amount: [auto / px]
Style:
  - Balanced
  - Soft / Painterly
  - Detailed Landscape
  - Dark UI-Safe
Advanced:
  - Mirror Amount
  - Edge Stretch Amount
  - Blur
  - Seam Feather
  - Darken
  - Noise
```

For each image, show:

* Original
* Extended result
* Toggle seam guide
* Toggle card frame overlay
* Before/after comparison

The card frame overlay is especially important because an extension that looks strange on its own may look excellent once covered by frame elements.

---

# Recommended First Implementation

Implement in this order:

1. Canvas output sizing and source image scaling.
2. Basic bottom edge stretch.
3. Blur on stretched edge.
4. Mirrored bottom crop.
5. Seam feather.
6. Darkening gradient.
7. Seeded noise.
8. Worker-based batch processing.
9. Presets and UI controls.
10. Visual regression suite.

The minimum useful version is:

```text
bottom edge stretch + blur + dark gradient
```

The recommended production version is:

```text
mirrored crop + edge stretch + blur + seam feather + dark gradient + noise
```

---

# Open Questions

* Should the extension always preserve the full original image, or is slight vertical scaling acceptable?
* Should the generated area be allowed to overlap behind the card frame, text box, or title region?
* What is the maximum acceptable extension before an image is flagged for manual review?
* Should presets be chosen manually, or should image heuristics select them automatically?
* Should the output be PNG, WebP, or both?
* Should the system support extending top/side edges later?

---

# Conclusion

The proposed strategy provides a practical, deterministic, browser-friendly way to extend card art downward by a small amount. It avoids the complexity and unpredictability of generative outpainting while producing a much more natural result than flat color padding.

For fantasy card art, the best default is a layered composition using a blurred mirrored crop, a blurred stretched bottom strip, seam feathering, subtle darkening, and light noise. This approach is robust enough for batch processing while still offering tunable controls for higher-quality manual review.
