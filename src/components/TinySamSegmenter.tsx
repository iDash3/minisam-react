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
} from "tinysam";
import clsx from "clsx";

// Types
export interface Click {
  x: number;
  y: number;
  type: ClickType;
}

export interface TinySamRef {
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

export interface TinySamSegmenterProps {
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

export const TinySamSegmenter = forwardRef<TinySamRef, TinySamSegmenterProps>(
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
    const [clicks, setClicks] = useState<Click[]>([]);
    const [clickMode, setClickMode] = useState<ClickType>(initialClickMode);
    const [mask, setMask] = useState<ImageData | null>(null);
    const [session, setSession] = useState<SegmentationSession | null>(null);

    // Refs
    const containerRef = useRef<HTMLDivElement>(null);
    const imageCanvasRef = useRef<HTMLCanvasElement>(null);
    const maskCanvasRef = useRef<HTMLCanvasElement>(null);
    const imageElementRef = useRef<HTMLImageElement | null>(null);

    // Initialize TinySAM
    useEffect(() => {
      if (!autoInit) return;

      const init = async () => {
        try {
          setIsLoading(true);
          await initSegmentation();
          setIsInitialized(true);
          onInitialized?.();
        } catch (error) {
          console.error("Failed to initialize TinySAM:", error);
          onError?.(error as Error);
        } finally {
          setIsLoading(false);
        }
      };

      init();
    }, [autoInit, onInitialized, onError]);

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

          onImageLoad?.(img);
        } catch (error) {
          console.error("Error loading image:", error);
          onError?.(error as Error);
        } finally {
          setIsLoading(false);
        }
      };

      loadImage();
    }, [image, isInitialized, onImageLoad, onError]);

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
        setClicks(newClicks);
        onClicksUpdate?.(newClicks);

        // Add click to session
        session.addClick(x, y, clickMode);

        // Perform segmentation
        setIsLoading(true);
        try {
          const maskData = await session.segment(loadedImage);
          setMask(maskData);
          onMaskUpdate?.(maskData);

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
          onError?.(error as Error);
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
        onClicksUpdate,
        onMaskUpdate,
        onError,
      ]
    );

    // Reset
    const reset = useCallback(() => {
      if (session) {
        session.reset();
      }
      setClicks([]);
      setMask(null);
      onClicksUpdate?.([]);
      onMaskUpdate?.(null);

      // Clear mask canvas
      const maskCanvas = maskCanvasRef.current;
      if (maskCanvas) {
        const ctx = maskCanvas.getContext("2d");
        ctx?.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
      }
    }, [session, onClicksUpdate, onMaskUpdate]);

    // Undo last click
    const undo = useCallback(async () => {
      if (!session || !loadedImage || clicks.length === 0) return;

      session.removeLastClick();
      const newClicks = clicks.slice(0, -1);
      setClicks(newClicks);
      onClicksUpdate?.(newClicks);

      if (newClicks.length > 0) {
        setIsLoading(true);
        try {
          const maskData = await session.segment(loadedImage);
          setMask(maskData);
          onMaskUpdate?.(maskData);

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
          onError?.(error as Error);
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
      onClicksUpdate,
      onMaskUpdate,
      onError,
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
        onClicksUpdate?.(newClicks);

        if (newClicks.length === 0) {
          reset();
          return;
        }

        setIsLoading(true);
        try {
          const maskData = await session.segment(loadedImage);
          setMask(maskData);
          onMaskUpdate?.(maskData);

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
          onError?.(error as Error);
        } finally {
          setIsLoading(false);
        }
      },
      [
        session,
        loadedImage,
        maskColor,
        reset,
        onClicksUpdate,
        onMaskUpdate,
        onError,
      ]
    );

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
        setClickMode,
        segmentWithClicks,
      }),
      [reset, undo, mask, clicks, loadedImage, segmentWithClicks]
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
      setClickMode,
      extractMask: () => mask,
    };

    return (
      <div ref={containerRef} className={clsx("tinysam-container", className)}>
        <div
          className="tinysam-canvas-wrapper"
          style={{ position: "relative", display: "inline-block" }}
        >
          <canvas
            ref={imageCanvasRef}
            onClick={handleCanvasClick}
            className={clsx("tinysam-image-canvas", imageClassName, {
              "cursor-crosshair": loadedImage && !isLoading,
              "cursor-wait": isLoading,
            })}
            style={{ display: "block", maxWidth: "100%", height: "auto" }}
          />

          <canvas
            ref={maskCanvasRef}
            className={clsx("tinysam-mask-canvas", maskClassName)}
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
                  className={clsx("tinysam-click-marker", clickMarkerClassName)}
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

TinySamSegmenter.displayName = "TinySamSegmenter";

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
