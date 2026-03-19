import React, { useMemo } from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from "remotion";
import { createTikTokStyleCaptions } from "@remotion/captions";
import type { Caption, TikTokPage } from "@remotion/captions";
import { CaptionPageView } from "../../components/CaptionPageView";
import { ProgressBar } from "../../components/ProgressBar";
import { SafeArea } from "../../components/SafeArea";
import type { TalkingHeadProps } from "../../types";

/** Convert ms to frames consistently (always floor to avoid overrun) */
const msToFrame = (ms: number, fps: number) => Math.floor((ms / 1000) * fps);

/**
 * TalkingHead Composition
 *
 * Takes a raw video and produces a finished reel using Remotion's
 * native caption system.
 */
export const TalkingHead: React.FC<TalkingHeadProps> = ({
  sourceVideo,
  captions,
  edl,
  metadata,
  brand,
  outputWidth,
  outputHeight,
}) => {
  const { fps, durationInFrames } = useVideoConfig();
  const frame = useCurrentFrame();

  // ── Build the video timeline from EDL keeps ────────────────
  const timeline = useMemo(() => {
    let outputOffsetMs = 0;
    return edl.keeps.map((segment) => {
      const durationMs = segment.endMs - segment.startMs;
      const startFrame = msToFrame(outputOffsetMs, fps);
      const endFrame = msToFrame(outputOffsetMs + durationMs, fps);
      const entry = {
        segment,
        outputStartMs: outputOffsetMs,
        durationMs,
        startFrame,
        durationFrames: endFrame - startFrame,
      };
      outputOffsetMs += durationMs;
      return entry;
    });
  }, [edl.keeps, fps]);

  // ── Build caption pages using Remotion's native grouping ───
  const captionPages = useMemo(() => {
    if (captions.length === 0) return [];
    const { pages } = createTikTokStyleCaptions({
      captions,
      combineTokensWithinMilliseconds: 600,
    });
    return pages;
  }, [captions]);

  // ── Build emphasis map (token startMs → emphasis level) ────
  // Captions may have an `emphasis` field from detectEmphasis()
  const emphasisMap = useMemo(() => {
    const map = new Map<number, "strong" | "moderate" | "normal">();
    for (const cap of captions) {
      const emphasis = (cap as Record<string, unknown>).emphasis as
        | "strong"
        | "moderate"
        | "normal"
        | undefined;
      if (emphasis) {
        map.set(cap.startMs, emphasis);
      }
    }
    return map;
  }, [captions]);

  // ── Compute video positioning (fill frame, crop overflow) ──
  const videoStyle = useMemo((): React.CSSProperties => {
    const srcAspect = metadata.width / metadata.height;
    const outAspect = outputWidth / outputHeight;

    if (srcAspect > outAspect) {
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

  // ── Fade out over the last 0.5s ────────────────────────────
  const fadeOutFrames = Math.round(fps * 0.5);
  const fadeOutStart = durationInFrames - fadeOutFrames;
  const fadeOutOpacity = interpolate(
    frame,
    [fadeOutStart, durationInFrames],
    [1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
  );

  return (
    <AbsoluteFill style={{ backgroundColor: "#000000" }}>
      {/* ── Everything that fades out ── */}
      <AbsoluteFill style={{ opacity: fadeOutOpacity }}>
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
                startFrom={msToFrame(entry.segment.startMs, fps)}
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

        {/* ── Caption pages — each as its own Sequence ── */}
        <div style={{ position: "absolute", inset: 0, zIndex: 20 }}>
          {captionPages.map((page, index) => {
            const nextPage = captionPages[index + 1] ?? null;
            const startFrame = msToFrame(page.startMs, fps);
            const endFrame = nextPage
              ? msToFrame(nextPage.startMs, fps)
              : startFrame + msToFrame(Math.min(page.durationMs ?? 1500, 1500), fps);
            const durationInFrames = endFrame - startFrame;

            if (durationInFrames <= 0) return null;

            return (
              <Sequence
                key={index}
                from={startFrame}
                durationInFrames={durationInFrames}
              >
                <CaptionPageView page={page} brand={brand} emphasisMap={emphasisMap} />
              </Sequence>
            );
          })}
        </div>

        {/* ── Progress bar ── */}
        <ProgressBar brand={brand} />
      </AbsoluteFill>

      {/* ── Safe area debug overlay ── */}
      <SafeArea visible={false} />
    </AbsoluteFill>
  );
};
