import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  forwardRef,
  useImperativeHandle,
} from "react";
import {
  initSegmentation,
  createSession,
  precomputeEmbedding,
  type ClickType,
  type SegmentationSession,
} from "minisam";
import clsx from "clsx";
import { createAsyncOperationQueue } from "../utils/async-queue";

// Types
export interface Click {
  x: number;
  y: number;
  type: ClickType;
}

export interface MiniSamRef {
  // Control methods
  reset: () => void;
  undo: () => void;
  extractMask: () => ImageData | null;

  // State getters
  getClicks: () => Click[];
  getMask: () => ImageData | null;
  getImage: () => HTMLImageElement | null;

  // Advanced methods
  setClickMode: (mode: ClickType) => void;
  segmentWithClicks: (clicks: Click[]) => Promise<void>;
}

export interface MiniSamSegmenterProps {
  // Image source
  image?: string | File | HTMLImageElement;

  // Behavior options
  autoInit?: boolean;
  clickMode?: ClickType;
  onMaskUpdate?: (mask: ImageData | null) => void;
  onClicksUpdate?: (clicks: Click[]) => void;
  onImageLoad?: (image: HTMLImageElement) => void;
  onInitialized?: () => void;
  onError?: (error: Error) => void;

  // Styling
  className?: string;
  imageClassName?: string;
  maskClassName?: string;
  clickMarkerClassName?: string;

  // UI customization
  showClickMarkers?: boolean;
  clickMarkerSize?: number;
  maskOpacity?: number;
  maskColor?: string;
  includeClickColor?: string;
  excludeClickColor?: string;

  // Children can be render props or regular children
  children?:
    | React.ReactNode
    | ((props: {
        isLoading: boolean;
        isInitialized: boolean;
        clicks: Click[];
        hasImage: boolean;
        hasMask: boolean;
        clickMode: ClickType;
        reset: () => void;
        undo: () => void;
        setClickMode: (mode: ClickType) => void;
        extractMask: () => ImageData | null;
      }) => React.ReactNode);
}

