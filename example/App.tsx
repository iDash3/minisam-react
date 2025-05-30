import React, { useState, useRef } from "react";
import {
  MiniSamSegmenter,
  MiniSamRef,
  downloadCanvas,
  applyMaskToImage,
} from "@minisam/react";

function App() {
  const [imageUrl, setImageUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const segmenterRef = useRef<MiniSamRef>(null);

  const handleExtract = () => {
    const mask = segmenterRef.current?.extractMask();
    const image = segmenterRef.current?.getImage();

    if (mask && image) {
      // Apply mask and trim to content
      const maskedCanvas = applyMaskToImage(image, mask, {
        trimToContent: true,
        padding: 10,
      });

      // Download the result
      downloadCanvas(maskedCanvas, "extracted-object.png");
    }
  };

  const handleReset = () => {
    segmenterRef.current?.reset();
  };

  const handleUndo = () => {
    segmenterRef.current?.undo();
  };

  return (
    <div style={{ padding: "20px", fontFamily: "sans-serif" }}>
      <h1>miniSAM React Example</h1>

      <div style={{ marginBottom: "20px" }}>
        <h2>Option 1: URL Input</h2>
        <input
          type="text"
          placeholder="Enter image URL"
          value={imageUrl}
          onChange={(e) => setImageUrl(e.target.value)}
          style={{ width: "300px", marginRight: "10px" }}
        />
        <button onClick={() => setFile(null)}>Load URL</button>
      </div>

      <div style={{ marginBottom: "20px" }}>
        <h2>Option 2: File Upload</h2>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const selectedFile = e.target.files?.[0];
            if (selectedFile) {
              setFile(selectedFile);
              setImageUrl("");
            }
          }}
        />
      </div>

      {(imageUrl || file) && (
        <div>
          <MiniSamSegmenter
            ref={segmenterRef}
            image={file || imageUrl}
            onInitialized={() => console.log("miniSAM initialized!")}
            onMaskUpdate={(mask) => console.log("Mask updated:", mask)}
            onError={(error) => console.error("Error:", error)}
            maskColor="#00ff00"
            maskOpacity={0.5}
          >
            {({
              isLoading,
              clicks,
              hasImage,
              hasMask,
              clickMode,
              setClickMode,
            }) => (
              <div style={{ marginTop: "20px" }}>
                <div style={{ marginBottom: "10px" }}>
                  <button
                    onClick={() => setClickMode("include")}
                    style={{
                      marginRight: "10px",
                      backgroundColor:
                        clickMode === "include" ? "#10b981" : "#e5e7eb",
                      color: clickMode === "include" ? "white" : "black",
                      padding: "5px 15px",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                  >
                    Include Mode
                  </button>
                  <button
                    onClick={() => setClickMode("exclude")}
                    style={{
                      marginRight: "10px",
                      backgroundColor:
                        clickMode === "exclude" ? "#ef4444" : "#e5e7eb",
                      color: clickMode === "exclude" ? "white" : "black",
                      padding: "5px 15px",
                      border: "none",
                      borderRadius: "4px",
                      cursor: "pointer",
                    }}
                  >
                    Exclude Mode
                  </button>
                  <button
                    onClick={handleUndo}
                    disabled={clicks.length === 0}
                    style={{
                      marginRight: "10px",
                      padding: "5px 15px",
                      border: "none",
                      borderRadius: "4px",
                      cursor: clicks.length === 0 ? "not-allowed" : "pointer",
                      opacity: clicks.length === 0 ? 0.5 : 1,
                    }}
                  >
                    Undo
                  </button>
                  <button
                    onClick={handleReset}
                    disabled={clicks.length === 0}
                    style={{
                      marginRight: "10px",
                      padding: "5px 15px",
                      border: "none",
                      borderRadius: "4px",
                      cursor: clicks.length === 0 ? "not-allowed" : "pointer",
                      opacity: clicks.length === 0 ? 0.5 : 1,
                    }}
                  >
                    Reset
                  </button>
                  <button
                    onClick={handleExtract}
                    disabled={!hasMask}
                    style={{
                      backgroundColor: "#6366f1",
                      color: "white",
                      padding: "5px 15px",
                      border: "none",
                      borderRadius: "4px",
                      cursor: !hasMask ? "not-allowed" : "pointer",
                      opacity: !hasMask ? 0.5 : 1,
                    }}
                  >
                    Extract & Download
                  </button>
                </div>

                <div style={{ fontSize: "14px", color: "#666" }}>
                  {isLoading && <p>Loading...</p>}
                  {hasImage && !isLoading && (
                    <p>
                      Click on the image to{" "}
                      {clickMode === "include" ? "include" : "exclude"} areas.
                      {clicks.length > 0 &&
                        ` (${clicks.length} click${
                          clicks.length > 1 ? "s" : ""
                        })`}
                    </p>
                  )}
                </div>
              </div>
            )}
          </MiniSamSegmenter>
        </div>
      )}
    </div>
  );
}

export default App;
