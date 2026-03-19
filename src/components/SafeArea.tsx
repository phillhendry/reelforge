import React from "react";

/**
 * SafeArea (development only)
 *
 * Shows the Instagram UI safe zones — the areas where
 * IG overlays its own UI (username, buttons, description).
 * Helps ensure captions and content don't get hidden.
 *
 * Top: ~120px (username, follow button)
 * Bottom: ~250px (caption, buttons, music)
 * Right: ~60px (like, comment, share buttons)
 */
export const SafeArea: React.FC<{ visible?: boolean }> = ({
  visible = false,
}) => {
  if (!visible) return null;

  return (
    <>
      {/* Top safe zone */}
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 120,
          backgroundColor: "rgba(255,0,0,0.12)",
          borderBottom: "1px dashed rgba(255,0,0,0.3)",
          zIndex: 999,
          pointerEvents: "none",
        }}
      />
      {/* Bottom safe zone */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: 250,
          backgroundColor: "rgba(255,0,0,0.12)",
          borderTop: "1px dashed rgba(255,0,0,0.3)",
          zIndex: 999,
          pointerEvents: "none",
        }}
      />
      {/* Right safe zone (IG buttons) */}
      <div
        style={{
          position: "absolute",
          top: 120,
          right: 0,
          bottom: 250,
          width: 60,
          backgroundColor: "rgba(255,0,0,0.08)",
          borderLeft: "1px dashed rgba(255,0,0,0.3)",
          zIndex: 999,
          pointerEvents: "none",
        }}
      />
    </>
  );
};
