import React from "react";
import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import type { BrandConfig } from "../types";

interface ProgressBarProps {
  brand: BrandConfig;
}

/**
 * A thin progress bar at the very top of the reel.
 * Subtle but gives viewers a sense of how long the video is.
 */
export const ProgressBar: React.FC<ProgressBarProps> = ({ brand }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const progress = interpolate(frame, [0, durationInFrames], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 4,
        backgroundColor: "rgba(255,255,255,0.15)",
        zIndex: 100,
      }}
    >
      <div
        style={{
          width: `${progress}%`,
          height: "100%",
          backgroundColor: brand.accentColor,
          borderRadius: "0 2px 2px 0",
        }}
      />
    </div>
  );
};
