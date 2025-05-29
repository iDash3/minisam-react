// Main exports for @tinysam/react

// Components
export { TinySamSegmenter } from "./components/TinySamSegmenter";
export type {
  TinySamSegmenterProps,
  TinySamRef,
  Click,
} from "./components/TinySamSegmenter";

// Hooks
export { useTinySam } from "./hooks/useTinySam";
export type { UseTinySamOptions, UseTinySamReturn } from "./hooks/useTinySam";

// Utilities
export {
  maskToCanvas,
  applyMaskToImage,
  trimCanvasToContent,
  canvasToBlob,
  downloadCanvas,
  getMaskBounds,
} from "./utils/mask-utils";

// Re-export ClickType from tinysam
export type { ClickType } from "tinysam";
