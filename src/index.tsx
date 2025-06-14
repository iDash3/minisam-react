// Main exports for @minisam/react

// Components
export { MiniSamSegmenter } from "./components/MiniSamSegmenter";
export type {
  MiniSamSegmenterProps,
  MiniSamRef,
  Click,
} from "./components/MiniSamSegmenter";

// Hooks
export { useMiniSam } from "./hooks/useMiniSam";
export type { UseMiniSamOptions, UseMiniSamReturn } from "./hooks/useMiniSam";

// Utilities
export {
  maskToCanvas,
  applyMaskToImage,
  trimCanvasToContent,
  canvasToBlob,
  downloadCanvas,
  getMaskBounds,
} from "./utils/mask-utils";
export { createAsyncOperationQueue } from "./utils/async-queue";
export type { AsyncOperationQueue } from "./utils/async-queue";

// Re-export ClickType from minisam
export type { ClickType } from "minisam";
