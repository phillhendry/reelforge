import React from "react";
import {
  AbsoluteFill,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
} from "remotion";
import type { TikTokPage, TikTokToken } from "@remotion/captions";
import type { BrandConfig } from "../types";

interface CaptionPageViewProps {
  page: TikTokPage;
  brand: BrandConfig;
  /** Map of token fromMs → emphasis level, passed from parent */
  emphasisMap?: Map<number, "strong" | "moderate" | "normal">;
}

/**
 * CaptionPageView
 *
 * Renders a single TikTokPage using Remotion's recommended pattern.
 * Supports emphasis: strong words pop bigger and hold highlight,
 * moderate words get a subtle lift.
 */
export const CaptionPageView: React.FC<CaptionPageViewProps> = ({
  page,
  brand,
  emphasisMap,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Local time within this Sequence (starts at 0)
  const localTimeMs = (frame / fps) * 1000;
  // Absolute time in the output video
  const absoluteTimeMs = page.startMs + localTimeMs;

  // Page entrance animation
  const pageProgress = spring({
    frame,
    fps,
    config: { damping: 15, stiffness: 200, mass: 0.5 },
  });
  const pageOpacity = interpolate(pageProgress, [0, 1], [0, 1]);
  const pageTranslateY = interpolate(pageProgress, [0, 1], [20, 0]);

  return (
    <AbsoluteFill>
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
        {page.tokens.map((token, i) => (
          <TokenView
            key={`${token.fromMs}-${i}`}
            token={token}
            absoluteTimeMs={absoluteTimeMs}
            pageStartMs={page.startMs}
            frame={frame}
            fps={fps}
            brand={brand}
            emphasis={emphasisMap?.get(token.fromMs) ?? "normal"}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};

interface TokenViewProps {
  token: TikTokToken;
  absoluteTimeMs: number;
  pageStartMs: number;
  frame: number;
  fps: number;
  brand: BrandConfig;
  emphasis: "strong" | "moderate" | "normal";
}

const TokenView: React.FC<TokenViewProps> = ({
  token,
  absoluteTimeMs,
  pageStartMs,
  frame,
  fps,
  brand,
  emphasis,
}) => {
  const isActive = token.fromMs <= absoluteTimeMs && token.toMs > absoluteTimeMs;
  const isPast = absoluteTimeMs >= token.toMs;

  // Word entry spring — emphasis affects the animation feel
  const wordEntryFrame = Math.max(
    0,
    Math.floor(((token.fromMs - pageStartMs) / 1000) * fps)
  );
  const wordSpring = spring({
    frame: frame - wordEntryFrame,
    fps,
    config:
      emphasis === "strong"
        ? { damping: 8, stiffness: 400, mass: 0.3 }  // snappy pop
        : emphasis === "moderate"
          ? { damping: 10, stiffness: 300, mass: 0.4 }
          : { damping: 12, stiffness: 300, mass: 0.4 },
  });

  // Scale based on emphasis
  let scale = 1;
  if (isActive) {
    if (emphasis === "strong") {
      scale = interpolate(wordSpring, [0, 1], [1.25, 1.15]);
    } else if (emphasis === "moderate") {
      scale = interpolate(wordSpring, [0, 1], [1.15, 1.08]);
    } else {
      scale = interpolate(wordSpring, [0, 1], [1.08, 1.02]);
    }
  }

  const getWordStyle = (): React.CSSProperties => {
    const isEmphasised = emphasis !== "normal";

    switch (brand.captionStyle) {
      case "highlight":
        return {
          backgroundColor: isActive
            ? brand.accentColor
            : isEmphasised && isPast
              ? "rgba(232, 255, 0, 0.15)"
              : "transparent",
          color: isActive
            ? "#000000"
            : isPast
              ? isEmphasised
                ? "rgba(255,255,255,0.7)"
                : "rgba(255,255,255,0.5)"
              : "#ffffff",
          padding: isActive ? "4px 12px" : "4px 4px",
          borderRadius: "8px",
          transform: `scale(${scale})`,
          transition: "background-color 0.05s, color 0.05s",
        };
      case "bounce":
        return {
          color: isActive
            ? brand.accentColor
            : isPast
              ? "rgba(255,255,255,0.5)"
              : "#ffffff",
          transform: `scale(${scale}) translateY(${isActive && emphasis === "strong" ? -4 : 0}px)`,
        };
      case "typewriter":
        return {
          color: isPast || isActive ? "#ffffff" : "rgba(255,255,255,0.15)",
          opacity: isPast || isActive ? 1 : 0.2,
          transform: `scale(${scale})`,
        };
      case "minimal":
        return {
          color: isActive ? "#ffffff" : "rgba(255,255,255,0.4)",
          transform: `scale(${scale})`,
        };
      default:
        return {
          color: isActive ? brand.accentColor : "#ffffff",
          transform: `scale(${scale})`,
        };
    }
  };

  return (
    <span
      style={{
        fontFamily: brand.fontFamily,
        fontSize: emphasis === "strong" ? 68 : 64,
        fontWeight: emphasis === "strong" ? 900 : 800,
        textTransform: "uppercase",
        letterSpacing: "-0.02em",
        lineHeight: 1.2,
        textShadow:
          emphasis === "strong"
            ? "0 2px 16px rgba(0,0,0,0.8)"
            : "0 2px 12px rgba(0,0,0,0.6)",
        display: "inline-block",
        whiteSpace: "pre",
        ...getWordStyle(),
      }}
    >
      {token.text}
    </span>
  );
};
