// Utility functions for working with masks

/**
 * Convert a mask ImageData to a canvas element
 */
export function maskToCanvas(mask: ImageData): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = mask.width;
  canvas.height = mask.height;
  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.putImageData(mask, 0, 0);
  }
  return canvas;
}

/**
 * Apply a mask to an image and return the masked result
 */
export function applyMaskToImage(
  image: HTMLImageElement | HTMLCanvasElement,
  mask: ImageData,
  options: {
    trimToContent?: boolean;
    padding?: number;
  } = {}
): HTMLCanvasElement {
  const { trimToContent = false, padding = 0 } = options;

  // Create canvas for the result
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas;

  // Draw the image
  ctx.drawImage(image, 0, 0);

  // Get image data
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  // Scale factors for mask
  const scaleX = mask.width / image.width;
  const scaleY = mask.height / image.height;

  // Apply mask
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const imageIdx = (y * image.width + x) * 4;

      // Map to mask coordinates
      const maskX = Math.floor(x * scaleX);
      const maskY = Math.floor(y * scaleY);
      const maskIdx = (maskY * mask.width + maskX) * 4;

      // Check mask alpha channel
      if (mask.data[maskIdx + 3] === 0) {
        // Make pixel transparent
        imageData.data[imageIdx + 3] = 0;
      }
    }
  }

  // Put the masked data back
  ctx.putImageData(imageData, 0, 0);

  // Trim to content if requested
  if (trimToContent) {
    return trimCanvasToContent(canvas, padding);
  }

  return canvas;
}

/**
 * Trim a canvas to its content bounds
 */
export function trimCanvasToContent(
  canvas: HTMLCanvasElement,
  padding: number = 0
): HTMLCanvasElement {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas;

  const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const l = pixels.data.length;
  const bound = {
    top: null as number | null,
    left: null as number | null,
    right: null as number | null,
    bottom: null as number | null,
  };

  // Find bounds
  for (let i = 0; i < l; i += 4) {
    if (pixels.data[i + 3] !== 0) {
      const x = (i / 4) % canvas.width;
      const y = ~~(i / 4 / canvas.width);

      if (bound.top === null) {
        bound.top = y;
      }

      if (bound.left === null) {
        bound.left = x;
      } else if (x < bound.left) {
        bound.left = x;
      }

      if (bound.right === null) {
        bound.right = x;
      } else if (bound.right < x) {
        bound.right = x;
      }

      if (bound.bottom === null) {
        bound.bottom = y;
      } else if (bound.bottom < y) {
        bound.bottom = y;
      }
    }
  }

  // Check if we have valid bounds
  if (
    bound.top === null ||
    bound.left === null ||
    bound.right === null ||
    bound.bottom === null
  ) {
    return canvas; // Return original if no content found
  }

  // Apply padding
  bound.top = Math.max(0, bound.top - padding);
  bound.left = Math.max(0, bound.left - padding);
  bound.right = Math.min(canvas.width - 1, bound.right + padding);
  bound.bottom = Math.min(canvas.height - 1, bound.bottom + padding);

  const trimWidth = bound.right - bound.left + 1;
  const trimHeight = bound.bottom - bound.top + 1;

  // Create trimmed canvas
  const trimmedCanvas = document.createElement("canvas");
  trimmedCanvas.width = trimWidth;
  trimmedCanvas.height = trimHeight;
  const trimmedCtx = trimmedCanvas.getContext("2d");

  if (trimmedCtx) {
    trimmedCtx.drawImage(
      canvas,
      bound.left,
      bound.top,
      trimWidth,
      trimHeight,
      0,
      0,
      trimWidth,
      trimHeight
    );
  }

  return trimmedCanvas;
}

/**
 * Convert a canvas to a blob
 */
export async function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string = "image/png",
  quality?: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

/**
 * Download a canvas as an image file
 */
export function downloadCanvas(
  canvas: HTMLCanvasElement,
  filename: string = "segmented-image.png",
  type: string = "image/png",
  quality?: number
): void {
  canvas.toBlob(
    (blob) => {
      if (!blob) return;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    type,
    quality
  );
}

/**
 * Calculate mask bounds (bounding box of non-transparent pixels)
 */
export function getMaskBounds(mask: ImageData): {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
} | null {
  let minX = mask.width;
  let minY = mask.height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) {
      const idx = (y * mask.width + x) * 4;
      if (mask.data[idx + 3] > 0) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX === -1) {
    return null; // No non-transparent pixels
  }

  return {
    left: minX,
    top: minY,
    right: maxX,
    bottom: maxY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}
