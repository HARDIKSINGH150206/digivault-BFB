"use client";

/**
 * Ported from Aceternity UI (fetched via `npx shadcn add @aceternity/file-upload-demo`).
 * Rewritten off Tailwind to inline styles (no Tailwind in this project) and
 * restyled for this app's dark navy/blue palette instead of the original's
 * light/dark-mode neutral grays. Also dropped `@tabler/icons-react` — a
 * whole icon library for one upload glyph — in favor of a small inline SVG,
 * and added an `accept`/`description` prop since the original was
 * unrestricted (any file type).
 */
import { useRef, useState } from "react";
import { motion } from "motion/react";
import { useDropzone } from "react-dropzone";

function UploadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 16V4M12 4l-4 4M12 4l4 4" stroke="#7ab4e8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" stroke="#7ab4e8" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function GridPattern() {
  const columns = 24;
  const rows = 7;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
      {Array.from({ length: rows }).map((_, row) =>
        Array.from({ length: columns }).map((_, col) => {
          const index = row * columns + col;
          return (
            <div
              key={`${col}-${row}`}
              style={{
                height: 32,
                width: 32,
                borderRadius: 2,
                background: index % 2 === 0 ? "rgba(74,144,196,0.03)" : "rgba(74,144,196,0.07)",
              }}
            />
          );
        })
      )}
    </div>
  );
}

export function FileUpload({
  onChange,
  accept,
  title = "Upload file",
  description = "Drag or drop your file here, or click to browse",
}: {
  onChange?: (files: File[]) => void;
  accept?: Record<string, string[]>;
  title?: string;
  description?: string;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(newFiles: File[]) {
    setFiles(newFiles);
    onChange?.(newFiles);
  }

  const { getRootProps, isDragActive } = useDropzone({
    multiple: false,
    noClick: true,
    accept,
    onDrop: handleFileChange,
  });

  return (
    <div style={{ width: "100%" }} {...getRootProps()}>
      <motion.div
        onClick={() => fileInputRef.current?.click()}
        whileHover={{ borderColor: "rgba(74,144,196,0.5)" }}
        style={{
          position: "relative",
          width: "100%",
          cursor: "pointer",
          overflow: "hidden",
          borderRadius: 8,
          border: `1px dashed ${isDragActive ? "#4a90c4" : "rgba(74,144,196,0.25)"}`,
          background: "rgba(10,15,24,0.4)",
          padding: "36px 24px",
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={accept ? Object.keys(accept).join(",") : undefined}
          onChange={(e) => handleFileChange(Array.from(e.target.files ?? []))}
          style={{ display: "none" }}
        />
        <div
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            maskImage: "radial-gradient(ellipse at center, white, transparent)",
            WebkitMaskImage: "radial-gradient(ellipse at center, white, transparent)",
          }}
        >
          <GridPattern />
        </div>

        <div style={{ position: "relative", display: "grid", justifyItems: "center", gap: 2 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#e2e8f0" }}>{title}</p>
          <p style={{ margin: "2px 0 0", fontSize: 12.5, color: "#6b7280" }}>{description}</p>

          <div style={{ marginTop: 20, width: "100%", maxWidth: 420 }}>
            {files.length > 0 ? (
              files.map((file, idx) => (
                <motion.div
                  key={file.name + idx}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  style={{
                    marginTop: idx === 0 ? 0 : 10,
                    padding: 14,
                    borderRadius: 6,
                    background: "rgba(15,22,35,0.7)",
                    border: "1px solid rgba(74,144,196,0.2)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                    <span style={{ fontSize: 13, color: "#e2e8f0", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {file.name}
                    </span>
                    <span
                      style={{
                        flexShrink: 0,
                        fontSize: 11,
                        color: "#9ca3af",
                        background: "rgba(74,144,196,0.1)",
                        border: "1px solid rgba(74,144,196,0.2)",
                        borderRadius: 4,
                        padding: "2px 6px",
                      }}
                    >
                      {(file.size / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  </div>
                  <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6b7280" }}>
                    <span>{file.type || "unknown type"}</span>
                    <span>modified {new Date(file.lastModified).toLocaleDateString()}</span>
                  </div>
                </motion.div>
              ))
            ) : (
              <div
                style={{
                  margin: "0 auto",
                  height: 72,
                  width: 72,
                  borderRadius: 8,
                  background: "rgba(15,22,35,0.7)",
                  border: "1px solid rgba(74,144,196,0.25)",
                  display: "grid",
                  placeItems: "center",
                }}
              >
                <UploadIcon />
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
