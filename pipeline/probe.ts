/**
 * Probe Module
 *
 * Extracts metadata from the source video using ffprobe.
 * Determines dimensions, duration, fps, and aspect mode.
 */

import { execSync } from "child_process";
import type { SourceMetadata, AspectMode } from "../src/types";

export function probeVideo(filePath: string): SourceMetadata {
  console.log("  → Probing video metadata...");

  const raw = execSync(
    `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`,
    { encoding: "utf-8" }
  );

  const info = JSON.parse(raw);
  const videoStream = info.streams?.find(
    (s: { codec_type: string }) => s.codec_type === "video"
  );

  if (!videoStream) {
    throw new Error("No video stream found in file");
  }

  const width: number = videoStream.width;
  const height: number = videoStream.height;
  const durationMs = Math.round(
    parseFloat(info.format?.duration || videoStream.duration || "0") * 1000
  );

  // Parse fps from r_frame_rate (e.g. "30/1" or "30000/1001")
  let fps = 30;
  if (videoStream.r_frame_rate) {
    const [num, den] = videoStream.r_frame_rate.split("/").map(Number);
    if (den && den > 0) {
      fps = Math.round(num / den);
    }
  }

  // Determine aspect mode
  const aspect = width / height;
  let aspectMode: AspectMode;
  if (aspect < 0.7) {
    aspectMode = "portrait";
  } else if (aspect > 1.3) {
    aspectMode = "landscape";
  } else {
    aspectMode = "square";
  }

  return {
    width,
    height,
    durationMs,
    fps,
    aspectMode,
    filePath,
  };
}
