import type { BrandConfig } from "../types";

/**
 * Default brand config for ReelForge.
 * Override these in .env or per-render via input props.
 */
export const DEFAULT_BRAND: BrandConfig = {
  primaryColor: "#ffffff",
  accentColor: "#E8FF00",
  fontFamily: "Inter",
  captionStyle: "highlight",
  showIntro: false,
  showOutro: false,
};

/**
 * Output presets.
 * Instagram Reels: 1080x1920 (9:16) at 30fps
 */
export const OUTPUT_PRESETS = {
  instagramReel: {
    width: 1080,
    height: 1920,
    fps: 30,
  },
  instagramSquare: {
    width: 1080,
    height: 1080,
    fps: 30,
  },
  youtubeShort: {
    width: 1080,
    height: 1920,
    fps: 30,
  },
  landscape: {
    width: 1920,
    height: 1080,
    fps: 30,
  },
} as const;

export type OutputPreset = keyof typeof OUTPUT_PRESETS;
