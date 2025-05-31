import { useState, useEffect, useCallback, useRef } from "react";
import {
  initSegmentation,
  createSession,
  precomputeEmbedding,
  type ClickType,
  type SegmentationSession,
} from "minisam";
import { createAsyncOperationQueue } from "../utils/async-queue";

export interface Click {
  x: number;
  y: number;
  type: ClickType;
}

export interface UseMiniSamOptions {
  autoInit?: boolean;
  onInitialized?: () => void;
  onError?: (error: Error) => void;
}

export interface UseMiniSamReturn {
  // State
  isInitialized: boolean;
  isLoading: boolean;
  image: HTMLImageElement | null;
  clicks: Click[];
  mask: ImageData | null;

  // Actions
  initialize: () => Promise<void>;
  loadImage: (source: string | File | HTMLImageElement) => Promise<void>;
  addClick: (
    x: number,
    y: number,
    type?: ClickType
  ) => Promise<ImageData | null>;
  removeLastClick: () => Promise<ImageData | null | undefined>;
  reset: () => void;
  segment: () => Promise<ImageData | null>;
  segmentWithClicks: (clicks: Click[]) => Promise<ImageData | null>;
  extractMaskAsCanvas: () => HTMLCanvasElement | null;
  extractMaskAsBlob: (type?: string, quality?: number) => Promise<Blob | null>;
}

