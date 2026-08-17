import { ImageResponse } from "next/og";

export const alt = "Brock University Computer Science Club";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** Rendered to a PNG, so the theme tokens are not available here. */
export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        gap: 24,
        padding: 72,
        background: "#fff1f0",
        border: "16px solid #0a0a0a",
      }}
    >
      <div
        style={{
          display: "flex",
          fontSize: 32,
          letterSpacing: 8,
          color: "#0a0a0a",
        }}
      >
        BROCK UNIVERSITY
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 104,
          lineHeight: 1.05,
          color: "#9a4440",
        }}
      >
        Computer Science Club
      </div>
      <div style={{ display: "flex", fontSize: 32, color: "#0a0a0a" }}>
        Events, resources and community · brockcsc.ca
      </div>
    </div>,
    size,
  );
}
