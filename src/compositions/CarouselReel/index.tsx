import React from "react";
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
} from "remotion";
import type { CarouselReelProps, CarouselSlide, BrandConfig } from "../../types";
import { ProgressBar } from "../../components/ProgressBar";

// ── Individual Slide ────────────────────────────────────────

interface SlideProps {
  slide: CarouselSlide;
  brand: BrandConfig;
}

const Slide: React.FC<SlideProps> = ({ slide, brand }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Entrance spring
  const enter = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 180, mass: 0.6 },
  });

  const headlineY = interpolate(enter, [0, 1], [60, 0]);
  const headlineOpacity = interpolate(enter, [0, 1], [0, 1]);

  // Body text enters slightly delayed
  const bodyEnter = spring({
    frame: frame - 6,
    fps,
    config: { damping: 14, stiffness: 150, mass: 0.6 },
  });
  const bodyY = interpolate(bodyEnter, [0, 1], [40, 0]);
  const bodyOpacity = interpolate(bodyEnter, [0, 1], [0, 1]);

  // Slide counter enters last
  const counterEnter = spring({
    frame: frame - 10,
    fps,
    config: { damping: 12, stiffness: 200, mass: 0.4 },
  });

  // Pick a background — cycle through a palette if no custom bg
  const palette = [
    "#1a1a2e", "#16213e", "#0f3460", "#1b1b2f",
    "#2c2c54", "#1e272e", "#2f3640", "#192a56",
  ];
  const bgColor =
    slide.backgroundColor ||
    palette[(slide.slideNumber - 1) % palette.length];

  return (
    <AbsoluteFill
      style={{
        backgroundColor: bgColor,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        alignItems: "center",
        padding: "80px 60px",
      }}
    >
      {/* Slide number indicator */}
      <div
        style={{
          position: "absolute",
          top: 60,
          right: 60,
          fontFamily: brand.fontFamily,
          fontSize: 20,
          fontWeight: 600,
          color: brand.accentColor,
          opacity: counterEnter,
          letterSpacing: "0.1em",
        }}
      >
        {slide.slideNumber} / {slide.totalSlides}
      </div>

      {/* Headline */}
      <div
        style={{
          fontFamily: brand.fontFamily,
          fontSize: slide.headline.length > 40 ? 52 : 68,
          fontWeight: 800,
          color: "#ffffff",
          textAlign: "center",
          lineHeight: 1.15,
          letterSpacing: "-0.03em",
          opacity: headlineOpacity,
          transform: `translateY(${headlineY}px)`,
          maxWidth: "90%",
        }}
      >
        {slide.headline}
      </div>

      {/* Body text */}
      {slide.body && (
        <div
          style={{
            fontFamily: brand.fontFamily,
            fontSize: 28,
            fontWeight: 400,
            color: "rgba(255,255,255,0.75)",
            textAlign: "center",
            lineHeight: 1.5,
            marginTop: 32,
            opacity: bodyOpacity,
            transform: `translateY(${bodyY}px)`,
            maxWidth: "85%",
          }}
        >
          {slide.body}
        </div>
      )}

      {/* Accent line */}
      <div
        style={{
          width: interpolate(enter, [0, 1], [0, 80]),
          height: 4,
          backgroundColor: brand.accentColor,
          borderRadius: 2,
          marginTop: 40,
        }}
      />
    </AbsoluteFill>
  );
};

// ── Carousel Reel Composition ────────────────────────────────

export const CarouselReel: React.FC<CarouselReelProps> = ({
  slides,
  brand,
  secondsPerSlide = 4,
  outputWidth,
  outputHeight,
}) => {
  const { fps } = useVideoConfig();
  const framesPerSlide = secondsPerSlide * fps;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {slides.map((slide, index) => (
        <Sequence
          key={index}
          from={index * framesPerSlide}
          durationInFrames={framesPerSlide}
        >
          <Slide slide={slide} brand={brand} />
        </Sequence>
      ))}

      <ProgressBar brand={brand} />
    </AbsoluteFill>
  );
};
