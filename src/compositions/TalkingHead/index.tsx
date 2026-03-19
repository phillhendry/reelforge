import React, { useMemo } from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  useVideoConfig,
  Audio,
  staticFile,
} from "remotion";
import { z } from "zod";
import { AnimatedCaption } from "../../components/AnimatedCaption";
import { ProgressBar } from "../../components/ProgressBar";
import { SafeArea } from "../../components/SafeArea";
import type {
  TalkingHeadProps,
  CaptionPage,
  CaptionWord,
  EditSegment,
  BrandConfig,
} from "../../types";

/**
 * TalkingHead Composition
 *
 * The main composition. Takes a raw video and produces a finished reel.
 *
 * How it works:
 * 1. The EDL (edit decision list) defines which segments of the source
 *    video to keep. We render these as a sequence of <OffthreadVideo>
 *    clips, each playing a segment of the original file.
 *
 * 2. Captions are overlaid as animated word-by-word highlights.
 *    Their timestamps are remapped to account for the cuts.
 *
 * 3. The source video is shown full-frame. If it's landscape,
 *    we crop to center (or face-detect later). If portrait, it fills.
 *
 * 4. A subtle progress bar sits at the top.
 */
export const TalkingHead: React.FC<TalkingHeadProps> = ({
  sourceVideo,
  captions,
  captionPages,
  edl,
  metadata,
  brand,
  outputWidth,
  outputHeight,
}) => {
  const { fps } = useVideoConfig();

  // ── Build the timeline ──────────────────────────────────────
  // Each "keep" segment becomes a Sequence. We need to track
  // cumulative output time so we know where each segment starts
  // in the rendered video.
  const timeline = useMemo(() => {
    let outputOffsetMs = 0;
    return edl.keeps.map((segment) => {
      const durationMs = segment.endMs - segment.startMs;
      const entry = {
        segment,
        outputStartMs: outputOffsetMs,
        outputEndMs: outputOffsetMs + durationMs,
        durationMs,
        startFrame: Math.round((outputOffsetMs / 1000) * fps),
        durationFrames: Math.round((durationMs / 1000) * fps),
      };
      outputOffsetMs += durationMs;
      return entry;
    });
  }, [edl.keeps, fps]);

  // ── Remap captions to output timeline ───────────────────────
  // Captions reference the SOURCE video timestamps. We need to
  // shift them to match the output timeline (with cuts removed).
  const remappedPages = useMemo(() => {
    const remap = (sourceMs: number): number | null => {
      let outputMs = 0;
      for (const entry of timeline) {
        if (
          sourceMs >= entry.segment.startMs &&
          sourceMs < entry.segment.endMs
        ) {
          return outputMs + (sourceMs - entry.segment.startMs);
        }
        outputMs += entry.durationMs;
      }
      return null;
    };

    return captionPages
      .map((page) => {
        const newStart = remap(page.startMs);
        const newEnd = remap(page.endMs);
        if (newStart === null || newEnd === null) return null;

        const remappedWords = page.words
          .map((w) => {
            const ws = remap(w.startMs);
            const we = remap(w.endMs);
            if (ws === null || we === null) return null;
            return { ...w, startMs: ws, endMs: we };
          })
          .filter(Boolean) as CaptionWord[];

        if (remappedWords.length === 0) return null;

        return {
          ...page,
          startMs: newStart,
          endMs: newEnd,
          words: remappedWords,
        } as CaptionPage;
      })
      .filter(Boolean) as CaptionPage[];
  }, [captionPages, timeline]);

  // ── Compute video positioning ───────────────────────────────
  // If the source is already portrait (9:16), it fills the frame.
  // If landscape (16:9), we scale it to fill height and crop sides.
  // If square, we scale to fill width and center vertically.
  const videoStyle = useMemo((): React.CSSProperties => {
    const srcAspect = metadata.width / metadata.height;
    const outAspect = outputWidth / outputHeight;

    if (srcAspect > outAspect) {
      // Source is wider than output — fill height, crop sides
      const scale = outputHeight / metadata.height;
      const scaledWidth = metadata.width * scale;
      return {
        width: scaledWidth,
        height: outputHeight,
        position: "absolute",
        top: 0,
        left: (outputWidth - scaledWidth) / 2,
      };
    } else {
      // Source is taller or same — fill width, crop top/bottom
      const scale = outputWidth / metadata.width;
      const scaledHeight = metadata.height * scale;
      return {
        width: outputWidth,
        height: scaledHeight,
        position: "absolute",
        left: 0,
        top: (outputHeight - scaledHeight) / 2,
      };
    }
  }, [metadata, outputWidth, outputHeight]);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {/* ── Video segments ── */}
      {timeline.map((entry, index) => (
        <Sequence
          key={index}
          from={entry.startFrame}
          durationInFrames={entry.durationFrames}
        >
          <AbsoluteFill style={{ overflow: "hidden" }}>
            <OffthreadVideo
              src={sourceVideo}
              startFrom={Math.round((entry.segment.startMs / 1000) * fps)}
              style={videoStyle}
            />
          </AbsoluteFill>
        </Sequence>
      ))}

      {/* ── Gradient overlay for caption readability ── */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          right: 0,
          height: "40%",
          background:
            "linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 100%)",
          pointerEvents: "none",
          zIndex: 10,
        }}
      />

      {/* ── Captions ── */}
      <div style={{ position: "absolute", inset: 0, zIndex: 20 }}>
        <AnimatedCaption pages={remappedPages} brand={brand} />
      </div>

      {/* ── Progress bar ── */}
      <ProgressBar brand={brand} />

      {/* ── Safe area debug overlay ── */}
      <SafeArea visible={false} />
    </AbsoluteFill>
  );
};
