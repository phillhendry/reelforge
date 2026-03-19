/**
 * Render Module
 *
 * Uses Remotion's Node.js SSR APIs to render the final video.
 *
 * Flow:
 * 1. Bundle the Remotion project (once, cached)
 * 2. Select the composition (TalkingHead or CarouselReel)
 * 3. Pass in the computed props (captions, EDL, brand config)
 * 4. renderMedia() outputs the final MP4
 */

import fs from "fs";
import path from "path";
import type { TalkingHeadProps, CarouselReelProps } from "../src/types";

// These are imported dynamically to avoid issues in non-Node contexts
let bundleCache: string | null = null;

async function getBundle(): Promise<string> {
  if (bundleCache) return bundleCache;

  const { bundle } = await import("@remotion/bundler");

  console.log("  → Bundling Remotion project...");
  bundleCache = await bundle({
    entryPoint: path.resolve(__dirname, "../src/index.ts"),
    onProgress: (progress: number) => {
      if (progress % 25 === 0) {
        console.log(`    Bundle progress: ${progress}%`);
      }
    },
  });

  console.log("  → Bundle ready.");
  return bundleCache;
}

export async function renderTalkingHead(
  props: TalkingHeadProps,
  outputPath: string
): Promise<string> {
  const { renderMedia, selectComposition } = await import(
    "@remotion/renderer"
  );

  const bundleLocation = await getBundle();

  // Calculate total output duration from EDL + fade-out tail
  const totalDurationMs = props.edl.keeps.reduce(
    (sum, seg) => sum + (seg.endMs - seg.startMs),
    0
  );
  // Add 0.5s for fade-out so the video doesn't end abruptly
  const fadeOutMs = 500;
  const durationInFrames = Math.ceil(
    ((totalDurationMs + fadeOutMs) / 1000) * props.outputFps
  );

  // Copy video into the bundle directory so Remotion's server can serve it.
  // On APFS (macOS) this is a near-instant copy-on-write clone.
  const videoFileName = `source_${Date.now()}${path.extname(props.sourceVideo)}`;
  const videoInBundle = path.join(bundleLocation, videoFileName);
  fs.copyFileSync(props.sourceVideo, videoInBundle);

  const renderProps = {
    ...props,
    sourceVideo: videoFileName,
  };

  console.log(
    `  → Rendering TalkingHead (${durationInFrames} frames, ~${Math.round(totalDurationMs / 1000)}s)...`
  );

  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: "TalkingHead",
    inputProps: renderProps as unknown as Record<string, unknown>,
  });

  // Override duration based on actual content
  composition.durationInFrames = durationInFrames;
  composition.fps = props.outputFps;
  composition.width = props.outputWidth;
  composition.height = props.outputHeight;

  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: "h264",
    outputLocation: outputPath,
    inputProps: renderProps as unknown as Record<string, unknown>,
    onProgress: ({ progress }: { progress: number }) => {
      const pct = Math.round(progress * 100);
      if (pct % 10 === 0) {
        process.stdout.write(`\r    Render progress: ${pct}%`);
      }
    },
  });

  // Clean up symlink
  try { fs.unlinkSync(videoInBundle); } catch {}

  console.log("\n  → Render complete!");
  return outputPath;
}

export async function renderCarouselReel(
  props: CarouselReelProps,
  outputPath: string
): Promise<string> {
  const { renderMedia, selectComposition } = await import(
    "@remotion/renderer"
  );

  const bundleLocation = await getBundle();

  const durationInFrames =
    props.slides.length * props.secondsPerSlide * props.outputFps;

  console.log(
    `  → Rendering CarouselReel (${props.slides.length} slides, ${durationInFrames} frames)...`
  );

  const composition = await selectComposition({
    serveUrl: bundleLocation,
    id: "CarouselReel",
    inputProps: props as unknown as Record<string, unknown>,
  });

  composition.durationInFrames = durationInFrames;
  composition.fps = props.outputFps;
  composition.width = props.outputWidth;
  composition.height = props.outputHeight;

  await renderMedia({
    composition,
    serveUrl: bundleLocation,
    codec: "h264",
    outputLocation: outputPath,
    inputProps: props as unknown as Record<string, unknown>,
    onProgress: ({ progress }: { progress: number }) => {
      const pct = Math.round(progress * 100);
      if (pct % 10 === 0) {
        process.stdout.write(`\r    Render progress: ${pct}%`);
      }
    },
  });

  console.log("\n  → Render complete!");
  return outputPath;
}
