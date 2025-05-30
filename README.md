# @minisam/react

Ready-to-use React components for [miniSAM](https://github.com/iDash3/minisam) - browser-based image segmentation using the Segment Anything Model.

## Features

- **Zero-config setup** - Just import and use
- **Fully customizable** - Style it your way
- **Hooks included** - For programmatic control
- **Tiny bundle** - Optimized for production
- **TypeScript ready** - Full type support
- **Automatic masking** - Click and segment

## Installation

```bash
npm install @minisam/react minisam onnxruntime-web
# or
yarn add @minisam/react minisam onnxruntime-web
# or
pnpm add @minisam/react minisam onnxruntime-web
```

## Quick Start

```tsx
import { MiniSamSegmenter } from "@minisam/react";

function App() {
  return (
    <MiniSamSegmenter
      image="/path/to/image.jpg"
      onMaskUpdate={(mask) => console.log("New mask:", mask)}
    />
  );
}
```

That's it! The component handles everything automatically:

- Model initialization
- Image loading
- Click handling
- Mask generation
- UI rendering

## Component API

### Basic Usage

```tsx
<MiniSamSegmenter
  image="/path/to/image.jpg"
  onMaskUpdate={(mask) => {
    // Handle the generated mask
    console.log("Mask updated:", mask);
  }}
/>
```

### Advanced Usage with Custom UI

```tsx
<MiniSamSegmenter
  image={imageFile}
  maskColor="#ff0000"
  maskOpacity={0.3}
  showClickMarkers={true}
  onInitialized={() => console.log("miniSAM ready!")}
  onError={(error) => console.error("Error:", error)}
>
  {({ isLoading, clicks, reset, undo, setClickMode, extractMask }) => (
    <div className="controls">
      <button onClick={() => setClickMode("include")}>Include Mode</button>
      <button onClick={() => setClickMode("exclude")}>Exclude Mode</button>
      <button onClick={undo} disabled={clicks.length === 0}>
        Undo
      </button>
      <button onClick={reset}>Reset</button>
      <button
        onClick={() => {
          const mask = extractMask();
          // Do something with the mask
        }}
      >
        Extract Mask
      </button>
      {isLoading && <p>Processing...</p>}
    </div>
  )}
</MiniSamSegmenter>
```

### Props

| Prop                | Type                                 | Default     | Description                      |
| ------------------- | ------------------------------------ | ----------- | -------------------------------- |
| `image`             | `string \| File \| HTMLImageElement` | -           | Image source to segment          |
| `autoInit`          | `boolean`                            | `true`      | Auto-initialize miniSAM on mount |
| `clickMode`         | `'include' \| 'exclude'`             | `'include'` | Default click mode               |
| `onMaskUpdate`      | `(mask: ImageData \| null) => void`  | -           | Callback when mask changes       |
| `onClicksUpdate`    | `(clicks: Click[]) => void`          | -           | Callback when clicks change      |
| `onImageLoad`       | `(image: HTMLImageElement) => void`  | -           | Callback when image loads        |
| `onInitialized`     | `() => void`                         | -           | Callback when miniSAM is ready   |
| `onError`           | `(error: Error) => void`             | -           | Error handler                    |
| `className`         | `string`                             | -           | Container class name             |
| `imageClassName`    | `string`                             | -           | Image canvas class name          |
| `maskClassName`     | `string`                             | -           | Mask canvas class name           |
| `showClickMarkers`  | `boolean`                            | `true`      | Show click position markers      |
| `clickMarkerSize`   | `number`                             | `20`        | Size of click markers in pixels  |
| `maskOpacity`       | `number`                             | `0.5`       | Mask overlay opacity (0-1)       |
| `maskColor`         | `string`                             | `'#6366f1'` | Mask color (hex)                 |
| `includeClickColor` | `string`                             | `'#10b981'` | Include click marker color       |
| `excludeClickColor` | `string`                             | `'#ef4444'` | Exclude click marker color       |

### Ref Methods

Access component methods using a ref:

```tsx
const segmenterRef = useRef<MiniSamRef>(null);

<MiniSamSegmenter ref={segmenterRef} image={image} />;

// Use ref methods
segmenterRef.current?.reset();
segmenterRef.current?.undo();
const mask = segmenterRef.current?.extractMask();
```

Available methods:

- `reset()` - Clear all clicks and mask
- `undo()` - Remove last click
- `extractMask()` - Get current mask as ImageData
- `getClicks()` - Get all clicks
- `getMask()` - Get current mask
- `getImage()` - Get loaded image element
- `setClickMode(mode)` - Change click mode
- `segmentWithClicks(clicks)` - Segment with custom clicks

## Hook API

For more control, use the `useMiniSam` hook:

```tsx
import { useMiniSam } from "@minisam/react";

function MyComponent() {
  const {
    isInitialized,
    isLoading,
    image,
    clicks,
    mask,
    loadImage,
    addClick,
    reset,
    extractMaskAsBlob,
  } = useMiniSam();

  const handleImageUpload = async (file: File) => {
    await loadImage(file);
  };

  const handleCanvasClick = async (x: number, y: number) => {
    await addClick(x, y, "include");
  };

  const downloadMask = async () => {
    const blob = await extractMaskAsBlob();
    if (blob) {
      // Download the blob
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "mask.png";
      a.click();
    }
  };

  return <div>{/* Your custom UI */}</div>;
}
```

### Hook Options

```tsx
const minisam = useMiniSam({
  autoInit: true,
  onInitialized: () => console.log("Ready!"),
  onError: (error) => console.error(error),
});
```

### Hook Return Values

| Property/Method         | Type                                         | Description                    |
| ----------------------- | -------------------------------------------- | ------------------------------ |
| `isInitialized`         | `boolean`                                    | Whether miniSAM is initialized |
| `isLoading`             | `boolean`                                    | Loading state                  |
| `image`                 | `HTMLImageElement \| null`                   | Loaded image                   |
| `clicks`                | `Click[]`                                    | Current clicks                 |
| `mask`                  | `ImageData \| null`                          | Current mask                   |
| `initialize()`          | `() => Promise<void>`                        | Manual initialization          |
| `loadImage()`           | `(source) => Promise<void>`                  | Load an image                  |
| `addClick()`            | `(x, y, type?) => Promise<void>`             | Add a click                    |
| `removeLastClick()`     | `() => Promise<void>`                        | Remove last click              |
| `reset()`               | `() => void`                                 | Clear clicks and mask          |
| `segment()`             | `() => Promise<ImageData \| null>`           | Run segmentation               |
| `segmentWithClicks()`   | `(clicks) => Promise<ImageData \| null>`     | Segment with custom clicks     |
| `extractMaskAsCanvas()` | `() => HTMLCanvasElement \| null`            | Get mask as canvas             |
| `extractMaskAsBlob()`   | `(type?, quality?) => Promise<Blob \| null>` | Get mask as blob               |

## Utility Functions

The package includes helpful utilities for working with masks:

```tsx
import {
  maskToCanvas,
  applyMaskToImage,
  trimCanvasToContent,
  downloadCanvas,
  getMaskBounds,
} from "@minisam/react";

// Convert mask to canvas
const canvas = maskToCanvas(mask);

// Apply mask to image and trim
const maskedImage = applyMaskToImage(image, mask, {
  trimToContent: true,
  padding: 10,
});

// Download the result
downloadCanvas(maskedImage, "extracted-object.png");

// Get mask boundaries
const bounds = getMaskBounds(mask);
console.log(`Mask size: ${bounds.width}x${bounds.height}`);
```

## Examples

### Simple Image Segmenter

```tsx
function SimpleSegmenter() {
  const [imageUrl, setImageUrl] = useState("");

  return (
    <div>
      <input
        type="text"
        placeholder="Enter image URL"
        value={imageUrl}
        onChange={(e) => setImageUrl(e.target.value)}
      />

      {imageUrl && (
        <MiniSamSegmenter
          image={imageUrl}
          onMaskUpdate={(mask) => {
            if (mask) {
              console.log("Segmentation complete!");
            }
          }}
        />
      )}
    </div>
  );
}
```

### File Upload with Preview

```tsx
function FileUploadSegmenter() {
  const [file, setFile] = useState<File | null>(null);
  const segmenterRef = useRef<MiniSamRef>(null);

  const handleExtract = async () => {
    const mask = segmenterRef.current?.extractMask();
    if (mask && file) {
      // Process the mask
      const canvas = applyMaskToImage(segmenterRef.current.getImage()!, mask, {
        trimToContent: true,
      });

      // Download result
      downloadCanvas(canvas, `${file.name}-extracted.png`);
    }
  };

  return (
    <div>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => setFile(e.target.files?.[0] || null)}
      />

      {file && (
        <>
          <MiniSamSegmenter ref={segmenterRef} image={file} maskOpacity={0.7} />

          <button onClick={handleExtract}>Extract & Download</button>
        </>
      )}
    </div>
  );
}
```

### Batch Processing

```tsx
function BatchProcessor() {
  const { loadImage, segmentWithClicks, extractMaskAsBlob } = useMiniSam();

  const processImages = async (files: File[]) => {
    const results = [];

    for (const file of files) {
      // Load image
      await loadImage(file);

      // Apply predetermined clicks
      const mask = await segmentWithClicks([
        { x: 100, y: 100, type: "include" },
        { x: 200, y: 200, type: "include" },
      ]);

      if (mask) {
        // Extract as blob
        const blob = await extractMaskAsBlob();
        results.push({ file: file.name, blob });
      }
    }

    return results;
  };

  // ... rest of component
}
```

## Styling

The component uses minimal inline styles by default. You can customize everything using the provided class names:

```css
/* Base container */
.minisam-container {
  position: relative;
  display: inline-block;
}

/* Image canvas */
.minisam-image-canvas {
  max-width: 100%;
  height: auto;
  cursor: crosshair;
}

/* Mask overlay */
.minisam-mask-canvas {
  position: absolute;
  top: 0;
  left: 0;
  pointer-events: none;
}

/* Click markers */
.minisam-click-marker {
  position: absolute;
  border-radius: 50%;
  pointer-events: none;
  transform: translate(-50%, -50%);
}
```

## Performance Tips

1. **Preload models**: The component automatically initializes on mount. For better UX, initialize early:

   ```tsx
   // In your app root
   import { initSegmentation } from "minisam";

   // Preload models
   initSegmentation().then(() => {
     console.log("Models loaded!");
   });
   ```

2. **Reuse sessions**: The component maintains segmentation sessions automatically. Avoid recreating components unnecessarily.