export const MiniSamSegmenter = forwardRef<MiniSamRef, MiniSamSegmenterProps>(
  (
    {
      image,
      autoInit = true,
      clickMode: initialClickMode = "include",
      onMaskUpdate,
      onClicksUpdate,
      onImageLoad,
      onInitialized,
      onError,
      className,
      imageClassName,
      maskClassName,
      clickMarkerClassName,
      showClickMarkers = true,
      clickMarkerSize = 20,
      maskOpacity = 0.5,
      maskColor = "#6366f1",
      includeClickColor = "#10b981",
      excludeClickColor = "#ef4444",
      children,
    },
    ref
  ) => {
    // State
    const [isInitialized, setIsInitialized] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [loadedImage, setLoadedImage] = useState<HTMLImageElement | null>(
      null
    );
    const [clicks, setClicksRaw] = useState<Click[]>([]);
    
    // Wrapped setClicks to debug when clicks are cleared
    const setClicks = useCallback((newClicks: Click[] | ((prev: Click[]) => Click[])) => {
      if (typeof newClicks === 'function') {
        setClicksRaw(prev => {
          const result = newClicks(prev);
          if (result.length === 0 && prev.length > 0) {
            console.log('🚨 CLICKS CLEARED! Stack trace:');
            console.trace();
          }
          return result;
        });
      } else {
        if (newClicks.length === 0) {
          console.log('🚨 CLICKS CLEARED! Stack trace:');
          console.trace();
        }
        setClicksRaw(newClicks);
      }
    }, []);
    const [clickMode, setClickMode] = useState<ClickType>(initialClickMode);
    const [mask, setMask] = useState<ImageData | null>(null);
    const [session, setSession] = useState<SegmentationSession | null>(null);
    
    // Async operation queue to prevent concurrent ONNX calls
    const asyncQueueRef = useRef(createAsyncOperationQueue());

    // Refs
    const containerRef = useRef<HTMLDivElement>(null);
    const imageCanvasRef = useRef<HTMLCanvasElement>(null);
    const maskCanvasRef = useRef<HTMLCanvasElement>(null);
    const imageElementRef = useRef<HTMLImageElement | null>(null);

    // Stable callback refs to avoid re-initialization
    const onInitializedRef = useRef(onInitialized);
    const onErrorRef = useRef(onError);
    const onImageLoadRef = useRef(onImageLoad);
    const onMaskUpdateRef = useRef(onMaskUpdate);
    const onClicksUpdateRef = useRef(onClicksUpdate);

    // Update refs when callbacks change
    useEffect(() => {
      onInitializedRef.current = onInitialized;
      onErrorRef.current = onError;
      onImageLoadRef.current = onImageLoad;
      onMaskUpdateRef.current = onMaskUpdate;
      onClicksUpdateRef.current = onClicksUpdate;
    });

    // Sync clickMode prop with internal state (preserve clicks when mode changes)
    useEffect(() => {
      if (clickMode !== initialClickMode) {
        console.log(`🔄 Syncing clickMode prop: ${clickMode} -> ${initialClickMode} (preserving ${clicks.length} clicks)`);
        setClickMode(initialClickMode);
      }
    }, [initialClickMode, clickMode, clicks.length]);

    // Initialize miniSAM
    useEffect(() => {
      if (!autoInit) return;

      const init = async () => {
        try {
          setIsLoading(true);
          await initSegmentation();
          setIsInitialized(true);
          onInitializedRef.current?.();
        } catch (error) {
          console.error("Failed to initialize miniSAM:", error);
          onErrorRef.current?.(error as Error);
        } finally {
          setIsLoading(false);
        }
      };

      init();
    }, [autoInit]);

    // Load image when prop changes
    useEffect(() => {
      if (!image || !isInitialized) return;

      const loadImage = async () => {
        try {
          setIsLoading(true);

          let img: HTMLImageElement;

          if (image instanceof HTMLImageElement) {
            img = image;
          } else if (typeof image === "string") {
            img = new Image();
            img.crossOrigin = "anonymous";
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
              img.src = image;
            });
          } else if (image instanceof File) {
            img = new Image();
            const url = URL.createObjectURL(image);
            await new Promise((resolve, reject) => {
              img.onload = resolve;
              img.onerror = reject;
              img.src = url;
            });
            URL.revokeObjectURL(url);
          } else {
            throw new Error("Invalid image type");
          }

          imageElementRef.current = img;
          setLoadedImage(img);

          // Reset state
          setClicks([]);
          setMask(null);

          // Draw image on canvas
          const canvas = imageCanvasRef.current;
          if (canvas) {
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx?.drawImage(img, 0, 0);
          }

          // Precompute embedding
          await precomputeEmbedding(img);

          // Create new session
          const newSession = createSession(img);
          setSession(newSession);

          onImageLoadRef.current?.(img);
        } catch (error) {
          console.error("Error loading image:", error);
          onErrorRef.current?.(error as Error);
        } finally {
          setIsLoading(false);
        }
      };

      loadImage();
    }, [image, isInitialized]);

    // Handle canvas click
    const handleCanvasClick = useCallback(
      async (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!loadedImage || !session || isLoading) return;

        const canvas = imageCanvasRef.current;
        if (!canvas) return;

        // Get click coordinates relative to the canvas
        const rect = canvas.getBoundingClientRect();
        const scaleX = loadedImage.width / rect.width;
        const scaleY = loadedImage.height / rect.height;

        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        // Add click
        const newClick: Click = { x, y, type: clickMode };
        const newClicks = [...clicks, newClick];
        console.log(`\u2795 Adding click:`, newClick, 'Total clicks:', newClicks.length);
        setClicks(newClicks);
        onClicksUpdateRef.current?.(newClicks);

        // Add click to session
        session.addClick(x, y, clickMode);

        // Perform segmentation with queue to prevent concurrent ONNX calls
        setIsLoading(true);
        try {
          const maskData = await asyncQueueRef.current.enqueue(() => 
            session.segment(loadedImage)
          ) as ImageData;
          setMask(maskData);
          onMaskUpdateRef.current?.(maskData);

          // Draw mask
          const maskCanvas = maskCanvasRef.current;
          if (maskCanvas && maskData) {
            maskCanvas.width = maskData.width;
            maskCanvas.height = maskData.height;
            const ctx = maskCanvas.getContext("2d");
            if (ctx) {
              // Convert mask to colored overlay
              const imageData = ctx.createImageData(
                maskData.width,
                maskData.height
              );
              const color = hexToRgb(maskColor);

              for (let i = 0; i < maskData.data.length; i += 4) {
                const alpha = maskData.data[i + 3];
                if (alpha > 0) {
                  imageData.data[i] = color.r;
                  imageData.data[i + 1] = color.g;
                  imageData.data[i + 2] = color.b;
                  imageData.data[i + 3] = alpha;
                }
              }

              ctx.putImageData(imageData, 0, 0);
            }
          }
        } catch (error) {
          console.error("Segmentation error:", error);
          onErrorRef.current?.(error as Error);
        } finally {
          setIsLoading(false);
        }
      },
      [
        loadedImage,
        session,
        isLoading,
        clickMode,
        clicks,
        maskColor,
      ]
    );

    // Reset
    const reset = useCallback(() => {
      console.log('🔄 reset() called - clearing clicks');
      if (session) {
        session.reset();
      }
      setClicks([]);
      setMask(null);
      onClicksUpdateRef.current?.([]);
      onMaskUpdateRef.current?.(null);

      // Clear mask canvas
      const maskCanvas = maskCanvasRef.current;
      if (maskCanvas) {
        const ctx = maskCanvas.getContext("2d");
        ctx?.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
      }
    }, [session]);

    // Undo last click
    const undo = useCallback(async () => {
      if (!session || !loadedImage || clicks.length === 0) return;

      session.removeLastClick();
      const newClicks = clicks.slice(0, -1);
      setClicks(newClicks);
      onClicksUpdateRef.current?.(newClicks);

      if (newClicks.length > 0) {
        setIsLoading(true);
        try {
          const maskData = await asyncQueueRef.current.enqueue(() => 
            session.segment(loadedImage)
          ) as ImageData;
          setMask(maskData);
          onMaskUpdateRef.current?.(maskData);

          // Redraw mask
          const maskCanvas = maskCanvasRef.current;
          if (maskCanvas && maskData) {
            const ctx = maskCanvas.getContext("2d");
            if (ctx) {
              ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);

              const imageData = ctx.createImageData(
                maskData.width,
                maskData.height
              );
              const color = hexToRgb(maskColor);

              for (let i = 0; i < maskData.data.length; i += 4) {
                const alpha = maskData.data[i + 3];
                if (alpha > 0) {
                  imageData.data[i] = color.r;
                  imageData.data[i + 1] = color.g;
                  imageData.data[i + 2] = color.b;
                  imageData.data[i + 3] = alpha;
                }
              }

              ctx.putImageData(imageData, 0, 0);
            }
          }
        } catch (error) {
          console.error("Segmentation error:", error);
          onErrorRef.current?.(error as Error);
        } finally {
          setIsLoading(false);
        }
      } else {
        reset();
      }
    }, [
      session,
      loadedImage,
      clicks,
      maskColor,
      reset,
    ]);

    // Segment with custom clicks
    const segmentWithClicks = useCallback(
      async (newClicks: Click[]) => {
        if (!session || !loadedImage) return;

        // Reset session and add all clicks
        session.reset();
        newClicks.forEach((click) => {
          session.addClick(click.x, click.y, click.type);
        });

        setClicks(newClicks);
        onClicksUpdateRef.current?.(newClicks);

        if (newClicks.length === 0) {
          reset();
          return;
        }

        setIsLoading(true);
        try {
          const maskData = await asyncQueueRef.current.enqueue(() => 
            session.segment(loadedImage)
          ) as ImageData;
          setMask(maskData);
          onMaskUpdateRef.current?.(maskData);

          // Draw mask
          const maskCanvas = maskCanvasRef.current;
          if (maskCanvas && maskData) {
            const ctx = maskCanvas.getContext("2d");
            if (ctx) {
              ctx.clearRect(0, 0, maskCanvas.width, maskCanvas.height);

              const imageData = ctx.createImageData(
                maskData.width,
                maskData.height
              );
              const color = hexToRgb(maskColor);

              for (let i = 0; i < maskData.data.length; i += 4) {
                const alpha = maskData.data[i + 3];
                if (alpha > 0) {
                  imageData.data[i] = color.r;
                  imageData.data[i + 1] = color.g;
                  imageData.data[i + 2] = color.b;
                  imageData.data[i + 3] = alpha;
                }
              }

              ctx.putImageData(imageData, 0, 0);
            }
          }
        } catch (error) {
          console.error("Segmentation error:", error);
          onErrorRef.current?.(error as Error);
        } finally {
          setIsLoading(false);
        }
      },
      [
        session,
        loadedImage,
        maskColor,
        reset,
      ]
    );

    // Custom setClickMode that preserves clicks and prevents side effects
    const handleSetClickMode = useCallback((newMode: ClickType) => {
      console.log(`🎯 setClickMode called: ${clickMode} -> ${newMode}`);
      console.log(`📍 Current clicks before mode change:`, clicks);
      
      // Only update if mode actually changed
      if (clickMode !== newMode) {
        setClickMode(newMode);
        console.log(`✅ Click mode updated, ${clicks.length} clicks preserved`);
      } else {
        console.log(`ℹ️ Click mode unchanged (${newMode}), no action needed`);
      }
    }, [clickMode, clicks]);

    // Expose methods via ref
    useImperativeHandle(
      ref,
      () => ({
        reset,
        undo,
        extractMask: () => mask,
        getClicks: () => clicks,
        getMask: () => mask,
        getImage: () => loadedImage,
        setClickMode: handleSetClickMode,
        segmentWithClicks,
      }),
      [reset, undo, mask, clicks, loadedImage, segmentWithClicks, handleSetClickMode]
    );

    // Render props
    const renderProps = {
      isLoading,
      isInitialized,
      clicks,
      hasImage: !!loadedImage,
      hasMask: !!mask,
      clickMode,
      reset,
      undo,
      setClickMode: handleSetClickMode,
      extractMask: () => mask,
    };

    return (
      <div ref={containerRef} className={clsx("minisam-container", className)}>
        <div
          className="minisam-canvas-wrapper"
          style={{ position: "relative", display: "inline-block" }}
        >
          <canvas
            ref={imageCanvasRef}
            onClick={handleCanvasClick}
            className={clsx("minisam-image-canvas", imageClassName, {
              "cursor-crosshair": loadedImage && !isLoading,
              "cursor-wait": isLoading,
            })}
            style={{ display: "block", maxWidth: "100%", height: "auto" }}
          />

          <canvas
            ref={maskCanvasRef}
            className={clsx("minisam-mask-canvas", maskClassName)}
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              pointerEvents: "none",
              opacity: maskOpacity,
              display: mask ? "block" : "none",
              maxWidth: "100%",
              height: "auto",
            }}
          />

          {/* Click markers */}
          {showClickMarkers &&
            loadedImage &&
            clicks.map((click, index) => {
              const canvas = imageCanvasRef.current;
              if (!canvas) return null;

              const rect = canvas.getBoundingClientRect();
              const scaleX = rect.width / loadedImage.width;
              const scaleY = rect.height / loadedImage.height;

              const left = click.x * scaleX;
              const top = click.y * scaleY;

              return (
                <div
                  key={index}
                  className={clsx("minisam-click-marker", clickMarkerClassName)}
                  style={{
                    position: "absolute",
                    left: `${left}px`,
                    top: `${top}px`,
                    width: `${clickMarkerSize}px`,
                    height: `${clickMarkerSize}px`,
                    borderRadius: "50%",
                    border: "2px solid",
                    borderColor:
                      click.type === "include"
                        ? includeClickColor
                        : excludeClickColor,
                    backgroundColor:
                      click.type === "include"
                        ? `${includeClickColor}33`
                        : `${excludeClickColor}33`,
                    transform: "translate(-50%, -50%)",
                    pointerEvents: "none",
                  }}
                />
              );
            })}
        </div>

        {/* Render children */}
        {typeof children === "function" ? children(renderProps) : children}
      </div>
    );
  }
);

MiniSamSegmenter.displayName = "MiniSamSegmenter";

// Helper function to convert hex to rgb
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 99, g: 102, b: 241 }; // Default to indigo
}
