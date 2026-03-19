import React from "react";
import { Composition } from "remotion";
import { TalkingHead } from "./compositions/TalkingHead";
import { CarouselReel } from "./compositions/CarouselReel";
import type { TalkingHeadProps, CarouselReelProps } from "./types";
import { DEFAULT_BRAND, OUTPUT_PRESETS } from "./lib/brand";

/**
 * Root — registers all ReelForge compositions with Remotion.
 *
 * When running the pipeline, we use `selectComposition()` to pick
 * the right one and pass in input props dynamically.
 *
 * The defaults here are just for the Remotion Studio preview.
 */
export const RemotionRoot: React.FC = () => {
  // ── Demo data for Studio preview ──
  const demoCaption = {
    text: "This is a demo caption",
    startMs: 0,
    endMs: 3000,
    confidence: 1,
  };

  const demoCaptionPage = {
    text: "This is a demo",
    startMs: 0,
    endMs: 3000,
    words: [
      { text: "This", startMs: 0, endMs: 500, confidence: 1 },
      { text: "is", startMs: 500, endMs: 800, confidence: 1 },
      { text: "a", startMs: 800, endMs: 1000, confidence: 1 },
      { text: "demo", startMs: 1000, endMs: 1500, confidence: 1 },
    ],
  };

  const defaultTalkingHeadProps: TalkingHeadProps = {
    sourceVideo: "",
    captions: [demoCaption],
    captionPages: [demoCaptionPage],
    edl: {
      keeps: [{ startMs: 0, endMs: 30000, reason: "content" }],
      cuts: [],
      estimatedDurationMs: 30000,
      summary: "Demo content",
      suggestedCaption: "Check this out",
    },
    metadata: {
      width: 1080,
      height: 1920,
      durationMs: 30000,
      fps: 30,
      aspectMode: "portrait",
      filePath: "",
    },
    brand: DEFAULT_BRAND,
    outputWidth: OUTPUT_PRESETS.instagramReel.width,
    outputHeight: OUTPUT_PRESETS.instagramReel.height,
    outputFps: OUTPUT_PRESETS.instagramReel.fps,
  };

  const defaultCarouselProps: CarouselReelProps = {
    slides: [
      {
        headline: "5 Things Nobody Tells You About Design Systems",
        body: "A thread on what I've learned building them for real products.",
        slideNumber: 1,
        totalSlides: 5,
      },
      {
        headline: "1. They're Never \"Done\"",
        body: "Design systems are living organisms. The moment you ship v1, you're already behind.",
        slideNumber: 2,
        totalSlides: 5,
      },
      {
        headline: "2. Adoption > Coverage",
        body: "100 components nobody uses is worse than 10 that everyone loves.",
        slideNumber: 3,
        totalSlides: 5,
      },
      {
        headline: "3. Document the Why",
        body: "Devs can read code. What they can't read is your design intent.",
        slideNumber: 4,
        totalSlides: 5,
      },
      {
        headline: "Follow for more real talk on design",
        body: "@phill_designs",
        slideNumber: 5,
        totalSlides: 5,
        backgroundColor: "#0f3460",
      },
    ],
    brand: DEFAULT_BRAND,
    secondsPerSlide: 4,
    outputWidth: OUTPUT_PRESETS.instagramReel.width,
    outputHeight: OUTPUT_PRESETS.instagramReel.height,
    outputFps: OUTPUT_PRESETS.instagramReel.fps,
  };

  return (
    <>
      {/* ── Talking Head Reel ── */}
      <Composition
        id="TalkingHead"
        component={TalkingHead}
        durationInFrames={900} // 30s at 30fps — overridden at render time
        fps={OUTPUT_PRESETS.instagramReel.fps}
        width={OUTPUT_PRESETS.instagramReel.width}
        height={OUTPUT_PRESETS.instagramReel.height}
        defaultProps={defaultTalkingHeadProps}
      />

      {/* ── Carousel → Reel ── */}
      <Composition
        id="CarouselReel"
        component={CarouselReel}
        durationInFrames={
          defaultCarouselProps.slides.length *
          defaultCarouselProps.secondsPerSlide *
          OUTPUT_PRESETS.instagramReel.fps
        }
        fps={OUTPUT_PRESETS.instagramReel.fps}
        width={OUTPUT_PRESETS.instagramReel.width}
        height={OUTPUT_PRESETS.instagramReel.height}
        defaultProps={defaultCarouselProps}
      />
    </>
  );
};