export function useMiniSam(options: UseMiniSamOptions = {}): UseMiniSamReturn {
  const { autoInit = true, onInitialized, onError } = options;

  // State
  const [isInitialized, setIsInitialized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [clicks, setClicks] = useState<Click[]>([]);
  const [mask, setMask] = useState<ImageData | null>(null);

  // Refs
  const sessionRef = useRef<SegmentationSession | null>(null);
  const initPromiseRef = useRef<Promise<void> | null>(null);
  const onInitializedRef = useRef(onInitialized);
  const onErrorRef = useRef(onError);
  const asyncQueueRef = useRef(createAsyncOperationQueue());

  // Update callback refs
  useEffect(() => {
    onInitializedRef.current = onInitialized;
    onErrorRef.current = onError;
  });

  // Initialize miniSAM
  const initialize = useCallback(async () => {
    if (isInitialized) return;

    // Reuse existing initialization if in progress
    if (initPromiseRef.current) {
      return initPromiseRef.current;
    }

    initPromiseRef.current = (async () => {
      try {
        setIsLoading(true);
        await initSegmentation();
        setIsInitialized(true);
        onInitializedRef.current?.();
      } catch (error) {
        console.error("Failed to initialize miniSAM:", error);
        onErrorRef.current?.(error as Error);
        throw error;
      } finally {
        setIsLoading(false);
        initPromiseRef.current = null;
      }
    })();

    return initPromiseRef.current;
  }, [isInitialized]);

  // Auto-initialize
  useEffect(() => {
    if (autoInit) {
      initialize();
    }
  }, [autoInit, initialize]);

  // Load image
  const loadImage = useCallback(
    async (source: string | File | HTMLImageElement) => {
      if (!isInitialized) {
        await initialize();
      }

      setIsLoading(true);
      try {
        let img: HTMLImageElement;

        if (source instanceof HTMLImageElement) {
          img = source;
        } else if (typeof source === "string") {
          img = new Image();
          img.crossOrigin = "anonymous";
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = source;
          });
        } else if (source instanceof File) {
          img = new Image();
          const url = URL.createObjectURL(source);
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = url;
          });
          URL.revokeObjectURL(url);
        } else {
          throw new Error("Invalid image source");
        }

        setImage(img);
        setClicks([]);
        setMask(null);

        // Precompute embedding for performance
        await precomputeEmbedding(img);

        // Create new session
        sessionRef.current = createSession(img);
      } catch (error) {
        console.error("Error loading image:", error);
        onErrorRef.current?.(error as Error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [isInitialized, initialize]
  );

  // Add click
  const addClick = useCallback(
    async (x: number, y: number, type: ClickType = "include") => {
      if (!image || !sessionRef.current) {
        throw new Error("No image loaded");
      }

      const newClick: Click = { x, y, type };
      setClicks((prev) => [...prev, newClick]);

      sessionRef.current.addClick(x, y, type);

      setIsLoading(true);
      try {
        const maskData = await asyncQueueRef.current.enqueue(() => 
          sessionRef.current!.segment(image)
        ) as ImageData;
        setMask(maskData);
        return maskData;
      } catch (error) {
        console.error("Segmentation error:", error);
        onErrorRef.current?.(error as Error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [image]
  );

  // Remove last click
  const removeLastClick = useCallback(async () => {
    if (!image || !sessionRef.current || clicks.length === 0) return;

    sessionRef.current.removeLastClick();
    setClicks((prev) => prev.slice(0, -1));

    if (clicks.length > 1) {
      setIsLoading(true);
      try {
        const maskData = await asyncQueueRef.current.enqueue(() => 
          sessionRef.current!.segment(image)
        ) as ImageData;
        setMask(maskData);
        return maskData;
      } catch (error) {
        console.error("Segmentation error:", error);
        onErrorRef.current?.(error as Error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    } else {
      setMask(null);
    }
  }, [image, clicks]);

  // Reset
  const reset = useCallback(() => {
    if (sessionRef.current) {
      sessionRef.current.reset();
    }
    setClicks([]);
    setMask(null);
  }, []);

  // Segment with current clicks
  const segment = useCallback(async () => {
    if (!image || !sessionRef.current || clicks.length === 0) {
      return null;
    }

    setIsLoading(true);
    try {
      const maskData = await asyncQueueRef.current.enqueue(() => 
        sessionRef.current!.segment(image)
      ) as ImageData;
      setMask(maskData);
      return maskData;
    } catch (error) {
      console.error("Segmentation error:", error);
      onError?.(error as Error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [image, clicks]);

  // Segment with specific clicks
  const segmentWithClicks = useCallback(
    async (newClicks: Click[]) => {
      if (!image || !sessionRef.current) {
        throw new Error("No image loaded");
      }

      // Reset and apply new clicks
      sessionRef.current.reset();
      newClicks.forEach((click) => {
        sessionRef.current!.addClick(click.x, click.y, click.type);
      });
      setClicks(newClicks);

      if (newClicks.length === 0) {
        setMask(null);
        return null;
      }

      setIsLoading(true);
      try {
        const maskData = await asyncQueueRef.current.enqueue(() => 
          sessionRef.current!.segment(image)
        ) as ImageData;
        setMask(maskData);
        return maskData;
      } catch (error) {
        console.error("Segmentation error:", error);
        onErrorRef.current?.(error as Error);
        throw error;
      } finally {
        setIsLoading(false);
      }
    },
    [image]
  );

  // Extract mask as canvas
  const extractMaskAsCanvas = useCallback(() => {
    if (!mask || !image) return null;

    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    // Draw original image
    ctx.drawImage(image, 0, 0);

    // Get image data
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Apply mask
    const scaleX = mask.width / image.width;
    const scaleY = mask.height / image.height;

    for (let y = 0; y < image.height; y++) {
      for (let x = 0; x < image.width; x++) {
        const imageIdx = (y * image.width + x) * 4;

        // Map to mask coordinates
        const maskX = Math.floor(x * scaleX);
        const maskY = Math.floor(y * scaleY);
        const maskIdx = (maskY * mask.width + maskX) * 4;

        // Check if mask is transparent at this position
        if (mask.data[maskIdx + 3] === 0) {
          // Make pixel transparent
          imageData.data[imageIdx + 3] = 0;
        }
      }
    }

    // Put the masked data back
    ctx.putImageData(imageData, 0, 0);

    return canvas;
  }, [mask, image]);

  // Extract mask as blob
  const extractMaskAsBlob = useCallback(
    async (
      type: string = "image/png",
      quality?: number
    ): Promise<Blob | null> => {
      const canvas = extractMaskAsCanvas();
      if (!canvas) return null;

      return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob), type, quality);
      });
    },
    [extractMaskAsCanvas]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (sessionRef.current) {
        sessionRef.current.dispose();
      }
    };
  }, []);

  return {
    // State
    isInitialized,
    isLoading,
    image,
    clicks,
    mask,

    // Actions
    initialize,
    loadImage,
    addClick,
    removeLastClick,
    reset,
    segment,
    segmentWithClicks,
    extractMaskAsCanvas,
    extractMaskAsBlob,
  };
}
