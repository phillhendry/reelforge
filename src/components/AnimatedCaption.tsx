import React from "react";
import {
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import type { CaptionPage, BrandConfig } from "../types";

interface AnimatedCaptionProps {
  pages: CaptionPage[];
  brand: BrandConfig;
}

/**
 * AnimatedCaption
 *
 * Renders word-by-word highlighted captions in the style popularised
 * by Hormozi / short-form content. Each "page" is a group of 3-6 words
 * that appear together, with the current word highlighted.
 *
 * Sits at the bottom third of the frame. Text is large, punchy,
 * and easy to read on a phone screen.
 */
export const AnimatedCaption: React.FC<AnimatedCaptionProps> = ({
  pages,
  brand,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const currentTimeMs = (frame / fps) * 1000;

  // Find the active page
  const activePage = pages.find(
    (p) => currentTimeMs >= p.startMs && currentTimeMs < p.endMs
  );

  if (!activePage) return null;

  // Page entrance animation
  const pageEntryFrame = Math.floor((activePage.startMs / 1000) * fps);
  const pageProgress = spring({
    frame: frame - pageEntryFrame,
    fps,
    config: { damping: 15, stiffness: 200, mass: 0.5 },
  });

  const pageOpacity = interpolate(pageProgress, [0, 1], [0, 1]);
  const pageTranslateY = interpolate(pageProgress, [0, 1], [20, 0]);

  return (
    <div
      style={{
        position: "absolute",
        bottom: 180,
        left: 40,
        right: 40,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        gap: "6px 10px",
        opacity: pageOpacity,
        transform: `translateY(${pageTranslateY}px)`,
      }}
    >
      {activePage.words.map((word, i) => {
        const isActive =
          currentTimeMs >= word.startMs && currentTimeMs < word.endMs;
        const isPast = currentTimeMs >= word.endMs;

        // Word highlight animation
        const wordEntryFrame = Math.floor((word.startMs / 1000) * fps);
        const wordSpring = spring({
          frame: frame - wordEntryFrame,
          fps,
          config: { damping: 12, stiffness: 300, mass: 0.4 },
        });

        const scale = isActive
          ? interpolate(wordSpring, [0, 1], [1.15, 1.08])
          : 1;

        // Determine styles based on caption style
        const getWordStyle = (): React.CSSProperties => {
          switch (brand.captionStyle) {
            case "highlight":
              return {
                backgroundColor: isActive ? brand.accentColor : "transparent",
                color: isActive
                  ? "#000000"
                  : isPast
                    ? "rgba(255,255,255,0.5)"
                    : "#ffffff",
                padding: isActive ? "4px 12px" : "4px 4px",
                borderRadius: "8px",
                transition: "background-color 0.05s, color 0.05s",
              };
            case "bounce":
              return {
                color: isActive ? brand.accentColor : isPast ? "rgba(255,255,255,0.5)" : "#ffffff",
                transform: `scale(${scale})`,
              };
            case "typewriter":
              return {
                color: isPast || isActive ? "#ffffff" : "rgba(255,255,255,0.15)",
                opacity: isPast || isActive ? 1 : 0.2,
              };
            case "minimal":
              return {
                color: isActive ? "#ffffff" : "rgba(255,255,255,0.4)",
              };
            default:
              return {
                color: isActive ? brand.accentColor : "#ffffff",
              };
          }
        };

        return (
          <span
            key={`${activePage.startMs}-${i}`}
            style={{
              fontFamily: brand.fontFamily,
              fontSize: 64,
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
              textShadow: "0 2px 12px rgba(0,0,0,0.6)",
              display: "inline-block",
              ...getWordStyle(),
            }}
          >
            {word.text.trim()}
          </span>
        );
      })}
    </div>
  );
};
